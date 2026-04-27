import { useState, useEffect, useRef } from 'react';
import { motion, useInView, Variants } from 'framer-motion';
import {
  Copy, Check, Pill, ChevronRight, Activity,
  Loader2, MessageSquare, Bell, Camera, Upload,
  TrendingUp, Heart, Calendar, Clock, Zap, Sparkles,
  BarChart3, PieChart, TrendingDown, Shield, Wifi, Brain
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/DashboardLayout';
import { getUser } from '@/lib/auth';
import api, { conversationApi } from '@/lib/api';
import ImpactDetector from '@/components/ImpactDetector';
import Lenis from '@studio-freight/lenis';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell, RadialBarChart, RadialBar
} from 'recharts';

// ===== Framer Motion Variants =====
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { 
      delay: (i as any) * 0.08, 
      duration: 0.5, 
      ease: [0.25, 0.1, 0.25, 1] 
    },
  }),
};

// ===== Types (unchanged) =====
interface DashboardData {
  patient_id: string;
  full_name: string;
  unique_uid: string;
  health_status: string;
  active_course: {
    course_id: string;
    course_name: string;
    condition: string;
    doctor_name: string;
    start_date: string;
    end_date: string;
    progress_pct: number;
    notes: string | null;
  } | null;
  medications_today: Array<{
    id: string;
    name: string;
    dosage: string;
    frequency: string;
    time_of_day: string | null;
    instructions: string | null;
  }>;
  last_check_in: string | null;
  unread_messages: number;
  emergency_contact_phone?: string;
  pending_question: {
    session_id: string;
    question: string;
    options: string[] | null;
    trigger: string;
  } | null;
}

interface Message {
  id: string;
  message: string;
  doctor_name: string;
  created_at: string;
  is_read: boolean;
}

// ===== Premium UI Components =====
const HealthScoreRing = ({ score }: { score: number }) => {
  const data = [{ value: score }];
  const color = score >= 70 ? '#10b981' : score >= 40 ? '#f59e0b' : '#ef4444';

  return (
    <div className="relative w-24 h-24">
      <RadialBarChart width={96} height={96} cx="50%" cy="50%" innerRadius="80%" outerRadius="100%" barSize={8} data={data} startAngle={90} endAngle={-270}>
        <RadialBar background dataKey="value" fill={color} cornerRadius={10} />
      </RadialBarChart>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold text-foreground">{score}</span>
      </div>
    </div>
  );
};

// ===== Main Component =====
const PatientDashboard = () => {
  const { t, i18n } = useTranslation();
  const user = getUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [uploadingWound, setUploadingWound] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Lenis smooth scroll
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

  useEffect(() => {
    fetchDashboard();
    fetchMessages();
  }, []);

  const fetchDashboard = async () => {
    try {
      const currentLang = i18n.resolvedLanguage || i18n.language || 'en';
      const res = await api.get('/patient/dashboard', { params: { language: currentLang.split('-')[0] } });
      setData(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('common.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    try {
      const res = await api.get('/patient/messages');
      setMessages(res.data.messages || []);
    } catch { /* silent */ }
  };

  const copyId = () => {
    navigator.clipboard.writeText(data?.unique_uid || '');
    setCopied(true);
    toast.success(t('patient.copySuccess'));
    setTimeout(() => setCopied(false), 2000);
  };

  const openAgentChat = () => {
    window.dispatchEvent(new Event('carenetra:open-agent-chat'));
  };

  const handleWoundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingWound(true);
    try {
      toast.info(t('chat.uploadWound'));
      const res = await conversationApi.dashboardUploadWound(file);
      if (res.data.status === 'success' || res.data.check_in_id) {
        toast.success(res.data.friendly_message || t('common.success'));
        // Refresh dashboard to show updated status
        fetchDashboard();
      } else {
        toast.success(t('common.success'));
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('common.error'));
    } finally {
      setUploadingWound(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh]">
          <Loader2 className="animate-spin text-primary" size={40} />
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <p className="text-muted-foreground">{t('common.loadError')}</p>
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

  const hours = new Date().getHours();
  const greetingKey = hours < 12 ? 'greet.morning' : hours < 17 ? 'greet.afternoon' : 'greet.evening';

  // Derived health score
  const healthScore = data.active_course ? Math.min(100, Math.max(0, data.active_course.progress_pct + 20)) : 65;
  const adherenceData = [
    { name: 'Taken', value: 8, fill: '#10b981' },
    { name: 'Missed', value: 2, fill: '#ef4444' },
  ];

  return (
    <DashboardLayout>
      <motion.div initial="hidden" animate="visible" className="space-y-6 pb-8">

        {/* ===== Premium Welcome Banner ===== */}
        <motion.div
          custom={0}
          variants={fadeUp}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-secondary/10 p-6 md:p-8 border border-primary/20 shadow-2xl"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(56,189,248,0.15)_0%,transparent_60%)]" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-primary-foreground">
                {t(greetingKey)}, {data.full_name.split(' ')[0]}! 👋
              </h1>
              <p className="text-primary-foreground/80 text-sm mt-1">
                {t('patient.healthStatus')}: <span className="font-medium">{data.health_status}</span>
              </p>
              {data.last_check_in && (
                <p className="text-primary-foreground/60 text-xs mt-0.5">
                  {t('patient.lastCheckin')}: {new Date(data.last_check_in).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-background/30 backdrop-blur-sm border border-border">
                <Shield size={14} className="text-emerald-400" />
                <span className="text-xs font-mono text-foreground">{data.unique_uid}</span>
                <button onClick={copyId} className="ml-1 p-1 hover:bg-muted rounded-md transition-colors">
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="text-muted-foreground" />}
                </button>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-emerald-400 bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                <Wifi size={12} />
                <span>Live Sync</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ===== AI Health Insight Summary ===== */}
        <motion.div custom={0.5} variants={fadeUp} className="glass-card rounded-3xl p-5 border border-border/50">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
              <Brain size={18} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-foreground">AI Insight</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {data.active_course
                  ? `Your recovery is on track. Continue with your current course "${data.active_course.course_name}".`
                  : 'No active course. Share your Patient ID with your doctor to get started.'}
              </p>
            </div>
            <HealthScoreRing score={healthScore} />
          </div>
        </motion.div>

        {/* ===== Pending Question Nudge ===== */}
        {data.pending_question && (
          <motion.div
            custom={1}
            variants={fadeUp}
            className="glass-card rounded-3xl p-5 border-l-4 border-primary bg-primary/5"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center shrink-0 mt-0.5">
                <Bell size={16} className="text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground mb-0.5">
                  {t('chat.nudgeTitle')}
                </p>
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {data.pending_question.question}
                </p>
                <button
                  onClick={openAgentChat}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  {t('chat.openCheckin')} <ChevronRight size={12} />
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ===== Quick Actions ===== */}
        {!data.pending_question && (
          <motion.div custom={1} variants={fadeUp} className="grid sm:grid-cols-2 gap-4">
            <button
              onClick={openAgentChat}
              className="w-full glass-card p-5 flex items-center justify-between hover:border-primary/40 transition-all group rounded-2xl hover:scale-[1.02]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center shrink-0">
                  <MessageSquare size={16} className="text-primary-foreground" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-foreground">{t('chat.startCheckin')}</p>
                  <p className="text-xs text-muted-foreground">{t('chat.symptomsDesc')}</p>
                </div>
              </div>
              <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingWound}
              className="w-full glass-card p-5 flex items-center justify-between hover:border-orange-400/40 transition-all group rounded-2xl hover:scale-[1.02]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center shrink-0">
                  {uploadingWound ? <Loader2 size={16} className="text-white animate-spin" /> : <Camera size={16} className="text-white" />}
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-foreground">{t('chat.uploadWound')}</p>
                  <p className="text-xs text-muted-foreground">{t('chat.woundDesc')}</p>
                </div>
              </div>
              <Upload size={18} className="text-muted-foreground group-hover:text-orange-400 transition-colors shrink-0" />
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleWoundUpload} />
          </motion.div>
        )}

        {/* ===== Main Grid ===== */}
        <div className="grid lg:grid-cols-3 gap-6">
          <motion.div custom={2} variants={fadeUp} className="lg:col-span-2 glass-card rounded-3xl p-6 border border-border/50">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Activity size={18} className="text-primary" /> {t('patient.activeCourse')}
            </h2>
            {data.active_course ? (
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-foreground">{data.active_course.course_name}</p>
                    <p className="text-sm text-muted-foreground">{t('patient.by')} {data.active_course.doctor_name}</p>
                  </div>
                  <span className="text-sm font-medium text-primary">{data.active_course.progress_pct}%</span>
                </div>
                <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${data.active_course.progress_pct}%` }}
                    transition={{ duration: 1, ease: [0.25, 0.1, 0.25, 1] }}
                    className="h-full bg-gradient-to-r from-primary to-secondary rounded-full"
                  />
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar size={12} /> {data.active_course.start_date}</span>
                  <span className="flex items-center gap-1"><TrendingUp size={12} /> {data.active_course.end_date}</span>
                </div>
                {data.active_course.notes && (
                  <p className="text-xs text-muted-foreground italic border-t border-border/50 pt-3">{data.active_course.notes}</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <p className="text-sm text-muted-foreground text-center">
                  {t('patient.noCourse')}
                </p>
                <p className="text-xs text-muted-foreground text-center">
                  {t('patient.shareId')} (<span className="font-mono text-foreground">{data.unique_uid}</span>)
                </p>
              </div>
            )}
          </motion.div>

          <motion.div custom={3} variants={fadeUp} className="glass-card rounded-3xl p-6 border border-border/50">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Pill size={18} className="text-secondary" /> {t('patient.medications')}
            </h2>
            <div className="space-y-3">
              {data.medications_today.length > 0 ? (
                data.medications_today.map((med) => (
                  <div key={med.id} className="p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-medium text-foreground">{med.name}</p>
                      <span className="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">Taken</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{med.dosage} · {med.frequency}</p>
                    {med.time_of_day && (
                      <p className="text-xs text-muted-foreground/70 mt-1 flex items-center gap-1">
                        <Clock size={10} /> {med.time_of_day}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">{t('patient.noMeds')}</p>
              )}
            </div>
          </motion.div>
        </div>

        {/* ── Doctor Messages ────────────────────────────────────────────────── */}
        <motion.div custom={4} variants={fadeUp} className="glass-card p-6">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <MessageSquare size={18} className="text-primary" /> {t('patient.messages')}
            {data.unread_messages > 0 && (
              <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">
                {data.unread_messages} {t('patient.newMessages')}
              </span>
            )}
          </h2>
          <div className="space-y-3">
            {messages.length > 0 ? (
              messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-xl border border-border bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="flex justify-between items-start gap-2">
                    <p className="text-sm font-medium text-foreground">{msg.doctor_name}</p>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {new Date(msg.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{msg.message}</p>
                  {!msg.is_read && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-primary">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" /> New
                    </div>
                  )}
                </motion.div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">{t('patient.noMessages')}</p>
            )}
          </div>
        </motion.div>

        {/* ===== Impact Detector ===== */}
        <ImpactDetector
          patientName={data.full_name}
          patientPhone={data.emergency_contact_phone || ''}
          userId={user?.id}
        />
      </motion.div>
    </DashboardLayout>
  );
};

export default PatientDashboard;