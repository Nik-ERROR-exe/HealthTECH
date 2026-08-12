"""
Email Service
Provides helper functions for sending missed check-in reminders and emergency email alerts.
Integrates with Brevo via services.alert_service.send_email_alert.
"""
import logging
from app.config import settings
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


async def send_emergency_notification(
    patient_name: str,
    emergency_contact_email: str | None,
    doctor_email: str | None,
    alert_message: str,
) -> bool:
    """
    Sends emergency notifications to both the patient's emergency contact and assigned doctor.
    """
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
    
    if doctor_email:
        try:
            ok = await send_email_alert(
                to_email=doctor_email,
                to_name="Doctor",
                subject=subject,
                body=body,
            )
            if ok:
                sent_any = True
                logger.info(f"[EmailService] Emergency alert sent to doctor {doctor_email}")
        except Exception as e:
            logger.error(f"[EmailService] Failed to email doctor emergency alert: {e}")
            
    if emergency_contact_email:
        try:
            ok = await send_email_alert(
                to_email=emergency_contact_email,
                to_name="Emergency Contact",
                subject=subject,
                body=body,
            )
            if ok:
                sent_any = True
                logger.info(f"[EmailService] Emergency alert sent to emergency contact {emergency_contact_email}")
        except Exception as e:
            logger.error(f"[EmailService] Failed to email emergency contact alert: {e}")
            
    return sent_any
