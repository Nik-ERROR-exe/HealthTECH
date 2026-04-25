"""
CARENETRA — Volunteer Router
Endpoints for the volunteer user role.

Endpoints:
  GET  /volunteer/dashboard          → active alerts + volunteer profile
  POST /volunteer/alerts/{id}/respond → confirm responding to an impact alert
  GET  /volunteer/profile            → volunteer's own profile
  PUT  /volunteer/availability       → toggle available/unavailable
"""
import logging
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.dependencies import get_current_user
from app.models.models import (
    User, VolunteerProfile, ImpactAlert, ImpactAlertStatus,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/volunteer", tags=["Volunteer"])


# ── Dependency ────────────────────────────────────────────────────────────────

def _require_volunteer(current_user: User, db: Session) -> VolunteerProfile:
    if current_user.role.value != "VOLUNTEER":
        raise HTTPException(status_code=403, detail="Volunteer access only")
    profile = db.query(VolunteerProfile).filter(
        VolunteerProfile.user_id == current_user.id
    ).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Volunteer profile not found")
    return profile


# ── Schemas ───────────────────────────────────────────────────────────────────

class HeartbeatRequest(BaseModel):
    latitude:  float
    longitude: float


# ── POST /volunteer/heartbeat ─────────────────────────────────────────────────

@router.post("/heartbeat")
def volunteer_heartbeat(
    payload: HeartbeatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Updates volunteer's current location and last active timestamp."""
    profile = _require_volunteer(current_user, db)
    profile.current_latitude = payload.latitude
    profile.current_longitude = payload.longitude
    profile.last_active_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "ok"}


# ── GET /volunteer/dashboard ──────────────────────────────────────────────────

@router.get("/dashboard")
def get_volunteer_dashboard(
    language: str = "en",
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """
    Returns active impact alerts + volunteer's own profile.
    Frontend polls this every 10 seconds for real-time feel.
    """
    profile = _require_volunteer(current_user, db)

    # All active and responding alerts (within the last 6 hours)
    expiry_limit = datetime.now(timezone.utc) - timedelta(hours=6)
    alerts = db.query(ImpactAlert).filter(
        ImpactAlert.status.in_([ImpactAlertStatus.ACTIVE, ImpactAlertStatus.RESPONDING]),
        ImpactAlert.created_at >= expiry_limit
    ).order_by(ImpactAlert.created_at.desc()).all()

    alerts_data = []
    for a in alerts:
        # Is THIS volunteer the responder?
        i_am_responding = (a.responder_volunteer_id == profile.id)

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
        })

    return {
        "volunteer_name":  current_user.full_name,
        "is_available":    profile.is_available,
        "area":            profile.area_description,
        "active_alerts":   alerts_data,
        "alert_count":     len(alerts_data),
    }

# ── POST /volunteer/alerts/{alert_id}/respond ────────────────────────────────

@router.post("/alerts/{alert_id}/respond")
def respond_to_alert(
    alert_id:     str,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """
    Volunteer confirms they are responding to an impact alert.
    Updates alert status to RESPONDING and records the volunteer's name.
    """
    profile = _require_volunteer(current_user, db)

    alert = db.query(ImpactAlert).filter(ImpactAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    if alert.status == ImpactAlertStatus.RESOLVED:
        raise HTTPException(status_code=400, detail="Alert already resolved")

    # If already responding by someone else, still allow — multiple volunteers can respond
    alert.status                 = ImpactAlertStatus.RESPONDING
    alert.responder_volunteer_id = profile.id
    alert.responder_name         = current_user.full_name
    alert.responded_at           = datetime.now(timezone.utc)
    db.commit()

    logger.info(
        f"[Volunteer] {current_user.full_name} responding to alert {alert_id}"
    )

    return {
        "message":      f"Response confirmed. Thank you, {current_user.full_name.split()[0]}!",
        "alert_id":     alert_id,
        "status":       "RESPONDING",
        "maps_url":     alert.maps_url,
        "location":     alert.location_label,
    }


# ── GET /volunteer/profile ────────────────────────────────────────────────────

@router.get("/profile")
def get_profile(
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    profile = _require_volunteer(current_user, db)
    return {
        "full_name":        current_user.full_name,
        "email":            current_user.email,
        "phone":            profile.phone,
        "area_description": profile.area_description,
        "is_available":     profile.is_available,
    }


# ── PUT /volunteer/availability ───────────────────────────────────────────────

@router.put("/availability")
def toggle_availability(
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    """Toggle whether the volunteer receives SMS alerts."""
    profile = _require_volunteer(current_user, db)
    profile.is_available = not profile.is_available
    profile.updated_at   = datetime.now(timezone.utc)
    db.commit()

    status = "available" if profile.is_available else "unavailable"
    return {
        "is_available": profile.is_available,
        "message": f"You are now marked as {status}.",
    }