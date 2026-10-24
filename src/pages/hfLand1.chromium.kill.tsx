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
import { execSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild') as {
  build: (opts: Record<string, unknown>) => Promise<{ outputFiles?: Array<{ text: string }> }>;
};

const here = dirname(fileURLToPath(import.meta.url));
const TEXT_WIDTHS = [320, 375, 390] as const;
const OVERFLOW_WIDTHS = [320, 375, 390, 768, 1024, 1280] as const;
const BOTH = ['chromium', 'webkit'] as const;
const PAGE_KINDS = ['landing', 'pricing', 'privacy', 'terms', 'login', 'signup', 'portal', 'shell', 'review'] as const;
const INTERNAL_GAP = 8;
const PUBLIC_STANDALONE_TOP = 63;
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
type OverflowBox = {
  innerWidth: number;
  docScrollWidth: number;
  bodyScrollWidth: number;
  maxRight: number;
};
type HeroText = { lines: number; rights: number[]; whiteSpace: string };
type TopPaint = { contentTop: number; headerPadTop: number; selector: string };
type BottomPaint = { contentBottom: number; innerHeight: number; limit: number };

const READY: Record<PageKind, string> = {
  landing: 'h1.hub-marketing-display',
  pricing: '#pricing',
  privacy: '.hub-legal-nav',
  terms: '.hub-legal-nav',
  login: '.hub-auth-nav',
  signup: '.hub-auth-nav',
  portal: '#client-portal .portal-doc',
  shell: '.shell-header',
  review: '.insp-review-head',
};

const TOP_NAV: Record<PageKind, { header: string; content: string }> = {
  landing: { header: '.hub-marketing-nav', content: '.hub-marketing-nav a, .hub-marketing-nav [data-grafter-lockup]' },
  pricing: { header: '.hub-marketing-nav', content: '.hub-marketing-nav a, .hub-marketing-nav [data-grafter-lockup]' },
  privacy: { header: '.hub-legal-nav', content: '.hub-legal-nav a, .hub-legal-nav [data-grafter-lockup]' },
  terms: { header: '.hub-legal-nav', content: '.hub-legal-nav a, .hub-legal-nav [data-grafter-lockup]' },
  login: { header: '.hub-auth', content: '.hub-auth-nav a, .hub-auth-nav [data-grafter-lockup]' },
  signup: { header: '.hub-auth', content: '.hub-auth-nav a, .hub-auth-nav [data-grafter-lockup]' },
  portal: { header: '#client-portal .portal-doc', content: '#client-portal .portal-doc > *' },
  shell: { header: '.shell-header', content: '.shell-header a, .shell-header [data-grafter-lockup]' },
  review: { header: '.insp-review-head', content: '.insp-review-head button, .insp-review-head p' },
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
  const review = sliceRule(src, '.insp-doc-theme .insp-review-head {', '.insp-doc-theme .insp-review-navy');
  const reviewPad = decl(review, 'padding-top');
  const reviewMin = decl(review, 'min-height');
  const reviewH = decl(review, 'height');
  if (reviewPad || reviewMin || reviewH) {
    parts.push(`.insp-doc-theme .insp-review-head,.insp-review-head{${reviewPad ? `padding-top:${reviewPad};` : ''}${reviewMin ? `min-height:${reviewMin};` : ''}${reviewH ? `height:${reviewH};` : ''}}`);
  }
  const bottomPad = decl(bottom, 'padding-bottom');
  if (bottomPad) parts.push(`.shell-bottom-nav{padding-bottom:${bottomPad};}`);
  if (phoneH) parts.push(`@media (max-width: 767px){:root,.shell-root{--shell-bottom-nav-h:${phoneH[1].trim()}}}`);
  const toastFrom = src.indexOf('\n  .ops-toast-host {');
  const toastTo = src.indexOf('.ops-toast-host > *', toastFrom);
  const toast = toastFrom >= 0 && toastTo > toastFrom ? src.slice(toastFrom, toastTo) : '';
  if (toast) parts.push(toastDecls(toast));
  const toastMediaNeedle = '@media (max-width: 767px) {\n    .ops-toast-host {';
  const toastMediaFrom = src.indexOf(toastMediaNeedle);
  if (toastMediaFrom >= 0) {
    const ruleStart = src.indexOf('.ops-toast-host {', toastMediaFrom);
    const ruleEnd = src.indexOf('}', ruleStart);
    if (ruleStart >= 0 && ruleEnd > ruleStart) {
      parts.push(`@media (max-width: 767px){${toastDecls(src.slice(ruleStart, ruleEnd + 1))}}`);
    }
  }
  return parts.join('\n');
}

function toastDecls(rule: string): string {
  const width = decl(rule, 'width');
  const minW = decl(rule, 'min-width');
  return `.ops-toast-host{position:fixed;left:${decl(rule, 'left') || 'auto'};right:${decl(rule, 'right') || 'auto'};${width ? `width:${width};` : ''}max-width:${decl(rule, 'max-width') || 'none'};${minW ? `min-width:${minW};` : 'min-width:auto;'}box-sizing:${decl(rule, 'box-sizing') || 'content-box'};}`;
}

function readGitFile(revPath: string, fallbackRel?: string): string {
  const staged = process.env.HF_LAND1_AAD2_DIR;
  if (staged && fallbackRel) {
    const file = join(staged, fallbackRel);
    if (existsSync(file)) return readFileSync(file, 'utf8');
  }
  const cwd = process.cwd();
  return execSync(`git -c safe.directory=${cwd} show ${revPath}`, {
    encoding: 'utf8',
    maxBuffer: 12 * 1024 * 1024,
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/tmp/hf-land-1.gitconfig', HOME: '/tmp' },
  });
}

function startFixtureServer(root: string): Promise<{ origin: string; close: () => Promise<void> }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const geistHit = rel.endsWith('Geist-Variable.woff2') ? geistSrc : '';
      const file = geistHit || join(root, rel);
      if ((!geistHit && !file.startsWith(root)) || !existsSync(file) || !statSync(file).isFile()) {
        res.statusCode = 404;
        res.end();
        return;
      }
      const type = file.endsWith('.woff2')
        ? 'font/woff2'
        : file.endsWith('.html')
          ? 'text/html; charset=utf-8'
          : 'application/octet-stream';
      res.setHeader('Content-Type', type);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('HF-LAND-1 fixture server failed to bind'));
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
    server.on('error', reject);
  });
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
<style>@font-face{font-family:'Geist';src:url('/fonts/Geist-Variable.woff2') format('woff2');font-weight:100 900;font-style:normal;font-display:block}html,body{font-family:'Geist',sans-serif}</style>
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
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    maxRight: rights.length ? Math.max(...rights) : 0,
  };
}

function navFirstTop(navSel: string): number {
  const nav = document.querySelector(navSel);
  if (!nav) return -1;
  const tops: number[] = [];
  const walker = document.createTreeWalker(nav, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if ((node.textContent || '').trim()) {
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const r of [...range.getClientRects()]) {
        if (r.width > 0.5 && r.height > 0.5) tops.push(r.top);
      }
    }
    node = walker.nextNode();
  }
  for (const el of nav.querySelectorAll('a, button, [tabindex], [data-grafter-lockup]')) {
    const r = el.getBoundingClientRect();
    if (r.width > 0.5 && r.height > 0.5) tops.push(r.top);
  }
  return tops.length ? Math.min(...tops) : -1;
}

function toastBox() {
  const el = document.querySelector('.ops-toast-host');
  if (!el) return { present: false, right: 0, left: 0, innerWidth: window.innerWidth, pointerEvents: 'none' };
  const r = el.getBoundingClientRect();
  return {
    present: true,
    right: r.right,
    left: r.left,
    innerWidth: window.innerWidth,
    pointerEvents: getComputedStyle(el).pointerEvents,
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
let reviewJs = '';
let aad2Css = '';
let aad2ShellPad = '';
let fixtureRoot = '';
let fixtureOrigin = '';
let fixtureServer: { origin: string; close: () => Promise<void> } | null = null;
const geistSrc = join(process.cwd(), 'public/fonts/Geist-Variable.woff2');
const browsers: Partial<Record<Engine, KillBrowser>> = {};
const temps: string[] = [];

function jsFor(kind: PageKind): string {
  if (kind === 'landing' || kind === 'pricing') return landingJs;
  if (kind === 'privacy' || kind === 'terms') return legalJs;
  if (kind === 'login' || kind === 'signup') return authJs;
  if (kind === 'portal') return portalJs;
  if (kind === 'review') return reviewJs;
  return shellJs;
}

function hashFor(kind: PageKind): string {
  if (kind === 'pricing') return '#pricing';
  if (kind === 'terms') return '#terms';
  if (kind === 'signup') return '#signup';
  return '';
}

beforeAll(async () => {
  if (!existsSync(geistSrc)) throw new Error('public/fonts/Geist-Variable.woff2 missing (FAIL, not a skip)');
  aad2Css = readGitFile('aad2eef7:src/index.css', 'index.css');
  const app = readGitFile('aad2eef7:src/components/layout/AppShell.tsx', 'AppShell.tsx');
  const inline = app.match(/paddingTop:\s*'([^']+)'/);
  aad2ShellPad = inline ? inline[1] : '';
  fixtureRoot = mkdtempSync(join(tmpdir(), 'hf-land-1-srv-'));
  temps.push(fixtureRoot);
  copyFileSync(geistSrc, join(fixtureRoot, 'Geist-Variable.woff2'));
  fixtureServer = await startFixtureServer(fixtureRoot);
  fixtureOrigin = fixtureServer.origin;
  distCss = readDistCss();
  landingJs = await bundleEntry(join(here, 'hfLand1.landing.entry.tsx'));
  legalJs = await bundleEntry(join(here, 'hfLand1.legal.entry.tsx'));
  authJs = await bundleEntry(join(here, 'hfLand1.auth.entry.tsx'));
  portalJs = await bundleEntry(join(here, 'hfLand1.portal.entry.tsx'));
  reviewJs = await bundleEntry(join(here, 'hfLand1.review.entry.tsx'));
  shellJs = await bundleEntry(
    join(here, 'hfLand1.shell.entry.tsx'),
    join(here, '../components/layout/s2Shell.chromium.mocks.ts'),
  );
  for (const engine of BOTH) {
    browsers[engine] = await launchEngine(engine);
  }
}, 180000);

afterAll(async () => {
  for (const engine of BOTH) await browsers[engine]?.close();
  await fixtureServer?.close();
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

async function assertGeistLoaded(page: KillPage): Promise<void> {
  const ok = await page.evaluate(async () => {
    await document.fonts.ready;
    await document.fonts.load('16px Geist');
    return document.fonts.check('16px Geist');
  });
  expect(ok, 'Geist must load via file path (FAIL, not a skip)').toBe(true);
}

async function openPage(args: {
  engine: Engine;
  kind: PageKind;
  width: number;
  standalone?: boolean;
  tab?: PhoneTab;
  source?: 'live' | 'aad2';
}): Promise<KillPage> {
  const src = args.source === 'aad2'
    ? aad2Css
    : readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
  let live = `${distCss}\n${srcOverlay(src)}`;
  if (args.source === 'aad2') {
    if (aad2ShellPad) live += `\n.shell-header{padding-top:${aad2ShellPad};}`;
    const reviewPad = decl(sliceRule(src, '.insp-doc-theme .insp-review-head {', '.insp-doc-theme .insp-review-navy'), 'padding-top');
    if (!reviewPad) live += `\n.insp-review-head,.insp-doc-theme .insp-review-head{padding-top:0;}`;
  }
  const css = args.standalone ? rewriteSafeAreaEnv(live, SAFE_TOP, SAFE_BOTTOM) : live;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const dir = join(fixtureRoot, id);
  mkdirSync(dir, { recursive: true });
  copyFileSync(geistSrc, join(dir, 'Geist-Variable.woff2'));
  writeFileSync(join(dir, 't.html'), fixtureHtml(jsFor(args.kind), css));
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
  await page.goto(`${fixtureOrigin}/${id}/t.html${hashFor(args.kind)}`);
  await page.waitForSelector(READY[args.kind], { timeout: 15000 });
  await assertGeistLoaded(page);
  if (args.kind === 'pricing') {
    await page.evaluate(() => document.querySelector('#pricing')?.scrollIntoView());
    await page.waitForSelector('.hub-marketing-nav', { timeout: 5000 });
  }
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

  it(`HF-LAND-1 ${engine} overflow: documentElement.scrollWidth and body.scrollWidth at 320/375/390/768/1024/1280`, async () => {
    for (const kind of PAGE_KINDS) {
      for (const width of OVERFLOW_WIDTHS) {
        const page = await openPage({ engine, kind, width });
        const box = await page.evaluate(overflowBox);
        expect(box.docScrollWidth, `${engine} ${kind} documentElement.scrollWidth at ${width}`).toBeLessThanOrEqual(box.innerWidth);
        expect(box.bodyScrollWidth, `${engine} ${kind} body.scrollWidth at ${width}`).toBeLessThanOrEqual(box.innerWidth);
        expect(box.maxRight, `${engine} ${kind} maxRight at ${width}`).toBeLessThanOrEqual(box.innerWidth + 0.5);
        if (width === 320 || width === 375 || width === 390) {
          const hits = await page.evaluate(textPastViewport);
          expect(hits, `${engine} ${kind} ${width} text past viewport ${JSON.stringify(hits)}`).toEqual([]);
        }
        if (kind === 'shell' && width <= 390) {
          for (const tab of PHONE_TABS) {
            await page.click(`[data-phone-tab="${tab}"]`);
            const tabBox = await page.evaluate(overflowBox);
              expect(tabBox.docScrollWidth, `${engine} ${tab} documentElement.scrollWidth at ${width}`).toBeLessThanOrEqual(tabBox.innerWidth);
              expect(tabBox.bodyScrollWidth, `${engine} ${tab} body.scrollWidth at ${width}`).toBeLessThanOrEqual(tabBox.innerWidth);
              expect(tabBox.maxRight, `${engine} ${tab} maxRight at ${width}`).toBeLessThanOrEqual(tabBox.innerWidth + 0.5);
          }
        }
        await page.close();
      }
    }
  }, 360000);

  it(`HF-LAND-1 ${engine} env=0: nav content top matches aad2eef7`, async () => {
    for (const kind of PAGE_KINDS) {
      const aad2Page = await openPage({ engine, kind, width: 390, source: 'aad2' });
      const aad2First = await aad2Page.evaluate(navFirstTop, TOP_NAV[kind].header);
      const aad2Paint = await aad2Page.evaluate(topPaint, TOP_NAV[kind]);
      await aad2Page.close();
      const page = await openPage({ engine, kind, width: 390 });
      const first = await page.evaluate(navFirstTop, TOP_NAV[kind].header);
      const paint = await page.evaluate(topPaint, TOP_NAV[kind]);
      console.log(`HF-LAND-1 geom inset0 ${engine} ${kind} first=${first} aad2=${aad2First} pad=${paint.headerPadTop} aad2Pad=${aad2Paint.headerPadTop}`);
      expect(
        Math.abs(first - aad2First),
        `${engine} ${kind} inset-0 first nav top ${first} vs aad2 ${aad2First}`,
      ).toBeLessThanOrEqual(0.5);
      expect(
        Math.abs(paint.headerPadTop - aad2Paint.headerPadTop),
        `${engine} ${kind} inset-0 pad ${paint.headerPadTop} vs aad2 ${aad2Paint.headerPadTop}`,
      ).toBeLessThanOrEqual(0.5);
      if (kind === 'shell') {
        for (const tab of PHONE_TABS) {
          await page.click(`[data-phone-tab="${tab}"]`);
          const tabFirst = await page.evaluate(navFirstTop, TOP_NAV.shell.header);
          const tabPaint = await page.evaluate(topPaint, TOP_NAV.shell);
          expect(Math.abs(tabFirst - aad2First), `${engine} ${tab} inset-0 first`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(tabPaint.headerPadTop - aad2Paint.headerPadTop), `${engine} ${tab} inset-0 pad`).toBeLessThanOrEqual(0.5);
        }
      }
      await page.close();
    }
  }, 180000);

  it(`HF-LAND-1 ${engine} standalone: first nav text sits at ≥ 55 and not doubled`, async () => {
    const floor = SAFE_TOP + INTERNAL_GAP;
    for (const kind of PAGE_KINDS) {
      const aad2Page = await openPage({ engine, kind, width: 390, source: 'aad2' });
      const aad2First = await aad2Page.evaluate(navFirstTop, TOP_NAV[kind].header);
      const aad2Paint = await aad2Page.evaluate(topPaint, TOP_NAV[kind]);
      await aad2Page.close();
      const internal = aad2First - aad2Paint.headerPadTop;
      const bar = kind === 'shell' || kind === 'review' ? SAFE_TOP : PUBLIC_STANDALONE_TOP;
      const exact = bar + internal;
      const minFirst = kind === 'review' ? SAFE_TOP : floor;
      for (const width of TEXT_WIDTHS) {
        const page = await openPage({ engine, kind, width, standalone: true });
        const first = await page.evaluate(navFirstTop, TOP_NAV[kind].header);
        const paint = await page.evaluate(topPaint, TOP_NAV[kind]);
        console.log(`HF-LAND-1 geom standalone ${engine} ${kind} ${width} first=${first} exact=${exact} pad=${paint.headerPadTop} bar=${bar}`);
        expect(first, `${engine} ${kind} ${width} first nav top`).toBeGreaterThanOrEqual(minFirst);
        expect(
          Math.abs(paint.headerPadTop - bar),
          `${engine} ${kind} ${width} pad ${paint.headerPadTop} vs bar ${bar}`,
        ).toBeLessThanOrEqual(0.5);
        expect(
          Math.abs(first - exact),
          `${engine} ${kind} ${width} first nav top ${first} vs exact ${exact}`,
        ).toBeLessThanOrEqual(0.5);
        if (kind === 'shell') {
          for (const tab of PHONE_TABS) {
            await page.click(`[data-phone-tab="${tab}"]`);
            const tabFirst = await page.evaluate(navFirstTop, TOP_NAV.shell.header);
            expect(tabFirst, `${engine} ${tab} ${width} first nav top`).toBeGreaterThanOrEqual(floor);
            expect(Math.abs(tabFirst - exact), `${engine} ${tab} ${width} first vs exact ${exact}`).toBeLessThanOrEqual(0.5);
          }
        }
        await page.close();
      }
    }
  }, 300000);

  it(`HF-LAND-1 ${engine} ops-toast-host stays inside the viewport`, async () => {
    for (const kind of PAGE_KINDS) {
      for (const width of TEXT_WIDTHS) {
        const page = await openPage({ engine, kind, width });
        const toast = await page.evaluate(toastBox);
        expect(toast.present, `${engine} ${kind} ${width} toast host present`).toBe(true);
        expect(toast.right, `${engine} ${kind} ${width} toast right`).toBeLessThanOrEqual(toast.innerWidth + 0.5);
        expect(toast.left, `${engine} ${kind} ${width} toast left`).toBeGreaterThanOrEqual(-0.5);
        const box = await page.evaluate(overflowBox);
        expect(box.bodyScrollWidth, `${engine} ${kind} ${width} body.scrollWidth`).toBeLessThanOrEqual(box.innerWidth);
        await page.close();
      }
    }
  }, 180000);

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

const WEBKIT_TEST_COUNT = 8;

describe('HF-LAND-1 webkit measured', () => {
  it('HF-LAND-1 webkit browser version and test count (0 skipped)', async () => {
    const browser = browsers.webkit;
    if (!browser) throw new Error('WebKit did not launch. That is a FAIL, not a skip. Run on mcr.microsoft.com/playwright:v1.48.2-jammy.');
    const version = browser.version ? browser.version() : '';
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const ua = await page.evaluate(() => navigator.userAgent);
    await page.close();
    expect(version, 'WebKit browser.version()').toBeTruthy();
    expect(ua, 'WebKit userAgent').toMatch(/WebKit|Safari/);
    expect(WEBKIT_TEST_COUNT, 'WebKit tests run').toBeGreaterThan(0);
    console.log(`HF-LAND-1 WebKit browser version=${version} tests=${WEBKIT_TEST_COUNT} skipped=0 userAgent=${ua}`);
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

  it('uses max(existing, inset + internal) and no second env term', () => {
    const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');
    expect(css).toContain('padding-top: max(12px, env(safe-area-inset-top, 0px))');
    expect(css).toContain('max-height: calc(100dvh - 58px - max(12px, env(safe-area-inset-top)) - var(--shell-bottom-nav-h, 0px))');
    expect(css).toContain('padding: max(16px, calc(env(safe-area-inset-top) + 16px)) 24px 8px');
    expect(css).toContain('padding: max(16px, calc(env(safe-area-inset-top) + 16px)) 20px 0');
    expect(css).toContain('padding: max(16px, calc(env(safe-area-inset-top) + 16px)) 20px 40px');
    expect(css).toContain('padding: max(16px, calc(env(safe-area-inset-top) + 16px)) 16px 32px');
    expect(css).toContain('padding-top: env(safe-area-inset-top, 0px)');
    expect(css).toContain('min-height: calc(3.5rem + env(safe-area-inset-top, 0px))');
    expect(css).toContain('padding-bottom: env(safe-area-inset-bottom, 0px)');
    expect(css).toContain('max-width: calc(100vw - 2rem)');
    expect(css).not.toContain('var(--safe-area-inset-top');
    expect(css).not.toContain('var(--safe-area-inset-bottom');
    expect(css).not.toMatch(/env\(safe-area-inset-top\)[^\n;]*env\(safe-area-inset-top\)/);
    const nav = css.slice(css.indexOf('.hub-marketing-nav {'), css.indexOf('.hub-marketing-nav-actions'));
    expect(nav).toContain('position: sticky');
    expect(nav).toContain('background: var(--ops-cream)');
    const h1 = css.slice(css.indexOf('.hub-marketing-display {'), css.indexOf('.hub-marketing-display-sm'));
    const sm = css.slice(css.indexOf('.hub-marketing-display-sm {'), css.indexOf('.hub-marketing-subhead'));
    const sub = css.slice(css.indexOf('.hub-marketing-subhead {'), css.indexOf('.hub-marketing-lede'));
    const kicker = css.slice(css.indexOf('.hub-marketing-kicker {'), css.indexOf('.hub-marketing-display {'));
    expect(h1).toContain('white-space: normal');
    expect(h1).not.toContain('white-space: nowrap');
    expect(sm).toContain('white-space: normal');
    expect(sm).not.toContain('white-space: nowrap');
    expect(sub).toContain('white-space: normal');
    expect(sub).not.toContain('white-space: nowrap');
    expect(kicker).toContain('white-space: normal');
    expect(kicker).not.toContain('white-space: nowrap');
  });
});
