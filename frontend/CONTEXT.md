# frontend/CONTEXT.md — Frontend Router

React 18 + Vite + TypeScript + Tailwind + shadcn/ui + React Router + i18next (+ face-api.js,
Three.js/GSAP on the landing page).

## Where things live
- `src/lib/api.ts` — axios client (`VITE_API_BASE_URL || http://localhost:8000`, baseURL
  `/api`), `conversationApi` helpers (`start`, `answer`, `uploadWound`, `submit`,
  `dashboardUploadWound`, `getActive`), plus `doctorApi.scheduleCheckin(patientId, nextCheckInAtIso)`
  (POST `/doctor/patient/{id}/schedule-checkin`). 401 → `/login`.
- `src/components/AgentChat.tsx` — the CARA check-in chat widget (phases:
  idle/starting/chatting/photo/submitting/done). On open it calls `getActive()` to **resume any
  pending agent/doctor-triggered session** (or shows the welcome). **Emergency intercept:** a
  regex over typed answers + the backend `emergency_triggered` flag raise a full-screen
  **CRITICAL MEDICAL ALERT** overlay (`createPortal`, z-9999) with a CALL 108 button and
  caretaker/doctor contacts. Question types: `mcq` (options), `yes_no`
  (defaults), anything else = free text; **photo upload button shows for `photo` OR
  `photo_prompt`**. Wound upload uses `conversationApi.uploadWound`; the `photo_uploaded` ack passes
  `i18n.language` so the post-upload nurse reply stays in the patient's language. Camera-first
  layout passes `scanMode={phase === 'photo'}` to `FaceAnalyzer`.
- `src/components/FaceAnalyzer.tsx` — face-api.js webcam analysis with a **sci-fi HUD**: neon-green
  (`#00FF66`) cornered face box + `[FACIAL ANALYSIS: SMILING|STRESSED|PAIN DETECTED|NEUTRAL]` tag
  (canvas), a smooth scan loop (crosshair reticle + sweeping laser) when `scanMode` is on, movie
  chrome (feed label, clock, simulated 72 BPM), and a simulated-feed fallback when models/camera
  are unavailable. Scan-status text is localized via `chat.*` keys.
- `src/components/PatientCheckinListener.tsx` + `src/hooks/useAutoCheckin.ts` — patient-side poll of
  `getActive()` every **10 s**; when a pending session exists, dispatch `carenetra:open-agent-chat`
  (respects a dismiss-grace window). Mounted in `DashboardLayout` for patients.
- `src/pages/CheckinPage.tsx` — route `/checkin` (patient-only): reads `session_id`/`autostart`
  query params and opens the CARA chat (deep-link target for scheduler emails).
- `src/pages/PatientDashboard.tsx` — home; shows `ai_advice` in the Wound Analysis History card and
  the upload toast; "Start Check-in" + "Upload Wound Photo" quick actions.
- `src/pages/DoctorDashboard.tsx` — doctor views patient check-ins (including `agent_report`).
  Includes risk sort/filter dropdown (highest risk default, RED/ORANGE only, all), a "🔊 Read AI
  Clinical Summary" button (`window.speechSynthesis` + animated audio waves + Pause/Stop), a
  collapsible Latest AI Report card, a per-row "⚡ Trigger Check-In (1 Min Demo)" button, and a
  "⚡ Schedule Auto Check-In" panel (1-min demo / now / datetime picker) via
  `doctorApi.scheduleCheckin`.
- `src/lib/nvidiaApi.ts` — dead NVIDIA empathetic-reply helper (imported but unused).

## Check-in data flow
`conversationApi.start(language)` → server returns `{session_id, greeting, first_question,
language}`; each `answer` returns `next_question` (raw strings — **server-side translation** for
hi/mr via GoogleTranslate, not i18next); final answer returns `{status, risk_tier,
friendly_message, total_score, escalation_action}`. An **emergency intercept** final response adds
`emergency_triggered: true` + `emergency_contacts: {emergency_contact_name/phone, doctor_name/phone}`
(additive — old UI keeps working). `getActive()` (`GET /patient/conversation/active`) now powers
both session resume and the auto-start listener.

## i18n
i18next loaded in `src/lib/i18n.ts`; serialized locales under `src/locales/{en,hi,mr}/
translation.json`. Question/advice/report text comes from the API (rendered raw) — only UI chrome
uses i18next keys.

## Conventions
- Multilingual text through the locale JSONs, never hard-coded.
- Keep response-shape changes additive so the deployed UI doesn't break.
- `npx tsc --noEmit` must stay clean.