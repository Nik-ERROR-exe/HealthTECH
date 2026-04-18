import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Users, AlertTriangle, Search, Activity, TrendingUp, Clock, Pill, Loader2, Send } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import DashboardLayout from '@/components/DashboardLayout';
import EmergencyBanner from '@/components/EmergencyBanner';
import { toast } from 'sonner';
import api from '@/lib/api';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4, ease: [0, 0, 0.2, 1] as const } }),
};

const statusColor: Record<string, string> = {
  'Doing Well': 'bg-success/10 text-success',
  'Needs Attention': 'bg-warning/10 text-warning',
  'Monitor Closely': 'bg-warning/10 text-warning',
  'Doctor Has Been Notified': 'bg-destructive/10 text-destructive',
  'Emergency': 'bg-destructive/10 text-destructive',
  'Emergency — Help Is On The Way': 'bg-destructive/10 text-destructive',
};

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
  medications: Array<{ id: string; name: string; dosage: string; frequency: string; time_of_day: string | null; instructions: string | null }>;
  recent_wounds: Array<{ id: string; severity: string; summary: string; wound_score: number; image_url: string | null; created_at: string }>;
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

const DoctorDashboard = () => {
  const [dashData, setDashData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PatientDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [messageText, setMessageText] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    try {
      const res = await api.get('/doctor/dashboard');
      setDashData(res.data);
      setAlerts(res.data.active_alerts || []);
      // Auto-select first patient
      if (res.data.patients?.length > 0 && !selectedPatientId) {
        const firstId = res.data.patients[0].patient_id;
        setSelectedPatientId(firstId);
        fetchPatientDetail(firstId);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchPatientDetail = async (patientId: string) => {
    setDetailLoading(true);
    try {
      const res = await api.get(`/doctor/patient/${patientId}`);
      setDetail(res.data);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to load patient detail');
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSelectPatient = (patientId: string) => {
    setSelectedPatientId(patientId);
    fetchPatientDetail(patientId);
  };

  const handleDismissAlert = async (alertId: string) => {
    try {
      await api.post(`/doctor/dismiss-alert/${alertId}`);
      setAlerts(a => a.filter(x => x.alert_id !== alertId));
      toast.info('Alert dismissed');
    } catch {
      toast.error('Failed to dismiss alert');
    }
  };

  const handleDispatchAlert = async (alertId: string) => {
    try {
      await api.post(`/doctor/confirm-dispatch/${alertId}`);
      setAlerts(a => a.filter(x => x.alert_id !== alertId));
      toast.success('Emergency dispatch confirmed');
    } catch {
      toast.error('Failed to dispatch');
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedPatientId) return;
    setSendingMsg(true);
    try {
      await api.post('/doctor/message', {
        patient_id: selectedPatientId,
        message: messageText,
      });
      toast.success('Message sent');
      setMessageText('');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to send message');
    } finally {
      setSendingMsg(false);
    }
  };

  const filteredPatients = dashData?.patients?.filter(p =>
    p.full_name.toLowerCase().includes(search.toLowerCase()) || p.unique_uid.includes(search)
  ) || [];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      </DashboardLayout>
    );
  }

  if (!dashData) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <p className="text-muted-foreground">Could not load dashboard data.</p>
          <button onClick={() => { setLoading(true); fetchDashboard(); }} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm">Retry</button>
        </div>
      </DashboardLayout>
    );
  }

  // Prepare chart data from patient detail
  const chartData = detail?.score_history?.map((s) => ({
    date: new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    riskScore: s.score,
  })) || [];

  return (
    <>
      <EmergencyBanner
        alerts={alerts.map(a => ({
          id: a.alert_id,
          patient: a.patient_name,
          patient_id: a.patient_id,
          message: a.message,
          time: new Date(a.created_at).toLocaleTimeString(),
        }))}
        onDismiss={(id) => handleDismissAlert(id)}
        onDispatch={(id) => handleDispatchAlert(id)}
      />
      <DashboardLayout>
        <motion.div initial="hidden" animate="visible" className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Patients', value: dashData.total_patients.toString(), icon: Users, color: 'text-primary' },
              { label: 'Critical', value: dashData.critical_count.toString(), icon: AlertTriangle, color: 'text-destructive' },
              { label: 'High Risk', value: dashData.high_risk_count.toString(), icon: Activity, color: 'text-warning' },
              { label: 'Stable', value: dashData.stable_count.toString(), icon: TrendingUp, color: 'text-success' },
            ].map((stat, i) => (
              <motion.div key={stat.label} custom={i} variants={fadeUp} className="glass-card p-4">
                <div className="flex items-center justify-between mb-2">
                  <stat.icon size={18} className={stat.color} />
                  <span className="text-2xl font-bold text-foreground">{stat.value}</span>
                </div>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </motion.div>
            ))}
          </div>

          <div className="grid lg:grid-cols-5 gap-6">
            {/* Patient List */}
            <motion.div custom={4} variants={fadeUp} className="lg:col-span-2 glass-card p-4">
              <div className="flex items-center gap-2 mb-4">
                <h2 className="font-semibold text-foreground flex-1">Patients</h2>
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search..."
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-muted border border-border text-foreground text-xs placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30"
                  />
                </div>
              </div>
              <div className="space-y-1 max-h-[calc(100vh-320px)] overflow-y-auto">
                {filteredPatients.length > 0 ? filteredPatients.map((p) => (
                  <button
                    key={p.patient_id}
                    onClick={() => handleSelectPatient(p.patient_id)}
                    className={`w-full text-left flex items-center gap-3 p-3 rounded-lg transition-colors ${
                      selectedPatientId === p.patient_id ? 'bg-primary/10 border border-primary/20' : 'hover:bg-muted'
                    }`}
                  >
                    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-foreground">
                      {p.full_name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{p.full_name}</p>
                      <p className="text-[11px] text-muted-foreground">{p.condition_type?.replace(/_/g, ' ')}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor[p.health_status] || 'bg-muted text-muted-foreground'}`}>
                        {p.health_status}
                      </span>
                      {p.last_check_in && <span className="text-[10px] text-muted-foreground">{new Date(p.last_check_in).toLocaleDateString()}</span>}
                    </div>
                  </button>
                )) : (
                  <p className="text-sm text-muted-foreground text-center py-8">No patients found.</p>
                )}
              </div>
            </motion.div>

            {/* Patient Detail */}
            <motion.div custom={5} variants={fadeUp} className="lg:col-span-3 space-y-4">
              {detailLoading ? (
                <div className="glass-card p-5 flex items-center justify-center h-64">
                  <Loader2 className="animate-spin text-primary" size={24} />
                </div>
              ) : detail ? (
                <>
                  {/* Header */}
                  <div className="glass-card p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <h2 className="text-lg font-bold text-foreground">{detail.full_name}</h2>
                        <p className="text-sm text-muted-foreground">
                          {detail.course?.condition?.replace(/_/g, ' ')} · {detail.unique_uid}
                        </p>
                      </div>
                      <div className={`px-3 py-1.5 rounded-lg text-sm font-bold ${
                        (detail.latest_risk_score?.total_score ?? 0) >= 70 ? 'bg-destructive/10 text-destructive' :
                        (detail.latest_risk_score?.total_score ?? 0) >= 40 ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
                      }`}>
                        Risk: {detail.latest_risk_score?.total_score != null ? `${detail.latest_risk_score.total_score.toFixed(1)}/100` : 'N/A'}
                      </div>
                    </div>
                  </div>

                  {/* Risk Score Chart */}
                  {chartData.length > 0 && (
                    <div className="glass-card p-5">
                      <h3 className="text-sm font-semibold text-foreground mb-4">Risk Score Trend</h3>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                            <XAxis dataKey="date" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
                            <YAxis tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} domain={[0, 100]} />
                            <Tooltip
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
                            />
                            <Line type="monotone" dataKey="riskScore" stroke="#4A90E2" strokeWidth={2} dot={{ r: 3 }} name="Risk Score" />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Condition Metrics + Medications */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* Condition Metrics */}
                    <div className="glass-card p-5">
                      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Activity size={14} className="text-primary" /> Condition Metrics
                      </h3>
                      <div className="space-y-2">
                        {Object.entries(detail.condition_metrics || {}).map(([key, metric]) => (
                          <div key={key} className="flex items-center justify-between py-1">
                            <span className="text-xs text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                              metric.status === 'critical' ? 'bg-destructive/10 text-destructive' :
                              metric.status === 'warning' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'
                            }`}>{metric.value}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recent Activity */}
                    <div className="glass-card p-5">
                      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Clock size={14} className="text-primary" /> Recent Check-ins
                      </h3>
                      <div className="space-y-2.5">
                        {detail.recent_check_ins?.slice(0, 5).map((c) => (
                          <div key={c.check_in_id} className="flex gap-2.5 items-start">
                            <div className={`w-2 h-2 mt-1.5 rounded-full shrink-0 ${
                              c.tier === 'RED' || c.tier === 'EMERGENCY' ? 'bg-destructive' :
                              c.tier === 'ORANGE' || c.tier === 'YELLOW' ? 'bg-warning' : 'bg-success'
                            }`} />
                            <div>
                              <p className="text-xs text-foreground">{c.symptom_summary || `${c.input_type} check-in`}</p>
                              <p className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString()}</p>
                            </div>
                          </div>
                        ))}
                        {(!detail.recent_check_ins || detail.recent_check_ins.length === 0) && (
                          <p className="text-xs text-muted-foreground">No check-ins yet.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Medications */}
                  {detail.medications && detail.medications.length > 0 && (
                    <div className="glass-card p-5">
                      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
                        <Pill size={14} className="text-primary" /> Medications
                      </h3>
                      <div className="grid sm:grid-cols-2 gap-2">
                        {detail.medications.map((m) => (
                          <div key={m.id} className="p-2 rounded-lg bg-muted/50 text-sm">
                            <p className="font-medium text-foreground">{m.name} — {m.dosage}</p>
                            <p className="text-xs text-muted-foreground">{m.frequency}{m.time_of_day ? ` · ${m.time_of_day}` : ''}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Send Message */}
                  <div className="glass-card p-5">
                    <h3 className="text-sm font-semibold text-foreground mb-3">Send Message to Patient</h3>
                    <div className="flex gap-2">
                      <input
                        value={messageText}
                        onChange={(e) => setMessageText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                        placeholder="Type a message..."
                        className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30"
                      />
                      <button onClick={handleSendMessage} disabled={sendingMsg || !messageText.trim()} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5">
                        <Send size={14} /> Send
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="glass-card p-5 text-center py-16">
                  <p className="text-muted-foreground">Select a patient to view details</p>
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
