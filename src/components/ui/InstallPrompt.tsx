import { useState, useEffect } from 'react';
import { Download, X, Monitor, Smartphone } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [show, setShow] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('pwa-install-dismissed')) return;

    const isIosBrowser =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !(window.navigator as Navigator & { standalone?: boolean }).standalone;

    if (isIosBrowser) {
      setIsIos(true);
      setTimeout(() => setShow(true), 3000);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setTimeout(() => setShow(true), 3000);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  function dismiss() {
    setShow(false);
    setDismissed(true);
    localStorage.setItem('pwa-install-dismissed', '1');
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setShow(false);
    setDeferredPrompt(null);
  }

  if (!show || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-[#0A2540] text-white rounded-xl shadow-2xl p-4 flex gap-3 items-start border border-white/10">
        <div className="w-10 h-10 rounded-lg bg-[#2E75B6] flex items-center justify-center shrink-0">
          {isIos ? <Smartphone size={20} className="text-white" /> : <Monitor size={20} className="text-white" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm">Install BTS Inspect</p>
          {isIos ? (
            <p className="text-xs text-white/70 mt-0.5">
              Tap <span className="font-medium text-white">Share</span> then{' '}
              <span className="font-medium text-white">Add to Home Screen</span> to install.
            </p>
          ) : (
            <p className="text-xs text-white/70 mt-0.5">
              Install as a desktop or mobile app for the best experience.
            </p>
          )}
          {!isIos && (
            <button
              onClick={install}
              className="mt-2.5 flex items-center gap-1.5 bg-[#2E75B6] hover:bg-[#2563a0] transition-colors text-white text-xs font-medium px-3 py-1.5 rounded-lg"
            >
              <Download size={13} />
              Install App
            </button>
          )}
        </div>
        <button
          onClick={dismiss}
          className="p-1 rounded hover:bg-white/10 transition-colors shrink-0 mt-0.5"
        >
          <X size={16} className="text-white/60" />
        </button>
      </div>
    </div>
  );
}
