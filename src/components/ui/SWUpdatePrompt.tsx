import { useEffect } from 'react';
import { registerSW } from 'virtual:pwa-register';

/**
 * Auto-applies service worker updates so users don't stay stuck on a
 * cached old build after deploy (logout alone does not clear the SW cache).
 */
export function SWUpdatePrompt() {
  useEffect(() => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        // Activate waiting SW then hard-reload
        updateSW(true).finally(() => {
          window.location.reload();
        });
      },
      onRegisteredSW(swUrl, registration) {
        if (!registration) return;
        // Check for updates soon after load, then periodically
        const check = () => {
          registration.update().catch(() => {});
        };
        setTimeout(check, 5_000);
        const id = window.setInterval(check, 5 * 60_000);
        return () => window.clearInterval(id);
      },
      onRegisterError(error) {
        console.error('SW registration error:', error);
      },
    });
  }, []);

  return null;
}
