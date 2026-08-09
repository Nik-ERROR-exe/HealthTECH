# CONTEXT.md — Task Router

## Project
**CARENETRA** — agentic remote-health monitoring for post-surgical / high-risk patients (SIH
hackathon). FastAPI backend + React frontend + PostgreSQL (Neon). Check-ins, adaptive questions,
wound vision, RAG, alerts.

## Repo layout (rooms)
- `backend/` — FastAPI app. Read `backend/CONTEXT.md` for backend architecture.
- `frontend/` — React 18 + Vite + TS app. Read `frontend/CONTEXT.md` for frontend architecture.
- `docs/` — design notes for the AI features (adaptive-questions, rag-design, vision-advice,
  report-format).
- `CLAUDE.md` — instructions + hard rules (git identity, /api prefix, schema sync, free services).

## Route by task
Ask anything and start from the appropriate room:
- **Backend changes** → read `backend/CONTEXT.md`.
- **Frontend changes** → read `frontend/CONTEXT.md`.
- **AI feature design / RAG / prompts** → read the relevant file in `docs/`.
- **New to the repo** → read `START-HERE.md`.

## Identity & rules
Author/committer on every commit: `Nik-ERROR-exe <wnikhil146@gmail.com>`. No Co-Authored-By.
No secrets in commits. Schema.sql ↔ models.py stay in sync in the same commit.