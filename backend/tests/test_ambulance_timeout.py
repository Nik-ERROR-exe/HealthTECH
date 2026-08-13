import pytest
import uuid
from datetime import datetime, timezone, timedelta
from app.database import SessionLocal
from app.models.models import ImpactAlert, ImpactAlertStatus, AmbulanceProfile, User, UserRole
from app.scheduler import check_ambulance_timeouts

@pytest.mark.asyncio
async def test_ambulance_stuck_timeout_detection():
    db = SessionLocal()
    alert_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    amb_id = str(uuid.uuid4())
    try:
        user = User(
            id=user_id,
            email=f"stuck_{user_id[:8]}@carenetra.com",
            password_hash="dummy_hash",
            full_name="Test Ambulance Stuck",
            role=UserRole.AMBULANCE,
        )
        db.add(user)
        db.flush()

        ambulance = AmbulanceProfile(
            id=amb_id,
            user_id=user.id,
            ambulance_name="AMB-STUCK-101",
            driver_name="John Stuck",
            is_available=True,
            current_status="responding",
            latitude=19.0760,  # Same location (stuck)
            longitude=72.8777,
        )
        db.add(ambulance)
        db.flush()

        # Create RESPONDING alert created 3 minutes ago
        responded_time = datetime.now(timezone.utc) - timedelta(minutes=3)
        alert = ImpactAlert(
            id=alert_id,
            reported_by_name="Test Patient",
            status=ImpactAlertStatus.RESPONDING,
            responder_ambulance_id=ambulance.id,
            responder_name=user.full_name,
            responder_latitude=19.0760, # Initial respond location
            responder_longitude=72.8777,
            responded_at=responded_time,
            created_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        )
        db.add(alert)
        db.commit()

        # Run check_ambulance_timeouts
        await check_ambulance_timeouts()

        # Refresh alert & ambulance state
        db.refresh(alert)
        db.refresh(ambulance)

        # Verify stuck ambulance alert was reset to ACTIVE
        assert alert.status == ImpactAlertStatus.ACTIVE
        assert alert.responder_ambulance_id is None
        assert alert.responder_name is None
        assert ambulance.current_status == "available"
    finally:
        # Cleanup test records
        try:
            db.query(ImpactAlert).filter(ImpactAlert.id == alert_id).delete()
            db.query(AmbulanceProfile).filter(AmbulanceProfile.id == amb_id).delete()
            db.query(User).filter(User.id == user_id).delete()
            db.commit()
        except Exception:
            pass
        db.close()

@pytest.mark.asyncio
async def test_ambulance_moving_auto_enroute():
    db = SessionLocal()
    alert_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    amb_id = str(uuid.uuid4())
    try:
        user = User(
            id=user_id,
            email=f"moving_{user_id[:8]}@carenetra.com",
            password_hash="dummy_hash",
            full_name="Test Ambulance Moving",
            role=UserRole.AMBULANCE,
        )
        db.add(user)
        db.flush()

        # Ambulance moved > 50 meters (19.0800, 72.8800 is ~600 meters away)
        ambulance = AmbulanceProfile(
            id=amb_id,
            user_id=user.id,
            ambulance_name="AMB-MOVING-102",
            driver_name="Jane Moving",
            is_available=True,
            current_status="responding",
            latitude=19.0800,
            longitude=72.8800,
        )
        db.add(ambulance)
        db.flush()

        # Create RESPONDING alert created 3 minutes ago
        responded_time = datetime.now(timezone.utc) - timedelta(minutes=3)
        alert = ImpactAlert(
            id=alert_id,
            reported_by_name="Test Patient 2",
            status=ImpactAlertStatus.RESPONDING,
            responder_ambulance_id=ambulance.id,
            responder_name=user.full_name,
            responder_latitude=19.0760,
            responder_longitude=72.8777,
            responded_at=responded_time,
            created_at=datetime.now(timezone.utc) - timedelta(minutes=5),
        )
        db.add(alert)
        db.commit()

        # Run check_ambulance_timeouts
        await check_ambulance_timeouts()

        # Refresh alert & ambulance state
        db.refresh(alert)
        db.refresh(ambulance)

        # Verify moving ambulance alert was auto-marked as EN_ROUTE
        assert alert.status == ImpactAlertStatus.EN_ROUTE
        assert ambulance.current_status == "en_route"
    finally:
        # Cleanup test records
        try:
            db.query(ImpactAlert).filter(ImpactAlert.id == alert_id).delete()
            db.query(AmbulanceProfile).filter(AmbulanceProfile.id == amb_id).delete()
            db.query(User).filter(User.id == user_id).delete()
            db.commit()
        except Exception:
            pass
        db.close()
