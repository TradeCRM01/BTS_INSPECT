export const BUILD_STORAGE_KEY = 'bts_build_id';
export const MODULE_RELOAD_KEY = 'module_reload';

export type AppCacheStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
};

export type ClearAppCachesOptions = {
  /** Keep sb-* Supabase session keys. Deploy cache bust uses this. */
  keepSession?: boolean;
  storage?: AppCacheStorage;
};

function storageKeys(storage: AppCacheStorage): string[] {
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key != null) keys.push(key);
  }
  return keys;
}

export function localStorageKeysToPurge(
  keys: readonly string[],
  options: Pick<ClearAppCachesOptions, 'keepSession'> = {},
): string[] {
  return keys.filter((key) => {
    if (key === BUILD_STORAGE_KEY || key === MODULE_RELOAD_KEY) return true;
    if (key.startsWith('sb-')) return !options.keepSession;
    return false;
  });
}

async function clearRuntimeCaches(): Promise<void> {
  if (typeof caches !== 'undefined') {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
}

function resolveStorage(storage?: AppCacheStorage): AppCacheStorage | null {
  if (storage) return storage;
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

/** Automatic chunk recovery adds auto=1 so the session is not wiped. */
export function keepSessionOnClearSearch(search: string): boolean {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  return params.get('auto') === '1';
}

export function autoClearLoginHref(next: string): string {
  return `/login?clear=1&auto=1&next=${encodeURIComponent(next)}`;
}

/** Clears Cache API, service workers, and selected localStorage keys. */
export async function clearAppCaches(options: ClearAppCachesOptions = {}): Promise<void> {
  try {
    await clearRuntimeCaches();
    const storage = resolveStorage(options.storage);
    if (!storage) return;
    localStorageKeysToPurge(storageKeys(storage), options).forEach((key) => {
      storage.removeItem(key);
    });
  } catch {
    // ignore
  }
}

/**
 * On a new VITE_BUILD_ID, bust PWA caches but keep the signed-in session.
 * Returns whether the caller should reload.
 */
export async function applyDeployedBuildCache(
  buildId: string,
  options: { storage?: AppCacheStorage } = {},
): Promise<{ shouldReload: boolean }> {
  const storage = resolveStorage(options.storage);
  if (!storage) return { shouldReload: false };
  const prev = storage.getItem(BUILD_STORAGE_KEY);
  if (prev && prev !== buildId) {
    await clearAppCaches({ keepSession: true, storage });
    storage.setItem(BUILD_STORAGE_KEY, buildId);
    return { shouldReload: true };
  }
  storage.setItem(BUILD_STORAGE_KEY, buildId);
  return { shouldReload: false };
}
