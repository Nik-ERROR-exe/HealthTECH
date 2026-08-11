from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from app.models.models import RelationshipType


class RelativeRegisterRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    patient_unique_id: str
    relationship_type: RelationshipType

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v

    @field_validator("full_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Full name cannot be empty")
        return v.strip()


class RelativeLoginRequest(BaseModel):
    email: EmailStr
    password: str


class RelativeResponse(BaseModel):
    id: str
    full_name: str
    email: str
    role: str
    patient_id: str
    relationship_type: str
    patient_unique_id: Optional[str] = None
    patient_name: Optional[str] = None

    class Config:
        from_attributes = True


class RelativeDashboardResponse(BaseModel):
    patient_id: str
    full_name: str
    unique_uid: str
    health_status: str
    active_course: Optional[dict] = None
    medications_today: list[dict] = []
    last_check_in: Optional[str] = None
    unread_messages: int = 0
    pending_question: Optional[dict] = None
    emergency_contact_phone: Optional[str] = None
    risk_tier: Optional[str] = None
    risk_score: Optional[float] = None
    recent_check_ins: list[dict] = []
    wound_history: list[dict] = []
    care_team: list[dict] = []
    vital_signs: Optional[dict] = None
    recovery_trend: Optional[dict] = None
    medication_adherence: Optional[dict] = None
    symptom_trend: list[dict] = []
    risk_score_history: list[dict] = []
    upcoming_appointments: list[dict] = []


class RelativeLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    user_id: str
    full_name: str
    unique_uid: Optional[str] = None
    patient_id: str
    relationship_type: str
    patient_unique_id: Optional[str] = None
    patient_name: Optional[str] = None

    class Config:
        from_attributes = True
