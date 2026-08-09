# frontend/CONTEXT.md — Frontend Router

React 18 + Vite + TypeScript + Tailwind + shadcn/ui + React Router + i18next (+ face-api.js,
Three.js/GSAP on the landing page).

## Where things live
- `src/lib/api.ts` — axios client (`VITE_API_BASE_URL || http://localhost:8000`, baseURL
  `/api`), `conversationApi` helpers (`start`, `answer`, `uploadWound`, `submit`,
  `dashboardUploadWound`, `getActive`). 401 → `/login`.
- `src/components/AgentChat.tsx` — the CARA check-in chat widget (phases:
  idle/starting/chatting/photo/submitting/done). Question types: `mcq` (options), `yes_no`
  (defaults), anything else = free text; **photo upload button shows for `photo` OR
  `photo_prompt`**. Wound upload uses `conversationApi.uploadWound`.
- `src/pages/PatientDashboard.tsx` — home; shows `ai_advice` in the Wound Analysis History card and
  the upload toast; "Start Check-in" + "Upload Wound Photo" quick actions.
- `src/pages/DoctorDashboard.tsx` — doctor views patient check-ins (including `agent_report`).
- `src/lib/nvidiaApi.ts` — dead NVIDIA empathetic-reply helper (imported but unused).

## Check-in data flow
`conversationApi.start(language)` → server returns `{session_id, greeting, first_question,
language}`; each `answer` returns `next_question` (raw strings — **server-side translation** for
hi/mr via GoogleTranslate, not i18next); final answer returns `{status, risk_tier,
friendly_message, total_score, escalation_action}`.

## i18n
i18next loaded in `src/lib/i18n.ts`; serialized locales under `src/locales/{en,hi,mr}/
translation.json`. Question/advice/report text comes from the API (rendered raw) — only UI chrome
uses i18next keys.

## Conventions
- Multilingual text through the locale JSONs, never hard-coded.
- Keep response-shape changes additive so the deployed UI doesn't break.
- `npx tsc --noEmit` must stay clean.