import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  Copy, Check, Pill, ChevronRight, Activity,
  Loader2, MessageSquare, Bell, Camera, Upload,
  TrendingUp, Calendar, Clock, Sparkles,
  Shield, Wifi, Brain, AlertTriangle, Users, MapPin,
  History, FileText, CheckCircle, XCircle,
  AlertOctagon, Phone
} from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '@/components/DashboardLayout';
import { getUser } from '@/lib/auth';
import api, { conversationApi } from '@/lib/api';
import ImpactDetector from '@/components/ImpactDetector';
import Lenis from '@studio-freight/lenis';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart as RePieChart, Pie, Cell, RadialBarChart, RadialBar
} from 'recharts';

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

// ===== Main Component =====
const PatientDashboard = () => {
  const user = getUser(); // ✅ lowercase 'user'
  const [data, setData] = useState<DashboardData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [checkinHistory, setCheckinHistory] = useState<CheckinHistory[]>([]);
  const [woundHistory, setWoundHistory] = useState<WoundImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [uploadingWound, setUploadingWound] = useState(false);
  const [nearbyVolunteers, setNearbyVolunteers] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Smooth scroll
  useEffect(() => {
    const lenis = new Lenis({ duration: 1.2, smoothWheel: true });
    const raf = (time: number) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    return () => lenis.destroy();
  }, []);

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
    } catch {
      // Optional endpoint – ignore 404
    }
  };

  const fetchWoundHistory = async () => {
    try {
      const res = await api.get('/patient/wound-history');
      setWoundHistory(res.data.wounds || []);
    } catch {
      // Optional endpoint
    }
  };

  const fetchNearbyVolunteers = async () => {
    try {
      const res = await api.get('/patient/nearby-volunteers');
      setNearbyVolunteers(res.data.count);
    } catch {
      // Optional
    }
  };

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
        <div className="flex flex-col items-center justify-center h-[80vh] gap-4">
          <p className="text-muted-foreground">Could not load dashboard data.</p>
          <button onClick={() => { setLoading(true); fetchDashboard(); }} className="px-4 py-2 rounded-lg bg-gradient-to-r from-primary to-secondary text-white text-sm">
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

  return (
    <DashboardLayout>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 pb-8">

        {/* Welcome Banner */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary/20 via-primary/10 to-secondary/10 p-6 md:p-8 border border-primary/20 shadow-2xl">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(56,189,248,0.15)_0%,transparent_60%)]" />
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
        </div>

        {/* Risk + AI Insight Row */}
        <div className="grid md:grid-cols-2 gap-5">
          <div className={`glass-card rounded-3xl p-5 border-l-8`} style={{ borderLeftColor: riskConfig.color }}>
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
          </div>

          <div className="glass-card rounded-3xl p-5 border border-border/50">
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
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid sm:grid-cols-2 gap-4">
          <button onClick={openAgentChat} className="w-full glass-card p-5 flex items-center justify-between hover:border-primary/40 transition-all group rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-r from-primary to-secondary flex items-center justify-center">
                <MessageSquare size={16} className="text-white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-foreground">{data.pending_question ? 'Complete Check-in' : 'Start Check-in'}</p>
                <p className="text-xs text-muted-foreground">Talk to CARA – voice & text</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary" />
          </button>

          <button onClick={() => fileInputRef.current?.click()} disabled={uploadingWound} className="w-full glass-card p-5 flex items-center justify-between hover:border-orange-400/40 transition-all group rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-orange-500 flex items-center justify-center">
                {uploadingWound ? <Loader2 size={16} className="text-white animate-spin" /> : <Camera size={16} className="text-white" />}
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-foreground">Upload Wound Photo</p>
                <p className="text-xs text-muted-foreground">AI wound analysis (OpenCV)</p>
              </div>
            </div>
            <Upload size={18} className="text-muted-foreground group-hover:text-orange-400" />
          </button>
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleWoundUpload} />
        </div>

        {/* Active Course & Medications */}
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 glass-card rounded-3xl p-6">
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
              <div className="text-center py-6 text-muted-foreground">No active course. Share ID: <span className="font-mono bg-muted px-1 rounded">{data.unique_uid}</span> with your doctor.</div>
            )}
          </div>

          <div className="glass-card rounded-3xl p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Pill size={18} className="text-secondary" /> Today's Medications
            </h2>
            {data.medications_today.length > 0 ? (
              <div className="space-y-3">
                {data.medications_today.map(med => (
                  <div key={med.id} className="p-3 rounded-xl bg-muted/30">
                    <div className="flex justify-between">
                      <p className="text-sm font-medium">{med.name}</p>
                      {med.taken !== undefined && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${med.taken ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                          {med.taken ? 'Taken' : 'Pending'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{med.dosage} · {med.frequency}</p>
                    {med.time_of_day && <p className="text-xs text-muted-foreground/70 mt-1"><Clock size={10} className="inline mr-1" />{med.time_of_day}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground text-sm py-6">No medications scheduled.</p>
            )}
          </div>
        </div>

        {/* Analytics Row */}
        <div className="grid md:grid-cols-3 gap-6">
          <div className="glass-card rounded-3xl p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <TrendingUp size={15} className="text-emerald-400" /> Recovery Trend
            </h3>
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
          </div>

          <div className="glass-card rounded-3xl p-5">
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
                <div className="text-center text-sm font-medium mt-1">{adherencePercent}% taken</div>
              </>
            ) : (
              <p className="text-center text-muted-foreground text-sm py-6">Log medications to see adherence.</p>
            )}
          </div>

          <div className="glass-card rounded-3xl p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><History size={15} className="text-purple-400" /> Risk History</h3>
            {checkinHistory.length > 0 ? (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={checkinHistory.slice(-7).map(c => ({ date: new Date(c.date).toLocaleDateString(undefined, { month:'numeric', day:'numeric' }), score: c.risk_score }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 8 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 8 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="score" stroke="#8b5cf6" fill="url(#riskGrad)" />
                    <defs><linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3}/><stop offset="100%" stopColor="#8b5cf6" stopOpacity={0}/></linearGradient></defs>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center text-muted-foreground text-sm py-6">Complete check‑ins to see risk trends.</p>
            )}
          </div>
        </div>

        {/* Wound History + Volunteer Network */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="glass-card rounded-3xl p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Camera size={18} className="text-orange-400" /> Wound Analysis History</h2>
            {woundHistory.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {woundHistory.map(w => (
                  <div key={w.id} className="flex items-center gap-3 p-2 rounded-xl bg-muted/20">
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
          </div>

          <div className="glass-card rounded-3xl p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Users size={18} className="text-blue-400" /> Volunteer Network</h2>
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
              <ImpactDetector
                patientName={data.full_name}
                patientPhone={data.emergency_contact_phone || ''}
                userId={user?.id}  // ✅ Fixed: 'user' not 'User'
              />
            </div>
          </div>
        </div>

        {/* Doctor Messages */}
        <div className="glass-card rounded-3xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-foreground flex items-center gap-2"><MessageSquare size={18} className="text-primary" /> Doctor Messages</h2>
            {data.unread_messages > 0 && <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full">{data.unread_messages} new</span>}
          </div>
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {messages.length > 0 ? (
              messages.map(msg => (
                <div key={msg.id} className="p-4 rounded-xl border border-border bg-muted/20">
                  <div className="flex justify-between"><p className="text-sm font-medium">{msg.doctor_name}</p><span className="text-xs text-muted-foreground">{new Date(msg.created_at).toLocaleDateString()}</span></div>
                  <p className="text-sm text-muted-foreground mt-1">{msg.message}</p>
                  {!msg.is_read && <div className="mt-2 text-xs text-primary flex items-center gap-1"><span className="w-1 h-1 rounded-full bg-primary"/> New</div>}
                </div>
              ))
            ) : (
              <p className="text-center text-muted-foreground py-6">No messages from your doctor yet.</p>
            )}
          </div>
        </div>

      </motion.div>
    </DashboardLayout>
  );
};

export default PatientDashboard;