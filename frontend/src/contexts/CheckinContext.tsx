import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { getPendingCheckin, consumePendingCheckin } from '@/lib/api';

export interface PendingCheckinState {
  hasPending: boolean;
  checkInId?: string;
  patientId?: string;
  pendingId?: string;
}

interface CheckinContextType {
  pendingCheckin: PendingCheckinState | null;
  checkPending: () => Promise<void>;
  clearPending: () => void;
  consumePending: (pendingId?: string) => Promise<void>;
}

const CheckinContext = createContext<CheckinContextType>({
  pendingCheckin: null,
  checkPending: async () => {},
  clearPending: () => {},
  consumePending: async () => {},
});

export const CheckinProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [pendingCheckin, setPendingCheckin] = useState<PendingCheckinState | null>(null);
  const [handledIds, setHandledIds] = useState<Set<string>>(new Set());

  const checkPending = useCallback(async () => {
    try {
      const userStr = localStorage.getItem('carenetra_user');
      const token = localStorage.getItem('carenetra_token');
      if (!userStr || !token) return;

      const user = JSON.parse(userStr);
      if (user.role !== 'PATIENT') return;

      const res = await getPendingCheckin();
      if (res.data && res.data.hasPending) {
        const idKey = res.data.pendingId || res.data.checkInId;
        if (idKey && handledIds.has(idKey)) {
          setPendingCheckin(null);
          return;
        }
        setPendingCheckin(res.data);
      } else {
        setPendingCheckin(null);
      }
    } catch {
      // Ignore polling errors when logged out
    }
  }, [handledIds]);

  const consumePending = useCallback(async (pendingId?: string) => {
    const targetId = pendingId || pendingCheckin?.pendingId || pendingCheckin?.checkInId;
    if (targetId) {
      setHandledIds(prev => new Set(prev).add(targetId));
    }
    setPendingCheckin(null);
    try {
      await consumePendingCheckin(pendingId || pendingCheckin?.pendingId);
    } catch {
      // Ignore API errors
    }
  }, [pendingCheckin]);

  const clearPending = useCallback(() => {
    const targetId = pendingCheckin?.pendingId || pendingCheckin?.checkInId;
    if (targetId) {
      setHandledIds(prev => new Set(prev).add(targetId));
    }
    setPendingCheckin(null);
  }, [pendingCheckin]);

  return (
    <CheckinContext.Provider value={{ pendingCheckin, checkPending, clearPending, consumePending }}>
      {children}
    </CheckinContext.Provider>
  );
};

export const useCheckinContext = () => useContext(CheckinContext);
