/**
 * @vitest-environment node
 *
 * HF-LAND-1: landing hero wrap, text-past-viewport, overflow, and standalone
 * safe-area on WebKit and Chromium over built dist CSS.
 *
 * Standalone insets: tests set --safe-area-inset-top: 47px and
 * --safe-area-inset-bottom: 34px on :root. Production CSS adds those
 * custom properties to env(), because Playwright WebKit and Chromium
 * resolve env(safe-area-inset-*) to 0. Not an iPhone device profile.
 * display-mode: standalone is forced with a matchMedia override.
 *
 * Filename omits `.test.` so the default include misses it.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild') as {
  build: (opts: Record<string, unknown>) => Promise<{ outputFiles?: Array<{ text: string }> }>;
};

const here = dirname(fileURLToPath(import.meta.url));
const TEXT_WIDTHS = [320, 375, 390] as const;
const OVERFLOW_WIDTHS = [375, 390, 768, 1024, 1280] as const;
const BOTH = ['chromium', 'webkit'] as const;
const SAFE_TOP = 47;
const SAFE_BOTTOM = 34;

type Engine = (typeof BOTH)[number];

type KillPage = {
  goto: (url: string) => Promise<unknown>;
  evaluate: <T, A = unknown>(fn: ((arg: A) => T | Promise<T>) | (() => T | Promise<T>), arg?: A) => Promise<T>;
  addInitScript: (fn: () => void) => Promise<void>;
  addStyleTag: (opts: { content: string }) => Promise<unknown>;
  waitForSelector: (sel: string, opts?: { timeout?: number }) => Promise<unknown>;
  close: () => Promise<void>;
};

type KillBrowser = {
  newPage: (opts?: { viewport?: { width: number; height: number } }) => Promise<KillPage>;
  close: () => Promise<void>;
};

type TextHit = { text: string; right: number; innerWidth: number };
type OverflowBox = { innerWidth: number; scrollWidth: number; maxRight: number };
type HeroBox = { x: number; width: number; right: number; lines: number; whiteSpace: string };

async function launchEngine(engine: Engine): Promise<KillBrowser> {
  const chromeCandidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/local/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter((path): path is string => !!path && existsSync(path));
  const errors: string[] = [];
  for (const spec of ['playwright', 'playwright-core']) {
    try {
      const mod = await import(spec) as {
        chromium: { launch: (opts: Record<string, unknown>) => Promise<KillBrowser> };
        webkit: { launch: (opts: Record<string, unknown>) => Promise<KillBrowser> };
      };
      if (engine === 'webkit') {
        return await mod.webkit.launch({ headless: true });
      }
      return await mod.chromium.launch({
        headless: true,
        executablePath: chromeCandidates[0],
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
    } catch (err) {
      errors.push(`${spec}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`${engine} launch failed: ${errors.join('; ')}`);
}

function readDistCss(): string {
  const dir = join(process.cwd(), 'dist/assets');
  if (!existsSync(dir)) throw new Error('dist/assets missing; run npm run build');
  const files = readdirSync(dir).filter((name) => name.endsWith('.css'));
  if (!files.length) throw new Error('no dist CSS; run npm run build');
  return files.map((name) => readFileSync(join(dir, name), 'utf8')).join('\n');
}

async function bundleEntry(entry: string, mocks?: string): Promise<string> {
  const result = await esbuild.build({
    absWorkingDir: process.cwd(),
    entryPoints: [entry],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    define: {
      'process.env.NODE_ENV': '"test"',
      'import.meta.env.MODE': '"test"',
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env.SSR': 'false',
      'import.meta.env.VITE_SUPABASE_URL': '"https://example.supabase.co"',
      'import.meta.env.VITE_SUPABASE_ANON_KEY': '"test-anon-key"',
    },
    plugins: mocks ? [{
      name: 'hf-land-1-mocks',
      setup(build: {
        onResolve: (
          opts: { filter: RegExp },
          cb: (args: { path: string }) => { path: string; namespace: string } | null,
        ) => void;
      }) {
        build.onResolve({ filter: /(?:AuthContext|useCompanyAiKey|DevConsole|\/lib\/supabase)$/ }, (args) => {
          const spec = args.path.replace(/\\/g, '/');
          if (/AuthContext$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/useCompanyAiKey$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/DevConsole$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/\/lib\/supabase$/.test(spec)) return { path: mocks, namespace: 'file' };
          return null;
        });
      },
    }] : [],
  });
  const file = result.outputFiles?.[0];
  if (!file) throw new Error(`esbuild produced no bundle for ${entry}`);
  return file.text;
}

function fixtureHtml(js: string, css: string): string {
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<style>${css}</style>
</head>
<body>
<div id="root"></div>
<script>window.__S2_SHELL__ = { reportTheme: null, companyName: 'Northside Plumbing & Gas Maintenance Services Pty Ltd' };</script>
<script>${js}</script>
</body>
</html>`;
}

function textPastViewport(): TextHit[] {
  const hits: TextHit[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
    const parent = node.parentElement;
    if (text && parent) {
      const cs = getComputedStyle(parent);
      if (cs.display !== 'none' && cs.visibility !== 'hidden') {
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of [...range.getClientRects()]) {
          if (r.width > 0.5 && r.height > 0.5 && r.right > window.innerWidth + 0.5) {
            hits.push({ text: text.slice(0, 80), right: r.right, innerWidth: window.innerWidth });
          }
        }
      }
    }
    node = walker.nextNode();
  }
  return hits;
}

function overflowBox(): OverflowBox {
  const vis = (el: Element) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const els = [...document.querySelectorAll('body *')].filter(vis);
  const rights = els.map((el) => el.getBoundingClientRect().right);
  return {
    innerWidth: window.innerWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    maxRight: rights.length ? Math.max(...rights) : 0,
  };
}

function heroBox(): HeroBox | null {
  const h1 = document.querySelector('h1.hub-marketing-display');
  if (!h1) return null;
  const r = h1.getBoundingClientRect();
  const range = document.createRange();
  range.selectNodeContents(h1);
  const rects = [...range.getClientRects()].filter((box) => box.width > 0.5 && box.height > 0.5);
  return {
    x: r.x,
    width: r.width,
    right: r.right,
    lines: rects.length,
    whiteSpace: getComputedStyle(h1).whiteSpace,
  };
}

function standalonePaint(kind: 'landing' | 'shell') {
  const headerSel = kind === 'landing' ? '.hub-marketing-nav' : '.shell-header';
  const contentSel = kind === 'landing'
    ? '.hub-marketing-nav a, .hub-marketing-nav [data-grafter-lockup]'
    : '.shell-header a, .shell-header [data-grafter-lockup]';
  const header = document.querySelector(headerSel);
  const content = document.querySelector(contentSel);
  const nav = document.querySelector('.shell-bottom-nav');
  return {
    contentTop: content ? content.getBoundingClientRect().top : -1,
    headerPadTop: header ? parseFloat(getComputedStyle(header).paddingTop) : -1,
    navPadBottom: nav ? parseFloat(getComputedStyle(nav).paddingBottom) : 0,
    navDisplay: nav ? getComputedStyle(nav).display : 'none',
  };
}

let distCss = '';
let landingJs = '';
let shellJs = '';
const browsers: Partial<Record<Engine, KillBrowser>> = {};
const temps: string[] = [];

beforeAll(async () => {
  distCss = readDistCss();
  landingJs = await bundleEntry(join(here, 'hfLand1.landing.entry.tsx'));
  shellJs = await bundleEntry(
    join(here, '../components/layout/s2Shell.chromium.entry.tsx'),
    join(here, '../components/layout/s2Shell.chromium.mocks.ts'),
  );
  for (const engine of BOTH) {
    browsers[engine] = await launchEngine(engine);
  }
}, 180000);

afterAll(async () => {
  for (const engine of BOTH) await browsers[engine]?.close();
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

async function openPage(args: {
  engine: Engine;
  kind: 'landing' | 'shell';
  width: number;
  standalone?: boolean;
}): Promise<KillPage> {
  const html = fixtureHtml(args.kind === 'landing' ? landingJs : shellJs, distCss);
  const dir = mkdtempSync(join(tmpdir(), 'hf-land-1-'));
  temps.push(dir);
  const file = join(dir, 't.html');
  writeFileSync(file, html);
  const page = await browsers[args.engine]!.newPage({ viewport: { width: args.width, height: 844 } });
  if (args.standalone) {
    await page.addInitScript(() => {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = ((q: string) => {
        if (String(q).includes('display-mode: standalone')) {
          return {
            matches: true,
            media: q,
            onchange: null,
            addListener() {},
            removeListener() {},
            addEventListener() {},
            removeEventListener() {},
            dispatchEvent() { return false; },
          } as MediaQueryList;
        }
        return orig(q);
      }) as typeof window.matchMedia;
    });
  }
  await page.goto(pathToFileURL(file).href);
  await page.waitForSelector(args.kind === 'landing' ? 'h1.hub-marketing-display' : '.shell-header', { timeout: 15000 });
  if (args.standalone) {
    await page.addStyleTag({
      content: `:root { --safe-area-inset-top: ${SAFE_TOP}px; --safe-area-inset-bottom: ${SAFE_BOTTOM}px; }`,
    });
  }
  await page.evaluate(() => document.fonts.ready);
  return page;
}

describe('HF-LAND-1 landing and shell kills (WebKit + Chromium)', () => {
  it('keeps viewport-fit=cover on the real viewport meta', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
  });

  it('HF-LAND-1 text-past-viewport: landing and shell at 320/375/390', async () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
    const displayRule = css.slice(
      css.indexOf('.hub-marketing-display {'),
      css.indexOf('.hub-marketing-display-sm'),
    );
    expect(displayRule, 'hero h1 wraps').toContain('white-space: normal');
    expect(displayRule.includes('white-space: nowrap'), 'hero h1 nowrap').toBe(false);
    for (const engine of BOTH) {
      for (const kind of ['landing', 'shell'] as const) {
        for (const width of TEXT_WIDTHS) {
          const page = await openPage({ engine, kind, width });
          const hits = await page.evaluate(textPastViewport);
          expect(hits, `${engine} ${kind} ${width} text past viewport ${JSON.stringify(hits)}`).toEqual([]);
          if (kind === 'landing') {
            const hero = await page.evaluate(heroBox);
            expect(hero, `${engine} landing hero at ${width}`).not.toBeNull();
            expect(hero!.whiteSpace, `${engine} landing h1 wrap at ${width}`).toBe('normal');
            expect(hero!.right, `${engine} landing h1 right at ${width}`).toBeLessThanOrEqual(width + 0.5);
            if (width === 320) {
              expect(hero!.lines, `${engine} landing h1 wraps at 320`).toBeGreaterThan(1);
            }
          }
          await page.close();
        }
      }
    }
  }, 180000);

  it('HF-LAND-1 overflow: docSW and maxRight at 375/390/768/1024/1280', async () => {
    for (const engine of BOTH) {
      for (const kind of ['landing', 'shell'] as const) {
        for (const width of OVERFLOW_WIDTHS) {
          const page = await openPage({ engine, kind, width });
          const box = await page.evaluate(overflowBox);
          expect(box.scrollWidth, `${engine} ${kind} docSW at ${width}`).toBeLessThanOrEqual(box.innerWidth);
          expect(box.maxRight, `${engine} ${kind} maxRight at ${width}`).toBeLessThanOrEqual(box.innerWidth + 0.5);
          if (width === 375 || width === 390) {
            const hits = await page.evaluate(textPastViewport);
            expect(hits, `${engine} ${kind} ${width} text past viewport ${JSON.stringify(hits)}`).toEqual([]);
          }
          await page.close();
        }
      }
    }
  }, 240000);

  it('HF-LAND-1 standalone safe-area: 47px top and 34px bottom', async () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
    expect(css, 'top env padding').toContain(
      'padding: calc(16px + env(safe-area-inset-top, 0px) + var(--safe-area-inset-top, 0px)) 24px 8px;',
    );
    expect(css, 'shell top env padding').toContain(
      'padding-top: calc(12px + env(safe-area-inset-top, 0px) + var(--safe-area-inset-top, 0px));',
    );
    expect(css, 'bottom env padding').toContain(
      'padding-bottom: calc(env(safe-area-inset-bottom, 0px) + var(--safe-area-inset-bottom, 0px));',
    );
    for (const engine of BOTH) {
      const landing = await openPage({ engine, kind: 'landing', width: 390, standalone: true });
      const land = await landing.evaluate(standalonePaint, 'landing');
      expect(land.contentTop, `${engine} landing header content top`).toBeGreaterThanOrEqual(SAFE_TOP);
      expect(land.headerPadTop, `${engine} landing header pad`).toBeGreaterThanOrEqual(SAFE_TOP);
      await landing.close();

      const shell = await openPage({ engine, kind: 'shell', width: 390, standalone: true });
      const paint = await shell.evaluate(standalonePaint, 'shell');
      expect(paint.contentTop, `${engine} shell header content top`).toBeGreaterThanOrEqual(SAFE_TOP);
      expect(paint.headerPadTop, `${engine} shell header pad`).toBeGreaterThanOrEqual(SAFE_TOP);
      expect(paint.navDisplay, `${engine} shell bottom nav`).not.toBe('none');
      expect(paint.navPadBottom, `${engine} shell bottom pad`).toBeGreaterThanOrEqual(SAFE_BOTTOM);
      await shell.close();
    }
  }, 120000);
});
