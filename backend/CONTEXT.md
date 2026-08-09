# backend/CONTEXT.md — Backend Router

FastAPI app. Entry: `backend/main.py` (`create_app()`, `/api` routers, lifespan = scheduler +
RAG index). Run from `backend/`.

## Config & env
- `app/config.py` (pydantic-settings) reads `.env`. Keys: `DATABASE_URL`, `SECRET_KEY`,
  `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `LLM_MODEL`, `EMBEDDING_MODEL`/`EMBEDDING_DIM`,
  `HUGGINGFACE_API_KEY`, `QDRANT_PATH`/`QDRANT_COLLECTION`, `KNOWLEDGE_DIR`, `CHUNK_*`,
  `RAG_TOP_K`, Twilio/Brevo, `FRONTEND_URL`.

## LangGraph pipeline (`app/agents/graph.py`)
symptom → (vision if wound image) → risk → escalation → **report** → monitoring. State in
`app/agents/state.py`; LLM client in `app/agents/nvidia_client.py` (NVIDIA NIM).

## Nodes (`app/nodes/`)
- `symptom_agent.py` — extracts fever/fatigue/meds → `check_ins` (NVIDIA LLM, low temp).
- `vision_agent.py` — HF `davidfred/vit_skin_disease_model` (key from `settings`) or OpenCV
  fallback → `WoundAnalysis` + `ai_advice`.
- `risk_agent.py` — ML/GradientBoosting or weighted fallback → `RiskScore` + tier.
- `escalation_agent.py` — tier → `Alert` + email/SMS. Doctor phone = `doctor_profile.phone`.
- `report_agent.py` — RAG-grounded narrative → `check_ins.agent_report` + `DoctorMessage` on
  ORANGE/RED/EMERGENCY.
- `monitoring_agent.py` — updates `MonitoringSchedule` interval.
- `caretaker_agent.py` + `question_bank.py` — check-in question state machine (offline base);
  `adaptive_questions.py` adds NVIDIA-LLM adaptive follow-ups + RAG Q&A.

## RAG (`app/rag/`)
- `vector_store.py` — Qdrant **local mode** (`data/qdrant`, gitignored). Deliberately preserves
  collection unless `EMBEDDING_DIM` changes.
- `embeddings.py` — NVIDIA `/v1/embeddings` (`nvidia/nv-embed-v1`, 4096-d) with deterministic
  keyword `fallback_embed`.
- `indexer.py` — chunks `backend/knowledge/*.md` (content-hash idempotent). `indexer.knowledge_dir()`.
- `retriever.py` — `retrieve(query, top_k)` (Qdrant or keyword fallback); `retrieve_for_checkin(answers)`.
- Corpus: `backend/knowledge/post_surgical_care.md` + anything else the agent should cite.

## Routers (`app/routers/`)
auth, patient, doctor, conversation (`/patient/conversation/{start,active,answer,upload-wound,
submit,ask}`), emergency, volunteer — all under `/api`.

## Conventions & gotchas
- Schema: `db/schema.sql` ↔ `app/models/models.py` together; live Neon needs
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Never make an NVIDIA/HF call fatal — always fall back.
- Remote Neon DB → tests must not import the DB engine; keep SQLAlchemy imports inside functions.
- Doctor/volunteer dashboards poll — keep those endpoints fast.