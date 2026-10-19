import { StrictMode, Component } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { InstallPrompt } from './components/ui/InstallPrompt';
import { SWUpdatePrompt } from './components/ui/SWUpdatePrompt';
import App from './App';
import { AppCrashScreen } from './components/layout/AppCrashScreen';
import { AppRouteError } from './components/layout/AppRouteError';
import { isDevFieldAuditAuth } from './lib/devFieldAuditAuth';
import {
  applyDeployedBuildCache,
  autoClearLoginHref,
  beginAutoRecover,
  clearAppCaches,
  keepSessionOnClearSearch,
  releaseRecoveryKeysOnClear,
} from './lib/clearAppCaches';
import './index.css';

// Burned invite / reset links land as #error=... and can brick PWA navigations.
// Redirect to a clean login URL before React/auth bootstraps.
(() => {
  try {
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    const params = new URLSearchParams(hash);
    const code = params.get('error_code') || params.get('error');
    const desc = params.get('error_description') || '';
    if (code || /expired|invalid|access_denied/i.test(desc)) {
      window.location.replace('/login?expired=1');
    }
  } catch {
    // ignore
  }
})();

// Recovery: /login?clear=1. auto=1 keeps the session (chunk / hardRecover).
// Manual "Clear cache & retry" has no auto and wipes sb-*.
if (new URLSearchParams(window.location.search).has('clear')) {
  const params = new URLSearchParams(window.location.search);
  const next = params.get('next');
  const keepSession = keepSessionOnClearSearch(window.location.search);
  clearAppCaches({ keepSession }).finally(() => {
    try {
      releaseRecoveryKeysOnClear(window.location.search);
    } catch {
      // ignore
    }
    if (next && next.startsWith('/') && !next.startsWith('//')) {
      window.location.replace(next);
      return;
    }
    window.location.replace('/login?recovered=1');
  });
}

// Bust stale PWA caches when a new deploy ships (logout does not clear SW).
// Keep the sb-* session so a deploy does not sign everyone out.
const BUILD_ID = import.meta.env.VITE_BUILD_ID ?? 'dev';
(async () => {
  try {
    const { shouldReload } = await applyDeployedBuildCache(BUILD_ID);
    if (shouldReload) {
      window.location.reload();
    }
  } catch {
    // ignore storage / SW errors
  }
})();

// Intercept stale chunk errors and hard-recover (reload alone often keeps a stale shell).
window.addEventListener('error', (event) => {
  const msg = event.message ?? '';
  if (
    msg.includes('importing a module script failed') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module')
  ) {
    if (!beginAutoRecover()) return;
    const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(autoClearLoginHref(next));
  }
}, true);

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason;
  const msg = reason instanceof Error ? reason.message : String(reason ?? '');
  if (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module') ||
    msg.includes('Importing a module script failed')
  ) {
    if (!beginAutoRecover()) return;
    const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(autoClearLoginHref(next));
  }
});

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return <AppCrashScreen message={(this.state.error as Error).message} />;
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 5,
      retry: (failureCount) => {
        if (isDevFieldAuditAuth()) return false;
        return failureCount < 3;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
      retryDelay: 1000,
    },
  },
});

// Splat still renders App so real deep links, auth, and /p stay on their
// routes. Unknown paths are the App catch-all 404, not a redirect home.
const appRouter = createBrowserRouter([
  {
    path: '*',
    errorElement: <AppRouteError />,
    element: (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <App />
          <InstallPrompt />
          <SWUpdatePrompt />
        </AuthProvider>
      </QueryClientProvider>
    ),
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <RouterProvider router={appRouter} />
    </ErrorBoundary>
  </StrictMode>
);
