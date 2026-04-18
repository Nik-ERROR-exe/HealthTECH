"""
Node 2 — Vision Analysis Agent
Analyses a wound photo using moondream (local Ollama vision model).

moondream is a small vision model — it answers plain questions about images
well but doesn't reliably produce structured JSON output. So this node:
  1. Sends a plain-question prompt (no JSON schema instruction)
  2. Reads the plain-text response
  3. Maps it locally to a structured WoundAnalysis record using keyword detection
  4. Derives a wound_score (0–10) from detected findings

This "ask then classify locally" approach is more reliable than asking a small
vision model to produce JSON directly.
"""
import base64
import logging
from pathlib import Path
from sqlalchemy.orm import Session

from app.agents.state import AgentState
from app.agents.nvidia_client import vision_client, VISION_MODEL
from app.database import SessionLocal
from app.models.models import WoundAnalysis, WoundSeverity

logger = logging.getLogger(__name__)


# ── Prompt — plain questions, no JSON schema ──────────────────────────────────
# moondream works best with direct, concrete questions.
# We ask three yes/no questions in one shot to keep it to one API call.

VISION_PROMPT = (
    "Look at this wound or surgical site photo carefully. "
    "Answer these three questions with yes or no, then add a brief explanation:\n\n"
    "1. Is there visible redness or inflammation around the wound?\n"
    "2. Is there visible swelling or raised tissue?\n"
    "3. Are there any abnormal textures such as discharge, crusting, or unusual colour?\n\n"
    "Keep your answer short and factual."
)


# ── Local classification from plain-text response ────────────────────────────

def _parse_vision_response(raw_text: str) -> dict:
    """
    Maps moondream's plain-text response to structured findings.
    Keyword-based — designed for the specific three-question prompt above.
    Returns a dict with: redness, swelling, texture_change, severity, score, summary
    """
    text_lower = raw_text.lower()

    # ── Detect findings via keywords ──────────────────────────────

    # Redness
    redness = (
        any(kw in text_lower for kw in ["yes", "redness", "red", "inflam", "pink", "flush"])
        and not _is_negated("redness", text_lower)
        and not _is_negated("redness", text_lower)
    )
    # Re-check: if "no" appears near "redness" in Q1 context, override
    lines = raw_text.strip().split("\n")
    if lines:
        q1_line = lines[0].lower() if len(lines) >= 1 else ""
        redness = _answer_is_yes(q1_line)

    # Swelling
    swelling = False
    if len(lines) >= 2:
        q2_line = lines[1].lower()
        swelling = _answer_is_yes(q2_line)

    # Texture change
    texture_change = False
    if len(lines) >= 3:
        q3_line = lines[2].lower()
        texture_change = _answer_is_yes(q3_line)

    # Fallback: scan full text if line-based parsing yielded no findings at all
    if not redness and not swelling and not texture_change:
        redness        = any(kw in text_lower for kw in ["redness", "red ", "inflam", "irritat"])
        swelling       = any(kw in text_lower for kw in ["swelling", "swollen", "raised", "puffy"])
        texture_change = any(kw in text_lower for kw in ["discharge", "crust", "abnormal", "unusual", "pus", "oozing"])

    # ── Score derivation (0–10 scale) ────────────────────────────
    # Base score from number of positive findings
    finding_count = sum([redness, swelling, texture_change])

    if finding_count == 0:
        score    = 1.0
        severity = WoundSeverity.NORMAL
    elif finding_count == 1:
        score    = 3.5
        severity = WoundSeverity.MILD
    elif finding_count == 2:
        score    = 6.5
        severity = WoundSeverity.MODERATE
    else:  # all 3
        score    = 8.5
        severity = WoundSeverity.SEVERE

    # Boost score if high-severity keywords present in full response
    if any(kw in text_lower for kw in ["pus", "discharge", "infection", "necrosis", "very red", "severely"]):
        score = min(10.0, score + 1.5)

    # ── Build patient-friendly summary ───────────────────────────
    findings_found = []
    if redness:        findings_found.append("redness")
    if swelling:       findings_found.append("swelling")
    if texture_change: findings_found.append("unusual texture")

    if not findings_found:
        summary = "Wound appears clean with no signs of infection detected."
    elif finding_count == 1:
        summary = f"Wound shows some {findings_found[0]}. Worth monitoring but not immediately alarming."
    else:
        summary = f"Wound shows {' and '.join(findings_found)}. Doctor has been notified to review."

    return {
        "redness":        redness,
        "swelling":       swelling,
        "texture_change": texture_change,
        "severity":       severity,
        "score":          round(score, 1),
        "summary":        summary,
        "raw_response":   raw_text,
    }


def _answer_is_yes(line: str) -> bool:
    """Returns True if a single Q&A line indicates a positive finding."""
    strong_yes = ["yes", "visible", "present", "detected", "apparent", "notable"]
    strong_no  = ["no ", "none", "not ", "no visible", "no sign", "cannot", "can't", "doesn't", "absent"]
    has_yes    = any(kw in line for kw in strong_yes)
    has_no     = any(kw in line for kw in strong_no)
    return has_yes and not has_no


def _is_negated(keyword: str, text: str) -> bool:
    """Crude negation check — looks for 'no <keyword>' pattern."""
    return f"no {keyword}" in text or f"not {keyword}" in text


# ── Agent node ────────────────────────────────────────────────────────────────

async def vision_agent_node(state: AgentState) -> AgentState:
    """
    Runs wound photo through moondream vision model locally via Ollama.
    Stores a WoundAnalysis record and updates AgentState.
    """
    logger.info(f"[VisionAgent] Starting for patient {state['patient_id']}")
    errors = list(state.get("errors", []))

    wound_path = state.get("wound_image_path")
    if not wound_path or not Path(wound_path).exists():
        logger.warning(f"[VisionAgent] Wound image path not found: {wound_path}")
        return {
            **state,
            "wound_severity": "NORMAL",
            "wound_score": 0.0,
            "redness_detected": False,
            "swelling_detected": False,
            "texture_change_detected": False,
            "wound_analysis_summary": "No wound image available for analysis.",
            "errors": errors,
        }

    # ── Load and encode image ─────────────────────────────────────
    try:
        with open(wound_path, "rb") as f:
            image_bytes = f.read()

        base64_image = base64.b64encode(image_bytes).decode("utf-8")

        # Detect MIME type from extension
        ext_map = {
            "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "png": "image/png", "webp": "image/webp",
            "heic": "image/heic", "heif": "image/heif",
        }
        ext      = wound_path.rsplit(".", 1)[-1].lower()
        mime     = ext_map.get(ext, "image/jpeg")
        data_url = f"data:{mime};base64,{base64_image}"

    except Exception as e:
        logger.error(f"[VisionAgent] Failed to read image: {e}")
        errors.append(f"VisionAgent image read failed: {e}")
        return {**state, "wound_score": 0.0, "wound_severity": "NORMAL", "errors": errors}

    # ── Call moondream via Ollama ─────────────────────────────────
    try:
        response = await vision_client.chat.completions.create(
            model=VISION_MODEL,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": data_url},
                        },
                        {
                            "type": "text",
                            "text": VISION_PROMPT,
                        },
                    ],
                }
            ],
            max_tokens=250,
            temperature=0.1,
        )

        raw_response = response.choices[0].message.content.strip()
        logger.info(f"[VisionAgent] Raw response: {raw_response[:150]}")

    except Exception as e:
        logger.error(f"[VisionAgent] Vision model call failed: {e}")
        errors.append(f"VisionAgent LLM call failed: {e}")
        return {**state, "wound_score": 0.0, "wound_severity": "NORMAL", "errors": errors}

    # ── Parse response locally ────────────────────────────────────
    findings = _parse_vision_response(raw_response)

    # ── Persist WoundAnalysis to DB ───────────────────────────────
    db: Session = SessionLocal()
    wound_analysis_id = None
    try:
        analysis = WoundAnalysis(
            patient_id=state["patient_id"],
            check_in_id=state["check_in_id"],
            image_url=wound_path,
            severity=findings["severity"],
            raw_llm_response=findings["raw_response"],
            redness_detected=findings["redness"],
            swelling_detected=findings["swelling"],
            texture_change_detected=findings["texture_change"],
            analysis_summary=findings["summary"],
            wound_score=findings["score"],
        )
        db.add(analysis)
        db.commit()
        db.refresh(analysis)
        wound_analysis_id = analysis.id
        logger.info(
            f"[VisionAgent] WoundAnalysis saved — id={analysis.id} "
            f"severity={findings['severity'].value} score={findings['score']}"
        )
    except Exception as e:
        db.rollback()
        logger.error(f"[VisionAgent] DB write failed: {e}")
        errors.append(f"VisionAgent DB write failed: {e}")
    finally:
        db.close()

    return {
        **state,
        "wound_severity":          findings["severity"].value,
        "wound_score":             findings["score"],
        "wound_analysis_id":       wound_analysis_id,
        "redness_detected":        findings["redness"],
        "swelling_detected":       findings["swelling"],
        "texture_change_detected": findings["texture_change"],
        "wound_analysis_summary":  findings["summary"],
        "errors":                  errors,
    }