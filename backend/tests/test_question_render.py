"""Unit tests for question_render.py (pure, offline)."""
from app.nodes.question_render import (
    _apply_branches,
    _build_question,
    _calculate_day,
    _personalize,
)


def test_personalize_all_placeholders():
    state = {
        "patient_name": "Aarav Kumar",
        "medications": ["Metoprolol", "Aspirin", "Warfarin"],
        "condition_label": "cardiac surgery recovery",
        "day": 3,
    }
    text = "Hi {name}, day {day}. {condition_label} — take {meds}."
    assert (
        _personalize(text, state)
        == "Hi Aarav, day 3. cardiac surgery recovery — take Metoprolol, Aspirin, and Warfarin."
    )


def test_personalize_single_and_two_meds():
    assert _personalize("{meds}", {"medications": ["Aspirin"]}) == "Aspirin"
    assert _personalize("{meds}", {"medications": ["Aspirin", "Warfarin"]}) == "Aspirin and Warfarin"


def test_personalize_no_meds():
    out = _personalize("take {meds} today", {"medications": []})
    assert "your medications" in out


def test_build_question_renders_bank_template():
    q = _build_question(
        "general_feeling",
        {"patient_name": "Meera", "medications": [], "condition_label": "x", "day": 2},
    )
    assert q["id"] == "general_feeling"
    assert q["question"]
    assert q["type"] == "mcq"
    assert q["options"]


def test_build_question_unknown_returns_none():
    assert _build_question("not_a_question", {}) is None


def test_apply_branches_inserts_followup_front():
    remaining = _apply_branches(
        "medication_adherence", "I missed a dose", ["symptoms_today"], []
    )
    assert remaining == ["medication_reason", "symptoms_today"]


def test_apply_branches_skips_duplicates():
    remaining = _apply_branches(
        "medication_adherence", "missed", ["medication_reason"], []
    )
    assert remaining == ["medication_reason"]


def test_apply_branches_no_keyword_match():
    remaining = _apply_branches(
        "medication_adherence", "all taken", ["symptoms_today"], []
    )
    assert remaining == ["symptoms_today"]


def test_calculate_day_defaults_to_one():
    assert _calculate_day("") == 1
    assert _calculate_day(None) == 1
    assert _calculate_day("not-a-date") == 1