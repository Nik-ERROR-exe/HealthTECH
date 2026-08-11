"""Unit tests for the deterministic risk-scoring fallback (no ML model / DB)."""
from app.nodes.risk_agent import _fallback_prediction


def test_weighted_formula_known_input():
    # Components are 0-10: fever 8, fatigue 5, medication 0 (taken), wound 7, symptom 6
    result = _fallback_prediction(fever=8.0, fatigue=5.0, medication=0.0, wound=7.0, symptom=6.0)
    expected = (8 * 0.25 + 5 * 0.15 + 0 * 0.20 + 7 * 0.30 + 6 * 0.10) * 10
    assert result["risk_score"] == round(expected, 2)
    assert 0 <= result["risk_score"] <= 100


def test_fallback_tiers():
    assert _fallback_prediction(0, 0, 0, 0, 0)["tier"] == "GREEN"
    assert _fallback_prediction(3, 2, 5, 2, 2)["tier"] == "YELLOW"   # ~ (0.75+.3+1+.6+.2)*10=28.5
    assert _fallback_prediction(6, 5, 5, 7, 5)["tier"] == "ORANGE"   # ~ (1.5+.75+1+2.1+.5)*10=58.5
    assert _fallback_prediction(8, 7, 10, 8, 7)["tier"] == "RED"     # ~ (2+1.05+2+2.4+.7)*10=81.5
    assert _fallback_prediction(10, 10, 10, 10, 10)["tier"] == "EMERGENCY"  # 100


def test_fallback_never_exceeds_bounds():
    assert _fallback_prediction(100, 100, 100, 100, 100)["risk_score"] == 100.0
    assert _fallback_prediction(-5, -5, -5, -5, -5)["risk_score"] == 0.0
