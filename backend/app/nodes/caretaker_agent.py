"""
CARENETRA — Caretaker Conversation Agent (legacy adapter)

The original static question-queue implementation has been replaced by the
agentic Nurse (Talker) + Scribe (Extractor) flow in nurse_agent.py /
scribe_agent.py. This module is kept as a thin backward-compatible adapter so
callers of `start_conversation` / `process_answer` keep working unchanged.

Public API (delegates to nurse_agent):
  start_conversation(patient_id, course_id, db, language='en') -> {greeting, first_question, state}
  process_answer(state, question_id, answer, db=None, patient_id=None, language='en')
                                                               -> {next_question, state, should_submit}
"""
import logging
from typing import Any, Dict, Optional

from app.nodes.nurse_agent import nurse_respond, start_nurse_session

logger = logging.getLogger(__name__)


async def start_conversation(
    patient_id: str,
    course_id: str,
    db,
    language: str = "en",
) -> Dict[str, Any]:
    """Backward-compatible wrapper around start_nurse_session."""
    return await start_nurse_session(patient_id, course_id, db, language=language)


async def process_answer(
    state: Dict[str, Any],
    question_id: str,
    answer: str,
    db: Optional[Any] = None,
    patient_id: Optional[str] = None,
    language: str = "en",
) -> Dict[str, Any]:
    """Backward-compatible wrapper around nurse_respond."""
    return await nurse_respond(
        state, question_id, answer, db=db, patient_id=patient_id, language=language
    )