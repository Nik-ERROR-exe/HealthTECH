import { useEffect, useRef, useState } from 'react';
import * as faceapi from 'face-api.js';

interface FaceAnalyzerProps {
  onDistressChange: (score: number, emotion: string) => void;
  enabled: boolean;
}

const FaceAnalyzer: React.FC<FaceAnalyzerProps> = ({ onDistressChange, enabled }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraReady, setCameraReady] = useState(false);

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
          if (mounted) setError('Failed to load face analysis models');
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
  }, [enabled, modelsLoaded]);

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
    }
  };

  const stopCamera = () => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  };

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
          faceapi.draw.drawDetections(canvas, detections);
          faceapi.draw.drawFaceExpressions(canvas, detections);
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
    <div className="relative w-full h-full bg-black">
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
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-sm z-10 p-4 text-center">
          {error}
        </div>
      )}
      {(!modelsLoaded || !cameraReady) && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-sm z-10">
          {!modelsLoaded ? 'Loading AI models...' : 'Starting camera...'}
        </div>
      )}
    </div>
  );
};

export default FaceAnalyzer;