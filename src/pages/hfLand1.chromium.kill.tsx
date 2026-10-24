/**
 * @vitest-environment node
 *
 * HF-LAND-1: landing hero wrap, text-past-viewport, overflow, and standalone
 * safe-area on WebKit and Chromium over built dist CSS.
 *
 * Standalone insets are substituted in the served CSS. env(safe-area-inset-top)
 * becomes 47px and env(safe-area-inset-bottom) becomes 34px. Not a second
 * custom-property term. Removing env() from a rule makes geometry go red.
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
const OVERFLOW_WIDTHS = [320, 375, 390, 768, 1024, 1280] as const;
const BOTH = ['chromium', 'webkit'] as const;
const PAGE_KINDS = ['landing', 'privacy', 'terms', 'login', 'signup', 'portal', 'shell'] as const;
const PHONE_TABS = ['today', 'schedule', 'jobs', 'more'] as const;
const SAFE_TOP = 47;
const SAFE_BOTTOM = 34;

type Engine = (typeof BOTH)[number];
type PageKind = (typeof PAGE_KINDS)[number];
type PhoneTab = (typeof PHONE_TABS)[number];

type KillPage = {
  goto: (url: string) => Promise<unknown>;
  evaluate: <T, A = unknown>(fn: ((arg: A) => T | Promise<T>) | (() => T | Promise<T>), arg?: A) => Promise<T>;
  addInitScript: (fn: () => void) => Promise<void>;
  click: (sel: string) => Promise<unknown>;
  waitForSelector: (sel: string, opts?: { timeout?: number }) => Promise<unknown>;
  close: () => Promise<void>;
};

type KillBrowser = {
  newPage: (opts?: { viewport?: { width: number; height: number } }) => Promise<KillPage>;
  close: () => Promise<void>;
  version?: () => string;
};

type TextHit = { text: string; right: number; innerWidth: number };
type OverflowBox = { innerWidth: number; scrollWidth: number; maxRight: number };
type HeroText = { lines: number; rights: number[]; whiteSpace: string };
type TopPaint = { contentTop: number; headerPadTop: number; selector: string };
type BottomPaint = { contentBottom: number; innerHeight: number; limit: number };

const READY: Record<PageKind, string> = {
  landing: 'h1.hub-marketing-display',
  privacy: '.hub-legal-nav',
  terms: '.hub-legal-nav',
  login: '.hub-auth-nav',
  signup: '.hub-auth-nav',
  portal: '#client-portal .portal-doc',
  shell: '.shell-header',
};

const TOP_NAV: Record<PageKind, { header: string; content: string }> = {
  landing: { header: '.hub-marketing-nav', content: '.hub-marketing-nav a, .hub-marketing-nav [data-grafter-lockup]' },
  privacy: { header: '.hub-legal-nav', content: '.hub-legal-nav a, .hub-legal-nav [data-grafter-lockup]' },
  terms: { header: '.hub-legal-nav', content: '.hub-legal-nav a, .hub-legal-nav [data-grafter-lockup]' },
  login: { header: '.hub-auth', content: '.hub-auth-nav a, .hub-auth-nav [data-grafter-lockup]' },
  signup: { header: '.hub-auth', content: '.hub-auth-nav a, .hub-auth-nav [data-grafter-lockup]' },
  portal: { header: '#client-portal .portal-doc', content: '#client-portal .portal-doc > *' },
  shell: { header: '.shell-header', content: '.shell-header a, .shell-header [data-grafter-lockup]' },
};

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
        const browser = await mod.webkit.launch({ headless: true });
        if (!browser) throw new Error('webkit launch returned empty');
        return browser;
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
  throw new Error(`${engine} launch failed (FAIL, not a skip): ${errors.join('; ')}. WebKit must run on mcr.microsoft.com/playwright:v1.48.2-jammy.`);
}

function readDistCss(): string {
  const dir = join(process.cwd(), 'dist/assets');
  if (!existsSync(dir)) throw new Error('dist/assets missing; run npm run build');
  const files = readdirSync(dir).filter((name) => name.endsWith('.css'));
  if (!files.length) throw new Error('no dist CSS; run npm run build');
  return files.map((name) => readFileSync(join(dir, name), 'utf8')).join('\n');
}

function sliceRule(css: string, start: string, end: string): string {
  const from = css.lastIndexOf(start);
  const to = css.indexOf(end, from + start.length);
  if (from < 0 || to < 0) return '';
  return css.slice(from, to);
}

function decl(rule: string, prop: string): string | null {
  const match = rule.match(new RegExp(`${prop}:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
}

/** Live src/index.css wins over dist so a real-file mutant paints without a rebuild. */
function srcOverlay(src: string): string {
  const display = sliceRule(src, '.hub-marketing-display {', '.hub-marketing-display-sm');
  const nav = sliceRule(src, '.hub-marketing-nav {', '.hub-marketing-nav-actions');
  const legal = sliceRule(src, '.hub-legal-nav {', '.hub-legal-nav-actions');
  const auth = sliceRule(src, '.hub-auth {', '.hub-auth-nav');
  const portal = sliceRule(src, '#client-portal .portal-doc {', '#client-portal .portal-brand');
  const header = sliceRule(src, '.shell-header {', '.shell-nav-btn');
  const bottom = sliceRule(src, '.shell-bottom-nav {', '.shell-bottom-tab');
  const phoneH = src.match(/@media \(max-width: 767px\) \{[\s\S]*?--shell-bottom-nav-h:\s*([^;]+);/);
  const parts: string[] = [];
  const displayWs = decl(display, 'white-space');
  const displaySize = decl(display, 'font-size');
  const displayOverflow = decl(display, 'overflow');
  if (displayWs || displaySize) {
    parts.push(`.hub-marketing-display{${displayWs ? `white-space:${displayWs};` : ''}${displaySize ? `font-size:${displaySize};` : ''}${displayOverflow ? `overflow:${displayOverflow};` : ''}}`);
  }
  const navPad = decl(nav, 'padding');
  if (navPad) parts.push(`.hub-marketing-nav{padding:${navPad};}`);
  const legalPad = decl(legal, 'padding');
  if (legalPad) parts.push(`.hub-legal-nav{padding:${legalPad};}`);
  const authPad = decl(auth, 'padding');
  if (authPad) parts.push(`.hub-auth{padding:${authPad};}`);
  const portalPad = decl(portal, 'padding');
  if (portalPad) parts.push(`#client-portal .portal-doc{padding:${portalPad};}`);
  const headerPad = decl(header, 'padding-top');
  if (headerPad) parts.push(`.shell-header{padding-top:${headerPad};}`);
  const bottomPad = decl(bottom, 'padding-bottom');
  if (bottomPad) parts.push(`.shell-bottom-nav{padding-bottom:${bottomPad};}`);
  if (phoneH) parts.push(`@media (max-width: 767px){:root,.shell-root{--shell-bottom-nav-h:${phoneH[1].trim()}}}`);
  return parts.join('\n');
}

function rewriteSafeAreaEnv(css: string, top: number, bottom: number): string {
  return css
    .replace(/env\(\s*safe-area-inset-top(?:\s*,\s*[^)]+)?\s*\)/g, `${top}px`)
    .replace(/env\(\s*safe-area-inset-bottom(?:\s*,\s*[^)]+)?\s*\)/g, `${bottom}px`);
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

function heroText(): HeroText | null {
  const h1 = document.querySelector('h1.hub-marketing-display');
  if (!h1) return null;
  const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
  const rects: DOMRect[] = [];
  let node = walker.nextNode();
  while (node) {
    if ((node.textContent || '').trim()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of [...range.getClientRects()]) {
        if (r.width > 0.5 && r.height > 0.5) rects.push(r);
      }
    }
    node = walker.nextNode();
  }
  return {
    lines: rects.length,
    rights: rects.map((r) => r.right),
    whiteSpace: getComputedStyle(h1).whiteSpace,
  };
}

function topPaint(arg: { header: string; content: string }): TopPaint {
  const header = document.querySelector(arg.header);
  const content = document.querySelector(arg.content);
  return {
    selector: arg.header,
    contentTop: content ? content.getBoundingClientRect().top : -1,
    headerPadTop: header ? parseFloat(getComputedStyle(header).paddingTop) : -1,
  };
}

function bottomPaint(): BottomPaint {
  const tabs = [...document.querySelectorAll('.shell-bottom-tab')];
  const bottoms = tabs.map((tab) => {
    const parts = [...tab.querySelectorAll('span')];
    const els = parts.length ? parts : [tab];
    return Math.max(...els.map((el) => el.getBoundingClientRect().bottom));
  });
  return {
    contentBottom: bottoms.length ? Math.max(...bottoms) : -1,
    innerHeight: window.innerHeight,
    limit: window.innerHeight - 34,
  };
}

let distCss = '';
let landingJs = '';
let legalJs = '';
let authJs = '';
let portalJs = '';
let shellJs = '';
const browsers: Partial<Record<Engine, KillBrowser>> = {};
const temps: string[] = [];

function jsFor(kind: PageKind): string {
  if (kind === 'landing') return landingJs;
  if (kind === 'privacy' || kind === 'terms') return legalJs;
  if (kind === 'login' || kind === 'signup') return authJs;
  if (kind === 'portal') return portalJs;
  return shellJs;
}

function hashFor(kind: PageKind): string {
  if (kind === 'terms') return '#terms';
  if (kind === 'signup') return '#signup';
  return '';
}

beforeAll(async () => {
  distCss = readDistCss();
  landingJs = await bundleEntry(join(here, 'hfLand1.landing.entry.tsx'));
  legalJs = await bundleEntry(join(here, 'hfLand1.legal.entry.tsx'));
  authJs = await bundleEntry(join(here, 'hfLand1.auth.entry.tsx'));
  portalJs = await bundleEntry(join(here, 'hfLand1.portal.entry.tsx'));
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
  kind: PageKind;
  width: number;
  standalone?: boolean;
  tab?: PhoneTab;
}): Promise<KillPage> {
  const src = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
  const live = `${distCss}\n${srcOverlay(src)}`;
  const css = args.standalone ? rewriteSafeAreaEnv(live, SAFE_TOP, SAFE_BOTTOM) : live;
  const html = fixtureHtml(jsFor(args.kind), css);
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
  await page.goto(pathToFileURL(file).href + hashFor(args.kind));
  await page.waitForSelector(READY[args.kind], { timeout: 15000 });
  if (args.kind === 'shell' && args.tab) {
    await page.click(`[data-phone-tab="${args.tab}"]`);
    await page.waitForSelector(`[data-phone-tab="${args.tab}"]`, { timeout: 5000 });
  }
  await page.evaluate(() => document.fonts.ready);
  return page;
}

function measuredKills(engine: Engine) {
  it(`HF-LAND-1 ${engine} hero h1 text wraps at 320/375/390`, async () => {
    for (const width of TEXT_WIDTHS) {
      const page = await openPage({ engine, kind: 'landing', width });
      const hero = await page.evaluate(heroText);
      expect(hero, `${engine} landing hero text at ${width}`).not.toBeNull();
      expect(hero!.lines, `${engine} landing h1 text lines at ${width}`).toBeGreaterThan(1);
      expect(
        hero!.rights.every((right) => right <= width + 0.5),
        `${engine} landing h1 text right at ${width} ${JSON.stringify(hero)}`,
      ).toBe(true);
      const hits = await page.evaluate(textPastViewport);
      expect(hits, `${engine} landing ${width} text past viewport ${JSON.stringify(hits)}`).toEqual([]);
      await page.close();
    }
  }, 180000);

  it(`HF-LAND-1 ${engine} text-past-viewport on every touched page at 320/375/390`, async () => {
    for (const kind of PAGE_KINDS) {
      for (const width of TEXT_WIDTHS) {
        const page = await openPage({ engine, kind, width });
        const hits = await page.evaluate(textPastViewport);
        expect(hits, `${engine} ${kind} ${width} text past viewport ${JSON.stringify(hits)}`).toEqual([]);
        if (kind === 'shell') {
          for (const tab of PHONE_TABS) {
            await page.click(`[data-phone-tab="${tab}"]`);
            const tabHits = await page.evaluate(textPastViewport);
            expect(tabHits, `${engine} ${tab} ${width} text past viewport ${JSON.stringify(tabHits)}`).toEqual([]);
          }
        }
        await page.close();
      }
    }
  }, 300000);

  it(`HF-LAND-1 ${engine} overflow: docSW and maxRight at 320/375/390/768/1024/1280`, async () => {
    for (const kind of PAGE_KINDS) {
      for (const width of OVERFLOW_WIDTHS) {
        const page = await openPage({ engine, kind, width });
        const box = await page.evaluate(overflowBox);
        expect(box.scrollWidth, `${engine} ${kind} docSW at ${width}`).toBeLessThanOrEqual(box.innerWidth);
        expect(box.maxRight, `${engine} ${kind} maxRight at ${width}`).toBeLessThanOrEqual(box.innerWidth + 0.5);
        if (width === 320 || width === 375 || width === 390) {
          const hits = await page.evaluate(textPastViewport);
          expect(hits, `${engine} ${kind} ${width} text past viewport ${JSON.stringify(hits)}`).toEqual([]);
        }
        if (kind === 'shell' && width <= 390) {
          for (const tab of PHONE_TABS) {
            await page.click(`[data-phone-tab="${tab}"]`);
            const tabBox = await page.evaluate(overflowBox);
            expect(tabBox.scrollWidth, `${engine} ${tab} docSW at ${width}`).toBeLessThanOrEqual(tabBox.innerWidth);
            expect(tabBox.maxRight, `${engine} ${tab} maxRight at ${width}`).toBeLessThanOrEqual(tabBox.innerWidth + 0.5);
          }
        }
        await page.close();
      }
    }
  }, 360000);

  it(`HF-LAND-1 ${engine} env=0: top padding stays the production rest value`, async () => {
    const shell = await openPage({ engine, kind: 'shell', width: 390 });
    const shellPaint = await shell.evaluate(topPaint, TOP_NAV.shell);
    expect(shellPaint.headerPadTop, `${engine} shell pad at env 0`).toBeCloseTo(12, 0);
    await shell.close();

    const landing = await openPage({ engine, kind: 'landing', width: 390 });
    const landPaint = await landing.evaluate(topPaint, TOP_NAV.landing);
    expect(landPaint.headerPadTop, `${engine} landing pad at env 0`).toBeCloseTo(16, 0);
    await landing.close();
  }, 120000);

  it(`HF-LAND-1 ${engine} standalone: top nav content sits at 47px`, async () => {
    for (const kind of PAGE_KINDS) {
      for (const width of TEXT_WIDTHS) {
        const page = await openPage({ engine, kind, width, standalone: true });
        const paint = await page.evaluate(topPaint, TOP_NAV[kind]);
        expect(paint.contentTop, `${engine} ${kind} ${width} content top`).toBeGreaterThanOrEqual(SAFE_TOP);
        expect(paint.headerPadTop, `${engine} ${kind} ${width} pad top`).toBeGreaterThanOrEqual(SAFE_TOP);
        expect(paint.headerPadTop, `${engine} ${kind} ${width} pad top not doubled`).toBeLessThan(SAFE_TOP + 1);
        if (kind === 'shell') {
          for (const tab of PHONE_TABS) {
            await page.click(`[data-phone-tab="${tab}"]`);
            const tabPaint = await page.evaluate(topPaint, TOP_NAV.shell);
            expect(tabPaint.contentTop, `${engine} ${tab} ${width} content top`).toBeGreaterThanOrEqual(SAFE_TOP);
            expect(tabPaint.headerPadTop, `${engine} ${tab} ${width} pad top`).toBeGreaterThanOrEqual(SAFE_TOP);
            expect(tabPaint.headerPadTop, `${engine} ${tab} ${width} pad top not doubled`).toBeLessThan(SAFE_TOP + 1);
          }
        }
        await page.close();
      }
    }
  }, 300000);

  it(`HF-LAND-1 ${engine} standalone: bottom tab content sits above innerHeight-34`, async () => {
    for (const width of TEXT_WIDTHS) {
      const page = await openPage({ engine, kind: 'shell', width, standalone: true, tab: 'jobs' });
      for (const tab of PHONE_TABS) {
        await page.click(`[data-phone-tab="${tab}"]`);
        const paint = await page.evaluate(bottomPaint);
        expect(paint.contentBottom, `${engine} ${tab} ${width} tab content bottom`).toBeGreaterThan(0);
        expect(
          paint.contentBottom,
          `${engine} ${tab} ${width} tab content bottom ${paint.contentBottom} vs ${paint.limit}`,
        ).toBeLessThanOrEqual(paint.limit + 0.5);
      }
      await page.close();
    }
  }, 180000);
}

describe('HF-LAND-1 chromium measured', () => {
  measuredKills('chromium');
});

describe('HF-LAND-1 webkit measured', () => {
  it('HF-LAND-1 webkit browser version (0 skipped)', async () => {
    const browser = browsers.webkit;
    if (!browser) throw new Error('WebKit did not launch. That is a FAIL, not a skip. Run on mcr.microsoft.com/playwright:v1.48.2-jammy.');
    const version = browser.version ? browser.version() : '';
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const ua = await page.evaluate(() => navigator.userAgent);
    await page.close();
    expect(version, 'WebKit browser.version()').toBeTruthy();
    expect(ua, 'WebKit userAgent').toMatch(/WebKit|Safari/);
    console.log(`HF-LAND-1 WebKit browser version=${version} userAgent=${ua}`);
  });
  measuredKills('webkit');
});

describe('HF-LAND-1 source locks (after measured kills)', () => {
  it('keeps viewport-fit=cover and default status-bar style', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toMatch(/name="viewport"[^>]*viewport-fit=cover/);
    expect(html).toContain('apple-mobile-web-app-status-bar-style" content="default"');
  });

  it('uses one max() inset per top bar and no stand-in var', () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).toContain('padding-top: max(12px, env(safe-area-inset-top))');
    expect(css).toContain('padding: max(16px, env(safe-area-inset-top)) 24px 8px');
    expect(css).toContain('padding: max(16px, env(safe-area-inset-top)) 20px 0');
    expect(css).toContain('padding: max(16px, env(safe-area-inset-top)) 20px 40px');
    expect(css).toContain('padding: max(16px, env(safe-area-inset-top)) 16px 32px');
    expect(css).toContain('padding-bottom: env(safe-area-inset-bottom, 0px)');
    expect(css).not.toContain('var(--safe-area-inset-top');
    expect(css).not.toContain('var(--safe-area-inset-bottom');
    expect(css).not.toMatch(/padding-top:\s*calc\([^;]*env\(safe-area-inset-top/);
  });
});
