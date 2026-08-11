"""
Node 1 — Symptom Intelligence Agent
Reads raw patient input (text or transcribed voice).
Calls NVIDIA LLM to extract structured health data.
Writes extracted fields back into AgentState.
"""
import json
import logging
from sqlalchemy.orm import Session

from app.agents.state import AgentState
from app.agents.nvidia_client import llm_client, LLM_MODEL
from app.database import SessionLocal
from app.models.models import CheckIn

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a clinical data extraction AI assistant embedded in a healthcare monitoring system.

Your job is to extract structured health data from a patient's symptom report. The report may be:
- A transcribed voice message
- A typed free-text message
- A short response to a question

Extract the following fields and return ONLY a valid JSON object with no extra text, no markdown, no explanation:

{
  "fever_level": "<one of: normal, low_grade, high, critical, unknown>",
  "fatigue_score": <integer 1-10 or null if not mentioned>,
  "medication_taken": <true, false, or null if not mentioned>,
  "medication_time": "<string describing when they took it, or null>",
  "symptom_summary": "<1-2 sentence plain English summary of all reported symptoms>",
  "symptom_severity_score": <float 0.0-10.0 representing overall severity of reported symptoms>
}

Fever level mapping:
- normal: no fever mentioned, or patient says they feel fine
- low_grade: mild fever, warm, slightly elevated (99–100.4°F / 37.2–38°C)
- high: high fever (100.4–103°F / 38–39.4°C)
- critical: very high fever (>103°F / >39.4°C) or patient sounds severely unwell
- unknown: patient did not mention fever at all

Fatigue score mapping:
- 1-3: patient feels energetic, doing well
- 4-6: moderate tiredness, manageable
- 7-9: very fatigued, struggling with daily tasks
- 10: completely bedridden, unable to function

For symptom_severity_score:
- 0-2: patient reports feeling well, no significant symptoms
- 3-5: mild symptoms, manageable
- 6-8: moderate to severe symptoms, concerning
- 9-10: critical symptoms, emergency indicators

If information is not present in the input, use null for that field.
Return ONLY the JSON object. Nothing else."""


def _persist_checkin_fields(
    check_in_id: str,
    *,
    fever_level: str,
    fatigue_score: int | None,
    medication_taken: bool | None,
    medication_time: str | None,
    symptom_summary: str,
) -> bool:
    """
    Writes the extracted symptom fields onto the check_ins row in its own
    session. Returns True on success (non-fatal on failure).
    """
    db: Session = SessionLocal()
    try:
        check_in = db.query(CheckIn).filter(CheckIn.id == check_in_id).first()
        if not check_in:
            logger.warning(f"[SymptomAgent] check_in {check_in_id} not found in DB")
            return False
        check_in.fever_level              = fever_level
        check_in.fatigue_score            = fatigue_score
        check_in.medication_taken         = medication_taken
        check_in.medication_time_reported = medication_time
        check_in.symptom_summary          = symptom_summary
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        logger.error(f"[SymptomAgent] DB write failed: {e}")
        return False
    finally:
        db.close()


def _apply_scribe_to_state(state: AgentState, scribe: dict, errors: list) -> AgentState:
    """
    AGENT-input short-circuit: the Scribe already extracted the structured data,
    so symptom_agent just normalizes + persists it instead of re-running the LLM.
    Best-effort — every value is sanitized to the same invariants as the LLM path.
    """
    fever = str(scribe.get("fever_level") or "unknown").lower()
    if fever not in {"normal", "low_grade", "high", "critical", "unknown"}:
        fever = "unknown"

    fatigue = scribe.get("fatigue_score")
    if fatigue is not None:
        try:
            fatigue = max(1, min(10, int(fatigue)))
        except (TypeError, ValueError):
            fatigue = None

    med = scribe.get("medication_taken")
    med_bool = None
    if isinstance(med, bool):
        med_bool = med
    elif isinstance(med, str):
        t = med.strip().lower()
        if t in ("true", "yes", "taken", "all taken", "1"):
            med_bool = True
        elif t in ("false", "no", "missed", "0"):
            med_bool = False

    med_time = scribe.get("medication_time") or None
    summary  = str(scribe.get("symptom_summary") or "").strip() or "No symptoms reported."
    llm_score = float(scribe.get("symptom_severity_score") or 0.0)
    llm_score = max(0.0, min(10.0, llm_score))

    if not _persist_checkin_fields(
        state["check_in_id"],
        fever_level=fever,
        fatigue_score=fatigue,
        medication_taken=med_bool,
        medication_time=med_time,
        symptom_summary=summary,
    ):
        errors.append("SymptomAgent DB write failed (scribe path)")

    logger.info(f"[SymptomAgent] Used Scribe output — skipped LLM extraction (patient {state['patient_id']})")
    return {
        **state,
        "fever_level":      fever,
        "fatigue_score":    fatigue,
        "medication_taken": med_bool,
        "medication_time":  med_time,
        "symptom_summary":  summary,
        "symptom_llm_score": llm_score,
        "errors":           errors,
    }


async def symptom_agent_node(state: AgentState) -> AgentState:
    """
    Extracts structured health data from patient raw input using NVIDIA LLM.
    Updates the check_ins table with extracted values.

    For AGENT inputs the Scribe has already extracted this data (`scribe_data`),
    so the LLM call is skipped entirely (saves metered free-tier credits).
    """
    logger.info(f"[SymptomAgent] Starting for patient {state['patient_id']}")
    errors = list(state.get("errors", []))

    # ── Scribe short-circuit (AGENT inputs only) ─────────────────────────
    scribe = state.get("scribe_data") or {}
    if state.get("input_type") == "AGENT" and scribe:
        return _apply_scribe_to_state(state, scribe, errors)

    raw_input = state.get("raw_input", "").strip()

    if not raw_input:
        logger.warning("[SymptomAgent] No input text found — skipping LLM call")
        return {
            **state,
            "fever_level": "unknown",
            "fatigue_score": None,
            "medication_taken": None,
            "medication_time": None,
            "symptom_summary": "No input provided by patient.",
            "symptom_llm_score": 0.0,
            "errors": errors,
        }

    # ── Call NVIDIA LLM ──────────────────────────────────────────
    try:
        response = await llm_client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user",   "content": f"Patient report: {raw_input}"},
            ],
            temperature=0.1,   # low temp for consistent extraction
            max_tokens=400,
        )

        raw_json = response.choices[0].message.content.strip()

        # Strip markdown fences if model wraps in ```json
        if raw_json.startswith("```"):
            raw_json = raw_json.split("```")[1]
            if raw_json.startswith("json"):
                raw_json = raw_json[4:]
        raw_json = raw_json.strip()

        extracted: dict = json.loads(raw_json)
        logger.info(f"[SymptomAgent] Extracted: {extracted}")

    except json.JSONDecodeError as e:
        logger.error(f"[SymptomAgent] JSON parse error: {e}")
        errors.append(f"SymptomAgent JSON parse failed: {e}")
        extracted = {}
    except Exception as e:
        logger.error(f"[SymptomAgent] LLM call failed: {e}")
        errors.append(f"SymptomAgent LLM call failed: {e}")
        extracted = {}

    # ── Parse extracted fields with safe defaults ────────────────
    fever_level       = extracted.get("fever_level", "unknown")
    fatigue_score     = extracted.get("fatigue_score")
    medication_taken  = extracted.get("medication_taken")
    medication_time   = extracted.get("medication_time")
    symptom_summary   = extracted.get("symptom_summary", "Unable to summarize symptoms.")
    symptom_llm_score = float(extracted.get("symptom_severity_score") or 0.0)

    # Validate fever_level
    valid_fever = {"normal", "low_grade", "high", "critical", "unknown"}
    if fever_level not in valid_fever:
        fever_level = "unknown"

    # Clamp scores to valid ranges
    if fatigue_score is not None:
        fatigue_score = max(1, min(10, int(fatigue_score)))
    symptom_llm_score = max(0.0, min(10.0, symptom_llm_score))

    # ── Persist to check_ins table ───────────────────────────────
    if _persist_checkin_fields(
        state["check_in_id"],
        fever_level=fever_level,
        fatigue_score=fatigue_score,
        medication_taken=medication_taken,
        medication_time=medication_time,
        symptom_summary=symptom_summary,
    ):
        logger.info(f"[SymptomAgent] check_in {state['check_in_id']} updated in DB")
    else:
        errors.append(f"SymptomAgent DB write failed: {state['check_in_id']}")

    return {
        **state,
        "fever_level":      fever_level,
        "fatigue_score":    fatigue_score,
        "medication_taken": medication_taken,
        "medication_time":  medication_time,
        "symptom_summary":  symptom_summary,
        "symptom_llm_score": symptom_llm_score,
        "errors":           errors,
    }