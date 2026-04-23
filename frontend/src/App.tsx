import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DashboardSkeleton } from '@/components/LoadingSkeleton';
import ProtectedRoute from '@/components/ProtectedRoute';
import DemoPage from '@/pages/DemoPage';

const LandingPage = lazy(() => import('./pages/LandingPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const RegisterPage = lazy(() => import('./pages/RegisterPage'));
const PatientDashboard = lazy(() => import('./pages/PatientDashboard'));
const DoctorDashboard = lazy(() => import('./pages/DoctorDashboard'));
const CreateCourse = lazy(() => import('./pages/CreateCourse'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const VolunteerDashboard = lazy(() => import('./pages/VolunteerDashboard'));
const NotFound = lazy(() => import('./pages/NotFound'));

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Suspense fallback={<DashboardSkeleton />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/demo" element={<DemoPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/patient/dashboard" element={<ProtectedRoute requiredRole="PATIENT"><PatientDashboard /></ProtectedRoute>} />
            <Route path="/patient/profile" element={<ProtectedRoute requiredRole="PATIENT"><ProfilePage /></ProtectedRoute>} />
            <Route path="/doctor/dashboard" element={<ProtectedRoute requiredRole="DOCTOR"><DoctorDashboard /></ProtectedRoute>} />
            <Route path="/doctor/patient/:id" element={<ProtectedRoute requiredRole="DOCTOR"><DoctorDashboard /></ProtectedRoute>} />
            <Route path="/doctor/create-course" element={<ProtectedRoute requiredRole="DOCTOR"><CreateCourse /></ProtectedRoute>} />
            <Route path="/doctor/profile" element={<ProtectedRoute requiredRole="DOCTOR"><ProfilePage /></ProtectedRoute>} />
            <Route
              path="/volunteer/dashboard"
              element={
                <ProtectedRoute requiredRole="VOLUNTEER">
                  <VolunteerDashboard />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
