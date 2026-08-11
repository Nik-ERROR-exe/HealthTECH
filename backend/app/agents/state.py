"""
AgentState — the single source of truth flowing through every agent node.
Every agent reads from this and writes back to it.
"""
from typing import Optional
from typing_extensions import TypedDict


class AgentState(TypedDict):

    # ── Input (set before graph starts) ──────────────────────────
    patient_id:       str
    check_in_id:      str
    course_id:        Optional[str]
    input_type:       str            # VOICE | TEXT | AGENT
    raw_input:        str            # transcribed text or typed text
    language:         Optional[str]  # session / preferred language code (en|hi|mr)

    # Authoritative structured extraction (Scribe output) for AGENT inputs.
    # When present + input_type == "AGENT", symptom_agent skips its LLM re-extraction.
    scribe_data:      Optional[dict]

    # ── Symptom Intelligence Agent output ─────────────────────────
    fever_level:          Optional[str]   # normal | low_grade | high | critical
    fatigue_score:        Optional[int]   # 1–10
    medication_taken:     Optional[bool]
    medication_time:      Optional[str]
    symptom_summary:      Optional[str]   # LLM plain-english summary
    symptom_llm_score:    Optional[float] # 0–10, LLM-judged severity

    # Wound image (set by API before graph if patient uploaded one)
    has_wound_image:  bool
    wound_image_path: Optional[str]       # local file path

    # ── Vision Analysis Agent output ──────────────────────────────
    wound_severity:           Optional[str]   # NORMAL | MILD | MODERATE | SEVERE
    wound_score:              Optional[float] # 0–10
    wound_analysis_id:        Optional[str]
    redness_detected:         Optional[bool]
    swelling_detected:        Optional[bool]
    texture_change_detected:  Optional[bool]
    wound_analysis_summary:   Optional[str]
    wound_ai_advice:          Optional[str]   # patient-facing advice/tips

    # ── Risk Assessment Agent output ──────────────────────────────
    fever_raw_score:      Optional[float]  # 0–10
    fatigue_raw_score:    Optional[float]  # 0–10
    medication_raw_score: Optional[float]  # 0–10
    total_score:          Optional[float]  # 0–100
    tier:                 Optional[str]    # GREEN | YELLOW | ORANGE | RED | EMERGENCY
    breakdown:            Optional[dict]   # full per-component breakdown
    risk_score_id:        Optional[str]

    # ── Escalation Decision Agent output ──────────────────────────
    escalation_action:    Optional[str]   # none | nudge | notify_doctor | critical_alert | emergency
    alert_id:             Optional[str]
    alert_message:        Optional[str]

    # ── Adaptive Monitoring Agent output ──────────────────────────
    new_interval_hours:   Optional[int]
    interval_reason:      Optional[str]

    # ── Report Agent output ───────────────────────────────────────
    agent_report:         Optional[str]   # RAG-grounded narrative for the doctor

    # ── Error tracking (non-fatal, graph continues) ───────────────
    errors: list[str]