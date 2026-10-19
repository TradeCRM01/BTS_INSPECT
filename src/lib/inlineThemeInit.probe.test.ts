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

function boot(path: string, stored: string | null, prefersDark: boolean, script = extractInlineScript()) {
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
  return {
    theme: root.getAttribute('data-theme'),
    colorScheme: root.style.colorScheme,
    api,
    root,
  };
}

describe('inline theme-init (index.html) behaviour', () => {
  it('kills M1b inline allowDark: stored dark still resolves light', () => {
    const b = boot('/', 'dark', true);
    expect(b.theme).toBe('light');
    expect(b.colorScheme).toBe('light');
    expect(b.root.getAttribute('data-theme')).toBe('light');
    expect(b.api.set('dark')).toBe('light');
    expect(extractInlineScript()).toMatch(/var allowDark = false/);
  });

  it('kills M2b inline followSystem: dark system preference with no stored value stays light', () => {
    const real = extractInlineScript();
    expect(real).toMatch(/var followSystem = false/);
    const allowDarkOn = real.replace('var allowDark = false', 'var allowDark = true');
    const b = boot('/', null, true, allowDarkOn);
    expect(b.theme).toBe('light');
    expect(b.colorScheme).toBe('light');
  });

  it('kills M3 inline storedDark: script reads stored dark and still paints light', () => {
    const b = boot('/', 'dark', true);
    expect(b.api.get()).toBe('dark');
    expect(b.theme).toBe('light');
    expect(b.api.resolved()).toBe('light');
    expect(b.colorScheme).toBe('light');
  });

  it('kills M9 inline /p force: /p stays light when flags would allow dark', () => {
    const real = extractInlineScript();
    expect(real).toContain('/^\\/p(\\/|$)/');
    const flagsOn = real
      .replace('var allowDark = false', 'var allowDark = true')
      .replace('var followSystem = false', 'var followSystem = true');
    const b = boot('/p/tok', 'dark', true, flagsOn);
    expect(b.theme).toBe('light');
    expect(b.root.getAttribute('data-theme')).toBe('light');
    expect(b.colorScheme).toBe('light');
  });
});
