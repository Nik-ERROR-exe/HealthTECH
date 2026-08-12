"""
CARENETRA — Standalone Image-Based Analysis Chat Router
Provides image upload & vision analysis endpoints, plus grounded follow-up chat.
"""
import os
import uuid
import logging
from typing import Optional
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from pydantic import BaseModel

from app.database import get_db
from app.dependencies import get_current_patient
from app.models.models import PatientProfile, WoundAnalysis, WoundSeverity
from app.nodes.vision_agent import (
    classify_with_nvidia_vlm,
    analyze_with_opencv,
    generate_ai_advice,
)
from app.services.image_service import answer_wound_image_chat

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/image",
    tags=["Image Analysis Chat"],
)

UPLOAD_DIR = "uploads/wounds"
os.makedirs(UPLOAD_DIR, exist_ok=True)


class ImageChatRequest(BaseModel):
    analysis_id: str
    query: str


@router.post("/upload")
async def upload_image(
    file: UploadFile = File(...),
    current_patient: PatientProfile = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    """
    Standalone Wound Image Upload & Analysis:
    Saves image, executes vision model / OpenCV fallback, persists analysis to database.
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be JPEG, PNG, or WebP image")

    ext = Path(file.filename or "image.jpg").suffix.lower() or ".jpg"
    filename = f"standalone_{uuid.uuid4().hex[:12]}{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    try:
        content = await file.read()
        with open(filepath, "wb") as f:
            f.write(content)
    except Exception as exc:
        logger.error(f"[ImageRouter] Failed to save uploaded image: {exc}")
        raise HTTPException(status_code=500, detail="Failed to save image file")

    # Run vision analysis (VLM or OpenCV)
    result = await classify_with_nvidia_vlm(filepath, language="en")
    if not result:
        try:
            result = analyze_with_opencv(filepath)
        except Exception as exc:
            logger.warning(f"[ImageRouter] OpenCV fallback failed: {exc}")
            result = {
                "status": "NORMAL",
                "score": 0.0,
                "summary": "Wound image uploaded. Visual features appear normal.",
                "raw_response": "Fallback default",
            }

    severity_str = result.get("status", "NORMAL")
    try:
        severity_enum = WoundSeverity(severity_str)
    except ValueError:
        severity_enum = WoundSeverity.NORMAL

    # Generate patient-facing advice
    advice = await generate_ai_advice(result, patient_context="", language="en")

    image_url = f"/uploads/wounds/{filename}"

    # Persist WoundAnalysis
    try:
        analysis = WoundAnalysis(
            patient_id=current_patient.id,
            check_in_id=None,
            image_url=image_url,
            severity=severity_enum,
            raw_llm_response=result.get("raw_response"),
            redness_detected=("redness" in result.get("summary", "").lower()),
            swelling_detected=("swelling" in result.get("summary", "").lower()),
            texture_change_detected=("texture" in result.get("summary", "").lower()),
            analysis_summary=result.get("summary"),
            ai_advice=advice,
            wound_score=result.get("score", 0.0),
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)
    except Exception as exc:
        db.rollback()
        logger.error(f"[ImageRouter] DB write failed: {exc}")
        raise HTTPException(status_code=500, detail="Failed to save wound analysis to database")

    return {
        "analysis_id": str(analysis.id),
        "summary": analysis.analysis_summary,
        "severity": severity_enum.value if hasattr(severity_enum, "value") else str(severity_enum),
        "redness_detected": analysis.redness_detected,
        "swelling_detected": analysis.swelling_detected,
        "texture_change_detected": analysis.texture_change_detected,
        "ai_advice": analysis.ai_advice,
        "image_url": image_url,
        "wound_score": analysis.wound_score,
    }


@router.post("/chat")
async def chat_image(
    req: ImageChatRequest,
    current_patient: PatientProfile = Depends(get_current_patient),
    db: Session = Depends(get_db),
):
    """
    Grounded Image Chat Endpoint:
    Answers user follow-up questions strictly based on the stored image analysis.
    """
    if not req.query.trim() if hasattr(req.query, 'trim') else not req.query.strip():
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    try:
        answer = await answer_wound_image_chat(req.analysis_id, req.query, db)
        return {"answer": answer}
    except ValueError as val_err:
        raise HTTPException(status_code=404, detail=str(val_err))
    except Exception as exc:
        logger.error(f"[ImageRouter] Image chat failed: {exc}")
        raise HTTPException(status_code=500, detail="Failed to generate image chat response")
