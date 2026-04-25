"""
Doctor Router
All endpoints the doctor-facing frontend calls.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.database import get_db
from app.dependencies import require_doctor
from app.models.models import (
    User, DoctorProfile, PatientProfile, MedicalCourse,
    Medication, RiskScore, CheckIn, Alert, AlertStatus,
    AlertType, DoctorMessage, WoundAnalysis, MonitoringSchedule,
    CourseStatus,
)
from app.schemas.patient_doctor import (
    CourseCreateRequest, CourseAssignRequest, SendMessageRequest,
    CourseModifyRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/doctor", tags=["Doctor"])


# ── Helper ────────────────────────────────────────────────────────

def _get_doctor_profile(user: User, db: Session) -> DoctorProfile:
    profile = db.query(DoctorProfile).filter(
        DoctorProfile.user_id == user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Doctor profile not found")
    return profile


def _tier_to_health_status(tier: str | None) -> str:
    return {
        "GREEN":     "Doing Well",
        "YELLOW":    "Needs Attention",
        "ORANGE":    "Monitor Closely",
        "RED":       "Doctor Has Been Notified",
        "EMERGENCY": "Emergency",
    }.get(tier or "GREEN", "No Data")


def _tier_sort_key(tier: str | None) -> int:
    return {"EMERGENCY": 0, "RED": 1, "ORANGE": 2, "YELLOW": 3, "GREEN": 4}.get(tier or "GREEN", 5)


# ────────────────────────────────────────────
# GET /api/doctor/dashboard
# ────────────────────────────────────────────

@router.get("/dashboard")
def get_doctor_dashboard(
    language: str = "en",
    current_user: User    = Depends(require_doctor),
    db:           Session = Depends(get_db),
):
    doctor = _get_doctor_profile(current_user, db)

    # All patients assigned to this doctor via active courses
    courses = db.query(MedicalCourse).filter(
        MedicalCourse.doctor_id  == doctor.id,
        MedicalCourse.patient_id != None,
    ).all()

    seen_patient_ids = set()
    patient_summaries = []

    for course in courses:
        if course.patient_id in seen_patient_ids:
            continue
        seen_patient_ids.add(course.patient_id)

        patient_profile = db.query(PatientProfile).filter(
            PatientProfile.id == course.patient_id
        ).first()
        if not patient_profile:
            continue

        patient_user = db.query(User).filter(
            User.id == patient_profile.user_id
        ).first()

        # Latest risk score
        latest_score = db.query(RiskScore).filter(
            RiskScore.patient_id == patient_profile.id
        ).order_by(RiskScore.created_at.desc()).first()

        # Last check-in
        last_checkin = db.query(CheckIn).filter(
            CheckIn.patient_id == patient_profile.id
        ).order_by(CheckIn.created_at.desc()).first()

        tier = latest_score.tier.value if latest_score else None

        patient_summaries.append({
            "patient_id":    patient_profile.id,
            "full_name":     patient_user.full_name if patient_user else "Unknown",
            "unique_uid":    patient_user.unique_uid if patient_user else "",
            "course_name":   course.course_name,
            "condition_type": course.condition_type.value,
            "total_score":   float(latest_score.total_score) if latest_score else None,
            "tier":          tier,
            "health_status": _tier_to_health_status(tier),
            "last_check_in": last_checkin.created_at.isoformat() if last_checkin else None,
            "symptom_summary": last_checkin.symptom_summary if last_checkin else None,
        })

    # Sort by risk severity descending
    patient_summaries.sort(key=lambda p: _tier_sort_key(p.get("tier")))

    # Stats
    total    = len(patient_summaries)
    critical = sum(1 for p in patient_summaries if p["tier"] == "EMERGENCY")
    high     = sum(1 for p in patient_summaries if p["tier"] == "RED")
    stable   = sum(1 for p in patient_summaries if p["tier"] in ("GREEN", "YELLOW", None))

    # Active alerts for this doctor
    active_alerts = db.query(Alert).filter(
        Alert.doctor_id == doctor.id,
        Alert.status    == AlertStatus.PENDING,
    ).order_by(Alert.created_at.desc()).all()

    alerts_data = []
    for a in active_alerts:
        patient_profile = db.query(PatientProfile).filter(
            PatientProfile.id == a.patient_id
        ).first()
        patient_user = db.query(User).filter(
            User.id == patient_profile.user_id
        ).first() if patient_profile else None

        alerts_data.append({
            "alert_id":      a.id,
            "alert_type":    a.alert_type.value,
            "patient_name":  patient_user.full_name if patient_user else "Unknown",
            "patient_id":    a.patient_id,
            "message":       a.message,
            "risk_score":    float(a.risk_score_value) if a.risk_score_value else None,
            "created_at":    a.created_at.isoformat(),
        })

    return {
        "total_patients":  total,
        "critical_count":  critical,
        "high_risk_count": high,
        "stable_count":    stable,
        "patients":        patient_summaries,
        "active_alerts":   alerts_data,
    }


# ────────────────────────────────────────────
# GET /api/doctor/patient/{patient_id}
# Individual patient full detail
# ────────────────────────────────────────────

@router.get("/patient/{patient_id}")
def get_patient_detail(
    patient_id:   str,
    language: str = "en",
    current_user: User    = Depends(require_doctor),
    db:           Session = Depends(get_db),
):
    doctor = _get_doctor_profile(current_user, db)

    # Verify this patient belongs to this doctor
    course = db.query(MedicalCourse).filter(
        MedicalCourse.doctor_id  == doctor.id,
        MedicalCourse.patient_id == patient_id,
    ).first()
    if not course:
        raise HTTPException(status_code=403, detail="This patient is not assigned to you")

    patient_profile = db.query(PatientProfile).filter(
        PatientProfile.id == patient_id
    ).first()
    patient_user = db.query(User).filter(
        User.id == patient_profile.user_id
    ).first()

    # Latest risk score with full breakdown
    latest_score = db.query(RiskScore).filter(
        RiskScore.patient_id == patient_id
    ).order_by(RiskScore.created_at.desc()).first()

    # Last 7 check-ins
    recent_checkins = db.query(CheckIn).filter(
        CheckIn.patient_id == patient_id
    ).order_by(CheckIn.created_at.desc()).limit(7).all()

    checkins_data = []
    for c in recent_checkins:
        score = db.query(RiskScore).filter(RiskScore.check_in_id == c.id).first()
        checkins_data.append({
            "check_in_id":     c.id,
            "created_at":      c.created_at.isoformat(),
            "input_type":      c.input_type.value,
            "fever_level":     c.fever_level,
            "fatigue_score":   c.fatigue_score,
            "medication_taken": c.medication_taken,
            "symptom_summary": c.symptom_summary,
            "total_score":     float(score.total_score) if score else None,
            "tier":            score.tier.value if score else None,
        })

    # Risk score history (30 days for graph)
    score_history = db.query(RiskScore).filter(
        RiskScore.patient_id == patient_id
    ).order_by(RiskScore.created_at.desc()).limit(30).all()

    score_history_data = [
        {
            "score":      float(s.total_score),
            "tier":       s.tier.value,
            "created_at": s.created_at.isoformat(),
        }
        for s in reversed(score_history)
    ]

    # Medications
    meds = db.query(Medication).filter(
        Medication.course_id == course.id,
        Medication.is_active == True,
    ).all()
    medications_data = [
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

    # Latest wound analysis
    recent_wounds = db.query(WoundAnalysis).filter(
        WoundAnalysis.patient_id == patient_id
    ).order_by(WoundAnalysis.created_at.desc()).limit(3).all()

    wounds_data = [
        {
            "id":              w.id,
            "severity":        w.severity.value,
            "summary":         w.analysis_summary,
            "redness":         w.redness_detected,
            "swelling":        w.swelling_detected,
            "texture_change":  w.texture_change_detected,
            "wound_score":     float(w.wound_score),
            "image_url":       w.image_url,
            "created_at":      w.created_at.isoformat(),
        }
        for w in recent_wounds
    ]

    # Dynamic condition metrics based on course type
    condition_metrics = _build_condition_metrics(
        course.condition_type.value,
        recent_checkins[0] if recent_checkins else None,
        latest_score,
    )

    return {
        "patient_id":        patient_profile.id,
        "full_name":         patient_user.full_name,
        "unique_uid":        patient_user.unique_uid,
        "email":             patient_user.email,
        "date_of_birth":     patient_profile.date_of_birth,
        "blood_group":       patient_profile.blood_group,
        "emergency_contact": {
            "name":  patient_profile.emergency_contact_name,
            "phone": patient_profile.emergency_contact_phone,
            "email": patient_profile.emergency_contact_email,
        },
        "course": {
            "course_id":     course.id,
            "course_name":   course.course_name,
            "condition":     course.condition_type.value,
            "status":        course.status.value,
            "start_date":    course.start_date,
            "end_date":      course.end_date,
            "notes":         course.notes_for_patient,
        },
        "latest_risk_score": {
            "total_score": float(latest_score.total_score) if latest_score else None,
            "tier":        latest_score.tier.value if latest_score else None,
            "breakdown":   latest_score.breakdown if latest_score else None,
            "created_at":  latest_score.created_at.isoformat() if latest_score else None,
        },
        "score_history":    score_history_data,
        "recent_check_ins": checkins_data,
        "medications":      medications_data,
        "recent_wounds":    wounds_data,
        "condition_metrics": condition_metrics,
    }


def _build_condition_metrics(
    condition: str,
    latest_checkin: CheckIn | None,
    latest_score:   RiskScore | None,
) -> dict:
    """
    Returns condition-specific metric cards for the doctor dashboard.
    Values pulled from latest check-in data.
    """
    fever   = latest_checkin.fever_level if latest_checkin else None
    fatigue = latest_checkin.fatigue_score if latest_checkin else None
    med     = latest_checkin.medication_taken if latest_checkin else None

    def med_status():
        if med is True:  return {"value": "Taken", "status": "normal"}
        if med is False: return {"value": "Missed", "status": "critical"}
        return {"value": "Unknown", "status": "warning"}

    def fever_status():
        mapping = {
            "normal":    ("Normal", "normal"),
            "low_grade": ("Low Grade", "warning"),
            "high":      ("High", "critical"),
            "critical":  ("Critical", "critical"),
        }
        label, status = mapping.get(fever or "normal", ("Unknown", "warning"))
        return {"value": label, "status": status}

    base = {
        "medication_adherence": med_status(),
        "fever":                fever_status(),
        "fatigue":              {
            "value":  f"{fatigue}/10" if fatigue else "N/A",
            "status": "critical" if (fatigue or 0) >= 7 else "warning" if (fatigue or 0) >= 4 else "normal",
        },
        "risk_score": {
            "value":  f"{float(latest_score.total_score):.1f}/100" if latest_score else "N/A",
            "status": latest_score.tier.value.lower() if latest_score else "normal",
        },
    }

    condition_extras = {
        "POST_KIDNEY_TRANSPLANT": {
            "blood_pressure":  {"value": "—", "status": "normal", "note": "IoT integration pending"},
            "urine_output":    {"value": "—", "status": "normal", "note": "IoT integration pending"},
            "creatinine":      {"value": "—", "status": "normal", "note": "IoT integration pending"},
        },
        "POST_CARDIAC_SURGERY": {
            "heart_rate":      {"value": "—", "status": "normal", "note": "IoT integration pending"},
            "oxygen_sat":      {"value": "—", "status": "normal", "note": "IoT integration pending"},
            "fluid_intake":    {"value": "—", "status": "normal", "note": "IoT integration pending"},
        },
        "ASTHMA_RESPIRATORY": {
            "respiratory_rate": {"value": "—", "status": "normal", "note": "IoT integration pending"},
            "oxygen_sat":       {"value": "—", "status": "normal", "note": "IoT integration pending"},
            "peak_flow":        {"value": "—", "status": "normal", "note": "IoT integration pending"},
        },
        "DIABETES_MANAGEMENT": {
            "blood_sugar":     {"value": "—", "status": "normal", "note": "IoT integration pending"},
            "insulin_taken":   {"value": "—", "status": "normal", "note": "IoT integration pending"},
        },
        "GENERAL_POST_SURGERY": {
            "wound_status":    {"value": "—", "status": "normal", "note": "See wound analysis"},
        },
    }

    base.update(condition_extras.get(condition, {}))
    return base


# ────────────────────────────────────────────
# GET /api/doctor/find-patient
# Finds a patient by their unique CNT-XXXXX ID
# ────────────────────────────────────────────

@router.get("/find-patient")
def find_patient(
    uid:          str,
    current_user: User    = Depends(require_doctor),
    db:           Session = Depends(get_db),
):
    user = db.query(User).filter(User.unique_uid == uid).first()
    if not user:
        raise HTTPException(status_code=404, detail="No patient found with this ID")

    profile = db.query(PatientProfile).filter(
        PatientProfile.user_id == user.id
    ).first()

    return {
        "patient_id":  profile.id if profile else None,
        "full_name":   user.full_name,
        "email":       user.email,
        "unique_uid":  user.unique_uid,
    }


# ────────────────────────────────────────────
# GET /api/doctor/courses
# List all courses created by this doctor
# ────────────────────────────────────────────

@router.get("/courses")
def list_doctor_courses(
    current_user: User    = Depends(require_doctor),
    db:           Session = Depends(get_db),
):
    """
    Returns all courses created by this doctor.
    assigned = True  → course has a patient_id (already assigned)
    assigned = False → course is unassigned, available to give to a new patient
    """
    doctor = _get_doctor_profile(current_user, db)

    courses = db.query(MedicalCourse).filter(
        MedicalCourse.doctor_id == doctor.id,
    ).order_by(MedicalCourse.created_at.desc()).all()

    results = []
    for c in courses:
        # If assigned, include the patient name
        patient_name = None
        if c.patient_id:
            p_profile = db.query(PatientProfile).filter(
                PatientProfile.id == c.patient_id
            ).first()
            if p_profile:
                p_user = db.query(User).filter(User.id == p_profile.user_id).first()
                patient_name = p_user.full_name if p_user else "Unknown"

        # Count medications
        med_count = db.query(Medication).filter(
            Medication.course_id == c.id,
            Medication.is_active == True,
        ).count()

        results.append({
            "course_id":         c.id,
            "course_name":       c.course_name,
            "condition_type":    c.condition_type.value,
            "status":            c.status.value,
            "start_date":        c.start_date,
            "end_date":          c.end_date,
            "assigned":          c.patient_id is not None,
            "patient_name":      patient_name,
            "medication_count":  med_count,
            "created_at":        c.created_at.isoformat(),
        })

    return {
        "courses":           results,
        "total":             len(results),
        "unassigned_count":  sum(1 for r in results if not r["assigned"]),
    }


# ────────────────────────────────────────────
# POST /api/doctor/courses
# Create a medical course
# ────────────────────────────────────────────

@router.post("/courses", status_code=status.HTTP_201_CREATED)
def create_course(
    payload:      CourseCreateRequest,
    current_user: User    = Depends(require_doctor),
    db:           Session = Depends(get_db),
):
    from app.models.models import ConditionType
    doctor = _get_doctor_profile(current_user, db)

    try:
        condition = ConditionType(payload.condition_type)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid condition_type: {payload.condition_type}")

    course = MedicalCourse(
        doctor_id          = doctor.id,
        course_name        = payload.course_name,
        condition_type     = condition,
        start_date         = payload.start_date,
        end_date           = payload.end_date,
        notes_for_patient  = payload.notes_for_patient,
        patient_context    = payload.patient_context,   # <-- NEW FIELD
        status             = CourseStatus.ACTIVE,
    )
    db.add(course)
    db.flush()

    for med in payload.medications:
        medication = Medication(
            course_id            = course.id,
            name                 = med.name,
            dosage               = med.dosage,
            frequency            = med.frequency,
            time_of_day          = med.time_of_day,
            special_instructions = med.special_instructions,
        )
        db.add(medication)

    db.commit()
    db.refresh(course)

    return {
        "message":   "Course created successfully",
        "course_id": course.id,
    }


# ────────────────────────────────────────────
# POST /api/doctor/courses/{course_id}/assign
# Assign course to patient using unique_uid
# ────────────────────────────────────────────

@router.post("/courses/{course_id}/assign")
def assign_course(
    course_id:    str,
    payload:      CourseAssignRequest,
    current_user: User    = Depends(require_doctor),
    db:           Session = Depends(get_db),
):
    doctor = _get_doctor_profile(current_user, db)

    course = db.query(MedicalCourse).filter(
        MedicalCourse.id        == course_id,
        MedicalCourse.doctor_id == doctor.id,
    ).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")

    # Find patient by CNT-XXXXX uid
    patient_user = db.query(User).filter(
        User.unique_uid == payload.patient_unique_uid
    ).first()
    if not patient_user:
        raise HTTPException(status_code=404, detail="No patient found with this ID")

    patient_profile = db.query(PatientProfile).filter(
        PatientProfile.user_id == patient_user.id
    ).first()
    if not patient_profile:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    course.patient_id  = patient_profile.id
    course.updated_at  = datetime.now(timezone.utc)
    db.commit()

    # Create default monitoring schedule for patient
    existing_schedule = db.query(MonitoringSchedule).filter(
        MonitoringSchedule.patient_id == patient_profile.id
    ).first()
    if not existing_schedule:
        schedule = MonitoringSchedule(
            patient_id              = patient_profile.id,
            check_in_interval_hours = 24,
            interval_reason         = "Initial assignment — standard 24h monitoring",
        )
        db.add(schedule)
        db.commit()

    return {
        "message":      "Course assigned successfully",
        "patient_name": patient_user.full_name,
        "course_id":    course.id,
    }


# ────────────────────────────────────────────
# POST /api/doctor/message
# Send message to patient
# ────────────────────────────────────────────

@router.post("/message")
def send_message(
    payload:      SendMessageRequest,
    current_user: User    = Depends(require_doctor),
    db:           Session = Depends(get_db),
):
    doctor = _get_doctor_profile(current_user, db)

    # Verify this patient is assigned to this doctor
    course = db.query(MedicalCourse).filter(
        MedicalCourse.doctor_id  == doctor.id,
        MedicalCourse.patient_id == payload.patient_id,
    ).first()
    if not course:
        raise HTTPException(status_code=403, detail="This patient is not assigned to you")

    message = DoctorMessage(
        doctor_id  = doctor.id,
        patient_id = payload.patient_id,
        message    = payload.message,
    )
    db.add(message)
    db.commit()
    return {"message": "Message sent successfully"}


# ────────────────────────────────────────────
# GET /api/doctor/alerts/active
# Frontend polls every 10s for emergency alerts
# ────────────────────────────────────────────

@router.get("/alerts/active")
def get_active_alerts(
    current_user: User    = Depends(require_doctor),
    db:           Session = Depends(get_db),
):
    doctor = _get_doctor_profile(current_user, db)

    alerts = db.query(Alert).filter(
        Alert.doctor_id == doctor.id,
        Alert.status    == AlertStatus.PENDING,
    ).order_by(Alert.created_at.desc()).all()

    results = []
    for a in alerts:
        patient_profile = db.query(PatientProfile).filter(
            PatientProfile.id == a.patient_id
        ).first()
        patient_user = db.query(User).filter(
            User.id == patient_profile.user_id
        ).first() if patient_profile else None

        results.append({
            "alert_id":     a.id,
            "alert_type":   a.alert_type.value,
            "patient_name": patient_user.full_name if patient_user else "Unknown",
            "patient_id":   a.patient_id,
            "message":      a.message,
            "risk_score":   float(a.risk_score_value) if a.risk_score_value else None,
            "created_at":   a.created_at.isoformat(),
        })

    return {"alerts": results, "count": len(results)}


# ────────────────────────────────────────────
# POST /api/doctor/confirm-dispatch/{alert_id}
# Human confirmation before ambulance is called
# ────────────────────────────────────────────

@router.post("/confirm-dispatch/{alert_id}")
async def confirm_dispatch(
    alert_id:     str,
    current_user: User    = Depends(require_doctor),
    db:           Session = Depends(get_db),
):
    doctor = _get_doctor_profile(current_user, db)

    alert = db.query(Alert).filter(
        Alert.id        == alert_id,
        Alert.doctor_id == doctor.id,
        Alert.alert_type == AlertType.EMERGENCY,
    ).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Emergency alert not found")

    if alert.status == AlertStatus.DISPATCHED:
        return {"message": "Ambulance already dispatched"}

    # ── DEMO: Call the demo phone number via Twilio voice call ────
    demo_result = await _trigger_demo_ambulance(alert, current_user, db)

    alert.status                = AlertStatus.DISPATCHED
    alert.dispatch_confirmed_by = current_user.id
    alert.dispatch_confirmed_at = datetime.now(timezone.utc)
    alert.ambulance_response    = demo_result
    alert.resolved_at           = datetime.now(timezone.utc)
    db.commit()

    return {
        "message":         "Ambulance dispatch confirmed",
        "demo_note":       "Demo mode: alert sent to configured demo number",
        "dispatch_result": demo_result,
    }


async def _trigger_demo_ambulance(alert: Alert, doctor: User, db: Session) -> str:
    """
    DEMO: Sends SMS to the doctor's own number as ambulance confirmation.
    In production: replace with real emergency dispatch API.
    """
    from services.alert_service import send_sms_alert
    from app.config import settings

    patient_profile = db.query(PatientProfile).filter(
        PatientProfile.id == alert.patient_id
    ).first()
    patient_user = db.query(User).filter(
        User.id == patient_profile.user_id
    ).first() if patient_profile else None

    demo_message = (
        f"[CARENETRA DEMO] AMBULANCE DISPATCH CONFIRMED by Dr. {doctor.full_name}. "
        f"Patient: {patient_user.full_name if patient_user else 'Unknown'}. "
        f"Risk Score: {alert.risk_score_value}/100. "
        f"In production this triggers real emergency services."
    )

    # Send to Twilio number itself as demo (loopback)
    await send_sms_alert(
        to_phone = settings.TWILIO_PHONE_NUMBER,
        body     = demo_message,
    )

    return "Demo dispatch SMS sent to configured number"


# ────────────────────────────────────────────
# POST /api/doctor/dismiss-alert/{alert_id}
# ────────────────────────────────────────────

@router.post("/dismiss-alert/{alert_id}")
def dismiss_alert(
    alert_id:     str,
    current_user: User    = Depends(require_doctor),
    db:           Session = Depends(get_db),
):
    doctor = _get_doctor_profile(current_user, db)

    alert = db.query(Alert).filter(
        Alert.id        == alert_id,
        Alert.doctor_id == doctor.id,
    ).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status      = AlertStatus.DISMISSED
    alert.resolved_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": "Alert dismissed"}


# ────────────────────────────────────────────
# GET /api/doctor/profile
# ────────────────────────────────────────────

@router.get("/profile")
def get_doctor_profile(
    current_user: User    = Depends(require_doctor),
    db:           Session = Depends(get_db),
):
    doctor = _get_doctor_profile(current_user, db)
    return {
        "full_name":               current_user.full_name,
        "email":                   current_user.email,
        "specialization":          doctor.specialization,
        "hospital_name":           doctor.hospital_name,
        "medical_license_number":  doctor.medical_license_number,
        "notify_email_high_risk":  doctor.notify_email_high_risk,
        "notify_sms_critical":     doctor.notify_sms_critical,
        "notify_inapp_emergency":  doctor.notify_inapp_emergency,
        "profile_picture_url":     doctor.profile_picture_url,
    }


# ────────────────────────────────────────────
# PUT /api/doctor/profile
# ────────────────────────────────────────────

@router.put("/profile")
def update_doctor_profile(
    payload:      dict,
    current_user: User    = Depends(require_doctor),
    db:           Session = Depends(get_db),
):
    doctor = _get_doctor_profile(current_user, db)

    allowed = {
        "specialization", "hospital_name", "medical_license_number",
        "notify_email_high_risk", "notify_sms_critical", "notify_inapp_emergency",
    }
    for field, value in payload.items():
        if field in allowed:
            setattr(doctor, field, value)

    doctor.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Profile updated successfully"}