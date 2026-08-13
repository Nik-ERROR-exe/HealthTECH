import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Upload, Send, Image as ImageIcon, AlertTriangle, CheckCircle,
  Loader2, MessageCircle, Sparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import { imageApi } from '@/lib/api';

interface WoundAnalysis {
  analysis_id: string;
  is_wound?: boolean;
  summary: string;
  severity: string;
  redness_detected: boolean;
  swelling_detected: boolean;
  texture_change_detected: boolean;
  ai_advice: string;
  image_url: string;
  wound_score: number;
}

interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
}

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
  NORMAL:   { color: 'text-emerald-400', bg: 'bg-emerald-500/10', icon: <CheckCircle size={14} /> },
  MILD:     { color: 'text-yellow-400',  bg: 'bg-yellow-500/10',  icon: <AlertTriangle size={14} /> },
  MODERATE: { color: 'text-orange-400',  bg: 'bg-orange-500/10',  icon: <AlertTriangle size={14} /> },
  SEVERE:   { color: 'text-red-400',     bg: 'bg-red-500/10',     icon: <AlertTriangle size={14} /> },
};

interface ImageChatProps {
  open: boolean;
  onClose: () => void;
}

const ImageChat = ({ open, onClose }: ImageChatProps) => {
  const [uploading, setUploading] = useState(false);
  const [analysis, setAnalysis] = useState<WoundAnalysis | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [chatMessages]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.error('Please upload a JPEG, PNG, or WebP image');
      return;
    }

    setPreviewUrl(URL.createObjectURL(file));
    setUploading(true);
    setAnalysis(null);
    setChatMessages([]);

    try {
      const res = await imageApi.uploadImage(file);
      setAnalysis(res.data);
      if (res.data.is_wound === false) {
        toast.info('Uploaded photo does not appear to show a clinical wound.');
      } else {
        toast.success('Wound image analyzed successfully');
      }
    } catch (err: any) {
      toast.error(err.response?.data?.detail || 'Failed to analyze image');
      setPreviewUrl(null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !analysis) return;

    const userMsg = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);

    try {
      const res = await imageApi.sendImageChat(analysis.analysis_id, userMsg);
      setChatMessages(prev => [...prev, { role: 'ai', content: res.data.answer }]);
    } catch (err: any) {
      const errorMsg = err.response?.data?.detail || 'Failed to get response. Please try again.';
      setChatMessages(prev => [...prev, { role: 'ai', content: errorMsg }]);
    } finally {
      setChatLoading(false);
    }
  };

  const handleReset = () => {
    setAnalysis(null);
    setPreviewUrl(null);
    setChatMessages([]);
    setChatInput('');
  };

  const severityInfo = analysis ? (SEVERITY_CONFIG[analysis.severity] || SEVERITY_CONFIG.NORMAL) : null;
  const isWoundImage = analysis?.is_wound !== false;

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="glass-card w-full max-w-lg max-h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center">
                <ImageIcon size={14} className="text-primary-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold">Wound Analysis Chat</p>
                <p className="text-xs text-muted-foreground">
                  {analysis ? (isWoundImage ? 'Ask questions about your wound' : 'Non-wound photo uploaded') : 'Upload a wound image to begin'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {analysis && (
                <button onClick={handleReset} className="text-xs text-primary hover:underline px-2 py-1">
                  New Image
                </button>
              )}
              <button onClick={onClose} className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Main content */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

            {/* Upload zone (shown when no analysis yet) */}
            {!analysis && !uploading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-border rounded-2xl hover:border-primary/40 transition-colors cursor-pointer group"
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">
                  <Upload size={24} className="text-primary" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">Upload wound image</p>
                <p className="text-xs text-muted-foreground text-center">
                  Drag and drop or click to browse. JPEG, PNG, or WebP.
                </p>
              </motion.div>
            )}

            {/* Uploading spinner */}
            {uploading && (
              <div className="flex flex-col items-center justify-center py-12">
                {previewUrl && (
                  <div className="w-32 h-32 rounded-xl overflow-hidden border border-border mb-4">
                    <img src={previewUrl} alt="Analyzing" className="w-full h-full object-cover" />
                  </div>
                )}
                <Loader2 size={28} className="text-primary animate-spin mb-3" />
                <p className="text-sm text-muted-foreground">Analyzing your wound image...</p>
              </div>
            )}

            {/* Analysis result */}
            {analysis && (
              <>
                {/* Image + Severity */}
                <div className="flex gap-4">
                  {previewUrl && (
                    <div className="w-24 h-24 rounded-xl overflow-hidden border border-border shrink-0">
                      <img src={previewUrl} alt="Uploaded Image" className="w-full h-full object-cover" />
                    </div>
                  )}
                  <div className="flex-1 space-y-2">
                    {isWoundImage ? (
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${severityInfo?.bg} ${severityInfo?.color}`}>
                          {severityInfo?.icon}
                          {analysis.severity}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Score: {analysis.wound_score}/10
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-muted text-muted-foreground border border-border">
                          Non-Wound / Photo
                        </span>
                      </div>
                    )}
                    <p className="text-sm text-foreground leading-relaxed">{analysis.summary}</p>
                  </div>
                </div>

                {/* Findings tags — only render for confirmed wound images */}
                {isWoundImage && (
                  <div className="flex flex-wrap gap-2">
                    {analysis.redness_detected && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                        Redness detected
                      </span>
                    )}
                    {analysis.swelling_detected && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
                        Swelling detected
                      </span>
                    )}
                    {analysis.texture_change_detected && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/20">
                        Texture change
                      </span>
                    )}
                    {!analysis.redness_detected && !analysis.swelling_detected && !analysis.texture_change_detected && (
                      <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        No major findings
                      </span>
                    )}
                  </div>
                )}

                {/* AI advice */}
                {analysis.ai_advice && (
                  <div className="bg-primary/5 border border-primary/15 rounded-xl p-3.5">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Sparkles size={13} className="text-primary" />
                      <span className="text-xs font-semibold text-primary">AI Care Tips</span>
                    </div>
                    <p className="text-xs text-foreground/80 leading-relaxed">{analysis.ai_advice}</p>
                  </div>
                )}

                {/* Separator */}
                <div className="flex items-center gap-3 pt-1">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <MessageCircle size={12} /> Ask about your wound
                  </span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Chat messages */}
                {chatMessages.map((msg, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-sm'
                        : 'bg-muted text-foreground rounded-bl-sm'
                    }`}>
                      {msg.content}
                    </div>
                  </motion.div>
                ))}

                {/* Chat loading */}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1.5">
                      {[0, 120, 240].map(d => (
                        <span key={d} className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 animate-bounce" style={{ animationDelay: `${d}ms` }} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Chat input (shown only after analysis) */}
          {analysis && (
            <div className="px-4 pb-4 pt-2 border-t border-border shrink-0">
              <div className="flex items-center gap-2">
                <input
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && chatInput.trim()) handleSendChat(); }}
                  placeholder="Ask about your wound analysis..."
                  autoFocus
                  className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-ring/30"
                />
                <button
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || chatLoading}
                  className="p-2.5 rounded-full bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity flex-shrink-0"
                >
                  <Send size={15} />
                </button>
              </div>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileSelect}
          />
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ImageChat;
