import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:8000/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('carenetra_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

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

// ── Typed conversation API helpers ────────────────────────────────────────────
// These map 1:1 to the 5 endpoints in app/routers/conversation.py

export const conversationApi = {
  /** Called on page load — finds any waiting session (scheduler-triggered or in-progress) */
  getActive: () =>
    api.get('/patient/conversation/active'),

  /** Creates a new session — calls Ollama to generate personalised questions */
  start: () =>
    api.post('/patient/conversation/start'),

  /** Submits one answer, returns next question or signals completion */
  answer: (sessionId: string, questionId: string, answer: string) =>
    api.post(`/patient/conversation/${sessionId}/answer`, {
      question_id: questionId,
      answer,
    }),

  /** Uploads wound photo mid-conversation */
  uploadWound: (sessionId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post(`/patient/conversation/${sessionId}/upload-wound`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /** Finalises session — runs the full 5-agent risk pipeline, returns friendly result */
  submit: (sessionId: string) =>
    api.post(`/patient/conversation/${sessionId}/submit`),
};

export default api;