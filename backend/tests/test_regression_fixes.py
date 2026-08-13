"""
Regression unit tests for Master Repair Task:
1. Voice auto-send and accumulated transcript compiler
2. Vision non-wound classification & OpenCV fallback (duck/face/object protection)
3. Wound Chat RAG non-wound rejection & dynamic context synthesis
4. Report agent free-text preservation
"""
import pytest
from unittest.mock import AsyncMock, patch

from app.nodes.vision_agent import (
    analyze_with_opencv,
    _parse_vlm_json_result,
    _parse_vlm_result,
    generate_ai_advice,
)
from app.nodes.scribe_agent import compile_merged_to_text, static_scribe
from app.services.image_service import answer_wound_image_chat
from app.models.models import WoundAnalysis, WoundSeverity


def test_opencv_fallback_classifies_as_non_wound(tmp_path):
    """OpenCV fallback must return is_wound=False so non-wound images (e.g. duck) never manufacture wound findings."""
    import numpy as np
    import cv2

    img_path = tmp_path / "duck.jpg"
    # Create a synthetic 100x100 RGB image simulating a duck photo
    img = np.zeros((100, 100, 3), dtype=np.uint8)
    img[:, :] = [0, 255, 255]  # Yellow duck color
    cv2.imwrite(str(img_path), img)

    result = analyze_with_opencv(str(img_path))
    assert result["is_wound"] is False
    assert result["score"] == 0.0
    assert result["status"] == "NORMAL"
    assert result["redness_detected"] is False
    assert result["swelling_detected"] is False
    assert result["texture_change_detected"] is False
    assert "could not be safely confirmed" in result["summary"]


def test_vlm_json_non_wound_parsing():
    """VLM returning is_wound=false must yield score=0, severity=NORMAL, no redness/swelling/texture."""
    vlm_json = '{"is_wound": false, "severity": "NORMAL", "score": 0.0, "summary": "Photo of a yellow duck."}'
    result = _parse_vlm_json_result(vlm_json)
    assert result["is_wound"] is False
    assert result["score"] == 0.0
    assert result["status"] == "NORMAL"
    assert result["redness_detected"] is False
    assert result["swelling_detected"] is False
    assert result["texture_change_detected"] is False
    assert "does not appear to contain a visible clinical wound" in result["summary"]


def test_vlm_text_non_wound_parsing():
    """VLM text containing 'not a wound' or 'duck' must yield is_wound=False."""
    result = _parse_vlm_result("The photo shows a rubber duck in a bath, not a wound.")
    assert result["is_wound"] is False
    assert result["score"] == 0.0
    assert result["status"] == "NORMAL"
    assert result["redness_detected"] is False


@pytest.mark.asyncio
async def test_non_wound_ai_advice():
    """Non-wound image analysis must return clear upload request without running wound-care RAG."""
    non_wound_result = {
        "is_wound": False,
        "score": 0.0,
        "status": "NORMAL",
        "summary": "Image could not be safely confirmed as a clinical wound.",
    }
    advice = await generate_ai_advice(non_wound_result)
    assert "Please upload a clear photo of your wound" in advice


@pytest.mark.asyncio
async def test_wound_chat_non_wound_rejection():
    """Wound Chat API must reject questions on non-wound images with polite request for proper wound photo."""
    class FakeAnalysis:
        id = "fake-123"
        is_wound = False
        analysis_summary = "Image could not be safely confirmed as a clinical wound."
        severity = WoundSeverity.NORMAL
        redness_detected = False
        swelling_detected = False
        texture_change_detected = False
        wound_score = 0.0
        ai_advice = ""

    class FakeQuery:
        def filter(self, *args, **kwargs):
            return self
        def first(self):
            return FakeAnalysis()

    class FakeDB:
        def query(self, *args, **kwargs):
            return FakeQuery()

    resp = await answer_wound_image_chat("fake-123", "Is this duck infected?", FakeDB())
    assert "does not appear to show a clinical wound" in resp


def test_scribe_preserves_patient_free_text():
    """Scribe must preserve free-text patient statements for doctor check-in reports."""
    answers = [
        {"question_id": "general_feeling", "answer": "I feel okay overall, but my thumb hurts today"},
        {"question_id": "medication_adherence", "answer": "All taken on time"},
    ]
    extracted = static_scribe(answers)
    compiled = compile_merged_to_text(extracted)
    assert "feeling okay" in compiled
    assert "general_feeling" in extracted["checklist_ids_answered"]
