import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, useInView, Variants } from 'framer-motion';
import {
  Copy, Check, Pill, ChevronRight, Activity,
  Loader2, MessageSquare, Bell, Camera, Upload,
  TrendingUp, Heart, Calendar, Clock, Zap, Sparkles,
  BarChart3, PieChart, TrendingDown, Shield, Wifi, Brain,
  AlertTriangle, Users, MapPin, History, FileText,
  AlertOctagon, Phone, CheckCircle, XCircle, LineChart as LineChartIcon
} from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '@/components/DashboardLayout';
import { getUser } from '@/lib/auth';
import api, { conversationApi } from '@/lib/api';
import ImpactDetector, { ImpactDetectorHandle } from '@/components/ImpactDetector';
import Lenis from '@studio-freight/lenis';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell, RadialBarChart, RadialBar,
  LineChart as ReLineChart, Line
} from 'recharts';

// ===== Framer Motion Variants =====
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: (i as any) * 0.08, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
  }),
};

// ===== Types =====
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
    taken?: boolean;
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
  risk_tier?: string;
  risk_score?: number;
  upcoming_appointments?: Array<{ date: string; doctor: string; type: string; location?: string }>;
  care_team?: Array<{ name: string; role: string; specialty?: string; avatar?: string }>;
  vital_signs?: { heart_rate?: number; blood_pressure_systolic?: number; blood_pressure_diastolic?: number; temperature?: number; oxygen_saturation?: number };
  recent_check_ins?: Array<{
    check_in_id: string;
    created_at: string;
    input_type: string;
    symptom_summary: string | null;
    total_score: number | null;
    tier: string | null;
  }>;
}

interface Message {
  id: string;
  message: string;
  doctor_name: string;
  created_at: string;
  is_read: boolean;
}

interface CheckinHistory {
  date: string;
  risk_score: number;
  risk_tier: string;
  symptom_severity?: number;
}

interface WoundImage {
  id: string;
  uploaded_at: string;
  thumbnail_url?: string;
  score: number;
  status: string;
}

// ===== Helper: Risk config =====
const getRiskConfig = (tier?: string) => {
  const t = (tier || 'GREEN').toUpperCase();
  if (t === 'GREEN') return { color: '#10b981', bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: CheckCircle, label: 'Low Risk' };
  if (t === 'YELLOW') return { color: '#f59e0b', bg: 'bg-amber-500/10', text: 'text-amber-400', icon: AlertTriangle, label: 'Medium Risk' };
  if (t === 'ORANGE') return { color: '#f97316', bg: 'bg-orange-500/10', text: 'text-orange-400', icon: AlertOctagon, label: 'High Risk' };
  if (t === 'RED') return { color: '#ef4444', bg: 'bg-red-500/10', text: 'text-red-400', icon: AlertOctagon, label: 'Critical Risk' };
  return { color: '#8b5cf6', bg: 'bg-purple-500/10', text: 'text-purple-400', icon: AlertOctagon, label: 'Emergency' };
};

const formatDate = (dateStr: string | null) => dateStr ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set';

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
  const user = getUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [checkinHistory, setCheckinHistory] = useState<CheckinHistory[]>([]);
  const [woundHistory, setWoundHistory] = useState<WoundImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [uploadingWound, setUploadingWound] = useState(false);
  const [nearbyVolunteers, setNearbyVolunteers] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const impactDetectorRef = useRef<ImpactDetectorHandle>(null);  // <-- FIXED

  // Lenis smooth scroll
  useEffect(() => {
    const lenis = new Lenis({ duration: 1.2, smoothWheel: true });
    const raf = (time: number) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    return () => lenis.destroy();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await api.get('/patient/dashboard');
      setData(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to load dashboard');
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

  const fetchCheckinHistory = async () => {
    try {
      const res = await api.get('/patient/checkin-history');
      setCheckinHistory(res.data.history || []);
    } catch { /* optional – ignore */ }
  };

  const fetchWoundHistory = async () => {
    try {
      const res = await api.get('/patient/wound-history');
      setWoundHistory(res.data.wounds || []);
    } catch { /* optional */ }
  };

  const fetchNearbyVolunteers = async () => {
    try {
      const res = await api.get('/patient/nearby-volunteers');
      setNearbyVolunteers(res.data.count);
    } catch { /* optional */ }
  };

  useEffect(() => {
    const fetchAll = async () => {
      await fetchDashboard();
      await fetchMessages();
      await fetchCheckinHistory();
      await fetchWoundHistory();
      await fetchNearbyVolunteers();
    };
    fetchAll();
  }, []);

  const copyId = () => {
    navigator.clipboard.writeText(data?.unique_uid || '');
    setCopied(true);
    toast.success('Patient ID copied!');
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
      toast.info('Analyzing wound photo...');
      const res = await conversationApi.dashboardUploadWound(file);
      if (res.data.status === 'success' || res.data.check_in_id) {
        toast.success(res.data.friendly_message || 'Wound analysis complete!');
        fetchDashboard();
        fetchWoundHistory();
      } else {
        toast.success('Photo uploaded successfully.');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to upload photo');
    } finally {
      setUploadingWound(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const symptomTrend = useMemo(() => {
    if (!checkinHistory.length) return [];
    return checkinHistory.slice(-7).map(c => ({
      date: new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      severity: c.symptom_severity ?? (c.risk_score ? Math.min(100, c.risk_score) : 0)
    }));
  }, [checkinHistory]);

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
          <p className="text-muted-foreground">Could not load dashboard data.</p>
          <button
            onClick={() => { setLoading(true); fetchDashboard(); }}
            className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm"
          >
            Retry
          </button>
        </div>
      </DashboardLayout>
    );
  }

  const greeting = new Date().getHours() < 12 ? 'Good morning' :
                   new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';

  const riskTier = data.risk_tier || 'GREEN';
  const riskScore = data.risk_score ?? 0;
  const riskConfig = getRiskConfig(riskTier);
  const RiskIcon = riskConfig.icon;

  const medsWithTaken = data.medications_today.filter(m => m.taken !== undefined);
  const takenCount = medsWithTaken.filter(m => m.taken).length;
  const missedCount = medsWithTaken.filter(m => !m.taken).length;
  const adherencePercent = medsWithTaken.length ? Math.round((takenCount / medsWithTaken.length) * 100) : 0;
  const adherenceData = [
    { name: 'Taken', value: takenCount, fill: '#10b981' },
    { name: 'Missed', value: missedCount, fill: '#ef4444' },
  ];

  const vitals = data.vital_signs || {};
  const careTeam = data.care_team || [];
  const appointments = data.upcoming_appointments || [];

  return (
    <DashboardLayout>
      <motion.div initial="hidden" animate="visible" className="space-y-6 pb-8">

        {/* Welcome Banner */}
        <motion.div
          custom={0}
          variants={fadeUp}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-secondary/10 p-6 md:p-8 border border-primary/20 shadow-2xl"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(56,189,248,0.15)_0%,transparent_60%)]" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
          <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles size={18} className="text-primary" />
                <span className="text-xs font-medium text-primary uppercase tracking-wider">AI Health Assistant</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                {greeting}, {data.full_name.split(' ')[0]}! 👋
              </h1>
              <p className="text-muted-foreground mt-1 flex items-center gap-2">
                <Activity size={14} className="text-primary" />
                Health status: <span className="font-medium text-foreground">{data.health_status}</span>
              </p>
              {data.last_check_in && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Clock size={12} /> Last check-in: {new Date(data.last_check_in).toLocaleDateString()}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-background/30 backdrop-blur-sm border border-border">
                <Shield size={14} className="text-emerald-400" />
                <span className="text-xs font-mono text-foreground">{data.unique_uid}</span>
                <button onClick={copyId} className="ml-1 p-1 hover:bg-muted rounded-md">
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

        {/* Risk + AI Insight Row */}
        <div className="grid md:grid-cols-2 gap-5">
          <motion.div custom={0.5} variants={fadeUp} className="glass-card rounded-3xl p-5 border-l-8" style={{ borderLeftColor: riskConfig.color }}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Current Risk Level</p>
                <div className="flex items-center gap-2 mt-1">
                  <RiskIcon size={20} className={riskConfig.text} />
                  <span className="text-2xl font-bold text-foreground">{riskConfig.label}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Risk Score: {riskScore} / 100</p>
              </div>
              <div className="w-16 h-16">
                <RadialBarChart width={64} height={64} cx="50%" cy="50%" innerRadius="60%" outerRadius="80%" data={[{ value: riskScore }]} startAngle={90} endAngle={-270}>
                  <RadialBar dataKey="value" fill={riskConfig.color} cornerRadius={10} />
                </RadialBarChart>
              </div>
            </div>
            {riskTier !== 'GREEN' && (
              <div className="mt-3 p-2 rounded-lg bg-red-500/10 text-red-400 text-xs flex items-center gap-2">
                <AlertTriangle size={14} /> Action required: {riskTier === 'ORANGE' ? 'Notify doctor' : riskTier === 'RED' ? 'Immediate attention needed' : 'Emergency contact pending'}
              </div>
            )}
          </motion.div>

          <motion.div custom={0.6} variants={fadeUp} className="glass-card rounded-3xl p-5 border border-border/50">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
                <Brain size={18} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">AI Insight</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {data.active_course
                    ? `Your recovery is on track. Continue with "${data.active_course.course_name}". ${riskTier !== 'GREEN' ? 'Please complete the pending check‑in.' : 'Keep up the good work!'}`
                    : 'No active course. Share your Patient ID with your doctor.'}
                </p>
                {data.pending_question && (
                  <button onClick={openAgentChat} className="mt-2 text-xs text-primary underline">Answer CARA's question</button>
                )}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Quick Actions */}
        {!data.pending_question && (
          <motion.div custom={1} variants={fadeUp} className="grid sm:grid-cols-2 gap-4">
            <button
              onClick={openAgentChat}
              className="w-full glass-card p-5 flex items-center justify-between hover:border-primary/40 transition-all group rounded-2xl hover:scale-[1.02]"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center">
                  <MessageSquare size={16} className="text-primary-foreground" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-foreground">Start Check-in</p>
                  <p className="text-xs text-muted-foreground">Talk to CARA – voice & text</p>
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
                <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center">
                  {uploadingWound ? <Loader2 size={16} className="text-white animate-spin" /> : <Camera size={16} className="text-white" />}
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-foreground">Upload Wound Photo</p>
                  <p className="text-xs text-muted-foreground">AI wound analysis (OpenCV)</p>
                </div>
              </div>
              <Upload size={18} className="text-muted-foreground group-hover:text-orange-400 transition-colors shrink-0" />
            </button>
            <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleWoundUpload} />
          </motion.div>
        )}

        {/* Active Course & Medications */}
        <div className="grid lg:grid-cols-3 gap-6">
          <motion.div custom={2} variants={fadeUp} className="lg:col-span-2 glass-card rounded-3xl p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Activity size={18} className="text-primary" /> Active Course
            </h2>
            {data.active_course ? (
              <div className="space-y-4">
                <div className="flex justify-between items-start flex-wrap gap-2">
                  <div>
                    <p className="font-medium text-foreground text-lg">{data.active_course.course_name}</p>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">Dr. {data.active_course.doctor_name}</p>
                  </div>
                  <span className="text-sm font-medium text-primary">{data.active_course.progress_pct}% complete</span>
                </div>
                <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${data.active_course.progress_pct}%` }} transition={{ duration: 1 }} className="h-full bg-gradient-to-r from-primary to-secondary rounded-full" />
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1"><Calendar size={12} /> Start: {data.active_course.start_date}</div>
                  <div className="flex items-center gap-1"><Calendar size={12} /> End: {data.active_course.end_date}</div>
                </div>
                {data.active_course.notes && <div className="p-3 rounded-xl bg-muted/30 text-xs italic">{data.active_course.notes}</div>}
              </div>
            ) : (
              <div className="text-center py-6">
                <p className="text-muted-foreground">No active course assigned yet.</p>
                <p className="text-xs text-muted-foreground mt-1">Share ID: <span className="font-mono bg-muted px-1 rounded">{data.unique_uid}</span> with your doctor.</p>
                <button onClick={openAgentChat} className="mt-4 text-xs text-primary underline">Start a general check-in</button>
              </div>
            )}
          </motion.div>

          <motion.div custom={3} variants={fadeUp} className="glass-card rounded-3xl p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Pill size={18} className="text-secondary" /> Today's Medications
            </h2>
            {data.medications_today.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {data.medications_today.map(med => (
                  <div key={med.id} className="p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-medium">{med.name}</p>
                        <p className="text-xs text-muted-foreground">{med.dosage} · {med.frequency}</p>
                        {med.time_of_day && <p className="text-xs text-muted-foreground/70 mt-1"><Clock size={10} className="inline mr-1" />{med.time_of_day}</p>}
                      </div>
                      {med.taken !== undefined && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${med.taken ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                          {med.taken ? 'Taken' : 'Pending'}
                        </span>
                      )}
                    </div>
                    {med.instructions && <p className="text-[10px] text-muted-foreground mt-1 italic">{med.instructions}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Pill size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No medications scheduled for today.</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Analytics Row */}
        <div className="grid md:grid-cols-3 gap-6">
          <motion.div custom={4} variants={fadeUp} className="glass-card rounded-3xl p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><TrendingUp size={15} className="text-emerald-400" /> Recovery Trend</h3>
            {data.active_course ? (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={[{ week: 'Start', progress: 0 }, { week: 'Now', progress: data.active_course.progress_pct }]}>
                    <defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="100%" stopColor="#10b981" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: 12 }} />
                    <Area type="monotone" dataKey="progress" stroke="#10b981" fill="url(#grad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center text-muted-foreground text-sm py-6">No active course to track.</p>
            )}
          </motion.div>

          <motion.div custom={5} variants={fadeUp} className="glass-card rounded-3xl p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">Medication Adherence</h3>
            {medsWithTaken.length > 0 ? (
              <>
                <div className="h-32 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <RePieChart>
                      <Pie data={adherenceData} dataKey="value" innerRadius={40} outerRadius={60} paddingAngle={2}>
                        {adherenceData.map((entry, idx) => <Cell key={idx} fill={entry.fill} />)}
                      </Pie>
                      <Tooltip />
                    </RePieChart>
                  </ResponsiveContainer>
                </div>
                <div className="text-center text-sm font-medium mt-1">{adherencePercent}% taken today</div>
              </>
            ) : (
              <p className="text-center text-muted-foreground text-sm py-6">Log medications to see adherence.</p>
            )}
          </motion.div>

          <motion.div custom={6} variants={fadeUp} className="glass-card rounded-3xl p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><LineChartIcon size={15} className="text-purple-400" /> Symptom Trend</h3>
            {symptomTrend.length > 0 ? (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <ReLineChart data={symptomTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 8 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 8 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="severity" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} />
                  </ReLineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center text-muted-foreground text-sm py-6">Complete check-ins to see symptom trends.</p>
            )}
          </motion.div>
        </div>

        {/* Risk History & Recent Checkins */}
        <div className="grid md:grid-cols-2 gap-6">
          <motion.div custom={7} variants={fadeUp} className="glass-card rounded-3xl p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><History size={15} className="text-blue-400" /> Risk Score History</h3>
            {checkinHistory.length > 0 ? (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={checkinHistory.slice(-7).map(c => ({ date: new Date(c.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }), score: c.risk_score }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="score" stroke="#3b82f6" fill="url(#riskGradBlue)" />
                    <defs><linearGradient id="riskGradBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center text-muted-foreground text-sm py-6">No check-in history yet.</p>
            )}
          </motion.div>

          <motion.div custom={8} variants={fadeUp} className="glass-card rounded-3xl p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock size={15} className="text-amber-400" /> Recent Check-ins</h3>
            {data.recent_check_ins && data.recent_check_ins.length > 0 ? (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {data.recent_check_ins.slice(0,5).map(check => (
                  <div key={check.check_in_id} className="flex items-start gap-2 p-2 border-b border-border/50 last:border-0">
                    <div className={`w-2 h-2 mt-1.5 rounded-full ${check.tier === 'RED' || check.tier === 'EMERGENCY' ? 'bg-red-500' : check.tier === 'ORANGE' ? 'bg-orange-500' : check.tier === 'YELLOW' ? 'bg-yellow-500' : 'bg-emerald-500'}`} />
                    <div className="flex-1">
                      <p className="text-xs text-foreground line-clamp-1">{check.symptom_summary || `${check.input_type} check-in`}</p>
                      <p className="text-[10px] text-muted-foreground">{new Date(check.created_at).toLocaleString()}</p>
                    </div>
                    <span className="text-[10px] font-medium">{check.total_score !== null ? `${check.total_score} score` : '—'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground text-sm py-6">No recent check-ins. Start one now!</p>
            )}
          </motion.div>
        </div>

        {/* Wound History + Volunteer Network */}
        <div className="grid md:grid-cols-2 gap-6">
          <motion.div custom={9} variants={fadeUp} className="glass-card rounded-3xl p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Camera size={18} className="text-orange-400" /> Wound Analysis History</h2>
            {woundHistory.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {woundHistory.map(w => (
                  <div key={w.id} className="flex items-center gap-3 p-2 rounded-xl bg-muted/20 hover:bg-muted/40 transition">
                    {w.thumbnail_url ? <img src={w.thumbnail_url} alt="wound" className="w-12 h-12 rounded-lg object-cover" /> : <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center"><FileText size={20} /></div>}
                    <div className="flex-1">
                      <p className="text-sm font-medium">Severity: {w.score}/10 – {w.status}</p>
                      <p className="text-xs text-muted-foreground">{new Date(w.uploaded_at).toLocaleString()}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Camera size={32} className="mx-auto mb-2 opacity-30" />
                <p>No wound photos uploaded yet.</p>
                <button onClick={() => fileInputRef.current?.click()} className="text-xs text-primary mt-2 underline">Upload your first</button>
              </div>
            )}
          </motion.div>

          <motion.div custom={10} variants={fadeUp} className="glass-card rounded-3xl p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Users size={18} className="text-blue-400" /> Safety Network</h2>
            <div className="space-y-4">
              {nearbyVolunteers !== null ? (
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                  <div className="flex items-center gap-2"><MapPin size={16} className="text-primary" /><span className="text-sm">Nearby volunteers</span></div>
                  <span className="text-2xl font-bold text-primary">{nearbyVolunteers}</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Volunteer service available. In case of emergency, our network will be alerted.</p>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Phone size={12} /> Emergency contact: {data.emergency_contact_phone || 'Not set'}</div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground"><Bell size={12} /> Fall detection active – your phone monitors impacts.</div>

              <div className="mt-4 pt-2 border-t border-border/50 space-y-3">
                <button
                  onClick={() => impactDetectorRef.current?.simulateImpact()}
                  className="w-full py-2 rounded-lg bg-red-500/20 text-red-400 text-sm font-medium border border-red-500/30 hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2"
                >
                  <AlertTriangle size={14} /> Simulate Impact (Fall Detection Demo)
                </button>
                <ImpactDetector
                  ref={impactDetectorRef}
                  patientName={data.full_name}
                  patientPhone={data.emergency_contact_phone || ''}
                  userId={user?.id}
                  hideFloatingControls={true}
                />
              </div>
            </div>
          </motion.div>
        </div>

        {/* Upcoming Appointments & Care Team */}
        <div className="grid md:grid-cols-2 gap-6">
          <motion.div custom={11} variants={fadeUp} className="glass-card rounded-3xl p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Calendar size={18} className="text-cyan-400" /> Upcoming Appointments</h2>
            {appointments.length > 0 ? (
              <div className="space-y-3">
                {appointments.map((apt, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-muted/20">
                    <div><p className="text-sm font-medium">{apt.type}</p><p className="text-xs text-muted-foreground">{apt.doctor}</p></div>
                    <div className="text-right"><p className="text-xs font-mono">{formatDate(apt.date)}</p>{apt.location && <p className="text-[10px] text-muted-foreground">{apt.location}</p>}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Calendar size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No upcoming appointments.</p>
                <button className="text-xs text-primary mt-2 underline">Contact your clinic</button>
              </div>
            )}
          </motion.div>

          <motion.div custom={12} variants={fadeUp} className="glass-card rounded-3xl p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Heart size={18} className="text-yellow-500" /> Your Care Team</h2>
            {careTeam.length > 0 ? (
              <div className="space-y-3">
                {careTeam.map((member, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/20 transition">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center text-primary font-bold text-sm">{member.name.charAt(0)}</div>
                    <div><p className="text-sm font-medium">{member.name}</p><p className="text-xs text-muted-foreground">{member.role}{member.specialty ? ` • ${member.specialty}` : ''}</p></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Users size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Your care team will appear once assigned.</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Doctor Messages */}
        <motion.div custom={13} variants={fadeUp} className="glass-card rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2"><MessageSquare size={18} className="text-primary" /> Doctor Messages</h2>
            {data.unread_messages > 0 && <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full animate-pulse">{data.unread_messages} new</span>}
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {messages.length > 0 ? (
              messages.map(msg => (
                <div key={msg.id} className={`p-4 rounded-xl border ${!msg.is_read ? 'border-primary/30 bg-primary/5' : 'border-border bg-muted/20'} transition`}>
                  <div className="flex justify-between"><p className="text-sm font-medium">{msg.doctor_name}</p><span className="text-xs text-muted-foreground">{new Date(msg.created_at).toLocaleString()}</span></div>
                  <p className="text-sm text-muted-foreground mt-1">{msg.message}</p>
                  {!msg.is_read && <div className="mt-2 text-xs text-primary flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse"/> New</div>}
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
                <p>No messages from your doctor yet.</p>
              </div>
            )}
          </div>
        </motion.div>

      </motion.div>
    </DashboardLayout>
  );
};

export default PatientDashboard;