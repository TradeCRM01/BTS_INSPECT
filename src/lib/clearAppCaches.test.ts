import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BUILD_STORAGE_KEY,
  applyDeployedBuildCache,
  autoClearLoginHref,
  clearAppCaches,
  keepSessionOnClearSearch,
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

describe('auto vs manual ?clear=1', () => {
  it('keeps the sb-* token when auto=1', async () => {
    const { storage } = memoryStorage({
      [BUILD_STORAGE_KEY]: 'old-build',
      [AUTH_TOKEN]: 'session-token',
      module_reload: '1',
    });
    const keepSession = keepSessionOnClearSearch('?clear=1&auto=1&next=%2Fjobs');
    expect(keepSession).toBe(true);
    await clearAppCaches({ keepSession, storage });
    expect(storage.getItem(AUTH_TOKEN)).toBe('session-token');
    expect(storage.getItem(BUILD_STORAGE_KEY)).toBe(null);
    expect(storage.getItem('module_reload')).toBe(null);
  });

  it('wipes sb-* keys on a manual clear with no auto', async () => {
    const { storage } = memoryStorage({
      [BUILD_STORAGE_KEY]: 'old-build',
      [AUTH_TOKEN]: 'session-token',
      'sb-other': 'x',
      module_reload: '1',
    });
    expect(keepSessionOnClearSearch('?clear=1')).toBe(false);
    await clearAppCaches({ keepSession: keepSessionOnClearSearch('?clear=1'), storage });
    expect(storage.getItem(AUTH_TOKEN)).toBe(null);
    expect(storage.getItem('sb-other')).toBe(null);
    expect(storage.getItem(BUILD_STORAGE_KEY)).toBe(null);
    expect(storage.getItem('module_reload')).toBe(null);
  });
});

describe('automatic recovery callers add auto=1', () => {
  function src(rel: string): string {
    return readFileSync(resolve(process.cwd(), rel), 'utf8');
  }

  it('hardRecover and chunk handlers include auto=1; the manual link does not', () => {
    const main = src('src/main.tsx');
    const boundary = src('src/components/layout/PageErrorBoundary.tsx');
    const login = src('src/pages/LoginPage.tsx');
    expect(autoClearLoginHref('/jobs/1')).toBe('/login?clear=1&auto=1&next=%2Fjobs%2F1');
    expect(main).toContain('autoClearLoginHref(next)');
    expect(main).toContain('keepSessionOnClearSearch(window.location.search)');
    expect(main).toContain('clearAppCaches({ keepSession })');
    expect(boundary).toContain('autoClearLoginHref(next)');
    expect(boundary).toContain("from '../../lib/clearAppCaches'");
    expect(login).toContain('href="/login?clear=1"');
    expect(login).not.toContain('auto=1');
    expect(main).toContain("window.location.href = '/login?clear=1'");
    expect(main).not.toMatch(/Relovi|Littleloop/);
  });
});

const NO_CACHE = 'Cache-Control: no-cache, no-store, must-revalidate';
const IMMUTABLE = 'Cache-Control: public, max-age=31536000, immutable';

/** First-segment paths from <Route path="..."> in App.tsx. Skips the * fallback. */
function routerTopLevelPaths(appSource: string): string[] {
  const paths = [...appSource.matchAll(/path=["']([^"']+)["']/g)].map(m => m[1]);
  const tops = new Set<string>();
  for (const path of paths) {
    if (path === '*' || path === '/*') continue;
    if (path === '/') {
      tops.add('/');
      continue;
    }
    const segment = path.split('/').filter(Boolean)[0];
    if (segment) tops.add(`/${segment}`);
  }
  return [...tops].sort();
}

function headerRulePaths(headers: string): string[] {
  return headers.split('\n').filter(line => /^\/\S*$/.test(line));
}

function headerCacheControl(headers: string): Map<string, string> {
  const map = new Map<string, string>();
  let current: string | null = null;
  for (const raw of headers.split('\n')) {
    if (/^\/\S*$/.test(raw)) {
      current = raw;
      continue;
    }
    const cache = raw.match(/^\s+Cache-Control:\s*(.+)$/);
    if (current && cache) {
      map.set(current, `Cache-Control: ${cache[1].trim()}`);
    }
    if (raw.trim() === '' || raw.startsWith('#')) {
      current = null;
    }
  }
  return map;
}

describe('Pages HTML cache and SPA fallback', () => {
  function src(rel: string): string {
    return readFileSync(resolve(process.cwd(), rel), 'utf8');
  }

  it('gives every App.tsx top-level path no-cache (and its /*) without a blanket /*', () => {
    const headers = src('public/_headers');
    const rules = headerRulePaths(headers);
    const cache = headerCacheControl(headers);
    const tops = routerTopLevelPaths(src('src/App.tsx'));

    expect(tops.length).toBeGreaterThan(0);
    expect(rules).not.toContain('/*');
    expect(headers).not.toMatch(/^\s*\/\*\s*$/m);

    for (const path of tops) {
      expect(rules, `missing exact ${path} in public/_headers`).toContain(path);
      if (path === '/') {
        expect(cache.get('/')).toBe(NO_CACHE);
        continue;
      }
      if (path === '/assets') {
        expect(cache.get('/assets')).toBe(NO_CACHE);
        expect(cache.get('/assets/*')).toBe(IMMUTABLE);
        continue;
      }
      expect(rules, `missing ${path}/* in public/_headers`).toContain(`${path}/*`);
      expect(cache.get(path), path).toBe(NO_CACHE);
      expect(cache.get(`${path}/*`), `${path}/*`).toBe(NO_CACHE);
    }

    expect(cache.get('/index.html')).toBe(NO_CACHE);
    expect(cache.get('/assets/*')).toBe(IMMUTABLE);
    expect(headers).not.toMatch(/Relovi|Littleloop/);
  });

  it('uses only the SPA fallback and has no public/404.html', () => {
    const redirects = src('public/_redirects');
    const rules = redirects.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatch(/^\/\*\s+\/index\.html\s+200$/);
    expect(existsSync(resolve(process.cwd(), 'public/404.html'))).toBe(false);
    expect(redirects).not.toMatch(/404\.html/);
    expect(redirects).not.toMatch(/Relovi|Littleloop/);
  });
});
