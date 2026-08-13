"""
CARENETRA — Ambulance Router
Endpoints for the ambulance user role with bidding timeout mechanism.

Endpoints:
  GET  /ambulance/dashboard          → active alerts + ambulance profile
  POST /ambulance/alerts/{id}/respond → confirm responding to an impact alert
  POST /ambulance/alerts/{id}/en-route → mark as on the way (must be within 2 min)
  GET  /ambulance/profile            → ambulance's own profile
  PUT  /ambulance/availability       → toggle available/unavailable
  POST /ambulance/heartbeat          → update GPS location
"""
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.dependencies import get_current_user, require_ambulance
from app.models.models import (
    User, AmbulanceProfile, ImpactAlert, ImpactAlertStatus,
)
from services.alert_service import send_sms_alert

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/ambulance", tags=["Ambulance"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class HeartbeatRequest(BaseModel):
    latitude:  float
    longitude: float

class RespondAlertRequest(BaseModel):
    latitude:  float | None = None
    longitude: float | None = None


# ── GET /ambulance/dashboard ──────────────────────────────────────────────────

@router.get("/dashboard")
def get_ambulance_dashboard(
    language: str = "en",
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """
    Returns active impact alerts + ambulance's own profile.
    Frontend polls this or receives WebSocket updates.
    """
    profile = require_ambulance(current_user, db)

    # All active alerts (within the last 6 hours)
    expiry_limit = datetime.now(timezone.utc) - timedelta(hours=6)
    
    # Show ACTIVE alerts (open for bidding) + RESPONDING/EN_ROUTE alerts
    alerts = db.query(ImpactAlert).filter(
        ImpactAlert.created_at >= expiry_limit,
        (
            (ImpactAlert.status == ImpactAlertStatus.ACTIVE) |
            (ImpactAlert.status == ImpactAlertStatus.RESPONDING) |
            (ImpactAlert.status == ImpactAlertStatus.EN_ROUTE)
        )
    ).order_by(ImpactAlert.created_at.desc()).all()

    alerts_data = []
    for a in alerts:
        # Is THIS ambulance the responder?
        i_am_responding = (a.responder_ambulance_id == profile.id)
        
        # Calculate time remaining for bidding timeout (2 minutes from responded_at)
        time_remaining = None
        if a.responded_at and a.status == ImpactAlertStatus.RESPONDING:
            responded_time = a.responded_at
            if responded_time.tzinfo is None:
                responded_time = responded_time.replace(tzinfo=timezone.utc)
            timeout_at = responded_time + timedelta(minutes=2)
            time_remaining = max(0, int((timeout_at - datetime.now(timezone.utc)).total_seconds()))

        alerts_data.append({
            "alert_id":         a.id,
            "status":           a.status.value,
            "reported_by":      a.reported_by_name,
            "location_label":   a.location_label,
            "maps_url":         a.maps_url,
            "latitude":         a.latitude,
            "longitude":        a.longitude,
            "responder_name":   a.responder_name,
            "i_am_responding":  i_am_responding,
            "responded_at":     a.responded_at.isoformat() if a.responded_at else None,
            "created_at":       a.created_at.isoformat(),
            "minutes_ago":      int(
                (datetime.now(timezone.utc) - a.created_at).total_seconds() / 60
            ),
            "time_remaining":   time_remaining,
        })

    return {
        "ambulance_name":  current_user.full_name,
        "ambulance_id":    profile.ambulance_name,
        "driver_name":     profile.driver_name,
        "hospital_name":   profile.hospital_name,
        "is_available":    profile.is_available,
        "current_status":  profile.current_status,
        "active_alerts":   alerts_data,
        "alert_count":     len(alerts_data),
    }


# ── POST /ambulance/alerts/{alert_id}/respond ────────────────────────────────

@router.post("/alerts/{alert_id}/respond")
async def respond_to_alert(
    alert_id:     str,
    payload:      RespondAlertRequest = RespondAlertRequest(),
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """
    Ambulance confirms they are responding to an impact alert.
    If another ambulance was already responding, releases them and claims the alert.
    """
    profile = require_ambulance(current_user, db)

    alert = db.query(ImpactAlert).filter(ImpactAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    if alert.status == ImpactAlertStatus.RESOLVED:
        raise HTTPException(status_code=400, detail="Alert already resolved")

    # Update ambulance profile location if passed
    if payload.latitude is not None and payload.longitude is not None:
        profile.latitude = payload.latitude
        profile.longitude = payload.longitude

    # If another ambulance was responding, release them
    if alert.responder_ambulance_id and alert.responder_ambulance_id != profile.id:
        old_responder = db.query(AmbulanceProfile).filter(
            AmbulanceProfile.id == alert.responder_ambulance_id
        ).first()
        if old_responder:
            old_responder.current_status = "available"

    # Claim the alert and record initial response GPS location
    alert.status = ImpactAlertStatus.RESPONDING
    alert.responder_ambulance_id = profile.id
    alert.responder_name = current_user.full_name
    alert.responder_latitude = profile.latitude
    alert.responder_longitude = profile.longitude
    alert.responded_at = datetime.now(timezone.utc)
    
    profile.current_status = "responding"
    db.commit()

    logger.info(
        f"[Ambulance] {current_user.full_name} responding to alert {alert_id} "
        f"from lat={profile.latitude}, lng={profile.longitude}"
    )

    # Broadcast WebSocket update
    try:
        from app.websocket_manager import manager as ws_manager
        await ws_manager.broadcast({
            "type": "ALERT_RESPONDED",
            "alert_id": alert_id,
            "responder_id": profile.id,
            "responder_name": current_user.full_name,
            "message": f"{current_user.full_name} is responding to emergency alert.",
        })
    except Exception as exc:
        logger.error(f"[Ambulance] WS broadcast failed: {exc}")

    return {
        "message":      f"Response confirmed. You have 2 minutes to move forward or mark 'On The Way'.",
        "alert_id":     alert_id,
        "status":       "RESPONDING",
        "maps_url":     alert.maps_url,
        "location":     alert.location_label,
        "time_limit":   120,  # seconds
    }


# ── POST /ambulance/alerts/{alert_id}/en-route ───────────────────────────────

@router.post("/alerts/{alert_id}/en-route")
async def mark_en_route(
    alert_id:     str,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """
    Ambulance marks themselves as 'On The Way' (en route to patient).
    Must be called within 2 minutes of responding.
    """
    profile = require_ambulance(current_user, db)

    alert = db.query(ImpactAlert).filter(ImpactAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    if alert.responder_ambulance_id != profile.id:
        raise HTTPException(status_code=403, detail="You are not the responder for this alert")

    if alert.responded_at:
        responded_time = alert.responded_at
        if responded_time.tzinfo is None:
            responded_time = responded_time.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - responded_time > timedelta(minutes=2):
            raise HTTPException(status_code=400, detail="2-minute window expired. Please re-respond to the alert.")

    alert.status = ImpactAlertStatus.EN_ROUTE
    profile.current_status = "en_route"
    db.commit()

    logger.info(
        f"[Ambulance] {current_user.full_name} is en route to alert {alert_id}"
    )

    try:
        from app.websocket_manager import manager as ws_manager
        await ws_manager.broadcast({
            "type": "ALERT_EN_ROUTE",
            "alert_id": alert_id,
            "responder_name": current_user.full_name,
            "message": f"{current_user.full_name} is en route to patient.",
        })
    except Exception as exc:
        logger.error(f"[Ambulance] WS broadcast failed: {exc}")

    return {
        "message": f"You are now marked as EN ROUTE. Help is on the way!",
        "alert_id": alert_id,
        "status": "EN_ROUTE",
    }


# ── POST /ambulance/heartbeat ─────────────────────────────────────────────────

@router.post("/heartbeat")
def ambulance_heartbeat(
    payload: HeartbeatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Updates ambulance's current location and last active timestamp."""
    profile = require_ambulance(current_user, db)
    profile.latitude = payload.latitude
    profile.longitude = payload.longitude
    profile.last_active_at = datetime.now(timezone.utc)

    # If ambulance is responding to an alert and initial position is missing, backfill it
    active_alert = db.query(ImpactAlert).filter(
        ImpactAlert.responder_ambulance_id == profile.id,
        ImpactAlert.status == ImpactAlertStatus.RESPONDING,
    ).first()

    if active_alert:
        if active_alert.responder_latitude is None or active_alert.responder_longitude is None:
            active_alert.responder_latitude = payload.latitude
            active_alert.responder_longitude = payload.longitude

    db.commit()
    return {"status": "ok"}


# ── GET /ambulance/profile ────────────────────────────────────────────────────

@router.get("/profile")
def get_profile(
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    profile = require_ambulance(current_user, db)
    return {
        "full_name":        current_user.full_name,
        "email":            current_user.email,
        "phone":            profile.phone,
        "ambulance_name":   profile.ambulance_name,
        "driver_name":      profile.driver_name,
        "hospital_name":    profile.hospital_name,
        "is_available":     profile.is_available,
        "current_status":   profile.current_status,
    }


# ── PUT /ambulance/availability ───────────────────────────────────────────────

@router.put("/availability")
def toggle_availability(
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """Toggle whether the ambulance is available for dispatch."""
    profile = require_ambulance(current_user, db)
    profile.is_available = not profile.is_available
    profile.current_status = "available" if profile.is_available else "unavailable"
    profile.updated_at = datetime.now(timezone.utc)
    db.commit()

    status = "available" if profile.is_available else "unavailable"
    return {
        "is_available": profile.is_available,
        "current_status": profile.current_status,
        "message": f"You are now marked as {status}.",
    }
