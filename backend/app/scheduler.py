"""
Background Monitoring Scheduler
Runs every 1 minute and checks if any patient is overdue for a check-in.
If overdue → creates a pending agent session + sends a deep-link nudge email/SMS.

The 1-minute cadence also makes the doctor "Trigger Check-In (1 Min Demo)" work
deterministically for the hackathon demo.

Integrated into FastAPI lifecycle via startup/shutdown events.
"""
import logging
from datetime import datetime, timezone, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.models import (
    MonitoringSchedule, PatientProfile, AgentSession,
    User, MedicalCourse, Alert, AlertType, AlertStatus,
    ImpactAlert, ImpactAlertStatus, AmbulanceProfile,
)
from services.alert_service import send_email_alert, send_sms_alert
from app.nodes.nurse_agent import start_nurse_session

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="UTC")


async def check_overdue_patients():
    """
    Runs every 1 minute.
    Finds patients whose next_check_in_at is in the past.
    Creates a pending agent session so when they open the app
    the question window pops automatically.
    Also sends a deep-link email/SMS nudge.
    """
    logger.info("[Scheduler] Running overdue patient check...")
    now = datetime.now(timezone.utc)

    db: Session = SessionLocal()
    try:
        overdue_schedules = db.query(MonitoringSchedule).filter(
            MonitoringSchedule.next_check_in_at != None,
            MonitoringSchedule.next_check_in_at <= now,
        ).all()

        if not overdue_schedules:
            logger.info("[Scheduler] No overdue patients found")
            return

        logger.info(f"[Scheduler] Found {len(overdue_schedules)} overdue patient(s)")

        for schedule in overdue_schedules:
            patient_id = schedule.patient_id

            # Check if there's already an active pending session
            existing = db.query(AgentSession).filter(
                AgentSession.patient_id == patient_id,
                AgentSession.status     == "active",
            ).first()
            if existing:
                logger.info(f"[Scheduler] Patient {patient_id} already has active session — skip")
                continue

            # Get patient info
            patient_profile = db.query(PatientProfile).filter(
                PatientProfile.id == patient_id
            ).first()
            if not patient_profile:
                continue

            patient_user = db.query(User).filter(
                User.id == patient_profile.user_id
            ).first()
            if not patient_user:
                continue

            # Check for active course
            active_course = db.query(MedicalCourse).filter(
                MedicalCourse.patient_id == patient_id,
                MedicalCourse.status     == "ACTIVE",
            ).first()
            if not active_course:
                logger.info(f"[Scheduler] Patient {patient_id} has no active course — skip")
                continue

            # ── Create pending agent session (agentic Nurse greeting) ──
            preferred_language = getattr(patient_profile, "preferred_language", "en") or "en"
            try:
                nurse_result = await start_nurse_session(
                    patient_id, active_course.id, db, language=preferred_language
                )
                first_q, convo_state = nurse_result["first_question"], nurse_result["state"]
                session = AgentSession(
                    patient_id       = patient_id,
                    status           = "active",
                    trigger          = "agent_triggered",
                    language         = preferred_language,
                    conversation     = [{
                        "role":       "state",
                        "data":       convo_state,
                        "created_at": now.isoformat(),
                    }],
                    pending_question = first_q.get("question"),
                    pending_options  = first_q.get("options") or [],
                )
            except Exception as exc:
                logger.error(f"[Scheduler] Nurse start failed, using fallback greeting: {exc}")
                session = AgentSession(
                    patient_id       = patient_id,
                    status           = "active",
                    trigger          = "agent_triggered",
                    pending_question = "Time for your daily check-in! How are you feeling today?",
                    pending_options  = [
                        "Feeling good",
                        "Some discomfort",
                        "Not doing well",
                        "I need help",
                    ],
                    conversation = [{
                        "role":    "agent",
                        "content": "Time for your daily check-in! How are you feeling today?",
                        "options": ["Feeling good", "Some discomfort", "Not doing well", "I need help"],
                        "time":    now.isoformat(),
                    }],
                )
            db.add(session)

            # ── Create NUDGE alert ────────────────────────────────
            alert = Alert(
                patient_id       = patient_id,
                alert_type       = AlertType.NUDGE,
                status           = AlertStatus.PENDING,
                message          = f"Automated check-in reminder sent to {patient_user.full_name}",
                risk_score_value = None,
            )
            db.add(alert)
            db.commit()

            logger.info(f"[Scheduler] Created check-in session for {patient_user.full_name}")

            # ── Send email nudge with a deep-link CTA ──────────────
            # The button takes the patient straight into the resumed Nurse chat.
            checkin_link = (
                f"{settings.FRONTEND_URL}/checkin"
                f"?session_id={session.id}&autostart=true"
            )
            cta_button = (
                f'<a href="{checkin_link}" '
                f'style="display:inline-block;background:#00C896;color:#ffffff;'
                f'padding:12px 22px;border-radius:8px;text-decoration:none;'
                f'font-weight:bold;">Start Daily Health Check-In</a>'
            )
            email_body = (
                f"<p>Hi {patient_user.full_name},</p>"
                f"<p>Your health monitoring system is ready for your daily check-in. "
                f"It only takes about 2 minutes and helps your doctor monitor your recovery.</p>"
                f"<p style=\"margin:24px 0;\">{cta_button}</p>"
                f"<p style=\"color:#666;font-size:12px;\">Or copy this link: "
                f"<a href=\"{checkin_link}\">{checkin_link}</a></p>"
            )
            try:
                await send_email_alert(
                    to_email = patient_user.email,
                    to_name  = patient_user.full_name,
                    subject  = "CARENETRA — Time for your daily check-in",
                    body     = email_body,
                )
                logger.info(f"[Scheduler] Nudge email sent to {patient_user.email}")
            except Exception as e:
                logger.error(f"[Scheduler] Email nudge failed for {patient_user.email}: {e}")

            # ── Also notify the caretaker (emergency contact) ───────
            if patient_profile.emergency_contact_email:
                try:
                    await send_email_alert(
                        to_email = patient_profile.emergency_contact_email,
                        to_name  = patient_profile.emergency_contact_name or "Caregiver",
                        subject  = f"CARENETRA — {patient_user.full_name} has a check-in due",
                        body     = email_body,
                    )
                    logger.info(
                        f"[Scheduler] Caretaker nudge email sent to {patient_profile.emergency_contact_email}"
                    )
                except Exception as e:
                    logger.error(f"[Scheduler] Caretaker email nudge failed: {e}")

            # ── Send SMS nudge if emergency contact has phone ─────
            if patient_profile.emergency_contact_phone:
                try:
                    await send_sms_alert(
                        to_phone = patient_profile.emergency_contact_phone,
                        body     = (
                            f"[CARENETRA] Hi, this is a reminder that "
                            f"{patient_user.full_name} has a health check-in due. "
                            f"Please remind them to log in to CARENETRA."
                        ),
                    )
                except Exception as e:
                    logger.error(f"[Scheduler] SMS nudge failed: {e}")

            # ── Push next check-in time out by interval ───────────
            schedule.next_check_in_at = now + timedelta(
                hours=schedule.check_in_interval_hours
            )
            schedule.updated_at = now
            db.commit()

    except Exception as e:
        db.rollback()
        logger.error(f"[Scheduler] Unexpected error: {e}")
    finally:
        db.close()


async def check_ambulance_timeouts():
    """
    Runs every 10 seconds.
    Finds RESPONDING alerts where the 2-minute window has expired.
    Checks if ambulance has moved >= 50m (GPS stuck detection).
    If stuck (moved < 50m after 2 min):
        - Resets alert back to ACTIVE so other ambulances can bid.
        - Broadcasts AMBULANCE_STUCK_TIMEOUT to all ambulances.
        - Sends YOU_ARE_STUCK notification to the stuck ambulance.
    If moving (moved >= 50m):
        - Auto-marks alert as EN_ROUTE since ambulance is en route.
        - Broadcasts ALERT_EN_ROUTE to all ambulances.
    """
    logger.info("[Scheduler] Checking ambulance response timeouts...")
    now = datetime.now(timezone.utc)

    db: Session = SessionLocal()
    try:
        from app.websocket_manager import manager as ws_manager

        # Fetch all alerts currently in RESPONDING status
        responding_alerts = db.query(ImpactAlert).filter(
            ImpactAlert.status == ImpactAlertStatus.RESPONDING,
            ImpactAlert.responded_at != None,
        ).all()

        if not responding_alerts:
            logger.info("[Scheduler] No active responding alerts found")
            return

        for alert in responding_alerts:
            responded_at = alert.responded_at
            if responded_at.tzinfo is None:
                responded_at = responded_at.replace(tzinfo=timezone.utc)

            elapsed_seconds = (now - responded_at).total_seconds()
            logger.info(
                f"[Scheduler] Alert {alert.id}: responder={alert.responder_name}, elapsed={elapsed_seconds:.1f}s"
            )

            # Check if 2-minute window has passed
            if elapsed_seconds < 120:
                continue

            ambulance = db.query(AmbulanceProfile).filter(
                AmbulanceProfile.id == alert.responder_ambulance_id
            ).first()

            if not ambulance:
                logger.warning(f"[Scheduler] Ambulance {alert.responder_ambulance_id} not found, resetting alert")
                alert.status = ImpactAlertStatus.ACTIVE
                alert.responder_ambulance_id = None
                alert.responder_user_id = None
                alert.responder_name = None
                alert.responded_at = None
                db.commit()
                await ws_manager.broadcast({
                    "type": "ALERT_REOPENED",
                    "alert_id": alert.id,
                    "message": "Alert reopened for bidding."
                })
                continue

            # GPS stuck detection: check if ambulance moved >= 50 meters
            stuck = True
            distance_moved = 0.0
            if (
                ambulance.latitude is not None and ambulance.longitude is not None and
                alert.responder_latitude is not None and alert.responder_longitude is not None
            ):
                from geopy.distance import geodesic
                distance_moved = geodesic(
                    (alert.responder_latitude, alert.responder_longitude),
                    (ambulance.latitude, ambulance.longitude)
                ).meters
                stuck = distance_moved < 50.0  # Less than 50 meters = stuck

                logger.info(
                    f"[Scheduler] Ambulance {ambulance.ambulance_name} moved {distance_moved:.1f}m "
                    f"from initial position ({alert.responder_latitude}, {alert.responder_longitude})"
                )

            if stuck:
                stuck_name = alert.responder_name or ambulance.ambulance_name or "Ambulance"
                stuck_user_id = ambulance.user_id
                stuck_amb_id = ambulance.id

                logger.info(
                    f"[Scheduler] TIMEOUT - Ambulance {stuck_name} is stuck "
                    f"(moved {distance_moved:.1f}m < 50m in 2 minutes). Reopening bidding!"
                )

                # Reset alert status to ACTIVE
                alert.status = ImpactAlertStatus.ACTIVE
                alert.responder_ambulance_id = None
                alert.responder_user_id = None
                alert.responder_name = None
                alert.responded_at = None
                alert.responder_latitude = None
                alert.responder_longitude = None
                ambulance.current_status = "available"
                db.commit()

                # 1. Broadcast to ALL ambulances: Ambulance X is not moving forward.
                await ws_manager.broadcast({
                    "type": "AMBULANCE_STUCK_TIMEOUT",
                    "alert_id": alert.id,
                    "stuck_ambulance_id": stuck_amb_id,
                    "stuck_ambulance_name": stuck_name,
                    "message": f"Ambulance {stuck_name} is not moving forward.",
                    "maps_url": alert.maps_url,
                    "latitude": alert.latitude,
                    "longitude": alert.longitude,
                })

                # 2. Targeted alert to the stuck ambulance
                if stuck_user_id:
                    await ws_manager.send_personal_message({
                        "type": "YOU_ARE_STUCK",
                        "alert_id": alert.id,
                        "message": "You are not moving forward. Others will try to reach.",
                        "maps_url": alert.maps_url,
                    }, stuck_user_id)
            else:
                # Ambulance moved forward >= 50m -> Auto mark as EN_ROUTE!
                logger.info(
                    f"[Scheduler] Ambulance {ambulance.ambulance_name} is moving forward ({distance_moved:.1f}m) -> Marking EN ROUTE"
                )
                alert.status = ImpactAlertStatus.EN_ROUTE
                ambulance.current_status = "en_route"
                db.commit()

                await ws_manager.broadcast({
                    "type": "ALERT_EN_ROUTE",
                    "alert_id": alert.id,
                    "responder_name": ambulance.driver_name or ambulance.ambulance_name,
                    "message": f"Ambulance {ambulance.ambulance_name} is moving forward and en route."
                })

    except Exception as e:
        db.rollback()
        logger.error(f"[Scheduler] Error checking ambulance timeouts: {e}")
    finally:
        db.close()


def start_scheduler():
    scheduler.add_job(
        check_overdue_patients,
        trigger  = IntervalTrigger(minutes=1),
        id       = "overdue_check",
        name     = "Check overdue patient check-ins",
        replace_existing = True,
    )
    scheduler.add_job(
        check_ambulance_timeouts,
        trigger  = IntervalTrigger(seconds=10),
        id       = "ambulance_timeout_check",
        name     = "Check expired ambulance response timeouts",
        replace_existing = True,
    )
    scheduler.start()
    logger.info("[Scheduler] Background scheduler started — checking timeouts every 10 seconds")


def stop_scheduler():
    scheduler.shutdown(wait=False)
    logger.info("[Scheduler] Background scheduler stopped")