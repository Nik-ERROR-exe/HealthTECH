# Adaptive Check-In Questions

## Why
Check-in questions used to be a fixed static bank (`question_bank.py`) that never changed with the
patient's condition or history. Now the caretaker asks **condition- and history-aware** questions.

## How it works
1. Base bank + condition queues stay the source of truth (offline, reliable).
2. In `caretaker_agent.process_answer` (with `db`/`patient_id` from `conversation.py`), after the
   static next question is selected, up to `MAX_ADAPTIVE_FOLLOWUPS` (2) NVIDIA-LLM follow-ups may
   be inserted **before** the static question (the static one stays queued so no clinical data is lost).
3. `adaptive_questions.maybe_adaptive_followup` builds a context summary from condition,
   medications, doctor's notes (`patient_context`), day, and recent answers — plus a RAG care
   guideline excerpt — and asks the LLM (`meta/llama-3.1-8b-instruct`) for one follow-up question as JSON.
4. `parse_adaptive_question` tolerates ```` ```json ```` fences; any failure (LLM/parse) → fall back
   to the static question. The fully-offline path never breaks.

## Files
- `backend/app/nodes/adaptive_questions.py` (new)
- `backend/app/nodes/caretaker_agent.py` (inserts the follow-up)
- `backend/app/routers/conversation.py` (passes db + patient_id)

## Env / cost
- Uses `LLM_MODEL`, `LLM_TEMPERATURE`. Capped at 2 LLM + 2 embed calls per check-in (free tier).
- RAG Q&A (patient queries) lives here too: `answer_from_knowledge` → `POST /api/patient/conversation/ask`.