"""
CARENETRA — Question Render Helpers (pure, offline)
Plain functions lifted out of caretaker_agent.py so the Nurse agent and the legacy
question-queue path can share the same personalization + branching logic with zero
circular imports. No LLM, no DB, no network — fully unit-testable.

Importing this module must never touch LLM/DB/translation dependencies.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.nodes.question_bank import QUESTIONS


def _personalize(text: str, state: Dict[str, Any]) -> str:
    """
    Substitutes placeholders in question text with patient-specific values.
    {name}            -> patient first name
    {meds}            -> medication list string
    {day}             -> recovery day number
    {condition_label} -> human-readable condition
    """
    name            = (state.get("patient_name") or "there").split()[0]
    meds_list       = state.get("medications") or []
    condition_label = state.get("condition_label") or "your condition"
    day             = state.get("day", 1)

    # Build a readable meds string — "Metoprolol and Aspirin" or "Metoprolol, Aspirin, and Warfarin"
    if not meds_list:
        meds_str = "your medications"
    elif len(meds_list) == 1:
        meds_str = str(meds_list[0])
    elif len(meds_list) == 2:
        meds_str = f"{meds_list[0]} and {meds_list[1]}"
    else:
        meds_str = ", ".join(str(m) for m in meds_list[:-1]) + f", and {meds_list[-1]}"

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


def _calculate_day(start_date_str: Optional[str]) -> int:
    if not start_date_str:
        return 1
    try:
        start = datetime.strptime(str(start_date_str), "%Y-%m-%d").date()
        delta = datetime.now(timezone.utc).date() - start
        return max(1, delta.days + 1)
    except Exception:
        return 1


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
    from app.nodes.question_bank import BRANCH_RULES

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


# Universal core questions every patient is asked (source of truth for the checklist).
CORE_QUEUE = ["general_feeling", "medication_adherence", "symptoms_today"]