import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Loader2, ArrowRight, Eye, EyeOff, Sparkles, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { setAuth } from '@/lib/auth';
import Navbar from '@/components/Navbar';

const formItemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.4, ease: "easeOut" as any },
  }),
};
const LoginPage = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await api.post('/auth/login', formData);
      const { access_token, user_id, role, full_name, unique_uid } = res.data;
      
      const userObj = {
        id: user_id,
        role: role,
        name: full_name,
        unique_uid: unique_uid,
        email: formData.email
      };

      setAuth(access_token, userObj);
      toast.success(t('auth.loginSuccess'));
      
      if (role === 'DOCTOR') navigate('/doctor/dashboard');
      else if (role === 'VOLUNTEER') navigate('/volunteer/dashboard');
      else navigate('/patient/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || t('auth.invalidCredentials'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Ambient background – floating gradients */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-secondary/5 pointer-events-none" />
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-primary/10 rounded-full blur-[120px] animate-float-slow" />
      <div className="absolute bottom-[-10%] right-[-5%] w-[50%] h-[50%] bg-secondary/10 rounded-full blur-[100px] animate-float-slower" />
      {/* Subtle grid pattern using CSS gradient - safe, no parsing issues */}
      <div className="absolute inset-0 opacity-[0.015] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(rgba(79,140,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(79,140,255,0.3) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      <Navbar />
      <div className="flex items-center justify-center px-4 py-20 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ duration: 0.6, ease: "easeOut" as any }}
          className="w-full max-w-md"
        >
          <div className="backdrop-blur-xl bg-card/30 border border-border/40 rounded-2xl p-8 shadow-2xl shadow-primary/5">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium border border-primary/20 mb-4">
                <Sparkles size={12} className="animate-pulse" />
                <span>{t('auth.welcomeBack') || 'Welcome back'}</span>
              </div>
              <h1 className="text-3xl font-bold text-foreground">{t('auth.login')}</h1>
              <p className="text-sm text-muted-foreground mt-2">{t('auth.accessAccount') || 'Access your CARENETRA account'}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <motion.div custom={0} variants={formItemVariants} initial="hidden" animate="visible">
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t('auth.email')}</label>
                <div className="relative group">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="abc@gmail.com"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-background/50 backdrop-blur-sm border border-border/50 text-foreground text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
                  />
                </div>
              </motion.div>

              <motion.div custom={1} variants={formItemVariants} initial="hidden" animate="visible">
                <label className="text-sm font-medium text-foreground mb-1.5 block">{t('auth.password')}</label>
                <div className="relative group">
                  <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors" />
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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
              </motion.div>

              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                  {t('auth.forgotPassword') || 'Forgot password?'}
                </Link>
              </div>

              <motion.div custom={2} variants={formItemVariants} initial="hidden" animate="visible">
                <button
                  type="submit"
                  disabled={loading}
                  className="relative w-full py-3 rounded-xl bg-gradient-to-r from-primary to-secondary text-primary-foreground font-medium text-sm hover:opacity-90 transition-all hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 overflow-hidden group"
                >
                  <span className="relative z-10 flex items-center justify-center gap-2">
                    {loading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {t('auth.signingIn') || 'Signing in...'}
                      </>
                    ) : (
                      t('auth.login')
                    )}
                  </span>
                  <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300" />
                </button>
              </motion.div>
            </form>

            <motion.p
              custom={3}
              variants={formItemVariants}
              initial="hidden"
              animate="visible"
              className="text-center text-sm text-muted-foreground mt-6"
            >
              {t('auth.noAccount')}{' '}
              <Link to="/register" className="text-primary font-medium hover:underline">{t('auth.register')}</Link>
            </motion.p>

            <div className="mt-6 pt-4 border-t border-border/30 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Shield size={12} className="text-primary" />
              <span>{t('auth.hipaaCompliant') || 'HIPAA compliant • Secure & encrypted'}</span>
            </div>

          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default LoginPage;