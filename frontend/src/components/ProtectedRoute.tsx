import { Navigate } from 'react-router-dom';
import { isAuthenticated, getUser, getDashboardPath } from '@/lib/auth';

interface Props {
  children: React.ReactNode;
  requiredRole?: 'DOCTOR' | 'PATIENT' | 'VOLUNTEER' | 'RELATIVE';
}

const ProtectedRoute = ({ children, requiredRole }: Props) => {
  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  const user = getUser();
  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to={getDashboardPath(user?.role || 'PATIENT')} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
