"""Unit tests for the emergency keyword intercept (no LLM / DB calls)."""
import asyncio

from app.nodes.nurse_agent import EMERGENCY_KEYWORDS_RE, nurse_respond


# ── Regex coverage ───────────────────────────────────────────────────────────

def test_regex_matches_every_red_flag_phrase():
    phrases = [
        "I have chest pain",
        "I can't breathe",
        "I cannot breathe",
        "bleeding heavily from my wound",
        "please call doctor now",
        "severe pain in my chest",
        "I am in very pain",
        "he is unconscious",
        "help me",
        "HELP, CANNOT BREATHE",
    ]
    for phrase in phrases:
        assert EMERGENCY_KEYWORDS_RE.search(phrase), phrase


def test_regex_rejects_benign_text():
    benign = [
        "helpful tip for recovery",
        "i need some help with the app",  # "help" is a red flag on purpose, but:
        "my pain is mild today",
        "feeling fine, no chest issues",
        "I was unconsciousness awareness exercise",
    ]
    # "help" is intentionally a red flag even in "help with the app"; only
    # clearly non-emergency usages like "helpful" must be excluded.
    assert not EMERGENCY_KEYWORDS_RE.search("a helpful reminder")
    assert not EMERGENCY_KEYWORDS_RE.search("helpless")
    assert not EMERGENCY_KEYWORDS_RE.search("my pain is mild today")


# ── nurse_respond short-circuit (before any LLM call) ────────────────────────

def test_nurse_respond_force_submits_emergency_without_llm():
    state = {"condition": "DEFAULT", "course_id": "c1"}

    async def run():
        return await nurse_respond(
            state,
            question_id="general_feeling",
            answer="I have severe chest pain and can't breathe",
            db=None,
            patient_id="p1",
            language="en",
        )

    result = asyncio.run(run())
    assert result["emergency_triggered"] is True
    assert result["should_submit"] is True
    assert result["next_question"] is None
    assert result["state"]["risk_tier"] == "EMERGENCY"
    assert result["state"]["emergency_triggered"] is True
    assert result["state"]["complete"] is True
    # The patient's emergency statement is preserved in the transcript
    transcript = result["state"]["transcript"]
    assert any(
        t.get("role") == "patient"
        and "can't breathe" in t.get("content", "")
        for t in transcript
    )
