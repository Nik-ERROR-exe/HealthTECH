"""Unit tests for the NVIDIA VLM vision classification helpers (no LLM / DB)."""
from app.nodes.vision_agent import _parse_vlm_result, _vlm_system_prompt


def test_vlm_prompt_contains_clinical_assessment_and_language_rule():
    prompt = _vlm_system_prompt("hi")
    assert "clinical wound assessment assistant" in prompt
    assert "erythema" in prompt and "dehiscence" in prompt
    assert "CRITICAL LANGUAGE RULE" in prompt
    assert "'hi'" in prompt
    assert "Never default to French, Spanish, or any other language" in prompt


def test_vlm_prompt_replaces_weak_rule():
    prompt = _vlm_system_prompt("mr")
    assert "Respond in 'mr'." not in prompt


def test_parse_high_severity():
    result = _parse_vlm_result("The incision shows marked erythema and discharge. Severity: HIGH")
    assert result["status"] == "SEVERE"
    assert result["score"] == 8.0


def test_parse_low_severity():
    result = _parse_vlm_result("Minor redness only, wound appears clean. Severity: LOW")
    assert result["status"] == "NORMAL"
    assert result["score"] == 1.0


def test_parse_medium_or_missing_defaults_to_moderate():
    assert _parse_vlm_result("moderate swelling at the site")["status"] == "MODERATE"
    assert _parse_vlm_result("")["status"] == "MODERATE"
    assert _parse_vlm_result("")["score"] == 5.0


def test_parse_clips_summary_length():
    result = _parse_vlm_result("x" * 500 + " Severity: HIGH")
    assert len(result["summary"]) <= 300
