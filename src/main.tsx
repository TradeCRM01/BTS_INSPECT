import { StrictMode, Component } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { InstallPrompt } from './components/ui/InstallPrompt';
import { SWUpdatePrompt } from './components/ui/SWUpdatePrompt';
import App from './App';
import { isDevFieldAuditAuth } from './lib/devFieldAuditAuth';
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

async function clearAppCaches() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
    const purge = Object.keys(localStorage).filter(
      (k) => k.startsWith('sb-') || k === 'bts_build_id' || k === 'module_reload'
    );
    purge.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
}

// Explicit recovery: /login?clear=1 or any ?clear=1
if (new URLSearchParams(window.location.search).has('clear')) {
  const next = new URLSearchParams(window.location.search).get('next');
  clearAppCaches().finally(() => {
    try {
      sessionStorage.removeItem('chunk_recover');
      sessionStorage.removeItem('module_reload');
      sessionStorage.removeItem('chunk_reload');
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
const BUILD_ID = import.meta.env.VITE_BUILD_ID ?? 'dev';
const BUILD_KEY = 'bts_build_id';
(async () => {
  try {
    const prev = localStorage.getItem(BUILD_KEY);
    if (prev && prev !== BUILD_ID) {
      await clearAppCaches();
      localStorage.setItem(BUILD_KEY, BUILD_ID);
      window.location.reload();
      return;
    }
    localStorage.setItem(BUILD_KEY, BUILD_ID);
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
    if (sessionStorage.getItem('module_reload')) return;
    sessionStorage.setItem('module_reload', '1');
    const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(`/login?clear=1&next=${encodeURIComponent(next)}`);
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
    if (sessionStorage.getItem('module_reload')) return;
    sessionStorage.setItem('module_reload', '1');
    const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    window.location.replace(`/login?clear=1&next=${encodeURIComponent(next)}`);
  }
});

window.addEventListener('load', () => {
  sessionStorage.removeItem('module_reload');
});

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
          <div className="bg-white border border-red-200 rounded-lg p-6 max-w-md w-full shadow-sm">
            <h1 className="text-lg font-semibold text-red-700 mb-2">Something went wrong</h1>
            <p className="text-sm text-[#4A5568] mb-4">{(this.state.error as Error).message}</p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.href = '/login?clear=1'; }}
              className="bg-[#0A2540] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e]"
            >
              Clear cache & open login
            </button>
          </div>
        </div>
      );
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <App />
            <InstallPrompt />
            <SWUpdatePrompt />
          </AuthProvider>
        </QueryClientProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>
);
