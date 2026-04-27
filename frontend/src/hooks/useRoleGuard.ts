import { useEffect } from 'react';
import { getUser } from '@/lib/auth';

export function useRoleGuard(allowedRoles: string[]) {
  const user = getUser();
  const role = user?.role || 'patient';
  return allowedRoles.includes(role);
}