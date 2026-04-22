import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, MapPin, CheckCircle, Loader2, Shield, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';

// Tuning constants
const IMPACT_THRESHOLD_MS2 = 25;     // m/s² — lower = more sensitive
const COUNTDOWN_SECONDS    = 15;
const COOLDOWN_MS          = 30_000;

interface Props {
  patientName:  string;
  patientPhone: string;
  userId:       string;
}

type ModalPhase = 'countdown' | 'locating' | 'alerting' | 'done';

const ImpactDetector = ({ patientName, patientPhone, userId }: Props) => {
  const [showModal, setShowModal]       = useState(false);
  const [modalPhase, setModalPhase]     = useState<ModalPhase>('countdown');
  const [countdown, setCountdown]       = useState(COUNTDOWN_SECONDS);
  const [alertId, setAlertId]           = useState<string | null>(null);
  const [mapsUrl, setMapsUrl]           = useState<string | null>(null);
  const [responderName, setResponderName] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [motionMonitoring, setMotionMonitoring] = useState(false);

  const inCooldown   = useRef(false);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef     = useRef<HTMLAudioElement | null>(null);

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio('/alert.mp3');
    audioRef.current.preload = 'auto';
    audioRef.current.loop = true; // Alarm should loop until dismissed

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (pollRef.current) clearInterval(pollRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const playAlertSound = () => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  };

  const stopAlertSound = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  }, []);

  // Request both motion and location permissions (iOS requires user gesture)
  const requestAllPermissions = useCallback(async () => {
    // Request location
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => {},
        () => toast.error('Location access denied. Alerts will not include GPS.'),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }

    // Request motion permission (iOS)
    if (typeof DeviceMotionEvent !== 'undefined') {
      if (typeof (DeviceMotionEvent as any).requestPermission === 'function') {
        try {
          const result = await (DeviceMotionEvent as any).requestPermission();
          const granted = result === 'granted';
          setPermissionGranted(granted);
          setMotionMonitoring(granted);
          if (granted) toast.success('Impact detection enabled');
        } catch {
          setPermissionGranted(false);
        }
      } else {
        // Android / desktop
        setPermissionGranted(true);
        setMotionMonitoring(true);
      }
    }
  }, []);

  // Motion listener
  useEffect(() => {
    if (!motionMonitoring || typeof DeviceMotionEvent === 'undefined') return;

    const handleMotion = (e: DeviceMotionEvent) => {
      if (inCooldown.current || showModal) return;
      const acc = e.accelerationIncludingGravity;
      if (!acc) return;
      const mag = Math.sqrt((acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2);
      if (mag > IMPACT_THRESHOLD_MS2) {
        triggerAlert();
      }
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [motionMonitoring, showModal]);

  const triggerAlert = useCallback(() => {
    if (inCooldown.current || showModal) return;
    playAlertSound();
    inCooldown.current = true;
    setShowModal(true);
    setModalPhase('countdown');
    setCountdown(COUNTDOWN_SECONDS);
    setAlertId(null);
    setMapsUrl(null);
    setResponderName(null);
  }, [showModal]);

  // Countdown timer
  useEffect(() => {
    if (!showModal || modalPhase !== 'countdown') return;

    countdownRef.current = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(countdownRef.current!);
          fireEmergency();
          return 0;
        }
        return c - 1;
      });
    }, 1000);

    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [showModal, modalPhase]);

  const fireEmergency = useCallback(async () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    setModalPhase('locating');

    let lat: number | null = null;
    let lng: number | null = null;
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 8000,
        });
      });
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      toast.error('Could not get GPS. Sending alert without exact location.');
    }

    setModalPhase('alerting');
    try {
      const res = await api.post('/emergency/impact', {
        latitude: lat,
        longitude: lng,
        reported_by_name: patientName || 'CARENETRA User',
        reported_by_phone: patientPhone || null,
        reported_by_user_id: userId || null,
      });
      setAlertId(res.data.alert_id);
      setMapsUrl(res.data.maps_url);
      setModalPhase('done');

      pollRef.current = setInterval(async () => {
        if (!res.data.alert_id) return;
        try {
          const statusRes = await api.get(`/emergency/${res.data.alert_id}`);
          if (statusRes.data.responder_name) {
            setResponderName(statusRes.data.responder_name);
            clearInterval(pollRef.current!);
          }
        } catch {}
      }, 5000);
    } catch (err: any) {
      toast.error('Failed to send emergency alert. Please call emergency services.');
      setModalPhase('done');
    }
  }, [patientName, patientPhone, userId]);

  const handleImOkay = useCallback(async () => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (pollRef.current) clearInterval(pollRef.current);
    stopAlertSound();

    if (alertId) {
      try {
        await api.post(`/emergency/${alertId}/resolve`);
      } catch {}
    }

    inCooldown.current = true; // Maintain cooldown after acknowledgment
    setShowModal(false);
    toast.success("Glad you're okay! Alert cancelled.");

    setTimeout(() => { inCooldown.current = false; }, COOLDOWN_MS);
  }, [alertId, stopAlertSound]);

  const handleINeedHelp = useCallback(() => {
    if (countdownRef.current) clearInterval(countdownRef.current);
    stopAlertSound();
    fireEmergency();
  }, [fireEmergency, stopAlertSound]);

  return (
    <>
      {/* Floating controls */}
      <div className="fixed bottom-6 left-4 z-40 flex flex-col gap-2 items-start">
        {!permissionGranted && (
          <button
            onClick={requestAllPermissions}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-muted/80 border border-border text-foreground hover:bg-muted backdrop-blur-sm"
          >
            <Shield size={12} /> Enable Impact Detection & Location
          </button>
        )}
        {permissionGranted && (
          <div className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 backdrop-blur-sm">
            <Shield size={12} /> Monitoring
          </div>
        )}
        <button
          onClick={triggerAlert}
          className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive hover:bg-destructive/20 backdrop-blur-sm"
        >
          <AlertTriangle size={12} /> Simulate Impact
        </button>
      </div>

      {/* Emergency Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm px-4"
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.85, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              className="w-full max-w-sm bg-card border border-border rounded-2xl overflow-hidden shadow-2xl"
            >
              {modalPhase === 'countdown' && (
                <div className="p-6 text-center space-y-5">
                  <motion.div
                    animate={{ scale: [1, 1.15, 1] }}
                    transition={{ repeat: Infinity, duration: 0.8 }}
                    className="w-16 h-16 rounded-full bg-destructive/15 flex items-center justify-center mx-auto"
                  >
                    <AlertTriangle size={32} className="text-destructive" />
                  </motion.div>

                  <div>
                    <h2 className="text-xl font-bold text-foreground">Impact Detected</h2>
                    <p className="text-sm text-muted-foreground mt-1">
                      Are you okay? We'll alert nearby help in
                    </p>
                  </div>

                  <div className="relative w-24 h-24 mx-auto">
                    <svg className="w-24 h-24 -rotate-90" viewBox="0 0 96 96">
                      <circle cx="48" cy="48" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
                      <motion.circle
                        cx="48" cy="48" r="40"
                        fill="none"
                        stroke="hsl(var(--destructive))"
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 40}`}
                        strokeDashoffset={`${2 * Math.PI * 40 * (1 - countdown / COUNTDOWN_SECONDS)}`}
                        transition={{ duration: 1, ease: 'linear' }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-3xl font-bold text-destructive">{countdown}</span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleImOkay}
                      className="flex-1 py-3 rounded-xl border border-border text-foreground font-medium text-sm hover:bg-muted transition-colors"
                    >
                      ✓ I'M OKAY
                    </button>
                    <button
                      onClick={handleINeedHelp}
                      className="flex-1 py-3 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm hover:opacity-90 transition-opacity"
                    >
                      🆘 NEED HELP
                    </button>
                  </div>
                </div>
              )}

              {modalPhase === 'locating' && (
                <div className="p-8 text-center space-y-4">
                  <MapPin size={40} className="text-primary mx-auto animate-bounce" />
                  <h2 className="text-lg font-semibold text-foreground">Getting your location...</h2>
                  <p className="text-sm text-muted-foreground">
                    Hold on — we're finding the best GPS signal
                  </p>
                </div>
              )}

              {modalPhase === 'alerting' && (
                <div className="p-8 text-center space-y-4">
                  <Loader2 size={40} className="text-destructive mx-auto animate-spin" />
                  <h2 className="text-lg font-semibold text-foreground">Alerting nearby volunteers...</h2>
                  <p className="text-sm text-muted-foreground">
                    Sending your location to registered volunteers and your doctor
                  </p>
                </div>
              )}

              {modalPhase === 'done' && (
                <div className="p-6 text-center space-y-4">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="w-16 h-16 rounded-full bg-emerald-500/15 flex items-center justify-center mx-auto"
                  >
                    <CheckCircle size={32} className="text-emerald-400" />
                  </motion.div>

                  <div>
                    <h2 className="text-xl font-bold text-foreground">Help is on the way</h2>
                    {responderName ? (
                      <p className="text-sm text-emerald-400 mt-1 font-medium">
                        ✓ {responderName} is responding to you
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">
                        Volunteers have been notified of your location
                      </p>
                    )}
                  </div>

                  {mapsUrl && (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 text-xs text-primary hover:underline"
                    >
                      <MapPin size={12} /> View your location on Maps
                    </a>
                  )}

                  {!responderName && (
                    <p className="text-xs text-muted-foreground animate-pulse">
                      Waiting for a volunteer to respond...
                    </p>
                  )}

                  <button
                    onClick={handleImOkay}
                    className="w-full py-2.5 rounded-xl border border-border text-foreground text-sm hover:bg-muted transition-colors"
                  >
                    I'm actually okay — cancel alert
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default ImpactDetector;