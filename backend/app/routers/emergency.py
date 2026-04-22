"""
CARENETRA — Emergency Router (Unified)
Handles impact detection, live tracking, volunteer claiming, and notifications.
"""
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from pydantic import BaseModel
from geopy.distance import geodesic

from app.database import get_db
from app.models.models import (
    User, VolunteerProfile, ImpactAlert, ImpactAlertStatus,
    PatientProfile, MedicalCourse, DoctorProfile,
)
from services.alert_service import send_sms_alert

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/emergency", tags=["Emergency"])

# ── Configuration from environment ───────────────────────────────────────────
GOOGLE_MAPS_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
BACKEND_BASE_URL = os.getenv("BACKEND_BASE_URL", "http://localhost:8000")

# ── Schemas ─────────────────────────────────────────────────────────────────

class ImpactReportRequest(BaseModel):
    latitude:            Optional[float] = None
    longitude:           Optional[float] = None
    accuracy:            Optional[float] = None
    reported_by_name:    Optional[str]   = "Unknown"
    reported_by_phone:   Optional[str]   = None
    reported_by_user_id: Optional[str]   = None

class LocationUpdate(BaseModel):
    latitude:  float
    longitude: float

class RespondRequest(BaseModel):
    responder_name:    str
    responder_user_id: Optional[str] = None

# ── Helpers ─────────────────────────────────────────────────────────────────

def _build_maps_url(lat: Optional[float], lng: Optional[float]) -> Optional[str]:
    if lat is None or lng is None:
        return None
    return f"https://maps.google.com/?q={lat},{lng}"

def _build_static_map_url(lat: float, lng: float, zoom: int = 16) -> Optional[str]:
    if not GOOGLE_MAPS_KEY:
        return None
    return (
        f"https://maps.googleapis.com/maps/api/staticmap"
        f"?center={lat},{lng}&zoom={zoom}&size=600x400&maptype=roadmap"
        f"&markers=color:red%7C{lat},{lng}"
        f"&key={GOOGLE_MAPS_KEY}"
    )

def _build_location_label(lat: Optional[float], lng: Optional[float]) -> str:
    if lat is None or lng is None:
        return "Location unavailable"
    return f"{lat:.5f}° N, {lng:.5f}° E"

def _get_patient_doctor_phone(user_id: str, db: Session) -> Optional[str]:
    patient = db.query(PatientProfile).filter(PatientProfile.user_id == user_id).first()
    if not patient:
        return None
    course = db.query(MedicalCourse).filter(
        MedicalCourse.patient_id == patient.id,
        MedicalCourse.status == "ACTIVE"
    ).first()
    if not course:
        return None
    doctor = db.query(DoctorProfile).filter(DoctorProfile.id == course.doctor_id).first()
    return doctor.hospital_name if doctor else None

# ── POST /emergency/impact ───────────────────────────────────────────────────

@router.post("/impact")
async def report_impact(
    payload: ImpactReportRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Creates an alert, notifies nearby volunteers and the patient's doctor.
    Returns alert_id for live tracking.
    """
    maps_url = _build_maps_url(payload.latitude, payload.longitude)
    location_label = _build_location_label(payload.latitude, payload.longitude)

    alert = ImpactAlert(
        id                  = str(uuid.uuid4()),
        reported_by_name    = payload.reported_by_name or "CARENETRA User",
        reported_by_phone   = payload.reported_by_phone,
        reported_by_user_id = payload.reported_by_user_id,
        latitude            = payload.latitude,
        longitude           = payload.longitude,
        initial_latitude    = payload.latitude,
        initial_longitude   = payload.longitude,
        location_label      = location_label,
        maps_url            = maps_url,
        status              = ImpactAlertStatus.ACTIVE,
        created_at          = datetime.now(timezone.utc),
        updated_at          = datetime.now(timezone.utc),
    )
    db.add(alert)
    db.flush()

    # ── Notify nearby volunteers (geodesic distance ≤ 5 km) ──────────────────
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=5)
    active_volunteers = db.query(VolunteerProfile).filter(
        VolunteerProfile.is_available == True,
        VolunteerProfile.last_active_at >= cutoff,
        VolunteerProfile.current_latitude.isnot(None),
        VolunteerProfile.current_longitude.isnot(None),
    ).all()

    nearby = []
    if payload.latitude and payload.longitude:
        patient_loc = (payload.latitude, payload.longitude)
        for v in active_volunteers:
            if v.current_latitude and v.current_longitude:
                dist = geodesic(patient_loc, (v.current_latitude, v.current_longitude)).km
                if dist <= 5.0:
                    nearby.append((v, dist))
        nearby.sort(key=lambda x: x[1])
    else:
        nearby = [(v, None) for v in active_volunteers]

    notified = 0
    for v, dist in nearby:
        if v.phone:
            dist_str = f"{dist:.1f} km away" if dist else "nearby"
            body = (
                f"🚨 CARENETRA IMPACT ALERT\n"
                f"Person: {alert.reported_by_name}\n"
                f"Location: {location_label}\n"
                f"Distance: {dist_str}\n"
                f"Maps: {maps_url or 'unavailable'}\n"
                f"Respond: {BACKEND_BASE_URL}/emergency/{alert.id}/live"
            )
            background_tasks.add_task(send_sms_alert, v.phone, body)
            notified += 1

    # ── Notify doctor (if patient is logged in) ──────────────────────────────
    if payload.reported_by_user_id:
        doctor_phone = _get_patient_doctor_phone(payload.reported_by_user_id, db)
        if doctor_phone:
            body = (
                f"🚨 CARENETRA: Your patient {alert.reported_by_name} "
                f"may have been in an accident. Impact at {location_label}. "
                f"Maps: {maps_url or 'unavailable'}"
            )
            background_tasks.add_task(send_sms_alert, doctor_phone, body)

    alert.volunteers_notified = notified
    alert.sms_sent = notified > 0
    db.commit()
    db.refresh(alert)

    return {
        "alert_id":            alert.id,
        "status":              alert.status.value,
        "location_label":      location_label,
        "maps_url":            maps_url,
        "static_map_url":      _build_static_map_url(payload.latitude, payload.longitude) if payload.latitude else None,
        "volunteers_notified": notified,
        "live_page_url":       f"{BACKEND_BASE_URL}/emergency/{alert.id}/live",
    }

# ── PATCH /emergency/{id}/location (live GPS streaming) ─────────────────────

@router.patch("/{alert_id}/location")
async def update_location(
    alert_id: str,
    payload: LocationUpdate,
    db: Session = Depends(get_db),
):
    alert = db.query(ImpactAlert).filter(ImpactAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.status != ImpactAlertStatus.ACTIVE:
        return {"ok": True, "message": "Alert already resolved or claimed"}

    alert.latitude = payload.latitude
    alert.longitude = payload.longitude
    alert.maps_url = _build_maps_url(payload.latitude, payload.longitude)
    alert.location_label = _build_location_label(payload.latitude, payload.longitude)
    alert.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"ok": True, "maps_url": alert.maps_url}

# ── POST /emergency/{id}/respond (volunteer claims) ─────────────────────────

@router.post("/{alert_id}/respond")
async def volunteer_respond(
    alert_id: str,
    payload: RespondRequest,
    db: Session = Depends(get_db),
):
    alert = db.query(ImpactAlert).filter(ImpactAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    if alert.status == ImpactAlertStatus.RESOLVED:
        raise HTTPException(status_code=409, detail="Alert already resolved")
    if alert.status == ImpactAlertStatus.RESPONDING:
        raise HTTPException(status_code=409, detail="Another volunteer already responded")

    alert.responder_name = payload.responder_name
    alert.responder_user_id = payload.responder_user_id
    alert.status = ImpactAlertStatus.RESPONDING
    alert.responded_at = datetime.now(timezone.utc)
    db.commit()

    # Optional: notify patient that someone is coming (via SMS/push)
    if alert.reported_by_phone:
        body = f"✅ A volunteer ({payload.responder_name}) is responding to your emergency. Help is on the way."
        background_tasks.add_task(send_sms_alert, alert.reported_by_phone, body)

    return {"ok": True, "alert_id": alert_id, "live_page_url": f"{BACKEND_BASE_URL}/emergency/{alert_id}/live"}

# ── GET /emergency/{id} (polled by patient) ─────────────────────────────────

@router.get("/{alert_id}")
def get_alert_status(
    alert_id: str,
    db: Session = Depends(get_db),
):
    alert = db.query(ImpactAlert).filter(ImpactAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {
        "alert_id":       alert.id,
        "status":         alert.status.value,
        "responder_name": alert.responder_name,
        "responded_at":   alert.responded_at.isoformat() if alert.responded_at else None,
        "maps_url":       alert.maps_url,
        "latitude":       alert.latitude,
        "longitude":      alert.longitude,
    }

# ── GET /emergency/active (for volunteer dashboard) ─────────────────────────

@router.get("/active")
def get_active_alerts(db: Session = Depends(get_db)):
    # All active and responding alerts (within the last 6 hours)
    expiry_limit = datetime.now(timezone.utc) - timedelta(hours=6)
    alerts = db.query(ImpactAlert).filter(
        ImpactAlert.status.in_([ImpactAlertStatus.ACTIVE, ImpactAlertStatus.RESPONDING]),
        ImpactAlert.created_at >= expiry_limit
    ).order_by(ImpactAlert.created_at.desc()).all()
    return {
        "alerts": [
            {
                "alert_id":       a.id,
                "status":         a.status.value,
                "reported_by":    a.reported_by_name,
                "location_label": a.location_label,
                "maps_url":       a.maps_url,
                "latitude":       a.latitude,
                "longitude":      a.longitude,
                "responder_name": a.responder_name,
                "created_at":     a.created_at.isoformat(),
            } for a in alerts
        ],
        "count": len(alerts)
    }

# ── GET /emergency/{id}/live (self‑refreshing HTML tracker) ─────────────────

@router.get("/{alert_id}/live", response_class=HTMLResponse)
async def live_tracking_page(alert_id: str, db: Session = Depends(get_db)):
    alert = db.query(ImpactAlert).filter(ImpactAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    lat = alert.latitude or alert.initial_latitude
    lng = alert.longitude or alert.initial_longitude
    name = alert.reported_by_name

    if GOOGLE_MAPS_KEY and lat and lng:
        map_html = f"""
        <iframe width="100%" height="400" style="border:0; border-radius:12px"
                loading="lazy" allowfullscreen
                src="https://www.google.com/maps/embed/v1/place?key={GOOGLE_MAPS_KEY}&q={lat},{lng}&zoom=17">
        </iframe>"""
    elif lat and lng:
        map_html = f"""
        <div style="text-align:center;padding:20px">
            <a href="https://maps.google.com/?q={lat},{lng}" target="_blank"
               style="display:inline-block;margin:8px;padding:12px 24px;background:#4285F4;color:#fff;
                      border-radius:8px;text-decoration:none;">Open in Google Maps</a>
            <a href="https://waze.com/ul?ll={lat},{lng}&navigate=yes" target="_blank"
               style="display:inline-block;margin:8px;padding:12px 24px;background:#00AEEF;color:#fff;
                      border-radius:8px;text-decoration:none;">Navigate with Waze</a>
        </div>"""
    else:
        map_html = "<p style='text-align:center'>Waiting for GPS…</p>"

    refresh = '<meta http-equiv="refresh" content="3">' if alert.status == ImpactAlertStatus.ACTIVE else ""

    return HTMLResponse(f"""
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8">{refresh}<title>🚨 Emergency – {name}</title>
    <style>body{{font-family:sans-serif;background:#0f0f0f;color:#eee;padding:16px}} .card{{background:#1a1a1a;border-radius:16px;padding:20px;max-width:600px;margin:auto}}</style>
    </head>
    <body><div class="card">
        <h1 style="color:#ef4444">🚨 Emergency – {name}</h1>
        <p>Status: <strong>{alert.status.value}</strong> • Responder: {alert.responder_name or "None yet"}</p>
        {map_html}
        <p style="font-size:0.8rem;color:#888">Page auto‑refreshes every 3 seconds.</p>
    </div></body></html>
    """)

# ── POST /emergency/{id}/resolve ────────────────────────────────────────────

@router.post("/{alert_id}/resolve")
def resolve_alert(alert_id: str, db: Session = Depends(get_db)):
    alert = db.query(ImpactAlert).filter(ImpactAlert.id == alert_id).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.status = ImpactAlertStatus.RESOLVED
    alert.resolved_at = datetime.now(timezone.utc)
    db.commit()
    return {"message": "Alert resolved", "alert_id": alert_id}