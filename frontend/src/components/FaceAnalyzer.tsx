import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as faceapi from 'face-api.js';

interface FaceAnalyzerProps {
  onDistressChange: (score: number, emotion: string) => void;
  enabled: boolean;
  /** When the AI Nurse asks the patient to show an affected area (photo question). */
  scanMode?: boolean;
}

const HUD_GREEN = '#00FF66';

// ── Canvas drawing helpers (sci-fi HUD) ─────────────────────────────────────

const drawCorneredBox = (
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
) => {
  const l = Math.min(18, w * 0.15); // corner bracket length
  ctx.save();
  ctx.strokeStyle = HUD_GREEN;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = HUD_GREEN;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(x, y + l); ctx.lineTo(x, y); ctx.lineTo(x + l, y);
  ctx.moveTo(x + w - l, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + l);
  ctx.moveTo(x + w, y + h - l); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - l, y + h);
  ctx.moveTo(x + l, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - l);
  ctx.stroke();
  ctx.restore();
};

const drawHudTag = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number) => {
  ctx.save();
  ctx.font = 'bold 11px "Courier New", monospace';
  const w = ctx.measureText(text).width;
  const padX = 6, hh = 18;
  const bx = x, by = y - hh - 2;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(bx, by, w + padX * 2, hh);
  ctx.strokeStyle = HUD_GREEN;
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, w + padX * 2, hh);
  ctx.fillStyle = HUD_GREEN;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx + padX, by + hh / 2 + 1);
  ctx.restore();
};

const faceLabel = (expressions: Record<string, number>): string => {
  let maxExpr = 'neutral', maxVal = 0;
  Object.entries(expressions).forEach(([em, val]) => {
    if (val > maxVal) { maxVal = val; maxExpr = em; }
  });
  if (['sad', 'fearful', 'angry', 'disgusted'].includes(maxExpr) && maxVal > 0.4) return 'STRESSED';
  if (maxExpr === 'happy' && maxVal > 0.4) return 'SMILING';
  return 'NEUTRAL';
};

const FaceAnalyzer: React.FC<FaceAnalyzerProps> = ({
  onDistressChange, enabled, scanMode = false,
}) => {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const scanAnimRef = useRef<number | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [clock, setClock] = useState('');

  // Live clock for the HUD
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString('en-GB', { hour12: false }));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Load face-api models (local + CDN fallback)
  useEffect(() => {
    let mounted = true;
    const loadModels = async () => {
      const cdnBase = 'https://justadudewhohacks.github.io/face-api.js/models';
      try {
        await faceapi.nets.tinyFaceDetector.loadFromUri('/models');
        await faceapi.nets.faceExpressionNet.loadFromUri('/models');
        if (mounted) setModelsLoaded(true);
        console.log('✅ Face models loaded (local)');
      } catch {
        try {
          await faceapi.nets.tinyFaceDetector.loadFromUri(cdnBase);
          await faceapi.nets.faceExpressionNet.loadFromUri(cdnBase);
          if (mounted) setModelsLoaded(true);
          console.log('✅ Face models loaded (CDN)');
        } catch (err) {
          console.error('❌ Face models failed', err);
          if (mounted) {
            setError('Failed to load face analysis models');
            setSimulated(true); // fall back to the simulated HUD
          }
        }
      }
    };
    loadModels();
    return () => { mounted = false; };
  }, []);

  // Start/stop camera when enabled & models ready
  useEffect(() => {
    if (!enabled || !modelsLoaded) {
      stopCamera();
      return;
    }
    startCamera();
    return () => stopCamera();
  }, [enabled, modelsLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  const startCamera = async () => {
    if (streamRef.current) return;
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setCameraReady(true);
          setSimulated(false);
          startDetectionLoop();
        };
        videoRef.current.onerror = () => setError('Video playback error');
      }
    } catch (err: any) {
      console.error('Camera error:', err);
      let msg = 'Camera unavailable. ';
      if (err.name === 'NotReadableError') msg += 'Another app is using it. Close other apps (Teams, Zoom, browser tabs).';
      else if (err.name === 'NotAllowedError') msg += 'Permission denied. Allow camera access.';
      else msg += 'Unknown error.';
      setError(msg);
      setSimulated(true); // keep the demo looking alive with the simulated HUD
    }
  };

  const stopCamera = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (scanAnimRef.current) cancelAnimationFrame(scanAnimRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  };

  // Smooth scan overlay loop (reticle + sweeping laser) — runs independently
  // of the (slower) face-detection loop so the laser stays fluid.
  useEffect(() => {
    if (!enabled || !cameraReady) return;
    const drawScan = (time: number) => {
      const canvas = scanCanvasRef.current;
      const video = videoRef.current;
      if (canvas && video && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (scanMode) {
            const cw = canvas.width, ch = canvas.height;
            const boxW = cw * 0.55, boxH = boxW;
            const x = (cw - boxW) / 2, y = (ch - boxH) / 2;
            drawCorneredBox(ctx, x, y, boxW, boxH);

            // crosshair lines
            ctx.save();
            ctx.strokeStyle = HUD_GREEN;
            ctx.lineWidth = 1;
            ctx.globalAlpha = 0.45;
            ctx.beginPath();
            ctx.moveTo(cw / 2, y - 14); ctx.lineTo(cw / 2, y + boxH + 14);
            ctx.moveTo(x - 14, ch / 2); ctx.lineTo(x + boxW + 14, ch / 2);
            ctx.stroke();
            ctx.restore();

            // sweeping horizontal laser line (top → bottom loop)
            const period = 2600;
            const laserY = ((time % period) / period) * ch;
            ctx.save();
            ctx.strokeStyle = HUD_GREEN;
            ctx.lineWidth = 2;
            ctx.shadowColor = HUD_GREEN;
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.moveTo(0, laserY); ctx.lineTo(cw, laserY);
            ctx.stroke();
            ctx.restore();
          }
        }
      }
      scanAnimRef.current = requestAnimationFrame(drawScan);
    };
    scanAnimRef.current = requestAnimationFrame(drawScan);
    return () => { if (scanAnimRef.current) cancelAnimationFrame(scanAnimRef.current); };
  }, [enabled, cameraReady, scanMode]);

  const startDetectionLoop = () => {
    if (!videoRef.current || !canvasRef.current || !cameraReady) return;
    let lastTimestamp = 0;
    const detect = async (timestamp: number) => {
      if (!videoRef.current || !canvasRef.current || !cameraReady) {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }
      if (timestamp - lastTimestamp < 66) {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }
      lastTimestamp = timestamp;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        animationRef.current = requestAnimationFrame(detect);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      try {
        const detections = await faceapi.detectAllFaces(
          video,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })
        ).withFaceExpressions();

        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          for (const d of detections) {
            const box = d.detection.box;
            drawCorneredBox(ctx, box.x, box.y, box.width, box.height);
            drawHudTag(ctx, `[FACIAL ANALYSIS: ${faceLabel(d.expressions)}]`, box.x, box.y);
          }
        }

        if (detections.length > 0) {
          const expressions = detections[0].expressions;
          const distress = (expressions.sad + expressions.fear + expressions.angry + expressions.disgust) / 4;
          const score = Math.min(10, Math.round(distress * 10));
          let maxExpr = 'neutral';
          let maxVal = 0;
          Object.entries(expressions).forEach(([em, val]) => {
            if (val > maxVal) { maxVal = val; maxExpr = em; }
          });
          onDistressChange(score, maxExpr);
        } else {
          onDistressChange(0, 'none');
        }
      } catch (err) {
        console.warn('Detection error:', err);
      }
      animationRef.current = requestAnimationFrame(detect);
    };
    animationRef.current = requestAnimationFrame(detect);
  };

  if (!enabled) return null;

  return (
    <div className="relative w-full h-full bg-black overflow-hidden">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${cameraReady ? 'opacity-100' : 'opacity-0'}`}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      />
      <canvas
        ref={scanCanvasRef}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
      />

      {/* ── Movie-style HUD chrome ── */}
      {(cameraReady || simulated) && (
        <>
          <div className="absolute top-2 left-1/2 -translate-x-1/2 text-[10px] font-mono tracking-widest text-[#00FF66]/80 z-20 whitespace-nowrap">
            CARENETRA BIOMETRIC AI FEED v2.4
          </div>
          <div className="absolute top-2 right-2 text-[10px] font-mono text-[#00FF66]/80 z-20">
            {clock}
          </div>
          <div className="absolute bottom-2 right-2 text-[10px] font-mono text-[#00FF66]/80 z-20 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00FF66] animate-pulse inline-block" />
            72 BPM
          </div>
        </>
      )}

      {/* ── Affected-area scan status chips ── */}
      {scanMode && cameraReady && (
        <div className="absolute top-2 left-2 z-20 space-y-1 pointer-events-none">
          <div className="text-[10px] font-mono px-2 py-1 bg-black/60 border border-[#00FF66]/40 text-[#00FF66] rounded">
            {t('chat.scanInProgress', 'AI WOUND SCAN IN PROGRESS...')}
          </div>
          <div className="text-[10px] font-mono px-2 py-1 bg-black/60 border border-[#00FF66]/40 text-[#00FF66]/80 rounded">
            {t('chat.analyzingTissue', 'ANALYZING TISSUE ERYTHEMA & SWELLING...')}
          </div>
        </div>
      )}

      {/* ── Simulated-feed fallback (models/camera unavailable) ── */}
      {simulated && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/85">
          <div className="relative w-[70%] max-w-sm aspect-square flex items-center justify-center">
            {/* corner brackets */}
            <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-[#00FF66]/70" />
            <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-[#00FF66]/70" />
            <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-[#00FF66]/70" />
            <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-[#00FF66]/70" />
            {/* sweeping laser */}
            <div
              className="absolute left-0 right-0 h-px bg-[#00FF66] shadow-[0_0_12px_#00FF66]"
              style={{ animation: 'carenetra-scan 2.6s linear infinite' }}
            />
            <div className="text-center space-y-1 z-10">
              <p className="text-[12px] font-mono text-[#00FF66] tracking-widest">
                {t('chat.simulatedFeed', 'SIMULATED FEED')}
              </p>
              <p className="text-[10px] font-mono text-[#00FF66]/60">
                {t('chat.woundScanStandby', 'AI wound scan standby')}
              </p>
            </div>
            {error && (
              <p className="absolute bottom-4 inset-x-0 text-center text-[10px] font-mono text-red-400/80 px-4">
                {error}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Loading overlay */}
      {(!modelsLoaded || !cameraReady) && !simulated && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-sm z-10">
          {!modelsLoaded ? 'Loading AI models...' : 'Starting camera...'}
        </div>
      )}
    </div>
  );
};

export default FaceAnalyzer;
