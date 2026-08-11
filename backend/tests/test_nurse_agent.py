"""Unit tests for nurse_agent.py pure helpers (no LLM / DB calls)."""
from app.nodes.nurse_agent import (
    _should_invoke_rag,
    build_checklist,
    envelope_to_frontend_question,
    merge_collected,
    parse_nurse_envelope,
    parse_nurse_start,
)


# ── Checklist ────────────────────────────────────────────────────────────────

def test_build_checklist_cardiac_has_core_and_condition():
    ids = [c["id"] for c in build_checklist("POST_CARDIAC_SURGERY")]
    assert ids[:3] == ["general_feeling", "medication_adherence", "symptoms_today"]
    assert "cardiac_chest" in ids
    assert "cardiac_heart_rate" in ids
    assert "wound_photo" in ids


def test_build_checklist_unknown_uses_default():
    ids = [c["id"] for c in build_checklist("UNKNOWN_CONDITION")]
    assert ids[0] == "general_feeling"
    assert "surgery_wound" in ids
    assert "wound_photo" in ids


def test_build_checklist_no_duplicates():
    ids = [c["id"] for c in build_checklist("GENERAL_POST_SURGERY")]
    assert len(ids) == len(set(ids))


def test_build_checklist_required_flags():
    by_id = {c["id"]: c for c in build_checklist("POST_CARDIAC_SURGERY")}
    assert by_id["general_feeling"]["required"] is True
    assert by_id["wound_photo"]["required"] is True
    assert by_id["cardiac_chest"]["required"] is False


# ── RAG throttling ───────────────────────────────────────────────────────────

def test_should_invoke_rag_skips_acknowledgments():
    for ack in ["yes", "no", "ok", "okay", "i did", "done", "feeling good", ""]:
        assert _should_invoke_rag(ack) is False, ack


def test_should_invoke_rag_detects_questions():
    assert _should_invoke_rag("should I double my dose?") is True
    assert _should_invoke_rag("Is this normal after surgery?") is True
    assert _should_invoke_rag("what should I watch for") is True


def test_should_invoke_rag_detects_symptoms():
    assert _should_invoke_rag("I have a fever and pain") is True
    assert _should_invoke_rag("my wound is bleeding") is True


# ── Envelope parsing ─────────────────────────────────────────────────────────

def test_parse_nurse_envelope_ok():
    env = parse_nurse_envelope(
        '{"reply":"Are you ok?","question_id":"general_feeling","question_type":"yesno",'
        '"options":[],"collected":{"fatigue_score":7},"complete":false}'
    )
    assert env is not None
    assert env["question_type"] == "yes_no"   # yesno -> yes_no
    assert env["collected"]["fatigue_score"] == 7
    assert env["complete"] is False


def test_parse_nurse_envelope_fenced():
    env = parse_nurse_envelope(
        '```json\n{"reply":"Hi","question_id":"a","question_type":"text","complete":true}\n```'
    )
    assert env is not None
    assert env["complete"] is True


def test_parse_nurse_envelope_rejects_bad():
    assert parse_nurse_envelope('{"question_type":"text"}') is None          # no reply
    assert parse_nurse_envelope("not json at all") is None
    assert parse_nurse_envelope(None) is None


def test_parse_nurse_envelope_defaults_question_id():
    # A missing question_id is tolerated (defaults to "nurse") so a sloppy LLM
    # reply still produces a frontend-valid question.
    env = parse_nurse_envelope('{"reply":"hi","question_type":"text"}')
    assert env is not None
    assert env["question_id"] == "nurse"


# ── Frontend contract ────────────────────────────────────────────────────────

def test_envelope_to_frontend_question_contract():
    env = {
        "reply": "Pick one",
        "question_id": "general_feeling",
        "question_type": "mcq",
        "options": ["A", "B"],
        "collected": {},
        "complete": False,
    }
    q = envelope_to_frontend_question(env)
    assert {"id", "question", "type", "options"} <= set(q)
    assert q["id"] == "general_feeling"
    assert q["type"] == "mcq"
    assert q["options"] == ["A", "B"]


def test_envelope_yes_no_defaults_options():
    q = envelope_to_frontend_question(
        {"reply": "Yes?", "question_id": "x", "question_type": "yes_no", "options": [], "collected": {}, "complete": False}
    )
    assert q["type"] == "yes_no"
    assert q["options"] == ["Yes", "No"]


def test_envelope_mcq_without_options_downgrades_to_text():
    q = envelope_to_frontend_question(
        {"reply": "no options", "question_id": "x", "question_type": "mcq", "options": [], "collected": {}, "complete": False}
    )
    assert q["type"] == "text"
    assert q["options"] == []


def test_envelope_photo_preserved():
    q = envelope_to_frontend_question(
        {"reply": "send a photo", "question_id": "wound_photo", "question_type": "photo", "options": [], "collected": {}, "complete": False}
    )
    assert q["type"] == "photo"


# ── /start parsing ───────────────────────────────────────────────────────────

def test_parse_nurse_start_ok():
    raw = (
        '{"greeting":"Hi John!","first_question":{"reply":"How do you feel?",'
        '"question_id":"general_feeling","question_type":"mcq","options":["A","B","C"]}}'
    )
    parsed = parse_nurse_start(raw)
    assert parsed is not None
    assert parsed["greeting"] == "Hi John!"
    assert parsed["first_question"]["id"] == "general_feeling"
    assert parsed["first_question"]["type"] == "mcq"


def test_parse_nurse_start_bad():
    assert parse_nurse_start('{"greeting":""}') is None
    assert parse_nurse_start("garbage") is None


# ── Collected merge ──────────────────────────────────────────────────────────

def test_merge_collected_overlays_nonnull():
    assert merge_collected({"a": 1, "b": 2}, {"b": 3, "c": None}) == {"a": 1, "b": 3}


def test_merge_collected_empty():
    assert merge_collected(None, {"x": 1}) == {"x": 1}
    assert merge_collected({"x": 1}, None) == {"x": 1}