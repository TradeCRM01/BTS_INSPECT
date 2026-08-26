import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { OperatorShell } from './OperatorShell';
import { LoadingSpinner } from '../ui/LoadingSpinner';

export function OperatorRoute({ children }: { children: React.ReactNode }) {
  const { isPlatformOperator, loading, profile } = useAuth();

  if (loading || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!isPlatformOperator) {
    return <Navigate to="/" replace />;
  }

  return <OperatorShell>{children}</OperatorShell>;
}
