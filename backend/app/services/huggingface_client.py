import os
import requests
import logging
from typing import Dict, Any

logger = logging.getLogger(__name__)

HUGGINGFACE_API_KEY = os.getenv("HUGGINGFACE_API_KEY")
# Use a model that works well for skin/wound classification
# You can change this to any image classification model on Hugging Face
MODEL_ID = "smitesh19/CNN-Skin-Disease-Classifier"  
# Alternative: "rizwanqureshi/skin-disease-multiclass-classification"
# Or: "microsoft/swin-tiny-patch4-window7-224" (general, less accurate for wounds)

API_URL = f"https://api-inference.huggingface.co/models/{MODEL_ID}"
HEADERS = {"Authorization": f"Bearer {HUGGINGFACE_API_KEY}"}

def classify_wound_image(image_path: str) -> Dict[str, Any]:
    """
    Send image to Hugging Face Inference API and return classification result.
    Returns:
        {
            "success": bool,
            "label": str (e.g., "melanoma", "eczema", "normal", ...),
            "confidence": float,
            "severity_score": float (0-10, derived from label),
            "status": "NORMAL" | "MODERATE" | "DANGEROUS"
        }
    """
    if not HUGGINGFACE_API_KEY:
        logger.error("HUGGINGFACE_API_KEY not set")
        return {"success": False, "error": "No API key"}

    try:
        with open(image_path, "rb") as f:
            image_data = f.read()
        response = requests.post(API_URL, headers=HEADERS, data=image_data, timeout=30)
        if response.status_code != 200:
            logger.error(f"HuggingFace API error: {response.status_code} {response.text}")
            return {"success": False, "error": f"API error: {response.status_code}"}

        result = response.json()
        # The model returns list of labels + scores; e.g., [{"label": "melanoma", "score": 0.95}, ...]
        if isinstance(result, list) and len(result) > 0:
            top = result[0]
            label = top.get("label", "unknown")
            confidence = top.get("score", 0.0)
        else:
            label = "unknown"
            confidence = 0.0

        # Map label to severity score (0–10) and status
        # Adjust these mappings based on the actual model's output classes
        label_lower = label.lower()
        if any(k in label_lower for k in ["malignant", "melanoma", "cancer", "dangerous", "severe"]):
            severity = 8.5
            status = "DANGEROUS"
        elif any(k in label_lower for k in ["moderate", "infection", "cellulitis"]):
            severity = 5.5
            status = "MODERATE"
        elif any(k in label_lower for k in ["normal", "benign", "healthy"]):
            severity = 1.0
            status = "NORMAL"
        else:
            severity = 3.0
            status = "MODERATE"

        return {
            "success": True,
            "label": label,
            "confidence": round(confidence, 3),
            "severity_score": severity,
            "status": status,
        }
    except Exception as e:
        logger.error(f"HuggingFace client error: {e}")
        return {"success": False, "error": str(e)}