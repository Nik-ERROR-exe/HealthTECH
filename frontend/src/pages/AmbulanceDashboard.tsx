import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertTriangle, MapPin, Clock, CheckCircle,
  Loader2, RefreshCw, Shield, ShieldOff,
  Timer, Ambulance as AmbulanceIcon, Hospital,
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
  status:          'ACTIVE' | 'RESPONDING' | 'EN_ROUTE' | 'RESOLVED';
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
  time_remaining:  number | null;
}

interface DashboardData {
  ambulance_name: string;
  driver_name:    string;
  hospital_name:  string | null;
  is_available:   boolean;
  current_status: string;
  active_alerts:  AlertItem[];
  alert_count:    number;
}

const AmbulanceDashboard = () => {
  const user = getUser();
  const { t, i18n } = useTranslation();
  const [data, setData]           = useState<DashboardData | null>(null);
  const [loading, setLoading]     = useState(true);
  const [responding, setResponding] = useState<string | null>(null);
  const [enRouting, setEnRouting] = useState<string | null>(null);
  const [toggling, setToggling]   = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [localTimers, setLocalTimers] = useState<Record<string, number>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchDashboard = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const currentLang = i18n.resolvedLanguage || i18n.language || 'en';
      const langCode = currentLang.split('-')[0];
      const res = await api.get('/ambulance/dashboard', { params: { language: langCode } });
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

  // Local countdown timer for smoother UX (updates every second)
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setLocalTimers(prev => {
        const next = { ...prev };
        for (const key of Object.keys(next)) {
          if (next[key] > 0) next[key] = next[key] - 1;
        }
        return next;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  // WebSocket real-time broadcast listener
  useEffect(() => {
    if (!user?.id) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const wsUrl = `${protocol}//${host}:8000/ws/ambulance/${user.id}`;
    
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connectWs = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          console.log("[WebSocket] Connected to ambulance alert stream");
        };
        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            console.log("[WebSocket] Event received:", msg);

            if (msg.type === 'AMBULANCE_STUCK_TIMEOUT') {
              toast.error(`🚨 ${msg.message} Emergency bidding reopened!`, { duration: 7000 });
              fetchDashboard(true);
            } else if (msg.type === 'YOU_ARE_STUCK') {
              toast.error(`⚠️ ${msg.message}`, { duration: 9000 });
              fetchDashboard(true);
            } else if (['ALERT_RESPONDED', 'ALERT_EN_ROUTE', 'ALERT_REOPENED'].includes(msg.type)) {
              fetchDashboard(true);
            }
          } catch (e) {
            console.error("[WebSocket] Message parse error:", e);
          }
        };
        ws.onclose = () => {
          reconnectTimeout = setTimeout(connectWs, 3000);
        };
      } catch (err) {
        console.error("[WebSocket] Connection error:", err);
      }
    };

    connectWs();

    return () => {
      if (ws) ws.close();
      clearTimeout(reconnectTimeout);
    };
  }, [user?.id]);

  // Sync local timers with server data
  useEffect(() => {
    if (!data) return;
    const timers: Record<string, number> = {};
    for (const alert of data.active_alerts) {
      if (alert.i_am_responding && alert.time_remaining && alert.time_remaining > 0) {
        timers[alert.alert_id] = alert.time_remaining;
      }
    }
    setLocalTimers(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (!(key in timers)) delete next[key];
      }
      for (const [key, value] of Object.entries(timers)) {
        if (!(key in next) || Math.abs(next[key] - value) > 2) {
          next[key] = value;
        }
      }
      return next;
    });
  }, [data]);

  // General ambulance location heartbeat (every 20s)
  useEffect(() => {
    let heartbeatInterval: ReturnType<typeof setInterval>;

    const sendHeartbeat = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          api.post('/ambulance/heartbeat', {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          }).catch(() => {});
        },
        () => {},
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    };

    sendHeartbeat();
    heartbeatInterval = setInterval(sendHeartbeat, 20_000);

    return () => clearInterval(heartbeatInterval);
  }, []);

  // High-accuracy live GPS watch during 2-minute response window
  useEffect(() => {
    const hasActiveResponse = data?.active_alerts.some(a => a.i_am_responding);
    if (!hasActiveResponse || !navigator.geolocation) return;

    console.log("[GPS Tracking] Active response detected — watching GPS location...");
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        api.post('/ambulance/heartbeat', {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        }).catch(() => {});
      },
      (err) => console.warn("[GPS Tracking] Watch error:", err),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [data?.active_alerts]);

  const handleRespond = async (alertId: string) => {
    setResponding(alertId);
    try {
      let lat: number | undefined;
      let lng: number | undefined;

      if (navigator.geolocation) {
        await new Promise<void>((resolve) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              lat = pos.coords.latitude;
              lng = pos.coords.longitude;
              resolve();
            },
            () => resolve(),
            { enableHighAccuracy: true, timeout: 4000, maximumAge: 0 }
          );
        });
      }

      const res = await api.post(`/ambulance/alerts/${alertId}/respond`, {
        latitude: lat,
        longitude: lng,
      });
      toast.success(res.data.message);
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

  const handleEnRoute = async (alertId: string) => {
    setEnRouting(alertId);
    try {
      const res = await api.post(`/ambulance/alerts/${alertId}/en-route`);
      toast.success(res.data.message);
      await fetchDashboard(true);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to mark as en route');
    } finally {
      setEnRouting(null);
    }
  };

  const handleToggleAvailability = async () => {
    setToggling(true);
    try {
      const res = await api.put('/ambulance/availability');
      setData(prev => prev ? { ...prev, is_available: res.data.is_available, current_status: res.data.current_status } : null);
      toast.success(res.data.message);
    } catch {
      toast.error('Failed to update availability');
    } finally {
      setToggling(false);
    }
  };

  const formatTimeRemaining = (seconds: number | null) => {
    if (seconds === null || seconds === undefined) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
          <p className="text-muted-foreground">Failed to load ambulance dashboard.</p>
          <button onClick={() => fetchDashboard()} className="px-4 py-2 rounded-lg gradient-primary text-primary-foreground text-sm">
            Retry
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
                Ambulance Dashboard
              </h1>
              <p className="text-primary-foreground/80 text-sm mt-0.5">
                {data.ambulance_name}
                {data.driver_name ? ` · Driver: ${data.driver_name}` : ''}
                {data.hospital_name ? ` · ${data.hospital_name}` : ''}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`text-xs px-2 py-1 rounded-full ${
                  data.current_status === 'available' ? 'bg-emerald-500/20 text-emerald-300' :
                  data.current_status === 'responding' ? 'bg-amber-500/20 text-amber-300' :
                  data.current_status === 'en_route' ? 'bg-blue-500/20 text-blue-300' :
                  'bg-gray-500/20 text-gray-300'
                }`}>
                  {data.current_status.toUpperCase()}
                </span>
              </div>
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
              {data.is_available ? 'Available' : 'Off Duty'}
            </button>
          </div>
        </motion.div>

        {/* Refresh indicator */}
        <motion.div custom={1} variants={fadeUp} className="flex items-center justify-between px-1">
          <p className="text-xs text-muted-foreground">
            {data.alert_count === 0
              ? 'No active emergency alerts'
              : `${data.alert_count} active alert${data.alert_count !== 1 ? 's' : ''}`
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
              <p className="text-muted-foreground text-sm">No emergency alerts in your area.</p>
              <p className="text-xs text-muted-foreground mt-1">Dashboard connects to live WebSocket stream.</p>
            </motion.div>
          ) : (
            data.active_alerts.map((alert, i) => (
              <motion.div
                key={alert.alert_id}
                custom={i + 2}
                variants={fadeUp}
                layout
                className={`glass-card overflow-hidden border-l-4 ${
                  alert.status === 'EN_ROUTE'
                    ? 'border-l-blue-500'
                    : alert.status === 'RESPONDING'
                    ? 'border-l-amber-500'
                    : 'border-l-destructive'
                }`}
              >
                {/* Status bar */}
                <div className={`px-4 py-2 text-xs font-medium flex items-center gap-2 ${
                  alert.status === 'EN_ROUTE'
                    ? 'bg-blue-500/10 text-blue-400'
                    : alert.status === 'RESPONDING'
                    ? 'bg-amber-500/10 text-amber-400'
                    : 'bg-destructive/10 text-destructive'
                }`}>
                  {alert.status === 'EN_ROUTE' ? (
                    <><AmbulanceIcon size={11} /> Ambulance is en route to patient</>
                  ) : alert.status === 'RESPONDING' && alert.i_am_responding ? (
                    <><CheckCircle size={11} /> You claimed response — move forward to verify en-route status</>
                  ) : alert.status === 'RESPONDING' ? (
                    <><CheckCircle size={11} /> {alert.responder_name} is responding (tracking movement)</>
                  ) : (
                    <><motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}><AlertTriangle size={11} /></motion.span> {alert.minutes_ago < 1 ? 'Emergency — open for ambulance bidding' : `Emergency — ${alert.minutes_ago} min ago`}</>
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

                  {/* Responder info / 2-Minute Timeout warning */}
                  {alert.status === 'RESPONDING' && alert.i_am_responding && (() => {
                    const remaining = localTimers[alert.alert_id] ?? alert.time_remaining ?? 0;
                    if (remaining > 0) {
                      return (
                        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2.5 text-xs text-amber-300 space-y-1">
                          <div className="flex items-center justify-between font-semibold">
                            <span className="flex items-center gap-1.5">
                              <Timer size={13} className="animate-pulse text-amber-400" /> 2-Minute Verification Countdown:
                            </span>
                            <span className="font-mono text-sm px-2 py-0.5 rounded bg-amber-500/20 text-amber-200">
                              {formatTimeRemaining(remaining)}
                            </span>
                          </div>
                          <p className="text-[11px] text-amber-300/80">
                            Move forward (GPS location change) or tap "On The Way". If stationary for 2 mins, bidding reopens to others.
                          </p>
                        </div>
                      );
                    }
                    return (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400 flex items-center gap-2">
                        <AlertTriangle size={13} />
                        Location stuck / 2-minute window expired. Re-open bidding if available.
                      </div>
                    );
                  })()}

                  {alert.status === 'RESPONDING' && !alert.i_am_responding && alert.responder_name && (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2 text-xs text-blue-300 flex items-center justify-between">
                      <span>{alert.responder_name} is currently responding</span>
                      <span className="text-[11px] text-blue-400">Checking GPS movement...</span>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    {/* Always show Open Maps for all ambulances */}
                    {alert.maps_url && (
                      <a
                        href={alert.maps_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-xl border border-border text-foreground hover:bg-muted transition-colors flex-1 justify-center font-medium"
                      >
                        <MapPin size={13} /> Open in Maps
                      </a>
                    )}

                    {/* Enable I'm Responding for all ambulances if alert is ACTIVE */}
                    {alert.status === 'ACTIVE' && (
                      <button
                        onClick={() => handleRespond(alert.alert_id)}
                        disabled={responding === alert.alert_id}
                        className="flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-xl gradient-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 flex-1 justify-center font-semibold transition-opacity"
                      >
                        {responding === alert.alert_id
                          ? <><Loader2 size={13} className="animate-spin" /> Responding...</>
                          : <><AmbulanceIcon size={13} /> I'm Responding</>}
                      </button>
                    )}

                    {alert.i_am_responding && alert.status === 'RESPONDING' && (
                      <button
                        onClick={() => handleEnRoute(alert.alert_id)}
                        disabled={enRouting === alert.alert_id}
                        className="flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-xl bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 flex-1 justify-center font-semibold transition-opacity"
                      >
                        {enRouting === alert.alert_id
                          ? <><Loader2 size={13} className="animate-spin" /> Updating...</>
                          : <><AmbulanceIcon size={13} /> On The Way</>}
                      </button>
                    )}

                    {alert.status === 'EN_ROUTE' && (
                      <div className="flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-xl bg-blue-500/10 text-blue-400 flex-1 justify-center font-medium border border-blue-500/20">
                        <AmbulanceIcon size={13} /> En Route to Patient
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
          <h3 className="text-sm font-semibold text-foreground mb-3">How Emergency Bidding & GPS Tracking Works</h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>1. Patient clicks Emergency → all ambulances receive alert & "Open in Maps".</p>
            <p>2. Ambulance clicks "I'm Responding" → 2-minute GPS verification timer starts.</p>
            <p>3. System tracks ambulance GPS location during these 2 minutes.</p>
            <p>4. If moving forward → automatically verified as En Route.</p>
            <p>5. If stuck (no movement for 2 mins) → auto-fails & re-opens bidding to ALL other ambulances.</p>
          </div>
        </motion.div>

      </motion.div>
    </DashboardLayout>
  );
};

export default AmbulanceDashboard;
