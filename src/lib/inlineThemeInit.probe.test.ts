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
  return { theme: root.getAttribute('data-theme'), api, root };
}

function harnessAllowDark(script: string): string {
  return script.replace('var allowDark = false', 'var allowDark = true');
}

function harnessAllowDarkAndFollowSystem(script: string): string {
  return harnessAllowDark(script).replace('var followSystem = false', 'var followSystem = true');
}

describe('inline theme-init (index.html) behaviour', () => {
  it('exact script, stored dark: data-theme is light', () => {
    const b = boot('/', 'dark', true);
    expect(b.root.getAttribute('data-theme')).toBe('light');
  });

  it('exact script, stored light: data-theme is light under a dark system preference', () => {
    const b = boot('/', 'light', true);
    expect(b.root.getAttribute('data-theme')).toBe('light');
  });

  it('exact script, nothing stored: data-theme is light under a dark system preference', () => {
    const b = boot('/', null, true);
    expect(b.root.getAttribute('data-theme')).toBe('light');
  });

  it('exact script, forced light on /p: data-theme is light', () => {
    const b = boot('/p/tok', 'dark', true);
    expect(b.root.getAttribute('data-theme')).toBe('light');
  });

  it('kills M1b: exact script, stored dark stays light because allowDark is false', () => {
    const b = boot('/', 'dark', true);
    expect(b.root.getAttribute('data-theme')).toBe('light');
    expect(extractInlineScript()).toMatch(/var allowDark = false/);
  });

  it('kills M3: harness allowDark=true only, stored dark resolves dark', () => {
    const script = harnessAllowDark(extractInlineScript());
    const b = boot('/', 'dark', true, script);
    expect(b.root.getAttribute('data-theme')).toBe('dark');
    expect(b.api.get()).toBe('dark');
  });

  it('kills M2b: harness allowDark=true only, nothing stored stays light (followSystem from extracted script)', () => {
    const script = harnessAllowDark(extractInlineScript());
    const b = boot('/', null, true, script);
    expect(b.root.getAttribute('data-theme')).toBe('light');
  });

  it('harness allowDark=true and followSystem=true: nothing stored, dark system preference resolves dark', () => {
    const script = harnessAllowDarkAndFollowSystem(extractInlineScript());
    const b = boot('/', null, true, script);
    expect(b.root.getAttribute('data-theme')).toBe('dark');
  });

  it('kills M9: harness allowDark=true only, /p stays light', () => {
    const script = harnessAllowDark(extractInlineScript());
    const b = boot('/p/tok', 'dark', true, script);
    expect(b.root.getAttribute('data-theme')).toBe('light');
  });
});
