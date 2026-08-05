import { useState, useEffect } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { RefreshCw, X } from 'lucide-react';

export function SWUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);

  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
      },
      onRegisteredSW(swUrl, r) {
        if (r) {
          setInterval(async () => {
            if (r.installing || !navigator) return;
            if ('serviceWorker' in navigator) {
              const reg = await navigator.serviceWorker.getRegistration();
              if (reg) {
                try {
                  await fetch(swUrl, {
                    cache: 'no-store',
                    headers: { 'cache-control': 'no-cache' },
                  });
                } catch {
                  // SW file fetch failed — skip this check
                }
              }
            }
          }, 10 * 60 * 1000);
        }
      },
      onRegisterError(error) {
        console.error('SW registration error:', error);
      },
    });

    return updateSW;
  }, []);

  const show = needRefresh || offlineReady;
  if (!show) return null;

  const close = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
  };

  const handleUpdate = () => {
    window.location.reload();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 pointer-events-none">
      <div className="max-w-md mx-auto bg-[#0A2540] text-white rounded-lg shadow-xl p-4 flex items-center gap-3 pointer-events-auto">
        <RefreshCw size={20} className="text-[#F7931A] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {needRefresh ? 'Update available' : 'Ready for offline use'}
          </p>
          <p className="text-xs text-white/70 mt-0.5">
            {needRefresh ? 'A new version of BTS Inspect is available.' : 'The app is now installed for offline use.'}
          </p>
        </div>
        {needRefresh && (
          <button
            onClick={handleUpdate}
            className="bg-[#F7931A] text-white px-3 py-1.5 rounded text-xs font-medium hover:bg-[#e08316] transition-colors shrink-0"
          >
            Update
          </button>
        )}
        <button
          onClick={close}
          className="p-1 text-white/60 hover:text-white shrink-0"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
