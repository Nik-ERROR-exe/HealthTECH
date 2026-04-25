"""
CARENETRA — Complete Database Schema
All 12 tables defined here using SQLAlchemy 2.0 declarative style.
"""
import uuid
import random
import string
from datetime import datetime, timezone
from enum import Enum as PyEnum

from sqlalchemy import (
    String, Integer, Float, Boolean, Text, DateTime,
    ForeignKey, Enum, JSON, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, Mapped, mapped_column

from app.database import Base


# ─────────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────────

class UserRole(str, PyEnum):
    PATIENT   = "PATIENT"
    DOCTOR    = "DOCTOR"
    VOLUNTEER = "VOLUNTEER"


class RiskTier(str, PyEnum):
    GREEN     = "GREEN"      # 0–25
    YELLOW    = "YELLOW"     # 26–50
    ORANGE    = "ORANGE"     # 51–75
    RED       = "RED"        # 76–90
    EMERGENCY = "EMERGENCY"  # 91–100


class AlertStatus(str, PyEnum):
    PENDING     = "PENDING"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    DISPATCHED  = "DISPATCHED"
    DISMISSED   = "DISMISSED"


class AlertType(str, PyEnum):
    NUDGE     = "NUDGE"      # yellow — patient nudge
    DOCTOR    = "DOCTOR"     # orange — notify doctor
    CRITICAL  = "CRITICAL"   # red — SMS + email
    EMERGENCY = "EMERGENCY"  # ambulance


class CourseStatus(str, PyEnum):
    ACTIVE    = "ACTIVE"
    COMPLETED = "COMPLETED"
    PAUSED    = "PAUSED"


class ConditionType(str, PyEnum):
    POST_CARDIAC_SURGERY   = "POST_CARDIAC_SURGERY"
    ASTHMA_RESPIRATORY     = "ASTHMA_RESPIRATORY"
    DIABETES_MANAGEMENT    = "DIABETES_MANAGEMENT"
    GENERAL_POST_SURGERY   = "GENERAL_POST_SURGERY"
    POST_SURGERY = "POST_SURGERY"
    POST_KIDNEY_TRANSPLANT = "POST_KIDNEY_TRANSPLANT"

class InputType(str, PyEnum):
    VOICE = "VOICE"
    TEXT  = "TEXT"
    AGENT = "AGENT"   # agent-guided Q&A


class WoundSeverity(str, PyEnum):
    NORMAL   = "NORMAL"
    MILD     = "MILD"
    MODERATE = "MODERATE"
    SEVERE   = "SEVERE"


class ImpactAlertStatus(str, PyEnum):
    ACTIVE     = "ACTIVE"      # alert fired, no volunteer yet
    RESPONDING = "RESPONDING"  # a volunteer confirmed they're going
    RESOLVED   = "RESOLVED"    # manually resolved or patient confirmed okay


# ─────────────────────────────────────────────
# HELPER
# ─────────────────────────────────────────────

def generate_unique_uid() -> str:
    """Generates patient-facing ID like CNT-48291"""
    digits = "".join(random.choices(string.digits, k=5))
    return f"CNT-{digits}"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ─────────────────────────────────────────────
# TABLE 1: users
# Core auth table. Both doctors and patients live here.
# ─────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)

    # Patient-facing shareable ID (only meaningful for PATIENT role)
    unique_uid: Mapped[str] = mapped_column(
        String(20), unique=True, nullable=True, default=None
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    # Relationships
    patient_profile: Mapped["PatientProfile"] = relationship(
        "PatientProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    doctor_profile: Mapped["DoctorProfile"] = relationship(
        "DoctorProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )
    volunteer_profile: Mapped["VolunteerProfile"] = relationship(
        "VolunteerProfile", back_populates="user", uselist=False, cascade="all, delete-orphan"
    )


# ─────────────────────────────────────────────
# TABLE 2: patient_profiles
# Extended patient info beyond auth.
# ─────────────────────────────────────────────

class PatientProfile(Base):
    __tablename__ = "patient_profiles"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    date_of_birth: Mapped[str] = mapped_column(String(20), nullable=True)
    blood_group: Mapped[str] = mapped_column(String(10), nullable=True)
    emergency_contact_name: Mapped[str] = mapped_column(String(255), nullable=True)
    emergency_contact_phone: Mapped[str] = mapped_column(String(30), nullable=True)
    emergency_contact_email: Mapped[str] = mapped_column(String(255), nullable=True)
    profile_picture_url: Mapped[str] = mapped_column(String(500), nullable=True)
    allow_agent_mic_control: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="patient_profile")
    check_ins: Mapped[list["CheckIn"]] = relationship("CheckIn", back_populates="patient")
    risk_scores: Mapped[list["RiskScore"]] = relationship("RiskScore", back_populates="patient")
    wound_analyses: Mapped[list["WoundAnalysis"]] = relationship("WoundAnalysis", back_populates="patient")
    alerts: Mapped[list["Alert"]] = relationship("Alert", back_populates="patient")
    messages_received: Mapped[list["DoctorMessage"]] = relationship(
        "DoctorMessage", foreign_keys="DoctorMessage.patient_id", back_populates="patient"
    )
    monitoring_schedule: Mapped["MonitoringSchedule"] = relationship(
        "MonitoringSchedule", back_populates="patient", uselist=False
    )
    medical_courses: Mapped[list["MedicalCourse"]] = relationship(
        "MedicalCourse", back_populates="patient"
    )
    agent_sessions: Mapped[list["AgentSession"]] = relationship(
        "AgentSession", back_populates="patient"
    )


# ─────────────────────────────────────────────
# TABLE 3: doctor_profiles
# Extended doctor info beyond auth.
# ─────────────────────────────────────────────

class DoctorProfile(Base):
    __tablename__ = "doctor_profiles"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    specialization: Mapped[str] = mapped_column(String(255), nullable=True)
    hospital_name: Mapped[str] = mapped_column(String(255), nullable=True)
    medical_license_number: Mapped[str] = mapped_column(String(100), nullable=True)
    profile_picture_url: Mapped[str] = mapped_column(String(500), nullable=True)
    notify_email_high_risk: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_sms_critical: Mapped[bool] = mapped_column(Boolean, default=True)
    notify_inapp_emergency: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="doctor_profile")
    medical_courses: Mapped[list["MedicalCourse"]] = relationship(
        "MedicalCourse", back_populates="doctor"
    )
    alerts: Mapped[list["Alert"]] = relationship("Alert", back_populates="doctor")
    messages_sent: Mapped[list["DoctorMessage"]] = relationship(
        "DoctorMessage", foreign_keys="DoctorMessage.doctor_id", back_populates="doctor"
    )


# ─────────────────────────────────────────────
# TABLE 3.5: volunteer_profiles
# Extended volunteer info beyond auth.
# ─────────────────────────────────────────────

class VolunteerProfile(Base):
    __tablename__ = "volunteer_profiles"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="CASCADE"), unique=True
    )
    phone: Mapped[str] = mapped_column(String(30), nullable=True)
    area_description: Mapped[str] = mapped_column(String(255), nullable=True)  # "Andheri West, Mumbai"
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    current_latitude:  Mapped[float] = mapped_column(Float, nullable=True)
    current_longitude: Mapped[float] = mapped_column(Float, nullable=True)
    last_active_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    # Relationships
    user: Mapped["User"] = relationship("User", back_populates="volunteer_profile")
    responses: Mapped[list["ImpactAlert"]] = relationship(
        "ImpactAlert", back_populates="responder", foreign_keys="ImpactAlert.responder_volunteer_id"
    )


# ─────────────────────────────────────────────
# TABLE 3.6: impact_alerts
# Crash/impact alerts reported by patients, responded to by volunteers.
# ─────────────────────────────────────────────

class ImpactAlert(Base):
    __tablename__ = "impact_alerts"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # Who reported — denormalized strings (patient may not be logged in)
    reported_by_name:  Mapped[str] = mapped_column(String(255), nullable=True, default="Unknown")
    reported_by_phone: Mapped[str] = mapped_column(String(30),  nullable=True)
    reported_by_user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Location
    latitude:       Mapped[float] = mapped_column(Float, nullable=True)
    longitude:      Mapped[float] = mapped_column(Float, nullable=True)
    initial_latitude:  Mapped[float] = mapped_column(Float, nullable=True)
    initial_longitude: Mapped[float] = mapped_column(Float, nullable=True)
    location_label: Mapped[str]   = mapped_column(String(500), nullable=True)  # "12.9716° N, 77.5946° E"
    maps_url:       Mapped[str]   = mapped_column(String(500), nullable=True)  # Google Maps link

    # Status flow: ACTIVE → RESPONDING → RESOLVED
    status: Mapped[ImpactAlertStatus] = mapped_column(
        Enum(ImpactAlertStatus), default=ImpactAlertStatus.ACTIVE
    )

    # Volunteer who responded
    responder_volunteer_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("volunteer_profiles.id", ondelete="SET NULL"), nullable=True
    )
    responder_user_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    responder_name:  Mapped[str]      = mapped_column(String(255), nullable=True)
    responded_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at:     Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    # Notification tracking
    volunteers_notified: Mapped[int]  = mapped_column(Integer, default=0)
    sms_sent:            Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    responder: Mapped["VolunteerProfile"] = relationship(
        "VolunteerProfile", back_populates="responses",
        foreign_keys=[responder_volunteer_id]
    )


# ─────────────────────────────────────────────
# TABLE 4: medical_courses
# A course is a full treatment plan created by a doctor and assigned to a patient.
# ─────────────────────────────────────────────

class MedicalCourse(Base):
    __tablename__ = "medical_courses"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    doctor_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("doctor_profiles.id", ondelete="CASCADE")
    )
    patient_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("patient_profiles.id", ondelete="CASCADE"), nullable=True
    )
    course_name: Mapped[str] = mapped_column(String(255), nullable=False)
    condition_type: Mapped[ConditionType] = mapped_column(Enum(ConditionType), nullable=False)
    status: Mapped[CourseStatus] = mapped_column(Enum(CourseStatus), default=CourseStatus.ACTIVE)
    start_date: Mapped[str] = mapped_column(String(20), nullable=False)
    end_date: Mapped[str] = mapped_column(String(20), nullable=False)
    notes_for_patient: Mapped[str] = mapped_column(Text, nullable=True)
    patient_context: Mapped[str] = mapped_column(Text, nullable=True)  # <-- NEW FIELD
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    # Relationships
    doctor: Mapped["DoctorProfile"] = relationship("DoctorProfile", back_populates="medical_courses")
    patient: Mapped["PatientProfile"] = relationship("PatientProfile", back_populates="medical_courses")
    medications: Mapped[list["Medication"]] = relationship(
        "Medication", back_populates="course", cascade="all, delete-orphan"
    )
    check_ins: Mapped[list["CheckIn"]] = relationship("CheckIn", back_populates="course")

# ─────────────────────────────────────────────
# TABLE 5: medications
# Individual medications inside a medical course.
# ─────────────────────────────────────────────

class Medication(Base):
    __tablename__ = "medications"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    course_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("medical_courses.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    dosage: Mapped[str] = mapped_column(String(100), nullable=False)     # e.g. "500mg"
    frequency: Mapped[str] = mapped_column(String(100), nullable=False)  # e.g. "Twice daily"
    time_of_day: Mapped[str] = mapped_column(String(200), nullable=True) # e.g. "8 AM, 8 PM"
    special_instructions: Mapped[str] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    course: Mapped["MedicalCourse"] = relationship("MedicalCourse", back_populates="medications")


# ─────────────────────────────────────────────
# TABLE 6: check_ins
# Every patient health submission — voice, text, or agent-guided.
# ─────────────────────────────────────────────

class CheckIn(Base):
    __tablename__ = "check_ins"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("patient_profiles.id", ondelete="CASCADE")
    )
    course_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("medical_courses.id", ondelete="SET NULL"), nullable=True
    )
    input_type: Mapped[InputType] = mapped_column(Enum(InputType), nullable=False)

    # Raw inputs (what the patient said or typed)
    raw_input: Mapped[str] = mapped_column(Text, nullable=True)
    transcribed_text: Mapped[str] = mapped_column(Text, nullable=True)

    # Extracted health data (filled by Symptom Intelligence Agent)
    fever_level: Mapped[str] = mapped_column(String(50), nullable=True)
    # "normal" | "low_grade" | "high" | "critical"
    fatigue_score: Mapped[int] = mapped_column(Integer, nullable=True)   # 1-10
    medication_taken: Mapped[bool] = mapped_column(Boolean, nullable=True)
    medication_time_reported: Mapped[str] = mapped_column(String(100), nullable=True)
    symptom_summary: Mapped[str] = mapped_column(Text, nullable=True)    # LLM-generated summary

    # Agent-parsed structured data (any extra key-value pairs)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # Relationships
    patient: Mapped["PatientProfile"] = relationship("PatientProfile", back_populates="check_ins")
    course: Mapped["MedicalCourse"] = relationship("MedicalCourse", back_populates="check_ins")
    risk_score: Mapped["RiskScore"] = relationship(
        "RiskScore", back_populates="check_in", uselist=False
    )
    wound_analysis: Mapped["WoundAnalysis"] = relationship(
        "WoundAnalysis", back_populates="check_in", uselist=False
    )


# ─────────────────────────────────────────────
# TABLE 7: risk_scores
# One risk score per check-in. Transparent weighted formula.
# Weights: Fever 25% | Fatigue 15% | Medication 20% | Wound 30% | Symptom LLM 10%
# ─────────────────────────────────────────────

class RiskScore(Base):
    __tablename__ = "risk_scores"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("patient_profiles.id", ondelete="CASCADE")
    )
    check_in_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("check_ins.id", ondelete="CASCADE"), unique=True
    )

    # Component scores (each 0-10)
    fever_raw_score: Mapped[float] = mapped_column(Float, default=0.0)
    fatigue_raw_score: Mapped[float] = mapped_column(Float, default=0.0)
    medication_raw_score: Mapped[float] = mapped_column(Float, default=0.0)
    wound_raw_score: Mapped[float] = mapped_column(Float, default=0.0)
    symptom_llm_score: Mapped[float] = mapped_column(Float, default=0.0)

    # Final weighted score (0-100)
    total_score: Mapped[float] = mapped_column(Float, nullable=False)
    tier: Mapped[RiskTier] = mapped_column(Enum(RiskTier), nullable=False)

    # Score breakdown (JSON for transparency)
    # e.g. {"fever": {"raw": 6, "weighted": 1.5}, "fatigue": {...}, ...}
    breakdown: Mapped[dict] = mapped_column(JSON, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    # Relationships
    patient: Mapped["PatientProfile"] = relationship("PatientProfile", back_populates="risk_scores")
    check_in: Mapped["CheckIn"] = relationship("CheckIn", back_populates="risk_score")


# ─────────────────────────────────────────────
# TABLE 8: wound_analyses
# Results from Vision Analysis Agent (NVIDIA vision model).
# ─────────────────────────────────────────────

class WoundAnalysis(Base):
    __tablename__ = "wound_analyses"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("patient_profiles.id", ondelete="CASCADE")
    )
    check_in_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("check_ins.id", ondelete="SET NULL"), nullable=True
    )

    image_url: Mapped[str] = mapped_column(String(500), nullable=False)
    severity: Mapped[WoundSeverity] = mapped_column(Enum(WoundSeverity), nullable=False)

    # NVIDIA model raw response
    raw_llm_response: Mapped[str] = mapped_column(Text, nullable=True)

    # Structured findings
    redness_detected: Mapped[bool] = mapped_column(Boolean, default=False)
    swelling_detected: Mapped[bool] = mapped_column(Boolean, default=False)
    texture_change_detected: Mapped[bool] = mapped_column(Boolean, default=False)
    analysis_summary: Mapped[str] = mapped_column(Text, nullable=True)

    # Score sent to Risk Assessment Agent (0-10)
    wound_score: Mapped[float] = mapped_column(Float, default=0.0)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    patient: Mapped["PatientProfile"] = relationship("PatientProfile", back_populates="wound_analyses")
    check_in: Mapped["CheckIn"] = relationship("CheckIn", back_populates="wound_analysis")


# ─────────────────────────────────────────────
# TABLE 9: alerts
# Every escalation event — nudge, doctor notify, critical, emergency.
# ─────────────────────────────────────────────

class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("patient_profiles.id", ondelete="CASCADE")
    )
    doctor_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("doctor_profiles.id", ondelete="SET NULL"), nullable=True
    )
    risk_score_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("risk_scores.id", ondelete="SET NULL"), nullable=True
    )

    alert_type: Mapped[AlertType] = mapped_column(Enum(AlertType), nullable=False)
    status: Mapped[AlertStatus] = mapped_column(Enum(AlertStatus), default=AlertStatus.PENDING)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    risk_score_value: Mapped[float] = mapped_column(Float, nullable=True)

    # For EMERGENCY type
    dispatch_confirmed_by: Mapped[str] = mapped_column(String(255), nullable=True)
    dispatch_confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    ambulance_response: Mapped[str] = mapped_column(Text, nullable=True)

    # Notification tracking
    email_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    sms_sent: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    resolved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    patient: Mapped["PatientProfile"] = relationship("PatientProfile", back_populates="alerts")
    doctor: Mapped["DoctorProfile"] = relationship("DoctorProfile", back_populates="alerts")


# ─────────────────────────────────────────────
# TABLE 10: doctor_messages
# Messages from doctor to patient (one-way in v1).
# ─────────────────────────────────────────────

class DoctorMessage(Base):
    __tablename__ = "doctor_messages"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    doctor_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("doctor_profiles.id", ondelete="CASCADE")
    )
    patient_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("patient_profiles.id", ondelete="CASCADE")
    )
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    doctor: Mapped["DoctorProfile"] = relationship(
        "DoctorProfile", foreign_keys=[doctor_id], back_populates="messages_sent"
    )
    patient: Mapped["PatientProfile"] = relationship(
        "PatientProfile", foreign_keys=[patient_id], back_populates="messages_received"
    )


# ─────────────────────────────────────────────
# TABLE 11: agent_sessions
# Tracks state of an ongoing agent Q&A conversation.
# ─────────────────────────────────────────────

class AgentSession(Base):
    __tablename__ = "agent_sessions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("patient_profiles.id", ondelete="CASCADE")
    )
    check_in_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("check_ins.id", ondelete="SET NULL"), nullable=True
    )

    # "active" | "completed" | "abandoned"
    status: Mapped[str] = mapped_column(String(50), default="active")

    # Full conversation history stored as JSON list
    # [{"role": "agent", "content": "...", "options": ["Yes","No"]}, ...]
    conversation: Mapped[list] = mapped_column(JSON, default=list)

    # Pending question waiting for patient response
    pending_question: Mapped[str] = mapped_column(Text, nullable=True)
    pending_options: Mapped[list] = mapped_column(JSON, nullable=True)

    # Trigger: "patient_initiated" | "agent_triggered" | "wound_request"
    trigger: Mapped[str] = mapped_column(String(50), default="patient_initiated")
    
    language: Mapped[str] = mapped_column(String(10), default="en")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    patient: Mapped["PatientProfile"] = relationship("PatientProfile", back_populates="agent_sessions")


# ─────────────────────────────────────────────
# TABLE 12: monitoring_schedules
# One row per patient — controls how often the system checks in.
# Adjusted by the Adaptive Monitoring Agent.
# ─────────────────────────────────────────────

class MonitoringSchedule(Base):
    __tablename__ = "monitoring_schedules"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    patient_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), ForeignKey("patient_profiles.id", ondelete="CASCADE"), unique=True
    )

    # How often the system should prompt a check-in (in hours)
    check_in_interval_hours: Mapped[int] = mapped_column(Integer, default=24)

    last_check_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    next_check_in_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)

    # Reason for current interval (for transparency)
    interval_reason: Mapped[str] = mapped_column(String(255), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    patient: Mapped["PatientProfile"] = relationship(
        "PatientProfile", back_populates="monitoring_schedule"
    )