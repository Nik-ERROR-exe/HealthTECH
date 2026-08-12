import { ReactNode } from 'react';
import Navbar from './Navbar';
import AgentChat from './AgentChat';
import { getUser } from '@/lib/auth';

interface Props {
  children: ReactNode;
}

const DashboardLayout = ({ children }: Props) => {
  const user = getUser();
  const isPatient = user?.role === 'PATIENT';

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-6 max-w-7xl">
        {children}
      </main>
      {isPatient && <AgentChat />}
    </div>
  );
};

export default DashboardLayout;
