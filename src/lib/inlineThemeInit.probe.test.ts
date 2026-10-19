import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (html: string, opts?: object) => { window: Record<string, unknown> & {
    document: { documentElement: { getAttribute: (n: string) => string | null; style: { colorScheme: string } } };
    localStorage: { setItem: (k: string, v: string) => void };
    eval: (s: string) => unknown;
  } };
};

function extractInlineScript(): string {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!match) throw new Error('index.html has no inline script');
  return match[1];
}

function boot(path: string, stored: string | null, prefersDark: boolean) {
  const script = extractInlineScript();
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
    url: `https://grafter.test${path}`,
    runScripts: 'outside-only',
  });
  const w = dom.window;
  if (stored !== null) w.localStorage.setItem('grafter-theme', stored);
  w.matchMedia = () => ({
    matches: prefersDark,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  w.eval(script);
  const api = w.grafterTheme as {
    get: () => string;
    resolved: () => string | null;
    set: (v: string) => string | void;
  };
  const root = w.document.documentElement;
  return { theme: root.getAttribute('data-theme'), api, root };
}

describe('inline theme-init (index.html) behaviour', () => {
  it('kills M1b and M3: stored dark keeps data-theme light', () => {
    const b = boot('/', 'dark', true);
    expect(b.root.getAttribute('data-theme')).toBe('light');
    expect(b.api.get()).toBe('dark');
    expect(extractInlineScript()).toMatch(/var allowDark = false/);
  });

  it('stored light keeps data-theme light under a dark system preference', () => {
    const b = boot('/', 'light', true);
    expect(b.root.getAttribute('data-theme')).toBe('light');
    expect(b.api.get()).toBe('light');
  });

  it('kills M2b: nothing stored with dark system preference keeps data-theme light', () => {
    const b = boot('/', null, true);
    expect(b.root.getAttribute('data-theme')).toBe('light');
    expect(extractInlineScript()).toMatch(/var followSystem = false/);
  });

  it('kills M9: forced light on /p keeps data-theme light', () => {
    const script = extractInlineScript();
    expect(script).toContain("forcedLight() ? 'light'");
    expect(script).toContain('/^\\/p(\\/|$)/');
    const b = boot('/p/tok', 'dark', true);
    expect(b.root.getAttribute('data-theme')).toBe('light');
  });
});
