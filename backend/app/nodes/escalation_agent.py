"""
Node 4 — Escalation Decision Agent
Reads risk tier and decides what action to take.
Saves alert record and triggers notification services.

Tier → Action mapping:
  GREEN     (0–25)   → none (no action)
  YELLOW    (26–50)  → nudge patient (agent session nudge)
  ORANGE    (51–75)  → notify doctor on dashboard + email
  RED       (76–90)  → SMS + email to doctor AND emergency contact
  EMERGENCY (91–100) → create pending ambulance dispatch alert
"""
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.agents.state import AgentState
from app.config import settings
from app.database import SessionLocal
from app.models.models import (
    Alert, AlertType, AlertStatus,
    PatientProfile, DoctorProfile, MedicalCourse, User,
)
from services.alert_service import send_email_alert, send_sms_alert

logger = logging.getLogger(__name__)


def _build_alert_message(tier: str, state: AgentState) -> str:
    score   = state.get("total_score", 0)
    summary = state.get("symptom_summary", "No symptoms reported.")

    templates = {
        "YELLOW":    f"Patient check-in flagged for attention. Risk score: {score}/100. {summary}",
        "ORANGE":    f"ALERT: Patient health monitoring requires your review. Risk score: {score}/100. Symptoms: {summary}",
        "RED":       f"HIGH RISK ALERT: Patient requires immediate attention. Risk score: {score}/100. Symptoms: {summary}",
        "EMERGENCY": f"EMERGENCY: Patient risk score is {score}/100. Immediate intervention required. {summary}",
    }
    return templates.get(tier, f"Patient risk score: {score}/100.")


def _resolve_emergency_contact_phone(patient_phone: str | None, tier: str) -> str | None:
    """
    Demo override for RED/EMERGENCY escalations: route the emergency-contact SMS
    to the hackathon presenter's phone (DEMO_EMERGENCY_PHONE_NUMBER) when set,
    "instead of dialing real emergency services". Falls back to the patient's real
    emergency contact when unset. (Email override is handled globally in
    `send_email_alert` via DEMO_EMERGENCY_EMAIL.)
    """
    if tier in ("RED", "EMERGENCY") and settings.DEMO_EMERGENCY_PHONE_NUMBER:
        return settings.DEMO_EMERGENCY_PHONE_NUMBER
    return patient_phone


def _build_alert_email_html(state: AgentState, patient_name: str) -> str:
    """
    Rich HTML alert email body: patient name, risk tier, red-flag symptoms, and a
    deep-link CTA straight into the check-in UI.
    """
    tier     = state.get("tier", "GREEN")
    score    = state.get("total_score", 0)
    symptoms = state.get("symptom_summary") or "No symptoms reported."
    sid      = state.get("session_id")
    link     = f"{settings.FRONTEND_URL}/checkin?session_id={sid}&autostart=true" if sid \
               else f"{settings.FRONTEND_URL}/checkin?autostart=true"
    button = (
        f'<a href="{link}" style="display:inline-block;background:#00C896;color:#ffffff;'
        f'padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;">'
        f'Open Patient Check-in</a>'
    )
    return (
        f"<p><strong>{patient_name}</strong> — Risk tier: {tier} ({score}/100)</p>"
        f"<p><strong>Red-flag symptoms:</strong> {symptoms}</p>"
        f'<p style="margin:24px 0;">{button}</p>'
    )


async def escalation_agent_node(state: AgentState) -> AgentState:
    """
    Decides escalation action based on risk tier.
    Creates alert record. Triggers email/SMS as appropriate.
    """
    logger.info(f"[EscalationAgent] Tier={state.get('tier')} for patient {state['patient_id']}")
    errors        = list(state.get("errors", []))
    tier          = state.get("tier", "GREEN")
    total_score   = state.get("total_score", 0.0)
    risk_score_id = state.get("risk_score_id")

    # GREEN → no action needed
    if tier == "GREEN":
        logger.info("[EscalationAgent] GREEN — no escalation needed")
        return {
            **state,
            "escalation_action": "none",
            "alert_id":          None,
            "alert_message":     None,
            "errors":            errors,
        }

    # ── Map tier to alert type ────────────────────────────────────
    tier_to_alert_type = {
        "YELLOW":    AlertType.NUDGE,
        "ORANGE":    AlertType.DOCTOR,
        "RED":       AlertType.CRITICAL,
        "EMERGENCY": AlertType.EMERGENCY,
    }
    tier_to_action = {
        "YELLOW":    "nudge",
        "ORANGE":    "notify_doctor",
        "RED":       "critical_alert",
        "EMERGENCY": "emergency",
    }

    alert_type = tier_to_alert_type.get(tier, AlertType.NUDGE)
    action     = tier_to_action.get(tier, "nudge")
    message    = _build_alert_message(tier, state)

    # ── Load doctor info from DB ──────────────────────────────────
    doctor_id    = None
    doctor_email = None
    doctor_phone = None
    doctor_name  = None
    patient_name = None
    emergency_contact_phone = None
    emergency_contact_email = None

    db: Session = SessionLocal()
    try:
        # Get patient profile
        patient_profile = db.query(PatientProfile).filter(
            PatientProfile.id == state["patient_id"]
        ).first()

        if patient_profile:
            patient_user = db.query(User).filter(
                User.id == patient_profile.user_id
            ).first()
            patient_name            = patient_user.full_name if patient_user else "Patient"
            emergency_contact_phone = _resolve_emergency_contact_phone(
                patient_profile.emergency_contact_phone, tier
            )
            emergency_contact_email = patient_profile.emergency_contact_email

        # Get assigned doctor via active medical course
        active_course = db.query(MedicalCourse).filter(
            MedicalCourse.patient_id == state["patient_id"],
            MedicalCourse.status     == "ACTIVE",
        ).first()

        if active_course and active_course.doctor_id:
            doctor_profile = db.query(DoctorProfile).filter(
                DoctorProfile.id == active_course.doctor_id
            ).first()
            if doctor_profile:
                doctor_id  = doctor_profile.id
                doctor_user = db.query(User).filter(
                    User.id == doctor_profile.user_id
                ).first()
                if doctor_user:
                    doctor_email = doctor_user.email
                    doctor_name  = doctor_user.full_name
                    doctor_phone = doctor_profile.phone  # may be None for older accounts

        # ── Create alert record ───────────────────────────────────
        alert = Alert(
            patient_id       = state["patient_id"],
            doctor_id        = doctor_id,
            risk_score_id    = risk_score_id,
            alert_type       = alert_type,
            status           = AlertStatus.PENDING,
            message          = message,
            risk_score_value = total_score,
        )
        db.add(alert)
        db.commit()
        db.refresh(alert)
        alert_id = alert.id
        logger.info(f"[EscalationAgent] Created alert {alert_id} type={alert_type.value}")

    except Exception as e:
        db.rollback()
        logger.error(f"[EscalationAgent] DB write failed: {e}")
        errors.append(f"EscalationAgent DB write failed: {e}")
        alert_id = None
    finally:
        db.close()

    # ── Fire notifications based on tier ─────────────────────────

    if tier in ("ORANGE", "RED", "EMERGENCY") and doctor_email:
        try:
            subject = f"[CARENETRA] {'EMERGENCY' if tier == 'EMERGENCY' else 'Patient Alert'} — {patient_name}"
            await send_email_alert(
                to_email         = doctor_email,
                to_name          = doctor_name or "Doctor",
                subject          = subject,
                body             = _build_alert_email_html(state, patient_name),
                wound_image_path = state.get("wound_image_path"),
                wound_summary    = state.get("wound_analysis_summary"),
            )
            # Mark email sent
            _mark_email_sent(alert_id)
            logger.info(f"[EscalationAgent] Email sent to doctor {doctor_email}")
        except Exception as e:
            logger.error(f"[EscalationAgent] Email send failed: {e}")
            errors.append(f"EscalationAgent email failed: {e}")

    if tier in ("RED", "EMERGENCY"):
        # SMS to doctor
        if doctor_phone:
            try:
                await send_sms_alert(
                    to_phone = doctor_phone,
                    body     = f"[CARENETRA ALERT] {patient_name} — Score: {total_score}/100. {message[:100]}",
                )
                logger.info(f"[EscalationAgent] SMS sent to doctor {doctor_phone}")
            except Exception as e:
                logger.error(f"[EscalationAgent] Doctor SMS failed: {e}")
                errors.append(f"EscalationAgent doctor SMS failed: {e}")

        # SMS to emergency contact
        if emergency_contact_phone:
            try:
                await send_sms_alert(
                    to_phone = emergency_contact_phone,
                    body     = f"[CARENETRA] Health alert for {patient_name}. Score: {total_score}/100. Please check on them.",
                )
                logger.info(f"[EscalationAgent] SMS sent to emergency contact")
            except Exception as e:
                logger.error(f"[EscalationAgent] Emergency contact SMS failed: {e}")
                errors.append(f"EscalationAgent emergency contact SMS failed: {e}")

        # Email to emergency contact
        if emergency_contact_email:
            try:
                await send_email_alert(
                    to_email = emergency_contact_email,
                    to_name  = "Emergency Contact",
                    subject  = f"[CARENETRA] Health alert for {patient_name}",
                    body     = _build_alert_email_html(state, patient_name),
                )
            except Exception as e:
                errors.append(f"EscalationAgent emergency email failed: {e}")

        # Trigger dual emergency notification helper
        if tier == "EMERGENCY":
            try:
                from app.services.email_service import send_emergency_notification
                await send_emergency_notification(
                    patient_name=patient_name or "Patient",
                    emergency_contact_email=emergency_contact_email,
                    doctor_email=doctor_email,
                    alert_message=message,
                )
            except Exception as e:
                logger.error(f"[EscalationAgent] send_emergency_notification failed: {e}")

        _mark_sms_sent(alert_id)

    return {
        **state,
        "escalation_action": action,
        "alert_id":          alert_id,
        "alert_message":     message,
        "errors":            errors,
    }


def _mark_email_sent(alert_id: str | None):
    if not alert_id:
        return
    db = SessionLocal()
    try:
        alert = db.query(Alert).filter(Alert.id == alert_id).first()
        if alert:
            alert.email_sent = True
            db.commit()
    finally:
        db.close()


def _mark_sms_sent(alert_id: str | None):
    if not alert_id:
        return
    db = SessionLocal()
    try:
        alert = db.query(Alert).filter(Alert.id == alert_id).first()
        if alert:
            alert.sms_sent = True
            db.commit()
    finally:
        db.close()