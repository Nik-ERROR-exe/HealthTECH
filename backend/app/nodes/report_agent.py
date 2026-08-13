"""
Node 6 — Report Agent (RAG-grounded)
Composes an accurate clinical narrative for the doctor from the check-in,
risk breakdown, wound analysis, patient context, and the RAG knowledge base.

Persists `check_ins.agent_report` and, on escalation (ORANGE/RED/EMERGENCY),
creates a `doctor_messages` record to the course doctor.
"""
import logging
from sqlalchemy.orm import Session

from app.agents.state import AgentState
from app.database import SessionLocal
from app.models.models import CheckIn, DoctorMessage, MedicalCourse

logger = logging.getLogger(__name__)

ESCALATION_TIERS = {"ORANGE", "RED", "EMERGENCY"}


def build_report_prompt(state: AgentState, patient_context: str, doc_excerpts: list) -> str:
    """Pure prompt builder (unit-testable)."""
    score = state.get("total_score") or 0
    tier = state.get("tier") or "GREEN"
    lines = [
        "Write a clear clinical check-in report for the supervising doctor. Sections:",
        "1) Patient summary (plain English).",
        "2) Clinical note: extracted symptoms, risk score/tier, wound findings.",
        "3) Red flags to watch in the next 24 hours.",
        "4) Recommended action based on the care guidelines.",
        "",
        f"Risk score: {score}/100, tier: {tier}.",
        f"Symptom summary: {state.get('symptom_summary') or 'none'}",
        f"Wound findings: {state.get('wound_analysis_summary') or 'none'}",
        f"Patient context: {str(patient_context)[:500] or 'none'}",
    ]
    if doc_excerpts:
        lines.append("")
        lines.append("Relevant care guideline excerpts:")
        for excerpt in doc_excerpts[:3]:
            lines.append(f"- {str(excerpt)[:400]}")
    lines.append("")
    lines.append("STRICT ACCURACY CONSTRAINTS:")
    lines.append("- You must generate the report EXCLUSIVELY based on the provided check-in inputs, symptoms, and wound findings above.")
    lines.append("- Do NOT invent, infer, or hallucinate outside context, unmentioned symptoms, or unverified medical history.")
    lines.append("- Keep the report under 300 words, strictly factual, and specific to this patient's check-in answers.")
    return "\n".join(lines)


def _static_report(state: AgentState, patient_context: str) -> str:
    """Static fallback if the LLM is unreachable — always safe to send."""
    tier = state.get("tier") or "GREEN"
    return (
        f"Check-in report — tier {tier}, score {state.get('total_score') or 0}/100.\n"
        f"Symptoms: {state.get('symptom_summary') or 'none reported'}.\n"
        f"Wound: {state.get('wound_analysis_summary') or 'no image'}.\n"
        f"Patient context: {str(patient_context)[:300] or 'none'}.\n"
        "Action: review patient status and confirm monitoring cadence."
    )


async def _generate_report(state: AgentState, patient_context: str, doc_excerpts: list) -> str:
    from app.agents.nvidia_client import LLM_MODEL, llm_client
    from app.config import settings

    system = (
        "You are a medical documentation assistant. Produce ONLY the report body "
        "as plain text with the requested sections. You MUST generate the report EXCLUSIVELY "
        "from reported symptoms, check-in answers, and wound data provided above. "
        "Do NOT invent, infer, or add outside context, unmentioned symptoms, or unverified medical history."
    )
    try:
        resp = await llm_client.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": build_report_prompt(state, patient_context, doc_excerpts)},
            ],
            temperature=settings.LLM_TEMPERATURE,
            max_tokens=400,
        )
        report = (resp.choices[0].message.content or "").strip()
        return report or _static_report(state, patient_context)
    except Exception as exc:
        logger.warning(f"[ReportAgent] LLM failed; using static report: {exc}")
        return _static_report(state, patient_context)


async def report_agent_node(state: AgentState) -> AgentState:
    errors = list(state.get("errors", []))
    db: Session = SessionLocal()
    report = ""
    try:
        # Patient + active course context (doctor's notes)
        course = db.query(MedicalCourse).filter(
            MedicalCourse.patient_id == state["patient_id"],
            MedicalCourse.status == "ACTIVE",
        ).first()
        patient_context = (getattr(course, "patient_context", "") or "") if course else ""

        # RAG context from the raw check-in input
        doc_excerpts: list = []
        try:
            from app.rag.retriever import retrieve
            doc_excerpts = [
                r["text"]
                for r in await retrieve(state.get("raw_input", "") or "", top_k=3)
            ]
        except Exception as exc:
            logger.warning(f"[ReportAgent] RAG retrieval failed: {exc}")

        report = await _generate_report(state, patient_context, doc_excerpts)

        # Persist the narrative on the check-in
        check_in = db.query(CheckIn).filter(CheckIn.id == state["check_in_id"]).first()
        if check_in:
            check_in.agent_report = report
            db.commit()

        # On escalation, message the course doctor (in-app report)
        tier = state.get("tier") or "GREEN"
        if tier in ESCALATION_TIERS and course and course.doctor_id:
            db.add(DoctorMessage(
                doctor_id=course.doctor_id,
                patient_id=state["patient_id"],
                message=report,
                is_read=False,
            ))
            db.commit()
            logger.info(f"[ReportAgent] Doctor message created for tier={tier}")
    except Exception as exc:
        db.rollback()
        errors.append(f"ReportAgent failed: {exc}")
        logger.error(f"[ReportAgent] error: {exc}")
    finally:
        db.close()

    return {**state, "agent_report": report, "errors": errors}