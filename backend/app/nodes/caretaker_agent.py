"""
CARENETRA — Caretaker Conversation Agent
Pure Python state machine backed by question_bank.py, plus optional LLM
adaptive follow-ups that are grounded in the patient's condition and history.

Uses question_bank.py for the base question text, options, and branching rules.
Personalization via f-string substitution (patient name, meds, day number).
When `db`/`patient_id` are provided, up to MAX_ADAPTIVE_FOLLOWUPS adaptive
LLM follow-up questions may be inserted; any failure falls back to the bank
(so the fully-offline path remains reachable).

Public API (called by conversation.py):
  start_conversation(patient_id, course_id, db) → {greeting, first_question, state}
  process_answer(state, question_id, answer, db=None, patient_id=None)
                                                → {next_question, state, should_submit}
"""
import logging
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from sqlalchemy.orm import Session

from app.models.models import PatientProfile, MedicalCourse, Medication
from app.nodes.question_bank import (
    QUESTIONS,
    CONDITION_QUEUES,
    BRANCH_RULES,
    CONDITION_LABELS,
    GREETING_TEMPLATES,
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Personalization helpers
# ─────────────────────────────────────────────────────────────────────────────

def _personalize(text: str, state: Dict[str, Any]) -> str:
    """
    Substitutes placeholders in question text with patient-specific values.
    {name}            → patient first name
    {meds}            → medication list string
    {day}             → recovery day number
    {condition_label} → human-readable condition
    """
    name            = state.get("patient_name", "there").split()[0]
    meds_list       = state.get("medications", [])
    condition_label = state.get("condition_label", "your condition")
    day             = state.get("day", 1)

    # Build a readable meds string — "Metoprolol and Aspirin" or "Metoprolol, Aspirin, and Warfarin"
    if not meds_list:
        meds_str = "your medications"
    elif len(meds_list) == 1:
        meds_str = meds_list[0]
    elif len(meds_list) == 2:
        meds_str = f"{meds_list[0]} and {meds_list[1]}"
    else:
        meds_str = ", ".join(meds_list[:-1]) + f", and {meds_list[-1]}"

    return (
        text
        .replace("{name}",            name)
        .replace("{meds}",            meds_str)
        .replace("{day}",             str(day))
        .replace("{condition_label}", condition_label)
    )


def _build_question(question_id: str, state: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """
    Returns a fully personalized question dict ready for the frontend.
    Returns None if question_id is not in the bank.
    """
    template = QUESTIONS.get(question_id)
    if not template:
        logger.warning(f"[CaretakerAgent] Unknown question_id: {question_id}")
        return None

    question_text = _personalize(template["question"], state)
    spoken_text   = _personalize(template.get("spoken", template["question"]), state)

    return {
        "id":       question_id,
        "question": question_text,
        "spoken":   spoken_text,
        "type":     template["type"],
        "options":  list(template.get("options", [])),
    }


def _calculate_day(start_date_str: str) -> int:
    if not start_date_str:
        return 1
    try:
        start = datetime.strptime(start_date_str, "%Y-%m-%d").date()
        delta = datetime.now(timezone.utc).date() - start
        return max(1, delta.days + 1)
    except Exception:
        return 1


# ─────────────────────────────────────────────────────────────────────────────
# Core queue — same for every patient, every condition
# ─────────────────────────────────────────────────────────────────────────────

CORE_QUEUE = ["general_feeling", "medication_adherence", "symptoms_today"]


# ─────────────────────────────────────────────────────────────────────────────
# Branch insertion
# ─────────────────────────────────────────────────────────────────────────────

def _apply_branches(
    question_id:    str,
    answer:         str,
    remaining_queue: List[str],
    covered:        List[str],
) -> List[str]:
    """
    Checks branch rules for the just-answered question.
    If the answer contains a trigger keyword, inserts the branch question IDs
    at the FRONT of the remaining queue (if not already covered or queued).
    Returns the (possibly modified) queue.
    """
    rules = BRANCH_RULES.get(question_id, [])
    answer_lower = answer.lower()

    to_insert = []
    for keywords, branch_ids in rules:
        if any(kw in answer_lower for kw in keywords):
            for bid in branch_ids:
                if bid not in covered and bid not in remaining_queue and bid not in to_insert:
                    to_insert.append(bid)
            break  # only apply first matching rule per question

    return to_insert + remaining_queue


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

async def start_conversation(
    patient_id: str,
    course_id:  str,
    db:         Session,
) -> Dict[str, Any]:
    """
    Initialises conversation state and returns:
      greeting       — personalised greeting string
      first_question — the first question dict (general_feeling)
      state          — full state dict to store in AgentSession
    """
    # Load course and patient from DB
    course  = db.query(MedicalCourse).filter(MedicalCourse.id == course_id).first()
    patient = db.query(PatientProfile).filter(PatientProfile.id == patient_id).first()

    if not course:
        raise ValueError(f"Course not found: {course_id}")

    # Medication names for personalization
    medications = db.query(Medication).filter(
        Medication.course_id == course_id,
        Medication.is_active == True,
    ).all()
    med_names = [m.name for m in medications]

    # Condition details
    condition       = course.condition_type.value
    condition_label = CONDITION_LABELS.get(condition, "your condition")
    day             = _calculate_day(course.start_date)

    # Patient name
    patient_name = "there"
    if patient and patient.user:
        patient_name = patient.user.full_name or "there"

    # Build full question queue: core + condition-specific
    condition_q = CONDITION_QUEUES.get(condition, CONDITION_QUEUES["DEFAULT"])
    full_queue  = CORE_QUEUE + condition_q   # first item will be popped immediately

    state = {
        "patient_name":     patient_name,
        "condition":        condition,
        "condition_label":  condition_label,
        "day":              day,
        "medications":      med_names,
        "patient_context":  getattr(course, "patient_context", "") or "",
        "course_id":        course_id,
        "covered":          [],           # question IDs already answered
        "answers":          [],           # [{question_id, answer}, ...]
        "question_queue":   full_queue[1:],  # remaining after first
    }

    # Build greeting — rotate by day number
    greeting_template = GREETING_TEMPLATES[(day - 1) % len(GREETING_TEMPLATES)]
    greeting = _personalize(greeting_template, state)

    # First question
    first_q = _build_question(full_queue[0], state)

    logger.info(
        f"[CaretakerAgent] Session started — patient={patient_id} "
        f"condition={condition} day={day} queue_length={len(full_queue)}"
    )

    return {
        "greeting":       greeting,
        "first_question": first_q,
        "state":          state,
    }


async def process_answer(
    state:       Dict[str, Any],
    question_id: str,
    answer:      str,
    db:          Optional[Session] = None,
    patient_id:  Optional[str]     = None,
) -> Dict[str, Any]:
    """
    Records the answer, applies branching rules, and returns the next question.
    If queue is empty → should_submit = True.

    When `db` and `patient_id` are provided, an LLM adaptive follow-up may be
    inserted before the next static question (capped by MAX_ADAPTIVE_FOLLOWUPS).

    Returns:
      next_question  — dict or None
      state          — updated state
      should_submit  — True when all questions are done
    """
    # Record answer
    state["answers"].append({"question_id": question_id, "answer": answer})
    state["covered"].append(question_id)

    logger.info(f"[CaretakerAgent] Answer recorded — q={question_id} a={answer[:40]}")

    # Get remaining queue (copy to avoid mutation issues)
    remaining = list(state.get("question_queue", []))

    # Apply branch rules — may insert questions at front
    remaining = _apply_branches(
        question_id=question_id,
        answer=answer,
        remaining_queue=remaining,
        covered=state["covered"],
    )

    # Skip questions already covered (safety check)
    while remaining and remaining[0] in state["covered"]:
        remaining.pop(0)

    if not remaining:
        # All done — submit
        state["question_queue"] = []
        logger.info(f"[CaretakerAgent] Conversation complete — {len(state['answers'])} answers collected")
        return {
            "next_question": None,
            "state":         state,
            "should_submit": True,
        }

    # Pop next question
    next_id   = remaining.pop(0)
    state["question_queue"] = remaining
    next_q    = _build_question(next_id, state)

    if next_q is None:
        # Unknown question ID — skip and recurse with a dummy answer
        logger.warning(f"[CaretakerAgent] Skipping unknown question: {next_id}")
        state["covered"].append(next_id)
        return await process_answer(state, next_id, "skipped")

    logger.info(f"[CaretakerAgent] Next question: {next_id} (queue remaining: {len(remaining)})")

    # ── Adaptive LLM follow-up (capped) — inserted BEFORE the static question ──
    adaptive_count = state.get("adaptive_count", 0)
    if db is not None and patient_id is not None and adaptive_count < MAX_ADAPTIVE_FOLLOWUPS:
        adaptive = None
        try:
            from app.nodes.adaptive_questions import MAX_ADAPTIVE_FOLLOWUPS, maybe_adaptive_followup
            adaptive = await maybe_adaptive_followup(state, db, str(patient_id))
        except Exception as exc:
            logger.warning(f"[CaretakerAgent] Adaptive follow-up failed: {exc}")
        if adaptive:
            adaptive_count += 1
            state["adaptive_count"] = adaptive_count
            # Keep the static question queued so it is asked right after.
            state["question_queue"] = [next_id] + remaining
            next_q = adaptive
            logger.info(f"[CaretakerAgent] Adaptive follow-up #{adaptive_count} inserted")

    return {
        "next_question": next_q,
        "state":         state,
        "should_submit": False,
    }