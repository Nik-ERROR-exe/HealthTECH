"""Unit tests for the symptom_agent Scribe short-circuit (no LLM / no DB)."""
import asyncio

from app.nodes import symptom_agent as sym
from app.agents import nvidia_client


class _FakeCheckIn:
    id = "ci-1"


class _FakeQuery:
    def filter(self, *a, **k):
        return self

    def first(self):
        return _FakeCheckIn()


class _FakeSession:
    def query(self, *a, **k):
        return _FakeQuery()

    def commit(self):
        pass

    def rollback(self):
        pass

    def close(self):
        pass


def _base_state(**overrides):
    state = {
        "patient_id": "p1",
        "check_in_id": "ci-1",
        "course_id": "c1",
        "input_type": "AGENT",
        "raw_input": "symptom summary: fever; medication taken: yes",
        "has_wound_image": False,
        "wound_image_path": None,
        "errors": [],
    }
    state.update(overrides)
    return state


def test_agent_with_scribe_data_shortcircuits_llm(monkeypatch):
    sym.SessionLocal = lambda: _FakeSession()

    async def boom(**kwargs):
        raise AssertionError("LLM must NOT be called when scribe_data is present")

    monkeypatch.setattr(nvidia_client.llm_client.chat.completions, "create", boom)

    state = _base_state(scribe_data={
        "fever_level": "high",
        "fatigue_score": 7,
        "medication_taken": True,
        "medication_time": "morning",
        "symptom_summary": "fever and fatigue today",
        "symptom_severity_score": 6.0,
    })
    out = asyncio.run(sym.symptom_agent_node(state))
    assert out["fever_level"] == "high"
    assert out["fatigue_score"] == 7
    assert out["medication_taken"] is True
    assert out["medication_time"] == "morning"
    assert out["symptom_summary"] == "fever and fatigue today"
    assert out["symptom_llm_score"] == 6.0
    assert out["errors"] == []


def test_scribe_values_are_clamped_and_validated(monkeypatch):
    sym.SessionLocal = lambda: _FakeSession()

    async def boom(**kwargs):
        raise AssertionError("LLM must NOT be called")

    monkeypatch.setattr(nvidia_client.llm_client.chat.completions, "create", boom)

    state = _base_state(scribe_data={
        "fever_level": "NOT_A_FEVER",
        "fatigue_score": 99,
        "medication_taken": "yes",
        "symptom_severity_score": 99.0,
    })
    out = asyncio.run(sym.symptom_agent_node(state))
    assert out["fever_level"] == "unknown"       # whitelist fallback
    assert out["fatigue_score"] == 10            # clamped 1-10 (99 -> 10)
    assert out["medication_taken"] is True       # "yes" -> True
    assert out["symptom_llm_score"] == 10.0      # clamped 0-10
    assert out["errors"] == []


def test_agent_without_scribe_data_falls_through_to_llm(monkeypatch):
    sym.SessionLocal = lambda: _FakeSession()

    async def boom(**kwargs):
        raise RuntimeError("simulated LLM outage")

    monkeypatch.setattr(nvidia_client.llm_client.chat.completions, "create", boom)

    # input_type=AGENT but NO scribe_data -> must NOT short-circuit; the LLM path
    # runs, fails, and the agent returns safe defaults with an error recorded.
    state = _base_state(scribe_data=None)
    out = asyncio.run(sym.symptom_agent_node(state))
    assert out["fever_level"] == "unknown"
    assert out["fatigue_score"] is None
    assert any("SymptomAgent LLM call failed" in e for e in out["errors"])


def test_text_input_never_shortcircuits(monkeypatch):
    sym.SessionLocal = lambda: _FakeSession()

    async def boom(**kwargs):
        raise RuntimeError("simulated LLM outage")

    monkeypatch.setattr(nvidia_client.llm_client.chat.completions, "create", boom)

    # Even WITH scribe_data present, a TEXT input must keep the LLM path.
    state = _base_state(input_type="TEXT", scribe_data={"fever_level": "high"})
    out = asyncio.run(sym.symptom_agent_node(state))
    assert out["fever_level"] == "unknown"
    assert any("SymptomAgent LLM call failed" in e for e in out["errors"])