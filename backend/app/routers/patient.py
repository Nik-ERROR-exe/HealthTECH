"""
Patient Router
All endpoints the patient-facing frontend calls.
"""
import os
import uuid
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_patient
from app.models.models import (
    User, PatientProfile, CheckIn, RiskScore, MedicalCourse,
    Medication, AgentSession, DoctorMessage, MonitoringSchedule,
    InputType, AlertType, Alert, AlertStatus,
)
from app.schemas.patient_doctor import (
    CheckInRequest, CheckInResponse, PatientDashboardResponse,
    WoundUploadResponse, PendingAgentMessage, AgentResponseRequest,
    PatientProfileUpdate,
)
from app.agents.graph import run_agent_pipeline
from services.transcription_service import transcribe_audio

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/patient", tags=["Patient"])

UPLOAD_DIR = "uploads/wounds"
AUDIO_DIR  = "uploads/audio"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR,  exist_ok=True)


# ── Helper: get patient profile from user ────────────────────────

def _get_patient_profile(user: User, db: Session) -> PatientProfile:
    profile = db.query(PatientProfile).filter(
        PatientProfile.user_id == user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Patient profile not found")
    return profile


def _tier_to_health_status(tier: Optional[str]) -> str:
    return {
        "GREEN":     "Doing Well",
        "YELLOW":    "Needs Attention",
        "ORANGE":    "Monitor Closely",
        "RED":       "Doctor Has Been Notified",
        "EMERGENCY": "Emergency — Help Is On The Way",
    }.get(tier or "GREEN", "Doing Well")


# ────────────────────────────────────────────
# GET /api/patient/dashboard
# ────────────────────────────────────────────

@router.get("/dashboard")
def get_patient_dashboard(
    current_user: User    = Depends(require_patient),
    db:           Session = Depends(get_db),
):
    profile = _get_patient_profile(current_user, db)

    # Active medical course
    active_course = db.query(MedicalCourse).filter(
        MedicalCourse.patient_id == profile.id,
        MedicalCourse.status     == "ACTIVE",
    ).first()

    course_data = None
    medications_today = []

    if active_course:
        # Progress calculation
        try:
            start = datetime.strptime(active_course.start_date, "%Y-%m-%d")
            end   = datetime.strptime(active_course.end_date,   "%Y-%m-%d")
            today = datetime.utcnow()
            total_days   = max((end - start).days, 1)
            elapsed_days = max((today - start).days, 0)
            progress_pct = min(round((elapsed_days / total_days) * 100), 100)
        except Exception:
            progress_pct = 0

        # Doctor name
        from app.models.models import DoctorProfile
        doctor_profile = db.query(DoctorProfile).filter(
            DoctorProfile.id == active_course.doctor_id
        ).first()
        doctor_user = None
        if doctor_profile:
            doctor_user = db.query(User).filter(
                User.id == doctor_profile.user_id
            ).first()

        course_data = {
            "course_id":    active_course.id,
            "course_name":  active_course.course_name,
            "condition":    active_course.condition_type.value,
            "doctor_name":  doctor_user.full_name if doctor_user else "Your Doctor",
            "start_date":   active_course.start_date,
            "end_date":     active_course.end_date,
            "progress_pct": progress_pct,
            "notes":        active_course.notes_for_patient,
        }

        # Today's medications
        meds = db.query(Medication).filter(
            Medication.course_id == active_course.id,
            Medication.is_active == True,
        ).all()
        medications_today = [
            {
                "id":           m.id,
                "name":         m.name,
                "dosage":       m.dosage,
                "frequency":    m.frequency,
                "time_of_day":  m.time_of_day,
                "instructions": m.special_instructions,
            }
            for m in meds
        ]

    # Latest risk score → health status
    latest_score = None
    if profile:
        latest_score = db.query(RiskScore).filter(
            RiskScore.patient_id == profile.id
        ).order_by(RiskScore.created_at.desc()).first()

    health_status = _tier_to_health_status(
        latest_score.tier.value if latest_score else None
    )

    # Last check-in time
    last_checkin = db.query(CheckIn).filter(
        CheckIn.patient_id == profile.id
    ).order_by(CheckIn.created_at.desc()).first()

    # Unread messages
    unread_count = db.query(DoctorMessage).filter(
        DoctorMessage.patient_id == profile.id,
        DoctorMessage.is_read    == False,
    ).count()

    # Pending agent question
    pending_session = db.query(AgentSession).filter(
        AgentSession.patient_id      == profile.id,
        AgentSession.status          == "active",
        AgentSession.pending_question != None,
    ).order_by(AgentSession.created_at.desc()).first()

    pending_q = None
    if pending_session:
        pending_q = {
            "session_id": pending_session.id,
            "question":   pending_session.pending_question,
            "options":    pending_session.pending_options,
            "trigger":    pending_session.trigger,
        }

    return {
        "patient_id":        profile.id,
        "full_name":         current_user.full_name,
        "unique_uid":        current_user.unique_uid,
        "health_status":     health_status,
        "active_course":     course_data,
        "medications_today": medications_today,
        "last_check_in":     last_checkin.created_at.isoformat() if last_checkin else None,
        "unread_messages":   unread_count,
        "pending_question":  pending_q,
    }


# ────────────────────────────────────────────
# POST /api/patient/checkin  (text / agent)
# ────────────────────────────────────────────

@router.post("/checkin", response_model=CheckInResponse)
async def submit_checkin(
    payload:      CheckInRequest,
    current_user: User    = Depends(require_patient),
    db:           Session = Depends(get_db),
):
    profile = _get_patient_profile(current_user, db)

    # Get active course
    active_course = db.query(MedicalCourse).filter(
        MedicalCourse.patient_id == profile.id,
        MedicalCourse.status     == "ACTIVE",
    ).first()

    # Create check_in record
    check_in = CheckIn(
        patient_id   = profile.id,
        course_id    = active_course.id if active_course else None,
        input_type   = InputType(payload.input_type),
        raw_input    = payload.raw_input,
    )
    db.add(check_in)
    db.commit()
    db.refresh(check_in)

    # Run agent pipeline
    final_state = await run_agent_pipeline(
        patient_id  = profile.id,
        check_in_id = check_in.id,
        raw_input   = payload.raw_input,
        input_type  = payload.input_type,
        course_id   = active_course.id if active_course else None,
    )

    return CheckInResponse(
        check_in_id        = check_in.id,
        patient_id         = profile.id,
        total_score        = final_state.get("total_score"),
        tier               = final_state.get("tier"),
        escalation_action  = final_state.get("escalation_action"),
        symptom_summary    = final_state.get("symptom_summary"),
        new_interval_hours = final_state.get("new_interval_hours"),
        errors             = final_state.get("errors", []),
    )


# ────────────────────────────────────────────
# POST /api/patient/checkin/voice
# ────────────────────────────────────────────

@router.post("/checkin/voice", response_model=CheckInResponse)
async def submit_voice_checkin(
    audio:        UploadFile       = File(...),
    current_user: User             = Depends(require_patient),
    db:           Session          = Depends(get_db),
):
    profile = _get_patient_profile(current_user, db)

    # Save audio file
    file_ext  = os.path.splitext(audio.filename or "recording.wav")[1] or ".wav"
    file_name = f"{uuid.uuid4()}{file_ext}"
    file_path = os.path.join(AUDIO_DIR, file_name)

    content = await audio.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # Transcribe
    try:
        transcript = await transcribe_audio(file_path)
    except Exception as e:
        logger.error(f"[VoiceCheckin] Transcription failed: {e}")
        raise HTTPException(status_code=422, detail=f"Audio transcription failed: {e}")
    finally:
        # Clean up audio file after transcription
        if os.path.exists(file_path):
            os.remove(file_path)

    if not transcript:
        raise HTTPException(status_code=422, detail="Could not transcribe audio. Please try again.")

    # Active course
    active_course = db.query(MedicalCourse).filter(
        MedicalCourse.patient_id == profile.id,
        MedicalCourse.status     == "ACTIVE",
    ).first()

    # Create check_in
    check_in = CheckIn(
        patient_id       = profile.id,
        course_id        = active_course.id if active_course else None,
        input_type       = InputType.VOICE,
        raw_input        = audio.filename,
        transcribed_text = transcript,
    )
    db.add(check_in)
    db.commit()
    db.refresh(check_in)

    # Run pipeline with transcribed text
    final_state = await run_agent_pipeline(
        patient_id  = profile.id,
        check_in_id = check_in.id,
        raw_input   = transcript,
        input_type  = "VOICE",
        course_id   = active_course.id if active_course else None,
    )

    return CheckInResponse(
        check_in_id        = check_in.id,
        patient_id         = profile.id,
        total_score        = final_state.get("total_score"),
        tier               = final_state.get("tier"),
        escalation_action  = final_state.get("escalation_action"),
        symptom_summary    = final_state.get("symptom_summary"),
        new_interval_hours = final_state.get("new_interval_hours"),
        errors             = final_state.get("errors", []),
    )


# ────────────────────────────────────────────
# POST /api/patient/wound-upload
# ────────────────────────────────────────────

@router.post("/wound-upload", response_model=WoundUploadResponse)
async def upload_wound_photo(
    image:        UploadFile = File(...),
    current_user: User       = Depends(require_patient),
    db:           Session    = Depends(get_db),
):
    profile = _get_patient_profile(current_user, db)

    # Validate image type
    allowed = {"image/jpeg", "image/png", "image/webp"}
    if image.content_type not in allowed:
        raise HTTPException(status_code=422, detail="Only JPEG, PNG, and WebP images are allowed")

    # Save image
    ext       = os.path.splitext(image.filename or "wound.jpg")[1] or ".jpg"
    file_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, file_name)

    content = await image.read()
    with open(file_path, "wb") as f:
        f.write(content)

    # Get active course for pipeline
    active_course = db.query(MedicalCourse).filter(
        MedicalCourse.patient_id == profile.id,
        MedicalCourse.status     == "ACTIVE",
    ).first()

    # Create a check_in record for this wound upload
    check_in = CheckIn(
        patient_id = profile.id,
        course_id  = active_course.id if active_course else None,
        input_type = InputType.AGENT,
        raw_input  = "Wound photo uploaded by patient",
    )
    db.add(check_in)
    db.commit()
    db.refresh(check_in)

    # Run pipeline with wound image — no text input
    final_state = await run_agent_pipeline(
        patient_id       = profile.id,
        check_in_id      = check_in.id,
        raw_input        = "Patient uploaded a wound photo for analysis.",
        input_type       = "AGENT",
        course_id        = active_course.id if active_course else None,
        has_wound_image  = True,
        wound_image_path = file_path,
    )

    return WoundUploadResponse(
        wound_analysis_id = final_state.get("wound_analysis_id"),
        severity          = final_state.get("wound_severity", "NORMAL"),
        summary           = final_state.get("wound_analysis_summary", "Analysis complete."),
        wound_score       = final_state.get("wound_score", 0.0),
        total_score       = final_state.get("total_score"),
        tier              = final_state.get("tier"),
    )


# ────────────────────────────────────────────
# GET /api/patient/pending-agent-message
# Frontend polls this every 30s
# ────────────────────────────────────────────

@router.get("/pending-agent-message", response_model=PendingAgentMessage)
def get_pending_agent_message(
    current_user: User    = Depends(require_patient),
    db:           Session = Depends(get_db),
):
    profile = _get_patient_profile(current_user, db)

    session = db.query(AgentSession).filter(
        AgentSession.patient_id      == profile.id,
        AgentSession.status          == "active",
        AgentSession.pending_question != None,
    ).order_by(AgentSession.created_at.desc()).first()

    if not session:
        return PendingAgentMessage(has_pending=False, session_id=None,
                                   question=None, options=None, trigger=None)

    return PendingAgentMessage(
        has_pending = True,
        session_id  = session.id,
        question    = session.pending_question,
        options     = session.pending_options,
        trigger     = session.trigger,
    )


# ────────────────────────────────────────────
# POST /api/patient/checkin/agent-response
# Patient responds to an agent question
# ────────────────────────────────────────────

@router.post("/checkin/agent-response")
async def submit_agent_response(
    payload:      AgentResponseRequest,
    current_user: User    = Depends(require_patient),
    db:           Session = Depends(get_db),
):
    profile = _get_patient_profile(current_user, db)

    session = db.query(AgentSession).filter(
        AgentSession.id         == payload.session_id,
        AgentSession.patient_id == profile.id,
        AgentSession.status     == "active",
    ).first()

    if not session:
        raise HTTPException(status_code=404, detail="Agent session not found")

    # Append patient response to conversation history
    conversation = list(session.conversation or [])
    conversation.append({
        "role":    "patient",
        "content": payload.response,
        "time":    datetime.now(timezone.utc).isoformat(),
    })

    # Clear pending question (answered)
    session.conversation     = conversation
    session.pending_question = None
    session.pending_options  = None
    session.updated_at       = datetime.now(timezone.utc)
    db.commit()

    # Run full pipeline with the patient's response as input
    active_course = db.query(MedicalCourse).filter(
        MedicalCourse.patient_id == profile.id,
        MedicalCourse.status     == "ACTIVE",
    ).first()

    final_state = await run_agent_pipeline(
        patient_id  = profile.id,
        check_in_id = session.check_in_id or session.id,
        raw_input   = payload.response,
        input_type  = "AGENT",
        course_id   = active_course.id if active_course else None,
    )

    # Mark session complete
    session.status = "completed"
    db.commit()

    return {
        "message":    "Response recorded",
        "total_score": final_state.get("total_score"),
        "tier":        final_state.get("tier"),
        "action":      final_state.get("escalation_action"),
    }


# ────────────────────────────────────────────
# GET /api/patient/messages
# ────────────────────────────────────────────

@router.get("/messages")
def get_messages(
    current_user: User    = Depends(require_patient),
    db:           Session = Depends(get_db),
):
    profile = _get_patient_profile(current_user, db)

    messages = db.query(DoctorMessage).filter(
        DoctorMessage.patient_id == profile.id
    ).order_by(DoctorMessage.created_at.desc()).limit(50).all()

    # Mark all as read
    for m in messages:
        if not m.is_read:
            m.is_read = True
    db.commit()

    from app.models.models import DoctorProfile
    results = []
    for m in messages:
        doctor_profile = db.query(DoctorProfile).filter(
            DoctorProfile.id == m.doctor_id
        ).first()
        doctor_user = db.query(User).filter(
            User.id == doctor_profile.user_id
        ).first() if doctor_profile else None

        results.append({
            "id":          m.id,
            "message":     m.message,
            "doctor_name": doctor_user.full_name if doctor_user else "Your Doctor",
            "created_at":  m.created_at.isoformat(),
            "is_read":     True,
        })

    return {"messages": results}


# ────────────────────────────────────────────
# GET /api/patient/profile
# ────────────────────────────────────────────

@router.get("/profile")
def get_profile(
    current_user: User    = Depends(require_patient),
    db:           Session = Depends(get_db),
):
    profile = _get_patient_profile(current_user, db)
    return {
        "full_name":                current_user.full_name,
        "email":                    current_user.email,
        "unique_uid":               current_user.unique_uid,
        "date_of_birth":            profile.date_of_birth,
        "blood_group":              profile.blood_group,
        "emergency_contact_name":   profile.emergency_contact_name,
        "emergency_contact_phone":  profile.emergency_contact_phone,
        "emergency_contact_email":  profile.emergency_contact_email,
        "allow_agent_mic_control":  profile.allow_agent_mic_control,
        "profile_picture_url":      profile.profile_picture_url,
    }


# ────────────────────────────────────────────
# PUT /api/patient/profile
# ────────────────────────────────────────────

@router.put("/profile")
def update_profile(
    payload:      PatientProfileUpdate,
    current_user: User    = Depends(require_patient),
    db:           Session = Depends(get_db),
):
    profile = _get_patient_profile(current_user, db)

    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(profile, field, value)

    profile.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Profile updated successfully"}


# ────────────────────────────────────────────
# GET /api/patient/check-in-history
# ────────────────────────────────────────────

@router.get("/check-in-history")
def get_checkin_history(
    current_user: User    = Depends(require_patient),
    db:           Session = Depends(get_db),
):
    profile = _get_patient_profile(current_user, db)

    check_ins = db.query(CheckIn).filter(
        CheckIn.patient_id == profile.id
    ).order_by(CheckIn.created_at.desc()).limit(30).all()

    results = []
    for c in check_ins:
        score = db.query(RiskScore).filter(
            RiskScore.check_in_id == c.id
        ).first()
        results.append({
            "check_in_id":    c.id,
            "created_at":     c.created_at.isoformat(),
            "input_type":     c.input_type.value,
            "symptom_summary": c.symptom_summary,
            "total_score":    float(score.total_score) if score else None,
            "tier":           score.tier.value if score else None,
        })

    return {"history": results}