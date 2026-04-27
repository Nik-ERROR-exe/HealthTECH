import { useEffect, useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import {
  Shield, Activity, Brain, Clock, ArrowRight, Heart, Users, Zap,
  ChevronDown, Sparkles, Star, Quote, UserCircle, Plus, ChevronLeft, ChevronRight
} from 'lucide-react';
import Navbar from '@/components/Navbar';
import CarenetraDNA from '@/components/CarenetraDNA';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import SplitText from '@/components/SplitText';
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

// ===== Data =====
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

const stats = [
  { value: '10k+', label: 'Patients', icon: Users },
  { value: '500+', label: 'Doctors', icon: Heart },
  { value: '99.9%', label: 'Uptime', icon: Shield },
];

const partners = [
  { name: 'Mayo Clinic', logo: '🏥' },
  { name: 'Cleveland Clinic', logo: '❤️' },
  { name: 'Johns Hopkins', logo: '🔬' },
  { name: 'Mass General', logo: '⚕️' },
  { name: 'Stanford Health', logo: '🌲' },
];

// ===== Types =====
interface Testimonial {
  id: string;
  name: string;
  role?: string;
  rating: number;
  comment: string;
  avatar?: string;
}

const StatCard = ({ stat, index }: { stat: typeof stats[0]; index: number }) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ delay: index * 0.1, duration: 0.5 }}
      className="group relative overflow-hidden rounded-xl sm:rounded-2xl bg-gradient-to-br from-background/80 to-background/40 backdrop-blur-xl border border-border/50 p-2 sm:p-3 lg:p-4 shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative z-10 flex flex-row items-center gap-2 sm:gap-3">
        <div className="flex h-8 w-8 sm:h-10 sm:w-10 lg:h-12 lg:w-12 items-center justify-center rounded-lg sm:rounded-xl bg-primary/10 group-hover:scale-110 transition-transform duration-300 shrink-0">
          <stat.icon size={18} className="sm:size-20 lg:size-22 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-lg sm:text-xl lg:text-2xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent leading-tight">
            {stat.value}
          </p>
          <p className="text-[10px] sm:text-xs text-muted-foreground truncate">{stat.label}</p>
        </div>
      </div>
    </motion.div>
  );
};

// ===== Testimonial Card Component =====
const TestimonialCard = ({ testimonial }: { testimonial: Testimonial }) => {
  return (
    <div className="group relative h-full rounded-2xl bg-gradient-to-br from-card/90 to-card/50 backdrop-blur-xl border border-border p-5 sm:p-6 lg:p-7 hover:shadow-xl transition-all duration-300 hover:scale-[1.02] flex flex-col">
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/5 to-secondary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative z-10 flex-1 flex flex-col">
        <Quote className="w-8 h-8 text-primary/30 mb-4" />
        <div className="flex items-center gap-1 mb-4">
          {[...Array(5)].map((_, i) => (
            <Star
              key={i}
              size={16}
              className={i < testimonial.rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}
            />
          ))}
        </div>
        <p className="text-foreground/90 leading-relaxed text-sm sm:text-base mb-6 flex-1">
          "{testimonial.comment}"
        </p>
        <div className="flex items-center gap-3 mt-auto pt-4 border-t border-border/50">
          {testimonial.avatar ? (
            <img src={testimonial.avatar} alt={testimonial.name} className="w-10 h-10 rounded-full object-cover" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <UserCircle size={24} className="text-primary" />
            </div>
          )}
          <div>
            <p className="font-semibold text-foreground text-sm sm:text-base">{testimonial.name}</p>
            {testimonial.role && <p className="text-xs text-muted-foreground">{testimonial.role}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

// ===== Testimonials Carousel Component =====
const TestimonialsCarousel = ({ testimonials }: { testimonials: Testimonial[] }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoRotateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const extendedTestimonials = [...testimonials, ...testimonials, ...testimonials];
  const totalSlides = testimonials.length;

  const startAutoRotate = useCallback(() => {
    if (autoRotateIntervalRef.current) clearInterval(autoRotateIntervalRef.current);
    autoRotateIntervalRef.current = setInterval(() => {
      if (!isHovered && !isTransitioning) {
        setCurrentIndex(prev => prev + 1);
      }
    }, 2500);
  }, [isHovered, isTransitioning]);

  useEffect(() => {
    startAutoRotate();
    return () => {
      if (autoRotateIntervalRef.current) clearInterval(autoRotateIntervalRef.current);
    };
  }, [startAutoRotate]);

  useEffect(() => {
    if (currentIndex >= totalSlides * 2) {
      setTimeout(() => {
        setIsTransitioning(true);
        setCurrentIndex(currentIndex - totalSlides);
        setTimeout(() => setIsTransitioning(false), 50);
      }, 300);
    } else if (currentIndex < 0) {
      setTimeout(() => {
        setIsTransitioning(true);
        setCurrentIndex(currentIndex + totalSlides);
        setTimeout(() => setIsTransitioning(false), 50);
      }, 300);
    }
  }, [currentIndex, totalSlides]);

  const goToNext = () => {
    if (!isTransitioning) {
      setIsTransitioning(true);
      setCurrentIndex(prev => prev + 1);
      setTimeout(() => setIsTransitioning(false), 500);
    }
  };

  const goToPrev = () => {
    if (!isTransitioning) {
      setIsTransitioning(true);
      setCurrentIndex(prev => prev - 1);
      setTimeout(() => setIsTransitioning(false), 500);
    }
  };

  const goToSlide = (index: number) => {
    if (!isTransitioning) {
      setIsTransitioning(true);
      setCurrentIndex(index);
      setTimeout(() => setIsTransitioning(false), 500);
    }
  };

  const getTranslateX = () => {
    if (!containerRef.current) return 0;
    const width = containerRef.current.offsetWidth;
    let cardsPerView = 1;
    if (width >= 1024) cardsPerView = 3;
    else if (width >= 768) cardsPerView = 2;
    const cardWidth = width / cardsPerView;
    return -(currentIndex * cardWidth);
  };

  const dotIndex = Math.floor(currentIndex % totalSlides);

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="overflow-hidden">
        <div
          ref={containerRef}
          className="flex transition-transform duration-500 ease-in-out"
          style={{ transform: `translateX(${getTranslateX()}px)` }}
        >
          {extendedTestimonials.map((testimonial, idx) => (
            <div
              key={`${testimonial.id}-${idx}`}
              className="w-full md:w-1/2 lg:w-1/3 flex-shrink-0 px-2 sm:px-3"
            >
              <TestimonialCard testimonial={testimonial} />
            </div>
          ))}
        </div>
      </div>

      <button
        onClick={goToPrev}
        className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 md:-translate-x-4 lg:-translate-x-6 w-8 h-8 md:w-10 md:h-10 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg items-center justify-center hover:bg-background transition-colors z-10"
        aria-label="Previous testimonial"
      >
        <ChevronLeft size={20} />
      </button>
      <button
        onClick={goToNext}
        className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 md:translate-x-4 lg:translate-x-6 w-8 h-8 md:w-10 md:h-10 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg items-center justify-center hover:bg-background transition-colors z-10"
        aria-label="Next testimonial"
      >
        <ChevronRight size={20} />
      </button>

      <div className="flex justify-center gap-2 mt-6 sm:mt-8">
        {testimonials.map((_, idx) => (
          <button
            key={idx}
            onClick={() => goToSlide(idx)}
            className={`h-2 rounded-full transition-all ${
              idx === dotIndex
                ? 'w-6 sm:w-8 bg-primary'
                : 'w-2 bg-muted-foreground/30 hover:bg-muted-foreground/50'
            }`}
            aria-label={`Go to testimonial ${idx + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

// ===== Star Rating Input Component =====
const StarRatingInput = ({ rating, setRating }: { rating: number; setRating: (r: number) => void }) => {
  const [hoverRating, setHoverRating] = useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => setRating(star)}
          onMouseEnter={() => setHoverRating(star)}
          onMouseLeave={() => setHoverRating(0)}
          className="focus:outline-none"
        >
          <Star
            size={24}
            className={star <= (hoverRating || rating) ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground/30"}
          />
        </button>
      ))}
    </div>
  );
};

// ===== Main LandingPage Component =====
const LandingPage = () => {
  const { t } = useTranslation();
  const [scrollProgress, setScrollProgress] = useState(0);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([
    {
      id: '1',
      name: 'Dr. Sarah Chen',
      role: 'Chief of Cardiology, Mayo Clinic',
      rating: 5,
      comment: 'CARENETRA has transformed how we monitor post-op patients. The AI alerts have reduced our emergency response times by 40%.',
    },
    {
      id: '2',
      name: 'Dr. Michael Okonkwo',
      role: 'ICU Director, Cleveland Clinic',
      rating: 5,
      comment: 'The real-time vitals dashboard is a game-changer. I can check on all my critical patients from anywhere.',
    },
    {
      id: '3',
      name: 'Dr. Emily Rodriguez',
      role: 'Family Medicine, Stanford Health',
      rating: 4,
      comment: 'Daily check-ins have improved medication adherence among my elderly patients significantly.',
    },
    {
      id: '4',
      name: 'Dr. James Wilson',
      role: 'Neurology, Johns Hopkins',
      rating: 5,
      comment: 'The AI predictive insights have helped us catch early warning signs we would have otherwise missed.',
    },
    {
      id: '5',
      name: 'Dr. Lisa Thompson',
      role: 'Pediatrics, Mass General',
      rating: 5,
      comment: 'Parent communication has never been easier. Real-time updates give families peace of mind.',
    },
  ]);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newTestimonial, setNewTestimonial] = useState({
    name: '',
    role: '',
    comment: '',
    rating: 5,
  });

  // Theme state for dynamic logo
  const [isDark, setIsDark] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll();
  const { scrollYProgress } = useScroll({ container: containerRef });

  const heroTextY = useTransform(scrollY, [0, 500], [0, -80]);
  const heroOpacity = useTransform(scrollY, [0, 300], [1, 0.2]);
  const canvasScale = useTransform(scrollYProgress, [0, 0.2], [1, 1.05]);

  const handleAddTestimonial = () => {
    const newEntry: Testimonial = {
      id: Date.now().toString(),
      name: newTestimonial.name,
      role: newTestimonial.role || undefined,
      rating: newTestimonial.rating,
      comment: newTestimonial.comment,
    };
    setTestimonials(prev => [newEntry, ...prev]);
    setNewTestimonial({ name: '', role: '', comment: '', rating: 5 });
    setIsAddDialogOpen(false);
  };

  // Detect dark mode for footer logo
  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsDark(isDarkMode);

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          setIsDark(document.documentElement.classList.contains('dark'));
        }
      });
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Lenis smooth scroll
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

  // Dynamic logo based on theme
  const footerLogoSrc = isDark ? '/CareNetra_black.png' : '/CareNetra_white.png';

  return (
    <div ref={containerRef} className="min-h-screen bg-background text-foreground">
      <Navbar />

      {/* === HERO SECTION – identical to past branch === */}
      <section className="relative min-h-screen flex items-center overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(56,189,248,0.05)_0%,transparent_50%)]" />

        <div className="container mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center min-h-screen py-12 sm:py-20 lg:py-0">
            {/* Left Column – Text Content */}
            <motion.div
              style={{ y: heroTextY, opacity: heroOpacity }}
              className="space-y-5 sm:space-y-6 lg:space-y-8 text-center lg:text-left"
            >
              <motion.div
                initial="hidden"
                animate="visible"
                variants={fadeUp}
                custom={0}
                className="inline-flex items-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-primary/10 text-primary text-xs sm:text-sm font-medium border border-primary/20 backdrop-blur-sm mx-auto lg:mx-0"
              >
                <Sparkles size={14} className="animate-pulse" />
                <span>{t('landing.intelligent_platform', 'Intelligent Healthcare Platform')}</span>
              </motion.div>

              <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.15] tracking-tight text-center lg:text-left">
                <SplitText
                  text={t('landing.healthcare_that', 'Healthcare that')}
                  tag="span"
                  className="inline-block"
                  delay={80}
                  duration={0.8}
                  from={{ opacity: 0, y: 60 }}
                  to={{ opacity: 1, y: 0 }}
                  threshold={0.2}
                  rootMargin="-50px"
                  textAlign="left"
                />{' '}
                <span className="relative inline-block">
                  <span className="gradient-text">{t('landing.watches_over', 'watches over')}</span>
                  <span className="absolute -bottom-1 sm:-bottom-2 left-0 w-full h-0.5 sm:h-1 bg-gradient-to-r from-primary to-secondary rounded-full opacity-60" />
                </span>
                <br />
                <SplitText
                  text={t('landing.your_patients', 'your patients')}
                  tag="span"
                  className="inline-block"
                  delay={80}
                  duration={0.8}
                  from={{ opacity: 0, y: 60 }}
                  to={{ opacity: 1, y: 0 }}
                  threshold={0.2}
                  rootMargin="-50px"
                  textAlign="left"
                />
              </h1>

              <motion.p
                variants={fadeUp}
                custom={2}
                initial="hidden"
                animate="visible"
                className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-lg lg:max-w-none mx-auto lg:mx-0 leading-relaxed"
              >
                {t('landing.hero_description', 'CARENETRA uses AI agents to monitor patients 24/7, enabling proactive care, timely alerts, and better outcomes.')}
              </motion.p>

              <motion.div
                variants={fadeUp}
                custom={3}
                initial="hidden"
                animate="visible"
                className="flex flex-col sm:flex-row flex-wrap gap-3 sm:gap-4 justify-center lg:justify-start"
              >
                <Link
                  to="/register"
                  className="group relative px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl bg-gradient-to-r from-primary to-secondary text-primary-foreground font-medium shadow-lg shadow-primary/25 hover:shadow-xl hover:scale-105 transition-all duration-300 flex items-center justify-center gap-2 overflow-hidden"
                >
                  <span className="relative z-10 text-sm sm:text-base">{t('landing.start_now', 'Start Monitoring Now')}</span>
                  <ArrowRight size={18} className="relative z-10 group-hover:translate-x-1 transition-transform" />
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                </Link>
                <Link
                  to="/demo"
                  className="px-5 sm:px-6 py-3 sm:py-3.5 rounded-xl border-2 border-border bg-background/50 backdrop-blur-sm text-foreground font-medium hover:bg-muted/80 transition-all flex items-center justify-center gap-2"
                >
                  <Activity size={18} />
                  <span className="text-sm sm:text-base">{t('landing.live_demo', 'View Live Demo')}</span>
                </Link>
              </motion.div>

              <motion.div
                variants={fadeUp}
                custom={4}
                initial="hidden"
                animate="visible"
                className="pt-6 sm:pt-8 grid grid-cols-3 gap-3 sm:gap-4"
              >
                {stats.map((stat, idx) => (
                  <StatCard key={stat.label} stat={stat} index={idx} />
                ))}
              </motion.div>
            </motion.div>

            {/* Right Column – 3D DNA Canvas (exactly as past branch) */}
            <motion.div
              style={{ scale: canvasScale }}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1, delay: 0.2 }}
              className="relative w-full hidden sm:block"
            >
              <div className="h-[350px] sm:h-[400px] md:h-[450px] lg:h-[700px] w-full">
                <CarenetraDNA scrollProgress={scrollProgress} className="w-full h-full" />
              </div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 }}
                className="absolute top-4 sm:top-10 right-0 lg:right-[-20px] glass-card px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium shadow-lg border-primary/20"
              >
                <Activity size={14} className="inline mr-1 sm:mr-2 text-primary" />
                {t('landing.realtime_monitoring', 'Real-time Monitoring')}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1 }}
                className="absolute bottom-4 sm:bottom-10 left-0 lg:left-[-20px] glass-card px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium shadow-lg border-secondary/20"
              >
                <Shield size={14} className="inline mr-1 sm:mr-2 text-secondary" />
                HIPAA Compliant
              </motion.div>
            </motion.div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <div className="flex flex-col items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-widest">{t('landing.scroll', 'Scroll to explore')}</span>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
              className="text-primary"
            >
              <ChevronDown size={20} />
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* === TRUST BAR === (same as past branch) */}
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
              {t('landing.trusted_by', 'Trusted by leading healthcare institutions')}
            </p>
            <div className="flex flex-wrap justify-center items-center gap-4 sm:gap-6 md:gap-8 lg:gap-12">
              {partners.map((partner, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center gap-1.5 sm:gap-2 text-foreground/70 hover:text-foreground transition-colors"
                >
                  <span className="text-xl sm:text-2xl">{partner.logo}</span>
                  <span className="font-medium text-xs sm:text-sm">{partner.name}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* === FEATURES SECTION === (unchanged) */}
      <section id="features" className="py-16 sm:py-24 lg:py-32 bg-muted/20 relative">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="text-center max-w-3xl mx-auto mb-12 sm:mb-16"
          >
            <motion.p variants={fadeUp} custom={0} className="text-xs sm:text-sm font-semibold text-primary uppercase tracking-wider mb-2 sm:mb-3">
              {t('landing.features_title', 'Features')}
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-4 sm:mb-6">
              {t('landing.everything_you_need', 'Everything you need for')}{' '}
              <span className="gradient-text">{t('landing.modern_care', 'modern care')}</span>
            </motion.h2>
            <motion.p variants={fadeUp} custom={2} className="text-sm sm:text-base lg:text-lg text-muted-foreground">
              {t('landing.features_desc', 'Powerful tools designed to streamline healthcare delivery and improve patient outcomes.')}
            </motion.p>
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
                    <h3 className="text-lg sm:text-xl font-semibold mb-2 sm:mb-3">{t(`features.${feature.title}`, feature.title)}</h3>
                    <p className="text-sm sm:text-base text-muted-foreground leading-relaxed">{t(`features.${feature.title}_desc`, feature.desc)}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* === HOW IT WORKS === (unchanged) */}
      <section id="how-it-works" className="py-16 sm:py-24 lg:py-32 relative">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            className="text-center max-w-3xl mx-auto mb-12 sm:mb-16"
          >
            <motion.p variants={fadeUp} custom={0} className="text-xs sm:text-sm font-semibold text-primary uppercase tracking-wider mb-2 sm:mb-3">
              {t('landing.how_it_works', 'How It Works')}
            </motion.p>
            <motion.h2 variants={fadeUp} custom={1} className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-4 sm:mb-6">
              {t('landing.simple_effective', 'Simple, effective care in')}{' '}
              <span className="gradient-text">{t('landing.four_steps', '4 steps')}</span>
            </motion.h2>
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
                  <h3 className="text-lg sm:text-xl font-semibold mb-2 sm:mb-3">{t(`steps.${step.title}`, step.title)}</h3>
                  <p className="text-sm sm:text-base text-muted-foreground">{t(`steps.${step.title}_desc`, step.desc)}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* === TESTIMONIALS SECTION === (full carousel) */}
      <section id="testimonials" className="py-16 sm:py-24 lg:py-32 bg-muted/20 relative overflow-hidden">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              className="text-center max-w-3xl mx-auto mb-8 sm:mb-12"
            >
              <motion.p variants={fadeUp} custom={0} className="text-xs sm:text-sm font-semibold text-primary uppercase tracking-wider mb-2 sm:mb-3">
                {t('landing.testimonials', 'Testimonials')}
              </motion.p>
              <motion.h2 variants={fadeUp} custom={1} className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold mb-4 sm:mb-6">
                {t('landing.trusted_by_professionals', 'Trusted by')}{' '}
                <span className="gradient-text">{t('landing.healthcare_professionals', 'healthcare professionals')}</span>
              </motion.h2>
              <motion.p variants={fadeUp} custom={2} className="text-sm sm:text-base lg:text-lg text-muted-foreground">
                {t('landing.testimonials_desc', 'See what doctors and care teams are saying about CARENETRA.')}
              </motion.p>
            </motion.div>

            {/* Add Testimonial Button (both desktop & mobile) */}
            <div className="hidden sm:block absolute right-0 top-0 lg:top-2">
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="glass-card border-primary/20 hover:bg-primary/5 gap-2 shadow-md"
                  >
                    <Plus size={16} />
                    {t('landing.add_testimonial', 'Add Testimonial')}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader>
                    <DialogTitle>{t('landing.share_experience', 'Share Your Experience')}</DialogTitle>
                    <DialogDescription>{t('landing.tell_us', 'Tell us how CARENETRA has helped your practice.')}</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="name" className="text-right">{t('landing.name', 'Name')}</Label>
                      <Input id="name" value={newTestimonial.name} onChange={(e) => setNewTestimonial({ ...newTestimonial, name: e.target.value })} className="col-span-3" placeholder="Dr. John Doe" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="role" className="text-right">{t('landing.role', 'Role (optional)')}</Label>
                      <Input id="role" value={newTestimonial.role} onChange={(e) => setNewTestimonial({ ...newTestimonial, role: e.target.value })} className="col-span-3" placeholder="Cardiologist, Mayo Clinic" />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="rating" className="text-right">{t('landing.rating', 'Rating')}</Label>
                      <div className="col-span-3"><StarRatingInput rating={newTestimonial.rating} setRating={(r) => setNewTestimonial({ ...newTestimonial, rating: r })} /></div>
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="comment" className="text-right">{t('landing.feedback', 'Feedback')}</Label>
                      <Textarea id="comment" value={newTestimonial.comment} onChange={(e) => setNewTestimonial({ ...newTestimonial, comment: e.target.value })} className="col-span-3" placeholder="Your experience with CARENETRA..." rows={4} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>{t('landing.cancel', 'Cancel')}</Button>
                    <Button onClick={handleAddTestimonial} disabled={!newTestimonial.name || !newTestimonial.comment}>{t('landing.submit', 'Submit')}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
            <div className="sm:hidden flex justify-center mb-8">
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="glass-card border-primary/20 hover:bg-primary/5 gap-2 shadow-md"><Plus size={16} /> Add Testimonial</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[425px]">
                  <DialogHeader><DialogTitle>Share Your Experience</DialogTitle><DialogDescription>Tell us how CARENETRA has helped your practice.</DialogDescription></DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="name-mobile" className="text-right">Name</Label><Input id="name-mobile" value={newTestimonial.name} onChange={(e) => setNewTestimonial({ ...newTestimonial, name: e.target.value })} className="col-span-3" placeholder="Dr. John Doe" /></div>
                    <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="role-mobile" className="text-right">Role (optional)</Label><Input id="role-mobile" value={newTestimonial.role} onChange={(e) => setNewTestimonial({ ...newTestimonial, role: e.target.value })} className="col-span-3" placeholder="Cardiologist, Mayo Clinic" /></div>
                    <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="rating-mobile" className="text-right">Rating</Label><div className="col-span-3"><StarRatingInput rating={newTestimonial.rating} setRating={(r) => setNewTestimonial({ ...newTestimonial, rating: r })} /></div></div>
                    <div className="grid grid-cols-4 items-center gap-4"><Label htmlFor="comment-mobile" className="text-right">Feedback</Label><Textarea id="comment-mobile" value={newTestimonial.comment} onChange={(e) => setNewTestimonial({ ...newTestimonial, comment: e.target.value })} className="col-span-3" placeholder="Your experience with CARENETRA..." rows={4} /></div>
                  </div>
                  <DialogFooter><Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button><Button onClick={handleAddTestimonial} disabled={!newTestimonial.name || !newTestimonial.comment}>Submit</Button></DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <TestimonialsCarousel testimonials={testimonials} />
        </div>
      </section>

      {/* === CTA SECTION === */}
      <section className="py-16 sm:py-24 lg:py-32">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-primary to-secondary p-6 sm:p-8 md:p-12 lg:p-16 text-center shadow-2xl"
          >
            <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-white/10" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.1)_0%,transparent_50%)]" />
            <div className="relative z-10 max-w-3xl mx-auto">
              <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-bold text-white mb-4 sm:mb-6">
                {t('landing.ready_to_transform', 'Ready to transform patient care?')}
              </motion.h2>
              <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="text-white/90 text-sm sm:text-base lg:text-lg mb-6 sm:mb-8 max-w-2xl mx-auto">
                {t('landing.join_thousands', 'Join thousands of healthcare providers using CARENETRA to deliver proactive, AI-powered care.')}
              </motion.p>
              <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                <Link to="/register" className="inline-flex items-center gap-2 px-6 sm:px-8 py-3 sm:py-4 rounded-xl bg-white text-foreground font-semibold hover:scale-105 transform transition-all shadow-xl text-sm sm:text-base">
                  {t('landing.get_started', 'Get Started Free')} <ArrowRight size={18} />
                </Link>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* === FOOTER with dynamic logo (exactly as past branch) === */}
      <footer className="border-t border-border/50 py-8 sm:py-12">
        <div className="container mx-auto px-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src={footerLogoSrc} alt="CARENETRA Logo" className="h-8 w-auto sm:h-10" />
              <span className="font-semibold text-lg sm:text-xl">CARENETRA</span>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground">© 2025 CARENETRA. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;