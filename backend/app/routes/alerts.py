"""
Alias for app.routers.alerts
"""
from app.routers.alerts import router, get_pending_alerts, dispatch_ambulance, acknowledge_alert

__all__ = ["router", "get_pending_alerts", "dispatch_ambulance", "acknowledge_alert"]
