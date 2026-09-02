import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { canShowInstallOverlay } from '../../lib/publicAuthPath';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** In-app Install Grafter sheet. Same cream paper tokens as the week board. */
const INSTALL_LOOK_CSS = `
.hub-install-anchor {
  --install-look-page: #F5F0E6;
  --install-look-sheet: #FFFDF8;
  --install-look-ink: #0A2540;
  --install-look-muted: #5B6B7C;
  --install-look-line: #E2D9CC;
  --install-look-action: #2E75B6;
  position: fixed;
  bottom: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  width: 100%;
  max-width: 24rem;
  padding: 0 16px;
  pointer-events: none;
  font-family: 'Source Sans 3', system-ui, sans-serif;
}
.hub-install-sheet {
  pointer-events: auto;
  background: var(--install-look-sheet);
  color: var(--install-look-ink);
  border: 1px solid var(--install-look-line);
  border-radius: 16px;
  padding: 16px 16px 14px;
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 #fff,
    0 10px 28px rgba(10, 37, 64, 0.08);
}
.hub-install-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.hub-install-copy-block {
  flex: 1;
  min-width: 0;
}
.hub-install-title {
  margin: 0;
  font-family: Rajdhani, sans-serif;
  font-weight: 700;
  font-size: 20px;
  letter-spacing: 0.02em;
  line-height: 1.1;
  color: var(--install-look-ink);
}
.hub-install-copy {
  margin: 6px 0 0;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.45;
  color: var(--install-look-muted);
}
.hub-install-copy strong {
  font-weight: 600;
  color: var(--install-look-ink);
}
.hub-install-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  height: 44px;
  margin-top: 14px;
  padding: 0 16px;
  border: none;
  border-radius: 12px;
  background: var(--install-look-action);
  color: #fff;
  box-shadow: none;
  font-family: Rajdhani, sans-serif;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
}
.hub-install-action:hover {
  background: color-mix(in srgb, #2E75B6 86%, #0A2540);
}
.hub-install-dismiss {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  margin: -4px -4px 0 0;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: none;
  color: var(--install-look-muted);
  box-shadow: none;
  cursor: pointer;
  flex-shrink: 0;
}
.hub-install-dismiss:hover {
  color: var(--install-look-ink);
}
`;

export function InstallPrompt() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const blockOverlay = !canShowInstallOverlay(pathname, Boolean(user));
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
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    if (blockOverlay || dismissed) return;
    if (localStorage.getItem('pwa-install-dismissed')) return;
    if (!isIos && !deferredPrompt) return;
    const timer = window.setTimeout(() => setShow(true), 3000);
    return () => window.clearTimeout(timer);
  }, [blockOverlay, dismissed, isIos, deferredPrompt]);

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

  if (blockOverlay || !show || dismissed) return null;

  return (
    <div className="hub-install-anchor">
      <style>{INSTALL_LOOK_CSS}</style>
      <div className="hub-install-sheet">
        <div className="hub-install-row">
          <div className="hub-install-copy-block">
            <p className="hub-install-title">Install Grafter</p>
            {isIos ? (
              <p className="hub-install-copy">
                Tap <strong>Share</strong> then <strong>Add to Home Screen</strong> to install.
              </p>
            ) : (
              <p className="hub-install-copy">
                Install as a desktop or mobile app for the best experience.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="hub-install-dismiss"
          >
            <X size={16} />
          </button>
        </div>
        {!isIos && (
          <button
            type="button"
            onClick={install}
            className="hub-install-action"
          >
            <Download size={16} />
            Install
          </button>
        )}
      </div>
    </div>
  );
}
