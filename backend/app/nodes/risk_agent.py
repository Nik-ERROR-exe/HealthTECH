"""
Node 3 — Risk Assessment Agent (ML-powered with safe fallback)
Uses the trained GradientBoostingClassifier from app/ml/risk_model.py
when available; otherwise falls back to a hardcoded weighted formula.

The agent always returns a valid risk tier and score, never crashes.
"""
import logging
from sqlalchemy.orm import Session

from app.agents.state import AgentState
from app.database import SessionLocal
from app.models.models import RiskScore, RiskTier

logger = logging.getLogger(__name__)

# Try to import the ML model (will fail gracefully if missing)
try:
    from app.ml.risk_model import predict_risk
    ML_AVAILABLE = True
except (ImportError, FileNotFoundError) as e:
    logger.warning(f"[RiskAgent] Could not import ML model: {e}. Using fallback only.")
    ML_AVAILABLE = False


# ── Component score mapping functions (convert raw values to 0‑10 scale) ──────
def _score_fever(fever_level: str | None) -> float:
    return {
        "normal":    0.0,
        "low_grade": 3.0,
        "high":      6.0,
        "critical":  10.0,
        "unknown":   2.0,
    }.get(fever_level or "unknown", 2.0)


def _score_fatigue(fatigue_score: int | None) -> float:
    if fatigue_score is None:
        return 2.0
    if fatigue_score <= 3:
        return 2.0
    if fatigue_score <= 6:
        return 5.0
    if fatigue_score <= 8:
        return 7.5
    return 10.0


def _score_medication(medication_taken: bool | None) -> float:
    if medication_taken is True:
        return 0.0
    if medication_taken is False:
        return 10.0
    return 5.0


def _score_wound(wound_score: float | None) -> float:
    return wound_score if wound_score is not None else 0.0


# ── Safe fallback prediction (never fails) ───────────────────────────────────
def _fallback_prediction(fever: float, fatigue: float, medication: float,
                         wound: float, symptom: float) -> dict:
    """Hardcoded weighted formula – always works, no dependencies."""
    score = round(
        (fever * 0.25 + fatigue * 0.15 + medication * 0.20 + wound * 0.30 + symptom * 0.10) * 10,
        2
    )
    score = max(0.0, min(100.0, score))

    if score <= 25:
        tier = "GREEN"
    elif score <= 50:
        tier = "YELLOW"
    elif score <= 75:
        tier = "ORANGE"
    elif score <= 90:
        tier = "RED"
    else:
        tier = "EMERGENCY"

    return {
        "tier": tier,
        "risk_score": score,
        "confidence": 0.85,  # fallback confidence is decent
        "suggestions": [
            "Fallback risk assessment used. Please review patient manually.",
            "Consider checking vitals and symptoms directly."
        ],
        "explanation": f"Fallback weighted formula. Score: {score:.1f}/100.",
        "feature_contributions": {},
        "top_driver": "combined_score",
    }


# ── Main agent node ───────────────────────────────────────────────────────────
async def risk_agent_node(state: AgentState) -> AgentState:
    print("===== RISK AGENT NODE CALLED =====", flush=True)
    logger.info(f"[RiskAgent] Running risk assessment for patient {state['patient_id']}")
    errors = list(state.get("errors", []))

    # ── Compute 0–10 feature scores from AgentState ───────────────────────────
    fever_raw      = _score_fever(state.get("fever_level"))
    fatigue_raw    = _score_fatigue(state.get("fatigue_score"))
    medication_raw = _score_medication(state.get("medication_taken"))
    wound_raw      = _score_wound(state.get("wound_score"))
    symptom_llm    = float(state.get("symptom_llm_score") or 0.0)

    # ── Try ML prediction if available; otherwise use fallback ────────────────
    if ML_AVAILABLE:
        try:
            prediction = predict_risk(
                fever_score      = fever_raw,
                fatigue_score    = fatigue_raw,
                medication_score = medication_raw,
                wound_score      = wound_raw,
                symptom_score    = symptom_llm,
            )
            logger.info("[RiskAgent] ML prediction successful")
        except Exception as e:
            logger.error(f"[RiskAgent] ML prediction failed: {e}")
            errors.append(f"ML model error: {e}. Using fallback.")
            prediction = _fallback_prediction(fever_raw, fatigue_raw, medication_raw,
                                              wound_raw, symptom_llm)
    else:
        logger.warning("[RiskAgent] ML model not available, using fallback formula")
        errors.append("ML model not loaded – using fallback formula.")
        prediction = _fallback_prediction(fever_raw, fatigue_raw, medication_raw,
                                          wound_raw, symptom_llm)

    tier = prediction["tier"]
    total_score = prediction["risk_score"]
    confidence = prediction.get("confidence", 1.0)
    suggestions = prediction.get("suggestions", [])
    explanation = prediction.get("explanation", "")
    contributions = prediction.get("feature_contributions", {})

    # Map tier string to RiskTier enum
    try:
        tier_enum = RiskTier(tier)
    except ValueError:
        tier_enum = RiskTier.GREEN

    logger.info(
        f"[RiskAgent] Risk result: score={total_score:.1f} tier={tier} "
        f"confidence={confidence:.2f}"
    )

    # ── Build breakdown for DB + doctor dashboard ─────────────────────────────
    breakdown = {
        "model": "safe_fallback" if not ML_AVAILABLE else "GradientBoostingClassifier",
        "method": "ML" if ML_AVAILABLE else "hardcoded_formula",
        "fever": {
            "input": state.get("fever_level", "unknown"),
            "feature_score": fever_raw,
            "contribution": contributions.get("fever_score", 0),
        },
        "fatigue": {
            "input": state.get("fatigue_score"),
            "feature_score": fatigue_raw,
            "contribution": contributions.get("fatigue_score", 0),
        },
        "medication": {
            "input": state.get("medication_taken"),
            "feature_score": medication_raw,
            "contribution": contributions.get("medication_score", 0),
        },
        "wound": {
            "input": state.get("wound_severity", "N/A"),
            "feature_score": wound_raw,
            "contribution": contributions.get("wound_score", 0),
        },
        "symptom_llm": {
            "input": state.get("symptom_summary", ""),
            "feature_score": symptom_llm,
            "contribution": contributions.get("symptom_score", 0),
        },
        "total_score": total_score,
        "tier": tier,
        "confidence": confidence,
        "explanation": explanation,
        "suggestions": suggestions,
        "top_driver": prediction.get("top_driver", ""),
    }

    # ── Persist to risk_scores table ──────────────────────────────────────────
    risk_score_id = None
    db: Session = SessionLocal()
    try:
        record = RiskScore(
            patient_id           = state["patient_id"],
            check_in_id          = state["check_in_id"],
            fever_raw_score      = fever_raw,
            fatigue_raw_score    = fatigue_raw,
            medication_raw_score = medication_raw,
            wound_raw_score      = wound_raw,
            symptom_llm_score    = symptom_llm,
            total_score          = total_score,
            tier                 = tier_enum,
            breakdown            = breakdown,
        )
        db.add(record)
        db.commit()
        db.refresh(record)
        risk_score_id = record.id
        logger.info(f"[RiskAgent] Saved risk_score {risk_score_id}")
    except Exception as e:
        db.rollback()
        logger.error(f"[RiskAgent] DB write failed: {e}")
        errors.append(f"RiskAgent DB write failed: {e}")
    finally:
        db.close()

    return {
        **state,
        "fever_raw_score":      fever_raw,
        "fatigue_raw_score":    fatigue_raw,
        "medication_raw_score": medication_raw,
        "total_score":          total_score,
        "tier":                 tier,
        "breakdown":            breakdown,
        "risk_score_id":        risk_score_id,
        "errors":               errors,
        "ml_confidence":        confidence,
        "ml_suggestions":       suggestions,
        "ml_explanation":       explanation,
    }