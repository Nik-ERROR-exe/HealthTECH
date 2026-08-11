import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import DashboardLayout from '@/components/DashboardLayout';

/**
 * Deep-link landing for automated check-in reminders:
 *   /checkin?session_id={id}&autostart=true
 *
 * Renders the patient dashboard shell (which hosts the CARA chat widget) and
 * immediately opens the chat; AgentChat resumes the pending AgentSession via
 * GET /patient/conversation/active.
 */
const CheckinPage = () => {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const [opening, setOpening] = useState(true);

  useEffect(() => {
    // Give the layout a beat to mount the chat widget, then open it.
    const timer = window.setTimeout(() => {
      window.dispatchEvent(new Event('carenetra:open-agent-chat'));
      setOpening(false);
    }, 400);
    return () => window.clearTimeout(timer);
  }, []);

  const sessionId = params.get('session_id');

  return (
    <DashboardLayout>
      <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
        {opening ? (
          <>
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">
              {t('checkin.opening', 'Opening your check-in…')}
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">
            {sessionId
              ? t('checkin.resumed', 'Your check-in has been resumed — the CARA chat is open.')
              : t('checkin.ready', 'The CARA chat is open. Start your check-in when ready.')}
          </p>
        )}
      </div>
    </DashboardLayout>
  );
};

export default CheckinPage;
