# AI Doctor Report

## Why
The doctor should receive an accurate, RAG-grounded clinical narrative for each check-in, not a
raw score. The report compares the patient's answers against the medical-docs knowledge base.

## Flow
1. After escalation, `report_agent_node` runs (graph: escalation → **report** → monitoring).
2. It loads the active course (patient context / doctor's notes), pulls up to 3 RAG excerpts using
   the compiled check-in input, and calls the NVIDIA LLM with `build_report_prompt`:
   patient summary / clinical note (symptoms, score, tier, wound) / red flags / recommended action.
3. Failure → `_static_report` (still structured and safe).
4. Persisted to `check_ins.agent_report`. If tier is ORANGE/RED/EMERGENCY, a `DoctorMessage` is
   created to the course doctor (`is_read=False`).

## Surfacing
- `GET /api/doctor` patient detail → each recent check-in includes `agent_report`.
- The doctor UI renders it from that field (additive change).

## Files
- `backend/app/nodes/report_agent.py` (new), `backend/app/agents/graph.py`, `backend/app/agents/state.py`
- `backend/app/routers/doctor.py`

## Gotchas
- LLM failure → static fallback; never blocks the pipeline.
- Requires `check_ins.agent_report` column (schema.sql + models.py in the same commit; ALTER the
  live Neon DB with `ADD COLUMN IF NOT EXISTS`).