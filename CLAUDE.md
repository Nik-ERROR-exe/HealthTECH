# CARENETRA (healthTECH)

## What this project is
**CARENETRA** is an agentic remote-health monitoring platform for post-surgical / high-risk
patients (built for the SIH hackathon). A patient checks in by **text, voice, or photo of a
wound**; a LangGraph pipeline of 6 AI agents (symptom, vision, risk, escalation, report,
monitoring) scores the submission 0–100, tiers it (GREEN→EMERGENCY), fires alerts (nudge →
doctor → SMS/email → ambulance dispatch), adapts the monitoring cadence, and generates a
RAG-grounded report for the doctor. Check-in questions are **adaptive**: the caretaker agent
uses the patient's medical condition, history, and the medical-docs knowledge base to ask
follow-up questions. A **volunteer network** plus **crash/impact detection** (accel sensor →
GPS → nearby volunteer SMS) covers physical emergencies. The UI is multilingual
(English / Hindi / Marathi).

## Stack
- **Frontend:** React 18 + Vite + TypeScript + Tailwind + shadcn/ui + React Router + i18next + face-api.js + Three.js/GSAP
- **Backend:** FastAPI + SQLAlchemy 2.0 + LangGraph/LangChain + NVIDIA NIM (free-tier LLM + embeddings) + HuggingFace inference (wound vision) + Qdrant local (RAG) + Twilio (SMS) + Brevo (email) + APScheduler
- **DB:** PostgreSQL (hosted on Neon — see `DATABASE_URL` in `backend/.env`)
- **ML:** `scikit-learn` risk classifier (`backend/models/risk_classifier.pkl`)

## Hard rules (never break these)
- **Git identity on every commit, and ONLY your identity:** commits must be authored and
  committed by exactly `user.name = Nik-ERROR-exe` / `user.email = wnikhil146@gmail.com`.
  Never commit with a different identity, never change the repo's git config without asking, and
  **never add a `Co-Authored-By:` trailer, AI signature, or any name other than yours to a commit** —
  no one else's name appears on author, committer, or message.
- **Never commit secrets:** `.env`, API keys, DB password, Twilio/Brevo/NVIDIA/HuggingFace tokens
  are gitignored. Only `backend/.env.example` (names, no values) is tracked. Never print the DB
  password or a key into a file or a PR.
- **Don't hand-modify the production DB.** Schema changes go through `backend/db/schema.sql` **and**
  `backend/app/models/models.py` in the **same commit** (they must stay in sync). `create_all()` never
  alters existing tables — on the live Neon DB run `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- **All API routes live under the `/api` prefix** (mounted in `backend/main.py`). Frontend calls
  go through `frontend/src/lib/api.ts`.
- **Only JPEG/PNG/WebP** accepted for wound uploads (validated in `patient.py` / `conversation.py`).
- **Always use free services.** New external APIs must be free-tier (NVIDIA NIM free credits,
  HuggingFace free tier, Qdrant local mode). Every paid-capable path must have a no-key/offline
  fallback (OpenCV, static question bank, keyword retrieval).
- **All external keys are env-driven** via `backend/app/config.py`; paste keys into `backend/.env`
  (never commit it). New features needing a service add their settings + a `.env.example` entry.
- **RAG knowledge lives in `backend/knowledge/*.md`** — add care guidelines there; the Qdrant
  index under `backend/data/` is gitignored and rebuilt at startup.

## How I like to work
- Direct, terse updates. Show the diff/outcome, not a recap of every file touched.
- Multilingual text must go through `frontend/src/locales/{en,hi,mr}/translation.json`, never hard-coded.
- When in doubt about a DB or prod-affecting action, ask before acting.

## Known gotchas
- **DB is remote (Neon).** `backend/.env` holds a single `DATABASE_URL` connection string that
  `app/config.py` reads directly (legacy `DB_*` vars are only a fallback). Runs need a reachable
  DB or you'll get connection errors at import time.
- **CORS** is `allow_origins=["*"]` with `allow_credentials=True` — a known browser risk; don't
  silently "tighten" it without testing the deployed frontend.
- **Enum comparison in queries:** code filters `MedicalCourse.status == "ACTIVE"` etc. against the
  Python enums' **names** (`PATIENT`, `GREEN`, …) — keep the DB enum *labels* identical or queries break.
- **No alembic versions yet** — `alembic/versions/` is empty. Schema is created via
  `Base.metadata.create_all()` or `backend/db/schema.sql`.
- **NVIDIA NIM is metered (free tier).** The LLM is `meta/llama-3.1-8b-instruct`; embeddings are
  `nvidia/nv-embed-v1` (dim 4096). If an LLM/embedding call fails, the code **must** fall back
  (static bank / OpenCV / keyword retrieval) — never make an AI call fatal.
- **`HUGGINGFACE_API_KEY` is empty until you paste one** — until then wound analysis uses the
  OpenCV fallback and never crashes.
- **Doctor/volunteer dashboards poll** (`/api/doctor/alerts/active`, pending-agent-message) — don't
  make those endpoints slow.
- **`uploads/wounds/` is gitignored** — uploaded images live only on the server filesystem.
- **Qdrant local data (`backend/data/`), `backend/uploads/`, and `.claude/` are gitignored.**
- **Start the API from `backend/`:** `uvicorn main:app --reload` or `uvicorn app.main:app --reload`
  (both serve the same app; `app/main.py` is the shim). Lifespan starts the scheduler and warms the
  RAG index.

## Folder routing
Read `CONTEXT.md` (root task router) then `START-HERE.md` if you're new. `backend/CONTEXT.md` and
`frontend/CONTEXT.md` scope the agent to the relevant room; `docs/` holds design notes for the AI
features. These `.md` context files are **tracked** — keep them accurate.