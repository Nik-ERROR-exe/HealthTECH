import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, MapPin, Clock, CheckCircle,
  Loader2, RefreshCw, Shield, ShieldOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import DashboardLayout from '@/components/DashboardLayout';
import { getUser } from '@/lib/auth';
import api from '@/lib/api';

const fadeUp = {
  hidden:   { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.35, ease: [0, 0, 0.2, 1] as const },
  }),
};

interface AlertItem {
  alert_id:        string;
  status:          'ACTIVE' | 'RESPONDING' | 'RESOLVED';
  reported_by:     string;
  location_label:  string;
  maps_url:        string | null;
  latitude:        number | null;
  longitude:       number | null;
  responder_name:  string | null;
  i_am_responding: boolean;
  responded_at:    string | null;
  created_at:      string;
  minutes_ago:     number;
}

interface DashboardData {
  volunteer_name: string;
  is_available:   boolean;
  area:           string | null;
  active_alerts:  AlertItem[];
  alert_count:    number;
}

const VolunteerDashboard = () => {
  const user = getUser();
  const { t, i18n } = useTranslation();
  const [data, setData]           = useState<DashboardData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [responding, setResponding] = useState<string | null>(null); // alert_id being responded to
  const [toggling, setToggling]   = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDashboard = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const currentLang = i18n.resolvedLanguage || i18n.language || 'en';
      const langCode = currentLang.split('-')[0];
      const res = await api.get('/volunteer/dashboard', { params: { language: langCode } });
      setData(res.data);
      setLastRefresh(new Date());
    } catch (err: any) {
      if (!silent) toast.error(err.response?.data?.detail || 'Failed to load dashboard');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  // Auto-refresh every 10 seconds
  useEffect(() => {
    fetchDashboard();
    pollRef.current = setInterval(() => fetchDashboard(true), 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Volunteer location heartbeat
  useEffect(() => {
    let heartbeatInterval: ReturnType<typeof setInterval>;

    const sendHeartbeat = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          api.post('/volunteer/heartbeat', {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          }).catch(() => {});
        },
        () => {}, // ignore error
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 60000 }
      );
    };

    // Send immediately, then every 30 seconds
    sendHeartbeat();
    heartbeatInterval = setInterval(sendHeartbeat, 30_000);

    return () => clearInterval(heartbeatInterval);
  }, []);

  const handleRespond = async (alertId: string) => {
    setResponding(alertId);
    try {
      const res = await api.post(`/volunteer/alerts/${alertId}/respond`);
      toast.success(res.data.message);
      // Open maps immediately so volunteer can navigate
      const alert = data?.active_alerts.find(a => a.alert_id === alertId);
      if (alert?.maps_url) {
        window.open(alert.maps_url, '_blank');
      }
      await fetchDashboard(true);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to respond');
    } finally {
      setResponding(null);
    }
  };

  const handleToggleAvailability = async () => {
    setToggling(true);
    try {
      const res = await api.put('/volunteer/availability');
      setData(prev => prev ? { ...prev, is_available: res.data.is_available } : null);
      toast.success(res.data.message);
    } catch {
      toast.error('Failed to update availability');
    } finally {
      setToggling(false);
    }
  };

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
          <p className="text-muted-foreground">{t('volunteerDashboard.loadError')}</p>
          <button onClick={() => fetchDashboard()} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm">
            {t('common.retry')}
          </button>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <motion.div initial="hidden" animate="visible" className="space-y-6 max-w-2xl mx-auto">

        {/* Header */}
        <motion.div custom={0} variants={fadeUp} className="glass-card p-5 gradient-primary rounded-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-primary-foreground">
                {t('volunteerDashboard.title')}
              </h1>
              <p className="text-primary-foreground/80 text-sm mt-0.5">
                {data.volunteer_name}
                {data.area ? ` · ${data.area}` : ''}
              </p>
            </div>
            <button
              onClick={handleToggleAvailability}
              disabled={toggling}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl font-medium transition-all ${
                data.is_available
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30'
                  : 'bg-white/10 text-primary-foreground/60 border border-white/20 hover:bg-white/20'
              }`}
            >
              {toggling ? <Loader2 size={11} className="animate-spin" /> :
               data.is_available ? <Shield size={11} /> : <ShieldOff size={11} />}
              {data.is_available ? t('volunteerDashboard.available') : t('volunteerDashboard.offDuty')}
            </button>
          </div>
        </motion.div>

        {/* Refresh indicator */}
        <motion.div custom={1} variants={fadeUp} className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            {data.alert_count === 0
              ? t('volunteerDashboard.noActiveAlerts')
              : data.alert_count === 1 
                ? t('volunteerDashboard.activeAlerts', { count: 1 })
                : t('volunteerDashboard.activeAlertsPlural', { count: data.alert_count })
            }
          </p>
          <button
            onClick={() => fetchDashboard(true)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw size={11} />
            {lastRefresh.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </button>
        </motion.div>

        {/* Alert cards */}
        <AnimatePresence>
          {data.active_alerts.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass-card p-10 text-center"
            >
              <CheckCircle size={40} className="text-emerald-400/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">{t('volunteerDashboard.noEmergencyAlerts')}</p>
              <p className="text-xs text-muted-foreground mt-1">{t('volunteerDashboard.refreshesAutomatically')}</p>
            </motion.div>
          ) : (
            data.active_alerts.map((alert, i) => (
              <motion.div
                key={alert.alert_id}
                custom={i + 2}
                variants={fadeUp}
                layout
                className={`glass-card overflow-hidden border-l-4 ${
                  alert.status === 'RESPONDING'
                    ? 'border-l-emerald-500'
                    : 'border-l-destructive'
                }`}
              >
                {/* Status bar */}
                <div className={`px-4 py-2 text-xs font-medium flex items-center gap-2 ${
                  alert.status === 'RESPONDING'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-destructive/10 text-destructive'
                }`}>
                  {alert.status === 'RESPONDING' ? (
                    <><CheckCircle size={11} /> {t('volunteerDashboard.volunteerResponding')}</>
                  ) : (
                    <><motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}><AlertTriangle size={11} /></motion.span> {alert.minutes_ago < 1 ? t('volunteerDashboard.needsHelpNow') : t('volunteerDashboard.needsHelpAgo', { minutes: alert.minutes_ago })}</>
                  )}
                </div>

                <div className="p-5 space-y-4">
                  {/* Patient info */}
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                      <AlertTriangle size={18} className="text-destructive" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground">{alert.reported_by}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <MapPin size={11} className="text-muted-foreground shrink-0" />
                        <p className="text-xs text-muted-foreground truncate">{alert.location_label}</p>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Clock size={11} className="text-muted-foreground shrink-0" />
                        <p className="text-xs text-muted-foreground">
                          {new Date(alert.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Responder info */}
                  {alert.status === 'RESPONDING' && alert.responder_name && (
                    <div className="bg-emerald-500/10 rounded-lg px-3 py-2 text-xs text-emerald-400">
                      {alert.i_am_responding
                        ? t('volunteerDashboard.youAreResponding')
                        : t('volunteerDashboard.otherIsResponding', { name: alert.responder_name })}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    {alert.maps_url && (
                      <a
                        href={alert.maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-xl border border-border text-foreground hover:bg-muted transition-colors flex-1 justify-center font-medium"
                      >
                        <MapPin size={13} /> {t('volunteerDashboard.openInMaps')}
                      </a>
                    )}

                    {!alert.i_am_responding && (
                      <button
                        onClick={() => handleRespond(alert.alert_id)}
                        disabled={responding === alert.alert_id}
                        className="flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex-1 justify-center font-semibold transition-opacity"
                      >
                        {responding === alert.alert_id
                          ? <><Loader2 size={13} className="animate-spin" /> {t('volunteerDashboard.confirming')}</>
                          : <>🏃 {t('volunteerDashboard.imResponding')}</>}
                      </button>
                    )}

                    {alert.i_am_responding && (
                      <div className="flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 flex-1 justify-center font-medium border border-emerald-500/20">
                        <CheckCircle size={13} /> {t('volunteerDashboard.youAreOnTheWay')}
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>

        {/* How it works */}
        <motion.div custom={99} variants={fadeUp} className="glass-card p-5">
          <h3 className="text-sm font-semibold text-foreground mb-3">{t('volunteerDashboard.howItWorks')}</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>{t('volunteerDashboard.hwStep1')}</p>
            <p>{t('volunteerDashboard.hwStep2')}</p>
            <p>{t('volunteerDashboard.hwStep3')}</p>
            <p>{t('volunteerDashboard.hwStep4')}</p>
          </div>
        </motion.div>

      </motion.div>
    </DashboardLayout>
  );
};

export default VolunteerDashboard;