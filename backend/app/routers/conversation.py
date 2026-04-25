"""
CARENETRA — Conversation Router
Handles the CARA caretaker check-in conversation flow (dynamic per‑turn).
"""
import os
import uuid
import shutil
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel

from app.database import get_db
from app.dependencies import get_current_patient
from app.models.models import (
    PatientProfile, MedicalCourse, AgentSession,
    CheckIn, Medication, InputType,
)
from app.nodes.caretaker_agent import start_conversation, process_answer
from app.agents.graph import run_agent_pipeline
from app.services.translation_service import translation_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/patient/conversation", tags=["Conversation"])


# ── Local helper — converts Q&A answers into readable text for the symptom agent
def compile_answers_to_text(answers: List[Dict[str, str]]) -> str:
    """
    Builds a natural-language paragraph from stored answers.
    Used as raw_input for the symptom agent in the risk pipeline.
    """
    if not answers:
        return "Patient completed check-in with minimal input."
    parts = []
    for item in answers:
        qid = item.get("question_id", "")
        ans = item.get("answer", "").strip()
        if not ans:
            continue
        parts.append(f"{qid}: {ans}")
    return " ".join(parts) if parts else "Patient completed check-in with minimal input."


WOUND_UPLOAD_DIR = "uploads/wounds"
os.makedirs(WOUND_UPLOAD_DIR, exist_ok=True)

# ── Tier → patient-friendly message (never exposes raw scores) ───────────────
TIER_MESSAGES = {
    "GREEN": (
        "You're doing great! Everything looks stable today. "
        "Keep taking your medications on schedule and I'll check in with you again soon."
    ),
    "YELLOW": (
        "Thanks for checking in. A couple of things caught my attention — nothing to panic about, "
        "but worth keeping a close eye on. Rest well and stay hydrated today."
    ),
    "ORANGE": (
        "I've flagged a few things to your doctor. They'll be notified shortly. "
        "Please rest and avoid any strenuous activity for now."
    ),
    "RED": (
        "I'm concerned about some of your symptoms and have sent an urgent alert to your doctor "
        "and your emergency contact. Please rest immediately and keep your phone close."
    ),
    "EMERGENCY": (
        "Your symptoms are very serious. I've notified your doctor for emergency action. "
        "Please do not be alone right now. If you are in immediate danger, call emergency services."
    ),
}


# ── Pydantic models ───────────────────────────────────────────────────────────

class AnswerRequest(BaseModel):
    question_id: str
    answer: str
    language: str = "en"  # Language code (en, hi, mr)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_active_course(patient_id: str, db: Session) -> Optional[MedicalCourse]:
    return (
        db.query(MedicalCourse)
        .filter(
            MedicalCourse.patient_id == patient_id,
            MedicalCourse.status == "ACTIVE",
        )
        .order_by(MedicalCourse.created_at.desc())
        .first()
    )


def _get_session(session_id: str, patient_id: str, db: Session) -> AgentSession:
    session = db.query(AgentSession).filter(
        AgentSession.id == session_id,
        AgentSession.patient_id == patient_id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session


def _extract_state_from_conversation(conversation: list) -> Dict[str, Any]:
    """Retrieve the conversation state from the stored conversation list."""
    for item in (conversation or []):
        if item.get("role") == "state":
            return item.get("data", {})
    return {}


def _update_state_in_conversation(conversation: list, state: Dict[str, Any]) -> list:
    """Update or insert the state record in the conversation list."""
    new_conv = []
    found = False
    for item in (conversation or []):
        if item.get("role") == "state":
            new_conv.append({"role": "state", "data": state})
            found = True
        else:
            new_conv.append(item)
    if not found:
        new_conv.append({"role": "state", "data": state})
    return new_conv


async def _run_pipeline_and_complete(
    session: AgentSession,
    current_patient: PatientProfile,
    course_id: Optional[str],
    db: Session,
):
    """Run the 5-agent pipeline, create a CheckIn, and return the final response."""
    conversation = session.conversation or []
    state = _extract_state_from_conversation(conversation)
    answers = state.get("answers", [])

    # Compile answers into natural-language text
    raw_input = compile_answers_to_text(answers)

    logger.info(f"[Conversation] Compiled input: {raw_input[:120]}...")

    # Create CheckIn record
    check_in = CheckIn(
        patient_id=current_patient.id,
        course_id=course_id,
        input_type=InputType.AGENT,
        raw_input=raw_input,
    )
    db.add(check_in)
    db.flush()

    # Mark session completed
    session.status = "completed"
    session.check_in_id = check_in.id
    db.commit()
    db.refresh(check_in)

    # Determine wound photo path if any
    wound_path = None
    for item in conversation:
        if item.get("role") == "wound_photo":
            wound_path = item.get("file_path")
            break

    # Run pipeline
    try:
        final_state = await run_agent_pipeline(
            patient_id=str(current_patient.id),
            check_in_id=str(check_in.id),
            raw_input=raw_input,
            input_type="AGENT",
            course_id=course_id,
            has_wound_image=bool(wound_path),
            wound_image_path=wound_path,
        )

        tier = final_state.get("tier", "GREEN")
        message = TIER_MESSAGES.get(tier, TIER_MESSAGES["GREEN"])

        logger.info(
            f"[Conversation] Pipeline complete — "
            f"session={session.id} tier={tier} "
            f"score={final_state.get('total_score')} "
            f"action={final_state.get('escalation_action')}"
        )

        return {
            "status": "success",
            "risk_tier": tier,
            "friendly_message": message,
            "total_score": final_state.get("total_score"),
            "escalation_action": final_state.get("escalation_action", "none"),
        }

    except Exception as e:
        logger.error(f"[Conversation] Pipeline error: {e}")
        return {
            "status": "success",
            "risk_tier": "GREEN",
            "friendly_message": (
                "Thank you for checking in! I've recorded your responses and "
                "your doctor will be able to review them shortly."
            ),
            "total_score": 0.0,
            "escalation_action": "none",
        }


# ── GET /patient/conversation/active ─────────────────────────────────────────

@router.get("/active")
async def get_active_session(
    current_patient: PatientProfile = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    """
    Called by frontend on page load.
    Returns has_active_session=True if a session is waiting.
    """
    session = db.query(AgentSession).filter(
        AgentSession.patient_id == current_patient.id,
        AgentSession.status == "active",
    ).order_by(AgentSession.created_at.desc()).first()

    if not session:
        return {"has_active_session": False}

    # For dynamic sessions, we don't have a simple "first_question" anymore.
    # We'll return the pending question from the session.
    if session.pending_question:
        has_options = bool(session.pending_options)
        # Infer basic type if it's not saved explicitly
        q_type = "mcq" if has_options else "text"
        return {
            "has_active_session": True,
            "session_id": session.id,
            "first_question": {
                "id": f"resumed_{session.id[:8]}",
                "question": session.pending_question,
                "type": q_type,
                "options": session.pending_options,
            },
        }
    else:
        return {"has_active_session": False}


# ── POST /patient/conversation/start ─────────────────────────────────────────

@router.post("/start")
async def start_conversation_endpoint(
    language: str = "en",
    current_patient: PatientProfile = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    """
    Starts a new dynamic check-in session.
    Returns a greeting and the first clinical question.
    Supports multilingual responses (en, hi, mr).
    """
    # Abandon any stale active sessions
    stale = db.query(AgentSession).filter(
        AgentSession.patient_id == current_patient.id,
        AgentSession.status == "active",
    ).all()
    for s in stale:
        s.status = "abandoned"
    db.flush()

    course = _get_active_course(current_patient.id, db)
    if not course:
        raise HTTPException(
            status_code=400,
            detail="No active treatment course found. Ask your doctor to assign one.",
        )

    # Call the new dynamic start function
    result = await start_conversation(
        patient_id=current_patient.id,
        course_id=course.id,
        db=db,
    )

    greeting = result["greeting"]
    first_q = result["first_question"]
    state = result["state"]

    # Translate greeting and question if needed
    if language != "en":
        greeting = translation_service.translate_text(greeting, language)
        first_q["question"] = translation_service.translate_text(first_q["question"], language)
        if "options" in first_q and first_q["options"]:
            first_q["options"] = translation_service.translate_list(first_q["options"], language)

    # Store state and language in session
    session = AgentSession(
        patient_id=current_patient.id,
        status="active",
        trigger="patient_initiated",
        language=language,  # Store language preference
        conversation=[{
            "role": "state",
            "data": state,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }],
        pending_question=first_q["question"],
        pending_options=first_q.get("options", []),
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    logger.info(
        f"[Conversation] Dynamic session {session.id} started — "
        f"patient={current_patient.id} course={course.course_name} language={language}"
    )

    return {
        "session_id": session.id,
        "greeting": greeting,
        "first_question": first_q,
        "language": language,
    }


# ── POST /patient/conversation/{session_id}/answer ───────────────────────────

@router.post("/{session_id}/answer")
async def submit_answer(
    session_id: str,
    req: AnswerRequest,
    current_patient: PatientProfile = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    """
    Stores the answer, decides the next question, and returns it.
    If the conversation is complete, triggers the pipeline and returns final result.
    Supports multilingual responses.
    """
    session = _get_session(session_id, current_patient.id, db)

    if session.status != "active":
        raise HTTPException(status_code=400, detail="Session is not active")

    # Get session language preference
    session_language = session.language if hasattr(session, 'language') else req.language

    # Extract current state
    conversation = list(session.conversation or [])
    state = _extract_state_from_conversation(conversation)

    # Process the answer (translate back to English if needed for processing)
    answer_text = req.answer
    if session_language != "en":
        answer_text = translation_service.translate_text(req.answer, "en")

    result = await process_answer(state, req.question_id, answer_text)

    # Update state in session
    updated_conversation = _update_state_in_conversation(conversation, result["state"])
    session.conversation = updated_conversation
    session.updated_at = datetime.now(timezone.utc)

    # Also store the answer as a separate record for audit (optional)
    updated_conversation.append({
        "role": "answer",
        "question_id": req.question_id,
        "answer": req.answer,
        "answered_at": datetime.now(timezone.utc).isoformat(),
    })
    session.conversation = updated_conversation
    flag_modified(session, "conversation")

    if result["should_submit"]:
        # Conversation complete; run pipeline now
        pipeline_result = await _run_pipeline_and_complete(
            session, current_patient, result["state"].get("course_id"), db
        )
        
        # Translate final response if needed
        if session_language != "en":
            if "friendly_message" in pipeline_result:
                pipeline_result["friendly_message"] = translation_service.translate_text(
                    pipeline_result["friendly_message"],
                    session_language
                )
        
        pipeline_result["language"] = session_language
        return pipeline_result
    else:
        # Return next question
        next_q = result["next_question"]
        
        # Translate question if needed
        if session_language != "en":
            next_q["question"] = translation_service.translate_text(next_q["question"], session_language)
            if "options" in next_q and next_q["options"]:
                next_q["options"] = translation_service.translate_list(next_q["options"], session_language)
        
        # Update pending question in session
        session.pending_question = next_q["question"]
        session.pending_options = next_q.get("options", [])
        db.commit()

        return {
            "status": "ok",
            "next_question": next_q,
            "language": session_language,
        }


# ── POST /patient/conversation/{session_id}/upload-wound ─────────────────────

@router.post("/{session_id}/upload-wound")
async def upload_wound_photo(
    session_id: str,
    file: UploadFile = File(...),
    current_patient: PatientProfile = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    """
    Receives wound photo during a conversation session.
    Saves the file and records the path.
    """
    session = _get_session(session_id, current_patient.id, db)

    if session.status != "active":
        raise HTTPException(status_code=400, detail="Session is not active")

    # Validate file type
    allowed = {"image/jpeg", "image/png", "image/webp", "image/heic"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, or WebP images accepted")

    ext = (file.filename or "wound.jpg").rsplit(".", 1)[-1].lower()
    filename = f"{str(current_patient.id)[:8]}_{session_id[:8]}_{uuid.uuid4().hex[:8]}.{ext}"
    path = os.path.join(WOUND_UPLOAD_DIR, filename)

    with open(path, "wb") as buf:
        shutil.copyfileobj(file.file, buf)

    # Record in conversation
    conversation = list(session.conversation or [])
    conversation.append({
        "role": "wound_photo",
        "file_path": path,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    })
    session.conversation = conversation
    flag_modified(session, "conversation")
    db.commit()

    logger.info(f"[Conversation] Wound photo saved: {path}")
    return {
        "status": "ok",
        "file_path": path,
        "message": "Photo received. I'll include it in your health check.",
    }


# ── POST /patient/conversation/{session_id}/submit ───────────────────────────

@router.post("/{session_id}/submit")
async def submit_conversation(
    session_id: str,
    current_patient: PatientProfile = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    """
    Manually finalises the conversation and runs the 5-agent pipeline.
    This can be called if the frontend decides to end early.
    """
    session = _get_session(session_id, current_patient.id, db)

    # Extract state to get course_id
    state = _extract_state_from_conversation(session.conversation or [])
    course_id = state.get("course_id")

    pipeline_result = await _run_pipeline_and_complete(
        session, current_patient, course_id, db
    )
    return pipeline_result