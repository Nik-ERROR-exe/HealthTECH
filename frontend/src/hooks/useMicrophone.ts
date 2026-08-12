import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';

export interface UseMicrophoneReturn {
  isListening: boolean;
  transcript: string;
  permissionError: string | null;
  startListening: () => Promise<void>;
  stopListening: () => void;
  resetTranscript: () => void;
}

export function useMicrophone(language: string = 'en-US'): UseMicrophoneReturn {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const startListening = useCallback(async () => {
    setPermissionError(null);
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      const err = 'Speech recognition is not supported in this browser.';
      setPermissionError(err);
      toast.error(err);
      return;
    }

    // Verify microphone access via getUserMedia for production HTTPS safety
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop stream track once permission is granted so SpeechRecognition can bind
        stream.getTracks().forEach(track => track.stop());
      }
    } catch (err: any) {
      const errMsg = 'Microphone Access Denied. Please enable microphone permissions in your browser.';
      setPermissionError(errMsg);
      toast.error(errMsg);
      setIsListening(false);
      return;
    }

    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }

      const rec = new SpeechRecognition();
      rec.lang = language;
      rec.interimResults = false;
      rec.continuous = false;

      rec.onresult = (e: any) => {
        const text = e.results[0][0].transcript;
        setTranscript(text);
        setIsListening(false);
      };

      rec.onerror = (e: any) => {
        console.warn('Microphone SpeechRecognition error:', e);
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
          const errMsg = 'Microphone Access Denied. Please check your browser site settings.';
          setPermissionError(errMsg);
          toast.error(errMsg);
        }
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
    } catch (e) {
      console.error('Failed to start microphone:', e);
      setIsListening(false);
    }
  }, [language]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }
    setIsListening(false);
  }, []);

  const resetTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  return {
    isListening,
    transcript,
    permissionError,
    startListening,
    stopListening,
    resetTranscript,
  };
}

export default useMicrophone;
