import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { Eye, EyeOff, Mail, Lock, User, Phone, MapPin, Sparkles, Shield, Loader2, ArrowRight, Stethoscope, Heart, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import Navbar from '@/components/Navbar';

interface RegisterForm {
  full_name: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: 'DOCTOR' | 'PATIENT' | 'VOLUNTEER';
  phone?: string;
  area_description?: string;
}

const ROLES = [
  { value: 'PATIENT', icon: Heart, label: 'Patient' },
  { value: 'DOCTOR', icon: Stethoscope, label: 'Doctor' },
  { value: 'VOLUNTEER', icon: Users, label: 'Volunteer' },
] as const;

const formItemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: "easeOut" },
  }),
};

const RegisterPage = () => {
  const { t } = useTranslation();
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<RegisterForm>({
    defaultValues: { role: 'PATIENT' }
  });

  const selectedRole = watch('role');
  const password = watch('password');

  const onSubmit = async (data: RegisterForm) => {
    if (data.password !== data.confirmPassword) {
      toast.error(t('auth.passwordMismatch') || "Passwords do not match");
      return;
    }
    setLoading(true);

    try {
      await api.post('/auth/register', {
        full_name:        data.full_name,
        email:            data.email,
        password:         data.password,
        role:             data.role,
        phone:            data.phone            || undefined,
        area_description: data.area_description || undefined,
      });
      toast.success(t('auth.registerSuccess'));
      navigate('/login');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('auth.registerFailed') || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary/10 rounded-full blur-[120px] animate-float-slow" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-secondary/10 rounded-full blur-[100px] animate-float-slower" />
      {/* Safe grid pattern */}
      <div className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(79,140,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(79,140,255,0.3) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <Navbar />
      <div className="flex items-center justify-center px-4 py-16 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <div className="backdrop-blur-xl bg-card/30 border border-border/40 rounded-2xl p-8 shadow-2xl shadow-primary/5">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20 mb-4">
                <Sparkles size={12} className="animate-pulse" />
                <span>Join CARENETRA</span>
              </div>
              <h1 className="text-3xl font-bold text-foreground">{t('auth.register')}</h1>
              <p className="text-sm text-muted-foreground mt-2">Start your healthcare journey today</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <motion.div custom={0} variants={formItemVariants} initial="hidden" animate="visible">
                <div className="grid grid-cols-3 gap-2 p-1 bg-muted/50 backdrop-blur-sm rounded-xl border border-border/30">
                  {ROLES.map(r => (
                    <label
                      key={r.value}
                      className={`flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-medium cursor-pointer transition-all duration-200 ${
                        selectedRole === r.value
                          ? 'bg-background text-foreground shadow-md border border-border/50'
                          : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
                      }`}
                    >
                      <input type="radio" value={r.value} {...register('role')} className="sr-only" />
                      {t(`auth.roles.${r.value.toLowerCase()}`) || r.label}
                    </label>
                  ))}
                </div>
              </motion.div>

              {selectedRole === 'VOLUNTEER' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-xs text-muted-foreground bg-primary/5 backdrop-blur-sm rounded-xl px-4 py-3 leading-relaxed border border-primary/20"
                >
                  <Sparkles size={12} className="inline mr-1 text-primary" />
                  Volunteers receive SMS alerts when CARENETRA detects a nearby patient emergency.
                  You can respond to confirm you're heading to help.
                </motion.div>
              )}

              <motion.div custom={1} variants={formItemVariants} initial="hidden" animate="visible">
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t('auth.name')}</label>
                <div className="relative group">
                  <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    {...register('full_name', { required: 'Name is required' })}
                    placeholder="Your full name"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-background/50 backdrop-blur-sm border border-border/50 text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                  />
                </div>
                {errors.full_name && <p className="text-xs text-destructive mt-1">{t('common.required')}</p>}
              </motion.div>

              <motion.div custom={2} variants={formItemVariants} initial="hidden" animate="visible">
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t('auth.email')}</label>
                <div className="relative group">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    {...register('email', { required: 'Email is required' })}
                    type="email"
                    placeholder="you@example.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-background/50 backdrop-blur-sm border border-border/50 text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                  />
                </div>
                {errors.email && <p className="text-xs text-destructive mt-1">{t('common.required')}</p>}
              </motion.div>

              <motion.div custom={3} variants={formItemVariants} initial="hidden" animate="visible">
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t('auth.password')}</label>
                <div className="relative group">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    {...register('password', {
                      required:  'Password is required',
                      minLength: { value: 8, message: 'Min 8 characters' },
                    })}
                    type={showPass ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-3 rounded-xl bg-background/50 backdrop-blur-sm border border-border/50 text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {errors.password && <p className="text-xs text-destructive mt-1">{errors.password.message}</p>}
              </motion.div>

              {selectedRole === 'VOLUNTEER' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="space-y-4"
                >
                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">
                      {t('auth.phone')} <span className="text-muted-foreground font-normal">{t('auth.phoneDesc')}</span>
                    </label>
                    <div className="relative group">
                      <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <input
                        {...register('phone', {
                          required: selectedRole === 'VOLUNTEER' ? 'Phone is required for volunteers' : false,
                        })}
                        placeholder="+91 98765 43210"
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-background/50 backdrop-blur-sm border border-border/50 text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                      />
                    </div>
                    {errors.phone && <p className="text-xs text-destructive mt-1">{errors.phone.message}</p>}
                  </div>

                  <div>
                    <label className="text-sm font-medium text-foreground mb-1.5 block">
                      {t('auth.area')} <span className="text-muted-foreground font-normal">{t('auth.areaDesc')}</span>
                    </label>
                    <div className="relative group">
                      <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                      <input
                        {...register('area_description')}
                        placeholder="e.g. Andheri West, Mumbai"
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-background/50 backdrop-blur-sm border border-border/50 text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                      />
                    </div>
                  </div>
                </motion.div>
              )}

              <motion.div custom={4} variants={formItemVariants} initial="hidden" animate="visible">
                <button
                  type="submit"
                  disabled={loading}
                  className="relative w-full py-3 rounded-xl bg-gradient-to-r from-primary to-secondary text-primary-foreground font-medium text-sm hover:opacity-90 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 overflow-hidden group"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {loading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Creating account...
                      </>
                    ) : (
                      t('auth.register')
                    )}
                  </span>
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                </button>
              </motion.div>
            </form>

            <motion.p
              custom={5}
              variants={formItemVariants}
              initial="hidden"
              animate="visible"
              className="text-center text-sm text-muted-foreground mt-6"
            >
              {t('auth.hasAccount')}{' '}
              <Link to="/login" className="text-primary font-medium hover:underline">{t('auth.login')}</Link>
            </motion.p>

            <div className="mt-6 pt-4 border-t border-border/30 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Shield size={12} className="text-primary" />
              <span>HIPAA compliant • Secure & encrypted</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default RegisterPage;