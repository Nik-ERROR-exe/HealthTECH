"""Unit tests for the demo emergency-phone override (no DB / network).

Email override is global (handled in `send_email_alert` via DEMO_EMERGENCY_EMAIL);
this module covers the phone override used by the escalation SMS path.
"""
from types import SimpleNamespace

from app.nodes import escalation_agent
from app.nodes.escalation_agent import _resolve_emergency_contact_phone


def test_demo_phone_override_for_red(monkeypatch):
    monkeypatch.setattr(
        escalation_agent, "settings",
        SimpleNamespace(DEMO_EMERGENCY_PHONE_NUMBER="+911234567890"),
    )
    phone = _resolve_emergency_contact_phone("+911111", tier="RED")
    assert phone == "+911234567890"


def test_demo_phone_override_for_emergency(monkeypatch):
    monkeypatch.setattr(
        escalation_agent, "settings",
        SimpleNamespace(DEMO_EMERGENCY_PHONE_NUMBER="+911234567890"),
    )
    phone = _resolve_emergency_contact_phone("+911111", tier="EMERGENCY")
    assert phone == "+911234567890"


def test_no_override_when_demo_phone_unset(monkeypatch):
    monkeypatch.setattr(
        escalation_agent, "settings",
        SimpleNamespace(DEMO_EMERGENCY_PHONE_NUMBER=""),
    )
    phone = _resolve_emergency_contact_phone("+911111", tier="EMERGENCY")
    assert phone == "+911111"


def test_override_only_for_high_tiers(monkeypatch):
    monkeypatch.setattr(
        escalation_agent, "settings",
        SimpleNamespace(DEMO_EMERGENCY_PHONE_NUMBER="+911234567890"),
    )
    # ORANGE (and below) keeps the patient's real emergency contact
    phone = _resolve_emergency_contact_phone("+911111", tier="ORANGE")
    assert phone == "+911111"
