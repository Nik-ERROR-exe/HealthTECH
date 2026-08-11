import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Copy, Check, Pill, Activity, Loader2, MessageSquare,
  Camera, TrendingUp, Heart, Calendar, Clock, Brain,
  AlertTriangle, Users, History, FileText, AlertOctagon,
  PieChart as PieChartIcon, LineChart as LineChartIcon
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { getUser } from '@/lib/auth';
import DashboardLayout from '@/components/DashboardLayout';
import Lenis from '@studio-freight/lenis';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell, RadialBarChart, RadialBar,
  LineChart as ReLineChart, Line, BarChart, Bar
} from 'recharts';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.25, 0.1, 0.25, 1] },
  }),
};

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
  risk_tier?: string;
  risk_score?: number;
  recent_check_ins?: Array<{
    check_in_id: string;
    created_at: string;
    input_type: string;
    symptom_summary: string | null;
    total_score: number | null;
    tier: string | null;
  }>;
  recovery_trend?: Array<{ date: string; progress_pct: number; score: number | null }>;
  medication_adherence?: { taken: number; missed: number; total: number };
  symptom_trend?: Array<{ date: string; symptom_severity: number; risk_score: number }>;
  risk_score_history?: Array<{ date: string; score: number; tier: string }>;
  wound_history?: Array<{ id: string; uploaded_at: string; thumbnail_url?: string; score: number; status: string }>;
  upcoming_appointments?: Array<{ date: string; doctor: string; type: string; location?: string }>;
  care_team?: Array<{ name: string; role: string; specialty?: string }>;
}

const getRiskConfig = (tier?: string) => {
  const t = (tier || 'GREEN').toUpperCase();
  if (t === 'GREEN') return { color: '#10b981', bg: 'bg-emerald-500/10', text: 'text-emerald-400', icon: Activity, label: 'Low Risk' };
  if (t === 'YELLOW') return { color: '#f59e0b', bg: 'bg-amber-500/10', text: 'text-amber-400', icon: AlertTriangle, label: 'Medium Risk' };
  if (t === 'ORANGE') return { color: '#f97316', bg: 'bg-orange-500/10', text: 'text-orange-400', icon: AlertOctagon, label: 'High Risk' };
  if (t === 'RED') return { color: '#ef4444', bg: 'bg-red-500/10', text: 'text-red-400', icon: AlertOctagon, label: 'Critical Risk' };
  return { color: '#8b5cf6', bg: 'bg-purple-500/10', text: 'text-purple-400', icon: AlertOctagon, label: 'Emergency' };
};

const formatDate = (dateStr: string | null) => dateStr ? new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set';

const RelativeDashboard = () => {
  const user = getUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const { t } = useTranslation();

  useEffect(() => {
    const lenis = new Lenis({ duration: 1.2, smoothWheel: true });
    const raf = (time: number) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    return () => lenis.destroy();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await api.get('/relative/dashboard');
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

  useEffect(() => {
    fetchDashboard();
    fetchMessages();
  }, []);

  const copyId = () => {
    navigator.clipboard.writeText(data?.unique_uid || '');
    setCopied(true);
    toast.success('Patient ID copied!');
    setTimeout(() => setCopied(false), 2000);
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

  const adherence = data.medication_adherence;
  const adherencePercent = adherence && adherence.total > 0 ? Math.round((adherence.taken / adherence.total) * 100) : 0;
  const adherenceData = adherence ? [
    { name: 'Taken', value: adherence.taken, fill: '#10b981' },
    { name: 'Missed', value: adherence.missed, fill: '#ef4444' },
  ] : [];

  return (
    <DashboardLayout>
      <motion.div initial="hidden" animate="visible" className="space-y-6 pb-8">
        {/* Read-only banner */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs">
          <Activity size={14} />
          <span>You are viewing {data.full_name.split(' ')[0]}'s dashboard as a relative. This view is read-only.</span>
        </div>

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
                <Heart size={18} className="text-primary" />
                <span className="text-xs font-medium text-primary uppercase tracking-wider">Relative View</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                {greeting}! Monitoring {data.full_name.split(' ')[0]}
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
                <Heart size={14} className="text-primary" />
                <span className="text-xs font-mono text-foreground">{data.unique_uid}</span>
                <button onClick={copyId} className="ml-1 p-1 hover:bg-muted rounded-md">
                  {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} className="text-muted-foreground" />}
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Risk Level */}
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
          {/* Recovery Trend */}
          <motion.div custom={4} variants={fadeUp} className="glass-card rounded-3xl p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><TrendingUp size={15} className="text-emerald-400" /> Recovery Trend</h3>
            {data.recovery_trend && data.recovery_trend.length > 0 ? (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.recovery_trend}>
                    <defs><linearGradient id="grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity={0.3}/><stop offset="100%" stopColor="#10b981" stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: 12 }} />
                    <Area type="monotone" dataKey="progress_pct" stroke="#10b981" fill="url(#grad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center text-muted-foreground text-sm py-6">No recovery data yet.</p>
            )}
          </motion.div>

          {/* Medication Adherence */}
          <motion.div custom={5} variants={fadeUp} className="glass-card rounded-3xl p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><PieChartIcon size={15} className="text-secondary" /> Medication Adherence</h3>
            {adherence && adherence.total > 0 ? (
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
                <div className="text-center text-sm font-medium mt-1">{adherencePercent}% taken</div>
              </>
            ) : (
              <p className="text-center text-muted-foreground text-sm py-6">No adherence data yet.</p>
            )}
          </motion.div>

          {/* Symptom Trend */}
          <motion.div custom={6} variants={fadeUp} className="glass-card rounded-3xl p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><LineChartIcon size={15} className="text-purple-400" /> Symptom Trend</h3>
            {data.symptom_trend && data.symptom_trend.length > 0 ? (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <ReLineChart data={data.symptom_trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 8 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 8 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="risk_score" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 2 }} />
                  </ReLineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center text-muted-foreground text-sm py-6">No symptom data yet.</p>
            )}
          </motion.div>
        </div>

        {/* Risk History & Recent Checkins */}
        <div className="grid md:grid-cols-2 gap-6">
          <motion.div custom={7} variants={fadeUp} className="glass-card rounded-3xl p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><History size={15} className="text-blue-400" /> Risk Score History</h3>
            {data.risk_score_history && data.risk_score_history.length > 0 ? (
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.risk_score_history}>
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
              <p className="text-center text-muted-foreground text-sm py-6">No risk history yet.</p>
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
              <p className="text-center text-muted-foreground text-sm py-6">No recent check-ins.</p>
            )}
          </motion.div>
        </div>

        {/* Wound History + Upcoming Appointments */}
        <div className="grid md:grid-cols-2 gap-6">
          <motion.div custom={9} variants={fadeUp} className="glass-card rounded-3xl p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Camera size={18} className="text-orange-400" /> Wound Analysis History</h2>
            {data.wound_history && data.wound_history.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {data.wound_history.map(w => (
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
              </div>
            )}
          </motion.div>

          <motion.div custom={10} variants={fadeUp} className="glass-card rounded-3xl p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Calendar size={18} className="text-cyan-400" /> Upcoming Appointments</h2>
            {data.upcoming_appointments && data.upcoming_appointments.length > 0 ? (
              <div className="space-y-3">
                {data.upcoming_appointments.map((apt, idx) => (
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
              </div>
            )}
          </motion.div>
        </div>

        {/* Care Team & Doctor Messages */}
        <div className="grid md:grid-cols-2 gap-6">
          <motion.div custom={11} variants={fadeUp} className="glass-card rounded-3xl p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Heart size={18} className="text-yellow-500" /> Care Team</h2>
            {data.care_team && data.care_team.length > 0 ? (
              <div className="space-y-3">
                {data.care_team.map((member, idx) => (
                  <div key={idx} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/20 transition">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/30 to-secondary/30 flex items-center justify-center text-primary font-bold text-sm">{member.name.charAt(0)}</div>
                    <div><p className="text-sm font-medium">{member.name}</p><p className="text-xs text-muted-foreground">{member.role}{member.specialty ? ` • ${member.specialty}` : ''}</p></div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground">
                <Users size={28} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">Care team will appear once assigned.</p>
              </div>
            )}
          </motion.div>

          <motion.div custom={12} variants={fadeUp} className="glass-card rounded-3xl p-6">
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
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare size={32} className="mx-auto mb-2 opacity-30" />
                  <p>No messages from the doctor yet.</p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </DashboardLayout>
  );
};

export default RelativeDashboard;
