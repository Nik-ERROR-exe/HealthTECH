"""
Node 2 — Vision Analysis Agent (Hugging Face LLM + OpenCV fallback)
Analyzes a wound photo using Hugging Face Inference API (accurate classification).
If API fails, falls back to classical OpenCV heuristics.

Maintains full compatibility with existing AgentState and database schema.
"""
import logging
import requests
import cv2
import numpy as np
from pathlib import Path
from sqlalchemy.orm import Session

from app.agents.state import AgentState
from app.agents.nvidia_client import LLM_MODEL, llm_client
from app.config import settings
from app.database import SessionLocal
from app.models.models import WoundAnalysis, WoundSeverity, MedicalCourse

logger = logging.getLogger(__name__)

# Hugging Face configuration (free tier — paste key into backend/.env)
HUGGINGFACE_API_KEY = settings.HUGGINGFACE_API_KEY
MODEL_ID = "davidfred/vit_skin_disease_model" # Good for wound classification
API_URL = f"https://api-inference.huggingface.co/models/{MODEL_ID}"
HEADERS = {"Authorization": f"Bearer {HUGGINGFACE_API_KEY}"}


# ─────────────────────────────────────────────────────────────
# Hugging Face API call (accurate classification)
# ─────────────────────────────────────────────────────────────
def classify_with_huggingface(image_path: str) -> dict:
    """Call Hugging Face Inference API. Returns severity score (0‑10) and status."""
    if not HUGGINGFACE_API_KEY:
        logger.warning("HUGGINGFACE_API_KEY not set – using OpenCV fallback")
        return None

    try:
        with open(image_path, "rb") as f:
            image_data = f.read()
        response = requests.post(API_URL, headers=HEADERS, data=image_data, timeout=30)
        if response.status_code != 200:
            logger.error(f"HuggingFace API error: {response.status_code}")
            return None

        result = response.json()
        if isinstance(result, list) and len(result) > 0:
            top = result[0]
            label = top.get("label", "unknown")
            confidence = top.get("score", 0.0)
        else:
            return None

        # Map label to severity (adjust based on actual model output)
        label_lower = label.lower()
        if any(k in label_lower for k in ["malignant", "melanoma", "severe", "dangerous"]):
            severity_score = 8.5
            status = "SEVERE"
        elif any(k in label_lower for k in ["moderate", "infection", "cellulitis"]):
            severity_score = 5.5
            status = "MODERATE"
        elif any(k in label_lower for k in ["normal", "benign", "healthy"]):
            severity_score = 1.0
            status = "NORMAL"
        else:
            severity_score = 3.0
            status = "MODERATE"

        return {
            "score": round(severity_score, 1),
            "status": status,
            "summary": f"AI analysis: {label} (confidence {confidence:.2f})",
            "raw_response": f"{label}: {confidence}",
        }
    except Exception as e:
        logger.error(f"HuggingFace client error: {e}")
        return None


# ─────────────────────────────────────────────────────────────
# OpenCV fallback (your original logic, slightly polished)
# ─────────────────────────────────────────────────────────────
def analyze_with_opencv(image_path: str) -> dict:
    """Original OpenCV‑based analysis – used when Hugging Face fails."""
    img = cv2.imread(image_path)
    if img is None:
        raise ValueError(f"Could not load image: {image_path}")

    # Resize for consistency
    max_dim = 800
    h, w = img.shape[:2]
    if max(h, w) > max_dim:
        scale = max_dim / max(h, w)
        new_w = int(w * scale)
        new_h = int(h * scale)
        img = cv2.resize(img, (new_w, new_h))

    # Redness
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    lower_red1 = np.array([0, 50, 50])
    upper_red1 = np.array([10, 255, 255])
    lower_red2 = np.array([160, 50, 50])
    upper_red2 = np.array([180, 255, 255])
    mask1 = cv2.inRange(hsv, lower_red1, upper_red1)
    mask2 = cv2.inRange(hsv, lower_red2, upper_red2)
    red_mask = cv2.bitwise_or(mask1, mask2)
    red_ratio = np.sum(red_mask > 0) / (img.shape[0] * img.shape[1])
    redness_score = 0.0 if red_ratio < 0.02 else 2.5 if red_ratio < 0.05 else 5.0 if red_ratio < 0.10 else 8.0

    # Swelling (contour area)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(gray, 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    swelling_score = 0.0
    if contours:
        largest = max(contours, key=cv2.contourArea)
        area = cv2.contourArea(largest)
        total_pixels = img.shape[0] * img.shape[1]
        area_ratio = area / total_pixels
        if area_ratio > 0.05:
            swelling_score = 7.0
        elif area_ratio > 0.03:
            swelling_score = 4.0

    # Texture (Laplacian variance)
    laplacian = cv2.Laplacian(gray, cv2.CV_64F)
    variance = laplacian.var()
    texture_score = 0.0 if variance < 50 else 3.0 if variance < 150 else 5.0 if variance < 300 else 8.0

    overall_score = (redness_score * 0.4) + (swelling_score * 0.3) + (texture_score * 0.3)
    overall_score = round(overall_score, 1)

    if overall_score < 2.0:
        status = "NORMAL"
    elif overall_score < 4.0:
        status = "MILD"
    elif overall_score < 7.0:
        status = "MODERATE"
    else:
        status = "SEVERE"

    findings = []
    if redness_score > 0: findings.append("redness")
    if swelling_score > 0: findings.append("swelling")
    if texture_score > 0: findings.append("unusual texture")
    summary = "Wound appears clean." if not findings else f"Wound shows {' and '.join(findings)}."

    return {
        "score": overall_score,
        "status": status,
        "summary": summary,
        "raw_response": f"CV: red={redness_score:.1f}, swell={swelling_score:.1f}, tex={texture_score:.1f}",
    }


# ─────────────────────────────────────────────────────────────
# Main agent node (same interface as before)
# ─────────────────────────────────────────────────────────────
# ─────────────────────────────────────────────
# Patient-facing AI advice (NVIDIA LLM + RAG guideline, static fallback)
# ─────────────────────────────────────────────
_ADVICE_SYSTEM_PROMPT = (
    "You are CARA, a supportive clinical assistant. Based on the wound analysis "
    "findings and the patient's medical context, give 2-4 short, practical care "
    "tips and the specific signs to watch for. Do NOT alarm the patient. "
    "Keep it under 120 words, warm and clear."
)


def _static_advice(severity: str, score: float) -> str:
    """Safe static tips used when the LLM is unreachable."""
    if severity == "SEVERE" or (score or 0) >= 7:
        return (
            "Your wound analysis shows signs that need attention. Please contact "
            "your doctor promptly, keep the area clean and dry, and avoid any "
            "irritation."
        )
    if severity in ("MODERATE", "MILD") or (score or 0) >= 4:
        return (
            "Your wound needs a little attention. Keep it clean and dry, follow "
            "your dressing schedule, and let your doctor know if redness spreads "
            "or pain increases."
        )
    return (
        "Your wound looks stable. Keep it clean and dry, follow your dressing "
        "schedule, and contact your doctor if anything changes."
    )


async def generate_ai_advice(
    result: dict,
    patient_context: str = "",
    language: str = "en",
) -> str:
    """
    LLM-written patient-facing advice grounded in the wound analysis, the
    patient's condition, and the RAG care guidelines. Falls back to `_static_advice`.
    """
    context_parts = [
        f"Wound analysis: {result.get('summary', '')}",
        f"Severity: {result.get('status', 'NORMAL')} (score {result.get('score', 0)}/10)",
    ]
    if patient_context:
        context_parts.append(f"Patient context: {patient_context[:300]}")
    context = "\n".join(context_parts)

    doc_excerpt = ""
    try:
        from app.rag.retriever import retrieve
        hits = await retrieve(f"{result.get('summary', '')} wound care advice", top_k=1)
        if hits:
            doc_excerpt = hits[0]["text"]
    except Exception as exc:
        logger.warning(f"[VisionAgent] RAG advice context unavailable: {exc}")
    if doc_excerpt:
        context += "\nCare guideline excerpt:\n" + doc_excerpt[:500]

    try:
        resp = await llm_client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": _ADVICE_SYSTEM_PROMPT + f" Respond in '{language}'."},
                {"role": "user", "content": context},
            ],
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=180,
        )
        advice = (resp.choices[0].message.content or "").strip()
        return advice or _static_advice(result.get("status", "NORMAL"), result.get("score", 0.0))
    except Exception as exc:
        logger.warning(f"[VisionAgent] Advice LLM failed; using static tips: {exc}")
        return _static_advice(result.get("status", "NORMAL"), result.get("score", 0.0))


async def vision_agent_node(state: AgentState) -> AgentState:
    logger.info(f"[VisionAgent] Starting analysis for patient {state['patient_id']}")
    errors = list(state.get("errors", []))
    wound_path = state.get("wound_image_path")

    if not wound_path or not Path(wound_path).exists():
        logger.warning(f"[VisionAgent] No image at {wound_path}")
        return {
            **state,
            "wound_severity": "NORMAL",
            "wound_score": 0.0,
            "redness_detected": False,
            "swelling_detected": False,
            "texture_change_detected": False,
            "wound_analysis_summary": "No wound image available.",
            "errors": errors,
        }

    # 1) Try Hugging Face API
    result = classify_with_huggingface(wound_path)
    if result:
        logger.info(f"[VisionAgent] HuggingFace success: {result['summary']}")
    else:
        # 2) Fallback to OpenCV
        logger.warning("[VisionAgent] HuggingFace failed, using OpenCV fallback")
        result = analyze_with_opencv(wound_path)
        errors.append("Used OpenCV fallback for wound analysis")

    severity_str = result["status"]
    try:
        severity_enum = WoundSeverity(severity_str)
    except ValueError:
        severity_enum = WoundSeverity.NORMAL

    # Load patient context (doctor's notes) and generate AI advice
    db: Session = SessionLocal()
    patient_context = ""
    try:
        active_course = db.query(MedicalCourse).filter(
            MedicalCourse.patient_id == state["patient_id"],
            MedicalCourse.status == "ACTIVE",
        ).first()
        patient_context = getattr(active_course, "patient_context", "") or ""
    except Exception as e:
        logger.warning(f"[VisionAgent] Could not load patient context: {e}")

    advice = await generate_ai_advice(result, patient_context=patient_context)

    # Persist to database
    wound_analysis_id = None
    try:
        analysis = WoundAnalysis(
            patient_id=state["patient_id"],
            check_in_id=state["check_in_id"],
            image_url=wound_path,
            severity=severity_enum,
            raw_llm_response=result["raw_response"],
            redness_detected=("redness" in result["summary"].lower()),
            swelling_detected=("swelling" in result["summary"].lower()),
            texture_change_detected=("texture" in result["summary"].lower()),
            analysis_summary=result["summary"],
            ai_advice=advice,
            wound_score=result["score"],
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)
        wound_analysis_id = analysis.id
        logger.info(f"[VisionAgent] WoundAnalysis saved, id={analysis.id}, severity={severity_str}")
    except Exception as e:
        db.rollback()
        logger.error(f"[VisionAgent] DB error: {e}")
        errors.append(f"DB write failed: {e}")
    finally:
        db.close()

    return {
        **state,
        "wound_severity": severity_str,
        "wound_score": result["score"],
        "wound_analysis_id": wound_analysis_id,
        "redness_detected": ("redness" in result["summary"].lower()),
        "swelling_detected": ("swelling" in result["summary"].lower()),
        "texture_change_detected": ("texture" in result["summary"].lower()),
        "wound_analysis_summary": result["summary"],
        "wound_ai_advice": advice,
        "errors": errors,
    }