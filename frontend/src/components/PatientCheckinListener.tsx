import { useAutoCheckin } from '@/hooks/useAutoCheckin';

/**
 * Mounted for patients in the dashboard layout. Polls (every 10 s) for a pending
 * check-in session and auto-opens the CARA chat when one is due (renders nothing).
 */
const PatientCheckinListener = () => {
  useAutoCheckin();
  return null;
};

export default PatientCheckinListener;
