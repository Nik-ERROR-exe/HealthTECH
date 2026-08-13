import { Suspense, useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardSkeleton } from '@/components/LoadingSkeleton';
import ErrorBoundary from '@/components/ErrorBoundary';
import ProtectedRoute from '@/components/ProtectedRoute';
import DemoPage from '@/pages/DemoPage';
import { CheckinProvider } from '@/contexts/CheckinContext';
import { usePendingCheckin } from '@/hooks/usePendingCheckin';
import { toast } from 'sonner';
import { lazyWithRetry } from '@/lib/lazyWithRetry';

const LandingPage = lazyWithRetry(() => import('./pages/LandingPage'));
const LoginPage = lazyWithRetry(() => import('./pages/LoginPage'));
const RegisterPage = lazyWithRetry(() => import('./pages/RegisterPage'));
const PatientDashboard = lazyWithRetry(() => import('./pages/PatientDashboard'));
const DoctorDashboard = lazyWithRetry(() => import('./pages/DoctorDashboard'));
const CreateCourse = lazyWithRetry(() => import('./pages/CreateCourse'));
const ProfilePage = lazyWithRetry(() => import('./pages/ProfilePage'));
const AmbulanceDashboard = lazyWithRetry(() => import('./pages/AmbulanceDashboard'));
const VolunteerDashboard = lazyWithRetry(() => import('./pages/VolunteerDashboard'));
const CheckinPage = lazyWithRetry(() => import('./pages/CheckinPage'));
const RelativeDashboard = lazyWithRetry(() => import('./pages/RelativeDashboard'));
const NotFound = lazyWithRetry(() => import('./pages/NotFound'));

import useKeepAlive from '@/hooks/useKeepAlive';

const queryClient = new QueryClient();

const KeepAliveWatcher = () => {
  useKeepAlive(270_000);
  return null;
};

const PendingCheckinWatcher = () => {
  const { pendingCheckin, consumePending } = usePendingCheckin(5000);
  const handledCheckinsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (pendingCheckin && pendingCheckin.hasPending) {
      const idKey = pendingCheckin.pendingId || pendingCheckin.checkInId;
      if (idKey && handledCheckinsRef.current.has(idKey)) {
        return;
      }
      if (idKey) {
        handledCheckinsRef.current.add(idKey);
      }

      toast.info('Time for your scheduled health check-in!', {
        description: 'Opening your health check-in...',
      });
      window.dispatchEvent(new CustomEvent('carenetra:open-agent-chat', {
        detail: { check_in_id: pendingCheckin.checkInId }
      }));
      consumePending(pendingCheckin.pendingId);
    }
  }, [pendingCheckin, consumePending]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <CheckinProvider>
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <KeepAliveWatcher />
          <PendingCheckinWatcher />
          <ErrorBoundary>
            <Suspense fallback={<DashboardSkeleton />}>
              <Routes>
                <Route path="/" element={<LandingPage />} />
                <Route path="/demo" element={<DemoPage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/patient/dashboard" element={<ProtectedRoute requiredRole="PATIENT"><PatientDashboard /></ProtectedRoute>} />
                <Route path="/checkin" element={<ProtectedRoute requiredRole="PATIENT"><CheckinPage /></ProtectedRoute>} />
                <Route path="/patient/profile" element={<ProtectedRoute requiredRole="PATIENT"><ProfilePage /></ProtectedRoute>} />
                <Route path="/doctor/dashboard" element={<ProtectedRoute requiredRole="DOCTOR"><DoctorDashboard /></ProtectedRoute>} />
                <Route path="/doctor/patient/:id" element={<ProtectedRoute requiredRole="DOCTOR"><DoctorDashboard /></ProtectedRoute>} />
                <Route path="/doctor/create-course" element={<ProtectedRoute requiredRole="DOCTOR"><CreateCourse /></ProtectedRoute>} />
                <Route path="/doctor/profile" element={<ProtectedRoute requiredRole="DOCTOR"><ProfilePage /></ProtectedRoute>} />
                <Route path="/ambulance/dashboard" element={<ProtectedRoute requiredRole="AMBULANCE"><AmbulanceDashboard /></ProtectedRoute>} />
                <Route path="/ambulance/profile" element={<ProtectedRoute requiredRole="AMBULANCE"><ProfilePage /></ProtectedRoute>} />
                <Route path="/volunteer/dashboard" element={<ProtectedRoute requiredRole="VOLUNTEER"><VolunteerDashboard /></ProtectedRoute>} />
                <Route path="/volunteer/profile" element={<ProtectedRoute requiredRole="VOLUNTEER"><ProfilePage /></ProtectedRoute>} />
                <Route path="/relative/dashboard" element={<ProtectedRoute requiredRole="RELATIVE"><RelativeDashboard /></ProtectedRoute>} />
                <Route path="/relative/profile" element={<ProtectedRoute requiredRole="RELATIVE"><ProfilePage /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </BrowserRouter>
      </CheckinProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
