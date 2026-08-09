import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getUser, clearAuth, isAuthenticated, getDashboardPath } from '@/lib/auth';
import { LanguageSwitcher } from './LanguageSwitcher';
import { AnimatedThemeToggler } from './ui/animated-theme-toggler';

const Navbar = () => {
  const { t } = useTranslation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const authed = isAuthenticated();

  // Initialize & observe theme from document element class list
  useEffect(() => {
    const checkDark = () => {
      setDark(document.documentElement.classList.contains('dark'));
    };

    checkDark();

    const observer = new MutationObserver(() => {
      checkDark();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => observer.disconnect();
  }, []);

  const handleAnchorClick = (sectionId: string) => {
    if (location.pathname === '/') {
      // Already on landing page, scroll directly
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      // Navigate to landing page with hash
      navigate(`/#${sectionId}`);
    }
  };

  const handleLogout = () => {
    clearAuth();
    navigate('/login');
  };

  // LIGHT THEME: /CareNetra_white.png (seamless white box) | DARK THEME: /CareNetra_black.png (seamless dark box)
  const logoSrc = dark ? '/CareNetra_black.png' : '/CareNetra_white.png';

  // Smooth scroll to section
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
    // Close mobile menu if open
    setMobileOpen(false);
  };

  return (
    <nav className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="container mx-auto flex items-center justify-between h-16 px-4">
        <Link to="/" className="flex items-center gap-2">
          <img
            src={logoSrc}
            alt="CARENETRA Logo"
            className="h-10 sm:h-11 w-auto object-contain transition-opacity duration-200"
          />
        </Link>

        <div className="hidden md:flex items-center gap-6">
          {!authed ? (
            <>
              <button onClick={() => handleAnchorClick('features')} className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium cursor-pointer">{t('header.features')}</button>
              <button onClick={() => handleAnchorClick('how-it-works')} className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium cursor-pointer">{t('header.howItWorks')}</button>
              <Link to="/login" className="text-sm font-medium text-foreground">{t('header.signIn')}</Link>
              <Link to="/register" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity">{t('header.getStarted')}</Link>
            </>
          ) : (
            <>
              <Link to={getDashboardPath(user?.role || 'PATIENT')} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">{t('nav.dashboard')}</Link>
              <Link to={`/${user?.role?.toLowerCase()}/profile`} className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">{t('nav.profile')}</Link>
              <span className="text-sm text-muted-foreground">{user?.name}</span>
              <button onClick={handleLogout} className="text-muted-foreground hover:text-destructive transition-colors"><LogOut size={18} /></button>
            </>
          )}
          <LanguageSwitcher />
          <AnimatedThemeToggler />
        </div>

        <div className="flex md:hidden items-center gap-2">
          <AnimatedThemeToggler />
          <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 text-gray-900 dark:text-white">
            {mobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="md:hidden border-t border-gray-200 dark:border-gray-800 bg-[#f8fafc] dark:bg-[#111827] overflow-hidden"
          >
            <div className="p-4 flex flex-col gap-3">
              {!authed ? (
                <>
                  <button onClick={() => { handleAnchorClick('features'); setMobileOpen(false); }} className="text-sm font-medium py-2 text-left">{t('header.features')}</button>
                  <button onClick={() => { handleAnchorClick('how-it-works'); setMobileOpen(false); }} className="text-sm font-medium py-2 text-left">{t('header.howItWorks')}</button>
                  <Link to="/login" onClick={() => setMobileOpen(false)} className="text-sm font-medium py-2">{t('header.signIn')}</Link>
                  <Link to="/register" onClick={() => setMobileOpen(false)} className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium text-center">{t('header.getStarted')}</Link>
                </>
              ) : (
                <>
                  <Link to={getDashboardPath(user?.role || 'PATIENT')} onClick={() => setMobileOpen(false)} className="text-sm font-medium py-2">{t('nav.dashboard')}</Link>
                  <Link to={`/${user?.role?.toLowerCase()}/profile`} onClick={() => setMobileOpen(false)} className="text-sm font-medium py-2">{t('nav.profile')}</Link>
                  <button onClick={() => { handleLogout(); setMobileOpen(false); }} className="text-sm font-medium py-2 text-destructive text-left">{t('header.logout')}</button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;