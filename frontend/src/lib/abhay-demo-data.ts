// Demo data specifically for patient abhay26@gmail.com and doctor dr26@gmail.com

export const ABHAY_PATIENT_EMAIL = 'abhay26@gmail.com';
export const DR26_DOCTOR_EMAIL = 'dr26@gmail.com';
export const ABHAY_UID = 'CNT-33422';

export const isAbhayPatientEmail = (email?: string | null) => {
  if (!email) return false;
  return email.toLowerCase().trim() === ABHAY_PATIENT_EMAIL;
};

export const isDr26DoctorEmail = (email?: string | null) => {
  if (!email) return false;
  return email.toLowerCase().trim() === DR26_DOCTOR_EMAIL;
};

export const abhayPatientDashboardData = {
  patient_id: 'p-abhay-26',
  full_name: 'abhay',
  email: ABHAY_PATIENT_EMAIL,
  unique_uid: ABHAY_UID,
  health_status: 'Needs Attention',
  risk_tier: 'GREEN',
  risk_score: 23.2,
  active_course: {
    course_id: 'c-hand-recovery-01',
    course_name: 'Hand Recovery',
    condition: 'GENERAL POST SURGERY',
    doctor_name: 'Dr. doctor26',
    start_date: '2026-08-12',
    end_date: '2026-09-11',
    progress_pct: 75,
    notes: 'Make sure do not go to gym till your recovery will not done.',
  },
  medications_today: [
    {
      id: 'med-1',
      name: 'MH500',
      dosage: '100mg',
      frequency: 'Twice daily',
      time_of_day: 'Morning & Night',
      instructions: 'Take after meals with water',
      taken: true,
    },
    {
      id: 'med-2',
      name: 'PH600',
      dosage: '35mg',
      frequency: 'Three times daily',
      time_of_day: 'Morning, Afternoon & Evening',
      instructions: 'Take after meals',
      taken: true,
    },
  ],
  last_check_in: '2026-08-11T21:15:10',
  unread_messages: 1,
  emergency_contact_phone: '+91 98765 43210',
  pending_question: null,
  upcoming_appointments: [
    {
      date: '2026-08-20',
      doctor: 'Dr. doctor26',
      type: 'Hand Mobility & Suture Removal Follow-up',
      location: 'Orthopedic OPD, Clinic Room 302',
    },
  ],
  care_team: [
    {
      name: 'Dr. doctor26',
      role: 'Lead Doctor',
      specialty: 'Hand & Orthopedic Surgeon',
      avatar: 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?w=150&auto=format&fit=crop&q=80',
    },
    {
      name: 'Sarah Jenkins',
      role: 'Physiotherapist',
      specialty: 'Hand Rehabilitation Specialist',
      avatar: 'https://images.unsplash.com/photo-1594824813566-888554705574?w=150&auto=format&fit=crop&q=80',
    },
  ],
  vital_signs: {
    heart_rate: 74,
    blood_pressure_systolic: 120,
    blood_pressure_diastolic: 78,
    temperature: 98.6,
    oxygen_saturation: 99,
  },
  recent_check_ins: [
    {
      check_in_id: 'chk-3',
      created_at: '2026-08-11T21:15:10',
      input_type: 'DAILY_VOICE',
      symptom_summary: 'Pain level 2/10, finger joint flex mobility improving, taken all meds.',
      total_score: 23.2,
      tier: 'GREEN',
    },
    {
      check_in_id: 'chk-2',
      created_at: '2026-08-09T10:30:00',
      input_type: 'DAILY_VOICE',
      symptom_summary: 'Swelling reduced significantly, mild stiffness in index finger.',
      total_score: 28.4,
      tier: 'GREEN',
    },
    {
      check_in_id: 'chk-1',
      created_at: '2026-08-05T16:15:00',
      input_type: 'DAILY_VOICE',
      symptom_summary: 'Initial post-op check-in, mild redness around hand suture line.',
      total_score: 42.5,
      tier: 'YELLOW',
    },
  ],
};

export const abhayMessages = [
  {
    id: 'msg-1',
    message: 'Your hand incision is healing remarkably well. Keep doing the light finger flex exercises daily.',
    doctor_name: 'Dr. doctor26',
    created_at: '2026-08-11T19:30:00',
    is_read: false,
  },
  {
    id: 'msg-2',
    message: 'Please upload your hand wound photo today for AI progression tracking.',
    doctor_name: 'Dr. doctor26',
    created_at: '2026-08-10T14:00:00',
    is_read: true,
  },
];

export const abhayCheckinHistory = [
  { date: '2026-08-05', risk_score: 42.5, risk_tier: 'YELLOW', symptom_severity: 6.5 },
  { date: '2026-08-07', risk_score: 35.0, risk_tier: 'GREEN', symptom_severity: 4.8 },
  { date: '2026-08-09', risk_score: 28.4, risk_tier: 'GREEN', symptom_severity: 3.2 },
  { date: '2026-08-11', risk_score: 23.2, risk_tier: 'GREEN', symptom_severity: 2.1 },
];

export const abhayWoundHistory = [
  {
    id: 'wnd-2',
    severity: '2.1/10 — MILD',
    score: 2.1,
    summary: 'Later recovery stage: Significantly reduced redness and minimal swelling, incision scar healing cleanly.',
    uploaded_at: '08/11/2026, 09:15:10 PM',
    created_at: '2026-08-11T21:15:10',
    status: 'Healing Well',
    thumbnail_url: '/hand_wound_stage2.png',
    image_url: '/hand_wound_stage2.png',
    redness: false,
    swelling: false,
    texture_change: false,
    wound_score: 2.1,
  },
  {
    id: 'wnd-1',
    severity: '4.2/10 — MILD',
    score: 4.2,
    summary: 'Earlier recovery stage: Mild redness and slight swelling along palm surgical suture line.',
    uploaded_at: '08/05/2026, 11:22:37 PM',
    created_at: '2026-08-05T23:22:37',
    status: 'Mild Inflammation',
    thumbnail_url: '/hand_wound_stage1.png',
    image_url: '/hand_wound_stage1.png',
    redness: true,
    swelling: true,
    texture_change: false,
    wound_score: 4.2,
  },
];

export const abhayDoctorPatientSummary = {
  patient_id: 'p-abhay-26',
  full_name: 'abhay',
  unique_uid: ABHAY_UID,
  course_name: 'Hand Recovery',
  condition_type: 'GENERAL POST SURGERY',
  total_score: 23.2,
  tier: 'GREEN',
  health_status: 'Stable',
  last_check_in: '8/11/2026',
  symptom_summary: 'Pain level 2/10, finger joint flex mobility improving, taken all meds.',
};

export const abhayDoctorPatientDetail = {
  patient_id: 'p-abhay-26',
  full_name: 'abhay',
  unique_uid: ABHAY_UID,
  email: ABHAY_PATIENT_EMAIL,
  date_of_birth: '1998-04-14',
  blood_group: 'O+',
  emergency_contact: {
    name: 'Rajesh Kumar',
    phone: '+91 98765 43210',
    email: 'rajesh@example.com',
  },
  course: {
    course_id: 'c-hand-recovery-01',
    course_name: 'Hand Recovery',
    condition: 'GENERAL POST SURGERY',
    status: 'ACTIVE',
    start_date: '2026-08-12',
    end_date: '2026-09-11',
    notes: 'Make sure do not go to gym till your recovery will not done.',
  },
  latest_risk_score: {
    total_score: 23.2,
    tier: 'GREEN',
    breakdown: { pain: 2, swelling: 1, mobility: 8 },
    created_at: '2026-08-11T21:15:10',
  },
  score_history: [
    { score: 42.5, tier: 'YELLOW', created_at: '2026-08-05' },
    { score: 35.0, tier: 'GREEN', created_at: '2026-08-07' },
    { score: 28.4, tier: 'GREEN', created_at: '2026-08-09' },
    { score: 23.2, tier: 'GREEN', created_at: '2026-08-11' },
  ],
  recent_check_ins: abhayPatientDashboardData.recent_check_ins,
  medications: abhayPatientDashboardData.medications_today,
  recent_wounds: abhayWoundHistory,
  condition_metrics: {
    medication_adherence: { value: '88%', status: 'good', note: 'High compliance' },
    fever: { value: '98.6°F', status: 'normal', note: 'No fever detected' },
    fatigue: { value: 'Low', status: 'normal' },
    risk_score: { value: '23.2/100', status: 'stable' },
    wound_status: { value: 'Healing Well (2.1/10)', status: 'good' },
  },
};
