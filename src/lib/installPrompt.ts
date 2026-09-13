export const PWA_INSTALL_DISMISS_KEY = 'pwa-install-dismissed';

/** Dashboard only. Never on field, job, schedule or settings routes. */
export function canOfferInstallPrompt(pathname: string, dismissed: boolean): boolean {
  return pathname === '/' && !dismissed;
}
