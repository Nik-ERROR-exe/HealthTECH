from dotenv import load_dotenv
load_dotenv()
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
import os
import logging

from app.config import settings
from app.database import engine, Base

# Import all models so Alembic and Base.metadata.create_all can see them
from app.models.models import (
    User, PatientProfile, DoctorProfile,
    MedicalCourse, Medication, CheckIn,
    RiskScore, WoundAnalysis, Alert,
    DoctorMessage, AgentSession, MonitoringSchedule,
    RelativeProfile,
)

# Routers
from app.routers.auth import router as auth_router
from app.routers.patient import router as patient_router
from app.routers.doctor import router as doctor_router
from app.routers.conversation import router as conversation_router
from app.routers.emergency import router as emergency_router
from app.routers.volunteer import router as volunteer_router
from app.routers.relative import router as relative_router
# from app.routers.agent import router as agent_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the proactive monitoring scheduler (guarded against uvicorn --reload double-start).
    from app.scheduler import scheduler, start_scheduler
    if not scheduler.running:
        start_scheduler()

    # Warm the RAG knowledge index — never fatal (falls back to no-RAG).
    try:
        from app.rag.vector_store import ensure_collection
        from app.rag.indexer import index_knowledge_base
        ensure_collection()
        await index_knowledge_base()
    except Exception as exc:
        logger.warning(f"[RAG] knowledge index skipped at startup: {exc}")

    yield

    try:
        from app.scheduler import stop_scheduler
        stop_scheduler()
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
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:8080", "http://localhost:5173", "http://localhost:3000"],
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
    app.include_router(volunteer_router, prefix="/api")
    app.include_router(relative_router, prefix="/api")
    # app.include_router(agent_router, prefix="/api")

    # ── Health check ──
    @app.get("/health", tags=["Health"])
    def health():
        return {"status": "ok", "service": "CARENETRA API"}

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