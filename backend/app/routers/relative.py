"""
CARENETRA — Relative Router
Endpoints for the relative user role.
"""
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.dependencies import require_relative
from app.models.models import (
    User, RelativeProfile, PatientProfile, CheckIn, RiskScore,
    MedicalCourse, Medication, AgentSession, DoctorMessage,
    DoctorProfile, WoundAnalysis,
)
from app.schemas.relative import RelativeDashboardResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/relative", tags=["Relative"])


def _get_patient_for_relative(current_user: User, db: Session) -> PatientProfile:
    relative_profile = db.query(RelativeProfile).filter(
        RelativeProfile.user_id == current_user.id
    ).first()
    if not relative_profile:
        raise HTTPException(status_code=404, detail="Relative profile not found")

    patient = db.query(PatientProfile).filter(
        PatientProfile.id == relative_profile.patient_id
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Linked patient not found")

    return patient


@router.get("/dashboard", response_model=RelativeDashboardResponse)
def get_relative_dashboard(
    current_user: User = Depends(require_relative),
    db: Session = Depends(get_db),
):
    try:
        patient = _get_patient_for_relative(current_user, db)
        relative_profile = db.query(RelativeProfile).filter(
            RelativeProfile.user_id == current_user.id
        ).first()

        patient_user = db.query(User).filter(User.id == patient.user_id).first()

        # Active medical course
        active_course = db.query(MedicalCourse).filter(
            MedicalCourse.patient_id == patient.id,
            MedicalCourse.status == "ACTIVE",
        ).first()

        course_data = None
        medications_today = []

        if active_course:
            try:
                start = datetime.strptime(active_course.start_date, "%Y-%m-%d")
                end = datetime.strptime(active_course.end_date, "%Y-%m-%d")
                today = datetime.utcnow()
                total_days = max((end - start).days, 1)
                elapsed_days = max((today - start).days, 0)
                progress_pct = min(round((elapsed_days / total_days) * 100), 100)
            except Exception:
                progress_pct = 0

            doctor_profile = db.query(DoctorProfile).filter(
                DoctorProfile.id == active_course.doctor_id
            ).first()
            doctor_user = None
            if doctor_profile:
                doctor_user = db.query(User).filter(
                    User.id == doctor_profile.user_id
                ).first()

            course_data = {
                "course_id": active_course.id,
                "course_name": active_course.course_name,
                "condition": active_course.condition_type.value,
                "doctor_name": doctor_user.full_name if doctor_user else "Your Doctor",
                "start_date": active_course.start_date,
                "end_date": active_course.end_date,
                "progress_pct": progress_pct,
                "notes": active_course.notes_for_patient,
            }

            meds = db.query(Medication).filter(
                Medication.course_id == active_course.id,
                Medication.is_active == True,
            ).all()
            medications_today = [
                {
                    "id": m.id,
                    "name": m.name,
                    "dosage": m.dosage,
                    "frequency": m.frequency,
                    "time_of_day": m.time_of_day,
                    "instructions": m.special_instructions,
                }
                for m in meds
            ]

        # Latest risk score
        latest_score = db.query(RiskScore).filter(
            RiskScore.patient_id == patient.id
        ).order_by(RiskScore.created_at.desc()).first()

        health_status = {
            "GREEN": "Doing Well",
            "YELLOW": "Needs Attention",
            "ORANGE": "Monitor Closely",
            "RED": "Doctor Has Been Notified",
            "EMERGENCY": "Emergency — Help Is On The Way",
        }.get(latest_score.tier.value if latest_score else "GREEN", "Doing Well")

        # Last check-in
        last_checkin = db.query(CheckIn).filter(
            CheckIn.patient_id == patient.id
        ).order_by(CheckIn.created_at.desc()).first()

        # Unread messages
        unread_count = db.query(DoctorMessage).filter(
            DoctorMessage.patient_id == patient.id,
            DoctorMessage.is_read == False,
        ).count()

        # Pending agent question
        pending_session = db.query(AgentSession).filter(
            AgentSession.patient_id == patient.id,
            AgentSession.status == "active",
            AgentSession.pending_question != None,
        ).order_by(AgentSession.created_at.desc()).first()

        pending_q = None
        if pending_session:
            pending_q = {
                "session_id": pending_session.id,
                "question": pending_session.pending_question,
                "options": pending_session.pending_options,
                "trigger": pending_session.trigger,
            }

        # Recent check-ins
        recent_check_ins = []
        check_ins = db.query(CheckIn).filter(
            CheckIn.patient_id == patient.id
        ).order_by(CheckIn.created_at.desc()).limit(10).all()
        for c in check_ins:
            score = db.query(RiskScore).filter(
                RiskScore.check_in_id == c.id
            ).first()
            recent_check_ins.append({
                "check_in_id": c.id,
                "created_at": c.created_at.isoformat(),
                "input_type": c.input_type.value,
                "symptom_summary": c.symptom_summary,
                "total_score": float(score.total_score) if score else None,
                "tier": score.tier.value if score else None,
            })

        # Wound history
        wound_history = []
        wounds = db.query(WoundAnalysis).filter(
            WoundAnalysis.patient_id == patient.id
        ).order_by(WoundAnalysis.created_at.desc()).limit(10).all()
        for w in wounds:
            wound_history.append({
                "id": w.id,
                "uploaded_at": w.created_at.isoformat(),
                "thumbnail_url": w.image_url,
                "score": float(w.wound_score or 0),
                "status": w.severity.value if w.severity else "NORMAL",
            })

        # Care team
        care_team = []
        if active_course:
            doctor_profile = db.query(DoctorProfile).filter(
                DoctorProfile.id == active_course.doctor_id
            ).first()
            if doctor_profile:
                doctor_user = db.query(User).filter(User.id == doctor_profile.user_id).first()
                if doctor_user:
                    care_team.append({
                        "name": doctor_user.full_name,
                        "role": "Doctor",
                        "specialty": doctor_profile.specialization,
                    })

        # Recovery trend (last 7 check-ins with progress %)
        recovery_trend = []
        course_checkins = db.query(CheckIn).filter(
            CheckIn.patient_id == patient.id,
            CheckIn.course_id == active_course.id if active_course else None,
        ).order_by(CheckIn.created_at.asc()).limit(30).all() if active_course else []
        if active_course and course_checkins:
            try:
                start = datetime.strptime(active_course.start_date, "%Y-%m-%d")
                end = datetime.strptime(active_course.end_date, "%Y-%m-%d")
                total_days = max((end - start).days, 1)
                for c in course_checkins:
                    elapsed = max((c.created_at - start).days, 0)
                    recovery_trend.append({
                        "date": c.created_at.isoformat(),
                        "progress_pct": min(round((elapsed / total_days) * 100), 100),
                        "score": None,
                    })
            except Exception:
                recovery_trend = []

        # Medication adherence from medication taken status
        medication_adherence = {"taken": 0, "missed": 0, "total": 0}
        if active_course:
            meds_for_adherence = db.query(Medication).filter(
                Medication.course_id == active_course.id,
                Medication.is_active == True,
            ).all()
            for m in meds_for_adherence:
                medication_adherence["total"] += 1
                if m.taken:
                    medication_adherence["taken"] += 1
                else:
                    medication_adherence["missed"] += 1

        # Symptom trend (last 7 check-ins)
        symptom_trend = []
        trend_checkins = db.query(CheckIn).filter(
            CheckIn.patient_id == patient.id
        ).order_by(CheckIn.created_at.desc()).limit(7).all()
        for c in trend_checkins:
            score = db.query(RiskScore).filter(RiskScore.check_in_id == c.id).first()
            symptom_trend.append({
                "date": c.created_at.isoformat(),
                "symptom_severity": float(score.total_score) if score else 0,
                "risk_score": float(score.total_score) if score else 0,
            })

        # Risk score history (last 7)
        risk_score_history = []
        scores = db.query(RiskScore).filter(
            RiskScore.patient_id == patient.id
        ).order_by(RiskScore.created_at.desc()).limit(7).all()
        for s in scores:
            risk_score_history.append({
                "date": s.created_at.isoformat(),
                "score": float(s.total_score),
                "tier": s.tier.value,
            })

        # Upcoming appointments (empty for now - no appointments table yet)
        upcoming_appointments = []

        return RelativeDashboardResponse(
            patient_id=patient.id,
            full_name=patient_user.full_name if patient_user else "Patient",
            unique_uid=patient_user.unique_uid if patient_user else "",
            health_status=health_status,
            active_course=course_data,
            medications_today=medications_today,
            last_check_in=last_checkin.created_at.isoformat() if last_checkin else None,
            unread_messages=unread_count,
            pending_question=pending_q,
            emergency_contact_phone=patient.emergency_contact_phone,
            risk_tier=latest_score.tier.value if latest_score else "GREEN",
            risk_score=float(latest_score.total_score) if latest_score else 0.0,
            recent_check_ins=recent_check_ins,
            wound_history=wound_history,
            care_team=care_team,
            recovery_trend=recovery_trend if recovery_trend else None,
            medication_adherence=medication_adherence if medication_adherence["total"] > 0 else None,
            symptom_trend=symptom_trend,
            risk_score_history=risk_score_history,
            upcoming_appointments=upcoming_appointments,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Relative dashboard error: {e}")
        return JSONResponse(status_code=200, content={
            "patient_id": None, "full_name": "", "unique_uid": "",
            "health_status": "Doing Well", "active_course": None,
            "medications_today": [], "last_check_in": None,
            "unread_messages": 0, "pending_question": None,
            "emergency_contact_phone": None, "risk_tier": "GREEN",
            "risk_score": 0.0, "recent_check_ins": [], "wound_history": [], "care_team": [],
            "recovery_trend": None, "medication_adherence": None,
            "symptom_trend": [], "risk_score_history": [], "upcoming_appointments": [],
        })
