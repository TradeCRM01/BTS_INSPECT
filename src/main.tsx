import { StrictMode, Component } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { InstallPrompt } from './components/ui/InstallPrompt';
import { SWUpdatePrompt } from './components/ui/SWUpdatePrompt';
import App from './App';
import './index.css';

// Intercept "importing a module script failed" errors and hard-reload.
// This happens when a new deploy invalidates chunk hashes that a stale
// service worker or browser cache still references.
window.addEventListener('error', (event) => {
  const msg = event.message ?? '';
  if (
    msg.includes('importing a module script failed') ||
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('error loading dynamically imported module')
  ) {
    // Avoid reload loops: only reload once per session
    if (!sessionStorage.getItem('module_reload')) {
      sessionStorage.setItem('module_reload', '1');
      window.location.reload();
    }
  }
}, true);

// Clear the reload guard on successful load so future real errors still reload
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
              onClick={() => { this.setState({ error: null }); window.location.href = '/'; }}
              className="bg-[#0A2540] text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e]"
            >
              Reload app
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
      retry: 3,
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
