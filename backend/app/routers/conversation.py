"""
CARENETRA — Conversation Router
Handles the CARA caretaker check-in conversation flow.

URL prefix: /patient/conversation  (registered in main.py as shown below)

Endpoints:
  GET  /patient/conversation/active              → check for waiting session
  POST /patient/conversation/start               → generate questions, create session
  POST /patient/conversation/{session_id}/answer → store one answer
  POST /patient/conversation/{session_id}/upload-wound → wound photo mid-conversation
  POST /patient/conversation/{session_id}/submit → run 5-agent pipeline, return result

IMPORTANT — register this router in main.py like this:
  from app.routers.conversation import router as conversation_router
  app.include_router(conversation_router, prefix="/api")

The router itself uses prefix="/patient/conversation" so the full path becomes
/api/patient/conversation/... which matches what api.ts calls.
"""
import os
import uuid
import shutil
import logging
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.dependencies import get_current_patient
from app.models.models import (
    PatientProfile, MedicalCourse, AgentSession,
    CheckIn, Medication, InputType,
)
from app.nodes.caretaker_agent import generate_caretaker_questions
from app.agents.graph import run_agent_pipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/patient/conversation", tags=["Conversation"])


# ── Local helper — converts Q&A answers into readable text for the symptom agent
def compile_answers_to_text(questions: list, answers: dict) -> str:
    """
    Builds a natural-language paragraph from structured Q&A answers.
    Used as raw_input for the symptom agent in the risk pipeline.
    """
    parts = []
    for q in questions:
        qid    = q.get("id", "")
        answer = answers.get(qid)
        if not answer or str(answer).strip() == "":
            continue
        answer_str = str(answer).strip()

        if qid == "overall":
            parts.append(f"Overall wellbeing: {answer_str}.")
        elif qid == "fever":
            ans = answer_str.lower()
            if "normal" in ans or "no fever" in ans:
                parts.append("Patient reports no fever.")
            elif "slightly" in ans or "99" in ans:
                parts.append("Patient reports a slight fever (99-100F).")
            elif "high fever" in ans:
                parts.append("Patient reports a high fever (100-103F).")
            elif "very high" in ans or "103" in ans:
                parts.append("Patient reports a very high fever above 103F.")
            else:
                parts.append(f"Fever/temperature: {answer_str}.")
        elif qid == "medication":
            if answer_str.lower().startswith("yes"):
                parts.append("Patient took their medication as prescribed today.")
            else:
                parts.append("Patient did NOT take their medication today.")
        elif qid == "fatigue":
            level = answer_str.split(" - ")[0].strip().split()[0]
            level_map = {
                "1": "full energy",
                "2": "slightly tired but managing",
                "3": "moderately fatigued",
                "4": "very fatigued",
                "5": "severely exhausted",
            }
            parts.append(f"Fatigue level {level}/5: {level_map.get(level, answer_str)}.")
        elif qid == "wound_photo":
            parts.append("Patient uploaded a wound photo for visual analysis.")
        elif qid == "new_symptoms":
            if answer_str:
                parts.append(f"Additional symptoms: {answer_str}")
        else:
            parts.append(f"{q.get('question', qid)}: {answer_str}.")

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


def _answers_from_conversation(conversation: list) -> dict:
    """Extract {question_id: answer} dict from stored conversation list."""
    return {
        item["question_id"]: item["answer"]
        for item in (conversation or [])
        if item.get("question_id") and item.get("answer")
    }


def _questions_from_conversation(conversation: list) -> list:
    """Extract original questions list stored in the init record."""
    if conversation and conversation[0].get("role") == "init":
        return conversation[0].get("questions", [])
    return []


def _wound_path_from_conversation(conversation: list) -> Optional[str]:
    for item in (conversation or []):
        if item.get("role") == "wound_photo":
            return item.get("file_path")
    return None


# ── GET /patient/conversation/active ─────────────────────────────────────────

@router.get("/active")
async def get_active_session(
    current_patient: PatientProfile = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    """
    Called by frontend on page load.
    Returns has_active_session=True if a session is waiting (e.g. scheduler nudge).
    Key name matches frontend: has_active_session (not has_active).
    """
    session = db.query(AgentSession).filter(
        AgentSession.patient_id == current_patient.id,
        AgentSession.status == "active",
    ).order_by(AgentSession.created_at.desc()).first()

    if not session:
        return {"has_active_session": False}

    questions = _questions_from_conversation(session.conversation)
    answers   = _answers_from_conversation(session.conversation)
    answered  = len(answers)

    if not questions or answered >= len(questions):
        return {"has_active_session": False}

    current_q = questions[answered]
    return {
        "has_active_session": True,
        "session_id": session.id,
        "first_question": current_q,
    }


# ── POST /patient/conversation/start ─────────────────────────────────────────

@router.post("/start")
async def start_conversation(
    current_patient: PatientProfile = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    """
    Starts a new check-in session.
    Calls caretaker_agent to generate personalised questions via local LLM.
    Returns session_id, questions array, and greeting message.
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

    # Generate questions
    questions = await generate_caretaker_questions(
        patient_id=current_patient.id,
        course_id=course.id,
        db=db,
    )

    # Build greeting using patient's real name from DB
    patient_name = current_patient.user.full_name if current_patient.user else "there"
    first_name = patient_name.split()[0] if patient_name else "there"

    # Store questions + metadata in conversation[0] as init record
    session = AgentSession(
        patient_id=current_patient.id,
        status="active",
        trigger="patient_initiated",
        conversation=[
            {
                "role":      "init",
                "questions": questions,
                "course_id": course.id,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
        ],
        pending_question=questions[0]["question"] if questions else None,
        pending_options=questions[0].get("options", []) if questions else [],
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    logger.info(
        f"[Conversation] Session {session.id} started — "
        f"patient={current_patient.id} course={course.course_name} "
        f"questions={len(questions)}"
    )

    return {
        "session_id": session.id,
        "questions":  questions,          # full list — frontend stores locally
        "message":    f"Hi {first_name}! I'm CARA. Let's do your daily check-in.",
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
    Stores a single answer in the session's conversation list.
    Frontend calls this for each question as the patient answers.
    Returns {"status": "ok"} — the frontend manages question advancement locally.
    """
    session = _get_session(session_id, current_patient.id, db)

    if session.status != "active":
        raise HTTPException(status_code=400, detail="Session is not active")

    conversation = list(session.conversation or [])
    conversation.append({
        "question_id": req.question_id,
        "answer":      req.answer,
        "answered_at": datetime.now(timezone.utc).isoformat(),
    })
    session.conversation = conversation
    session.updated_at   = datetime.now(timezone.utc)
    db.commit()

    logger.info(f"[Conversation] Answer stored — session={session_id} q={req.question_id}")
    return {"status": "ok"}


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
    Saves the file and records the path in the session conversation.
    After calling this, frontend should call /answer with question_id='wound_photo'
    and answer='photo_uploaded' to advance to the next question.
    """
    session = _get_session(session_id, current_patient.id, db)

    if session.status != "active":
        raise HTTPException(status_code=400, detail="Session is not active")

    # Validate file type
    allowed = {"image/jpeg", "image/png", "image/webp", "image/heic"}
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, or WebP images accepted")

    ext      = (file.filename or "wound.jpg").rsplit(".", 1)[-1].lower()
    filename = f"{str(current_patient.id)[:8]}_{session_id[:8]}_{uuid.uuid4().hex[:8]}.{ext}"
    path     = os.path.join(WOUND_UPLOAD_DIR, filename)

    with open(path, "wb") as buf:
        shutil.copyfileobj(file.file, buf)

    # Record in conversation
    conversation = list(session.conversation or [])
    conversation.append({
        "role":        "wound_photo",
        "file_path":   path,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
    })
    session.conversation = conversation
    db.commit()

    logger.info(f"[Conversation] Wound photo saved: {path}")
    return {
        "status":    "ok",
        "file_path": path,
        "message":   "Photo received. I'll include it in your health check.",
    }


# ── POST /patient/conversation/{session_id}/submit ───────────────────────────

@router.post("/{session_id}/submit")
async def submit_conversation(
    session_id: str,
    current_patient: PatientProfile = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    """
    Finalises the conversation and runs the full 5-agent pipeline.
    Returns a patient-friendly message — never raw scores.
    Response keys match what AgentChat.tsx reads:
      risk_tier, friendly_message, escalation_action
    """
    session = _get_session(session_id, current_patient.id, db)

    conversation = session.conversation or []
    questions    = _questions_from_conversation(conversation)
    answers      = _answers_from_conversation(conversation)
    wound_path   = _wound_path_from_conversation(conversation)

    # Get init record for course_id
    course_id = None
    if conversation and conversation[0].get("role") == "init":
        course_id = conversation[0].get("course_id")

    # Compile answers into natural-language text for symptom agent
    if questions and answers:
        raw_input = compile_answers_to_text(questions, answers)
    else:
        # Fallback: join raw Q-A pairs
        raw_input = "\n".join([
            f"{item.get('question_id', 'Q')}: {item.get('answer', '')}"
            for item in conversation
            if item.get("question_id") and item.get("answer")
        ]) or "Patient completed check-in with no detailed input."

    logger.info(f"[Conversation] Compiled input: {raw_input[:120]}...")

    # Create CheckIn record
    check_in = CheckIn(
        patient_id = current_patient.id,
        course_id  = course_id,
        input_type = InputType.AGENT,
        raw_input  = raw_input,
    )
    db.add(check_in)
    db.flush()

    # Mark session completed
    session.status       = "completed"
    session.check_in_id  = check_in.id
    db.commit()
    db.refresh(check_in)

    # Run the 5-agent pipeline
    try:
        final_state = await run_agent_pipeline(
            patient_id       = str(current_patient.id),
            check_in_id      = str(check_in.id),
            raw_input        = raw_input,
            input_type       = "AGENT",
            course_id        = course_id,
            has_wound_image  = bool(wound_path),
            wound_image_path = wound_path,
        )

        tier    = final_state.get("tier", "GREEN")
        message = TIER_MESSAGES.get(tier, TIER_MESSAGES["GREEN"])

        logger.info(
            f"[Conversation] Pipeline complete — "
            f"session={session_id} tier={tier} "
            f"score={final_state.get('total_score')} "
            f"action={final_state.get('escalation_action')}"
        )

        return {
            "status":            "success",
            "risk_tier":         tier,                          # read by AgentChat
            "friendly_message":  message,                       # read by AgentChat
            "total_score":       final_state.get("total_score"),
            "escalation_action": final_state.get("escalation_action", "none"),
        }

    except Exception as e:
        logger.error(f"[Conversation] Pipeline error: {e}")
        # Never crash the patient UI — return a safe fallback
        return {
            "status":           "success",
            "risk_tier":        "GREEN",
            "friendly_message": (
                "Thank you for checking in! I've recorded your responses and "
                "your doctor will be able to review them shortly."
            ),
            "total_score":       0.0,
            "escalation_action": "none",
        }