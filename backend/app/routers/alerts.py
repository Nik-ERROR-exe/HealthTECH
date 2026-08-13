"""
CARENETRA — Alerts & Emergency Dispatch Router
Provides endpoints for doctor monitoring of pending emergency alerts and ambulance dispatch.
"""
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.dependencies import get_current_user, require_doctor
from app.models.models import Alert, DoctorProfile, PatientProfile, User, AlertStatus, AlertType

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/alerts",
    tags=["Alerts"],
)


class DispatchAlertRequest(BaseModel):
    alert_id: str
    notes: Optional[str] = "Ambulance dispatched via Doctor Dashboard"


@router.get("/pending")
async def get_pending_alerts(
    current_user: User = Depends(require_doctor),
    db: Session = Depends(get_db),
):
    """
    Doctor Pending Alerts Polling Endpoint:
    Returns only NEW emergency alerts (status = PENDING, notified_at IS NULL).
    After fetching, stamps notified_at = NOW() so the same alert is never returned again.
    """
    doctor = db.query(DoctorProfile).filter(DoctorProfile.user_id == current_user.id).first()
    if not doctor:
        raise HTTPException(status_code=403, detail="Doctor profile not found")

    # Fetch only alerts that are PENDING and have NOT been notified yet
    pending_alerts = (
        db.query(Alert)
        .filter(
            Alert.status == AlertStatus.PENDING,
            Alert.notified_at == None,
            (Alert.doctor_id == doctor.id) | (Alert.doctor_id == None),
        )
        .order_by(Alert.created_at.desc())
        .all()
    )

    # Mark them as notified so they won't be returned on the next poll
    now = datetime.now(timezone.utc)
    for alert in pending_alerts:
        alert.notified_at = now
    db.commit()

    result = []
    for alert in pending_alerts:
        patient = db.query(PatientProfile).filter(PatientProfile.id == alert.patient_id).first()
        patient_user = db.query(User).filter(User.id == patient.user_id).first() if patient else None

        phone = None
        if patient:
            phone = patient.emergency_contact_phone
        if not phone and patient_user:
            phone = getattr(patient_user, "phone", None)

        result.append({
            "alert_id": str(alert.id),
            "patient_id": str(alert.patient_id),
            "patient_name": patient_user.full_name if patient_user else "Unknown Patient",
            "patient_phone": phone or "N/A",
            "risk_tier": alert.alert_type.value if hasattr(alert.alert_type, "value") else str(alert.alert_type or "EMERGENCY"),
            "summary": alert.message or "Emergency alert triggered",
            "created_at": alert.created_at.isoformat() if alert.created_at else now.isoformat(),
        })

    return result


@router.post("/dispatch")
async def dispatch_ambulance(
    req: DispatchAlertRequest,
    current_user: User = Depends(require_doctor),
    db: Session = Depends(get_db),
):
    """
    Dispatch Ambulance Endpoint:
    Updates alert status to DISPATCHED and logs doctor confirmation details.
    """
    alert = db.query(Alert).filter(Alert.id == req.alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    now = datetime.now(timezone.utc)
    alert.status = AlertStatus.DISPATCHED
    alert.resolved_at = now
    alert.notified_at = alert.notified_at or now
    alert.dispatch_confirmed_by = current_user.full_name
    alert.dispatch_confirmed_at = now
    alert.ambulance_response = req.notes or "Ambulance dispatched"

    db.commit()
    logger.info(f"[AlertsRouter] Ambulance dispatched for alert {alert.id} by {current_user.full_name}")

    return {
        "success": True,
        "message": f"Ambulance dispatched for alert {alert.id}",
        "alert_id": str(alert.id),
    }


@router.post("/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    current_user: User = Depends(require_doctor),
    db: Session = Depends(get_db),
):
    """
    Acknowledge/Dismiss Alert Endpoint:
    Marks alert status as ACKNOWLEDGED and ensures notified_at is set.
    """
    alert = db.query(Alert).filter(Alert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    now = datetime.now(timezone.utc)
    alert.status = AlertStatus.ACKNOWLEDGED
    alert.resolved_at = now
    alert.notified_at = alert.notified_at or now
    db.commit()

    return {"success": True, "alert_id": str(alert.id)}
