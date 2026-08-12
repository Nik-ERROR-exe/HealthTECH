import { useEffect } from 'react';
import { useCheckinContext } from '@/contexts/CheckinContext';

export function usePendingCheckin(pollIntervalMs: number = 5000) {
  const { pendingCheckin, checkPending, clearPending, consumePending } = useCheckinContext();

  useEffect(() => {
    // Immediate initial check
    checkPending();

    const interval = setInterval(() => {
      checkPending();
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [checkPending, pollIntervalMs]);

  return {
    pendingCheckin,
    checkPending,
    clearPending,
    consumePending,
  };
}

export default usePendingCheckin;
