"""
CARENETRA — Nurse Agent (The Talker)

Goal-oriented LLM conversation for the daily check-in. Replaces the static
question-queue in caretaker_agent.py with a conversational loop:

  * Each patient message triggers ONE LLM call (the Nurse) that replies in the
    patient's language, best-effort extracts structured fields, and decides
    whether the check-in is complete.
  * The Nurse's prompt lists the STILL-NEEDED data points (derived from the
    question bank), the patient's known context + social memory, and — only when
    the turn warrants it — RAG care-guideline excerpts it may use for medical
    answers (guardrail: everything else defers to the doctor).
  * All LLM calls are non-fatal: on any failure we fall back to the static
    question bank, so the fully-offline path always works.

The Scribe agent (scribe_agent.py) later does one authoritative extraction pass
over the whole transcript; this module only produces incremental `collected`.

Public API (called by conversation.py):
  start_nurse_session(patient_id, course_id, db, language) -> {greeting, first_question, state}
  nurse_respond(state, question_id, answer, db, patient_id, language) -> {next_question, state, should_submit}
"""
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.agents.nvidia_client import LLM_MODEL, llm_client
from app.config import settings
from app.models.models import MedicalCourse, Medication, PatientProfile
from app.nodes.question_bank import CONDITION_QUEUES, CONDITION_LABELS, GREETING_TEMPLATES, QUESTIONS
from app.nodes.question_render import (
    CORE_QUEUE,
    _apply_branches,
    _build_question,
    _calculate_day,
    _personalize,
)

logger = logging.getLogger(__name__)

# ── Tuning constants ─────────────────────────────────────────────────────────
MAX_NURSE_TURNS            = 30    # hard cap per session (LLM is metered)
MIN_TURNS_BEFORE_SUBMIT    = 2     # safety floor (informational)
NURSE_TURN_WINDOW          = 10    # transcript turns fed to the LLM
NURSE_RAG_TOP_K            = 3     # guideline chunks injected per turn
NURSE_HISTORY_CHAR_LIMIT   = 2500  # bound on the history block passed to the LLM

_LANGUAGE_NAMES = {"en": "English", "hi": "Hindi", "mr": "Marathi"}

# The literal answer the frontend sends when the patient uploads a wound photo.
PHOTO_UPLOADED_ANSWER = "photo_uploaded"


# ── RAG throttling (only retrieve when the turn warrants it) ────────────────
# Short conversational acknowledgments skip retrieval entirely; a turn is only
# worth a lookup when it contains a patient question or a symptom/medication/
# medical-inquiry mention. Conserves free NVIDIA embedding credits + latency.
_ACK_ONLY = {
    "yes", "no", "ok", "okay", "sure", "fine", "good", "great", "yep", "nope",
    "yeah", "maybe", "done", "y", "n", "na", "idk", "not sure", "not really",
    "feeling good", "no new symptoms", "no issues", "normal", "none", "nothing",
    "i'm fine", "i am fine", "i feel fine", "all good", "not much", "can't",
    "cannot", "no problem", "sure thing", "will do", "took them", "took it",
    "still feeling it", "hmm", "um", "uh", "thanks",
}

_QUESTION_MARKERS = (
    "what", "why", "how", "when", "where", "which", "who", "should", "can",
    "could", "would", "will", "do i", "does ", "is it", "is that", "is this",
    "am i", "are you", "can you", "should i", "whats", "what's", "?",
    "how much", "how long", "wondering", "curious",
)

_SYMPTOM_MARKERS = (
    "fever", "pain", "hurt", "hurting", "painful", "medication", "medicine",
    "meds", "dose", "doses", "dosage", "symptom", "symptoms", "wound", "swelling",
    "swollen", "bleed", "bleeding", "breath", "breathing", "dizzy", "dizziness",
    "nausea", "vomit", "fatigue", "tired", "worried", "worry", "abnormal",
    "warning", "sign", "risk", "infection", "side effect", "discharge", "rash",
    "itch", "itching", "weight", "heart", "chest", "blood", "sugar", "pressure",
    "inhaler", "insulin", "temperature", "thermometer", "dangerous", "urgent",
    "emergency", "low", "high", "normal",
)

# ── Emergency keyword intercept ──────────────────────────────────────────────
# Red-flag phrases (English) that short-circuit the Nurse BEFORE any LLM call:
# the check-in is force-submitted as EMERGENCY and escalation is invoked
# immediately. Word-boundaries keep "helpful"/"helpless" out of the "help" match.
EMERGENCY_KEYWORDS_RE = re.compile(
    r"chest pain|can'?t breathe|cannot breathe|can not breathe|bleeding heavily|"
    r"call doctor|severe pain|in very pain|unconscious|\bhelp\b",
    re.IGNORECASE,
)


def _should_invoke_rag(text: Optional[str]) -> bool:
    """True if a retrieval is worth running for this turn (question/inquiry)."""
    t = (text or "").strip().lower()
    if not t:
        return False
    if t in _ACK_ONLY:
        return False
    # Very short replies that are acknowledgments / single token
    if len(t.split()) <= 2 and t not in _QUESTION_MARKERS:
        return False
    if any(m in t for m in _QUESTION_MARKERS):
        return True
    if any(k in t for k in _SYMPTOM_MARKERS):
        return True
    return False


# ── Checklist (source of truth: question_bank.py) ───────────────────────────

def build_checklist(condition: Optional[str]) -> List[Dict[str, Any]]:
    """
    Convert the bank's CORE_QUEUE + condition queue into a per-condition list of
    data points the Nurse must collect. Pure, offline, unit-testable.
    """
    cond_q = list(CONDITION_QUEUES.get(condition or "", CONDITION_QUEUES["DEFAULT"]))
    ids: List[str] = []
    for qid in CORE_QUEUE + cond_q:
        if qid not in ids:
            ids.append(qid)

    checklist: List[Dict[str, Any]] = []
    for qid in ids:
        tpl = QUESTIONS.get(qid)
        if not tpl:
            continue
        checklist.append({
            "id":       qid,
            "label":    qid.replace("_", " ").title(),
            "hint":     tpl.get("question", ""),
            "required": qid in CORE_QUEUE or qid == "wound_photo",
            "satisfied": False,
            "declined": False,
        })
    return checklist


# ── Small pure helpers ───────────────────────────────────────────────────────

def _truncate(text: str, limit: int) -> str:
    text = (text or "").strip()
    if len(text) <= limit:
        return text
    return text[:limit].rstrip() + "..."


def _format_social_memory(social: Optional[Dict[str, Any]]) -> str:
    if not social:
        return ""
    lines = []
    for key, value in social.items():
        if key in ("last_updated",):
            continue
        if isinstance(value, str) and value.strip():
            lines.append(f"- {key.replace('_', ' ')}: {value.strip()}")
        elif isinstance(value, (list, tuple)):
            items = [str(v) for v in value if v]
            if items:
                lines.append(f"- {key.replace('_', ' ')}: {', '.join(items[:6])}")
    return "\n".join(lines)


def _normalize_type(raw: Optional[str]) -> str:
    t = (raw or "text").strip().lower().replace("-", "_")
    if t in ("yesno", "yes_no", "boolean"):
        return "yes_no"
    if t in ("mcq", "choice", "multiple_choice", "options"):
        return "mcq"
    if t in ("photo", "photo_prompt", "image"):
        return "photo"
    return "text"


def _parse_json_object(raw: Optional[str]) -> Optional[dict]:
    """Extract the first top-level JSON object from a possibly-fenced reply."""
    if not raw:
        return None
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        data = json.loads(text[start:end + 1])
    except Exception:
        return None
    return data if isinstance(data, dict) else None


def _sanitize_collected(collected: Any) -> Dict[str, Any]:
    """Keep only JSON-safe scalar values (drop nested structures)."""
    out: Dict[str, Any] = {}
    if not isinstance(collected, dict):
        return out
    for key, value in collected.items():
        if isinstance(value, (str, int, float, bool)) or value is None:
            out[str(key)] = value
    return out


def parse_nurse_envelope(raw: Optional[str], default_id: str = "nurse") -> Optional[Dict[str, Any]]:
    """
    Parse the Nurse's per-turn JSON envelope. Returns None on any failure so
    callers can fall back to the static bank.
    """
    data = _parse_json_object(raw)
    if not data:
        return None
    reply = str(data.get("reply") or "").strip()
    question_id = str(data.get("question_id") or default_id).strip() or default_id
    if not reply or not question_id:
        return None
    return {
        "reply":        reply,
        "question_id":  question_id,
        "question_type": _normalize_type(data.get("question_type")),
        "options":      [str(o) for o in (data.get("options") or []) if str(o).strip()][:4],
        "collected":    _sanitize_collected(data.get("collected")),
        "complete":     bool(data.get("complete", False)),
    }


def parse_nurse_start(raw: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Parse the `/start` greeting + first_question response.

    Returns {"greeting": str, "first_question": frontend_question} or None.
    """
    data = _parse_json_object(raw)
    if not data:
        return None
    greeting = str(data.get("greeting") or "").strip()
    fq = data.get("first_question")
    if not greeting or not isinstance(fq, dict):
        return None
    env = {
        "reply":        fq.get("reply"),
        "question_id":  fq.get("question_id"),
        "question_type": fq.get("question_type"),
        "options":      fq.get("options"),
        "collected":    {},
        "complete":     False,
    }
    parsed = parse_nurse_envelope(json.dumps(env), default_id="general_feeling")
    if not parsed:
        return None
    question = envelope_to_frontend_question(parsed)
    if not question.get("question") or not question.get("id"):
        return None
    return {"greeting": greeting, "first_question": question}


def envelope_to_frontend_question(env: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a parsed Nurse envelope into the frontend question contract."""
    qtype = env.get("question_type", "text")
    options = list(env.get("options") or [])
    if qtype == "yes_no" and not options:
        options = ["Yes", "No"]
    if qtype == "mcq" and not options:
        qtype = "text"
    reply = (env.get("reply") or "").strip()
    return {
        "id":       env.get("question_id", "nurse"),
        "question": reply,
        "spoken":   reply,
        "type":     qtype,
        "options":  options,
    }


def merge_collected(existing: Optional[Dict[str, Any]], new: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Per-key non-null overlay (Nurse incremental). Scribe overlays later."""
    merged = dict(existing or {})
    for key, value in (new or {}).items():
        if value is None:
            continue
        merged[key] = value
    return merged


def _mark_canonical_field_as_collected(state: Dict[str, Any], key: str) -> None:
    """Link a collected canonical field back to the matching checklist item."""
    if key == "wound_photo_taken" or key == "wound_photo":
        for item in state.get("checklist", []):
            if item["id"] == "wound_photo":
                item["satisfied"] = True
        return
    # A collected key that is itself a checklist id marks that item satisfied.
    for item in state.get("checklist", []):
        if item["id"] == key:
            item["satisfied"] = True


def _mark_checklist_from_envelope(state: Dict[str, Any], env: Dict[str, Any]) -> None:
    """Mark checklist items satisfied based on the envelope's collected + qid."""
    checklist_ids = {item["id"] for item in state.get("checklist", [])}
    for key in list(env.get("collected") or {}):
        if key in checklist_ids:
            for item in state.get("checklist", []):
                if item["id"] == key:
                    item["satisfied"] = True
        _mark_canonical_field_as_collected(state, key)
    qid = env.get("question_id")
    if qid in checklist_ids:
        for item in state.get("checklist", []):
            if item["id"] == qid:
                item["satisfied"] = True


# ── Prompt construction ──────────────────────────────────────────────────────

def _format_checklist_block(state: Dict[str, Any]) -> str:
    lines = []
    needs_photo = False
    for item in state.get("checklist", []):
        status = ""
        if item.get("satisfied"):
            status = " (already collected)"
        elif item.get("declined"):
            status = " (patient declined — treat as done)"
        requirement = "required" if item.get("required") else "nice-to-have"
        hint = _personalize(item.get("hint", ""), state)
        lines.append(f"- {item['id']} ({requirement}){status}: {hint}")
        if item["id"] == "wound_photo" and not item.get("satisfied"):
            needs_photo = True
    header = (
        "STILL-NEEDED DATA POINTS — ask about these until satisfied (a point is "
        "satisfied even if the patient volunteers the answer in free text). Do "
        "not re-ask anything that is already collected."
    )
    if needs_photo:
        header += (
            "\nNote: wound_photo is collected via the photo upload button when you "
            "emit question_type \"photo\"; the patient's next message will be the "
            "literal string \"photo_uploaded\" and the photo is attached separately."
        )
    return header + "\n" + "\n".join(lines)


def _rag_query_for(answer: str, language: str) -> str:
    """English lexical query for the knowledge base (best-effort translate)."""
    if language == "en":
        return answer
    try:
        from app.services.translation_service import translation_service
        translated = translation_service.translate_text(answer, "en")
        return translated or answer
    except Exception:
        return answer


async def _retrieve_guidelines(answer: str, language: str) -> List[str]:
    """Top-k care-guideline chunk texts for this turn. Never raises."""
    if not _should_invoke_rag(answer):
        return []
    try:
        from app.rag.retriever import retrieve
        hits = await retrieve(_rag_query_for(answer, language), top_k=NURSE_RAG_TOP_K)
        return [h["text"] for h in hits][:NURSE_RAG_TOP_K]
    except Exception as exc:
        logger.warning(f"[Nurse] RAG guideline retrieval failed: {exc}")
        return []


def _build_nurse_system_prompt(
    state: Dict[str, Any], language: str, rag_chunks: List[str]
) -> str:
    name            = (state.get("patient_name") or "there").split()[0]
    condition_label = state.get("condition_label") or "your condition"
    day             = state.get("day", 1)
    language_name   = _LANGUAGE_NAMES.get(language, "English")
    meds            = state.get("medications") or []

    meds_line = ""
    if meds:
        meds_line = f"Their medications today: {', '.join(str(m) for m in meds)}."

    social_block = ""
    social_txt = _format_social_memory(state.get("social_memory"))
    if social_txt:
        social_block = (
            "\nSOCIAL MEMORY (what you remember about this patient — you may open "
            "with ONE brief personal reference, but never interrogate about these "
            "or repeat them every turn):\n" + social_txt + "\n"
        )

    if rag_chunks:
        guideline_block = (
            "\nCARE GUIDELINES (the ONLY medical information you may give — CCG):\n"
            + "\n".join(f"- {_truncate(c, 400)}" for c in rag_chunks)
        )
    else:
        guideline_block = (
            "\nCARE GUIDELINES: no guideline excerpt was retrieved this turn, so you "
            "must NOT give any medical advice, dosages, or diagnoses."
        )

    wound_summary = state.get("collected", {}).get("wound_analysis_summary") or state.get("wound_analysis_summary")
    wound_block = f"- Latest wound photo analysis: {wound_summary}\n" if wound_summary else ""

    checklist_block = _format_checklist_block(state)

    return f"""
You are CARA, a warm, caring clinical nurse doing {name}'s daily post-{condition_label} check-in (Day {day}). {meds_line}
Speak naturally and empathetically, one or two short sentences per turn, and end with ONE clear question. Never lecture or list multiple questions at once. Validate the patient's feelings if they express discomfort.

{checklist_block}

KNOWN CONTEXT:
- Doctor's notes: {_truncate(state.get('patient_context') or '', 300) or 'none'}
{wound_block}{social_block}
{guideline_block}

BEHAVIOUR:
- CRITICAL LANGUAGE RULE: You MUST reply ONLY in the requested language code: '{language}'
  ({language_name}). Never default to French, Spanish, or any other language.
- SYMPTOM & PAIN HANDLING:
  * When the patient reports any pain or symptom (e.g. "My thumb hurts", swelling, fever, etc.), ALWAYS acknowledge their specific symptom empathetically.
  * Provide relevant home-care or first-aid advice using the CARE GUIDELINES above (e.g., resting in cold water for swelling if applicable).
  * Always reassure the patient: "I am noting this in your chart and will alert your doctor to be safe."
  * NEVER claim "everything looks stable today" when a patient reports active pain, discomfort, or symptoms.
  * CRITICAL SYMPTOMS (chest pain, breathing difficulty, severe bleeding): Do NOT say stable. State "I am alerting emergency services immediately".
- If the patient shares unrelated news (family, weather, a pet),
  acknowledge warmly in one short sentence, then steer back toward the check-in.
- If an answer is empty or unclear, ask gently again without re-recording it.
- If the patient refuses or cannot answer a data point, mark it done and move on.
- Medical questions: answer ONLY from the CARE GUIDELINES above. If not covered,
  say you are not sure and advise them to contact their doctor. Never improvise.
- As soon as every required data point is collected (or declined), set
  "complete": true, give a brief warm closing line, and stop asking.

OUTPUT — respond ONLY with a JSON envelope, no prose and no markdown:
{{"reply": "<your next message; must END with a question unless complete>",
  "question_id": "<stable slug — reuse a bank id like medication_adherence; else nurse_<n>; use wound_photo to request a photo>",
  "question_type": "text | mcq | yes_no | photo",
  "options": ["<up to 4 choices for mcq; empty otherwise>"],
  "collected": {{"<canonical field>": "<best-effort value>"}},
  "complete": <true|false>}}
""".strip()


def _build_start_prompt(state: Dict[str, Any], language: str) -> str:
    name            = (state.get("patient_name") or "there").split()[0]
    condition_label = state.get("condition_label") or "your condition"
    day             = state.get("day", 1)
    language_name   = _LANGUAGE_NAMES.get(language, "English")

    social_block = ""
    social_txt = _format_social_memory(state.get("social_memory"))
    if social_txt:
        social_block = (
            "\nSOCIAL MEMORY (what you remember about this patient):\n" + social_txt + "\n"
        )

    return f"""
You are CARA, a warm, caring clinical nurse greeting {name}, who is recovering from {condition_label} (Day {day}).{social_block}
Rules:
- Write a short, warm greeting (1-2 sentences). If SOCIAL MEMORY is present you MAY briefly reference ONE personal detail in the greeting; never interrogate about it.
- Then generate the FIRST question about the most important required data point ("general_feeling"), as a question envelope.
- CRITICAL LANGUAGE RULE: You MUST reply ONLY in the requested language code: '{language}'
  ({language_name}). Never default to French, Spanish, or any other language.

Respond ONLY with JSON:
{{"greeting": "<greeting text>",
  "first_question": {{"reply": "<first question text>", "question_id": "general_feeling", "question_type": "mcq", "options": ["<choice 1>", "<choice 2>", "<choice 3>"]}}}}
""".strip()


# ── Context loading ──────────────────────────────────────────────────────────

def _load_context(
    db, patient_id: str, course_id: str
) -> Dict[str, Any]:
    course = db.query(MedicalCourse).filter(MedicalCourse.id == course_id).first()
    if not course:
        raise ValueError(f"Course not found: {course_id}")

    patient = db.query(PatientProfile).filter(PatientProfile.id == patient_id).first()

    medications = db.query(Medication).filter(
        Medication.course_id == course_id,
        Medication.is_active == True,  # noqa: E712
    ).all()
    med_names = [m.name for m in medications]

    condition       = course.condition_type.value
    condition_label = CONDITION_LABELS.get(condition, "your condition")
    day             = _calculate_day(course.start_date)

    patient_name  = "there"
    social_memory: Dict[str, Any] = {}
    preferred_language = "en"
    if patient:
        if patient.user:
            patient_name = patient.user.full_name or "there"
        social_memory = getattr(patient, "social_memory", None) or {}
        preferred_language = getattr(patient, "preferred_language", "en") or "en"

    return {
        "patient_name":      patient_name,
        "condition":         condition,
        "condition_label":   condition_label,
        "day":               day,
        "medications":       med_names,
        "patient_context":   getattr(course, "patient_context", "") or "",
        "course_id":         course_id,
        "social_memory":     social_memory,
        "preferred_language": preferred_language,
    }


def _make_state_v2(ctx: Dict[str, Any], language: str) -> Dict[str, Any]:
    return {
        "version":               2,
        "patient_name":          ctx["patient_name"],
        "condition":             ctx["condition"],
        "condition_label":       ctx["condition_label"],
        "day":                   ctx["day"],
        "medications":           ctx["medications"],
        "patient_context":       ctx["patient_context"],
        "course_id":             ctx["course_id"],
        "language":              language,
        "social_memory":         ctx["social_memory"],
        "transcript":            [],
        "collected":             {},
        "checklist":             build_checklist(ctx["condition"]),
        "current_question_id":   None,
        "current_question_type": None,
        "current_question_options": [],
        "turn_count":            0,
        "max_turns":             MAX_NURSE_TURNS,
        "answers":               [],
        "covered":               [],
        "question_queue":        [],   # only used by the static fallback
        "adaptive_count":        0,
    }


# ── /start ───────────────────────────────────────────────────────────────────

async def start_nurse_session(
    patient_id: str,
    course_id: str,
    db,
    language: str = "en",
) -> Dict[str, Any]:
    """
    Initialises a goal-oriented Nurse session and returns
      greeting, first_question (frontend dict), state (v2).
    Falls back to the static bank on any LLM failure.
    """
    ctx = _load_context(db, patient_id, course_id)
    state = _make_state_v2(ctx, language)
    iso = datetime.now(timezone.utc).isoformat()

    greeting = None
    first_q = None
    try:
        resp = await llm_client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": _build_start_prompt(state, language)},
                {"role": "user",   "content": "Begin the check-in."},
            ],
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=300,
        )
        parsed = parse_nurse_start(resp.choices[0].message.content)
        if parsed:
            greeting = parsed["greeting"]
            first_q  = parsed["first_question"]
    except Exception as exc:
        logger.warning(f"[Nurse] start LLM failed, using static fallback: {exc}")

    if greeting is None or first_q is None:
        greeting = _personalize(
            GREETING_TEMPLATES[(state["day"] - 1) % len(GREETING_TEMPLATES)], state
        )
        first_q = _build_question("general_feeling", state)
        if language != "en":
            greeting = _localize(greeting, language)
            first_q = _localize_question(first_q, language)

    state["transcript"].append({"role": "agent", "content": greeting, "time": iso})
    state["transcript"].append({
        "role": "agent", "content": first_q.get("question"), "question_id": first_q.get("id"), "time": iso,
    })
    state["current_question_id"]   = first_q.get("id")
    state["current_question_type"] = first_q.get("type")
    state["current_question_options"] = list(first_q.get("options") or [])

    logger.info(
        f"[Nurse] Session started — patient={patient_id} condition={state['condition']} "
        f"day={state['day']} checklist={len(state['checklist'])} items language={language}"
    )
    return {"greeting": greeting, "first_question": first_q, "state": state}


# ── per-turn ─────────────────────────────────────────────────────────────────

async def nurse_respond(
    state: Dict[str, Any],
    question_id: str,
    answer: str,
    db=None,
    patient_id: Optional[str] = None,
    language: str = "en",
) -> Dict[str, Any]:
    """
    One conversation turn. Appends the patient message, runs the Nurse (or the
    static fallback), and returns {next_question, state, should_submit}.
    """
    state = dict(state)
    if "checklist" not in state:
        state["checklist"] = build_checklist(state.get("condition", "DEFAULT"))
    state.setdefault("transcript", [])
    state.setdefault("collected", {})
    state.setdefault("answers", [])
    state.setdefault("covered", [])
    state.setdefault("turn_count", 0)
    state.setdefault("max_turns", MAX_NURSE_TURNS)

    transcript = list(state.get("transcript", []))
    iso = datetime.now(timezone.utc).isoformat()

    answer_text = str(answer or "").strip()
    is_photo_ack = answer_text.lower() == PHOTO_UPLOADED_ANSWER

    # Record the patient turn + audit entry
    transcript.append({
        "role": "patient", "content": answer_text,
        "question_id": question_id, "time": iso,
    })
    state["transcript"] = transcript
    state["answers"].append({"question_id": question_id, "answer": answer_text})
    if not is_photo_ack:
        state["covered"].append(question_id)

    # Empty answer -> gentle re-ask, no LLM call, checklist untouched
    if not answer_text:
        next_q = _static_next_question(state, language, question_id, answer_text, reask=True)
        return {"next_question": next_q, "state": state, "should_submit": next_q is None}

    # Photo upload acknowledgment
    if is_photo_ack:
        state["collected"]["wound_photo_taken"] = True
        for item in state.get("checklist", []):
            if item["id"] == "wound_photo":
                item["satisfied"] = True
        logger.info("[Nurse] wound photo_uploaded acknowledged")

    # ── Emergency keyword intercept ──────────────────────────────────
    # Fast regex guardrail BEFORE any LLM/RAG call: a red-flag phrase force-
    # submits the check-in as EMERGENCY (never fatal, no network needed).
    matched = EMERGENCY_KEYWORDS_RE.search(answer_text)
    if matched:
        state["emergency_triggered"] = True
        state["risk_tier"]           = "EMERGENCY"
        state["emergency_reason"]    = answer_text
        state["complete"]            = True
        logger.critical(
            f"[Nurse] EMERGENCY keyword intercepted: {matched.group(0)!r} "
            f"patient={patient_id}"
        )
        return {
            "next_question": None,
            "state": state,
            "should_submit": True,
            "emergency_triggered": True,
        }

    # RAG (throttled)
    rag_chunks = await _retrieve_guidelines(answer_text, language)

    # LLM turn
    env = None
    try:
        system_prompt = _build_nurse_system_prompt(state, language, rag_chunks)
        history = _history_block(transcript, NURSE_TURN_WINDOW, NURSE_HISTORY_CHAR_LIMIT)
        resp = await llm_client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": f"Conversation so far:\n{history}\n\nContinue as CARA."},
            ],
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=320,
        )
        env = parse_nurse_envelope(resp.choices[0].message.content)
    except Exception as exc:
        logger.warning(f"[Nurse] LLM turn failed, using static fallback: {exc}")

    state["turn_count"] += 1

    if env is None:
        next_q = _static_next_question(state, language, question_id, answer_text)
        return {"next_question": next_q, "state": state, "should_submit": next_q is None}

    # Merge incremental extraction + mark checklist
    state["collected"] = merge_collected(state.get("collected", {}), env.get("collected"))
    _mark_checklist_from_envelope(state, env)

    # Persist the nurse turn
    transcript.append({
        "role": "agent", "content": env.get("reply"),
        "question_id": env.get("question_id"), "time": iso,
    })
    state["transcript"] = transcript
    state["current_question_id"]   = env.get("question_id")
    state["current_question_type"] = env.get("question_type", "text")
    state["current_question_options"] = list(env.get("options") or [])

    force_submit = state["turn_count"] >= state.get("max_turns", MAX_NURSE_TURNS)
    if bool(env.get("complete")) or force_submit:
        return {"next_question": None, "state": state, "should_submit": True}

    next_q = envelope_to_frontend_question(env)
    if not next_q.get("question") or not next_q.get("id"):
        # Envelope couldn't yield a valid question — static path
        next_q = _static_next_question(state, language, question_id, answer_text)
        if next_q is None:
            return {"next_question": None, "state": state, "should_submit": True}

    return {"next_question": next_q, "state": state, "should_submit": False}


def _history_block(transcript: List[Dict[str, Any]], window: int, char_limit: int) -> str:
    turns = list(transcript)[-window:]
    lines = []
    for turn in turns:
        role = "CARA" if turn.get("role") == "agent" else "Patient"
        content = (turn.get("content") or "").strip()
        if not content:
            continue
        lines.append(f"{role}: {content}")
    block = "\n".join(lines)
    return _truncate(block, char_limit)


# ── Static fallback ──────────────────────────────────────────────────────────

def _localize(text: str, language: str) -> str:
    try:
        from app.services.translation_service import translation_service
        return translation_service.translate_text(text, language)
    except Exception:
        return text


def _localize_question(q: Dict[str, Any], language: str) -> Dict[str, Any]:
    q = dict(q)
    if language == "en":
        return q
    try:
        from app.services.translation_service import translation_service
        q["question"] = translation_service.translate_text(q.get("question", ""), language)
        q["spoken"]   = translation_service.translate_text(q.get("spoken", q.get("question")), language)
        q["options"]  = translation_service.translate_list(list(q.get("options") or []), language)
    except Exception:
        pass
    return q


def _static_next_question(
    state: Dict[str, Any],
    language: str,
    last_question_id: Optional[str] = None,
    last_answer: str = "",
    reask: bool = False,
) -> Optional[Dict[str, Any]]:
    """
    Deterministic fallback when the LLM is unreachable: pick the next unsatisfied
    bank question (applying BRANCH_RULES), personalize + localize it.
    Returns None when nothing remains (caller should submit).
    """
    checklist = state.get("checklist") or []
    satisfied = {item["id"] for item in checklist if item.get("satisfied")}
    needed    = [item["id"] for item in checklist if not item.get("satisfied") and not item.get("declined")]

    if reask:
        # Re-ask the LAST question if it's still needed.
        if last_question_id in needed:
            remaining = [last_question_id] + [q for q in needed if q != last_question_id]
        else:
            remaining = needed
    else:
        remaining = _apply_branches(
            last_question_id or "", last_answer or "", needed, state.get("covered") or []
        )
        remaining = [q for q in remaining if q not in satisfied and q not in state.get("covered", [])]

    if not remaining:
        return None

    qid = remaining[0]
    q = _build_question(qid, state)
    if q is None:
        state.setdefault("covered", []).append(qid)
        return _static_next_question(state, language, qid, "skipped")

    state["current_question_id"]   = qid
    state["current_question_type"] = q.get("type")
    state["current_question_options"] = list(q.get("options") or [])
    state["question_queue"]        = list(remaining[1:])
    return _localize_question(q, language)