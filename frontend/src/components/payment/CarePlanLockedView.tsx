import { motion } from 'framer-motion';
import {
  Lock, ShieldAlert, Sparkles, CheckCircle2, Pill, Activity,
  HeartPulse, FileText, ChevronRight, UserCheck, Calendar, DollarSign
} from 'lucide-react';

interface CarePlanLockedViewProps {
  courseName: string;
  doctorName: string;
  startDate?: string;
  endDate?: string;
  amount?: number;
  onUnlockClick: () => void;
}

export const CarePlanLockedView = ({
  courseName,
  doctorName,
  startDate = '2024-12-01',
  endDate = '2025-03-01',
  amount = 2499,
  onUnlockClick
}: CarePlanLockedViewProps) => {
  // Compute duration in days if possible
  const durationDays = startDate && endDate
    ? Math.max(1, Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 3600 * 24)))
    : 90;

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 sm:p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="w-full max-w-3xl bg-card border border-border rounded-3xl shadow-2xl p-6 sm:p-10 space-y-8 relative overflow-hidden"
      >
        {/* Decorative background glow */}
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-amber-500/10 dark:bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-emerald-500/10 dark:bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header & Lock Badge */}
        <div className="flex flex-col items-center text-center space-y-3 relative z-10">
          <div className="relative">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-amber-500/10 border-2 border-amber-500/30 rounded-2xl flex items-center justify-center text-amber-500 shadow-inner">
              <Lock size={36} className="animate-pulse" />
            </div>
            <div className="absolute -bottom-1 -right-1 bg-amber-500 text-slate-950 p-1 rounded-full shadow">
              <ShieldAlert size={14} />
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-500/10 px-3.5 py-1 rounded-full border border-amber-500/20">
              Subscription Required
            </span>
            <h1 className="text-2xl sm:text-4xl font-extrabold text-foreground tracking-tight pt-2">
              Care Plan Locked
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto">
              Your prescribing doctor has prepared your specialized recovery course. Complete payment to activate full access to your care services.
            </p>
          </div>
        </div>

        {/* Course Details Card */}
        <div className="bg-muted/50 border border-border rounded-2xl p-5 sm:p-7 space-y-5 relative z-10">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <div>
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider block">
                Assigned Medical Course
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground pt-0.5">
                {courseName}
              </h2>
            </div>
            <div className="text-right">
              <span className="text-xs text-muted-foreground block">Subscription Price</span>
              <span className="text-2xl sm:text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                ₹{amount.toLocaleString('en-IN')}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div className="flex items-center gap-3 bg-card p-3 rounded-xl border border-border">
              <UserCheck size={20} className="text-emerald-500 shrink-0" />
              <div>
                <span className="text-[11px] text-muted-foreground block">Prescribing Doctor</span>
                <span className="font-semibold text-foreground">{doctorName}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-card p-3 rounded-xl border border-border">
              <Calendar size={20} className="text-emerald-500 shrink-0" />
              <div>
                <span className="text-[11px] text-muted-foreground block">Course Duration</span>
                <span className="font-semibold text-foreground">{durationDays} Days</span>
              </div>
            </div>

            <div className="flex items-center gap-3 bg-card p-3 rounded-xl border border-border">
              <Sparkles size={20} className="text-emerald-500 shrink-0" />
              <div>
                <span className="text-[11px] text-muted-foreground block">Access Status</span>
                <span className="font-semibold text-amber-600 dark:text-amber-400">Pending Payment</span>
              </div>
            </div>
          </div>
        </div>

        {/* Locked Services Preview Grid */}
        <div className="space-y-3 relative z-10">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground text-center">
            Services Unlocked Upon Subscription
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {[
              { icon: Pill, title: 'Daily Medication Schedule & Reminders' },
              { icon: Activity, title: 'CARA AI Daily Symptom & Check-in Assistant' },
              { icon: HeartPulse, title: 'Real-time Vitals & Critical Risk Monitoring' },
              { icon: FileText, title: 'NVIDIA AI Wound Analysis & Photo History' },
            ].map((item, idx) => {
              const Icon = item.icon;
              return (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border/80 text-muted-foreground opacity-85"
                >
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                    <Icon size={16} />
                  </div>
                  <span className="font-medium text-foreground">{item.title}</span>
                  <Lock size={14} className="ml-auto text-amber-500/70 shrink-0" />
                </div>
              );
            })}
          </div>
        </div>

        {/* Unlock Action CTA Button */}
        <div className="pt-2 flex flex-col items-center space-y-3 relative z-10">
          <button
            onClick={onUnlockClick}
            className="w-full sm:w-auto px-8 py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold text-lg rounded-2xl shadow-xl shadow-emerald-600/25 transition-all flex items-center justify-center gap-3 cursor-pointer group"
          >
            <Sparkles size={22} className="group-hover:rotate-12 transition-transform" />
            <span>Unlock My Care Plan</span>
            <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </button>

          <p className="text-xs text-muted-foreground text-center">
            🔒 Secure transaction powered by CARENETRA Payment Gateway
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default CarePlanLockedView;
