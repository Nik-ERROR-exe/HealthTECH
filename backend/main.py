
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os

from app.config import settings
from app.database import engine, Base

# Import all models so Alembic and Base.metadata.create_all can see them
from app.models.models import (
    User, PatientProfile, DoctorProfile,
    MedicalCourse, Medication, CheckIn,
    RiskScore, WoundAnalysis, Alert,
    DoctorMessage, AgentSession, MonitoringSchedule,
)

# Create database tables automatically
Base.metadata.create_all(bind=engine)

# Routers
from app.routers.auth import router as auth_router
from app.routers.patient import router as patient_router
from app.routers.doctor import router as doctor_router
from app.routers.conversation import router as conversation_router
from app.routers.emergency import router as emergency_router
from app.routers.volunteer import router as volunteer_router
# from app.routers.agent import router as agent_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="CARENETRA API",
        description="Autonomous Clinical Monitoring Agent — Backend API",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # ── CORS ──
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:8080",
            "http://localhost:5173",
            "https://health-tech-amber.vercel.app"
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Static files for uploaded wound images ──
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    UPLOAD_DIR = os.path.join(BASE_DIR, "uploads", "wounds")
    os.makedirs(UPLOAD_DIR, exist_ok=True)
    app.mount("/uploads", StaticFiles(directory=os.path.join(BASE_DIR, "uploads")), name="uploads")

    # ── Routers ──
    app.include_router(auth_router, prefix="/api")
    app.include_router(patient_router, prefix="/api")
    app.include_router(doctor_router, prefix="/api")
    app.include_router(conversation_router, prefix="/api")
    app.include_router(emergency_router, prefix="/api")
    app.include_router(volunteer_router, prefix="/api")
    # app.include_router(agent_router, prefix="/api")

    # ── Health check ──
    @app.get("/health", tags=["Health"])
    def health():
        return {"status": "ok", "service": "CARENETRA API"}

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)