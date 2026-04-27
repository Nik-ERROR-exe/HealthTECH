import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import {
  Play, Shield, Zap, Brain, Activity, Users, Clock, ArrowRight, CheckCircle2,
  Sparkles, Wifi, BarChart3, Bell, MessageSquare, Bot, GraduationCap,
  Laptop, ChevronRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '@/components/Navbar';
import Lenis from '@studio-freight/lenis';
import { useEffect } from 'react';

// ---------- Reusable UI Components ----------

const FadeUp = ({ children, delay = 0, className = '' }: any) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-80px' });
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
};

const GlowCard = ({ children, className = '' }: any) => (
  <div className={`relative group rounded-2xl border border-border/50 backdrop-blur-xl bg-card/40 hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 ${className}`}>
    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    <div className="relative z-10">{children}</div>
  </div>
);

// ---------- Main DemoPage Component ----------

const DemoPage = () => {
  useEffect(() => {
    const lenis = new Lenis({ duration: 1.2, easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), smoothWheel: true, wheelMultiplier: 1.2, touchMultiplier: 2 });
    const raf = (time: number) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    return () => lenis.destroy();
  }, []);

  const features = [
    { icon: Brain, title: 'AI Health Predictions', desc: 'Advanced models forecast complications before they happen.' },
    { icon: Activity, title: 'Real‑time Monitoring', desc: 'Live dashboards with vitals, trends, and risk scores.' },
    { icon: Bell, title: 'Emergency Alerts', desc: 'Instant notifications when critical thresholds are crossed.' },
    { icon: GraduationCap, title: 'Medication Adherence', desc: 'Smart reminders and adherence tracking for every patient.' },
    { icon: MessageSquare, title: 'Doctor‑Patient Chat', desc: 'Secure, built‑in messaging for care teams.' },
    { icon: Bot, title: 'Voice AI Assistant', desc: 'CARA, our AI agent, conducts daily check‑ins via voice & text.' },
  ];

  const steps = [
    { step: 1, title: 'Collect Patient Data', desc: 'Wearables, manual inputs, and sensors feed the platform.' },
    { step: 2, title: 'AI Analysis', desc: 'Our models process vitals, symptoms, and history in real time.' },
    { step: 3, title: 'Risk Detection', desc: 'Abnormal patterns trigger alerts and predictions.' },
    { step: 4, title: 'Smart Notifications', desc: 'Doctors and family receive instant, actionable alerts.' },
    { step: 5, title: 'Continuous Learning', desc: 'The system improves with every data point.' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground overflow-x-hidden">
      <Navbar />

      {/* ===== Hero Section ===== */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[150px] animate-float-slow" />
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-secondary/10 rounded-full blur-[120px] animate-float-slower" />
        <div className="container mx-auto px-4 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
            className="space-y-6 max-w-4xl mx-auto"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium border border-primary/20">
              <Sparkles size={14} className="animate-pulse" /> Interactive Demo Experience
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight">
              See CARENETRA{' '}
              <span className="gradient-text">in action</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
              Watch our AI‑powered platform monitor patients, predict risks, and alert care teams — all in real time.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/register" className="px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-secondary text-primary-foreground font-medium hover:scale-105 transition-transform flex items-center gap-2 shadow-lg shadow-primary/25">
                <Play size={18} /> Start Free Trial
              </Link>
              <a href="#demo-video" className="px-6 py-3 rounded-xl border-2 border-border text-foreground font-medium hover:bg-muted/80 transition-all flex items-center gap-2">
                Watch Demo <ChevronRight size={18} />
              </a>
            </div>
            <div className="flex flex-wrap justify-center gap-3 pt-4">
              {['AI‑Powered', 'Real‑time Alerts', 'HIPAA Compliant', '24/7 Monitoring'].map(badge => (
                <span key={badge} className="px-4 py-1.5 rounded-full bg-primary/5 border border-primary/10 text-xs font-medium text-muted-foreground">
                  {badge}
                </span>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ===== Demo Video Showcase ===== */}
      <section id="demo-video" className="py-20 relative">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <FadeUp delay={0}>
              <div className="space-y-5">
                <h2 className="text-3xl md:text-4xl font-bold">
                  Watch the future of{' '}
                  <span className="gradient-text">patient monitoring</span>
                </h2>
                <p className="text-muted-foreground text-lg">
                  Our AI‑powered platform transforms how care teams monitor patients, predict emergencies, and collaborate.
                </p>
                <ul className="space-y-3">
                  {['Real‑time vitals dashboard', 'AI risk detection & alerts', 'Medication tracking & adherence', 'Secure doctor‑patient messaging'].map((item, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-foreground/80">
                      <CheckCircle2 size={16} className="text-emerald-400 shrink-0" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
            </FadeUp>
            <FadeUp delay={0.2}>
              <GlowCard className="p-1">
                <div className="rounded-xl overflow-hidden bg-background/50 aspect-video relative flex items-center justify-center">
                  {/* Replace with actual video embed or placeholder */}
                  <div className="text-center space-y-3">
                    <div className="w-20 h-20 mx-auto rounded-full bg-primary/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Play size={32} className="text-primary ml-1" />
                    </div>
                    <p className="text-sm text-muted-foreground">Product Demo Video</p>
                  </div>
                  {/* Floating animated stats */}
                  <div className="absolute top-4 left-4 bg-card/80 backdrop-blur-md rounded-xl px-3 py-2 text-xs font-medium shadow-md border border-border/50">
                    99.9% Uptime
                  </div>
                  <div className="absolute bottom-4 right-4 bg-card/80 backdrop-blur-md rounded-xl px-3 py-2 text-xs font-medium shadow-md border border-border/50">
                    <Activity size={12} className="inline mr-1 text-primary" /> AI Monitoring
                  </div>
                </div>
              </GlowCard>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ===== Live Product Preview ===== */}
      <section className="py-20 bg-muted/10 relative">
        <div className="container mx-auto px-4">
          <FadeUp className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Powered by intelligent{' '}
              <span className="gradient-text">analytics</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              A sneak peek into the live dashboards doctors and patients see every day.
            </p>
          </FadeUp>
          <div className="grid md:grid-cols-3 gap-6">
            {[ 
              { title: 'Real‑time Vitals', icon: Activity, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
              { title: 'AI Risk Score', icon: Brain, color: 'text-purple-400', bg: 'bg-purple-500/10' },
              { title: 'Medication Adherence', icon: GraduationCap, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="glass-card p-6 rounded-2xl border border-border/50 hover:border-primary/30 transition-all"
              >
                <div className={`w-12 h-12 rounded-xl ${item.bg} flex items-center justify-center mb-4`}>
                  <item.icon size={22} className={item.color} />
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <div className="h-24 bg-muted/50 rounded-lg flex items-center justify-center text-xs text-muted-foreground">
                  [Live Chart Preview]
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Interactive Features ===== */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <FadeUp className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything you need to{' '}
              <span className="gradient-text">deliver proactive care</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Powerful features designed for modern healthcare teams.
            </p>
          </FadeUp>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f, i) => (
              <FadeUp key={i} delay={i * 0.05}>
                <GlowCard className="p-6 h-full flex flex-col">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <f.icon size={24} className="text-primary" />
                  </div>
                  <h3 className="font-semibold mb-2">{f.title}</h3>
                  <p className="text-sm text-muted-foreground flex-1">{f.desc}</p>
                </GlowCard>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ===== How It Works ===== */}
      <section className="py-20 bg-muted/10 relative">
        <div className="container mx-auto px-4">
          <FadeUp className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              From data to{' '}
              <span className="gradient-text">life‑saving alerts</span>
            </h2>
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
                    <h3 className="font-semibold mt-1">{step.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1">{step.desc}</p>
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
      <section className="py-20">
        <div className="container mx-auto px-4">
          <FadeUp className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Your data,{' '}
              <span className="gradient-text">always protected</span>
            </h2>
          </FadeUp>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Shield, title: 'HIPAA Compliant' },
              { icon: Wifi, title: '99.9% Uptime' },
              { icon: BarChart3, title: 'AI Reliability' },
              { icon: Laptop, title: 'Encrypted Data' },
            ].map((item, i) => (
              <FadeUp key={i} delay={i * 0.05}>
                <GlowCard className="p-6 text-center">
                  <div className="w-12 h-12 mx-auto rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                    <item.icon size={24} className="text-primary" />
                  </div>
                  <h3 className="font-semibold">{item.title}</h3>
                </GlowCard>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ===== Final CTA ===== */}
      <section className="py-20 relative">
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
            <p className="text-lg text-muted-foreground">
              Join thousands of healthcare providers who trust our platform for proactive patient care.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/register" className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-primary to-secondary text-primary-foreground font-medium hover:scale-105 transition-transform flex items-center gap-2 shadow-lg shadow-primary/25">
                Start Free Trial <ArrowRight size={18} />
              </Link>
              <a href="#demo-video" className="px-8 py-3.5 rounded-xl border-2 border-border bg-background/50 backdrop-blur-sm text-foreground font-medium hover:bg-muted/80 transition-all flex items-center gap-2">
                <Play size={18} /> Watch Demo Again
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer can be minimal or reuse existing footer */}
      <footer className="border-t border-border/50 py-8">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground">
          © 2026 CARENETRA. All rights reserved.
        </div>
      </footer>
    </div>
  );
};

export default DemoPage;