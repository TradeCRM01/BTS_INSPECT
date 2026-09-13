import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, X, Monitor, Smartphone } from 'lucide-react';
import { canOfferInstallPrompt, dismissInstallPrompt, isInstallDismissed } from '../../lib/installPrompt';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** One-time, dashboard-only. Never covers the phone bottom nav or a job/field page. */
export function InstallPrompt() {
  const { pathname } = useLocation();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    if (!canOfferInstallPrompt(pathname, isInstallDismissed(localStorage))) return;

    const isIosBrowser =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !(window.navigator as Navigator & { standalone?: boolean }).standalone;

    if (isIosBrowser) {
      setIsIos(true);
      const t = window.setTimeout(() => setShow(true), 3000);
      return () => window.clearTimeout(t);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      window.setTimeout(() => setShow(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [pathname]);

  function dismiss() {
    setShow(false);
    dismissInstallPrompt(localStorage);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') dismiss();
    setDeferredPrompt(null);
  }

  if (!canOfferInstallPrompt(pathname, isInstallDismissed(localStorage)) || !show) return null;

  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-40 w-full max-w-sm px-4" data-testid="pwa-install-banner">
      <div className="bg-[#0A2540] text-white rounded-xl shadow-2xl p-3 flex gap-3 items-start border border-white/10">
        <div className="w-9 h-9 rounded-lg bg-[#2E75B6] flex items-center justify-center shrink-0">
          {isIos ? <Smartphone size={18} className="text-white" /> : <Monitor size={18} className="text-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Install Grafter</p>
          {isIos ? (
            <p className="text-xs text-white/70 mt-0.5">
              Share, then Add to Home Screen. Optional — you can keep using the browser.
            </p>
          ) : (
            <p className="text-xs text-white/70 mt-0.5">
              Optional. Install for a home-screen icon, or dismiss and we will not ask again.
            </p>
          )}
          {!isIos && (
            <button
              onClick={install}
              className="mt-2 flex items-center gap-1.5 bg-[#2E75B6] hover:bg-[#2563a0] transition-colors text-white text-xs font-medium px-3 py-1.5 rounded-lg min-h-11"
            >
              <Download size={13} />
              Install
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-2 rounded hover:bg-white/10 transition-colors shrink-0 min-h-11 min-w-11"
          aria-label="Dismiss install prompt"
        >
          <X size={16} className="text-white/60" />
        </button>
      </div>
    </div>
  );
}
