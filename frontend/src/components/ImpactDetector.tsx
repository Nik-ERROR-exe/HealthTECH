import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, AlertTriangle, Activity, Wifi, X } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';

// ====== CONSTANTS ======
const IMPACT_THRESHOLD = 20;
const FREE_FALL_THRESHOLD = 3;
const COOLDOWN_MS = 10000;

const ImpactDetector = ({ patientName, patientPhone, userId }: any) => {
  const { t } = useTranslation();
  const [sensorsEnabled, setSensorsEnabled] = useState(false);
  const [showEnableBtn, setShowEnableBtn] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const lastTriggerTime = useRef(0);
  const freeFallDetected = useRef(false);

  useEffect(() => {
    if (!window) return;
    if (typeof DeviceMotionEvent === "undefined") {
      toast.error("DeviceMotion not available");
      return;
    }
    setShowEnableBtn(true);
  }, []);

  const enableSensors = async () => {
    try {
      if (typeof (DeviceMotionEvent as any).requestPermission === "function") {
        const res = await (DeviceMotionEvent as any).requestPermission();
        if (res !== "granted") {
          toast.error("Motion permission denied");
          return;
        }
      }
      setSensorsEnabled(true);
      setShowEnableBtn(false);
      toast.success("Fall Detection active");
    } catch (e) {
      toast.error("Sensor activation failed");
    }
  };

  const disableSensors = () => {
    setSensorsEnabled(false);
    setShowEnableBtn(true);
    toast.info("Fall Detection disabled");
  };

  useEffect(() => {
    if (!sensorsEnabled || typeof DeviceMotionEvent === 'undefined') return;

    const handleMotion = (e: DeviceMotionEvent) => {
      const now = Date.now();
      if (now - lastTriggerTime.current < COOLDOWN_MS) return;

      let acc = e.acceleration;
      if (!acc || acc.x === null) {
        acc = e.accelerationIncludingGravity;
      }
      if (!acc) return;

      const x = acc.x ?? 0;
      const y = acc.y ?? 0;
      const z = acc.z ?? 0;
      const magnitude = Math.sqrt(x * x + y * y + z * z);

      if (magnitude < FREE_FALL_THRESHOLD) {
        freeFallDetected.current = true;
        return;
      }

      if (freeFallDetected.current && magnitude > IMPACT_THRESHOLD) {
        freeFallDetected.current = false;
        lastTriggerTime.current = now;
        triggerAlert();
      }
    };

    window.addEventListener("devicemotion", handleMotion);
    return () => window.removeEventListener("devicemotion", handleMotion);
  }, [sensorsEnabled]);

  const triggerAlert = useCallback(async () => {
    toast.error("Impact Detected!");

    let lat = null;
    let lng = null;
    try {
      const pos = await new Promise<GeolocationPosition>((res, rej) =>
        navigator.geolocation.getCurrentPosition(res, rej)
      );
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      toast.error('Could not get GPS. Sending alert without exact location.');
    }

    toast.info("Sending alert to emergency services...");
    try {
      await api.post('/emergency/impact', {
        latitude: lat,
        longitude: lng,
        reported_by_name: patientName || 'CARENETRA User',
        reported_by_phone: patientPhone || null,
        reported_by_user_id: userId || null,
      });
      toast.success("Emergency alert sent");
    } catch {
      toast.error("Failed to send alert");
    }
  }, [patientName, patientPhone, userId]);

  const statusColor = sensorsEnabled ? 'emerald-400' : 'muted-foreground';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="fixed bottom-4 left-4 sm:bottom-6 sm:left-6 z-50 flex flex-col items-start gap-2"
    >
      {/* Collapsed pill */}
      <motion.button
        onClick={() => setExpanded(!expanded)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.98 }}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-full backdrop-blur-xl border border-border/40 shadow-lg transition-all duration-300 ${sensorsEnabled ? 'bg-card/80 text-foreground' : 'bg-card/60 text-muted-foreground'}`}
      >
        <div className="relative">
          <Shield size={18} className={`text-${statusColor}`} />
          {sensorsEnabled && (
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          )}
        </div>
        <span className="text-xs font-medium">Fall Detection</span>
        <div className={`w-1.5 h-1.5 rounded-full bg-${statusColor}`} />
        <motion.span
          initial={false}
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
          className="text-muted-foreground text-[10px]"
        >
          {expanded ? '✕' : '›'}
        </motion.span>
      </motion.button>

      {/* Expanded card */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.25 }}
            className="w-[280px] sm:w-[320px] backdrop-blur-xl bg-card/70 border border-border/40 rounded-2xl shadow-xl p-4"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-lg ${sensorsEnabled ? 'bg-emerald-500/10 text-emerald-400' : 'bg-muted/30 text-muted-foreground'}`}>
                  <Shield size={16} />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">Fall Detection</h4>
                  <p className="text-[11px] text-muted-foreground">
                    {sensorsEnabled ? 'Monitoring Active' : 'Not Enabled'}
                  </p>
                </div>
              </div>
              <button onClick={() => setExpanded(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={14} />
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
              Automatically detects sudden falls and alerts emergency contacts.
            </p>

            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-foreground">
                {sensorsEnabled ? 'Enabled' : 'Disabled'}
              </span>
              <button
                onClick={() => {
                  if (sensorsEnabled) {
                    disableSensors();
                  } else {
                    enableSensors();
                  }
                }}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-primary/30 ${sensorsEnabled ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`}
                role="switch"
                aria-checked={sensorsEnabled}
              >
                <motion.span
                  layout
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm ${sensorsEnabled ? 'translate-x-[18px]' : 'translate-x-0.5'}`}
                />
              </button>
            </div>

            {sensorsEnabled && (
              <motion.button
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onClick={triggerAlert}
                className="w-full mt-1 py-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-medium hover:bg-rose-500/20 transition-colors flex items-center justify-center gap-1.5"
              >
                <AlertTriangle size={12} />
                Test SOS Alert
              </motion.button>
            )}

            {!sensorsEnabled && showEnableBtn && (
              <div className="mt-2 pt-2 border-t border-border/30">
                <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <AlertTriangle size={10} className="text-amber-400" />
                  Enable to receive automatic emergency alerts
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default ImpactDetector;