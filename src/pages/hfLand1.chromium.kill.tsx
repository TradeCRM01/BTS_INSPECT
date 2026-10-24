/**
 * @vitest-environment node
 *
 * HF-LAND-1 FROZEN kill (CoS, r5). Do not edit.
 *
 * Landing hero wrap, text-past-viewport, overflow, toast, and standalone
 * safe-area on WebKit and Chromium.
 *
 * Both sources are real in-run vite builds:
 * - 'head' is a vite build of process.cwd() into a mkdtemp outDir.
 * - 'aad2' is aad2eef7 from git archive into a mkdtemp dir. The SHA is checked
 *   by rev-parse and by get-tar-commit-id. The hfLand1 entry files are copied
 *   in and it is vite built into a mkdtemp outDir.
 * There is no CSS overlay and no test-side patching of either build. The only
 * served-CSS change is the standalone substitution:
 * env(safe-area-inset-top) becomes 47px and env(safe-area-inset-bottom)
 * becomes 34px.
 *
 * Filename omits `.test.` so the default include misses it.
 */
import { execFile, execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
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
const INSET0_WIDTHS = [320, 375, 390, 768, 1280] as const;
const AAD2_SHA = 'aad2eef7c11d90845a6e930ea36addfafc88aba6';
const SOURCES = ['head', 'aad2'] as const;

type Engine = (typeof BOTH)[number];
type PageKind = (typeof PAGE_KINDS)[number];
type PhoneTab = (typeof PHONE_TABS)[number];
type Source = (typeof SOURCES)[number];

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
type TopMeasure = { first: number; pad: number; tabs: Partial<Record<PhoneTab, { first: number; pad: number }>> };
type GeistResult = { ok: boolean; error: string };
type HtmlMeta = { statusBar: string | null; viewport: string | null };

/** Frozen standalone (inset 47) first-content targets. Review and portal also re-derive from real aad2 internal spacing. */
const STANDALONE_TARGET: Record<PageKind, number> = {
  landing: 63,
  pricing: 63,
  privacy: 63,
  terms: 63,
  login: 63,
  signup: 63,
  portal: 62,
  shell: 63,
  review: 53,
};


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


function readBuiltCss(outDir: string): string {
  const dir = join(outDir, 'assets');
  if (!existsSync(dir)) throw new Error(`${outDir}/assets missing after vite build`);
  const files = readdirSync(dir).filter((name) => name.endsWith('.css'));
  if (!files.length) throw new Error(`no built CSS in ${dir}`);
  return files.map((name) => readFileSync(join(dir, name), 'utf8')).join('\n');
}

function git(args: string[], input?: Buffer): string {
  return execFileSync('git', ['-c', 'safe.directory=*', ...args], {
    cwd: process.cwd(),
    input,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
}

/** Async so the vitest worker keeps answering RPC while vite builds. */
async function viteBuild(root: string, outDir: string): Promise<void> {
  const env: Record<string, string | undefined> = { ...process.env, NODE_ENV: 'production' };
  for (const key of Object.keys(env)) if (key.startsWith('VITEST')) delete env[key];
  await promisify(execFile)(process.execPath, [join(process.cwd(), 'node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'warn'], {
    cwd: root,
    env,
    maxBuffer: 64 * 1024 * 1024,
    timeout: 900000,
  });
}

/** Real aad2eef7 tree in a mkdtemp dir with the hfLand1 entries copied in. */
function checkoutAad2(): string {
  const tree = mkdtempSync(join(tmpdir(), 'hf-land-1-aad2-'));
  temps.push(tree);
  const resolved = git(['rev-parse', '--verify', 'aad2eef7^{commit}']);
  expect(resolved, 'aad2eef7 resolves to the frozen main SHA').toBe(AAD2_SHA);
  const tar = join(tree, '.aad2.tar');
  git(['archive', '--format=tar', '-o', tar, AAD2_SHA]);
  const tarCommit = execFileSync('git', ['get-tar-commit-id'], { input: readFileSync(tar).subarray(0, 1024), encoding: 'utf8' }).trim();
  expect(tarCommit, 'archived tree commit id').toBe(AAD2_SHA);
  execFileSync('tar', ['-xf', tar, '-C', tree]);
  rmSync(tar, { force: true });
  expect(existsSync(join(tree, 'src/index.css')), 'aad2 tree has src/index.css').toBe(true);
  const entries = readdirSync(here).filter((name) => /^hfLand1\..+\.entry\.tsx$/.test(name));
  expect(entries.length, 'hfLand1 entry files to copy into aad2').toBeGreaterThanOrEqual(6);
  for (const name of entries) copyFileSync(join(here, name), join(tree, 'src/pages', name));
  expect(existsSync(join(tree, 'src/components/layout/s2Shell.chromium.mocks.ts')), 'aad2 has the shell mocks').toBe(true);
  symlinkSync(join(process.cwd(), 'node_modules'), join(tree, 'node_modules'), 'dir');
  links.push(join(tree, 'node_modules'));
  return tree;
}

function startFixtureServer(root: string): Promise<{ origin: string; close: () => Promise<void> }> {
  return new Promise((done, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      const file = resolve(root, decodeURIComponent(url.pathname).replace(/^\/+/, ''));
      if (!file.startsWith(`${root}/`) || !existsSync(file) || !statSync(file).isFile()) {
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
      // Close each connection: a reused keep-alive socket that node idles out after 5s makes WebKit fail a font fetch.
      res.setHeader('Connection', 'close');
      res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('HF-LAND-1 fixture server failed to bind'));
        return;
      }
      done({
        origin: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((fin) => server.close(() => fin())),
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

async function bundleEntry(workDir: string, entry: string, mocks?: string): Promise<string> {
  const result = await esbuild.build({
    absWorkingDir: workDir,
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

function fixtureHtml(js: string, css: string, source: Source): string {
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
<style>@font-face{font-family:'Geist';src:url('/${source}/fonts/Geist-Variable.woff2') format('woff2');font-weight:100 900;font-style:normal;font-display:block}html,body{font-family:'Geist',sans-serif}</style>
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


function builtHtmlMeta(): HtmlMeta {
  return {
    statusBar: document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')?.getAttribute('content') ?? null,
    viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null,
  };
}

const ENTRY_KEYS = ['landing', 'legal', 'auth', 'portal', 'review', 'shell'] as const;
type EntryKey = (typeof ENTRY_KEYS)[number];
const builtCss: Record<Source, string> = { head: '', aad2: '' };
const bundles: Record<Source, Partial<Record<EntryKey, string>>> = { head: {}, aad2: {} };
let fixtureRoot = '';
let fixtureOrigin = '';
let fixtureServer: { origin: string; close: () => Promise<void> } | null = null;
const browsers: Partial<Record<Engine, KillBrowser>> = {};
const temps: string[] = [];
const links: string[] = [];

function entryFor(kind: PageKind): EntryKey {
  if (kind === 'landing' || kind === 'pricing') return 'landing';
  if (kind === 'privacy' || kind === 'terms') return 'legal';
  if (kind === 'login' || kind === 'signup') return 'auth';
  if (kind === 'portal') return 'portal';
  if (kind === 'review') return 'review';
  return 'shell';
}

function hashFor(kind: PageKind): string {
  if (kind === 'pricing') return '#pricing';
  if (kind === 'terms') return '#terms';
  if (kind === 'signup') return '#signup';
  return '';
}

async function bundleAll(source: Source, workDir: string): Promise<void> {
  const pages = join(workDir, 'src/pages');
  for (const key of ENTRY_KEYS) {
    bundles[source][key] = await bundleEntry(
      workDir,
      join(pages, `hfLand1.${key}.entry.tsx`),
      key === 'shell' ? join(workDir, 'src/components/layout/s2Shell.chromium.mocks.ts') : undefined,
    );
  }
}

beforeAll(async () => {
  const cwd = process.cwd();
  if (!existsSync(join(cwd, 'public/fonts/Geist-Variable.woff2'))) throw new Error('public/fonts/Geist-Variable.woff2 missing (FAIL, not a skip)');
  fixtureRoot = mkdtempSync(join(tmpdir(), 'hf-land-1-srv-'));
  temps.push(fixtureRoot);
  const aad2Tree = checkoutAad2();
  await viteBuild(cwd, join(fixtureRoot, 'head'));
  await viteBuild(aad2Tree, join(fixtureRoot, 'aad2'));
  for (const source of SOURCES) {
    const out = join(fixtureRoot, source);
    expect(existsSync(join(out, 'fonts/Geist-Variable.woff2')), `${source} build ships fonts/Geist-Variable.woff2`).toBe(true);
    builtCss[source] = readBuiltCss(out).replace(/url\((['"]?)\/fonts\//g, `url($1/${source}/fonts/`);
  }
  await bundleAll('head', cwd);
  await bundleAll('aad2', aad2Tree);
  fixtureServer = await startFixtureServer(fixtureRoot);
  fixtureOrigin = fixtureServer.origin;
  for (const engine of BOTH) {
    browsers[engine] = await launchEngine(engine);
  }
}, 1800000);

afterAll(async () => {
  for (const engine of BOTH) await browsers[engine]?.close();
  await fixtureServer?.close();
  for (const link of links) {
    if (existsSync(link) && lstatSync(link).isSymbolicLink()) unlinkSync(link);
  }
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

async function assertGeistLoaded(page: KillPage): Promise<void> {
  const res = await page.evaluate<GeistResult>(async () => {
    try {
      await document.fonts.ready;
      await document.fonts.load('16px Geist');
      return { ok: document.fonts.check('16px Geist'), error: '' };
    } catch (err) {
      const e = err as { name?: string; message?: string };
      return { ok: false, error: `${e && e.name ? e.name : 'Error'}: ${e && e.message ? e.message : String(err)}` };
    }
  });
  expect(res.error, 'Geist font load rejected (FAIL, not a skip)').toBe('');
  expect(res.ok, 'Geist must load via the built file path (FAIL, not a skip)').toBe(true);
}

async function openPage(args: {
  engine: Engine;
  kind: PageKind;
  width: number;
  standalone?: boolean;
  tab?: PhoneTab;
  source?: Source;
  scrollToPricing?: boolean;
}): Promise<KillPage> {
  const source = args.source ?? 'head';
  const live = builtCss[source];
  const css = args.standalone ? rewriteSafeAreaEnv(live, SAFE_TOP, SAFE_BOTTOM) : live;
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const dir = join(fixtureRoot, source, '__hf', id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 't.html'), fixtureHtml(bundles[source][entryFor(args.kind)]!, css, source));
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
  await page.goto(`${fixtureOrigin}/${source}/__hf/${id}/t.html${hashFor(args.kind)}`);
  await page.waitForSelector(READY[args.kind], { timeout: 15000 });
  await assertGeistLoaded(page);
  if (args.kind === 'pricing') {
    if (args.scrollToPricing === false) {
      const y = await page.evaluate(() => { window.scrollTo(0, 0); return window.scrollY; });
      expect(y, `${source} pricing scrollY at top`).toBe(0);
    } else {
      await page.evaluate(() => document.querySelector('#pricing')?.scrollIntoView());
      await page.waitForSelector('.hub-marketing-nav', { timeout: 5000 });
    }
  }
  if (args.kind === 'shell' && args.tab) {
    await page.click(`[data-phone-tab="${args.tab}"]`);
    await page.waitForSelector(`[data-phone-tab="${args.tab}"]`, { timeout: 5000 });
  }
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function measureTop(args: { engine: Engine; kind: PageKind; width: number; source: Source }): Promise<TopMeasure> {
  const page = await openPage({ ...args, scrollToPricing: false });
  const out: TopMeasure = {
    first: await page.evaluate(navFirstTop, TOP_NAV[args.kind].header),
    pad: (await page.evaluate(topPaint, TOP_NAV[args.kind])).headerPadTop,
    tabs: {},
  };
  if (args.kind === 'shell' && args.width <= 390) {
    for (const tab of PHONE_TABS) {
      await page.click(`[data-phone-tab="${tab}"]`);
      out.tabs[tab] = {
        first: await page.evaluate(navFirstTop, TOP_NAV.shell.header),
        pad: (await page.evaluate(topPaint, TOP_NAV.shell)).headerPadTop,
      };
    }
  }
  await page.close();
  return out;
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


  it(`HF-LAND-1 ${engine} env=0: every nav pad and first content equal the real aad2eef7 build at 320/375/390/768/1280`, async () => {
    for (const kind of PAGE_KINDS) {
      for (const width of INSET0_WIDTHS) {
        const base = await measureTop({ engine, kind, width, source: 'aad2' });
        const got = await measureTop({ engine, kind, width, source: 'head' });
        console.log(`HF-LAND-1 geom inset0 ${engine} ${kind} ${width} first=${got.first} aad2=${base.first} pad=${got.pad} aad2Pad=${base.pad}`);
        expect(base.first, `${engine} ${kind} ${width} aad2 first measured`).toBeGreaterThanOrEqual(0);
        expect(
          Math.abs(got.first - base.first),
          `${engine} ${kind} ${width} inset-0 first ${got.first} vs aad2 ${base.first}`,
        ).toBeLessThanOrEqual(0.5);
        expect(
          Math.abs(got.pad - base.pad),
          `${engine} ${kind} ${width} inset-0 pad ${got.pad} vs aad2 ${base.pad}`,
        ).toBeLessThanOrEqual(0.5);
        for (const tab of PHONE_TABS) {
          const a = base.tabs[tab];
          const g = got.tabs[tab];
          if (kind !== 'shell' || width > 390) continue;
          expect(a && g, `${engine} ${tab} ${width} tab measured on both builds`).toBeTruthy();
          expect(Math.abs(g!.first - a!.first), `${engine} ${tab} ${width} inset-0 first ${g!.first} vs aad2 ${a!.first}`).toBeLessThanOrEqual(0.5);
          expect(Math.abs(g!.pad - a!.pad), `${engine} ${tab} ${width} inset-0 pad ${g!.pad} vs aad2 ${a!.pad}`).toBeLessThanOrEqual(0.5);
        }
        if (kind === 'pricing') {
          const page = await openPage({ engine, kind, width });
          const scrolled = await page.evaluate(navFirstTop, TOP_NAV.pricing.header);
          await page.close();
          expect(Math.abs(scrolled - got.first), `${engine} pricing ${width} sticky nav first at #pricing ${scrolled} vs top ${got.first}`).toBeLessThanOrEqual(0.5);
        }
      }
    }
  }, 1200000);

  it(`HF-LAND-1 ${engine} standalone: first content hits the frozen inset-47 targets and is not doubled`, async () => {
    const floor = SAFE_TOP + INTERNAL_GAP;
    for (const kind of PAGE_KINDS) {
      const bar = kind === 'shell' || kind === 'review' ? SAFE_TOP : PUBLIC_STANDALONE_TOP;
      const target = STANDALONE_TARGET[kind];
      const minFirst = kind === 'review' ? SAFE_TOP : floor;
      for (const width of TEXT_WIDTHS) {
        if (kind === 'review' || kind === 'portal') {
          const base = await measureTop({ engine, kind, width, source: 'aad2' });
          const internal = base.first - base.pad;
          expect(
            Math.abs(bar + internal - target),
            `${engine} ${kind} ${width} frozen target ${target} vs ${bar} + aad2 internal ${internal}`,
          ).toBeLessThanOrEqual(0.5);
        }
        const page = await openPage({ engine, kind, width, standalone: true });
        const first = await page.evaluate(navFirstTop, TOP_NAV[kind].header);
        const paint = await page.evaluate(topPaint, TOP_NAV[kind]);
        console.log(`HF-LAND-1 geom standalone ${engine} ${kind} ${width} first=${first} target=${target} pad=${paint.headerPadTop} bar=${bar}`);
        expect(first, `${engine} ${kind} ${width} first nav top`).toBeGreaterThanOrEqual(minFirst);
        expect(
          Math.abs(paint.headerPadTop - bar),
          `${engine} ${kind} ${width} pad ${paint.headerPadTop} vs bar ${bar}`,
        ).toBeLessThanOrEqual(0.5);
        expect(
          Math.abs(first - target),
          `${engine} ${kind} ${width} first nav top ${first} vs target ${target}`,
        ).toBeLessThanOrEqual(0.5);
        if (kind === 'shell') {
          for (const tab of PHONE_TABS) {
            await page.click(`[data-phone-tab="${tab}"]`);
            const tabFirst = await page.evaluate(navFirstTop, TOP_NAV.shell.header);
            expect(tabFirst, `${engine} ${tab} ${width} first nav top`).toBeGreaterThanOrEqual(floor);
            expect(Math.abs(tabFirst - target), `${engine} ${tab} ${width} first ${tabFirst} vs target ${target}`).toBeLessThanOrEqual(0.5);
          }
        }
        await page.close();
      }
    }
  }, 600000);


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

  it(`HF-LAND-1 ${engine} built index.html keeps viewport-fit=cover and the default status-bar style (DOM)`, async () => {
    const page = await browsers[engine]!.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${fixtureOrigin}/head/index.html`);
    const meta = await page.evaluate(builtHtmlMeta);
    await page.close();
    expect(meta.viewport, `${engine} built meta viewport`).toMatch(/viewport-fit=cover/);
    expect(meta.statusBar, `${engine} built meta apple-mobile-web-app-status-bar-style`).toBe('default');
  }, 60000);
}


describe('HF-LAND-1 chromium measured', () => {
  measuredKills('chromium');
});

const WEBKIT_TEST_COUNT = 9;

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
  /** The kicker nowrap lock stays a source lock: at 320 the kicker fits on one line either way, so no measurement can see it. */
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