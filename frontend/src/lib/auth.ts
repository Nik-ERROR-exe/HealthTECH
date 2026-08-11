export interface User {
  id: string;
  name: string;
  email: string;
  role: 'DOCTOR' | 'PATIENT' | 'VOLUNTEER' | 'RELATIVE';
  avatar?: string;
  patient_id?: string;
}

export const getUser = (): User | null => {
  const raw = localStorage.getItem('carenetra_user');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
};

export const getToken = (): string | null => localStorage.getItem('carenetra_token');

export const setAuth = (token: string, user: User) => {
  localStorage.setItem('carenetra_token', token);
  localStorage.setItem('carenetra_user', JSON.stringify(user));
};

export const clearAuth = () => {
  localStorage.removeItem('carenetra_token');
  localStorage.removeItem('carenetra_user');
};

export const isAuthenticated = (): boolean => !!getToken();

export const getDashboardPath = (role: string): string => {
  if (role === 'DOCTOR') return '/doctor/dashboard';
  if (role === 'VOLUNTEER') return '/volunteer/dashboard';
  if (role === 'RELATIVE') return '/relative/dashboard';
  return '/patient/dashboard';
};
