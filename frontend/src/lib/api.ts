import axios from 'axios';

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  'http://localhost:8000'
).replace(/\/+$/, '');

const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  headers: { 'Content-Type': 'application/json' },
});

// ── Authentication token interceptor ─────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('carenetra_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Role‑based blocking of ambulance APIs for non‑ambulance accounts ──
api.interceptors.request.use((config) => {
  const userStr = localStorage.getItem('carenetra_user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      if (config.url?.includes('/ambulance/') && user.role !== 'AMBULANCE') {
        return Promise.reject(new Error('Unauthorized: only ambulances can access ambulance endpoints'));
      }
    } catch (e) {
      // ignore JSON parse errors
    }
  }
  return config;
});

// ── Role‑based blocking of volunteer APIs for non‑volunteer accounts ──
api.interceptors.request.use((config) => {
  const userStr = localStorage.getItem('carenetra_user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      if (config.url?.includes('/volunteer/') && user.role !== 'VOLUNTEER') {
        return Promise.reject(new Error('Unauthorized: only volunteers can access volunteer endpoints'));
      }
    } catch (e) {
      // ignore JSON parse errors
    }
  }
  return config;
});

// ── 401 handler ───────────────────────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('carenetra_token');
      localStorage.removeItem('carenetra_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Doctor API helpers ──────────────────────────────────────
export const doctorApi = {
  scheduleCheckin: (patientId: string, nextCheckInAtIso: string) =>
    api.post(`/doctor/patient/${patientId}/schedule-checkin`, {
      next_check_in_at: nextCheckInAtIso,
    }),
};

// ── Conversation API helpers ────────────────────────────────
export const conversationApi = {
  getActive: () => api.get('/patient/conversation/active'),
  start: (language: string = 'en') =>
    api.post('/patient/conversation/start', {}, { params: { language } }),
  answer: (sessionId: string, questionId: string, answer: string, language: string = 'en') =>
    api.post(`/patient/conversation/${sessionId}/answer`, {
      question_id: questionId,
      answer,
      language,
    }),
  uploadWound: (sessionId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/patient/conversation/${sessionId}/upload-wound`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  submit: (sessionId: string) => api.post(`/patient/conversation/${sessionId}/submit`),
  dashboardUploadWound: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/patient/checkin/wound', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// ── Emergency API helpers ───────────────────────────────────
export const emergencyApi = {
  dispatch: (data: { patient_id?: string; latitude?: number; longitude?: number; trigger_type?: string }) =>
    api.post('/patient/emergency/dispatch', data),
};

// ── Checkin API helpers ─────────────────────────────────────
export const checkinApi = {
  triggerCheckin: (patientId: string, delaySeconds?: number) =>
    api.post('/checkin/trigger', { patient_id: patientId, delay_seconds: delaySeconds || 0 }),
  getPendingCheckin: () => api.get('/checkin/pending'),
  consumePendingCheckin: (pendingId?: string) =>
    pendingId ? api.post(`/checkin/consume/${pendingId}`) : api.post('/checkin/consume'),
};

// ── Patient API helpers ─────────────────────────────────────
export const patientApi = {
  toggleMedicationTaken: (medicationId: string, taken: boolean) =>
    api.post(`/patient/medications/${medicationId}/taken`, { taken }),
  sendMessage: (message: string) =>
    api.post(`/patient/messages`, { message }),
};

// ── Image API helpers ───────────────────────────────────────
export const imageApi = {
  uploadImage: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/image/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
  sendImageChat: (analysisId: string, query: string) =>
    api.post('/image/chat', { analysis_id: analysisId, query }),
};

// ── Alerts API helpers ──────────────────────────────────────
export const alertsApi = {
  getPending: () => api.get('/alerts/pending').then(res => res.data),
  dispatch: (alertId: string, notes?: string) => api.post('/alerts/dispatch', { alert_id: alertId, notes }),
  acknowledge: (alertId: string) => api.post(`/alerts/${alertId}/acknowledge`),
};

// Legacy named exports for compatibility
export const triggerCheckin = (patientId: string, delaySeconds?: number) => checkinApi.triggerCheckin(patientId, delaySeconds);
export const getPendingCheckin = () => checkinApi.getPendingCheckin();
export const consumePendingCheckin = (pendingId?: string) => checkinApi.consumePendingCheckin(pendingId);
export const uploadImage = (file: File) => imageApi.uploadImage(file);
export const sendImageChat = (analysisId: string, query: string) => imageApi.sendImageChat(analysisId, query);
export const getPendingAlerts = () => alertsApi.getPending();
export const dispatchAmbulance = (alertId: string, notes?: string) => alertsApi.dispatch(alertId, notes);
export const acknowledgeAlert = (alertId: string) => alertsApi.acknowledge(alertId);

export default api;
