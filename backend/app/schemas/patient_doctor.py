"""
Schemas for patient and doctor API request/response models.
"""
from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


# ─────────────────────────────────────────────
# PATIENT SCHEMAS
# ─────────────────────────────────────────────

class CheckInRequest(BaseModel):
    input_type: str = "TEXT"   # TEXT | AGENT
    raw_input: str


class CheckInResponse(BaseModel):
    check_in_id:       str
    patient_id:        str
    total_score:       Optional[float]
    tier:              Optional[str]
    escalation_action: Optional[str]
    symptom_summary:   Optional[str]
    new_interval_hours: Optional[int]
    errors:            List[str]


class PatientDashboardResponse(BaseModel):
    patient_id:        str
    full_name:         str
    unique_uid:        str
    health_status:     str           # Doing Well | Needs Attention | Monitor Closely | Doctor Notified | Emergency
    active_course:     Optional[dict]
    medications_today: List[dict]
    last_check_in:     Optional[str]
    unread_messages:   int
    pending_question:  Optional[dict]  # agent session pending Q
    emergency_contact_phone: Optional[str] = None


class WoundUploadResponse(BaseModel):
    wound_analysis_id: Optional[str]
    severity:          str
    summary:           str
    wound_score:       float
    total_score:       Optional[float]
    tier:              Optional[str]


class PendingAgentMessage(BaseModel):
    session_id:       Optional[str]
    has_pending:      bool
    question:         Optional[str]
    options:          Optional[List[str]]
    trigger:          Optional[str]


class AgentResponseRequest(BaseModel):
    session_id: str
    response:   str


class PatientProfileUpdate(BaseModel):
    date_of_birth:           Optional[str]  = None
    blood_group:             Optional[str]  = None
    emergency_contact_name:  Optional[str]  = None
    emergency_contact_phone: Optional[str]  = None
    emergency_contact_email: Optional[str]  = None
    allow_agent_mic_control: Optional[bool] = None


# ─────────────────────────────────────────────
# DOCTOR SCHEMAS
# ─────────────────────────────────────────────

class MedicationCreate(BaseModel):
    name:                 str
    dosage:               str
    frequency:            str
    time_of_day:          Optional[str] = None
    special_instructions: Optional[str] = None


class CourseCreateRequest(BaseModel):
    course_name:       str
    condition_type:    str
    start_date:        str
    end_date:          str
    notes_for_patient: Optional[str] = None
    patient_context:   Optional[str] = None   # <-- NEW FIELD
    medications:       List[MedicationCreate]


class CourseAssignRequest(BaseModel):
    patient_unique_uid: str    # CNT-XXXXX


class SendMessageRequest(BaseModel):
    patient_id: str
    message:    str


class CourseModifyRequest(BaseModel):
    course_id:         str
    notes_for_patient: Optional[str]          = None
    medications:       Optional[List[MedicationCreate]] = None


class PatientSummaryItem(BaseModel):
    patient_id:    str
    full_name:     str
    unique_uid:    str
    course_name:   Optional[str]
    condition_type: Optional[str]
    total_score:   Optional[float]
    tier:          Optional[str]
    health_status: str
    last_check_in: Optional[str]


class DoctorDashboardResponse(BaseModel):
    total_patients:  int
    critical_count:  int
    high_risk_count: int
    stable_count:    int
    patients:        List[PatientSummaryItem]
    active_alerts:   List[dict]


class PatientDetailResponse(BaseModel):
    patient_id:          str
    full_name:           str
    unique_uid:          str
    course:              Optional[dict]
    medications:         List[dict]
    latest_risk_score:   Optional[dict]
    recent_check_ins:    List[dict]
    recent_wounds:       List[dict]
    condition_metrics:   dict