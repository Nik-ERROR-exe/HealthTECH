import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Loader2, ArrowRight, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { setAuth } from '@/lib/auth';
import Navbar from '@/components/Navbar';

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
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="glass-card p-8 rounded-2xl shadow-xl border border-border">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-foreground mb-2">{t('auth.login')}</h1>
              <p className="text-muted-foreground">
                {t('auth.noAccount')}{' '}
                <Link to="/register" className="text-primary hover:underline font-medium">
                  {t('auth.register')}
                </Link>
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground ml-1">{t('auth.email')}</label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                    <Mail size={18} />
                  </div>
                  <input
                    type="email"
                    required
                    className="w-full bg-muted/50 border border-border rounded-xl py-3 pl-10 pr-4 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="name@example.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground ml-1">{t('auth.password')}</label>
                <div className="relative group">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-primary transition-colors">
                    <Lock size={18} />
                  </div>
                  <input
                    type={showPass ? 'text' : 'password'}
                    required
                    className="w-full bg-muted/50 border border-border rounded-xl py-3 pl-10 pr-10 outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                  >
                    {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
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
                    {t('auth.login')} <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
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

export default LoginPage;