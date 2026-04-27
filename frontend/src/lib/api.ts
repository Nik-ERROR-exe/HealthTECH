import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

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

// ── NEW: Role‑based blocking of volunteer APIs for patient accounts ──
api.interceptors.request.use((config) => {
  const userStr = localStorage.getItem('carenetra_user');
  if (userStr) {
    try {
      const user = JSON.parse(userStr);
      // If URL is for volunteer and logged‑in user is NOT a volunteer, block the request
      if (config.url?.includes('/volunteer/') && user.role !== 'volunteer') {
        return Promise.reject(new Error('Unauthorized: patient cannot access volunteer endpoints'));
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

// ── Typed conversation API helpers ───────────────────────────
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

export default api;