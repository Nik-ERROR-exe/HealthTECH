from dotenv import load_dotenv
load_dotenv()
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import os
import logging
from datetime import datetime, timezone

from app.config import settings
from app.database import engine, Base

# Import all models so Alembic and Base.metadata.create_all can see them
from app.models.models import (
    User, PatientProfile, DoctorProfile,
    MedicalCourse, Medication, CheckIn,
    RiskScore, WoundAnalysis, Alert,
    DoctorMessage, AgentSession, MonitoringSchedule,
    RelativeProfile, AmbulanceProfile, VolunteerProfile,
    PendingCheckIn,
)

# Routers
from app.routers.auth import router as auth_router
from app.routers.patient import router as patient_router
from app.routers.doctor import router as doctor_router
from app.routers.conversation import router as conversation_router
from app.routers.emergency import router as emergency_router
from app.routers.ambulance import router as ambulance_router
from app.routers.volunteer import router as volunteer_router
from app.routers.relative import router as relative_router
from app.routers.checkin import router as checkin_router
from app.routers.image import router as image_router
from app.routers.alerts import router as alerts_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Ensure database schema has updated columns and enum values (ambulance + volunteer migration)
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("ALTER TABLE impact_alerts ADD COLUMN IF NOT EXISTS responder_latitude FLOAT;"))
            conn.execute(text("ALTER TABLE impact_alerts ADD COLUMN IF NOT EXISTS responder_longitude FLOAT;"))
            conn.execute(text("ALTER TABLE impact_alerts ADD COLUMN IF NOT EXISTS responder_volunteer_id UUID;"))
            conn.execute(text("ALTER TABLE impact_alerts ADD COLUMN IF NOT EXISTS volunteers_notified INTEGER DEFAULT 0;"))
            conn.execute(text("ALTER TYPE impactalertstatus ADD VALUE IF NOT EXISTS 'EN_ROUTE';"))
            conn.execute(text("ALTER TABLE medications ADD COLUMN IF NOT EXISTS taken BOOLEAN DEFAULT FALSE;"))
            conn.execute(text("ALTER TABLE doctor_messages ADD COLUMN IF NOT EXISTS sender_type VARCHAR(20) DEFAULT 'doctor';"))
            conn.commit()
    except Exception as exc:
        logging.warning(f"[DB] Migration check skipped: {exc}")

    # Ensure database tables exist (non-destructive create_all)
    try:
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        logging.warning(f"[DB] Base.metadata.create_all failed: {exc}")

    # Start the proactive monitoring scheduler (guarded against uvicorn --reload double-start).
    from app.scheduler import scheduler, start_scheduler
    if not scheduler.running:
        start_scheduler()

    # Start the daily checkin & missed checkin scheduler
    from app.services.scheduler import start_services_scheduler, stop_services_scheduler
    start_services_scheduler()

    # Warm the RAG knowledge index — never fatal (falls back to no-RAG).
    try:
        from app.rag.vector_store import ensure_collection
        from app.rag.indexer import index_knowledge_base
        ensure_collection()
        await index_knowledge_base()
    except Exception as exc:
        logging.warning(f"[RAG] knowledge index skipped at startup: {exc}")

    yield

    try:
        from app.scheduler import stop_scheduler
        stop_scheduler()
        stop_services_scheduler()
    except Exception:
        pass


def create_app() -> FastAPI:
    app = FastAPI(
        title="CARENETRA API",
        description="Autonomous Clinical Monitoring Agent — Backend API",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # ── CORS ──
    raw_cors = os.getenv(
        "CORS_ORIGINS",
        os.getenv(
            "ALLOWED_ORIGINS",
            f"{settings.FRONTEND_URL},http://localhost:8080,http://localhost:5173,http://localhost:3000,http://localhost:5174",
        ),
    )
    allow_origins = [origin.strip().rstrip("/") for origin in raw_cors.split(",") if origin.strip()]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Static files for uploaded wound images ──
    os.makedirs("uploads/wounds", exist_ok=True)
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

    # ── Routers ──
    app.include_router(auth_router, prefix="/api")
    app.include_router(patient_router, prefix="/api")
    app.include_router(doctor_router, prefix="/api")
    app.include_router(conversation_router, prefix="/api")
    app.include_router(emergency_router, prefix="/api")
    app.include_router(ambulance_router, prefix="/api")
    app.include_router(volunteer_router, prefix="/api")
    app.include_router(relative_router, prefix="/api")
    app.include_router(checkin_router, prefix="/api")
    app.include_router(image_router, prefix="/api")
    app.include_router(alerts_router, prefix="/api")

    # ── WebSocket for Ambulance Alerts & Real-time Location Bidding ──
    from app.websocket_manager import manager as ws_manager

    @app.websocket("/ws/ambulance/{client_id}")
    @app.websocket("/ws/ambulance")
    async def websocket_ambulance_endpoint(websocket: WebSocket, client_id: str = "anonymous"):
        await ws_manager.connect(websocket, client_id)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            ws_manager.disconnect(client_id)
        except Exception:
            ws_manager.disconnect(client_id)

    # ── Health check & keep-alive ──
    @app.get("/health", tags=["Health"])
    @app.get("/ping", tags=["Health"])
    @app.get("/api/health", tags=["Health"])
    @app.get("/api/ping", tags=["Health"])
    def health():
        return {
            "status": "ok",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "service": "CARENETRA API",
        }

    return app


app = create_app()

logger = logging.getLogger(__name__)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"[GLOBAL ERROR] {request.method} {request.url} → {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
