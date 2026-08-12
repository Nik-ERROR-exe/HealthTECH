"""
CARENETRA — Check-In Trigger & Pending Status Router
Provides endpoints for triggering demo check-ins and retrieving pending check-ins.
"""
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.dependencies import get_current_patient
from app.models.models import PatientProfile, PendingCheckIn, CheckIn, InputType
from app.services.scheduler import trigger_delayed_checkin

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/checkin",
    tags=["Check-In"],
)


class TriggerCheckinRequest(BaseModel):
    patient_id: str
    delay_seconds: Optional[int] = 0


@router.post("/trigger")
async def trigger_checkin(
    req: TriggerCheckinRequest,
    db: Session = Depends(get_db),
):
    """
    Doctor Demo Trigger Endpoint:
    Triggers a check-in for a patient immediately or after delay_seconds.
    """
    patient = db.query(PatientProfile).filter(PatientProfile.id == req.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient profile not found")

    delay = req.delay_seconds or 0
    now = datetime.now(timezone.utc)

    if delay > 0:
        asyncio.create_task(trigger_delayed_checkin(req.patient_id, delay))
        scheduled_time = (now + datetime.resolution * (delay * 1000000)).isoformat() if hasattr(datetime, 'resolution') else (now).isoformat()
        logger.info(f"[CheckinRouter] Scheduled delayed check-in for patient {req.patient_id} in {delay} seconds")
        return {
            "success": True,
            "scheduled_at": now.isoformat(),
            "message": f"Check-in scheduled to trigger in {delay} seconds",
        }
    else:
        pending = await trigger_delayed_checkin(req.patient_id, 0)
        return {
            "success": True,
            "scheduled_at": now.isoformat(),
            "checkInId": pending.check_in_id if pending else None,
            "message": "Check-in triggered immediately",
        }


@router.get("/pending")
async def get_pending_checkin(
    current_patient: PatientProfile = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    """
    Patient Polling Endpoint:
    Checks if current authenticated patient has a pending un-triggered check-in.
    Automatically marks retrieved check-in as triggered to prevent duplicate alerts.
    """
    pending = (
        db.query(PendingCheckIn)
        .filter(
            PendingCheckIn.patient_id == current_patient.id,
            PendingCheckIn.triggered == False,
        )
        .order_by(PendingCheckIn.created_at.desc())
        .first()
    )

    if not pending:
        return {"hasPending": False}

    # Ensure linked check_in record exists
    check_in_id = pending.check_in_id
    if not check_in_id:
        check_in = CheckIn(
            patient_id=current_patient.id,
            input_type=InputType.AGENT,
            raw_input="Pending scheduled check-in",
        )
        db.add(check_in)
        db.flush()
        pending.check_in_id = check_in.id
        check_in_id = check_in.id

    # Mark as triggered = True so subsequent polling queries will not re-fetch it
    pending.triggered = True
    db.commit()

    return {
        "hasPending": True,
        "checkInId": str(check_in_id),
        "patientId": str(current_patient.id),
        "pendingId": str(pending.id),
    }


@router.post("/consume/{pending_id}")
async def consume_pending_checkin(
    pending_id: str,
    current_patient: PatientProfile = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    """
    Explicitly marks a pending check-in as triggered/consumed.
    """
    pending = (
        db.query(PendingCheckIn)
        .filter(
            PendingCheckIn.id == pending_id,
            PendingCheckIn.patient_id == current_patient.id,
        )
        .first()
    )
    if pending:
        pending.triggered = True
        db.commit()
    return {"success": True}


@router.post("/consume")
async def consume_all_pending_checkins(
    current_patient: PatientProfile = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    """
    Marks all pending check-ins for current patient as triggered/consumed.
    """
    db.query(PendingCheckIn).filter(
        PendingCheckIn.patient_id == current_patient.id,
        PendingCheckIn.triggered == False,
    ).update({"triggered": True})
    db.commit()
    return {"success": True}

