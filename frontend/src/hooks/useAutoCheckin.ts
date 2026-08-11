import { useEffect } from 'react';
import { conversationApi } from '@/lib/api';

// How often (ms) the patient view polls for a pending check-in session.
const POLL_INTERVAL_MS = 10_000;
// Don't auto-reopen for this long after the user manually dismissed the chat.
const DISMISS_GRACE_MS = 5 * 60_000;

let lastDismissedAt = 0;

/**
 * Patient-side listener: polls `/api/patient/conversation/active` and, when a
 * pending (agent/doctor-triggered) check-in session exists, opens the CARA chat
 * automatically — no patient click required. The AgentChat widget resumes the
 * session via the same endpoint.
 */
export function useAutoCheckin() {
  useEffect(() => {
    const onDismissed = () => { lastDismissedAt = Date.now(); };
    window.addEventListener('carenetra:agent-chat-dismissed', onDismissed);

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await conversationApi.getActive();
        if (cancelled) return;
        if (res.data?.has_active_session && Date.now() - lastDismissedAt > DISMISS_GRACE_MS) {
          window.dispatchEvent(new Event('carenetra:open-agent-chat'));
        }
      } catch { /* network hiccup — try again next tick */ }
    };

    poll();
    const timer = window.setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('carenetra:agent-chat-dismissed', onDismissed);
    };
  }, []);
}
