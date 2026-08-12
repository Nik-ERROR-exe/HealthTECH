import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  MessageCircle, X, Mic, MicOff, Send, Upload,
  Volume2, VolumeX, Phone, AlertTriangle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { conversationApi, emergencyApi } from '@/lib/api';
import FaceAnalyzer from '@/components/FaceAnalyzer';
import { getEmpatheticReply } from '@/lib/nvidiaApi';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface Question {
  id: string;
  question: string;
  type: string;
  options?: string[];
}

interface ChatMessage {
  role: 'cara' | 'patient';
  content: string;
  options?: string[];
  questionType?: string;
  isLatest?: boolean;
  imageUrl?: string;
}

const INTERNAL_STATE_KEYS = new Set([
  'general_feeling', 'wound_check', 'medication', 'pain_check',
  'symptoms_check', 'fever_check', 'discharge_check', 'dressing_change'
]);

const cleanQuestionText = (text: string): string => {
  if (!text) return "Hello! How are you feeling overall today?";
  const trimmed = text.trim();
  if (INTERNAL_STATE_KEYS.has(trimmed)) {
    if (trimmed === 'general_feeling') return "Hello! How are you feeling overall today?";
    if (trimmed === 'wound_check') return "How is your wound looking and feeling today?";
    if (trimmed === 'medication') return "Have you taken your prescribed medications today?";
    return "How are you feeling right now?";
  }
  return trimmed;
};

type Phase = 'idle' | 'starting' | 'chatting' | 'photo' | 'submitting' | 'done';

const TIER_CONFIG = {
  GREEN:     { color: 'text-emerald-400', icon: '🟢', label: 'Stable' },
  YELLOW:    { color: 'text-yellow-400',  icon: '🟡', label: 'Watch' },
  ORANGE:    { color: 'text-orange-400',  icon: '🟠', label: 'Attention needed' },
  RED:       { color: 'text-red-400',     icon: '🔴', label: 'High risk' },
  EMERGENCY: { color: 'text-red-600',     icon: '🚨', label: 'Emergency' },
} as const;

// Emergency red-flag phrases — mirrors the backend regex in nurse_agent.py so the
// patient UI can halt the conversation and raise the alert instantly, before the
// round-trip to the server.
const EMERGENCY_KEYWORDS_RE =
  /chest pain|can'?t breathe|cannot breathe|can not breathe|bleeding heavily|call doctor|severe pain|in very pain|unconscious|\bhelp\b/i;

interface EmergencyContacts {
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  doctor_name?: string | null;
  doctor_phone?: string | null;
}

const AgentChat = () => {
  const { i18n } = useTranslation();
  const [open, setOpen]                   = useState(false);
  const [phase, setPhase]                 = useState<Phase>('idle');
  const [sessionId, setSessionId]         = useState<string | null>(null);
  const [currentQ, setCurrentQ]           = useState<Question | null>(null);
  const [messages, setMessages]           = useState<ChatMessage[]>([]);
  const [textInput, setTextInput]         = useState('');
  const [isListening, setIsListening]     = useState(false);
  const [isSpeaking, setIsSpeaking]       = useState(false);
  const [ttsEnabled, setTtsEnabled]       = useState(true);
  const [finalTier, setFinalTier]         = useState<string | null>(null);
  const [currentLanguage, setCurrentLanguage] = useState<string>(i18n.language);
  const [emergencyActive, setEmergencyActive]   = useState(false);
  const [emergencyContacts, setEmergencyContacts] = useState<EmergencyContacts | null>(null);

  const [facialDistress,       setFacialDistress]       = useState(0);
  const [dominantEmotion,      setDominantEmotion]      = useState('neutral');
  const [faceAnalyzerEnabled,  setFaceAnalyzerEnabled]  = useState(false);

  const handleDistressChange = useCallback((score: number, emotion: string) => {
    setFacialDistress(score);
    setDominantEmotion(emotion);
  }, []);

  const hasMic = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const hasTTS = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const scrollRef      = useRef<HTMLDivElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const voicesLoaded   = useRef(false);
  const alertAudioRef  = useRef<HTMLAudioElement | null>(null);

  // ── Emergency alert ───────────────────────────────────────────────────────
  const stopAlertSound = useCallback(() => {
    if (alertAudioRef.current) {
      alertAudioRef.current.pause();
      alertAudioRef.current.currentTime = 0;
    }
  }, []);

  const playAlertSound = useCallback(() => {
    try {
      if (!alertAudioRef.current) alertAudioRef.current = new Audio('/alert.mp3');
      alertAudioRef.current.loop = true;
      alertAudioRef.current.play().catch(() => { /* autoplay may be blocked — fine */ });
    } catch { /* ignore */ }
  }, []);

  const triggerEmergency = useCallback((contacts?: EmergencyContacts | null) => {
    window.speechSynthesis.cancel();
    recognitionRef.current?.stop();
    setIsListening(false);
    if (contacts) setEmergencyContacts(contacts);
    setEmergencyActive(true);
    playAlertSound();
  }, [playAlertSound]);

  const dismissEmergency = useCallback(() => {
    stopAlertSound();
    setEmergencyActive(false);
  }, [stopAlertSound]);

  const isCheckinActive = faceAnalyzerEnabled && phase !== 'idle' && phase !== 'done';

  // ── TTS & Question display helpers (declared before useEffect usage) ────
  const getLanguageCode = (lang: string): string => {
    const map: Record<string, string> = {
      en: 'en-US',
      hi: 'hi-IN',
      mr: 'mr-IN',
    };
    return map[lang] || 'en-US';
  };

  // ── STT (declared before speak so speak can reference startListening) ──────

  const startListening = useCallback(async () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error('Speech recognition is not supported in this browser.');
      return;
    }
    
    // Check getUserMedia permission explicitly for production HTTPS
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ audio: true });
      }
    } catch (err: any) {
      toast.error('Microphone Access Denied. Please enable microphone permissions in your browser.');
      setIsListening(false);
      return;
    }

    window.speechSynthesis.cancel();
    const rec          = new SR();
    rec.lang           = getLanguageCode(currentLanguage);
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      setTextInput(e.results[0][0].transcript);
      setIsListening(false);
    };
    rec.onerror  = (e: any) => {
      console.warn('SpeechRecognition error:', e);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        toast.error('Microphone Access Denied. Please check browser permissions.');
      }
      setIsListening(false);
    };
    rec.onend    = () => setIsListening(false);
    recognitionRef.current = rec;
    
    try {
      rec.start();
      setIsListening(true);
    } catch (e) {
      console.warn('Failed to start speech recognition:', e);
      setIsListening(false);
    }
  }, [currentLanguage]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const speak = useCallback((text: string, autoListenOnEnd = false) => {
    if (!hasTTS || !ttsEnabled) return;
    window.speechSynthesis.cancel();
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
    const utterance = new SpeechSynthesisUtterance(text);
    const voices    = window.speechSynthesis.getVoices();
    const langCode = getLanguageCode(currentLanguage);
    
    let preferred = voices.find(v => v.lang.toLowerCase().startsWith(langCode.toLowerCase().split('-')[0]));
    
    if (!preferred && currentLanguage === 'mr') {
      preferred = voices.find(v => v.lang.toLowerCase().startsWith('hi'));
    }

    if (!preferred && currentLanguage === 'en') {
      preferred = voices.find(v =>
        v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Victoria') ||
        (v.lang.startsWith('en') && v.name.toLowerCase().includes('female'))
      ) || voices.find(v => v.lang === 'en-US' || v.lang === 'en-GB');
    }
    
    if (preferred) utterance.voice = preferred;
    utterance.lang = preferred ? preferred.lang : langCode;
    utterance.rate    = 0.92;
    utterance.pitch   = 1.08;
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend   = () => {
      setIsSpeaking(false);
      if (autoListenOnEnd) {
        setTimeout(() => startListening(), 300);
      }
    };
    utterance.onerror = (err) => {
      console.warn('TTS Speech error:', err);
      setIsSpeaking(false);
    };
    window.speechSynthesis.speak(utterance);
  }, [hasTTS, ttsEnabled, currentLanguage, startListening]);

  const addMsg = useCallback((msg: ChatMessage) => {
    setMessages(prev => [
      ...prev.map(m => ({ ...m, isLatest: false })),
      { ...msg, isLatest: true },
    ]);
  }, []);

  const displayQuestion = useCallback((q: Question) => {
    setCurrentQ(q);
    const cleanText = cleanQuestionText(q.question);
    let opts: string[] | undefined;
    if (q.type === 'mcq' && q.options && q.options.length > 0) {
      opts = q.options;
    } else if (q.type === 'yes_no') {
      opts = q.options && q.options.length > 0 ? q.options : ['Yes', 'No'];
    }
    addMsg({
      role:         'cara',
      content:      cleanText,
      options:      opts,
      questionType: q.type,
      isLatest:     true,
    });
    speak(cleanText);
    setPhase((q.type === 'photo' || q.type === 'photo_prompt') ? 'photo' : 'chatting');
  }, [addMsg, speak]);

  const startSession = useCallback(async () => {
    stopAlertSound();
    setEmergencyActive(false);
    setEmergencyContacts(null);
    setPhase('starting');
    try {
      const res = await conversationApi.start(i18n.language);
      setSessionId(res.data.session_id);
      setFaceAnalyzerEnabled(true);

      const greeting = res.data.greeting || res.data.message;
      if (greeting) {
        addMsg({ role: 'cara', content: greeting });
        speak(greeting);
      }

      const firstQ = res.data.first_question as Question;
      if (firstQ) {
        setTimeout(() => displayQuestion(firstQ), greeting ? 1200 : 0);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to start check-in. Please try again.');
      setPhase('idle');
    }
  }, [stopAlertSound, i18n.language, addMsg, speak, displayQuestion]);

  const initChat = async () => {
    startSession();
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, phase]);

  useEffect(() => {
    if (hasTTS && !voicesLoaded.current) {
      window.speechSynthesis.getVoices();
      window.speechSynthesis.onvoiceschanged = () => { voicesLoaded.current = true; };
    }
  }, [hasTTS]);

  useEffect(() => {
    const handleLanguageChange = () => {
      setCurrentLanguage(i18n.language);
    };
    i18n.on('languageChanged', handleLanguageChange);
    return () => i18n.off('languageChanged', handleLanguageChange);
  }, [i18n]);

  useEffect(() => {
    const handler = (e: any) => {
      setOpen(true);
      setFaceAnalyzerEnabled(true);
      const detail = e?.detail;
      const nurseMsg = detail?.nurse_message || detail?.ai_advice || detail?.summary;
      if (nurseMsg) {
        if (detail?.session_id) setSessionId(detail.session_id);
        if (detail?.image_url) {
          addMsg({
            role: 'patient',
            content: `[Uploaded Wound Image](${detail.image_url})`,
            imageUrl: detail.image_url,
          });
        }
        const fullPrompt = nurseMsg.includes('How') ? nurseMsg : `I've analyzed your wound photo: ${nurseMsg}. How is the pain level around this area right now?`;
        const q: Question = {
          id: 'wound_pain_level',
          question: fullPrompt,
          type: 'text',
        };
        displayQuestion(q);
      } else if (phase === 'idle') {
        startSession();
      }
    };
    window.addEventListener('carenetra:open-agent-chat', handler);
    return () => window.removeEventListener('carenetra:open-agent-chat', handler);
  }, [phase, displayQuestion, addMsg, startSession]);

  // ── Answer flow ──────────────────────────────────────────────────────────────

  const handleAnswerResponse = (data: any) => {
    // Emergency intercept from the backend — halt and raise the red alert.
    if (data.emergency_triggered) {
      setFinalTier('EMERGENCY');
      setPhase('done');
      setFaceAnalyzerEnabled(false);
      triggerEmergency(data.emergency_contacts || null);
      return;
    }
    if (data.risk_tier) {
      const tier = (data.risk_tier as string) || 'GREEN';
      const message = data.friendly_message || "Check-in complete. Take care!";
      setFinalTier(tier);
      addMsg({ role: 'cara', content: message });
      speak(message);
      setPhase('done');
      setFaceAnalyzerEnabled(false);
    } else if (data.next_question) {
      displayQuestion(data.next_question as Question);
    } else {
      runPipeline();
    }
  };

  const submitAnswer = async (answer: string) => {
    if (!sessionId || !currentQ || phase === 'submitting') return;

    recognitionRef.current?.stop();
    window.speechSynthesis.cancel();
    setIsListening(false);
    addMsg({ role: 'patient', content: answer });
    setTextInput('');
    setPhase('submitting');

    // Instant local red-flag check — halt the stream immediately AND send the
    // answer so the backend records + escalates (best-effort, non-blocking).
    if (EMERGENCY_KEYWORDS_RE.test(answer)) {
      setFinalTier('EMERGENCY');
      setPhase('done');
      setFaceAnalyzerEnabled(false);
      triggerEmergency();
      conversationApi.answer(sessionId, currentQ.id, answer, i18n.language)
        .then(res => {
          if (res.data?.emergency_contacts) setEmergencyContacts(res.data.emergency_contacts);
        })
        .catch(() => {});
      return;
    }

    try {
      const res = await conversationApi.answer(sessionId, currentQ.id, answer, i18n.language);
      handleAnswerResponse(res.data);
    } catch {
      toast.error('Failed to submit answer. Please try again.');
      setPhase('chatting');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    addMsg({ role: 'patient', content: '📷 Uploaded wound photo', imageUrl: previewUrl });
    setPhase('submitting');

    try {
      if (sessionId) {
        await conversationApi.uploadWound(sessionId, file);
      }
      const res = await conversationApi.dashboardUploadWound(file);
      const data = res.data;
      if (data.session_id) setSessionId(data.session_id);

      const nurseMsg = data.nurse_message || data.summary || "I've analyzed your wound photo. How is your pain level right now?";
      const nextQ: Question = {
        id: 'wound_pain_level',
        question: nurseMsg,
        type: 'text',
      };
      displayQuestion(nextQ);
    } catch {
      toast.error('Photo upload failed. Please try again.');
      setPhase('chatting');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const runPipeline = async () => {
    if (!sessionId) return;
    setPhase('submitting');
    try {
      const res = await conversationApi.submit(sessionId);
      if (res.data.emergency_triggered) {
        setFinalTier('EMERGENCY');
        setPhase('done');
        setFaceAnalyzerEnabled(false);
        triggerEmergency(res.data.emergency_contacts || null);
        return;
      }
      const tier    = (res.data.risk_tier as string) || 'GREEN';
      const message = res.data.friendly_message || "Check-in complete. Take care!";
      setFinalTier(tier);
      addMsg({ role: 'cara', content: message });
      speak(message);
      setPhase('done');
      setFaceAnalyzerEnabled(false);
    } catch {
      addMsg({ role: 'cara', content: "I've recorded your check-in. Your doctor will review your responses shortly." });
      setPhase('done');
      setFaceAnalyzerEnabled(false);
    }
  };

  // ── STT helpers (startListening / stopListening moved above speak) ──────────

  const handleClose = () => {
    window.speechSynthesis.cancel();
    recognitionRef.current?.stop();
    stopAlertSound();
    setFaceAnalyzerEnabled(false);
    setOpen(false);
    window.dispatchEvent(new Event('carenetra:agent-chat-dismissed'));
  };

  const resetChat = () => {
    window.speechSynthesis.cancel();
    recognitionRef.current?.stop();
    stopAlertSound();
    setPhase('idle');
    setSessionId(null);
    setCurrentQ(null);
    setMessages([]);
    setTextInput('');
    setFinalTier(null);
    setEmergencyActive(false);
    setEmergencyContacts(null);
    setIsListening(false);
    setFacialDistress(0);
    setDominantEmotion('neutral');
    setFaceAnalyzerEnabled(false);
  };

  const handleRedButtonClick = async () => {
    let lat = 19.0760;
    let lng = 72.8777;

    try {
      if ('geolocation' in navigator) {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 5000,
          });
        });
        lat = pos.coords.latitude;
        lng = pos.coords.longitude;
      }
    } catch {
      // Fallback demo coordinates (Mumbai / default user location)
    }

    try {
      const userStr = localStorage.getItem('carenetra_user');
      let patientId: string | undefined;
      if (userStr) {
        try {
          const u = JSON.parse(userStr);
          patientId = u.patient_id || u.id;
        } catch { /* ignore */ }
      }

      await emergencyApi.dispatch({
        patient_id: patientId,
        latitude: lat,
        longitude: lng,
        trigger_type: 'RED_BUTTON_CLICK',
      });
      toast.success('Emergency alert & location sent to care team!');
    } catch (err) {
      console.error('Emergency dispatch error:', err);
    }
  };

  const progressPct = phase === 'done' ? 100
    : (phase === 'chatting' || phase === 'photo' || phase === 'submitting') ? 50
    : 0;

  const tierInfo = finalTier ? TIER_CONFIG[finalTier as keyof typeof TIER_CONFIG] : null;

  // Get the latest CARA message to show as overlay on camera
  const latestCaraMsg = messages.filter(m => m.role === 'cara').slice(-1)[0];

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className={`fixed z-50 shadow-2xl overflow-hidden rounded-2xl flex flex-col ${
              isCheckinActive
                ? 'bottom-6 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-[520px] h-[620px]'
                : 'bottom-24 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-[420px] h-[580px]'
            } glass-card transition-all duration-500`}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
              <div className="flex items-center gap-3">
                <div className="relative w-9 h-9 rounded-full gradient-primary flex items-center justify-center shrink-0">
                  <MessageCircle size={15} className="text-primary-foreground" />
                  {isSpeaking && (
                    <motion.span
                      animate={{ scale: [1, 1.3, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }}
                      className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400"
                    />
                  )}
                </div>
                <div>
                  <p className="text-sm font-semibold leading-tight">CARA</p>
                  <p className="text-xs text-muted-foreground leading-tight">
                    {phase === 'done' ? 'Check-in complete ✓'
                    : phase === 'starting' ? 'Preparing your check-in...'
                    : isCheckinActive ? 'Observing your check-in'
                    : phase === 'submitting' ? 'Processing...'
                    : 'Your health companion'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {hasTTS && (
                  <button
                    onClick={() => { setTtsEnabled(e => !e); window.speechSynthesis.cancel(); }}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                  >
                    {ttsEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
                  </button>
                )}
                {phase === 'done' && (
                  <button onClick={resetChat} className="text-xs text-primary hover:underline px-2 py-1">
                    New check-in
                  </button>
                )}
                <button onClick={handleClose} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* Progress */}
            <div className="h-0.5 bg-muted shrink-0">
              <motion.div
                className="h-full gradient-primary"
                initial={{ width: 0 }}
                animate={{ width: `${progressPct}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
              />
            </div>

            {/* ── CAMERA-FIRST LAYOUT (during active check-in) ── */}
            {isCheckinActive ? (
              <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Camera feed — takes most of the space */}
                <div className="relative flex-1 bg-black rounded-b-none overflow-hidden">
                  <FaceAnalyzer
                    onDistressChange={handleDistressChange}
                    enabled={faceAnalyzerEnabled}
                    scanMode={isCheckinActive && phase === 'photo'}
                  />

                  {/* Distress meter overlay — top-right of camera, below feed label */}
                  {facialDistress >= 4 && (
                    <motion.div
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="absolute top-14 right-3 flex items-center gap-2 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5"
                    >
                      <div className="h-2 w-20 rounded-full bg-white/20 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${facialDistress * 10}%`,
                            background: facialDistress >= 7 ? '#ef4444' : facialDistress >= 4 ? '#f97316' : '#22c55e',
                          }}
                        />
                      </div>
                      <span className="text-xs text-white font-medium">
                        {facialDistress}/10
                      </span>
                    </motion.div>
                  )}

                  {/* Emotion badge — top-left */}
                  <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm rounded-full px-3 py-1.5">
                    <span className="text-xs text-white capitalize">{dominantEmotion}</span>
                  </div>

                  {/* Latest CARA question — overlaid at bottom of camera */}
                  {latestCaraMsg && (
                    <motion.div
                      key={latestCaraMsg.content}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-4 pt-8 pb-3"
                    >
                      <p className="text-white text-sm leading-relaxed drop-shadow-lg">
                        {latestCaraMsg.content}
                      </p>
                      {/* Quick option buttons overlaid */}
                      {latestCaraMsg.options && latestCaraMsg.isLatest && phase === 'chatting' && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {latestCaraMsg.options.map(opt => (
                            <motion.button
                              key={opt}
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                              onClick={() => submitAnswer(opt)}
                              className="text-xs px-3 py-1.5 rounded-full border border-white/40 bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm transition-all"
                            >
                              {opt}
                            </motion.button>
                          ))}
                        </div>
                      )}
                      {(latestCaraMsg.questionType === 'photo' || latestCaraMsg.questionType === 'photo_prompt') && latestCaraMsg.isLatest && phase === 'photo' && (
                        <motion.button
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-2 text-xs px-4 py-2 mt-2 rounded-xl border border-white/40 bg-white/15 text-white hover:bg-white/25 backdrop-blur-sm transition-all"
                        >
                          <Upload size={13} /> Upload wound photo
                        </motion.button>
                      )}
                    </motion.div>
                  )}

                  {/* Loading indicator */}
                  {(phase === 'starting' || phase === 'submitting') && (
                    <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-sm rounded-full px-4 py-2 flex items-center gap-2">
                      {[0, 120, 240].map(d => (
                        <span key={d} className="w-1.5 h-1.5 rounded-full bg-white/70 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Input bar — pinned at bottom during camera mode */}
                {(phase === 'chatting' || phase === 'photo') && (
                  <div className="px-3 pb-3 pt-2 border-t border-border shrink-0">
                    <div className="flex items-center gap-2">
                      {hasMic && (
                        <button
                          onClick={isListening ? stopListening : startListening}
                          className={`relative p-2.5 rounded-full transition-colors flex-shrink-0 ${
                            isListening ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                          {isListening && <span className="absolute inset-0 rounded-full animate-ping bg-destructive/25 pointer-events-none" />}
                        </button>
                      )}
                      <input
                        value={textInput}
                        onChange={e => setTextInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && textInput.trim()) submitAnswer(textInput.trim()); }}
                        placeholder={isListening ? 'Listening…' : 'Type or speak your answer…'}
                        autoFocus
                        className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30"
                      />
                      <button
                        onClick={() => textInput.trim() && submitAnswer(textInput.trim())}
                        disabled={!textInput.trim()}
                        className="p-2.5 rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity flex-shrink-0"
                      >
                        <Send size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* ── STANDARD CHAT LAYOUT (idle / done / chatting without camera) ── */
              <>
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                  {messages.map((msg, idx) => {
                    let imgUrl = msg.imageUrl;
                    if (!imgUrl && msg.content && msg.content.includes('/uploads/wounds/')) {
                      const match = msg.content.match(/\/uploads\/wounds\/[^\s\)]+/);
                      if (match) imgUrl = match[0];
                    }
                    const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
                    const displayImg = imgUrl ? (imgUrl.startsWith('http') || imgUrl.startsWith('blob:') ? imgUrl : `${apiBase}${imgUrl}`) : null;
                    const cleanContent = cleanQuestionText(msg.content).replace(/\[Uploaded Wound Image\]\([^\)]+\)/g, '📷 Uploaded wound photo');

                    return (
                      <motion.div
                        key={idx}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2 }}
                        className={`flex flex-col gap-1.5 ${msg.role === 'patient' ? 'items-end' : 'items-start'}`}
                      >
                        <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          msg.role === 'patient'
                            ? 'bg-primary text-primary-foreground rounded-br-sm'
                            : 'bg-muted text-foreground rounded-bl-sm'
                        }`}>
                          {displayImg && (
                            <div className="mb-2 overflow-hidden rounded-xl border border-white/20">
                              <img src={displayImg} alt="Wound" className="w-full h-auto max-h-48 object-cover" />
                            </div>
                          )}
                          {cleanContent}
                        </div>

                        {/* Quick option buttons */}
                        {msg.role === 'cara' && msg.options && msg.isLatest && phase === 'chatting' && (
                          <div className="flex flex-wrap gap-1.5 max-w-[85%]">
                            {msg.options.map(opt => (
                              <motion.button
                                key={opt}
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={() => submitAnswer(opt)}
                                className="text-xs px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                              >
                                {opt}
                              </motion.button>
                            ))}
                          </div>
                        )}

                        {/* Photo upload prompt */}
                        {msg.role === 'cara' && (msg.questionType === 'photo' || msg.questionType === 'photo_prompt') && msg.isLatest && phase === 'photo' && (
                          <motion.button
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-2 text-xs px-4 py-2 rounded-xl border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                          >
                            <Upload size={13} /> Upload wound photo
                          </motion.button>
                        )}
                      </motion.div>
                    );
                  })}

                  {(phase === 'starting' || phase === 'submitting') && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                      <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
                        {[0, 120, 240].map(d => (
                          <span key={d} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                        ))}
                      </div>
                    </motion.div>
                  )}

                  {phase === 'idle' && messages.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex justify-center pt-2">
                      <button
                        onClick={startSession}
                        className="px-6 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity shadow-md"
                      >
                        Start Check-in
                      </button>
                    </motion.div>
                  )}

                  {phase === 'done' && tierInfo && (
                    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-center pt-2">
                      <div className="border border-border rounded-xl px-5 py-3 text-center bg-muted/40 space-y-1">
                        <div className="text-2xl">{tierInfo.icon}</div>
                        <p className={`text-sm font-semibold ${tierInfo.color}`}>{tierInfo.label}</p>
                        <p className="text-xs text-muted-foreground">Check-in recorded</p>
                      </div>
                    </motion.div>
                  )}
                </div>

                {/* ── Input bar — text + mic + send (standard layout) ── */}
                {(phase === 'chatting' || phase === 'photo') && (
                  <div className="px-3 pb-3 pt-2 border-t border-border shrink-0">
                    <div className="flex items-center gap-2">
                      {hasMic && (
                        <button
                          onClick={isListening ? stopListening : startListening}
                          className={`relative p-2.5 rounded-full transition-colors flex-shrink-0 ${
                            isListening ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {isListening ? <MicOff size={15} /> : <Mic size={15} />}
                          {isListening && <span className="absolute inset-0 rounded-full animate-ping bg-destructive/25 pointer-events-none" />}
                        </button>
                      )}
                      <input
                        value={textInput}
                        onChange={e => setTextInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && textInput.trim()) submitAnswer(textInput.trim()); }}
                        placeholder={isListening ? 'Listening…' : 'Type or speak your answer…'}
                        autoFocus
                        className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30"
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2.5 rounded-full bg-muted text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                        title="Upload photo"
                      >
                        <Upload size={15} />
                      </button>
                      <button
                        onClick={() => textInput.trim() && submitAnswer(textInput.trim())}
                        disabled={!textInput.trim()}
                        className="p-2.5 rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity flex-shrink-0"
                      >
                        <Send size={15} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => setOpen(o => !o)}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        className="fixed bottom-6 right-4 sm:right-6 z-50 w-14 h-14 rounded-full gradient-primary shadow-lg flex items-center justify-center"
      >
        <AnimatePresence mode="wait">
          {open
            ? <motion.span key="x" initial={{ rotate: -80, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 80, opacity: 0 }} transition={{ duration: 0.15 }}><X size={22} className="text-primary-foreground" /></motion.span>
            : <motion.span key="c" initial={{ rotate: 80, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -80, opacity: 0 }} transition={{ duration: 0.15 }}><MessageCircle size={22} className="text-primary-foreground" /></motion.span>
          }
        </AnimatePresence>
      </motion.button>

      <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} className="hidden" />

      {/* ── CRITICAL MEDICAL ALERT overlay (full-screen, above everything) ── */}
      {emergencyActive && createPortal(
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm flex items-center justify-center px-4"
        >
          <div className="max-w-md w-full text-center space-y-5">
            <motion.div
              animate={{ opacity: [1, 0.25, 1] }}
              transition={{ repeat: Infinity, duration: 1 }}
              className="space-y-2"
            >
              <div className="text-6xl">🚨</div>
              <h2 className="text-2xl sm:text-3xl font-black text-red-500 uppercase tracking-wide">
                {i18n.t('emergency.alertTitle', 'CRITICAL MEDICAL ALERT DETECTED')}
              </h2>
            </motion.div>

            <p className="text-white/80 text-sm">
              {i18n.t(
                'emergency.alertBody',
                'Your message indicates a serious health emergency. Please call for help immediately.'
              )}
            </p>

            <a
              href={emergencyContacts?.emergency_contact_phone ? `tel:${emergencyContacts.emergency_contact_phone}` : 'tel:108'}
              onClick={handleRedButtonClick}
              className="flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-red-600 hover:bg-red-700 text-white text-lg font-bold shadow-lg transition-colors"
            >
              <Phone size={20} />
              {i18n.t('emergency.callButton', 'CALL EMERGENCY / AMBULANCE (108)')}
            </a>

            {(emergencyContacts?.emergency_contact_name || emergencyContacts?.doctor_name) && (
              <div className="bg-white/10 rounded-xl p-4 text-left text-white/90 text-sm space-y-2">
                <p className="font-semibold text-white flex items-center gap-2">
                  <AlertTriangle size={15} className="text-red-400" />
                  {i18n.t('emergency.contacts', 'Emergency contacts')}
                </p>
                {(emergencyContacts?.emergency_contact_name || emergencyContacts?.emergency_contact_phone) && (
                  <p>
                    {i18n.t('emergency.caretaker', 'Caretaker')}:{' '}
                    <span className="font-medium">
                      {emergencyContacts.emergency_contact_name || '—'}
                      {emergencyContacts.emergency_contact_phone
                        ? ` · ${emergencyContacts.emergency_contact_phone}`
                        : ''}
                    </span>
                  </p>
                )}
                {(emergencyContacts?.doctor_name || emergencyContacts?.doctor_phone) && (
                  <p>
                    {i18n.t('emergency.doctor', 'Doctor')}:{' '}
                    <span className="font-medium">
                      {emergencyContacts.doctor_name || '—'}
                      {emergencyContacts.doctor_phone ? ` · ${emergencyContacts.doctor_phone}` : ''}
                    </span>
                  </p>
                )}
              </div>
            )}

            <button onClick={dismissEmergency} className="text-white/50 text-sm underline hover:text-white/80 transition-colors">
              {i18n.t('emergency.dismiss', "I'm safe — dismiss")}
            </button>
          </div>
        </motion.div>,
        document.body
      )}
    </>
  );
};

export default AgentChat;