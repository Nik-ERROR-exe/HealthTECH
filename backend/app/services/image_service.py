"""
Image Analysis Service
Provides helpers for wound image uploads and grounded follow-up chat.
"""
import logging
from sqlalchemy.orm import Session
from app.models.models import WoundAnalysis
from app.agents.nvidia_client import LLM_MODEL, llm_client
from app.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are CARA, an AI clinical wound analyst assistant. Answer the patient's question "
    "based STRICTLY and ONLY on the provided wound image analysis metadata below. "
    "If the question is not about the wound, the image findings, or recovery guidance related to this image, "
    "politely decline to answer and ask the user to ask about their wound image or clinical analysis."
)


async def answer_wound_image_chat(analysis_id: str, query: str, db: Session) -> str:
    """
    Answers a patient follow-up question grounded strictly in stored wound analysis metadata.
    """
    analysis = db.query(WoundAnalysis).filter(WoundAnalysis.id == analysis_id).first()
    if not analysis:
        raise ValueError("Wound analysis record not found")

    metadata_text = (
        f"Wound Severity: {analysis.severity.value if hasattr(analysis.severity, 'value') else analysis.severity}\n"
        f"Analysis Summary: {analysis.analysis_summary or 'No summary recorded.'}\n"
        f"Redness Detected: {'Yes' if analysis.redness_detected else 'No'}\n"
        f"Swelling Detected: {'Yes' if analysis.swelling_detected else 'No'}\n"
        f"Texture Change Detected: {'Yes' if analysis.texture_change_detected else 'No'}\n"
        f"Wound Score: {analysis.wound_score}/10\n"
        f"AI Care Advice: {analysis.ai_advice or 'Follow standard wound care.'}\n"
    )

    full_system_prompt = f"{SYSTEM_PROMPT}\n\n[STORED WOUND ANALYSIS METADATA]\n{metadata_text}"

    messages = [
        {"role": "system", "content": full_system_prompt},
        {"role": "user", "content": query},
    ]

    try:
        resp = await llm_client.chat.completions.create(
            model=LLM_MODEL,
            messages=messages,
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=250,
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
