import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Copy, Check, Mic, Send, Upload, MessageSquare, Pill, Camera, ChevronRight, Activity, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import DashboardLayout from '@/components/DashboardLayout';
import { getUser } from '@/lib/auth';
import api from '@/lib/api';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4, ease: [0, 0, 0.2, 1] as const } }),
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

const PatientDashboard = () => {
  const user = getUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [checkinText, setCheckinText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchDashboard();
    fetchMessages();
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
    } catch {
      // Silent fail for messages
    }
  };

  const copyId = () => {
    navigator.clipboard.writeText(data?.unique_uid || '');
    setCopied(true);
    toast.success('Patient ID copied!');
    setTimeout(() => setCopied(false), 2000);
  };

  const submitCheckin = async () => {
    if (!checkinText.trim()) return;
    setSubmitting(true);
    try {
      const res = await api.post('/patient/checkin', {
        input_type: 'TEXT',
        raw_input: checkinText,
      });
      toast.success(`Check-in submitted! Risk tier: ${res.data.tier || 'Pending'}`);
      setCheckinText('');
      fetchDashboard(); // Refresh dashboard data
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Check-in failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleWoundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const res = await api.post('/patient/wound-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      toast.success(`Wound analyzed: ${res.data.severity} — ${res.data.summary}`);
      fetchDashboard();
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const checkinQuestions = [
    'How are you feeling today?',
    'Rate your pain level (1-10)',
    'Did you take all medications?',
    'Any new symptoms?',
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Loader2 className="animate-spin text-primary" size={32} />
        </div>
      </DashboardLayout>
    );
  }

  if (!data) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
          <p className="text-muted-foreground">Could not load dashboard data.</p>
          <button onClick={() => { setLoading(true); fetchDashboard(); }} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm">Retry</button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <motion.div initial="hidden" animate="visible" className="space-y-6">
        {/* Welcome */}
        <motion.div custom={0} variants={fadeUp} className="glass-card p-6 gradient-primary rounded-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-primary-foreground">Good morning, {data.full_name.split(' ')[0]}! 👋</h1>
              <p className="text-primary-foreground/80 text-sm mt-1">Health status: {data.health_status}</p>
            </div>
            <button onClick={copyId} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-background/20 text-primary-foreground text-sm font-mono hover:bg-background/30 transition-colors">
              {data.unique_uid} {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Active Course */}
          <motion.div custom={1} variants={fadeUp} className="lg:col-span-2 glass-card p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Activity size={18} className="text-primary" /> Active Course
            </h2>
            {data.active_course ? (
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-foreground">{data.active_course.course_name}</p>
                    <p className="text-sm text-muted-foreground">by {data.active_course.doctor_name}</p>
                  </div>
                  <span className="text-sm font-medium text-primary">{data.active_course.progress_pct}%</span>
                </div>
                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${data.active_course.progress_pct}%` }}
                    transition={{ duration: 1, ease: [0, 0, 0.2, 1] }}
                    className="h-full gradient-primary rounded-full"
                  />
                </div>
                <p className="text-xs text-muted-foreground">{data.active_course.start_date} → {data.active_course.end_date}</p>
                {data.active_course.notes && <p className="text-xs text-muted-foreground mt-1 italic">{data.active_course.notes}</p>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No active course assigned yet. Your doctor will assign one soon.</p>
            )}
          </motion.div>

          {/* Medication Tracker */}
          <motion.div custom={2} variants={fadeUp} className="glass-card p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Pill size={18} className="text-secondary" /> Medications
            </h2>
            <div className="space-y-3">
              {data.medications_today.length > 0 ? data.medications_today.map((med) => (
                <div key={med.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <div>
                    <p className="text-sm font-medium text-foreground">{med.name}</p>
                    <p className="text-xs text-muted-foreground">{med.dosage} · {med.frequency}</p>
                  </div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">No medications prescribed yet.</p>
              )}
            </div>
          </motion.div>
        </div>

        {/* Pending Agent Question */}
        {data.pending_question && (
          <motion.div custom={2.5} variants={fadeUp} className="glass-card p-6 border-l-4 border-primary">
            <h2 className="font-semibold text-foreground mb-2">Care Agent has a question</h2>
            <p className="text-sm text-muted-foreground mb-3">{data.pending_question.question}</p>
            {data.pending_question.options && (
              <div className="flex flex-wrap gap-2">
                {data.pending_question.options.map((opt) => (
                  <button
                    key={opt}
                    onClick={async () => {
                      try {
                        await api.post('/patient/checkin/agent-response', {
                          session_id: data.pending_question!.session_id,
                          response: opt,
                        });
                        toast.success('Response recorded');
                        fetchDashboard();
                      } catch {
                        toast.error('Failed to submit response');
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Daily Check-in */}
        <motion.div custom={3} variants={fadeUp} className="glass-card p-6">
          <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
            <MessageSquare size={18} className="text-primary" /> Daily Check-in
          </h2>
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-2">
              {checkinQuestions.map((q) => (
                <button key={q} onClick={() => setCheckinText(q)} className="text-left text-sm p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors text-foreground flex items-center gap-2">
                  <ChevronRight size={14} className="text-primary shrink-0" /> {q}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setRecording(!recording)}
                className={`p-3 rounded-lg transition-colors relative ${recording ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'}`}
              >
                <Mic size={18} />
                {recording && <span className="absolute inset-0 rounded-lg animate-pulse-ring bg-destructive/20" />}
              </button>
              <input
                value={checkinText}
                onChange={(e) => setCheckinText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && submitCheckin()}
                placeholder="Describe how you're feeling..."
                className="flex-1 px-4 py-2.5 rounded-lg bg-muted border border-border text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30"
              />
              <button onClick={submitCheckin} disabled={submitting} className="px-4 py-2.5 rounded-lg gradient-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>
          </div>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-6">
          {/* Wound Upload */}
          <motion.div custom={4} variants={fadeUp} className="glass-card p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <Camera size={18} className="text-warning" /> Wound Upload
            </h2>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleWoundUpload}
              className="hidden"
            />
            <div
              onClick={() => !uploading && fileInputRef.current?.click()}
              className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-primary/50 transition-colors cursor-pointer"
            >
              {uploading ? (
                <Loader2 size={32} className="mx-auto text-primary mb-3 animate-spin" />
              ) : (
                <Upload size={32} className="mx-auto text-muted-foreground mb-3" />
              )}
              <p className="text-sm text-muted-foreground">{uploading ? 'Analyzing wound photo...' : 'Click or drag to upload wound photo'}</p>
              <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP up to 10MB</p>
            </div>
          </motion.div>

          {/* Messages */}
          <motion.div custom={5} variants={fadeUp} className="glass-card p-6">
            <h2 className="font-semibold text-foreground mb-4 flex items-center gap-2">
              <MessageSquare size={18} className="text-primary" /> Doctor Messages
              {data.unread_messages > 0 && (
                <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full font-medium">{data.unread_messages} new</span>
              )}
            </h2>
            <div className="space-y-3">
              {messages.length > 0 ? messages.map((msg) => (
                <div key={msg.id} className="p-3 rounded-lg border border-border">
                  <div className="flex justify-between items-start">
                    <p className="text-sm font-medium text-foreground">{msg.doctor_name}</p>
                    <span className="text-xs text-muted-foreground">{new Date(msg.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{msg.message}</p>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground">No messages yet.</p>
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>
    </DashboardLayout>
  );
};

export default PatientDashboard;
