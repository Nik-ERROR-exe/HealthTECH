import { useRef, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Play, Shield, Brain, Activity, Bell, MessageSquare, Bot, GraduationCap,
  ChevronRight, Camera, Heart, Users, Wifi, Lock, Award, ArrowRight,
  Sparkles, Clock, ChevronDown
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '@/components/Navbar';

// ---------- Reusable Components ----------
const FadeUp = ({ children, delay = 0, className = '' }: any) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const GlowCard = ({ children, className = '' }: any) => (
  <div className={`relative group rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl hover:border-primary/50 transition-all duration-300 ${className}`}>
    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/10 to-secondary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
    <div className="relative z-10">{children}</div>
  </div>
);

// ---------- Main Component ----------
const DemoPage = () => {
  // Smooth scroll (Lenis)
  useEffect(() => {
    import('@studio-freight/lenis').then(({ default: Lenis }) => {
      const lenis = new Lenis({ duration: 1.2, smoothWheel: true });
      const raf = (time: number) => {
        lenis.raf(time);
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
      return () => lenis.destroy();
    });
  }, []);

  const features = [
    { icon: Brain, title: 'AI Health Predictions', desc: 'Forecasts complications using GradientBoostingClassifier trained on 15k+ records.' },
    { icon: Activity, title: 'Real‑time Monitoring', desc: 'Live vitals, risk scores, and trends updated every second.' },
    { icon: Bell, title: 'Emergency Alerts', desc: 'Instant email/SMS to doctors and nearby volunteers.' },
    { icon: GraduationCap, title: 'Medication Adherence', desc: 'Smart reminders & daily tracking for patients.' },
    { icon: MessageSquare, title: 'Secure Chat', desc: 'Built-in messaging for care teams and family.' },
    { icon: Bot, title: 'Voice AI (CARA)', desc: 'Daily check‑ins via voice/text – never hallucinates.' },
  ];

  // How it works steps
  const steps = [
    { step: 1, title: 'Data Collection', desc: 'Wearables, manual inputs, and wound photos feed the platform.' },
    { step: 2, title: 'AI Symptom Analysis', desc: 'NVIDIA‑powered LLM extracts structured symptoms; OpenCV analyzes wound images for redness, swelling.' },
    { step: 3, title: 'Risk Scoring', desc: 'Our custom ML model assigns a risk tier and clinical suggestions in milliseconds.' },
    { step: 4, title: 'Adaptive Monitoring', desc: 'Check‑in frequency adjusts automatically: GREEN every 24h, RED every 3h, EMERGENCY every 1h.' },
    { step: 5, title: 'Escalation & Alerts', desc: 'From simple nudges to confirmed ambulance dispatch, the right people are notified instantly.' },
  ];

  // Video thumbnail fix – full image visible
  const videoRef = useRef<HTMLVideoElement>(null);
  const posterRef = useRef<HTMLImageElement>(null);

  const handlePlay = () => {
    if (posterRef.current) {
      posterRef.current.style.opacity = '0';
      setTimeout(() => {
        if (posterRef.current) posterRef.current.style.display = 'none';
      }, 300);
    }
  };

  const handleEnded = () => {
    if (posterRef.current) {
      posterRef.current.style.display = 'block';
      setTimeout(() => {
        if (posterRef.current) posterRef.current.style.opacity = '1';
      }, 10);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      <Navbar />

      {/* ===== HERO SECTION ===== */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Dark background orbs */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-black to-secondary/20" />
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/30 rounded-full blur-[200px] animate-float-slow" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-secondary/30 rounded-full blur-[150px] animate-float-slower" />
        <div className="absolute inset-0 bg-grid-pattern pointer-events-none" />

        <div className="container mx-auto px-4 relative z-10 py-24 lg:py-0">
          <div className="grid lg:grid-cols-2 gap-12 items-center min-h-screen">
            {/* Left text content */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1] }}
              className="space-y-6 text-center lg:text-left"
            >
              <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/20 text-primary text-xs font-medium border border-primary/30 backdrop-blur-sm mx-auto lg:mx-0">
                <Sparkles size={14} className="animate-pulse" />
                <span>Interactive Demo Experience</span>
              </div>

              {/* GRADIENT HERO TEXT - VISIBLE ON DARK */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.1] tracking-tight">
                <span className="bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent animate-gradient">
                  See CARENETRA
                </span>
                <br />
                <span className="bg-gradient-to-r from-purple-400 via-pink-500 to-blue-500 bg-clip-text text-transparent animate-gradient">
                  in action
                </span>
              </h1>

              <p className="text-base md:text-lg text-gray-300 max-w-md mx-auto lg:mx-0">
                Watch how our AI agents autonomously monitor patients, predict emergencies, and connect care teams in real time.
              </p>

              <div className="flex flex-wrap gap-3 justify-center lg:justify-start">
                <Link
                  to="/register"
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-medium hover:scale-105 transition-transform flex items-center gap-2 shadow-lg shadow-primary/50"
                >
                  <Play size={18} /> Start Free Trial
                </Link>
                <a
                  href="#demo-video"
                  className="px-6 py-3 rounded-xl border border-white/20 text-white font-medium hover:bg-white/10 transition-all flex items-center gap-2 backdrop-blur-sm"
                >
                  Watch Demo <ChevronRight size={18} />
                </a>
              </div>

              {/* Badges with icons */}
              <div className="flex flex-wrap gap-2 justify-center lg:justify-start pt-4">
                {[
                  { label: 'AI‑Powered', icon: Brain },
                  { label: 'Real‑time Alerts', icon: Bell },
                  { label: 'HIPAA Compliant', icon: Shield },
                  { label: '24/7 Monitoring', icon: Clock },
                ].map(badge => (
                  <span key={badge.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[11px] font-medium text-gray-300 hover:border-primary/30 hover:bg-white/10 transition-colors cursor-default">
                    <badge.icon size={12} className="text-primary" />
                    {badge.label}
                  </span>
                ))}
              </div>

              {/* Social proof */}
              <div className="flex items-center gap-4 justify-center lg:justify-start pt-4">
                <div className="flex -space-x-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/40 to-secondary/40 border-2 border-black flex items-center justify-center text-xs font-bold text-white">
                      {String.fromCharCode(64 + i)}
                    </div>
                  ))}
                </div>
                <div className="text-xs text-gray-400">
                  <span className="font-bold text-primary">2,500+</span> healthcare providers
                </div>
              </div>
            </motion.div>

            {/* Right side: Video with fixed thumbnail */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
              className="relative"
              id="demo-video"
            >
              <div className="absolute -inset-1 bg-gradient-to-r from-primary/40 to-secondary/40 rounded-2xl blur-xl opacity-50 group-hover:opacity-75 transition-opacity duration-500" />
              <div className="relative rounded-2xl overflow-hidden border border-white/20 bg-black/60 backdrop-blur-sm shadow-2xl aspect-video">
                {/* Thumbnail - object-contain shows full image without cropping */}
                <img
                  ref={posterRef}
                  src="/thumbnail.png"
                  alt="Video thumbnail"
                  className="absolute inset-0 w-full h-full object-contain bg-black z-10 pointer-events-none transition-opacity duration-300"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <video
                  ref={videoRef}
                  className="w-full h-full object-cover relative z-0"
                  controls
                  onPlay={handlePlay}
                  onEnded={handleEnded}
                  poster=""
                >
                  <source src="/Care-Netra.mp4" type="video/mp4" />
                  Your browser does not support the video tag.
                </video>
                {/* Floating overlay stats */}
                <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md rounded-lg px-3 py-1.5 text-xs font-medium shadow-md border border-white/20 flex items-center gap-1.5 z-20">
                  <Activity size={12} className="text-emerald-400" />
                  AI Monitoring Active
                </div>
                <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md rounded-lg px-3 py-1.5 text-xs font-medium shadow-md border border-white/20 flex items-center gap-1.5 z-20">
                  <Shield size={12} className="text-primary" />
                  HIPAA Compliant
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-gray-500 uppercase tracking-widest">Scroll to explore</span>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
              className="text-primary"
            >
              <ChevronDown size={20} />
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* ===== Detailed Product Explanation ===== */}
      <section className="py-24 bg-white/5 relative">
        <div className="container mx-auto px-4">
          <FadeUp className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              How CARENETRA <span className="gradient-text">saves lives</span>
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto text-base">
              Our platform combines 5 AI agents, a risk scoring ML model, and a volunteer response network to create the most responsive clinical monitoring system available.
            </p>
          </FadeUp>
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {[
              { icon: Brain, title: 'Symptom Intelligence', desc: 'NVIDIA‑powered LLM extracts structured health data from free‑form text & voice.' },
              { icon: Camera, title: 'Wound Analysis', desc: 'OpenCV detects redness, swelling, texture changes — no external API needed.' },
              { icon: Activity, title: 'Risk Scoring', desc: 'GradientBoostingClassifier (97.7% accuracy) predicts risk tier in real time.' },
              { icon: Bell, title: 'Escalation Engine', desc: 'Automatically notifies doctors, family, or volunteers based on severity.' },
              { icon: Heart, title: 'Fall Detection', desc: 'Built‑in accelerometer detects hard falls and triggers emergency alerts.' },
              { icon: Users, title: 'Volunteer Network', desc: 'Nearby volunteers receive SMS alerts and can respond to emergencies.' },
            ].map((item, i) => (
              <FadeUp key={i} delay={i * 0.05}>
                <GlowCard className="p-6 h-full">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <item.icon size={24} className="text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2 text-white">{item.title}</h3>
                  <p className="text-sm text-gray-400">{item.desc}</p>
                </GlowCard>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Interactive Features ===== */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <FadeUp className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything you need to{' '}
              <span className="gradient-text">deliver proactive care</span>
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Powerful features designed for modern healthcare teams.
            </p>
          </FadeUp>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <FadeUp key={i} delay={i * 0.05}>
                <GlowCard className="p-6 h-full flex flex-col group">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <f.icon size={24} className="text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2 text-white">{f.title}</h3>
                  <p className="text-sm text-gray-400 flex-1">{f.desc}</p>
                </GlowCard>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ===== How It Works ===== */}
      <section className="py-24 bg-white/5 relative">
        <div className="container mx-auto px-4">
          <FadeUp className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              From data to{' '}
              <span className="gradient-text">life‑saving alerts</span>
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              A seamless pipeline from patient data to emergency response.
            </p>
          </FadeUp>
          <div className="relative max-w-4xl mx-auto">
            <div className="hidden md:block absolute left-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-primary/50 via-primary/20 to-transparent -translate-x-1/2" />
            {steps.map((step, idx) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, x: idx % 2 === 0 ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: idx * 0.1 }}
                className={`flex items-center gap-4 mb-8 ${idx % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'} relative`}
              >
                <div className="flex-1 md:flex md:justify-end">
                  <GlowCard className="p-5 max-w-sm">
                    <p className="text-sm font-semibold text-primary">Step {step.step}</p>
                    <h3 className="font-semibold mt-1 text-white">{step.title}</h3>
                    <p className="text-xs text-gray-400 mt-1">{step.desc}</p>
                  </GlowCard>
                </div>
                <div className="w-10 h-10 rounded-full bg-primary/10 border-4 border-primary/20 flex items-center justify-center shrink-0 z-10">
                  <span className="text-sm font-bold text-primary">{step.step}</span>
                </div>
                <div className="flex-1 hidden md:block" />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Trust & Security ===== */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <FadeUp className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Your data,{' '}
              <span className="gradient-text">always protected</span>
            </h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              Enterprise-grade security with healthcare compliance at heart.
            </p>
          </FadeUp>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Shield, title: 'HIPAA Compliant', desc: 'Full compliance with healthcare privacy standards' },
              { icon: Wifi, title: '99.9% Uptime', desc: 'Reliable infrastructure with global coverage' },
              { icon: Lock, title: 'End-to-End Encrypted', desc: 'Your data is always protected in transit and at rest' },
              { icon: Award, title: 'SOC 2 Type II', desc: 'Audited security controls and processes' },
            ].map((item, i) => (
              <FadeUp key={i} delay={i * 0.05}>
                <GlowCard className="p-6 text-center h-full">
                  <div className="w-12 h-12 mx-auto rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <item.icon size={24} className="text-primary" />
                  </div>
                  <h3 className="font-semibold text-white">{item.title}</h3>
                  <p className="text-xs text-gray-400 mt-1">{item.desc}</p>
                </GlowCard>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Stats Section ===== */}
      <section className="py-16 bg-gradient-to-r from-primary/5 to-secondary/5">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '15k+', label: 'Patients Monitored' },
              { value: '97.7%', label: 'Prediction Accuracy' },
              { value: '&lt; 2s', label: 'Alert Response' },
              { value: '24/7', label: 'Global Coverage' },
            ].map((stat, i) => (
              <FadeUp key={i} delay={i * 0.1}>
                <div className="space-y-2">
                  <div className="text-3xl md:text-4xl font-bold gradient-text">{stat.value}</div>
                  <div className="text-sm text-gray-400">{stat.label}</div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Final CTA ===== */}
      <section className="py-24 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5 pointer-events-none" />
        <div className="container mx-auto px-4 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="max-w-3xl mx-auto space-y-6"
          >
            <h2 className="text-3xl md:text-5xl font-bold">
              Start monitoring smarter with{' '}
              <span className="gradient-text">CARENETRA</span>
            </h2>
            <p className="text-lg text-gray-400">
              Join thousands of healthcare providers who trust our platform for proactive patient care.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                to="/register"
                className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-primary to-secondary text-white font-medium hover:scale-105 transition-transform flex items-center gap-2 shadow-lg shadow-primary/25"
              >
                Start Free Trial <ArrowRight size={18} />
              </Link>
              <a
                href="#demo-video"
                className="px-8 py-3.5 rounded-xl border border-white/20 bg-black/50 backdrop-blur-sm text-white font-medium hover:bg-white/10 transition-all flex items-center gap-2"
              >
                <Play size={18} /> Watch Demo Again
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8">
        <div className="container mx-auto px-4 text-center text-xs text-gray-500">
          <div className="flex flex-wrap justify-center gap-6 mb-4">
            <a href="#" className="hover:text-primary transition-colors">About</a>
            <a href="#" className="hover:text-primary transition-colors">Privacy</a>
            <a href="#" className="hover:text-primary transition-colors">Terms</a>
            <a href="#" className="hover:text-primary transition-colors">Security</a>
            <a href="#" className="hover:text-primary transition-colors">Contact</a>
          </div>
          <p>© 2025 CARENETRA. All rights reserved.</p>
        </div>
      </footer>

      <style>{`
        @keyframes float-slow {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(20px, 20px) rotate(5deg); }
        }
        @keyframes float-slower {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(-15px, 15px) rotate(-3deg); }
        }
        @keyframes gradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-float-slow {
          animation: float-slow 12s ease-in-out infinite;
        }
        .animate-float-slower {
          animation: float-slower 15s ease-in-out infinite;
        }
        .animate-gradient {
          animation: gradient 3s ease infinite;
          background-size: 200% auto;
        }
        .gradient-text {
          background: linear-gradient(135deg, #3b82f6, #a855f7, #ec4899);
          background-size: 200% auto;
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
          animation: gradient 3s ease infinite;
        }
        .bg-grid-pattern {
          background-image: url("data:image/svg+xml,%3Csvg width='40' height='40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0z' fill='none' stroke='rgba(255,255,255,0.03)' stroke-width='1'/%3E%3C/svg%3E");
        }
      `}</style>
    </div>
  );
};

export default DemoPage;