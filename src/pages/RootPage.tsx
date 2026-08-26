import { Suspense, lazy } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { ProtectedRoute } from '../components/layout/ProtectedRoute';
import { PageErrorBoundary } from '../components/layout/PageErrorBoundary';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { MarketingPage } from './MarketingPage';

const DashboardPage = lazy(() => import('./DashboardPage').then(m => ({ default: m.DashboardPage })));

function PageLoader() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center bg-cream">
      <LoadingSpinner size="lg" />
    </div>
  );
}

/**
 * `/` is the public Grafter landing for visitors.
 * Signed-in crews still land on the dashboard — same as before.
 */
export function RootPage() {
  const { user, loading } = useAuth();

  if (loading) return <PageLoader />;
  if (!user) return <MarketingPage />;

  return (
    <ProtectedRoute>
      <PageErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <DashboardPage />
        </Suspense>
      </PageErrorBoundary>
    </ProtectedRoute>
  );
}
