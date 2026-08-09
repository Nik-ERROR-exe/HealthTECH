"""
Adaptive check-in questions — LLM follow-ups grounded in the patient's medical
condition, history, and the RAG knowledge base.

Pure helpers here are DB/LLM-free (unit-testable). The async orchestrators call
the NVIDIA NIM LLM and the Qdrant retriever; every failure falls back to the
static question bank so the offline check-in path always stays reachable.
"""
import json
import logging
import re
from typing import Any, Dict, List, Optional

from app.agents.nvidia_client import LLM_MODEL, llm_client
from app.config import settings

logger = logging.getLogger(__name__)

MAX_ADAPTIVE_FOLLOWUPS = 2

_SYSTEM_PROMPT = (
    "You are CARA, a caring clinical monitoring agent. Given a patient's medical "
    "context and their recent check-in answers, generate ONE short follow-up "
    "question that helps decide the patient's condition more accurately. "
    "Ask about a specific symptom, medication side-effect, or warning sign the "
    "patient should watch for. Do NOT alarm the patient. "
    'Respond ONLY with JSON: {"question": "...", "type": "mcq"|"yes_no"|"text", '
    '"options": ["...", "..."]} (options only for mcq; empty for yes_no/text).'
)


def _truncate(text: str, limit: int) -> str:
    text = (text or "").strip()
    return text if len(text) <= limit else text[:limit].rstrip() + "..."


def build_context_summary(state: Dict[str, Any], answers: List[Dict[str, str]]) -> str:
    """Human-readable patient context for the LLM (condition, meds, notes, history)."""
    condition = state.get("condition_label") or state.get("condition") or "unknown"
    meds = state.get("medications") or []
    meds_str = ", ".join(str(m) for m in meds) if meds else "none"
    doctor_notes = state.get("patient_context") or ""
    recent = "; ".join(
        f"{a.get('question_id')}: {a.get('answer')}"
        for a in (answers or [])[-4:]
    )
    return (
        f"Condition: {condition}\n"
        f"Medications: {meds_str}\n"
        f"Recovery day: {state.get('day', 1)}\n"
        f"Doctor's notes: {_truncate(doctor_notes, 300) or 'none'}\n"
        f"Recent answers: {_truncate(recent, 400) or 'none'}"
    )


def build_followup_prompt(context: str, doc_excerpt: str = "") -> str:
    """Prompt asking for one adaptive follow-up question grounded in context + docs."""
    excerpt = ""
    if doc_excerpt:
        excerpt = f"\nRelevant care guideline excerpt:\n{_truncate(doc_excerpt, 500)}\n"
    return (
        "Use the patient context below. If a care guideline excerpt is provided, "
        "align the question with it. Ask exactly ONE short, patient-friendly "
        f"follow-up question.\n\n{context}{excerpt}"
    )


def parse_adaptive_question(raw: Optional[str]) -> Optional[Dict[str, Any]]:
    """
    Parse the LLM's JSON reply into a question dict for the frontend.

    Accepts optional ```json fences and tolerates surrounding prose. Returns
    None on any parse failure so callers can fall back to the static bank.
    """
    if not raw:
        return None
    text = raw.strip()
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end <= start:
        return None
    try:
        data = json.loads(text[start : end + 1])
    except Exception:
        return None
    if not isinstance(data, dict):
        return None
    question = str(data.get("question") or "").strip()
    if not question:
        return None

    qtype = str(data.get("type") or "text").lower().replace("-", "_")
    if qtype in {"yesno", "yes_no", "boolean"}:
        qtype, options = "yes_no", ["Yes", "No"]
    elif qtype == "mcq":
        options = [str(o) for o in (data.get("options") or [])]
        if not options:
            qtype, options = "text", []
    else:
        qtype, options = "text", []

    return {
        "id": "adaptive",
        "question": question,
        "spoken": str(data.get("spoken") or question),
        "type": qtype,
        "options": options,
    }


async def maybe_adaptive_followup(
    state: Dict[str, Any],
    db: Any,
    patient_id: str,
) -> Optional[Dict[str, Any]]:
    """
    Produce one LLM adaptive follow-up question, or None to fall back to the
    static bank. `db` is accepted for API symmetry (unused — RAG is stateless).
    """
    answers = state.get("answers", [])
    doc_excerpt = ""
    try:
        from app.rag.retriever import retrieve_for_checkin
        docs = await retrieve_for_checkin(answers, top_k=1)
        doc_excerpt = docs[0] if docs else ""
    except Exception as exc:
        logger.warning(f"[Adaptive] RAG context unavailable: {exc}")

    prompt = build_followup_prompt(build_context_summary(state, answers), doc_excerpt)
    try:
        resp = await llm_client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=200,
        )
        content = resp.choices[0].message.content
        return parse_adaptive_question(content)
    except Exception as exc:
        logger.warning(f"[Adaptive] LLM follow-up failed; using static question: {exc}")
        return None


async def answer_from_knowledge(question: str, language: str = "en") -> Dict[str, Any]:
    """
    RAG Q&A — retrieve relevant medical-doc chunks and answer grounded on them.

    Returns {"answer": str, "sources": [str]}. Safe fallback if LLM/RAG fails.
    """
    from app.rag.retriever import retrieve

    docs = []
    try:
        docs = await retrieve(question, top_k=settings.RAG_TOP_K)
    except Exception as exc:
        logger.warning(f"[QA] RAG retrieval failed: {exc}")

    context = "\n\n".join(f"[{d['source']}] {d['text']}" for d in docs)
    system = (
        "You are CARA, a supportive clinical assistant. Answer the patient's "
        "question using ONLY the provided medical knowledge base. If the answer "
        "is not in the knowledge base, say you are not sure and advise contacting "
        f"their doctor. Be concise, warm, and safe. Respond in '{language}'."
    )
    try:
        resp = await llm_client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": f"Knowledge base:\n{context}\n\nQuestion: {question}"},
            ],
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=settings.LLM_MAX_TOKENS,
        )
        answer = (resp.choices[0].message.content or "").strip()
    except Exception as exc:
        logger.warning(f"[QA] LLM answer failed: {exc}")
        answer = (
            "I couldn't reach the AI service just now. Based on our care guidelines, "
            "if you are worried about your symptoms, please contact your doctor."
        )

    return {
        "answer": answer,
        "sources": list(dict.fromkeys(str(d["source"]) for d in docs)),
    }