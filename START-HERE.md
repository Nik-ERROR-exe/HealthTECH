# START-HERE.md — Onboarding

Welcome to CARENETRA. If you're new here, read this first, then dive into the room that matches
your task.

## Run the backend (from `backend/`)
1. `pip install -r requirements.txt`
2. Set `DATABASE_URL` (+ API keys) in `backend/.env` — copy `backend/.env.example`.
3. Add check-in knowledge docs under `backend/knowledge/*.md` (optional — the Qdrant index builds
   at startup).
4. `uvicorn main:app --reload` (also `app.main:app`). Lifespan starts the scheduler + RAG index.

## Run the frontend (from `frontend/`)
1. `npm install`
2. `npm run dev` (defaults to API at `http://localhost:8000`).

## How the agentic flow works (one paragraph)
A patient starts a conversation (`/api/patient/conversation/*`). The caretaker agent asks
condition- and history-aware questions (static bank + up to 2 NVIDIA-LLM adaptive follow-ups,
grounded in the `backend/knowledge/` RAG corpus). Answers compile into a check-in; a LangGraph
pipeline (symptom → vision → risk → escalation → report → monitoring) scores 0–100, tiers
GREEN→EMERGENCY, fires alerts, adapts cadence, and writes an AI doctor report.

## Non-negotiables
- Commits: `Nik-ERROR-exe <wnikhil146@gmail.com>`, no Co-Authored-By, no secrets.
- Schema: edit `backend/db/schema.sql` **and** `backend/app/models/models.py` together; ALTER the
  live Neon DB with `ADD COLUMN IF NOT EXISTS`.
- Free services only; always keep a no-key/offline fallback path.