"""
Email Service
Provides helper functions for sending missed check-in reminders and emergency email alerts.
Integrates with Brevo via services.alert_service.send_email_alert.
"""
import os
import logging
from typing import Optional
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.models import MedicalCourse, DoctorProfile, User, PatientProfile
from services.alert_service import send_email_alert

logger = logging.getLogger(__name__)


async def send_missed_checkin_email(
    patient_email: str,
    patient_name: str,
    frontend_url: str = None,
) -> bool:
    """
    Sends a reminder email to a patient who missed their scheduled check-in window.
    """
    base_url = frontend_url or settings.FRONTEND_URL
    checkin_link = f"{base_url}/checkin?autostart=true"
    subject = "CARENETRA — Missed Scheduled Health Check-In"

    body = (
        f"<p>Hi {patient_name},</p>"
        f"<p>We noticed you missed your scheduled health check-in window today.</p>"
        f"<p>Regular check-ins help your care team track your post-surgical recovery and catch any concerns early.</p>"
        f"<p style=\"margin:24px 0;\">"
        f"<a href=\"{checkin_link}\" style=\"display:inline-block;background:#00C896;color:#ffffff;"
        f"padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;\">"
        f"Complete Health Check-In Now</a></p>"
        f"<p style=\"color:#666;font-size:12px;\">If button doesn't work, open: "
        f"<a href=\"{checkin_link}\">{checkin_link}</a></p>"
    )

    try:
        success = await send_email_alert(
            to_email=patient_email,
            to_name=patient_name,
            subject=subject,
            body=body,
        )
        if success:
            logger.info(f"[EmailService] Missed check-in email sent to {patient_email}")
        return success
    except Exception as e:
        logger.error(f"[EmailService] Failed to send missed check-in email to {patient_email}: {e}")
        return False


async def send_emergency_alert_email(
    patient_id: str,
    patient_name: str = "Patient",
    alert_message: str = "Emergency condition detected during check-in",
    db: Optional[Session] = None,
) -> bool:
    """
    Sends emergency alert emails to:
      1. DEMO_EMERGENCY_EMAIL (always included for testing/hackathon demo)
      2. Assigned Doctor Email (joined via active MedicalCourse -> DoctorProfile -> User)
      3. Patient's Emergency Contact Email (from PatientProfile)
    """
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True

    demo_email = settings.DEMO_EMERGENCY_EMAIL or os.getenv("DEMO_EMERGENCY_EMAIL", "")
    recipients = []
    if demo_email:
        recipients.append(demo_email)

    doctor_email = None
    emergency_contact_email = None

    try:
        # 1. Fetch active medical course & assigned doctor's email
        course = db.query(MedicalCourse).filter(
            MedicalCourse.patient_id == patient_id,
            MedicalCourse.status == "ACTIVE"
        ).first()

        if course and course.doctor_id:
            doctor = db.query(DoctorProfile).filter(DoctorProfile.id == course.doctor_id).first()
            if doctor:
                doctor_user = db.query(User).filter(User.id == doctor.user_id).first()
                if doctor_user and doctor_user.email:
                    doctor_email = doctor_user.email
                    recipients.append(doctor_email)
                else:
                    logger.warning(f"[EmailService] Doctor user or email missing for doctor_id {course.doctor_id}")
            else:
                logger.warning(f"[EmailService] Doctor profile missing for doctor_id {course.doctor_id}")
        else:
            logger.warning(f"[EmailService] No active medical course found for patient_id {patient_id}")

        # 2. Fetch patient profile & emergency contact email
        patient_profile = db.query(PatientProfile).filter(PatientProfile.id == patient_id).first()
        if patient_profile:
            if patient_profile.emergency_contact_email:
                emergency_contact_email = patient_profile.emergency_contact_email
                recipients.append(emergency_contact_email)
            else:
                logger.warning(f"[EmailService] Emergency contact email missing for patient_id {patient_id}")
        else:
            logger.warning(f"[EmailService] Patient profile not found for patient_id {patient_id}")

    except Exception as exc:
        logger.warning(f"[EmailService] Error resolving emergency alert recipients for patient {patient_id}: {exc}")
    finally:
        if close_db:
            db.close()

    # Deduplicate recipients
    unique_recipients = list(set([r.strip() for r in recipients if r and r.strip()]))
    if not unique_recipients and demo_email:
        unique_recipients = [demo_email]

    subject = f"[EMERGENCY ALERT] CARENETRA Emergency Alert for {patient_name}"
    body = (
        f"<h3 style=\"color: #e11d48;\">EMERGENCY HEALTH ALERT</h3>"
        f"<p><strong>Patient Name:</strong> {patient_name}</p>"
        f"<p><strong>Alert Message:</strong> {alert_message}</p>"
        f"<p>An urgent emergency condition or distress signal was detected during the patient's check-in. "
        f"Immediate clinical or personal attention is recommended.</p>"
        f"<p style=\"margin:24px 0;\">"
        f"<a href=\"{settings.FRONTEND_URL}/doctor/dashboard\" style=\"display:inline-block;background:#e11d48;color:#ffffff;"
        f"padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;\">"
        f"Open Doctor Dashboard</a></p>"
    )

    sent_any = False
    for email in unique_recipients:
        try:
            logger.info(f"[EmailService] Dispatching emergency alert email to recipient: {email}")
            is_demo = (email == demo_email)
            ok = await send_email_alert(
                to_email=email,
                to_name="Emergency Recipient",
                subject=subject,
                body=body,
                override_demo=not is_demo,
            )
            if ok:
                sent_any = True
                logger.info(f"[EmailService] Emergency alert successfully sent to {email}")
            else:
                logger.warning(f"[EmailService] Failed sending emergency alert to {email}")
        except Exception as exc:
            logger.error(f"[EmailService] Exception sending emergency alert to {email}: {exc}")

    return sent_any


async def send_emergency_notification(
    patient_name: str,
    emergency_contact_email: Optional[str] = None,
    doctor_email: Optional[str] = None,
    alert_message: str = "Emergency health alert",
    patient_id: Optional[str] = None,
    db: Optional[Session] = None,
) -> bool:
    """
    Sends emergency notifications to DEMO_EMERGENCY_EMAIL, patient's emergency contact, and doctor.
    """
    if patient_id:
        return await send_emergency_alert_email(
            patient_id=patient_id,
            patient_name=patient_name,
            alert_message=alert_message,
            db=db,
        )

    demo_email = settings.DEMO_EMERGENCY_EMAIL or os.getenv("DEMO_EMERGENCY_EMAIL", "")
    recipients = []
    if demo_email:
        recipients.append(demo_email)
    if doctor_email:
        recipients.append(doctor_email)
    if emergency_contact_email:
        recipients.append(emergency_contact_email)

    unique_recipients = list(set([r.strip() for r in recipients if r and r.strip()]))
    if not unique_recipients and demo_email:
        unique_recipients = [demo_email]

    subject = f"[EMERGENCY ALERT] CARENETRA Emergency Alert for {patient_name}"
    body = (
        f"<h3 style=\"color: #e11d48;\">EMERGENCY HEALTH ALERT</h3>"
        f"<p><strong>Patient Name:</strong> {patient_name}</p>"
        f"<p><strong>Alert Message:</strong> {alert_message}</p>"
        f"<p>An urgent emergency condition or distress signal was detected during the patient's check-in. "
        f"Immediate clinical or personal attention is recommended.</p>"
        f"<p style=\"margin:24px 0;\">"
        f"<a href=\"{settings.FRONTEND_URL}/doctor/dashboard\" style=\"display:inline-block;background:#e11d48;color:#ffffff;"
        f"padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:bold;\">"
        f"Open Doctor Dashboard</a></p>"
    )

    sent_any = False
    for email in unique_recipients:
        try:
            logger.info(f"[EmailService] Dispatching emergency notification email to: {email}")
            is_demo = (email == demo_email)
            ok = await send_email_alert(
                to_email=email,
                to_name="Emergency Alert Recipient",
                subject=subject,
                body=body,
                override_demo=not is_demo,
            )
            if ok:
                sent_any = True
                logger.info(f"[EmailService] Emergency alert successfully sent to {email}")
        except Exception as exc:
            logger.error(f"[EmailService] Failed sending emergency alert to {email}: {exc}")

    return sent_any
