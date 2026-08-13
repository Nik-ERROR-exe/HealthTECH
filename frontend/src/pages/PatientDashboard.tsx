import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, useInView, Variants } from 'framer-motion';
import {
  Copy, Check, Pill, ChevronRight, Activity,
  Loader2, MessageSquare, Bell, Camera, Upload, Send,
  TrendingUp, Heart, Calendar, Clock, Zap, Sparkles,
  BarChart3, PieChart, TrendingDown, Shield, Wifi, Brain,
  AlertTriangle, Users, MapPin, History, FileText,
  AlertOctagon, Phone, CheckCircle, XCircle, LineChart as LineChartIcon
} from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '@/components/DashboardLayout';
import ImageChat from '@/components/ImageChat';
import { getUser } from '@/lib/auth';
import api, { conversationApi, patientApi } from '@/lib/api';
import ImpactDetector, { ImpactDetectorHandle } from '@/components/ImpactDetector';
import Lenis from '@studio-freight/lenis';
import CarePlanLockedView from '@/components/payment/CarePlanLockedView';
import DummyPaymentGatewayModal from '@/components/payment/DummyPaymentGatewayModal';
import { demoPatientDashboard } from '@/lib/demo-data';
import {
  isAbhayPatientEmail,
  abhayPatientDashboardData,
  abhayMessages,
  abhayCheckinHistory,
  abhayWoundHistory,
  ABHAY_UID
} from '@/lib/abhay-demo-data';
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
  ai_advice?: string;
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
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [emergencyResult, setEmergencyResult] = useState<{ alert_id: string; maps_url: string; ambulances_notified: number } | null>(null);
  const [customLat, setCustomLat] = useState<string>('');
  const [customLng, setCustomLng] = useState<string>('');
  const [customLocationSaved, setCustomLocationSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const impactDetectorRef = useRef<ImpactDetectorHandle>(null);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [isPaid, setIsPaid] = useState<boolean>(false);
  // ===== Merged state declarations =====
  const [showImageChat, setShowImageChat] = useState(false);
  const [showDoctorChat, setShowDoctorChat] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [medsState, setMedsState] = useState<Record<string, boolean>>({});
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Lenis smooth scroll
  useEffect(() => {
    const lenis = new Lenis({ duration: 1.2, smoothWheel: true });
    const raf = (time: number) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    return () => lenis.destroy();
  }, []);

  const isAbhay = isAbhayPatientEmail(user?.email) || user?.unique_uid === ABHAY_UID;

  const fetchDashboard = async () => {
    if (isAbhay) {
      setData(abhayPatientDashboardData as any);
      setLoading(false);
      return;
    }

    try {
      const res = await api.get('/patient/dashboard');
      setData(res.data);
    } catch (err: any) {
      // Fallback demo data if backend is offline/unreachable
      setData({
        patient_id: demoPatientDashboard.user.id,
        full_name: demoPatientDashboard.user.name,
        unique_uid: demoPatientDashboard.user.patient_id,
        health_status: 'stable',
        active_course: {
          course_id: demoPatientDashboard.course.id,
          course_name: demoPatientDashboard.course.name,
          condition: 'Post-Surgery Recovery',
          doctor_name: demoPatientDashboard.course.doctor,
          start_date: demoPatientDashboard.course.startDate,
          end_date: demoPatientDashboard.course.endDate,
          progress_pct: demoPatientDashboard.course.progress,
          notes: null,
        },
        medications_today: demoPatientDashboard.course.medications.map((m, idx) => ({
          id: `m-${idx}`,
          name: m.name,
          dosage: m.dosage,
          frequency: m.frequency,
          time_of_day: 'Morning',
          instructions: null,
          taken: m.taken,
        })),
        last_check_in: '2 hours ago',
        unread_messages: 2,
        pending_question: null,
      } as any);
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async () => {
    if (isAbhay) {
      setMessages(abhayMessages as any);
      return;
    }
    try {
      const res = await api.get('/patient/messages');
      setMessages(res.data.messages || []);
    } catch { /* silent */ }
  };

  const fetchCheckinHistory = async () => {
    if (isAbhay) {
      setCheckinHistory(abhayCheckinHistory as any);
      return;
    }
    try {
      const res = await api.get('/patient/checkin-history');
      setCheckinHistory(res.data.history || []);
    } catch { /* optional – ignore */ }
  };

  const fetchWoundHistory = async () => {
    if (isAbhay) {
      setWoundHistory(abhayWoundHistory as any);
      return;
    }
    try {
      const res = await api.get('/patient/wound-history');
      setWoundHistory(res.data.wounds || []);
    } catch { /* optional */ }
  };

  const fetchNearbyAmbulances = async () => {
    if (isAbhay) {
      setNearbyVolunteers(2);
      return;
    }
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
      await fetchNearbyAmbulances();
    };
    fetchAll();

    const messagePollInterval = setInterval(() => {
      fetchMessages();
    }, 4000);
    return () => clearInterval(messagePollInterval);
  }, []);

  const activePatientId = data?.unique_uid || data?.patient_id || user?.patient_id || user?.id || 'CN-2024-0847';

  useEffect(() => {
    if (activePatientId) {
      const status = localStorage.getItem(`carenetra_payment_status_${activePatientId}`);
      setIsPaid(status === 'PAID');
    }
  }, [activePatientId]);

  const copyId = () => {
    navigator.clipboard.writeText(data?.unique_uid || '');
    setCopied(true);
    toast.success('Patient ID copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const openAgentChat = () => {
    window.dispatchEvent(new Event('carenetra:open-agent-chat'));
  };

  const handleSendPatientMessage = async () => {
    if (!chatInput.trim()) return;
    try {
      await patientApi.sendMessage(chatInput.trim());
      setChatInput('');
      fetchMessages();
      toast.success('Message sent');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to send message');
    }
  };

  const handleWoundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingWound(true);
    try {
      toast.info('Analyzing wound photo...');
      const res = await conversationApi.dashboardUploadWound(file);
      toast.success(res.data.ai_advice || res.data.summary || 'Wound analysis complete!');
      fetchDashboard();
      fetchWoundHistory();
      window.dispatchEvent(new CustomEvent('carenetra:open-agent-chat', { detail: res.data }));
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to upload photo');
    } finally {
      setUploadingWound(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleEmergency = async () => {
    setEmergencyLoading(true);
    setEmergencyResult(null);
    try {
      let lat: number | null = null;
      let lng: number | null = null;
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
          });
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      } catch {
        toast.error('Could not get GPS. Sending alert without exact location.');
      }

      const res = await api.post('/emergency/impact', {
        latitude: lat,
        longitude: lng,
        reported_by_name: data?.full_name || user?.name || 'CARENETRA User',
        reported_by_phone: data?.emergency_contact_phone || null,
        reported_by_user_id: user?.id || null,
      });

      setEmergencyResult({
        alert_id: res.data.alert_id,
        maps_url: res.data.maps_url,
        ambulances_notified: res.data.ambulances_notified,
      });
      toast.success(`Emergency alert sent! ${res.data.ambulances_notified} ambulance(s) notified.`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to send emergency alert. Please call emergency services.');
    } finally {
      setEmergencyLoading(false);
    }
  };

  const riskScoreData = useMemo(() => {
    if (!checkinHistory.length) return [];
    return checkinHistory.slice(-7).map(c => ({
      date: new Date(c.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      riskScore: c.risk_score ?? 0,
      tier: c.risk_tier || 'GREEN',
    }));
  }, [checkinHistory]);

  const MEDS_STATE_KEY = 'carenetra_meds_state';

  const loadMedsState = (): Record<string, boolean> => {
    try {
      const stored = localStorage.getItem(MEDS_STATE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  };

  const saveMedsState = (state: Record<string, boolean>) => {
    try {
      localStorage.setItem(MEDS_STATE_KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  };

  // Initialize medsState from localStorage first, then backend data
  useEffect(() => {
    if (data?.medications_today) {
      const stored = loadMedsState();
      const initial: Record<string, boolean> = {};
      data.medications_today.forEach(m => {
        initial[m.id] = stored[m.id] ?? (m.taken ?? false);
      });
      setMedsState(initial);
    }
  }, [data?.medications_today]);

  const toggleMedTaken = async (medId: string) => {
    const nowTaken = !medsState[medId];

    // Optimistically update local medsState
    setMedsState(prev => {
      const next = { ...prev, [medId]: nowTaken };
      saveMedsState(next);
      return next;
    });

    // Optimistically update data.medications_today
    if (data?.medications_today) {
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          medications_today: prev.medications_today.map(m =>
            m.id === medId ? { ...m, taken: nowTaken } : m
          )
        };
      });
    }

    try {
      await patientApi.toggleMedicationTaken(medId, nowTaken);
      const med = data?.medications_today.find(m => m.id === medId);
      toast.success(`${med?.name || 'Medication'} marked as ${nowTaken ? 'Taken ✓' : 'Not Taken'}`);
      window.dispatchEvent(new CustomEvent('carenetra:medication-toggled', { detail: { medId, taken: nowTaken } }));
    } catch {
      // Revert optimistic update
      setMedsState(prev => {
        const next = { ...prev, [medId]: !nowTaken };
        saveMedsState(next);
        return next;
      });
      if (data?.medications_today) {
        setData(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            medications_today: prev.medications_today.map(m =>
              m.id === medId ? { ...m, taken: !nowTaken } : m
            )
          };
        });
      }
      toast.error('Failed to update medication status');
    }
  };

  // Scroll chat to bottom
  useEffect(() => {
    if (showDoctorChat) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [showDoctorChat, messages]);

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

  // Check if Care Plan is locked (Unpaid)
  if (!isPaid && data.active_course) {
    const courseName = data.active_course.course_name || 'Post-Surgery Recovery Plan';
    const doctorName = data.active_course.doctor_name || 'Dr. Michael Chen';
    const startDate = data.active_course.start_date || '2024-12-01';
    const endDate = data.active_course.end_date || '2025-03-01';

    return (
      <DashboardLayout>
        <CarePlanLockedView
          courseName={courseName}
          doctorName={doctorName}
          startDate={startDate}
          endDate={endDate}
          amount={2499}
          onUnlockClick={() => setShowPaymentModal(true)}
        />
        <DummyPaymentGatewayModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          onSuccess={(txnId) => {
            localStorage.setItem(`carenetra_payment_status_${activePatientId}`, 'PAID');
            setIsPaid(true);
            setShowPaymentModal(false);
          }}
          courseName={courseName}
          doctorName={doctorName}
          amount={2499}
          patientId={activePatientId}
        />
      </DashboardLayout>
    );
  }

  const greeting = new Date().getHours() < 12 ? 'Good morning' :
                   new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening';

  const riskTier = data.risk_tier || 'GREEN';
  const riskScore = data.risk_score ?? 0;
  const riskConfig = getRiskConfig(riskTier);
  const RiskIcon = riskConfig.icon;

  const totalMeds = data.medications_today.length;
  const takenCount = data.medications_today.filter(m => medsState[m.id]).length;
  const missedCount = totalMeds - takenCount;
  const adherencePercent = totalMeds ? Math.round((takenCount / totalMeds) * 100) : 0;
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
              <button
                onClick={handleEmergency}
                disabled={emergencyLoading}
                className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-full bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20 transition-colors disabled:opacity-50"
              >
                {emergencyLoading ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
                {emergencyLoading ? 'Sending...' : 'Emergency'}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Emergency Alert Result */}
        {emergencyResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-3xl p-5 border-l-8 border-l-destructive"
          >
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider text-destructive font-semibold">Emergency Alert Sent</p>
                <p className="text-sm text-foreground mt-1">
                  {emergencyResult.ambulances_notified} ambulance{emergencyResult.ambulances_notified !== 1 ? 's' : ''} notified
                </p>
                <p className="text-xs text-muted-foreground mt-1">Alert ID: {emergencyResult.alert_id}</p>
              </div>
              {emergencyResult.maps_url && (
                <a
                  href={emergencyResult.maps_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <MapPin size={12} /> View Location
                </a>
              )}
            </div>
          </motion.div>
        )}

        {/* Test Location Override - Restricted to nidhi33@gmail.com */}
        {user?.email === 'nidhi33@gmail.com' && (
          <motion.div custom={1.5} variants={fadeUp} className="glass-card rounded-3xl p-5 border border-amber-500/30 bg-amber-500/5">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <MapPin size={16} className="text-amber-400" />
              Test Location Override
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              Manually set patient location for ambulance testing. This location will be used for emergency dispatch.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Latitude</label>
                <input
                  type="number"
                  step="any"
                  value={customLat}
                  onChange={(e) => setCustomLat(e.target.value)}
                  placeholder="e.g. 19.0760"
                  className="w-full bg-muted/50 border border-border rounded-xl py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Longitude</label>
                <input
                  type="number"
                  step="any"
                  value={customLng}
                  onChange={(e) => setCustomLng(e.target.value)}
                  placeholder="e.g. 72.8777"
                  className="w-full bg-muted/50 border border-border rounded-xl py-2 px-3 text-sm outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/50"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  if (!customLat || !customLng) {
                    toast.error('Enter both latitude and longitude');
                    return;
                  }
                  try {
                    await api.put('/patient/custom-location', {
                      latitude: parseFloat(customLat),
                      longitude: parseFloat(customLng),
                    });
                    toast.success('Custom location saved');
                    setCustomLocationSaved(true);
                    setTimeout(() => setCustomLocationSaved(false), 3000);
                  } catch (err: any) {
                    toast.error(err.response?.data?.detail || 'Failed to save location');
                  }
                }}
                className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition-colors font-medium"
              >
                Save Custom Location
              </button>
              <button
                onClick={async () => {
                  try {
                    await api.delete('/patient/custom-location');
                    setCustomLat('');
                    setCustomLng('');
                    toast.success('Custom location cleared');
                  } catch (err: any) {
                    toast.error(err.response?.data?.detail || 'Failed to clear location');
                  }
                }}
                className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-xl border border-border text-muted-foreground hover:bg-muted transition-colors"
              >
                Reset to Default
              </button>
            </div>
            {customLocationSaved && (
              <p className="text-xs text-amber-400 mt-2">Location saved successfully!</p>
            )}
          </motion.div>
        )}

        {/* Risk + AI Insight & Doctor Messages Row */}
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

          <motion.div custom={0.6} variants={fadeUp}
            className="glass-card rounded-3xl p-5 border border-border/50 cursor-pointer hover:border-primary/40 hover:scale-[1.01] transition-all"
            onClick={() => setShowDoctorChat(true)}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shrink-0">
                <MessageSquare size={18} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground">Doctor Messages</p>
                  {data.unread_messages > 0 && <span className="text-[10px] bg-primary text-white px-2 py-0.5 rounded-full animate-pulse">{data.unread_messages} new</span>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {messages.length > 0
                    ? `${(messages[messages.length - 1] as any).sender_type === 'patient' ? 'You' : messages[messages.length - 1].doctor_name}: ${messages[messages.length - 1].message}`
                    : 'No messages yet. Tap to open chat.'}
                </p>
                <p className="text-[10px] text-primary mt-1 flex items-center gap-1"><ChevronRight size={10} /> Tap to open chat</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* WhatsApp-Style Doctor Chat Modal */}
        {showDoctorChat && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowDoctorChat(false); }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              className="w-full max-w-lg h-[80vh] max-h-[600px] bg-background rounded-3xl border border-border shadow-2xl flex flex-col overflow-hidden"
            >
              {/* Chat Header */}
              <div className="flex items-center gap-3 p-4 border-b border-border bg-gradient-to-r from-emerald-500/10 to-teal-500/10">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm">Dr</div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">{messages.length > 0 ? (messages.find(m => m.doctor_name)?.doctor_name || messages[0].doctor_name) : 'Your Doctor'}</p>
                  <p className="text-[10px] text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"/> Online</p>
                </div>
                <button onClick={() => setShowDoctorChat(false)} className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground">✕</button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length > 0 ? (
                  messages.map(msg => {
                    const isPatient = (msg as any).sender_type === 'patient';
                    return (
                      <div key={msg.id} className={`flex flex-col ${isPatient ? 'items-end' : 'items-start'}`}>
                        <div className={`max-w-[80%] ${isPatient ? 'self-end' : 'self-start'}`}>
                          <div className={`rounded-2xl px-4 py-2.5 ${
                            isPatient
                              ? 'bg-primary text-primary-foreground rounded-tr-md'
                              : 'bg-muted/50 border border-border/50 rounded-tl-md'
                          }`}>
                            <p className={`text-xs font-medium mb-0.5 ${isPatient ? 'text-primary-foreground/80' : 'text-primary'}`}>
                              {isPatient ? 'You' : (msg.doctor_name || 'Your Doctor')}
                            </p>
                            <p className={`text-sm leading-relaxed ${isPatient ? 'text-primary-foreground' : 'text-foreground'}`}>
                              {msg.message}
                            </p>
                          </div>
                          <p className={`text-[10px] text-muted-foreground mt-1 ${isPatient ? 'mr-1 text-right' : 'ml-1'}`}>
                            {new Date(msg.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="flex items-center justify-center h-full text-center">
                    <div>
                      <MessageSquare size={40} className="mx-auto mb-3 text-muted-foreground/30" />
                      <p className="text-sm text-muted-foreground">No messages yet.</p>
                      <p className="text-xs text-muted-foreground mt-1">Your doctor's messages will appear here.</p>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input */}
              <div className="p-3 border-t border-border bg-muted/20">
                <div className="flex items-center gap-2">
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    placeholder="Type a message..."
                    className="flex-1 px-4 py-2.5 rounded-full bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30"
                    onKeyDown={e => {
                      if (e.key === 'Enter' && chatInput.trim()) {
                        handleSendPatientMessage();
                      }
                    }}
                  />
                  <button
                    onClick={handleSendPatientMessage}
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white hover:scale-105 transition-transform shrink-0"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* Upcoming Appointments — moved to upper section */}
        <motion.div custom={0.8} variants={fadeUp} className="glass-card rounded-3xl p-6">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Calendar size={18} className="text-cyan-400" /> Upcoming Appointments</h2>
          {appointments.length > 0 ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {appointments.map((apt, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 rounded-xl bg-muted/20 border border-border/30 hover:bg-muted/40 transition">
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

        {/* Quick Actions — always visible */}
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
                <p className="text-sm font-semibold text-foreground">Start Daily Check-in</p>
                <p className="text-xs text-muted-foreground">Talk to CARA – AI daily health check</p>
              </div>
            </div>
            <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
          </button>

          <button
            onClick={() => setShowImageChat(true)}
            className="w-full glass-card p-5 flex items-center justify-between hover:border-orange-400/40 transition-all group rounded-2xl hover:scale-[1.02]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-500 to-pink-500 flex items-center justify-center">
                <Camera size={16} className="text-white" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-foreground">Wound Analysis Chat</p>
                <p className="text-xs text-muted-foreground">Upload a wound photo for AI analysis & follow-up Q&A</p>
              </div>
            </div>
            <Upload size={18} className="text-muted-foreground group-hover:text-orange-400 transition-colors shrink-0" />
          </button>
          <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleWoundUpload} />
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
                <p className="text-xs text-muted-foreground mt-1">Share ID: <span className="font-mono bg-muted px-1 rounded">{data.unique_uid}</span> with your doctor.</p>
                <button onClick={openAgentChat} className="mt-4 text-xs text-primary underline">Start a general check-in</button>
              </div>
            )}
          </motion.div>

          <motion.div custom={3} variants={fadeUp} className="glass-card rounded-3xl p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Pill size={18} className="text-secondary" /> Today's Medications
              {totalMeds > 0 && <span className="ml-auto text-xs font-normal text-muted-foreground">{takenCount}/{totalMeds} taken</span>}
            </h2>
            {data.medications_today.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {data.medications_today.map(med => (
                  <div key={med.id} className="p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition">
                    <div className="flex justify-between items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{med.name}</p>
                        <p className="text-xs text-muted-foreground">{med.dosage} · {med.frequency}</p>
                        {med.time_of_day && <p className="text-xs text-muted-foreground/70 mt-1"><Clock size={10} className="inline mr-1" />{med.time_of_day}</p>}
                      </div>
                      <button
                        onClick={() => toggleMedTaken(med.id)}
                        className={`shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                          medsState[med.id]
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/30 hover:bg-amber-500/20'
                        }`}
                      >
                        {medsState[med.id] ? <><Check size={12} /> Taken</> : <><XCircle size={12} /> Not Taken</>}
                      </button>
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
            {totalMeds > 0 ? (
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
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Activity size={15} className="text-blue-400" /> Risk Score</h3>
            {riskScoreData.length > 0 ? (
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={riskScoreData}>
                    <defs><linearGradient id="riskGradPatient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={riskConfig.color} stopOpacity={0.3}/><stop offset="100%" stopColor={riskConfig.color} stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 8 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 8 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: 12, border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                    <Area type="monotone" dataKey="riskScore" stroke={riskConfig.color} fill="url(#riskGradPatient)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-center text-muted-foreground text-sm py-6">Complete check-ins to see risk score trend.</p>
            )}
          </motion.div>
        </div>

        {/* Risk History */}
        <motion.div custom={7} variants={fadeUp} className="glass-card rounded-3xl p-5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><History size={15} className="text-blue-400" /> Risk Score History</h3>
          {checkinHistory.length > 0 ? (
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={checkinHistory.slice(-7).map(c => ({ date: new Date(c.date).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' }), score: c.risk_score }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: 12, border: '1px solid hsl(var(--border))', color: 'hsl(var(--foreground))' }} />
                  <Area type="monotone" dataKey="score" stroke="#3b82f6" fill="url(#riskGradBlue)" />
                  <defs><linearGradient id="riskGradBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3}/><stop offset="100%" stopColor="#3b82f6" stopOpacity={0}/></linearGradient></defs>
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-center text-muted-foreground text-sm py-6">No check-in history yet.</p>
          )}
        </motion.div>

        {/* Care Team + Wound Analysis — two-column on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div custom={8} variants={fadeUp} className="glass-card rounded-3xl p-6">
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

          <motion.div custom={9} variants={fadeUp} className="glass-card rounded-3xl p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Camera size={18} className="text-orange-400" /> Wound Analysis</h2>
            {woundHistory.length > 0 ? (
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {woundHistory.map(w => (
                  <div key={w.id} className="flex items-center gap-3 p-2 rounded-xl bg-muted/20 hover:bg-muted/40 transition">
                    {w.thumbnail_url ? <img src={w.thumbnail_url} alt="wound" className="w-12 h-12 rounded-lg object-cover" /> : <div className="w-12 h-12 bg-muted rounded-lg flex items-center justify-center"><FileText size={20} /></div>}
                    <div className="flex-1">
                      <p className="text-sm font-medium">Severity: {w.score}/10 – {w.status}</p>
                      <p className="text-xs text-muted-foreground">{new Date(w.uploaded_at).toLocaleString()}</p>
                      {w.ai_advice && <p className="text-xs mt-1 text-muted-foreground/90 line-clamp-2">{w.ai_advice}</p>}
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
        </div>

        {/* Recent Check-ins + Safety Network — two-column on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <motion.div custom={10} variants={fadeUp} className="glass-card rounded-3xl p-5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Clock size={15} className="text-amber-400" /> Recent Check-ins</h3>
            {data.recent_check_ins && data.recent_check_ins.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto">
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

          <motion.div custom={11} variants={fadeUp} className="glass-card rounded-3xl p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2"><Shield size={18} className="text-blue-400" /> Safety Network</h2>
            <div className="space-y-4">
              {nearbyVolunteers !== null ? (
                <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30">
                  <div className="flex items-center gap-2"><MapPin size={16} className="text-primary" /><span className="text-sm">Nearby ambulances</span></div>
                  <span className="text-2xl font-bold text-primary">{nearbyVolunteers}</span>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Ambulance service available. In case of emergency, our network will be alerted.</p>
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

      </motion.div>

      {/* Wound Analysis Chat Modal */}
      <ImageChat open={showImageChat} onClose={() => setShowImageChat(false)} />

    </DashboardLayout>
  );
};

export default PatientDashboard;