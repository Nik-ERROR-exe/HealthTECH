"""Unit tests for the vision wound-advice language guardrail (no LLM / DB)."""
from app.nodes.vision_agent import _advice_system_prompt, _static_advice


def test_advice_prompt_pins_language():
    prompt = _advice_system_prompt("hi")
    assert "CRITICAL LANGUAGE RULE" in prompt
    assert "'hi'" in prompt
    assert "Never default to French, Spanish, or any other language" in prompt


def test_advice_prompt_replaces_weak_rule():
    # The old prompt used the weak "Respond in '<lang>'." suffix — must be gone.
    prompt = _advice_system_prompt("mr")
    assert "Respond in 'mr'." not in prompt


def test_advice_prompt_accepts_each_language():
    for lang in ("en", "hi", "mr"):
        prompt = _advice_system_prompt(lang)
        assert f"'{lang}'" in prompt
        assert prompt.startswith("You are CARA")


def test_static_advice_unchanged():
    assert "contact" in _static_advice("SEVERE", 8.0)
    assert "stable" in _static_advice("NORMAL", 1.0)
