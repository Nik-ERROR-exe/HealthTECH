# Vision & AI Wound Advice

## Why
The patient uploads a wound / pain-area photo; the AI analyzes severity and returns
**patient-facing advice/tips** grounded in the analysis, the patient's condition, and the care
guidelines.

## Flow
1. Upload accepted (JPEG/PNG/WebP/HEIC) → `run_agent_pipeline(has_wound_image=True)`.
2. `vision_agent_node` tries HuggingFace `davidfred/vit_skin_disease_model` (key =
   `settings.HUGGINGFACE_API_KEY`, paste into `backend/.env`) → **OpenCV fallback** if no key/fails.
3. `generate_ai_advice()` writes 2–4 practical tips via NVIDIA LLM (`meta/llama-3.1-8b-instruct`),
   grounded in the analysis summary, severity, doctor's notes (`patient_context`), and a RAG
   guideline excerpt. Failure → `_static_advice(severity, score)`.
4. Persisted as `wound_analyses.ai_advice`; surfaced via `wound_ai_advice` in agent state →
   `CheckInResponse.ai_advice` / `WoundUploadResponse.ai_advice` and `GET /api/patient/wound-history`.

## Frontend
- `PatientDashboard` shows `ai_advice` in the Wound Analysis History card and the upload toast.
- `AgentChat` shows the in-chat upload button for question types `photo` **and** `photo_prompt`
  (the bank sends `photo` — was previously dead in the chat).

## Files
- `backend/app/nodes/vision_agent.py`, `backend/app/agents/state.py`
- `backend/app/schemas/patient_doctor.py`, `backend/app/routers/patient.py`
- `frontend/src/pages/PatientDashboard.tsx`, `frontend/src/components/AgentChat.tsx`

## Gotchas
- Until `HUGGINGFACE_API_KEY` is set, OpenCV is used (never crashes).
- The vision agent must stay HTTP-200 safe for the polling dashboards.