import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import { User, Mail, Lock, Loader2, ArrowRight, Stethoscope, Heart, Users, Eye, EyeOff, Phone, MapPin } from 'lucide-react';
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
    transition: { delay: i * 0.05, duration: 0.4, ease: [0.25, 0.1, 0.25, 1] },
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
        email: data.email,
        password: data.password,
        full_name: data.full_name,
        role: data.role,
        phone: data.phone || undefined,
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
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-lg"
        >
          <div className="glass-card p-8 rounded-2xl shadow-xl border border-border">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">{t('auth.register')}</h1>
              <p className="text-muted-foreground">
                {t('auth.hasAccount')}{' '}
                <Link to="/login" className="text-primary hover:underline font-medium">
                  {t('auth.login')}
                </Link>
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Role selector */}
              <div className="grid grid-cols-3 gap-3">
                {ROLES.map((r) => (
                  <label
                    key={r.value}
                    className={`flex flex-col items-center gap-2 p-3 rounded-xl border transition-all cursor-pointer ${
                      selectedRole === r.value
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'bg-muted/30 border-border text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    <input
                      type="radio"
                      value={r.value}
                      {...register('role')}
                      className="sr-only"
                    />
                    <r.icon size={20} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{t(`auth.roles.${r.value.toLowerCase()}`) || r.label}</span>
                  </label>
                ))}
              </div>

              <div className="space-y-4">
                {/* Full Name */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground ml-1">{t('auth.name')}</label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                      <User size={18} />
                    </div>
                    <input
                      {...register('full_name', { required: true })}
                      type="text"
                      className="w-full bg-muted/50 border border-border rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="John Doe"
                    />
                  </div>
                  {errors.full_name && <p className="text-xs text-destructive ml-1">{t('common.required')}</p>}
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground ml-1">{t('auth.email')}</label>
                  <div className="relative group">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                      <Mail size={18} />
                    </div>
                    <input
                      {...register('email', { required: true })}
                      type="email"
                      className="w-full bg-muted/50 border border-border rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                      placeholder="name@example.com"
                    />
                  </div>
                  {errors.email && <p className="text-xs text-destructive ml-1">{t('common.required')}</p>}
                </div>

                {/* Password Fields */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground ml-1">{t('auth.password')}</label>
                    <div className="relative group">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                        <Lock size={18} />
                      </div>
                      <input
                        {...register('password', { required: true, minLength: 8 })}
                        type={showPass ? 'text' : 'password'}
                        className="w-full bg-muted/50 border border-border rounded-xl py-3 pl-10 pr-10 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPass(!showPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      >
                        {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground ml-1">{t('auth.confirmPassword')}</label>
                    <div className="relative group">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                        <Lock size={18} />
                      </div>
                      <input
                        {...register('confirmPassword', { required: true })}
                        type="password"
                        className="w-full bg-muted/50 border border-border rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        placeholder="••••••••"
                      />
                    </div>
                  </div>
                </div>

                {/* Volunteer Fields */}
                <motion.div
                  initial={false}
                  animate={{ height: selectedRole === 'VOLUNTEER' ? 'auto' : 0, opacity: selectedRole === 'VOLUNTEER' ? 1 : 0 }}
                  className="overflow-hidden space-y-4"
                >
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground ml-1">{t('auth.phone')} <span className="text-muted-foreground font-normal">{t('auth.phoneDesc')}</span></label>
                    <div className="relative group">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                        <Phone size={18} />
                      </div>
                      <input
                        {...register('phone')}
                        type="text"
                        className="w-full bg-muted/50 border border-border rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        placeholder="+91 98765 43210"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground ml-1">{t('auth.area')} <span className="text-muted-foreground font-normal">{t('auth.areaDesc')}</span></label>
                    <div className="relative group">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                        <MapPin size={18} />
                      </div>
                      <input
                        {...register('area_description')}
                        type="text"
                        className="w-full bg-muted/50 border border-border rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        placeholder="Mumbai, India"
                      />
                    </div>
                  </div>
                </motion.div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl gradient-primary text-primary-foreground font-semibold shadow-lg hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2 group mt-2"
              >
                {loading ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <>
                    {t('auth.register')} <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default RegisterPage;