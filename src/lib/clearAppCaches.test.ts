import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUILD_STORAGE_KEY,
  applyDeployedBuildCache,
  clearAppCaches,
  localStorageKeysToPurge,
} from './clearAppCaches';

const AUTH_TOKEN = 'sb-ezszahvwwmbuekpedumf-auth-token';

function memoryStorage(init: Record<string, string> = {}): {
  store: Map<string, string>;
  storage: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    key(index: number): string | null;
    readonly length: number;
  };
} {
  const store = new Map(Object.entries(init));
  return {
    store,
    storage: {
      getItem(key) {
        return store.has(key) ? store.get(key)! : null;
      },
      setItem(key, value) {
        store.set(key, String(value));
      },
      removeItem(key) {
        store.delete(key);
      },
      key(index) {
        return [...store.keys()][index] ?? null;
      },
      get length() {
        return store.size;
      },
    },
  };
}

describe('localStorageKeysToPurge', () => {
  const keys = [AUTH_TOKEN, BUILD_STORAGE_KEY, 'module_reload', 'other'];

  it('keeps sb-* keys when keepSession is true', () => {
    expect(localStorageKeysToPurge(keys, { keepSession: true })).toEqual([
      BUILD_STORAGE_KEY,
      'module_reload',
    ]);
  });

  it('purges sb-* keys on a full clear', () => {
    expect(localStorageKeysToPurge(keys)).toEqual([
      AUTH_TOKEN,
      BUILD_STORAGE_KEY,
      'module_reload',
    ]);
  });
});

describe('applyDeployedBuildCache', () => {
  it('keeps the sb- auth token on a build mismatch and updates bts_build_id', async () => {
    const { storage } = memoryStorage({
      [BUILD_STORAGE_KEY]: 'old-build',
      [AUTH_TOKEN]: 'session-token',
      module_reload: '1',
    });

    const result = await applyDeployedBuildCache('new-build', { storage });

    expect(result).toEqual({ shouldReload: true });
    expect(storage.getItem(AUTH_TOKEN)).toBe('session-token');
    expect(storage.getItem(BUILD_STORAGE_KEY)).toBe('new-build');
    expect(storage.getItem('module_reload')).toBe(null);
  });
});

describe('clearAppCaches ?clear=1', () => {
  it('purges sb-* keys on the explicit recovery path', async () => {
    const { storage } = memoryStorage({
      [BUILD_STORAGE_KEY]: 'old-build',
      [AUTH_TOKEN]: 'session-token',
      'sb-other': 'x',
      module_reload: '1',
    });

    await clearAppCaches({ storage });

    expect(storage.getItem(AUTH_TOKEN)).toBe(null);
    expect(storage.getItem('sb-other')).toBe(null);
    expect(storage.getItem(BUILD_STORAGE_KEY)).toBe(null);
    expect(storage.getItem('module_reload')).toBe(null);
  });
});

describe('main.tsx deploy vs ?clear=1', () => {
  it('uses keepSession on build change and a full purge only for ?clear=1', () => {
    const main = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');
    expect(main).toContain("from './lib/clearAppCaches'");
    expect(main).toContain('applyDeployedBuildCache(BUILD_ID)');
    expect(main).toContain("new URLSearchParams(window.location.search).has('clear')");
    const clearPath = main.slice(
      main.indexOf("has('clear')"),
      main.indexOf('Bust stale PWA caches'),
    );
    expect(clearPath).toContain('clearAppCaches()');
    expect(clearPath).not.toContain('keepSession');
    expect(main).not.toMatch(/Relovi|Littleloop/);
  });
});
