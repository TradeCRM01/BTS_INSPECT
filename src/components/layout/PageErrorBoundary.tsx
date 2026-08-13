import { Component } from 'react';
import type { ReactNode } from 'react';
import { AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';

interface State { error: Error | null }

function isStaleChunkError(error: Error | null): boolean {
  const msg = error?.message ?? '';
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Loading chunk [\d]+ failed/i.test(msg)
  );
}

async function hardRecover() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch {
    // ignore
  }
  const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  window.location.replace(`/login?clear=1&next=${encodeURIComponent(next)}`);
}

export class PageErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    if (!isStaleChunkError(error)) return;
    if (sessionStorage.getItem('chunk_recover')) return;
    sessionStorage.setItem('chunk_recover', '1');
    void hardRecover();
  }

  retry = () => {
    if (isStaleChunkError(this.state.error)) {
      void hardRecover();
      return;
    }
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = isStaleChunkError(error);

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-8">
        <div className="bg-white border border-red-100 rounded-xl p-8 max-w-lg w-full shadow-sm text-center">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle size={24} className="text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-[#1A1A1A] mb-2">
            {stale ? 'App update available' : 'This page ran into a problem'}
          </h2>
          <p className="text-sm text-[#4A5568] mb-1">
            {stale
              ? 'A newer version was deployed. Refresh to load the latest files.'
              : (error.message || 'An unexpected error occurred.')}
          </p>
          <p className="text-xs text-[#9CA3AF] mb-6">Your session is still active — you have not been signed out.</p>
          <div className="flex gap-3 justify-center">
            {!stale && (
              <button
                onClick={() => { window.history.back(); this.setState({ error: null }); }}
                className="flex items-center gap-2 px-4 py-2 border border-[#E5E7EB] rounded-lg text-sm text-[#4A5568] hover:bg-[#F9FAFB] transition-colors"
              >
                <ArrowLeft size={14} /> Go back
              </button>
            )}
            <button
              onClick={this.retry}
              className="flex items-center gap-2 px-4 py-2 bg-[#0A2540] text-white rounded-lg text-sm font-medium hover:bg-[#0d2f4e] transition-colors"
            >
              <RefreshCw size={14} /> {stale ? 'Refresh app' : 'Try again'}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
