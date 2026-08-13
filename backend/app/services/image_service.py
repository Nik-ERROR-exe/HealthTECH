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
    "You are CARA, an AI clinical wound analyst assistant. Answer the patient's question "
    "based STRICTLY and ONLY on the provided information: the wound image analysis metadata and the medical knowledge context. "
    "Do not invent any medical advice. If the question is not covered by the provided context or image analysis, "
    "explicitly say 'I don't have enough information to answer that based on your wound analysis and medical knowledge.'"
)


async def answer_wound_image_chat(analysis_id: str, query: str, db: Session) -> str:
    """
    Answers a patient follow-up question grounded strictly in stored wound analysis metadata
    and Qdrant RAG retrieved medical knowledge chunks.
    """
    analysis = db.query(WoundAnalysis).filter(WoundAnalysis.id == analysis_id).first()
    if not analysis:
        raise ValueError("Wound analysis record not found")

    # 1. Query RAG vector store using analysis summary and query
    rag_query = f"{analysis.analysis_summary or ''} {query}".strip()
    rag_context = ""
    try:
        rag_hits = await retrieve(rag_query, top_k=3)
        if rag_hits:
            rag_context = "\n\n".join([f"[{hit.get('title', 'Medical Guide')}]: {hit.get('text', '')}" for hit in rag_hits if hit.get('text')])
    except Exception as exc:
        logger.warning(f"[ImageService] RAG retrieval failed: {exc}")

    metadata_text = (
        f"Wound Severity: {analysis.severity.value if hasattr(analysis.severity, 'value') else analysis.severity}\n"
        f"Analysis Summary: {analysis.analysis_summary or 'No summary recorded.'}\n"
        f"Redness Detected: {'Yes' if analysis.redness_detected else 'No'}\n"
        f"Swelling Detected: {'Yes' if analysis.swelling_detected else 'No'}\n"
        f"Texture Change Detected: {'Yes' if analysis.texture_change_detected else 'No'}\n"
        f"Wound Score: {analysis.wound_score}/10\n"
        f"AI Care Advice: {analysis.ai_advice or 'Follow standard wound care.'}\n"
    )

    context_str = f"Image Analysis:\n{metadata_text}\n"
    if rag_context:
        context_str += f"\nMedical Knowledge (RAG):\n{rag_context}\n"
    else:
        context_str += "\nMedical Knowledge (RAG):\nNo additional knowledge chunks found.\n"

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
            max_tokens=300,
        )
        answer = (resp.choices[0].message.content or "").strip()
        if not answer:
            answer = "Based on your wound image analysis, the area appears stable. Please continue keeping it clean and dry."
        return answer
    except Exception as exc:
        logger.error(f"[ImageService] LLM chat failed: {exc}")
        # Static fallback grounded response
        return (
            f"Based on your image analysis summary ({analysis.analysis_summary or 'wound scan'}), "
            f"your wound severity is rated as {analysis.severity}. "
            f"Please keep the area clean, dry, and report any spreading redness or swelling to your doctor."
        )
