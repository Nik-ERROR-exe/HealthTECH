"""Unit tests for scribe_agent.py pure helpers (no LLM calls)."""
from app.nodes.scribe_agent import (
    compile_merged_to_text,
    merge_scribe_and_collected,
    parse_scribe_json,
    static_scribe,
)


# ── static_scribe (deterministic fallback extraction) ───────────────────────

def test_static_scribe_medication_missed():
    s = static_scribe([{"question_id": "medication_adherence", "answer": "Missed a dose"}])
    assert s["medication_taken"] is False


def test_static_scribe_medication_taken():
    s = static_scribe([{"question_id": "medication_adherence", "answer": "Yes, all taken"}])
    assert s["medication_taken"] is True


def test_static_scribe_temperature_high_not_low():
    s = static_scribe([{"question_id": "temperature_check", "answer": "High fever — above 101F"}])
    assert s["fever_level"] == "high"


def test_static_scribe_temperature_low():
    s = static_scribe([{"question_id": "temperature_check", "answer": "Low fever — 99-101F"}])
    assert s["fever_level"] == "low_grade"


def test_static_scribe_feeling_negative_not_positive():
    s = static_scribe([{"question_id": "general_feeling", "answer": "Not doing great"}])
    assert "feeling unwell" in s["symptom_summary"]


def test_static_scribe_pain_scale():
    s = static_scribe([{"question_id": "pain_scale", "answer": "Severe — 7 to 10"}])
    assert s["pain_level"] == 9


def test_static_scribe_photo():
    s = static_scribe([{"question_id": "wound_photo", "answer": "photo_uploaded"}])
    assert s["wound_photo_taken"] is True


def test_static_scribe_symptom_fever():
    s = static_scribe([{"question_id": "symptoms_today", "answer": "Feeling warm or feverish"}])
    assert s["fever_level"] == "low_grade"


def test_static_scribe_condition_specific_kept():
    s = static_scribe([{"question_id": "kidney_urine_output", "answer": "Less than usual"}])
    assert s["condition_specific"].get("kidney_urine_output") == "Less than usual"


# ── parse_scribe_json ────────────────────────────────────────────────────────

def test_parse_scribe_json_coerces():
    s = parse_scribe_json(
        '{"fever_level":"HIGH","fatigue_score":9,"symptom_severity_score":99,'
        '"medication_taken":"yes","condition_specific":{"kidney_swelling":"mild"},'
        '"checklist_ids_answered":["general_feeling"],"notes":"x"}'
    )
    assert s["fever_level"] == "high"          # lowercased + whitelisted
    assert s["fatigue_score"] == 9
    assert s["symptom_severity_score"] == 10.0  # clamped to 0-10
    assert s["medication_taken"] is True
    assert s["condition_specific"] == {"kidney_swelling": "mild"}
    assert s["checklist_ids_answered"] == ["general_feeling"]


def test_parse_scribe_json_unknown_fever():
    s = parse_scribe_json('{"fever_level":"banana"}')
    assert s["fever_level"] == "unknown"


def test_parse_scribe_json_bad():
    assert parse_scribe_json("not json") is None
    assert parse_scribe_json(None) is None


# ── merge_scribe_and_collected ───────────────────────────────────────────────

def test_scribe_wins_per_scalar_field():
    merged = merge_scribe_and_collected(
        {"fever_level": "high"}, {"wound_photo_taken": True}
    )
    assert merged["fever_level"] == "high"
    assert merged["wound_photo_taken"] is True


def test_merge_deep_merges_condition_specific():
    merged = merge_scribe_and_collected(
        {"condition_specific": {"a": "1"}}, {"condition_specific": {"b": "2"}}
    )
    assert merged["condition_specific"] == {"a": "1", "b": "2"}


def test_merge_unions_checklist_ids():
    merged = merge_scribe_and_collected(
        {"checklist_ids_answered": ["general_feeling"]},
        {"checklist_ids_answered": ["medication_adherence", "general_feeling"]},
    )
    assert merged["checklist_ids_answered"] == ["general_feeling", "medication_adherence"]


# ── compile_merged_to_text ───────────────────────────────────────────────────

def test_compile_merged_to_text():
    txt = compile_merged_to_text(
        {
            "fever_level": "high",
            "medication_taken": True,
            "pain_level": 6,
            "condition_specific": {"cardiac_chest": "tightness"},
        },
        {},
    )
    assert "fever: high" in txt
    assert "medication taken: yes" in txt
    assert "pain: 6/10" in txt
    assert "cardiac_chest: tightness" in txt


def test_compile_merged_to_text_empty():
    assert compile_merged_to_text({"fever_level": "unknown"}, {}) == ""