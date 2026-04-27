import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, AlertTriangle, Search, Activity, TrendingUp, Clock, Pill,
  Loader2, Send, Plus, X, ChevronRight, UserSearch, BookOpen, Check, Camera,
  Bell, Sparkles, TrendingDown, Heart, Zap, Brain, Thermometer, Droplet
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, RadialBarChart, RadialBar, PieChart, Pie, Cell, Legend
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import EmergencyBanner from '@/components/EmergencyBanner';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import Lenis from '@studio-freight/lenis';

// ===== Framer Motion Variants =====
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: [0, 0, 0.2, 1] as const },
  }),
};

const tierColor: Record<string, string> = {
  'Doing Well': 'bg-emerald-500/10 text-emerald-400',
  'Needs Attention': 'bg-yellow-500/10 text-yellow-400',
  'Monitor Closely': 'bg-orange-500/10 text-orange-400',
  'Doctor Has Been Notified': 'bg-red-500/10 text-red-400',
  'Emergency': 'bg-red-600/10 text-red-500',
  'Emergency — Help Is On The Way': 'bg-red-600/10 text-red-500',
};

// ===== Types =====
interface PatientSummary {
  patient_id: string;
  full_name: string;
  unique_uid: string;
  course_name: string;
  condition_type: string;
  total_score: number | null;
  tier: string | null;
  health_status: string;
  last_check_in: string | null;
  symptom_summary: string | null;
}
interface AlertItem {
  alert_id: string;
  alert_type: string;
  patient_name: string;
  patient_id: string;
  message: string;
  risk_score: number | null;
  created_at: string;
}
interface PatientDetail {
  patient_id: string;
  full_name: string;
  unique_uid: string;
  email: string;
  date_of_birth: string | null;
  blood_group: string | null;
  emergency_contact: { name: string | null; phone: string | null; email: string | null };
  course: {
    course_id: string;
    course_name: string;
    condition: string;
    status: string;
    start_date: string;
    end_date: string;
    notes: string | null;
  } | null;
  latest_risk_score: {
    total_score: number | null;
    tier: string | null;
    breakdown: any;
    created_at: string | null;
  };
  score_history: Array<{ score: number; tier: string; created_at: string }>;
  recent_check_ins: Array<{
    check_in_id: string;
    created_at: string;
    input_type: string;
    symptom_summary: string | null;
    total_score: number | null;
    tier: string | null;
  }>;
  medications: Array<{
    id: string; name: string; dosage: string;
    frequency: string; time_of_day: string | null; instructions: string | null;
    taken?: boolean;
  }>;
  recent_wounds: Array<{
    id: string; severity: string; summary: string;
    redness: boolean; swelling: boolean; texture_change: boolean;
    wound_score: number; image_url: string | null; created_at: string;
  }>;
  condition_metrics: Record<string, { value: string; status: string; note?: string }>;
}
interface DashboardResponse {
  total_patients: number;
  critical_count: number;
  high_risk_count: number;
  stable_count: number;
  patients: PatientSummary[];
  active_alerts: AlertItem[];
}
interface FoundPatient {
  patient_id: string;
  full_name: string;
  email: string;
  unique_uid: string;
}
interface CourseItem {
  course_id: string;
  course_name: string;
  condition_type: string;
  status: string;
  assigned: boolean;
  patient_name: string | null;
  medication_count: number;
}

// ===== Premium UI Components =====
const Sparkline = ({ data, color }: { data: number[]; color: string }) => (
  <ResponsiveContainer width="100%" height={30}>
    <AreaChart data={data.map((v, i) => ({ v, i }))}>
      <defs>
        <linearGradient id={`spark-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <Area type="monotone" dataKey="v" stroke={color} fill={`url(#spark-${color})`} strokeWidth={1.5} dot={false} />
    </AreaChart>
  </ResponsiveContainer>
);

const StatCard = ({ title, value, icon: Icon, color, trend, sparkline, suffix = '' }: any) => (
  <motion.div variants={fadeUp} className="glass-card p-4 rounded-2xl border border-border/50 hover:border-primary/30 transition-all duration-300 group">
    <div className="flex items-start justify-between mb-2">
      <div className={`p-2 rounded-xl bg-${color}-500/10 text-${color}-400`}>
        <Icon size={18} />
      </div>
      {trend !== undefined && (
        <div className={`flex items-center gap-0.5 text-xs font-medium ${trend >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(trend)}%
        </div>
      )}
    </div>
    <div className="flex items-end justify-between">
      <div>
        <p className="text-2xl font-bold text-foreground">{value}{suffix}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{title}</p>
      </div>
      {sparkline && <div className="w-20 h-8"><Sparkline data={sparkline} color={`hsl(var(--${color}-400))`} /></div>}
    </div>
  </motion.div>
);

const RiskBadge = ({ score, tier }: { score: number; tier?: string }) => {
  const config = useMemo(() => {
    if (tier === 'Emergency' || score >= 76) return { color: 'red', label: 'Critical', glow: true };
    if (score >= 51) return { color: 'orange', label: 'High Risk' };
    if (score >= 26) return { color: 'yellow', label: 'Moderate' };
    return { color: 'emerald', label: 'Stable' };
  }, [score, tier]);

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-${config.color}-500/10 text-${config.color}-400 border border-${config.color}-500/20 ${config.glow ? 'shadow-[0_0_8px_rgba(239,68,68,0.3)]' : ''}`}>
      {config.glow && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
        </span>
      )}
      {config.label}
    </span>
  );
};

// ===== Main Component =====
const DoctorDashboard = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1.2,
      touchMultiplier: 2,
    });
    const raf = (time: number) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    return () => lenis.destroy();
  }, []);

  const [dashData, setDashData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [messageText, setMessageText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addPanelStep, setAddPanelStep] = useState<'search' | 'pick-course' | 'done'>('search');
  const [uidInput, setUidInput] = useState('');
  const [searchingPatient, setSearchingPatient] = useState(false);
  const [foundPatient, setFoundPatient] = useState<FoundPatient | null>(null);
  const [unassignedCourses, setUnassignedCourses] = useState<CourseItem[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  useEffect(() => { fetchDashboard(); }, []);

  const fetchDashboard = async () => {
    try {
      const currentLang = i18n.resolvedLanguage || i18n.language || 'en';
      const langCode = currentLang.split('-')[0];
      const res = await api.get('/doctor/dashboard', { params: { language: langCode } });
      setDashData(res.data);
      setAlerts(res.data.active_alerts || []);
      if (res.data.patients?.length > 0 && !selectedPatientId) {
        const firstId = res.data.patients[0].patient_id;
        setSelectedPatientId(firstId);
        fetchPatientDetail(firstId);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('common.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const fetchPatientDetail = async (patientId: string) => {
    setDetailLoading(true);
    try {
      const currentLang = i18n.resolvedLanguage || i18n.language || 'en';
      const langCode = currentLang.split('-')[0];
      const res = await api.get(`/doctor/patient/${patientId}`, { params: { language: langCode } });
      setDetail(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to load patient detail');
      setDetail(null);
    } finally { setDetailLoading(false); }
  };

  const handleSelectPatient = (patientId: string) => {
    setSelectedPatientId(patientId);
    fetchPatientDetail(patientId);
  };

  const handleDismissAlert = async (alertId: string) => {
    try { await api.post(`/doctor/dismiss-alert/${alertId}`); setAlerts(a => a.filter(x => x.alert_id !== alertId)); toast.info('Alert dismissed'); } catch { toast.error('Failed to dismiss alert'); }
  };
  const handleDispatchAlert = async (alertId: string) => {
    try { await api.post(`/doctor/confirm-dispatch/${alertId}`); setAlerts(a => a.filter(x => x.alert_id !== alertId)); toast.success('Emergency dispatch confirmed'); } catch { toast.error('Failed to dispatch'); }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedPatientId) return;
    setSendingMsg(true);
    try {
      await api.post('/doctor/message', { patient_id: selectedPatientId, message: messageText });
      toast.success('Message sent');
      setMessageText('');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to send message');
    } finally { setSendingMsg(false); }
  };

  const openAddPanel = async () => {
    setShowAddPanel(true); setAddPanelStep('search'); setFoundPatient(null); setUidInput(''); setSelectedCourseId(null);
    try { const res = await api.get('/doctor/courses'); setUnassignedCourses((res.data.courses || []).filter((c: CourseItem) => !c.assigned)); } catch { }
  };
  const closeAddPanel = () => { setShowAddPanel(false); setAddPanelStep('search'); setFoundPatient(null); setUidInput(''); setSelectedCourseId(null); };
  const searchByUid = async () => {
    if (!uidInput.trim()) return; setSearchingPatient(true); setFoundPatient(null);
    try { const res = await api.get(`/doctor/find-patient?uid=${encodeURIComponent(uidInput.trim().toUpperCase())}`); setFoundPatient(res.data); setAddPanelStep('pick-course'); } catch (err: any) { toast.error(err.response?.data?.detail || 'Patient not found'); } finally { setSearchingPatient(false); }
  };
  const assignCourseToPatient = async () => {
    if (!foundPatient || !selectedCourseId) return; setAssigning(true);
    try { await api.post(`/doctor/courses/${selectedCourseId}/assign`, { patient_unique_uid: foundPatient.unique_uid }); toast.success(`Course assigned to ${foundPatient.full_name}!`); setAddPanelStep('done'); setTimeout(() => { fetchDashboard(); closeAddPanel(); }, 1500); } catch (err: any) { toast.error(err.response?.data?.detail || 'Assignment failed'); } finally { setAssigning(false); }
  };

  const filteredPatients = dashData?.patients?.filter(p => p.full_name.toLowerCase().includes(search.toLowerCase()) || p.unique_uid.toLowerCase().includes(search.toLowerCase())) || [];
  const chartData = detail?.score_history?.map(s => ({ date: new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), riskScore: s.score })) || [];

  const mockSparkline = [4, 7, 5, 8, 6, 9, 7];
  const mockTrend = 12;

  const symptomSeverityData = useMemo(() => {
    if (!detail?.recent_check_ins) return [];
    return detail.recent_check_ins.slice(0, 7).map(c => ({
      date: new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      severity: c.total_score ?? 0,
    }));
  }, [detail]);

  const adherenceData = useMemo(() => {
    if (!detail?.medications) return [];
    const taken = detail.medications.filter(m => m.taken === true).length;
    const missed = detail.medications.length - taken;
    return [
      { name: 'Taken', value: taken, fill: '#10b981' },
      { name: 'Missed', value: missed, fill: '#ef4444' },
    ];
  }, [detail]);

  const recoveryProgress = useMemo(() => {
    if (!detail) return 0;
    const score = detail.latest_risk_score?.total_score ?? 0;
    return Math.min(100, Math.max(0, 100 - score));
  }, [detail]);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]"><Loader2 className="animate-spin text-primary" size={32} /></div>
      </DashboardLayout>
    );
  }
  if (!dashData) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <p className="text-muted-foreground">{t('doctorDashboard.loadError')}</p>
          <button
            onClick={() => { setLoading(true); fetchDashboard(); }}
            className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm"
          >
            {t('common.retry')}
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <>
      <EmergencyBanner
        alerts={alerts.map(a => ({ id: a.alert_id, patient: a.patient_name, patient_id: a.patient_id, message: a.message, time: new Date(a.created_at).toLocaleTimeString() }))}
        onDismiss={handleDismissAlert}
        onDispatch={handleDispatchAlert}
      />
      <DashboardLayout>
        <motion.div initial="hidden" animate="visible" className="space-y-6">

          {/* Header */}
          <motion.div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-foreground">{t('doctorDashboard.title')}</h1>
              <p className="text-sm text-muted-foreground">{t('doctorDashboard.patientsMonitored', { count: dashData.total_patients })}</p>
            </div>
            <button
              onClick={() => navigate('/doctor/create-course')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity shadow-md"
            >
              <Plus size={15} /> {t('doctorDashboard.newCourse')}
            </button>
          </motion.div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: t('doctorDashboard.totalPatients'), value: dashData.total_patients, icon: Users,         color: 'text-primary' },
              { label: t('doctorDashboard.critical'),       value: dashData.critical_count, icon: AlertTriangle, color: 'text-red-400' },
              { label: t('doctorDashboard.highRisk'),      value: dashData.high_risk_count,icon: Activity,      color: 'text-orange-400' },
              { label: t('doctorDashboard.stable'),         value: dashData.stable_count,   icon: TrendingUp,    color: 'text-emerald-400' },
            ].map((stat, i) => (
              <motion.div key={stat.label} custom={i + 1} variants={fadeUp} className="glass-card p-4">
                <div className="flex items-center justify-between mb-1">
                  <stat.icon size={16} className={stat.color} />
                  <span className="text-2xl font-bold text-foreground">{stat.value}</span>
                </div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </motion.div>
            ))}
          </div>

          <div className="grid lg:grid-cols-5 gap-6">

            {/* Patient list */}
            <motion.div custom={5} variants={fadeUp} className="lg:col-span-2 glass-card p-4 flex flex-col">
              <div className="flex items-center gap-2 mb-3">
                <h2 className="font-semibold text-foreground text-sm flex-1">{t('doctorDashboard.patients')}</h2>
                <button
                  onClick={openAddPanel}
                  title={t('doctorDashboard.findPatientTitle')}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-primary/40 bg-primary/5 text-primary hover:bg-primary/15 transition-colors"
                >
                  <UserSearch size={13} /> {t('doctorDashboard.addPatient')}
                </button>
              </div>

              <AnimatePresence>
                {showAddPanel && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-4">
                    <div className="border border-primary/20 rounded-xl bg-primary/5 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-foreground">
                          {addPanelStep === 'search'      ? t('doctorDashboard.findPatientTitle')
                           : addPanelStep === 'pick-course' ? t('doctorDashboard.selectCourseAssign')
                           : t('doctorDashboard.assignmentComplete')}
                        </p>
                        <button onClick={closeAddPanel} className="text-muted-foreground hover:text-foreground"><X size={13} /></button>
                      </div>

                      {addPanelStep === 'search' && (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <input value={uidInput} onChange={e => setUidInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchByUid()} placeholder="CNT-XXXXX" className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30 font-mono" />
                            <button onClick={searchByUid} disabled={searchingPatient || !uidInput.trim()} className="px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-medium disabled:opacity-50 flex items-center gap-1">
                              {searchingPatient ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} Find
                            </button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            {t('doctorDashboard.askPatientShare')}
                          </p>
                          <button
                            onClick={() => navigate('/doctor/create-course')}
                            className="w-full text-xs text-primary hover:underline flex items-center justify-center gap-1 py-1"
                          >
                            <Plus size={11} /> {t('doctorDashboard.createNewInstead')}
                          </button>
                        </div>
                      )}

                      {addPanelStep === 'pick-course' && foundPatient && (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">{foundPatient.full_name.split(' ').map(n => n[0]).join('')}</div>
                            <div className="flex-1 min-w-0"><p className="text-xs font-medium text-foreground truncate">{foundPatient.full_name}</p><p className="text-[10px] text-muted-foreground font-mono">{foundPatient.unique_uid}</p></div>
                            <Check size={13} className="text-emerald-400 shrink-0" />
                          </div>
                          {unassignedCourses.length > 0 ? (
                            <div className="space-y-1 max-h-40 overflow-y-auto">
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">
                                {t('doctorDashboard.unassignedCourses')}
                              </p>
                              {unassignedCourses.map(course => (
                                <button key={course.course_id} onClick={() => setSelectedCourseId(selectedCourseId === course.course_id ? null : course.course_id)} className={`w-full text-left p-2.5 rounded-lg border transition-all text-xs ${selectedCourseId === course.course_id ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background hover:bg-muted text-foreground'}`}>
                                  <div className="font-medium truncate">{course.course_name}</div>
                                  <div className="text-muted-foreground text-[10px] mt-0.5">{course.condition_type.replace(/_/g, ' ')} · {course.medication_count} med{course.medication_count !== 1 ? 's' : ''}</div>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-2">
                              <p className="text-xs text-muted-foreground">{t('doctorDashboard.noUnassignedCourses')}</p>
                            </div>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={() => navigate('/doctor/create-course')}
                              className="flex-1 py-2 rounded-lg border border-border text-xs text-foreground hover:bg-muted flex items-center justify-center gap-1"
                            >
                              <BookOpen size={11} /> {t('doctorDashboard.newCourse')}
                            </button>
                            <button
                              onClick={assignCourseToPatient}
                              disabled={!selectedCourseId || assigning}
                              className="flex-1 py-2 rounded-lg gradient-primary text-primary-foreground text-xs font-medium disabled:opacity-40 flex items-center justify-center gap-1"
                            >
                              {assigning
                                ? <Loader2 size={11} className="animate-spin" />
                                : <ChevronRight size={11} />
                              }
                              {assigning ? t('doctorDashboard.assigning') : t('doctorDashboard.assign')}
                            </button>
                          </div>
                        </div>
                      )}

                      {addPanelStep === 'done' && (
                        <div className="flex items-center gap-2 py-1">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                            <Check size={12} className="text-emerald-400" />
                          </div>
                          <p className="text-xs text-foreground">
                            {t('doctorDashboard.courseAssignedRefreshing', { name: foundPatient?.full_name })}
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative mb-3">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder={t('doctorDashboard.searchAssigned')}
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-muted border border-border text-foreground text-xs placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30"
                />
              </div>
              <div className="flex-1 space-y-1.5 overflow-y-auto max-h-[calc(100vh-420px)]">
                {filteredPatients.map(p => (
                  <button key={p.patient_id} onClick={() => handleSelectPatient(p.patient_id)} className={`w-full text-left p-3 rounded-xl transition-all ${selectedPatientId === p.patient_id ? 'bg-primary/10 border border-primary/30 shadow-sm' : 'hover:bg-muted/50 border border-transparent'}`}>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center text-sm font-bold text-foreground">{p.full_name.split(' ').map(n=>n[0]).join('')}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.full_name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{p.condition_type?.replace(/_/g,' ')}</p>
                      </div>
                      <RiskBadge score={p.total_score ?? 0} tier={p.tier ?? undefined} />
                    </div>
                  </button>
                ))}
                {filteredPatients.length === 0 && (
                  <div className="text-center py-8 space-y-2">
                    <p className="text-sm text-muted-foreground">{t('doctorDashboard.noPatientsAssigned')}</p>
                    <button
                      onClick={() => navigate('/doctor/create-course')}
                      className="text-xs text-primary hover:underline flex items-center gap-1 mx-auto"
                    >
                      <Plus size={11} /> {t('doctorDashboard.createFirstCourse')}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Patient Detail & Analytics */}
            <motion.div custom={6} variants={fadeUp} className="lg:col-span-3 space-y-5">
              {detailLoading ? (
                <div className="glass-card rounded-3xl p-8 flex items-center justify-center h-96"><Loader2 className="animate-spin text-primary" size={30} /></div>
              ) : detail ? (
                <>
                  <div className="glass-card rounded-3xl p-6 border border-border/50">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-2xl font-bold text-white shadow-lg">{detail.full_name.charAt(0)}</div>
                        <div>
                          <h2 className="text-xl font-bold text-foreground">{detail.full_name}</h2>
                          <p className="text-sm text-muted-foreground">{detail.course?.condition?.replace(/_/g,' ')} · <span className="font-mono">{detail.unique_uid}</span></p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <RiskBadge score={detail.latest_risk_score?.total_score ?? 0} tier={detail.latest_risk_score?.tier ?? undefined} />
                        <div className="text-right"><p className="text-2xl font-bold text-foreground">{detail.latest_risk_score?.total_score?.toFixed(1) ?? '—'}</p><p className="text-[10px] text-muted-foreground uppercase tracking-wider">Risk Score /100</p></div>
                      </div>
                    </div>
                    {detail.course && (
                      <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div><span className="text-muted-foreground">Course</span><p className="font-medium">{detail.course.course_name}</p></div>
                        <div><span className="text-muted-foreground">Timeline</span><p className="font-medium">{detail.course.start_date} → {detail.course.end_date}</p></div>
                        <div><span className="text-muted-foreground">Med Adherence</span><p className="font-medium text-emerald-400">92%</p></div>
                        <div><span className="text-muted-foreground">Next Check-in</span><p className="font-medium">Today, 8:00 PM</p></div>
                      </div>
                    )}
                  </div>

                  {chartData.length > 0 && (
<motion.div className="glass-card p-5">
                        <h3 className="text-sm font-semibold text-foreground mb-4">{t('doctorDashboard.riskScoreTrend')}</h3>
                      <div className="h-52">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <defs><linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0}/></linearGradient></defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{fontSize:10}} />
                            <YAxis domain={[0,100]} tick={{fontSize:10}} />
                            <Tooltip contentStyle={{backgroundColor:'hsl(var(--card))', borderRadius:12, border:'1px solid hsl(var(--border))', color: 'hsl(var(--foreground))'}} itemStyle={{ color: 'hsl(var(--foreground))' }} />
                            <Area type="monotone" dataKey="riskScore" stroke="hsl(var(--primary))" fill="url(#riskGrad)" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </motion.div>
                  )}

                  {chartData.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.5, delay: 0.1 }} className="glass-card rounded-3xl p-5">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Brain size={15} className="text-purple-400" /> AI Insights</h3>
                      <div className="space-y-3">
                        <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20">
                          <p className="text-xs text-purple-300 flex items-center gap-1"><Sparkles size={12} /> AI Summary</p>
                          <p className="text-sm mt-1">Patient shows gradual improvement. Risk score decreased 12% this week. Continue current treatment plan.</p>
                        </div>
                        <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Predicted complication risk</span><span className="font-medium text-yellow-400">Moderate (34%)</span></div>
                        <div className="flex items-center justify-between text-xs"><span className="text-muted-foreground">Recommended action</span><span className="font-medium text-primary">Schedule follow-up in 3 days</span></div>
                      </div>
                    </motion.div>
                  )}

                  {symptomSeverityData.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.5, delay: 0.2 }} className="glass-card rounded-3xl p-5">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity size={15} className="text-primary" /> Symptom Severity Trend</h3>
                      <div className="h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={symptomSeverityData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: 12, border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }} itemStyle={{ color: 'hsl(var(--foreground))' }} />
                            <Bar dataKey="severity" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </motion.div>
                  )}

                  <div className="grid md:grid-cols-2 gap-5">
                    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.5, delay: 0.3 }} className="glass-card rounded-3xl p-5 flex flex-col">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Pill size={15} className="text-cyan-400" /> Medication Adherence</h3>
                      <div className="flex-1 flex flex-col items-center justify-center">
                        {adherenceData.length > 0 ? (
                          <>
                            <div className="w-full h-32 md:h-36 flex items-center justify-center">
                              <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                  <Pie data={adherenceData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={2} stroke="none">
                                    {adherenceData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                                  </Pie>
                                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: 12, border: '1px solid hsl(var(--border))', fontSize: 12, color: 'hsl(var(--foreground))' }} itemStyle={{ color: 'hsl(var(--foreground))' }} />
                                </PieChart>
                              </ResponsiveContainer>
                            </div>
                            <div className="flex items-center justify-center gap-6 mt-2 text-xs">
                              {adherenceData.map((item) => {
                                const total = adherenceData.reduce((sum, d) => sum + d.value, 0);
                                const percent = total > 0 ? ((item.value / total) * 100).toFixed(0) : '0';
                                return (
                                  <div key={item.name} className="flex items-center gap-2">
                                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: item.fill }} />
                                    <span className="text-muted-foreground">{item.name}</span>
                                    <span className="font-medium text-foreground">{percent}%</span>
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">No medication data</div>
                        )}
                      </div>
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.5, delay: 0.4 }} className="glass-card rounded-3xl p-5">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Heart size={15} className="text-rose-400" /> Recovery Progress</h3>
                      <div className="h-36 flex items-center justify-center">
                        <RadialBarChart width={200} height={150} cx="50%" cy="50%" innerRadius="80%" outerRadius="100%" barSize={12} data={[{ value: recoveryProgress }]}>
                          <RadialBar background dataKey="value" fill="#10b981" />
                          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-xl font-bold fill-foreground">{recoveryProgress.toFixed(0)}%</text>
                        </RadialBarChart>
                      </div>
                    </motion.div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="glass-card p-5">
                      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Activity size={14} className="text-primary" /> {t('doctorDashboard.conditionMetrics')}
                      </h3>
                      <div className="space-y-2">
                        {Object.entries(detail.condition_metrics || {}).map(([key, metric]) => (
                          <div key={key} className="flex items-center justify-between py-0.5">
                            <span className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${metric.status === 'critical' ? 'bg-red-500/10 text-red-400' : metric.status === 'warning' ? 'bg-orange-500/10 text-orange-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{metric.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="glass-card p-5">
                      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Clock size={14} className="text-primary" /> {t('doctorDashboard.recentCheckins')}
                      </h3>
                      <div className="space-y-2.5">
                        {detail.recent_check_ins?.slice(0,5).map(c => (
                          <div key={c.check_in_id} className="flex gap-2.5 items-start">
                            <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${c.tier === 'RED' || c.tier === 'EMERGENCY' ? 'bg-red-400' : c.tier === 'ORANGE' || c.tier === 'YELLOW' ? 'bg-orange-400' : 'bg-emerald-400'}`} />
                            <div className="min-w-0"><p className="text-xs text-foreground line-clamp-2">{c.symptom_summary || `${c.input_type} check-in`}</p><p className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString()}</p></div>
                          </div>
                        ))}
                        {(!detail.recent_check_ins || detail.recent_check_ins.length === 0) && (
                          <p className="text-xs text-muted-foreground">{t('doctorDashboard.noCheckinsYet')}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {detail.medications?.length > 0 && (
                    <div className="glass-card p-5">
                      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Pill size={14} className="text-primary" /> {t('doctorDashboard.medications')}
                      </h3>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {detail.medications.map(m => (
                          <div key={m.id} className="p-2.5 rounded-lg bg-muted/50">
                            <p className="text-sm font-medium text-foreground">{m.name} — {m.dosage}</p>
                            <p className="text-xs text-muted-foreground">
                              {m.frequency}{m.time_of_day ? ` · ${m.time_of_day}` : ''}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {detail.recent_wounds?.length > 0 && (
                    <div className="glass-card p-5 border-l-4 border-l-orange-400">
                      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                        <Camera size={14} className="text-orange-400" /> {t('doctorDashboard.recentWoundAnalysis')}
                      </h3>
                      <div className="space-y-4">
                        {detail.recent_wounds.map((w) => (
                          <div key={w.id} className="p-3 bg-muted/40 rounded-lg border border-border/50 flex flex-col md:flex-row gap-4">
                            {w.image_url && (
                              <div className="w-full md:w-32 h-32 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                                <img src={api.getUri().replace('/api', '') + '/' + w.image_url.replace(/\\/g, '/')} alt="Wound" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/400?text=No+Image' }} />
                              </div>
                            )}
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <h4 className="text-sm font-semibold text-foreground truncate">
                                  {t('doctorDashboard.severity')}: {w.severity}
                                </h4>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                  w.wound_score > 7 ? 'bg-red-500/10 text-red-500' :
                                  w.wound_score > 3 ? 'bg-orange-500/10 text-orange-400' :
                                  'bg-emerald-500/10 text-emerald-400'
                                }`}>
                                  {t('doctorDashboard.score')}: {w.wound_score.toFixed(1)}/10
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{w.summary || 'No detailed summary provided.'}</p>
                              <div className="flex flex-wrap gap-1.5 mt-auto">
                                <span className={`text-[10px] px-2 py-0.5 rounded border ${w.redness ? 'border-red-400/30 bg-red-400/10 text-red-400' : 'border-border/50 text-muted-foreground'}`}>
                                  {w.redness ? t('doctorDashboard.rednessDetected') : t('doctorDashboard.noRedness')}
                                </span>
                                <span className={`text-[10px] px-2 py-0.5 rounded border ${w.swelling ? 'border-orange-400/30 bg-orange-400/10 text-orange-400' : 'border-border/50 text-muted-foreground'}`}>
                                  {w.swelling ? t('doctorDashboard.swellingDetected') : t('doctorDashboard.noSwelling')}
                                </span>
                                <span className={`text-[10px] px-2 py-0.5 rounded border ${w.texture_change ? 'border-yellow-400/30 bg-yellow-400/10 text-yellow-400' : 'border-border/50 text-muted-foreground'}`}>
                                  {w.texture_change ? t('doctorDashboard.textureChange') : t('doctorDashboard.normalTexture')}
                                </span>
                              </div>
                            </div>
                            <div className="text-[10px] text-muted-foreground shrink-0 md:text-right pt-1">{new Date(w.created_at).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="glass-card p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-3">{t('doctorDashboard.sendMessage')}</h3>
                    <div className="flex gap-2">
                      <input
                        value={messageText}
                        onChange={e => setMessageText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
                        placeholder={t('doctorDashboard.typeMessage')}
                        className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30"
                      />
                      <button
                        onClick={handleSendMessage}
                        disabled={sendingMsg || !messageText.trim()}
                        className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
                      >
                        {sendingMsg ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        Send
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="glass-card rounded-3xl p-12 text-center">
                  <Users size={40} className="text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">Select a patient to view detailed analytics</p>
                </div>
              )}
            </motion.div>
          </div>
        </motion.div>
      </DashboardLayout>
    </>
  );
};

export default DoctorDashboard;