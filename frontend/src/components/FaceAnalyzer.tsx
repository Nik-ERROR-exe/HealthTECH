import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as faceapi from 'face-api.js';

interface Props {
  onDistressChange: (score: number, dominantEmotion: string) => void;
  enabled: boolean;
}

const FaceAnalyzer: React.FC<Props> = ({ onDistressChange, enabled }) => {
  const videoRef   = useRef<HTMLVideoElement>(null);
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const frameRef   = useRef<number>(0);
  const streamRef  = useRef<MediaStream | null>(null);

  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [cameraReady,  setCameraReady]  = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  // ── Load models once on mount ───────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('/models'),
          faceapi.nets.faceExpressionNet.loadFromUri('/models'),
        ]);
        setModelsLoaded(true);
      } catch (e) {
        setError('Failed to load face models');
        console.error(e);
      }
    })();
  }, []);

  // ── Start / stop webcam based on enabled prop ───────────────────────────────
  useEffect(() => {
    if (!enabled || !modelsLoaded) return;

    let cancelled = false;

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width:      { ideal: 640 },
            height:     { ideal: 480 },
            facingMode: 'user',
          },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play().then(() => setCameraReady(true)).catch(() => {});
          };
        }
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          setError('Camera access denied — please allow camera permission in your browser settings');
        } else if (err.name === 'NotFoundError') {
          setError('No camera found — please connect a webcam');
        } else if (err.name === 'NotReadableError') {
          setError('Camera is in use by another application');
        } else {
          setError(`Camera error: ${err.message || 'unknown'}`);
        }
      }
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setCameraReady(false);
    };
  }, [enabled, modelsLoaded]);

  // ── Detection loop ──────────────────────────────────────────────────────────
  const runDetection = useCallback(async () => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || video.paused || video.ended || video.readyState < 2) {
      frameRef.current = requestAnimationFrame(runDetection);
      return;
    }

    try {
      const opts   = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.4 });
      const result = await faceapi.detectSingleFace(video, opts).withFaceExpressions();

      if (result) {
        const e = result.expressions;

        // Distress = weighted combo of negative emotions (0–10 scale)
        const raw = (e.angry * 0.3 + e.sad * 0.3 + e.fearful * 0.25 + e.disgusted * 0.15);
        const distressScore = Math.min(10, Math.round(raw * 10));

        // Dominant emotion label for the LLM prompt
        const sorted = Object.entries(e).sort((a, b) => b[1] - a[1]);
        const dominant = sorted[0][0];

        onDistressChange(distressScore, dominant);

        // Draw bounding box + expression labels on overlay canvas
        if (canvas) {
          const dims    = faceapi.matchDimensions(canvas, video, true);
          const resized = faceapi.resizeResults(result, dims);
          const ctx     = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            faceapi.draw.drawDetections(canvas, resized);
            faceapi.draw.drawFaceExpressions(canvas, resized, 0.05);
          }
        }
      }
    } catch (err) {
      console.warn('Face detection frame error:', err);
    }

    frameRef.current = requestAnimationFrame(runDetection);
  }, [onDistressChange]);

  useEffect(() => {
    if (!cameraReady) return;
    frameRef.current = requestAnimationFrame(runDetection);
    return () => {
      cancelAnimationFrame(frameRef.current);
    };
  }, [cameraReady, runDetection]);

  if (!enabled) return null;

  return (
    <div className="relative w-full h-full">
      {/* Status overlays */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-2xl z-10">
          <div className="text-center px-6">
            <div className="text-3xl mb-3">📷</div>
            <p className="text-sm text-red-400 leading-relaxed">{error}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Check browser settings → Site permissions → Camera
            </p>
          </div>
        </div>
      )}
      {!cameraReady && modelsLoaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl z-10">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Accessing camera…</p>
          </div>
        </div>
      )}
      {!modelsLoaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl z-10">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Loading face models…</p>
          </div>
        </div>
      )}

      {/* Camera feed — full size */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-cover rounded-2xl"
        style={{ transform: 'scaleX(-1)' }}
      />
      {/* Detection overlay canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full rounded-2xl pointer-events-none"
        style={{ transform: 'scaleX(-1)' }}
      />
    </div>
  );
};

export default FaceAnalyzer;
