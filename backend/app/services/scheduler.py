"""
Scheduled Check-In Scheduler
Manages automatic daily check-in triggers (09:00 and 20:00 IST),
missed check-in email alerts (10:00 and 21:00 IST), and on-demand demo triggers.
"""
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal
from app.models.models import (
    PatientProfile, User, MedicalCourse, CheckIn, InputType,
    PendingCheckIn, AgentSession,
)
from app.services.email_service import send_missed_checkin_email

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone="UTC")


def _create_checkin_and_pending_db(patient_id: str, db: Session) -> Optional[PendingCheckIn]:
    """Helper to atomically create a CheckIn and PendingCheckIn record."""
    try:
        check_in = CheckIn(
            patient_id=patient_id,
            input_type=InputType.AGENT,
            raw_input="Scheduled automated health check-in triggered",
        )
        db.add(check_in)
        db.flush()

        now = datetime.now(timezone.utc)
        pending = PendingCheckIn(
            patient_id=patient_id,
            scheduled_time=now,
            check_in_id=check_in.id,
            triggered=False,
        )
        db.add(pending)
        db.commit()
        db.refresh(pending)
        logger.info(f"[SchedulerService] Pending check-in created for patient {patient_id}, pending_id={pending.id}, check_in_id={check_in.id}")
        return pending
    except Exception as exc:
        db.rollback()
        logger.error(f"[SchedulerService] Failed to create pending check-in for patient {patient_id}: {exc}")
        return None


async def trigger_daily_checkins():
    """
    Runs at 09:00 and 20:00 IST.
    Finds all active patients (with active medical courses) and creates a pending check-in record.
    """
    logger.info("[SchedulerService] Running daily scheduled check-in trigger...")
    db: Session = SessionLocal()
    try:
        active_courses = db.query(MedicalCourse).filter(
            MedicalCourse.status == "ACTIVE"
        ).all()

        patient_ids = set()
        for course in active_courses:
            if course.patient_id:
                patient_ids.add(course.patient_id)

        logger.info(f"[SchedulerService] Found {len(patient_ids)} active patient(s) for daily check-in")
        for patient_id in patient_ids:
            _create_checkin_and_pending_db(patient_id, db)
    except Exception as exc:
        logger.error(f"[SchedulerService] Error in trigger_daily_checkins: {exc}")
    finally:
        db.close()


async def check_missed_checkins():
    """
    Runs at 10:00 and 21:00 IST (1 hour after scheduled check-in times).
    Queries pending_check_ins where triggered = False and scheduled_time is > 1 hour old.
    If no agent_sessions exists for the check-in, sends a reminder email to the patient.
    """
    logger.info("[SchedulerService] Checking for missed check-ins...")
    now = datetime.now(timezone.utc)
    one_hour_ago = now - timedelta(hours=1)

    db: Session = SessionLocal()
    try:
        pending_list = db.query(PendingCheckIn).filter(
            PendingCheckIn.triggered == False,
            PendingCheckIn.scheduled_time <= one_hour_ago,
        ).all()

        logger.info(f"[SchedulerService] Found {len(pending_list)} un-triggered pending check-in(s) past grace period")
        for pending in pending_list:
            patient_id = pending.patient_id
            check_in_id = pending.check_in_id

            # Check if patient started a session for this check-in
            session_exists = False
            if check_in_id:
                session_exists = db.query(AgentSession).filter(
                    AgentSession.check_in_id == check_in_id
                ).first() is not None

            if not session_exists:
                # Patient missed the check-in
                patient_profile = db.query(PatientProfile).filter(
                    PatientProfile.id == patient_id
                ).first()
                if patient_profile:
                    patient_user = db.query(User).filter(
                        User.id == patient_profile.user_id
                    ).first()
                    if patient_user and patient_user.email:
                        logger.info(f"[SchedulerService] Sending missed check-in email to {patient_user.email}")
                        await send_missed_checkin_email(
                            patient_email=patient_user.email,
                            patient_name=patient_user.full_name,
                        )

            # Mark as triggered/processed
            pending.triggered = True
            db.commit()

    except Exception as exc:
        db.rollback()
        logger.error(f"[SchedulerService] Error in check_missed_checkins: {exc}")
    finally:
        db.close()


async def trigger_delayed_checkin(patient_id: str, delay_seconds: int = 0):
    """
    Schedules/creates a pending check-in for a patient after delay_seconds (for doctor demo).
    """
    if delay_seconds > 0:
        logger.info(f"[SchedulerService] Waiting {delay_seconds} seconds before triggering check-in for patient {patient_id}...")
        await asyncio.sleep(delay_seconds)

    db: Session = SessionLocal()
    try:
        pending = _create_checkin_and_pending_db(patient_id, db)
        return pending
    finally:
        db.close()


def start_services_scheduler():
    """Start all cron and interval jobs."""
    try:
        # Schedule 09:00 and 20:00 IST daily check-ins
        # IST is UTC+5:30 -> 09:00 IST = 03:30 UTC, 20:00 IST = 14:30 UTC
        scheduler.add_job(
            trigger_daily_checkins,
            trigger=CronTrigger(hour="3,14", minute=30, timezone="UTC"),
            id="daily_checkins_09_20_ist",
            name="Trigger 09:00 and 20:00 IST daily patient check-ins",
            replace_existing=True,
        )

        # Schedule 10:00 and 21:00 IST missed check-in reminders
        # 10:00 IST = 04:30 UTC, 21:00 IST = 15:30 UTC
        scheduler.add_job(
            check_missed_checkins,
            trigger=CronTrigger(hour="4,15", minute=30, timezone="UTC"),
            id="missed_checkins_10_21_ist",
            name="Check missed patient check-ins 1h after schedule",
            replace_existing=True,
        )

        if not scheduler.running:
            scheduler.start()
            logger.info("[SchedulerService] Background scheduler started successfully")
    except Exception as exc:
        logger.error(f"[SchedulerService] Failed to start scheduler: {exc}")


def stop_services_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("[SchedulerService] Background scheduler stopped")
