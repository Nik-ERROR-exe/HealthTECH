import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, useInView } from 'framer-motion';
import { Shield, Activity, Brain, Clock, ArrowRight, Heart, Users, Zap } from 'lucide-react';
import Navbar from '@/components/Navbar';
import CarenetraDNA from '@/components/CarenetraDNA'; // ← NEW
import { useTranslation } from 'react-i18next';

// ===== Animations =====
const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.7,
      ease: [0.25, 0.1, 0.25, 1],
    },
  }),
};

const features = [
  { icon: Brain, title: 'AI-Powered Monitoring', desc: 'Intelligent agents track patient health 24/7 and flag concerns automatically.' },
  { icon: Activity, title: 'Real-Time Vitals', desc: 'Live dashboards with health metrics, risk scores, and trend analysis.' },
  { icon: Shield, title: 'Emergency Alerts', desc: 'Instant notifications when critical thresholds are breached.' },
  { icon: Clock, title: 'Medication Tracking', desc: 'Automated reminders and adherence monitoring for every patient.' },
  { icon: Heart, title: 'Daily Check-ins', desc: 'Voice and text-based check-ins to capture patient well-being.' },
  { icon: Users, title: 'Doctor-Patient Connect', desc: 'Seamless communication between care teams and patients.' },
];

const steps = [
  { num: '01', title: 'Patient Enrolls', desc: 'Patients register and receive a unique ID for their care journey.' },
  { num: '02', title: 'Doctor Creates Course', desc: 'Doctors set up personalized medical courses with medications and schedules.' },
  { num: '03', title: 'AI Monitors Daily', desc: 'Our agent conducts daily check-ins and monitors all health data.' },
  { num: '04', title: 'Alerts & Action', desc: 'Critical changes trigger instant alerts for immediate medical response.' },
];

const LandingPage = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isDark, setIsDark] = useState(false); // simplified, you can wire real theme later

  useEffect(() => {
    let lenis: any;
    const initLenis = async () => {
      const Lenis = (await import('@studio-freight/lenis')).default;
      lenis = new Lenis({
        duration: 1.2,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        wheelMultiplier: 1.2,
        touchMultiplier: 2,
      });

      const updateProgress = () => {
        const scroll = lenis.scroll || window.scrollY;
        const limit = lenis.limit || document.documentElement.scrollHeight - window.innerHeight;
        setScrollProgress(limit > 0 ? Math.min(1, scroll / limit) : 0);
      };

      lenis.on('scroll', updateProgress);
      const raf = (time: number) => { lenis.raf(time); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
      updateProgress();
    };
    initLenis();
    return () => {};
  }, []);

  const footerLogoSrc = isDark ? '/CareNetra_black.png' : '/CareNetra_white.png';

  return (
    <div ref={containerRef} className="min-h-screen bg-background text-foreground">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden section-padding min-h-[85vh] flex items-center">
        <div className="container mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <motion.div initial="hidden" animate="visible" className="space-y-6">
            <motion.div custom={0} variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
              <Zap size={14} /> Intelligent Healthcare Platform
            </motion.div>
            <motion.h1 custom={1} variants={fadeUp} className="text-4xl sm:text-5xl lg:text-6xl font-bold text-foreground leading-tight">
              Healthcare that <span className="gradient-text">watches over</span> your patients
            </motion.h1>
            <motion.p custom={2} variants={fadeUp} className="text-lg text-muted-foreground max-w-lg">
              CARENETRA uses AI agents to monitor patients 24/7, enabling proactive care, timely alerts, and better outcomes.
            </motion.p>
            <motion.div custom={3} variants={fadeUp} className="flex flex-wrap gap-3">
              <Link to="/register" className="px-6 py-3 rounded-lg gradient-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity flex items-center gap-2">
                Start Free <ArrowRight size={16} />
              </Link>
              <Link to="/#features" className="px-6 py-3 rounded-lg border border-border text-foreground font-medium hover:bg-muted transition-colors">
                Learn More
              </Link>
            </motion.div>
            <motion.div custom={4} variants={fadeUp} className="flex items-center gap-6 pt-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">10k+</p>
                <p className="text-xs text-muted-foreground">Patients</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">500+</p>
                <p className="text-xs text-muted-foreground">Doctors</p>
              </div>
              <div className="w-px h-8 bg-border" />
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">99.9%</p>
                <p className="text-xs text-muted-foreground">Uptime</p>
              </div>
            </motion.div>
          </motion.div>

          {/* RIGHT COLUMN – 3D DNA (NEW) */}
<div className="relative w-full hidden sm:block">
  <div className="h-[350px] sm:h-[400px] md:h-[450px] lg:h-[700px] w-full">
    <CarenetraDNA scrollProgress={scrollProgress} className="w-full h-full" />
  </div>

  {/* Floating badges – professional touch */}
  <div className="absolute top-4 sm:top-10 right-0 lg:right-[-20px] glass-card px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium shadow-lg border-primary/20">
    <Activity size={14} className="inline mr-1 sm:mr-2 text-primary" />
    Real-time Monitoring
  </div>
  <div className="absolute bottom-4 sm:bottom-10 left-0 lg:left-[-20px] glass-card px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium shadow-lg border-secondary/20">
    <Shield size={14} className="inline mr-1 sm:mr-2 text-secondary" />
    HIPAA Compliant
  </div>
</div>
        </div>
      </section>

      {/* Trust Bar */}
      <section className="py-8 sm:py-12 border-y border-border/30 bg-muted/10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <p className="text-xs sm:text-sm text-muted-foreground uppercase tracking-wider mb-4 sm:mb-6">
              Trusted by leading healthcare institutions
            </p>
            <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-6 md:gap-8 lg:gap-12">
              {['🏥 Mayo Clinic', '🏥 Cleveland Clinic', '🏥 Apollo Hospitals', '🏥 NHS'].map((name, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center gap-1.5 sm:gap-2 text-foreground/70 hover:text-foreground transition-colors"
                >
                  <span className="text-xl sm:text-2xl">🏥</span>
                  <span className="font-medium text-xs sm:text-sm">{name}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="section-padding bg-muted/50">
        <div className="container mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} className="text-center mb-16">
            <motion.p custom={0} variants={fadeUp} className="text-sm font-medium text-primary mb-2">Features</motion.p>
            <motion.h2 custom={1} variants={fadeUp} className="text-3xl sm:text-4xl font-bold text-foreground">Everything you need for modern care</motion.h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 lg:gap-8">
            {features.map((feature, i) => {
              const ref = useRef(null);
              const isInView = useInView(ref, { once: true, margin: "-50px" });
              return (
                <motion.div
                  ref={ref}
                  key={feature.title}
                  initial={{ opacity: 0, y: 30 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: i * 0.1, duration: 0.5 }}
                  className="group relative rounded-2xl bg-gradient-to-br from-card/90 to-card/50 backdrop-blur-xl border border-border p-5 sm:p-6 lg:p-8 hover:shadow-2xl hover:-translate-y-1.5 transition-all duration-300"
                >
                  <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <div className="relative z-10">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4 sm:mb-6 group-hover:bg-primary/20 group-hover:scale-110 transition-all duration-300">
                      <feature.icon size={24} className="sm:size-28 text-primary" />
                    </div>
                    <h3 className="text-lg sm:text-xl font-semibold mb-2 sm:mb-3">{feature.title}</h3>
                    <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{feature.desc}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="section-padding">
        <div className="container mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} className="text-center mb-16">
            <motion.p custom={0} variants={fadeUp} className="text-sm font-medium text-primary mb-2">How It Works</motion.p>
            <motion.h2 custom={1} variants={fadeUp} className="text-3xl sm:text-4xl font-bold text-foreground">Simple, effective care in 4 steps</motion.h2>
          </motion.div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 relative">
            <div className="hidden lg:block absolute top-20 left-[12%] right-[12%] h-0.5 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

            {steps.map((step, i) => {
              const ref = useRef(null);
              const isInView = useInView(ref, { once: true, margin: "-50px" });
              return (
                <motion.div
                  ref={ref}
                  key={step.num}
                  initial={{ opacity: 0, y: 30 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: i * 0.15, duration: 0.6 }}
                  className="text-center relative"
                >
                  <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-xl shadow-primary/30 relative z-10">
                    <span className="text-xl sm:text-2xl font-bold text-white">{step.num}</span>
                  </div>
                  <h3 className="text-lg sm:text-xl font-semibold mb-2 sm:mb-3">{step.title}</h3>
                  <p className="text-sm sm:text-base text-muted-foreground">{step.desc}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials (simplified static) */}
      <section id="testimonials" className="py-16 sm:py-24 lg:py-32 bg-muted/20">
        <div className="container mx-auto px-4 text-center">
          <motion.h2 variants={fadeUp} custom={1} className="text-2xl sm:text-3xl font-bold mb-4">Trusted by healthcare professionals</motion.h2>
          <motion.p variants={fadeUp} custom={2} className="text-muted-foreground">"CARENETRA has transformed how we monitor our post‑op patients. The AI insights are invaluable." — Dr. Smith, Cardiology</motion.p>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24 lg:py-32">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="glass-card p-12 text-center gradient-primary rounded-2xl"
          >
            <motion.h2 custom={0} variants={fadeUp} className="text-3xl sm:text-4xl font-bold text-primary-foreground mb-4">Ready to transform patient care?</motion.h2>
            <motion.p custom={1} variants={fadeUp} className="text-primary-foreground/80 mb-8 max-w-lg mx-auto">Join thousands of healthcare providers using CARENETRA to deliver proactive, AI-powered care.</motion.p>
            <motion.div custom={2} variants={fadeUp}>
              <Link to="/register" className="inline-flex items-center gap-2 px-8 py-3 rounded-lg bg-background text-foreground font-medium hover:opacity-90 transition-opacity">
                Get Started Free <ArrowRight size={16} />
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 py-8 sm:py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src={footerLogoSrc}
                alt="CARENETRA Logo"
                className="h-8 w-auto sm:h-10"
              />
              <span className="font-semibold text-lg sm:text-xl">CARENETRA</span>
            </div>
            <span className="font-semibold text-foreground">CARENETRA</span>
          </div>
          <p className="text-sm text-muted-foreground">© 2025 CARENETRA. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;