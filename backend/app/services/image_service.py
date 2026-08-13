"""
Image Analysis Service
Provides helpers for wound image uploads and grounded follow-up chat with RAG integration.
"""
import logging
from sqlalchemy.orm import Session
from app.models.models import WoundAnalysis
from app.agents.nvidia_client import LLM_MODEL, llm_client
from app.config import settings
from app.rag.retriever import retrieve

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are CARA, an AI clinical wound analyst assistant. Your task is to provide helpful, "
    "accurate, and empathetic answers to patient questions about their wound analysis.\n\n"
    "INSTRUCTIONS:\n"
    "1. Answer the patient's question based on the provided Medical Knowledge Context (RAG) and Wound Image Metadata.\n"
    "2. If the retrieved medical knowledge context directly answers the question, synthesize it clearly and empathetically.\n"
    "3. If the retrieved context does not answer the question or lacks specific details, answer based on the provided wound image metadata (severity, redness_detected, swelling_detected, texture_change_detected, wound_score, summary, and AI care advice).\n"
    "4. Do NOT use static hardcoded text or ungrounded claims. Provide a clear, factual, and dynamic clinical response."
)


async def answer_wound_image_chat(analysis_id: str, query: str, db: Session) -> str:
    """
    Answers a patient follow-up question grounded in stored wound analysis metadata
    and Qdrant RAG retrieved medical knowledge chunks.
    """
    analysis = db.query(WoundAnalysis).filter(WoundAnalysis.id == analysis_id).first()
    if not analysis:
        raise ValueError("Wound analysis record not found")

    # 1. Query Qdrant RAG vector store using user's query and analysis context
    rag_query = f"{query} {analysis.analysis_summary or ''}".strip()
    rag_context = ""
    try:
        rag_hits = await retrieve(rag_query, top_k=3)
        if rag_hits:
            rag_context = "\n\n".join([f"[{hit.get('title', 'Medical Guide')}]: {hit.get('text', '')}" for hit in rag_hits if hit.get('text')])
    except Exception as exc:
        logger.warning(f"[ImageService] Qdrant RAG retrieval failed: {exc}")

    severity_val = analysis.severity.value if hasattr(analysis.severity, 'value') else str(analysis.severity)
    metadata_text = (
        f"Wound Severity: {severity_val}\n"
        f"Analysis Summary: {analysis.analysis_summary or 'No summary recorded.'}\n"
        f"Redness Detected: {'Yes' if analysis.redness_detected else 'No'}\n"
        f"Swelling Detected: {'Yes' if analysis.swelling_detected else 'No'}\n"
        f"Texture Change Detected: {'Yes' if analysis.texture_change_detected else 'No'}\n"
        f"Wound Score: {analysis.wound_score}/10\n"
        f"AI Care Advice: {analysis.ai_advice or 'Follow standard wound care instructions.'}\n"
    )

    context_str = f"Wound Image Metadata:\n{metadata_text}\n"
    if rag_context:
        context_str += f"\nMedical Knowledge (Qdrant RAG):\n{rag_context}\n"
    else:
        context_str += "\nMedical Knowledge (Qdrant RAG):\nNo specific guideline chunks matched this query.\n"

    full_system_prompt = f"{SYSTEM_PROMPT}\n\n[CONTEXT INFORMATION]\n{context_str}"

    messages = [
        {"role": "system", "content": full_system_prompt},
        {"role": "user", "content": query},
    ]

    try:
        resp = await llm_client.chat.completions.create(
            model=LLM_MODEL,
            messages=messages,
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=350,
        )
        answer = (resp.choices[0].message.content or "").strip()
        if not answer:
            # Metadata-grounded fallback
            findings = []
            if analysis.redness_detected:
                findings.append("redness")
            if analysis.swelling_detected:
                findings.append("swelling")
            if analysis.texture_change_detected:
                findings.append("texture changes")
            finding_str = f"Noted findings: {', '.join(findings)}." if findings else "No acute inflammation detected."
            answer = (
                f"Based on your wound scan (Severity: {severity_val}, Score: {analysis.wound_score}/10), "
                f"{finding_str} {analysis.ai_advice or 'Please keep the wound clean and dry.'}"
            )
        return answer
    except Exception as exc:
        logger.error(f"[ImageService] LLM chat failed: {exc}")
        # Metadata-grounded fallback without hardcoded static string
        findings = []
        if analysis.redness_detected:
            findings.append("redness")
        if analysis.swelling_detected:
            findings.append("swelling")
        if analysis.texture_change_detected:
            findings.append("texture changes")
        finding_str = f"Noted findings: {', '.join(findings)}." if findings else "No acute inflammation detected."
        return (
            f"Based on your wound analysis ({analysis.analysis_summary or 'wound scan'}), "
            f"your wound severity is rated as {severity_val} (Score: {analysis.wound_score}/10). {finding_str} "
            f"{analysis.ai_advice or 'Keep the area clean and contact your doctor if symptoms worsen.'}"
        )
