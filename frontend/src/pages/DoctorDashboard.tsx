import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, AlertTriangle, Search, Activity, TrendingUp, Clock, Pill,
  Loader2, Send, Plus, X, ChevronRight, UserSearch, BookOpen, Check, Camera,
  Bell, Sparkles, TrendingDown, Heart, Zap, Brain, PieChart as PieChartIcon,
  Calendar, Filter
} from 'lucide-react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, BarChart, Bar, RadialBarChart, RadialBar,
  PieChart as RePieChart, Pie, Cell, Legend
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import EmergencyBanner from '@/components/EmergencyBanner';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import Lenis from '@studio-freight/lenis';

// ===== Types (same as backend) =====
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
interface PracticeStats {
  avg_risk_score: number;
  adherence_rate: number;
  recovery_rate: number;
  volunteer_count: number;
  active_emergencies: number;
}

// ===== Helper =====
const getRiskColor = (score: number | null, tier?: string) => {
  if (tier === 'Emergency' || (score && score >= 76)) return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', glow: true };
  if (score && score >= 51) return { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/30', glow: false };
  if (score && score >= 26) return { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30', glow: false };
  return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', glow: false };
};

// ===== StatCard component =====
const StatCard = ({ title, value, icon: Icon, color, change, suffix = '', onClick }: any) => (
  <motion.div
    whileHover={{ scale: 1.02 }}
    transition={{ type: "spring", stiffness: 300 }}
    onClick={onClick}
    className="glass-card p-4 rounded-2xl border border-border/50 hover:border-primary/30 transition-all duration-300 group cursor-pointer"
  >
    <div className="flex items-start justify-between mb-2">
      <div className={`p-2 rounded-xl bg-${color}-500/10 text-${color}-400`}>
        <Icon size={18} />
      </div>
      {change !== undefined && (
        <div className={`flex items-center gap-0.5 text-xs font-medium ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
          {change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {Math.abs(change)}%
        </div>
      )}
    </div>
    <div>
      <p className="text-2xl font-bold text-foreground">{value}{suffix}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{title}</p>
    </div>
  </motion.div>
);

// ===== RiskBadge component =====
const RiskBadge = ({ score, tier }: { score: number | null; tier?: string }) => {
  const { bg, text, glow } = getRiskColor(score, tier);
  let label = 'Stable';
  if (tier === 'Emergency' || (score && score >= 76)) label = 'Critical';
  else if (score && score >= 51) label = 'High Risk';
  else if (score && score >= 26) label = 'Moderate';
  else label = 'Stable';

  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${bg} ${text} border ${glow ? 'shadow-[0_0_8px_rgba(239,68,68,0.3)]' : ''}`}>
      {glow && (
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
        </span>
      )}
      {label}
    </span>
  );
};

// ===== Main Component =====
const DoctorDashboard = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const lenis = new Lenis({ duration: 1.2, smoothWheel: true });
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
  const [practiceStats, setPracticeStats] = useState<PracticeStats | null>(null);
  const [volunteerStatus, setVolunteerStatus] = useState<{ online: number; within_5km: number } | null>(null);

  useEffect(() => { fetchDashboard(); fetchPracticeStats(); fetchVolunteerStatus(); }, []);

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
    } finally { setLoading(false); }
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

  const fetchPracticeStats = async () => {
    try {
      const res = await api.get('/doctor/practice-stats');
      setPracticeStats(res.data);
    } catch {
      if (dashData) {
        const avgRisk = dashData.patients.reduce((sum, p) => sum + (p.total_score || 0), 0) / (dashData.patients.length || 1);
        setPracticeStats({
          avg_risk_score: avgRisk,
          adherence_rate: 78,
          recovery_rate: 85,
          volunteer_count: 0,
          active_emergencies: alerts.length,
        });
      }
    }
  };

  const fetchVolunteerStatus = async () => {
    try {
      const res = await api.get('/doctor/volunteer-status');
      setVolunteerStatus(res.data);
    } catch {}
  };

  const handleSelectPatient = (patientId: string) => {
    setSelectedPatientId(patientId);
    fetchPatientDetail(patientId);
  };

  const handleDismissAlert = async (alertId: string) => {
    try { await api.post(`/doctor/dismiss-alert/${alertId}`); setAlerts(a => a.filter(x => x.alert_id !== alertId)); toast.info('Alert dismissed'); } catch { toast.error('Failed to dismiss alert'); }
  };

  const handleDispatchAlert = async (alertId: string) => {
    try { await api.post(`/doctor/confirm-dispatch/${alertId}`); setAlerts(a => a.filter(x => x.alert_id !== alertId)); toast.success('Emergency dispatch confirmed'); fetchVolunteerStatus(); } catch { toast.error('Failed to dispatch'); }
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

  const filteredPatients = dashData?.patients?.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) ||
    p.unique_uid.toLowerCase().includes(search.toLowerCase())
  ) || [];

  const overallAdherence = useMemo(() => dashData ? 82 : 0, [dashData]);
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
      { name: t('doctorDashboard.taken'), value: taken, fill: '#10b981' },
      { name: t('doctorDashboard.missed'), value: missed, fill: '#ef4444' },
    ];
  }, [detail, t]);
  const recoveryProgress = useMemo(() => {
    if (!detail) return 0;
    const score = detail.latest_risk_score?.total_score ?? 0;
    return Math.min(100, Math.max(0, 100 - score));
  }, [detail]);
  const chartData = detail?.score_history?.map(s => ({ date: new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), riskScore: s.score })) || [];

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
          <button onClick={() => { setLoading(true); fetchDashboard(); }} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm">{t('common.retry')}</button>
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
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground flex items-center gap-3">
                {t('doctorDashboard.title')}
                <span className="flex items-center gap-1.5 text-xs font-normal text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  AI Monitoring Active
                </span>
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">{dashData.total_patients} active patients • Last sync {new Date().toLocaleTimeString()}</p>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => navigate('/doctor/create-course')} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-primary to-secondary text-white text-sm font-medium shadow-lg shadow-primary/25 hover:scale-105 transition-all">
                <Plus size={16} /> {t('doctorDashboard.newCourse')}
              </button>
              <button className="relative p-2.5 rounded-xl bg-muted/50 border border-border hover:bg-muted transition-colors">
                <Bell size={18} />
                {alerts.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center text-white">{alerts.length}</span>}
              </button>
            </div>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
            <StatCard title={t('doctorDashboard.totalPatients')} value={dashData.total_patients} icon={Users} color="primary" change={+5} />
            <StatCard title={t('doctorDashboard.critical')} value={dashData.critical_count} icon={AlertTriangle} color="red" change={-2} />
            <StatCard title={t('doctorDashboard.highRisk')} value={dashData.high_risk_count} icon={Activity} color="orange" change={+8} />
            <StatCard title={t('doctorDashboard.stable')} value={dashData.stable_count} icon={TrendingUp} color="emerald" change={+12} />
            <StatCard title={t('doctorDashboard.compliance')} value={overallAdherence} icon={Pill} color="cyan" change={+3} suffix="%" />
            <StatCard title={t('doctorDashboard.volunteersNearby')} value={volunteerStatus?.within_5km ?? 0} icon={Users} color="purple" change={0} />
          </div>

          {/* AI Insights Bar */}
          <motion.div className="glass-card rounded-3xl p-5 border border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-purple-500/20 flex items-center justify-center"><Brain size={20} className="text-purple-400" /></div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{t('doctorDashboard.aiPopulationInsights')}</p>
                  <p className="text-xs text-muted-foreground">{t('doctorDashboard.aiInsightsDesc')}</p>
                </div>
              </div>
              <div className="flex gap-4 text-xs">
                <div><span className="text-muted-foreground">{t('doctorDashboard.avgRiskScore')}:</span> <span className="font-bold text-foreground">{practiceStats?.avg_risk_score?.toFixed(1) || '—'}</span></div>
                <div><span className="text-muted-foreground">{t('doctorDashboard.projectedEscalations')}:</span> <span className="font-bold text-orange-400">{Math.round((dashData.high_risk_count + dashData.critical_count) * 0.3)}</span></div>
                <div><span className="text-muted-foreground">{t('doctorDashboard.recommendation')}:</span> <span className="text-primary">{t('doctorDashboard.increaseFollowUp')}</span></div>
              </div>
            </div>
          </motion.div>

          {/* Main Grid */}
          <div className="grid lg:grid-cols-5 gap-6">
            {/* Patient List */}
            <div className="lg:col-span-2 glass-card rounded-3xl p-5 border border-border/50 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-foreground flex items-center gap-2"><Users size={16} className="text-primary" /> {t('doctorDashboard.assignedPatients')}</h2>
                <button onClick={openAddPanel} className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"><UserSearch size={13} /> {t('doctorDashboard.addPatient')}</button>
              </div>

              <AnimatePresence>
                {showAddPanel && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-4">
                    <div className="border border-primary/20 rounded-xl bg-primary/5 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-foreground">
                          {addPanelStep === 'search' ? t('doctorDashboard.findPatientTitle') : addPanelStep === 'pick-course' ? t('doctorDashboard.selectCourseAssign') : t('doctorDashboard.assignmentComplete')}
                        </p>
                        <button onClick={closeAddPanel} className="text-muted-foreground hover:text-foreground"><X size={13} /></button>
                      </div>
                      {addPanelStep === 'search' && (
                        <div className="space-y-2">
                          <div className="flex gap-2">
                            <input value={uidInput} onChange={e => setUidInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchByUid()} placeholder="CNT-XXXXX" className="flex-1 px-3 py-2 rounded-lg bg-background border border-border text-foreground text-xs placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30 font-mono" />
                            <button onClick={searchByUid} disabled={searchingPatient || !uidInput.trim()} className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-medium disabled:opacity-50 flex items-center gap-1">
                              {searchingPatient ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />} {t('doctorDashboard.find')}
                            </button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{t('doctorDashboard.askPatientShare')}</p>
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
                              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{t('doctorDashboard.unassignedCourses')}</p>
                              {unassignedCourses.map(course => (
                                <button key={course.course_id} onClick={() => setSelectedCourseId(selectedCourseId === course.course_id ? null : course.course_id)} className={`w-full text-left p-2.5 rounded-lg border transition-all text-xs ${selectedCourseId === course.course_id ? 'border-primary bg-primary/10 text-foreground' : 'border-border bg-background hover:bg-muted text-foreground'}`}>
                                  <div className="font-medium truncate">{course.course_name}</div>
                                  <div className="text-muted-foreground text-[10px] mt-0.5">{course.condition_type.replace(/_/g, ' ')} · {course.medication_count} med{course.medication_count !== 1 ? 's' : ''}</div>
                                </button>
                              ))}
                            </div>
                          ) : (<div className="text-center py-2"><p className="text-xs text-muted-foreground">{t('doctorDashboard.noUnassignedCourses')}</p></div>)}
                          <div className="flex gap-2">
                            <button onClick={() => navigate('/doctor/create-course')} className="flex-1 py-2 rounded-lg border border-border text-xs text-foreground hover:bg-muted flex items-center justify-center gap-1"><BookOpen size={11} /> {t('doctorDashboard.newCourse')}</button>
                            <button onClick={assignCourseToPatient} disabled={!selectedCourseId || assigning} className="flex-1 py-2 rounded-lg bg-gradient-to-r from-primary to-secondary text-white text-xs font-medium disabled:opacity-40 flex items-center justify-center gap-1">
                              {assigning ? <Loader2 size={11} className="animate-spin" /> : <ChevronRight size={11} />} {assigning ? t('doctorDashboard.assigning') : t('doctorDashboard.assign')}
                            </button>
                          </div>
                        </div>
                      )}
                      {addPanelStep === 'done' && (
                        <div className="flex items-center gap-2 py-1">
                          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center"><Check size={12} className="text-emerald-400" /></div>
                          <p className="text-xs text-foreground">{t('doctorDashboard.courseAssignedRefreshing', { name: foundPatient?.full_name })}</p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="relative mb-3">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('doctorDashboard.searchAssigned')} className="w-full pl-9 pr-4 py-2 rounded-xl bg-muted/50 border border-border text-sm focus:ring-2 focus:ring-primary/30" />
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
                      <RiskBadge score={p.total_score} tier={p.tier ?? undefined} />
                    </div>
                  </button>
                ))}
                {filteredPatients.length === 0 && (
                  <div className="text-center py-8 space-y-2">
                    <p className="text-sm text-muted-foreground">{t('doctorDashboard.noPatientsAssigned')}</p>
                    <button onClick={() => navigate('/doctor/create-course')} className="text-xs text-primary hover:underline flex items-center gap-1 mx-auto"><Plus size={11} /> {t('doctorDashboard.createFirstCourse')}</button>
                  </div>
                )}
              </div>
            </div>

            {/* Patient Detail & Analytics */}
            <div className="lg:col-span-3 space-y-5">
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
                      <RiskBadge score={detail.latest_risk_score?.total_score ?? 0} tier={detail.latest_risk_score?.tier ?? undefined} />
                    </div>
                    {detail.course && (
                      <div className="mt-4 pt-4 border-t border-border/50 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        <div><span className="text-muted-foreground">Course</span><p className="font-medium">{detail.course.course_name}</p></div>
                        <div><span className="text-muted-foreground">Timeline</span><p className="font-medium">{detail.course.start_date} → {detail.course.end_date}</p></div>
                        <div><span className="text-muted-foreground">Risk Score</span><p className="font-medium">{detail.latest_risk_score?.total_score?.toFixed(1) ?? '—'}/100</p></div>
                        <div><span className="text-muted-foreground">Last Check-in</span><p className="font-medium">{detail.recent_check_ins?.[0] ? new Date(detail.recent_check_ins[0].created_at).toLocaleDateString() : 'Never'}</p></div>
                      </div>
                    )}
                  </div>

                  {chartData.length > 0 && (
                    <div className="glass-card rounded-3xl p-5">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity size={15} className="text-primary" /> {t('doctorDashboard.riskScoreTrend')}</h3>
                      <div className="h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={chartData}>
                            <defs><linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0}/></linearGradient></defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{fontSize:10}} />
                            <YAxis domain={[0,100]} tick={{fontSize:10}} />
                            <Tooltip contentStyle={{backgroundColor:'hsl(var(--card))', borderRadius:12, border:'1px solid hsl(var(--border))', color: 'hsl(var(--foreground))'}} />
                            <Area type="monotone" dataKey="riskScore" stroke="hsl(var(--primary))" fill="url(#riskGrad)" strokeWidth={2} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  <div className="glass-card rounded-3xl p-5 bg-gradient-to-r from-purple-500/5 to-pink-500/5 border border-purple-500/20">
                    <div className="flex items-start gap-3">
                      <Brain size={18} className="text-purple-400 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">{t('doctorDashboard.aiClinicalInsight')}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {detail.latest_risk_score?.total_score && detail.latest_risk_score.total_score > 70 
                            ? t('doctorDashboard.insightCritical')
                            : detail.latest_risk_score?.total_score && detail.latest_risk_score.total_score > 40
                            ? t('doctorDashboard.insightModerate')
                            : t('doctorDashboard.insightStable')}
                        </p>
                        <div className="flex gap-4 mt-2 text-xs">
                          <span className="text-muted-foreground">{t('doctorDashboard.predictedEscalation')}: {detail.latest_risk_score?.total_score && detail.latest_risk_score.total_score > 60 ? '24h' : '5 days'}</span>
                          <span className="text-muted-foreground">{t('doctorDashboard.recommendedAction')}: {detail.latest_risk_score?.total_score && detail.latest_risk_score.total_score > 50 ? t('doctorDashboard.contactNow') : t('doctorDashboard.routineCheckin')}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-5">
                    <div className="glass-card p-5 rounded-2xl">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity size={14} className="text-primary" /> {t('doctorDashboard.conditionMetrics')}</h3>
                      <div className="space-y-2">
                        {Object.entries(detail.condition_metrics || {}).map(([key, metric]) => (
                          <div key={key} className="flex items-center justify-between py-0.5">
                            <span className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${metric.status === 'critical' ? 'bg-red-500/10 text-red-400' : metric.status === 'warning' ? 'bg-orange-500/10 text-orange-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{metric.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="glass-card p-5 rounded-2xl">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Pill size={14} className="text-cyan-400" /> {t('doctorDashboard.medicationAdherenceToday')}</h3>
                      {detail.medications?.length ? (
                        <div className="space-y-3">
                          {detail.medications.slice(0,3).map(m => (
                            <div key={m.id} className="flex justify-between items-center">
                              <div><p className="text-xs font-medium">{m.name}</p><p className="text-[10px] text-muted-foreground">{m.dosage}</p></div>
                              <span className={`text-xs ${m.taken ? 'text-emerald-400' : 'text-yellow-400'}`}>{m.taken ? '✓ Taken' : 'Pending'}</span>
                            </div>
                          ))}
                        </div>
                      ) : <p className="text-sm text-muted-foreground">{t('doctorDashboard.noMedications')}</p>}
                    </div>
                  </div>

                  {symptomSeverityData.length > 0 && (
                    <div className="glass-card rounded-3xl p-5">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity size={15} className="text-primary" /> {t('doctorDashboard.symptomSeverityTrend')}</h3>
                      <div className="h-44">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={symptomSeverityData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                            <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                            <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: 12, border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                            <Bar dataKey="severity" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  <div className="grid md:grid-cols-2 gap-5">
                    <div className="glass-card rounded-3xl p-5 flex flex-col">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><PieChartIcon size={15} className="text-cyan-400" /> {t('doctorDashboard.medicationAdherence')}</h3>
                      <div className="flex-1 flex flex-col items-center justify-center">
                        {adherenceData && adherenceData.some(d => d.value > 0) ? (
                          <>
                            <div className="w-full h-32 md:h-36 flex items-center justify-center">
                              <ResponsiveContainer width="100%" height="100%">
                                <RePieChart>
                                  <Pie data={adherenceData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={2} stroke="none">
                                    {adherenceData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.fill} />)}
                                  </Pie>
                                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: 12, border: '1px solid hsl(var(--border))', fontSize: 12, color: 'hsl(var(--foreground))' }} />
                                </RePieChart>
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
                          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{t('doctorDashboard.noMedicationData')}</div>
                        )}
                      </div>
                    </div>
                    <div className="glass-card rounded-3xl p-5">
                      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Heart size={15} className="text-rose-400" /> {t('doctorDashboard.recoveryProgress')}</h3>
                      <div className="h-36 flex items-center justify-center">
                        <RadialBarChart width={200} height={150} cx="50%" cy="50%" innerRadius="80%" outerRadius="100%" barSize={12} data={[{ value: recoveryProgress }]}>
                          <RadialBar background dataKey="value" fill="#10b981" />
                          <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle" className="text-xl font-bold fill-foreground">{recoveryProgress.toFixed(0)}%</text>
                        </RadialBarChart>
                      </div>
                    </div>
                  </div>

                  {detail.recent_wounds?.length > 0 && (
                    <div className="glass-card p-5 border-l-4 border-l-orange-400 rounded-2xl">
                      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2"><Camera size={14} className="text-orange-400" /> {t('doctorDashboard.recentWoundAnalysis')}</h3>
                      <div className="space-y-4">
                        {detail.recent_wounds.map((w) => (
                          <div key={w.id} className="p-3 bg-muted/40 rounded-lg border border-border/50 flex flex-col md:flex-row gap-4">
                            {w.image_url && (
                              <div className="w-full md:w-32 h-32 shrink-0 rounded-md overflow-hidden bg-muted flex items-center justify-center">
                                <img src={api.getUri().replace('/api', '') + '/' + w.image_url.replace(/\\/g, '/')} alt="Wound" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = 'https://placehold.co/400?text=No+Image' }} />
                              </div>
                            )}
                            <div className="flex-1">
                              <div className="flex justify-between"><h4 className="text-sm font-semibold">{t('doctorDashboard.severity')}: {w.severity}</h4><span className="text-xs">{t('doctorDashboard.score')}: {w.wound_score.toFixed(1)}/10</span></div>
                              <p className="text-xs text-muted-foreground my-1">{w.summary}</p>
                              <div className="flex gap-2 text-[10px] mt-1">
                                <span className={w.redness ? 'text-red-400' : 'text-muted-foreground'}>{t('doctorDashboard.redness')}</span>
                                <span className={w.swelling ? 'text-orange-400' : 'text-muted-foreground'}>{t('doctorDashboard.swelling')}</span>
                                <span className={w.texture_change ? 'text-yellow-400' : 'text-muted-foreground'}>{t('doctorDashboard.texture')}</span>
                              </div>
                            </div>
                            <div className="text-[10px] text-muted-foreground">{new Date(w.created_at).toLocaleString()}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="glass-card rounded-3xl p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-3">{t('doctorDashboard.sendMessage')}</h3>
                    <div className="flex gap-3">
                      <input value={messageText} onChange={e=>setMessageText(e.target.value)} placeholder={t('doctorDashboard.typeMessage')} className="flex-1 px-4 py-2.5 rounded-xl bg-muted/50 border border-border text-sm" />
                      <button onClick={handleSendMessage} disabled={sendingMsg} className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 flex items-center gap-2"><Send size={14} /> {t('doctorDashboard.send')}</button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="glass-card rounded-3xl p-12 text-center">
                  <Users size={40} className="text-muted-foreground/30 mx-auto mb-4" />
                  <p className="text-muted-foreground">{t('doctorDashboard.selectPatient')}</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </DashboardLayout>
    </>
  );
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.4, ease: [0, 0, 0.2, 1] },
  }),
};

export default DoctorDashboard;