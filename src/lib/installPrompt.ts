export const PWA_INSTALL_DISMISS_KEY = 'pwa-install-dismissed';

type DismissStore = Pick<Storage, 'getItem' | 'setItem'>;

/** Dashboard only. Never on field, job, schedule or settings routes. */
export function canOfferInstallPrompt(pathname: string, dismissed: boolean): boolean {
  return pathname === '/' && !dismissed;
}

export function isInstallDismissed(store: DismissStore): boolean {
  return store.getItem(PWA_INSTALL_DISMISS_KEY) === '1';
}

export function dismissInstallPrompt(store: DismissStore): void {
  store.setItem(PWA_INSTALL_DISMISS_KEY, '1');
}

/** After a controlled beforeinstallprompt (or iOS delay), show only if still allowed. */
export function shouldShowInstallBanner(
  pathname: string,
  store: DismissStore,
  promptEvent: Event | null,
  iosSafari: boolean,
): boolean {
  if (!canOfferInstallPrompt(pathname, isInstallDismissed(store))) return false;
  return iosSafari || promptEvent != null;
}
