"""
Unit tests validating refactored check-in logic, single wound image request flag,
honest risk tier messaging, and dynamic Qdrant RAG image chat.
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

from app.nodes.nurse_agent import nurse_respond, build_checklist, _format_checklist_block
from app.nodes.report_agent import build_report_prompt
from app.routers.conversation import TIER_MESSAGES
from app.services.image_service import answer_wound_image_chat


def test_has_requested_image_prevents_loop():
    """Verify that setting has_requested_image prevents wound_photo from being re-requested."""
    state = {
        "condition": "CARDIAC_BYPASS",
        "checklist": build_checklist("CARDIAC_BYPASS"),
        "has_requested_image": True,
        "covered": [],
    }
    block = _format_checklist_block(state)
    assert "wound_photo (required) (already collected)" in block
    assert "wound_photo is collected via the photo upload button" not in block


@pytest.mark.asyncio
async def test_nurse_respond_wound_photo_ack_completes_session():
    """Verify that photo upload acknowledgment completes the nurse conversation directly."""
    state = {
        "condition": "DEFAULT",
        "checklist": build_checklist("DEFAULT"),
        "has_requested_image": False,
        "transcript": [],
        "collected": {},
        "answers": [],
        "covered": [],
        "turn_count": 1,
        "max_turns": 30,
    }

    result = await nurse_respond(state, "wound_photo", "photo_uploaded")
    assert result["should_submit"] is True
    assert result["next_question"] is None
    assert result["state"]["has_requested_image"] is True
    assert result["state"]["collected"]["wound_photo_taken"] is True


def test_honest_tier_messages():
    """Verify that tier messages report honest risk assessments matching tier names."""
    assert "STABLE" in TIER_MESSAGES["GREEN"]
    assert "MODERATE RISK" in TIER_MESSAGES["YELLOW"]
    assert "HIGH RISK" in TIER_MESSAGES["ORANGE"]
    assert "CRITICAL RISK" in TIER_MESSAGES["RED"]
    assert "EMERGENCY" in TIER_MESSAGES["EMERGENCY"]


def test_report_prompt_strict_accuracy_constraints():
    """Verify that build_report_prompt enforces strict input adherence."""
    state = {
        "total_score": 15.0,
        "tier": "YELLOW",
        "symptom_summary": "Mild fever, knee stiffness",
        "wound_analysis_summary": "Slight erythema around incision",
    }
    prompt = build_report_prompt(state, "Post-op day 3", ["Keep incision clean."])
    assert "STRICT ACCURACY CONSTRAINTS:" in prompt
    assert "EXCLUSIVELY based on the provided check-in inputs" in prompt
    assert "Do NOT invent, infer, or hallucinate" in prompt
    assert "Mild fever, knee stiffness" in prompt


@pytest.mark.asyncio
async def test_image_chat_rag_and_metadata_integration():
    """Verify answer_wound_image_chat queries RAG and synthesizes answer from LLM."""
    mock_db = MagicMock()
    mock_analysis = MagicMock()
    mock_analysis.id = "analysis_123"
    mock_analysis.severity = "MODERATE"
    mock_analysis.analysis_summary = "Incision shows mild swelling and redness."
    mock_analysis.redness_detected = True
    mock_analysis.swelling_detected = True
    mock_analysis.texture_change_detected = False
    mock_analysis.wound_score = 4.5
    mock_analysis.ai_advice = "Apply cold compress and monitor."
    
    mock_db.query.return_value.filter.return_value.first.return_value = mock_analysis

    mock_rag_hits = [
        {"title": "Wound Care Guide", "text": "For mild redness and swelling, apply cold compress for 15 mins."}
    ]

    with patch("app.services.image_service.retrieve", new_callable=AsyncMock) as mock_retrieve, \
         patch("app.agents.nvidia_client.llm_client.chat.completions.create", new_callable=AsyncMock) as mock_llm:
        
        mock_retrieve.return_value = mock_rag_hits
        mock_llm_resp = MagicMock()
        mock_llm_resp.choices = [MagicMock(message=MagicMock(content="Apply a cold compress for 15 minutes as advised by the care guide."))]
        mock_llm.return_value = mock_llm_resp

        answer = await answer_wound_image_chat("analysis_123", "What should I do for the swelling?", mock_db)
        
        assert "cold compress" in answer
        mock_retrieve.assert_called_once()
        mock_llm.assert_called_once()
