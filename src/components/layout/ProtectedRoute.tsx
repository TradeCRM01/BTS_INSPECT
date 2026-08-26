import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LoadingSpinner } from '../ui/LoadingSpinner';
import { RotateCw } from 'lucide-react';
import { companyAccessBlocked } from '../../lib/platformOperator';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, profile, company, loading, refreshProfile, signOut, isPlatformOperator } = useAuth();
  const [slowLoad, setSlowLoad] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (user && !profile && !loading) {
      // Show a helpful retry UI after 6s instead of silently redirecting to login
      slowTimerRef.current = setTimeout(() => setSlowLoad(true), 6000);
    } else {
      clearTimeout(slowTimerRef.current);
      setSlowLoad(false);
    }
    return () => clearTimeout(slowTimerRef.current);
  }, [user, profile, loading]);

  async function handleRetry() {
    setRetrying(true);
    setSlowLoad(false);
    try {
      await refreshProfile();
    } finally {
      setRetrying(false);
    }
  }

  if (loading || retrying) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (slowLoad) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
        <div className="bg-white border border-[#E5E7EB] rounded-xl p-8 max-w-sm w-full mx-4 shadow-sm text-center">
          <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <RotateCw size={22} className="text-orange-500" />
          </div>
          <h2 className="text-base font-semibold text-[#1A1A1A] mb-2">Taking longer than usual</h2>
          <p className="text-sm text-[#4A5568] mb-6">
            Having trouble loading your profile. Check your connection and try again.
          </p>
          <button
            onClick={handleRetry}
            className="w-full bg-[#0A2540] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#0d2f4e] transition-colors"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="w-full mt-2 text-sm text-[#4A5568] hover:text-[#1A1A1A] py-2"
          >
            Reload app
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (companyAccessBlocked(company, isPlatformOperator)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] px-4">
        <div className="bg-white border border-[#E5E7EB] rounded-xl p-8 max-w-sm w-full shadow-sm text-center">
          <h2 className="text-base font-semibold text-[#1A1A1A] mb-2">This workspace is paused</h2>
          <p className="text-sm text-[#4A5568] mb-6">
            {company?.name ? `${company.name} ` : 'Your company '}
            cannot use Grafter right now. Ask the person who invited you, or email billing if you think this is a mistake.
          </p>
          <button
            onClick={() => { void signOut(); }}
            className="w-full bg-[#0A2540] text-white py-2.5 rounded-lg text-sm font-medium hover:bg-[#0d2f4e] transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
