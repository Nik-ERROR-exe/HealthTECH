import { useEffect, useRef } from 'react';
import api from '@/lib/api';

/**
 * Render Keep-Alive Custom Hook
 * Sends a background GET request to /api/health every 4.5 minutes (270,000 ms)
 * to prevent the Render container instance from spinning down due to inactivity.
 */
export const useKeepAlive = (intervalMs: number = 270_000) => {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const pingBackend = async () => {
      try {
        await api.get('/health', { timeout: 10_000 });
      } catch (err) {
        // Silent catch — avoid popping alert banners if ping fails temporarily
        console.debug('[KeepAlive] Background ping check:', err);
      }
    };

    // Immediate initial ping on mount
    pingBackend();

    // Setup 4.5-minute periodic ping interval
    timerRef.current = setInterval(pingBackend, intervalMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [intervalMs]);
};

export default useKeepAlive;
