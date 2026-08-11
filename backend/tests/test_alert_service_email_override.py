"""Unit tests for the global demo email routing (no network)."""
from types import SimpleNamespace

from services import alert_service
from services.alert_service import _resolve_outbound_email


def test_demo_email_override_when_configured(monkeypatch):
    monkeypatch.setattr(
        alert_service, "settings",
        SimpleNamespace(DEMO_EMERGENCY_EMAIL="demo@hackathon.dev"),
    )
    assert _resolve_outbound_email("real@care.net") == "demo@hackathon.dev"


def test_original_email_when_no_demo_configured(monkeypatch):
    monkeypatch.setattr(
        alert_service, "settings",
        SimpleNamespace(DEMO_EMERGENCY_EMAIL=""),
    )
    assert _resolve_outbound_email("real@care.net") == "real@care.net"
