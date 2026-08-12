# backend/CONTEXT.md — Backend Router

FastAPI app. Entry: `backend/main.py` (`create_app()`, `/api` routers, lifespan = scheduler +
RAG index). Run from `backend/`.

## Config & env
- `app/config.py` (pydantic-settings) reads `.env`. Keys: `DATABASE_URL`, `SECRET_KEY`,
  `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `LLM_MODEL`, `EMBEDDING_MODEL`/`EMBEDDING_DIM`,
  `HUGGINGFACE_API_KEY` (legacy, unused by vision now), `VISION_LLM_MODEL`/`VISION_FALLBACK_MODEL`/
  `VISION_BASE_URL`, `QDRANT_PATH`/`QDRANT_COLLECTION`, `KNOWLEDGE_DIR`, `CHUNK_*`, `RAG_TOP_K`,
  Twilio/Brevo, `FRONTEND_URL`, `DEMO_EMERGENCY_PHONE_NUMBER`/`DEMO_EMERGENCY_EMAIL`. Demo mode
  (`DEMO_EMERGENCY_EMAIL` set) routes **ALL** outbound emails to that inbox via
  `alert_service._resolve_outbound_email`; `DEMO_EMERGENCY_PHONE_NUMBER` overrides RED/EMERGENCY SMS.

## LangGraph pipeline (`app/agents/graph.py`)
symptom → (vision if wound image) → risk → escalation → **report** → monitoring. State in
`app/agents/state.py`; LLM client in `app/agents/nvidia_client.py` (NVIDIA NIM).
`run_agent_pipeline(..., language)` threads the session/preferred language into state
(`AgentState.language`) so patient-facing LLM outputs (wound advice, nurse replies) are generated
in that language.

## Nodes (`app/nodes/`)
- `symptom_agent.py` — extracts fever/fatigue/meds → `check_ins` (NVIDIA LLM, low temp).
- `vision_agent.py` — **NVIDIA multimodal VLM** (`meta/llama-3.2-11b-vision-instruct`, base64 image
  payload) primary, **OpenCV** local fallback (HF removed). `classify_with_nvidia_vlm()` tries the
  configured `VISION_BASE_URL` (default `NVIDIA_BASE_URL`) then `ai.api.nvidia.com/v1`, else returns
  None → OpenCV. OpenCV call is guarded (corrupt image → safe NORMAL).
  `_advice_system_prompt(language)` + `_vlm_system_prompt(language)` pin the LLM to the patient's
  language with a strict CRITICAL LANGUAGE RULE (no drifting to FR/ES).
- `risk_agent.py` — ML/GradientBoosting or weighted fallback → `RiskScore` + tier.
- `escalation_agent.py` — tier → `Alert` + email/SMS. Doctor phone = `doctor_profile.phone`.
  `_resolve_emergency_contact_phone()` routes RED/EMERGENCY SMS to `DEMO_EMERGENCY_PHONE_NUMBER` when
  set; `_build_alert_email_html()` sends rich emails (patient name, tier, red-flag symptoms,
  deep-link CTA). **Email demo routing is global** in `services/alert_service.send_email_alert`
  (`_resolve_outbound_email` → all outbound emails go to `DEMO_EMERGENCY_EMAIL` when configured).
- `report_agent.py` — RAG-grounded narrative → `check_ins.agent_report` + `DoctorMessage` on
  ORANGE/RED/EMERGENCY.
- `monitoring_agent.py` — updates `MonitoringSchedule` interval.
- `caretaker_agent.py` + `question_bank.py` — check-in question state machine (offline base);
  `adaptive_questions.py` adds NVIDIA-LLM adaptive follow-ups + RAG Q&A.
- `nurse_agent.py` — **emergency keyword intercept**: `EMERGENCY_KEYWORDS_RE` (chest pain, can't
  breathe, bleeding heavily, …) short-circuits `nurse_respond` BEFORE the LLM, force-submitting the
  check-in as EMERGENCY and returning `emergency_triggered: True`. `conversation.py`'s
  `_handle_emergency_intercept()` then writes the CheckIn + EMERGENCY RiskScore and invokes
  `escalation_agent_node` directly (no full pipeline). Nurse prompts carry the same strict
  CRITICAL LANGUAGE RULE as the vision advice prompt.

## RAG (`app/rag/`)
- `vector_store.py` — Qdrant **local mode** (`data/qdrant`, gitignored). Deliberately preserves
  collection unless `EMBEDDING_DIM` changes.
- `embeddings.py` — NVIDIA `/v1/embeddings` (`nvidia/nv-embed-v1`, 4096-d) with deterministic
  keyword `fallback_embed`.
- `indexer.py` — chunks `backend/knowledge/*.md` (content-hash idempotent). `indexer.knowledge_dir()`.
- `retriever.py` — `retrieve(query, top_k)` (Qdrant or keyword fallback; **curated
  `backend/knowledge/*` chunks rank above MedQuAD** — requires the `source` keyword payload
  index, created by `ensure_collection`); `retrieve_for_checkin(answers)`.
- Corpus: `backend/knowledge/post_surgical_care.md` + anything else the agent should cite.

## Routers (`app/routers/`)
auth, patient, doctor, conversation (`/patient/conversation/{start,active,answer,upload-wound,
submit,ask}`), emergency, volunteer — all under `/api`.
- **RBAC is structural:** patient/conversation routers mount `dependencies=[Depends(require_patient)]`,
  doctor mounts `Depends(require_doctor)` (aliases `verify_patient_role`/`verify_doctor_role` in
  `dependencies.py`) — a cross-role token gets 403 before any handler runs.
- `doctor.py` has `POST /patient/{patient_id}/schedule-checkin` (body `ScheduleCheckinRequest{
  next_check_in_at: ISO}`) → sets `monitoring_schedules.next_check_in_at` for the patient (hackathon
  "Schedule Auto Check-In": 1-min demo / now / custom datetime presets).

## Conventions & gotchas
- Schema: `db/schema.sql` ↔ `app/models/models.py` together; live Neon needs
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
- Never make an NVIDIA/HF call fatal — always fall back.
- Remote Neon DB → tests must not import the DB engine; keep SQLAlchemy imports inside functions.
- Doctor/volunteer dashboards poll — keep those endpoints fast.
- **Scheduler** (`app/scheduler.py`) runs **every 1 minute** (makes the 60-second demo trigger work).
  The overdue nudge email is an HTML CTA deep-linking to `{FRONTEND_URL}/checkin?session_id=…&autostart=true`,
  and a copy goes to the patient's caretaker (`patient_profiles.emergency_contact_email`).