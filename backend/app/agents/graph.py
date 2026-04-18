"""
CARENETRA — LangGraph Agent Graph
Wires all 5 agent nodes in sequence.
Vision agent is conditionally skipped if no wound image is present.

Flow:
  START
    → symptom_agent
    → [vision_agent if has_wound_image else skip]
    → risk_agent
    → escalation_agent
    → monitoring_agent
    → END
"""
import logging
from langgraph.graph import StateGraph, END, START

from app.agents.state import AgentState
from app.nodes.symptom_agent import symptom_agent_node
from app.nodes.vision_agent import vision_agent_node
from app.nodes.risk_agent import risk_agent_node
from app.nodes.escalation_agent import escalation_agent_node
from app.nodes.monitoring_agent import monitoring_agent_node

logger = logging.getLogger(__name__)


# ── Conditional routing function ──────────────────────────────────

def route_after_symptom(state: AgentState) -> str:
    """
    After symptom agent runs: go to vision if image present, else skip to risk.
    """
    if state.get("has_wound_image") and state.get("wound_image_path"):
        logger.info("[Graph] Routing to vision_agent (wound image detected)")
        return "vision"
    logger.info("[Graph] Skipping vision_agent (no wound image)")
    return "risk"


# ── Build the graph ───────────────────────────────────────────────

def build_graph() -> StateGraph:
    graph = StateGraph(AgentState)

    # Register all nodes
    graph.add_node("symptom_agent",    symptom_agent_node)
    graph.add_node("vision_agent",     vision_agent_node)
    graph.add_node("risk_agent",       risk_agent_node)
    graph.add_node("escalation_agent", escalation_agent_node)
    graph.add_node("monitoring_agent", monitoring_agent_node)

    # Entry point
    graph.add_edge(START, "symptom_agent")

    # After symptom agent: conditionally go to vision or skip to risk
    graph.add_conditional_edges(
        "symptom_agent",
        route_after_symptom,
        {
            "vision": "vision_agent",
            "risk":   "risk_agent",
        }
    )

    # Vision always leads to risk
    graph.add_edge("vision_agent", "risk_agent")

    # Linear from here
    graph.add_edge("risk_agent",       "escalation_agent")
    graph.add_edge("escalation_agent", "monitoring_agent")
    graph.add_edge("monitoring_agent", END)

    return graph


# ── Compile once at import time (reused for all requests) ─────────
compiled_graph = build_graph().compile()
logger.info("[Graph] CARENETRA agent graph compiled successfully")


# ── Public entry point ────────────────────────────────────────────

async def run_agent_pipeline(
    patient_id:       str,
    check_in_id:      str,
    raw_input:        str,
    input_type:       str = "TEXT",
    course_id:        str | None = None,
    has_wound_image:  bool = False,
    wound_image_path: str | None = None,
) -> AgentState:
    """
    Main entry point called by the API layer.
    Builds initial state and invokes the full agent graph.
    Returns the final AgentState after all nodes have run.
    """
    initial_state: AgentState = {
        # Input
        "patient_id":       patient_id,
        "check_in_id":      check_in_id,
        "course_id":        course_id,
        "input_type":       input_type,
        "raw_input":        raw_input,

        # Wound image
        "has_wound_image":  has_wound_image,
        "wound_image_path": wound_image_path,

        # All other fields start as None — agents fill them in
        "fever_level":              None,
        "fatigue_score":            None,
        "medication_taken":         None,
        "medication_time":          None,
        "symptom_summary":          None,
        "symptom_llm_score":        None,
        "wound_severity":           None,
        "wound_score":              None,
        "wound_analysis_id":        None,
        "redness_detected":         None,
        "swelling_detected":        None,
        "texture_change_detected":  None,
        "wound_analysis_summary":   None,
        "fever_raw_score":          None,
        "fatigue_raw_score":        None,
        "medication_raw_score":     None,
        "total_score":              None,
        "tier":                     None,
        "breakdown":                None,
        "risk_score_id":            None,
        "escalation_action":        None,
        "alert_id":                 None,
        "alert_message":            None,
        "new_interval_hours":       None,
        "interval_reason":          None,
        "errors":                   [],
    }

    logger.info(
        f"[Graph] Starting pipeline | patient={patient_id} "
        f"input_type={input_type} wound={has_wound_image}"
    )

    final_state = await compiled_graph.ainvoke(initial_state)

    if final_state.get("errors"):
        logger.warning(f"[Graph] Pipeline completed with errors: {final_state['errors']}")
    else:
        logger.info(
            f"[Graph] Pipeline complete | "
            f"score={final_state.get('total_score')} "
            f"tier={final_state.get('tier')} "
            f"action={final_state.get('escalation_action')}"
        )

    return final_state