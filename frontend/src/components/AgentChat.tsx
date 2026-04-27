import { useState, useRef, useEffect, useCallback } from 'react';
import {
  MessageCircle, X, Mic, MicOff, Send, Upload,
  Loader2, Volume2, VolumeX,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { conversationApi } from '@/lib/api';

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

interface Question {
  id: string;
  question: string; // ← matches caretaker_agent output field name
  type: string;     // backend sends: mcq, yes_no, pain_scale, text, temperature, photo_prompt, greeting
  options?: string[];
}

interface ChatMessage {
  role: 'cara' | 'patient';
  content: string;
  options?: string[];
  questionType?: string;
  isLatest?: boolean;
}

type Phase = 'idle' | 'starting' | 'chatting' | 'photo' | 'submitting' | 'done';

const TIER_CONFIG = {
  GREEN:     { color: 'text-emerald-400', icon: '🟢', label: 'Stable' },
  YELLOW:    { color: 'text-yellow-400',  icon: '🟡', label: 'Watch' },
  ORANGE:    { color: 'text-orange-400',  icon: '🟠', label: 'Attention needed' },
  RED:       { color: 'text-red-400',     icon: '🔴', label: 'High risk' },
  EMERGENCY: { color: 'text-red-600',     icon: '🚨', label: 'Emergency' },
} as const;

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

  const hasMic = typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const hasTTS = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const scrollRef      = useRef<HTMLDivElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const voicesLoaded   = useRef(false);

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
    const handler = () => setOpen(true);
    window.addEventListener('carenetra:open-agent-chat', handler);
    return () => window.removeEventListener('carenetra:open-agent-chat', handler);
  }, []);

  useEffect(() => {
    if (open && phase === 'idle' && messages.length === 0) initChat();
  }, [open]); // eslint-disable-line

  // ── TTS ───────────────────────────────────────────────────────────────────────

  const getLanguageCode = (lang: string): string => {
    const map: Record<string, string> = {
      en: 'en-US',
      hi: 'hi-IN',
      mr: 'mr-IN',
    };
    return map[lang] || 'en-US';
  };

  const speak = useCallback((text: string) => {
    if (!hasTTS || !ttsEnabled) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices    = window.speechSynthesis.getVoices();
    const langCode = getLanguageCode(currentLanguage);
    
    // Try to find voice in current language
    let preferred = voices.find(v => v.lang.toLowerCase().startsWith(langCode.toLowerCase().split('-')[0]));
    
    // Fallback: If Marathi is missing, try Hindi (Devanagari script is common)
    if (!preferred && currentLanguage === 'mr') {
      preferred = voices.find(v => v.lang.toLowerCase().startsWith('hi'));
    }

    // Fallback for English specific voices
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
    utterance.onend   = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [hasTTS, ttsEnabled, currentLanguage]);

  const addMsg = useCallback((msg: ChatMessage) => {
    setMessages(prev => [
      ...prev.map(m => ({ ...m, isLatest: false })),
      { ...msg, isLatest: true },
    ]);
  }, []);

  // Uses q.question — the backend field name from caretaker_agent
  const displayQuestion = useCallback((q: Question) => {
    setCurrentQ(q);
    // Backend mcq templates include options; yes_no templates don't, so provide defaults
    let opts: string[] | undefined;
    if (q.type === 'mcq' && q.options && q.options.length > 0) {
      opts = q.options;
    } else if (q.type === 'yes_no') {
      opts = q.options && q.options.length > 0 ? q.options : ['Yes', 'No'];
    }
    addMsg({
      role:         'cara',
      content:      q.question,
      options:      opts,
      questionType: q.type,
      isLatest:     true,
    });
    speak(q.question);
    setPhase(q.type === 'photo_prompt' ? 'photo' : 'chatting');
  }, [addMsg, speak]);

  // ── Session flow ──────────────────────────────────────────────────────────────

  const initChat = async () => {
    // Do NOT check for active sessions — always start fresh
    const welcomeMsg = i18n.t('chat.welcome');
    addMsg({
      role: 'cara',
      content: welcomeMsg,
    });
    speak(welcomeMsg);
    setPhase('idle');
  };

  const startSession = async () => {
    setPhase('starting');
    try {
      const res = await conversationApi.start(i18n.language);
      setSessionId(res.data.session_id);

      // Show greeting from backend
      const greeting = res.data.greeting || res.data.message;
      if (greeting) {
        addMsg({ role: 'cara', content: greeting });
        speak(greeting);
      }

      // Display the first question after greeting
      const firstQ = res.data.first_question as Question;
      if (firstQ) {
        setTimeout(() => displayQuestion(firstQ), greeting ? 1200 : 0);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to start check-in. Please try again.');
      setPhase('idle');
    }
  };

  // ── Answer flow — server-driven single-question advancement ──────────────────

  const handleAnswerResponse = (data: any) => {
    if (data.risk_tier) {
      // Conversation complete — show final result
      const tier = (data.risk_tier as string) || 'GREEN';
      const message = data.friendly_message || "Check-in complete. Take care!";
      setFinalTier(tier);
      addMsg({ role: 'cara', content: message });
      speak(message);
      setPhase('done');
    } else if (data.next_question) {
      // More questions remain
      displayQuestion(data.next_question as Question);
    } else {
      // Fallback: run pipeline if response shape is unexpected
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
    if (!file || !sessionId || !currentQ) return;

    addMsg({ role: 'patient', content: '📷 Wound photo uploaded' });
    setPhase('submitting');

    try {
      await conversationApi.uploadWound(sessionId, file);
      const res = await conversationApi.answer(sessionId, currentQ.id, 'photo_uploaded');
      handleAnswerResponse(res.data);
    } catch {
      toast.error('Photo upload failed. Please try again.');
      setPhase('photo');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const runPipeline = async () => {
    if (!sessionId) return;
    setPhase('submitting');
    try {
      const res = await conversationApi.submit(sessionId);
      // keys: risk_tier + friendly_message — both present in fixed backend
      const tier    = (res.data.risk_tier as string) || 'GREEN';
      const message = res.data.friendly_message || "Check-in complete. Take care!";
      setFinalTier(tier);
      addMsg({ role: 'cara', content: message });
      speak(message);
      setPhase('done');
    } catch {
      addMsg({ role: 'cara', content: "I've recorded your check-in. Your doctor will review your responses shortly." });
      setPhase('done');
    }
  };

  // ── STT ───────────────────────────────────────────────────────────────────────

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    window.speechSynthesis.cancel();
    const rec          = new SR();
    rec.lang           = getLanguageCode(currentLanguage);
    rec.interimResults = false;
    rec.onresult = (e: any) => { setTextInput(e.results[0][0].transcript); setIsListening(false); };
    rec.onerror  = () => setIsListening(false);
    rec.onend    = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const handleClose = () => {
    window.speechSynthesis.cancel();
    recognitionRef.current?.stop();
    setOpen(false);
  };

  const resetChat = () => {
    window.speechSynthesis.cancel();
    recognitionRef.current?.stop();
    setPhase('idle');
    setSessionId(null);
    setCurrentQ(null);
    setMessages([]);
    setTextInput('');
    setFinalTier(null);
    setIsListening(false);
  };

  // Indeterminate progress — we don't know total questions in single-question flow
  const progressPct = phase === 'done' ? 100
    : (phase === 'chatting' || phase === 'photo' || phase === 'submitting') ? 50
    : 0;

  const tierInfo = finalTier ? TIER_CONFIG[finalTier as keyof typeof TIER_CONFIG] : null;

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed bottom-24 right-4 sm:right-6 w-[calc(100vw-2rem)] sm:w-[420px] h-[580px] glass-card flex flex-col z-50 shadow-2xl overflow-hidden rounded-2xl"
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

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {messages.map((msg, idx) => (
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
                    {msg.content}
                  </div>

                  {msg.role === 'cara' && msg.options && msg.isLatest && phase === 'chatting' && (
                    <div className="flex flex-wrap gap-1.5 max-w-[85%]">
                      {msg.options.map(opt => (
                        <motion.button
                          key={opt}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          whileHover={{ scale: 1.03 }}
                          whileTap={{ scale: 0.97 }}
                          onClick={() => submitAnswer(opt)}
                          className="text-xs px-3 py-1.5 rounded-full border border-primary/30 bg-primary/5 text-foreground hover:bg-primary/15 hover:border-primary/60 transition-all"
                        >
                          {opt}
                        </motion.button>
                      ))}
                    </div>
                  )}

                  {msg.role === 'cara' && msg.questionType === 'photo_prompt' && msg.isLatest && phase === 'photo' && (
                    <motion.button
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 text-xs px-4 py-2 rounded-xl border border-primary/40 bg-primary/10 text-primary hover:bg-primary/20 transition-all"
                    >
                      <Upload size={13} /> Upload wound photo
                    </motion.button>
                  )}
                </motion.div>
              ))}

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

            {/* Text input bar — always visible during chatting/photo so user can type freely */}
            <AnimatePresence>
              {(phase === 'chatting' || phase === 'photo') && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="px-3 pb-3 pt-2 border-t border-border shrink-0"
                >
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
                      placeholder={isListening ? 'Listening…' : 'Type your answer…'}
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
                </motion.div>
              )}
            </AnimatePresence>
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
    </>
  );
};

export default AgentChat;
