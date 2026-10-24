/**
 * HF-403-768 FROZEN kill (CoS) — do not edit.
 *
 * Shared K1–K8 matrix for PR #406, run in both engines by
 *   src/test/hf406.frozen.chromium.kill.tsx  (host)
 *   src/test/hf406.frozen.webkit.kill.tsx    (WebKit 1.48.2 jammy container)
 *
 * Everything is measured live on builds made in-run inside a mkdtemp dir:
 *   - head:  `vite build` of this worktree (VITE_LOOK_PROOF=1), served over http.
 *   - aad2:  `git worktree add --detach <mkdtemp> aad2eef7` (SHA checked), dashboard-full seed
 *            injected from head's DashboardPage, `vite build`, served over http.
 *   - store: esbuild bundle of the real DashboardPage over hf406.frozen.mocks.ts, whose
 *            `dashboard_widgets` table is a real in-page store (window.__HF406_STORE__), served
 *            from the head build so the dist CSS and /fonts/Geist load as in prod.
 * No test-injected CSS, no DOM mutation, no fixed /tmp paths, no committed fixtures.
 * Setup errors fail every test (no beforeAll; each test awaits the shared setup).
 * Browser time zone is pinned (Australia/Brisbane) and Date is frozen, so host TZ is irrelevant.
 */
import { execFileSync, spawn } from 'node:child_process';
import { appendFileSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export type Engine = 'chromium' | 'webkit';

const AAD2_SHA = 'aad2eef7c11d90845a6e930ea36addfafc88aba6';
const FROZEN_NOW = '2026-10-19T03:40:00.000Z';
const BROWSER_TZ = 'Australia/Brisbane';
const TEST_MS = 900_000;
const here = dirname(fileURLToPath(import.meta.url));
const requireHere = createRequire(import.meta.url);

const BUILD_ENV = {
  VITE_LOOK_PROOF: '1',
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'test-anon-key',
};

const MIME: Record<string, string> = {
  '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2',
  '.woff': 'font/woff', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain',
};

type Rect = { id: string; x: number; y: number; w: number; h: number; r: number; b: number };
type Layout = {
  iw: number;
  cards: Rect[];
  canvas: { left: number; right: number; found: string } | null;
  pageH: number;
};

type Env = {
  engine: Engine;
  work: string;
  browser: Any;
  headOrigin: string;
  aad2Origin: string;
  aad2Head: string;
  servers: Server[];
  aad2Wt: string;
  repoRoot: string;
  fullSeed: Array<Record<string, unknown>>;
};

/* ───────────────────────────── node-side setup ───────────────────────────── */

function sh(cmd: string, args: string[], cwd: string, env?: Record<string, string>): string {
  return execFileSync(cmd, args, {
    cwd,
    env: { ...process.env, ...(env ?? {}) },
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 256 * 1024 * 1024,
  }).toString();
}

/** Async child process (keeps the vitest worker's event loop free during long builds). */
function shAsync(cmd: string, args: string[], cwd: string, env?: Record<string, string>): Promise<string> {
  return new Promise((resolveP, rejectP) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...(env ?? {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += String(d); });
    child.stderr.on('data', (d) => { err += String(d); });
    child.on('error', rejectP);
    child.on('close', (code) => {
      if (code === 0) resolveP(out);
      else rejectP(new Error(`${cmd} ${args.join(' ')} exited ${String(code)}\n${err.slice(-4000)}`));
    });
  });
}

async function viteBuild(cwd: string, outDir: string) {
  await shAsync(process.execPath, [join(cwd, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir, '--emptyOutDir'], cwd, BUILD_ENV);
  if (!existsSync(join(outDir, 'index.html'))) throw new Error(`vite build produced no index.html in ${outDir}`);
}

function injectDashboardFullLook(pageSrc: string, authSrc: string, headPageSrc: string): { page: string; auth: string } {
  const auth = authSrc.includes("look') === 'dashboard-full'")
    ? authSrc
    : authSrc.replace(
      "|| params.get('look') === 'dashboard-repro'",
      "|| params.get('look') === 'dashboard-repro'\n      || params.get('look') === 'dashboard-full'",
    );
  let page = pageSrc;
  if (!page.includes('DASHBOARD_LOOK_FULL')) {
    page = page.replace(
      "const DASHBOARD_LOOK_REPRO = 'dashboard-repro';",
      "const DASHBOARD_LOOK_REPRO = 'dashboard-repro';\nconst DASHBOARD_LOOK_FULL = 'dashboard-full';",
    );
  }
  if (!page.includes('lookDashboardFull')) {
    page = page.replace(
      'const lookDashboardRepro = lookParam === DASHBOARD_LOOK_REPRO;',
      'const lookDashboardRepro = lookParam === DASHBOARD_LOOK_REPRO;\n  const lookDashboardFull = lookParam === DASHBOARD_LOOK_FULL;',
    );
    page = page.replace('|| lookDashboardRepro;', '|| lookDashboardRepro\n    || lookDashboardFull;');
    page = page.replace(
      'if (lookDashboardRepro) return repairDashboardWidgetLayout(dashboardReproLookWidgets()).widgets;',
      'if (lookDashboardRepro) return repairDashboardWidgetLayout(dashboardReproLookWidgets()).widgets;\n      if (lookDashboardFull) return dashboardFullLookWidgets();',
    );
  }
  if (!page.includes('function dashboardFullLookWidgets')) {
    const start = headPageSrc.indexOf('function dashboardFullLookWidgets()');
    const end = headPageSrc.indexOf('function dashboardJackLookWidgets()', start);
    if (start < 0 || end < 0) throw new Error('dashboardFullLookWidgets missing on head');
    page = page.replace('function dashboardJackLookWidgets()', `${headPageSrc.slice(start, end)}function dashboardJackLookWidgets()`);
  }
  if (!page.includes('function dashboardFullLookWidgets') || !page.includes('lookDashboardFull) return') || !auth.includes('dashboard-full')) {
    throw new Error('dashboard-full seed inject into aad2eef7 failed');
  }
  return { page, auth };
}

function serveDir(dir: string): Promise<{ server: Server; origin: string }> {
  const root = resolve(dir);
  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://127.0.0.1');
    let file = resolve(join(root, decodeURIComponent(url.pathname)));
    if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) file = join(root, 'index.html');
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise((ok, bad) => {
    server.once('error', bad);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') { bad(new Error('no server address')); return; }
      ok({ server, origin: `http://127.0.0.1:${addr.port}` });
    });
  });
}

async function bundleStoreHarness(repoRoot: string): Promise<string> {
  const esbuild = requireHere('esbuild') as { build: (o: Record<string, unknown>) => Promise<{ outputFiles?: Array<{ text: string }> }> };
  const mocks = join(here, 'hf406.frozen.mocks.ts');
  const result = await esbuild.build({
    absWorkingDir: repoRoot,
    entryPoints: [join(here, 'hf406.frozen.entry.tsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    define: {
      'process.env.NODE_ENV': '"production"',
      'import.meta.env.MODE': '"production"',
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
      'import.meta.env.SSR': 'false',
      'import.meta.env.VITE_LOOK_PROOF': '"1"',
      'import.meta.env.VITE_SUPABASE_URL': '"https://example.supabase.co"',
      'import.meta.env.VITE_SUPABASE_ANON_KEY': '"test-anon-key"',
    },
    plugins: [{
      name: 'hf406-frozen-mocks',
      setup(build: { onResolve: (o: { filter: RegExp }, cb: (a: { path: string }) => { path: string; namespace: string } | null) => void }) {
        build.onResolve({ filter: /(?:AuthContext|useCompanyAiKey|DevConsole|(?:^|[./])supabase)$/ }, () => ({ path: mocks, namespace: 'file' }));
      },
    }],
  });
  const file = result.outputFiles?.[0];
  if (!file) throw new Error('esbuild produced no hf406 store bundle');
  return file.text;
}

function storeHtml(headDist: string): string {
  const index = readFileSync(join(headDist, 'index.html'), 'utf8');
  const css = [...index.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map((m) => m[0]).join('\n');
  if (!css) throw new Error('head dist index.html has no stylesheet link');
  return `<!doctype html><html lang="en-AU" data-theme="light"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preload" href="/fonts/Geist-Variable.woff2" as="font" type="font/woff2" crossorigin>
${css}</head><body><div id="root"></div><script src="/hf406-store.js"></script></body></html>`;
}

async function launch(engine: Engine): Promise<Any> {
  const pw = requireHere('playwright') as Any;
  const browser = await pw[engine].launch({ headless: true });
  if (engine === 'webkit') {
    // eslint-disable-next-line no-console
    console.log(`WEBKIT_VERSION=${browser.version()}`);
  }
  return browser;
}

let envPromise: Promise<Env> | null = null;
let envCleanup: (() => Promise<void>) | null = null;

function setup(engine: Engine): Promise<Env> {
  if (envPromise) return envPromise;
  envPromise = (async () => {
    const repoRoot = process.cwd();
    if (!existsSync(join(repoRoot, 'src/pages/DashboardPage.tsx'))) throw new Error(`run from the repo root (cwd ${repoRoot})`);
    const work = mkdtempSync(join(tmpdir(), 'hf406-frozen-'));
    const servers: Server[] = [];
    let aad2Wt = '';
    let browser: Any = null;
    envCleanup = async () => {
      try { await browser?.close(); } catch { /* closing */ }
      for (const s of servers) s.close();
      if (aad2Wt) {
        // Never `git worktree prune`: in a container other worktrees' dirs are not mounted and would be
        // unregistered. Remove only this run's worktree and its own admin dir.
        let adminDir = '';
        try { adminDir = sh('git', ['rev-parse', '--absolute-git-dir'], aad2Wt).trim(); } catch { /* not created */ }
        try { sh('git', ['worktree', 'remove', '--force', aad2Wt], repoRoot); } catch { /* fall through */ }
        rmSync(aad2Wt, { recursive: true, force: true });
        if (adminDir.includes(`${join('.git', 'worktrees')}`)) rmSync(adminDir, { recursive: true, force: true });
      }
      rmSync(work, { recursive: true, force: true });
    };

    // head build
    const headDist = join(work, 'head-dist');
    await viteBuild(repoRoot, headDist);

    // aad2eef7 build, in a worktree this run creates
    aad2Wt = join(work, 'aad2');
    sh('git', ['worktree', 'add', '--detach', aad2Wt, AAD2_SHA], repoRoot);
    const aad2Head = sh('git', ['rev-parse', 'HEAD'], aad2Wt).trim();
    if (aad2Head !== AAD2_SHA) throw new Error(`aad2 worktree HEAD ${aad2Head} !== ${AAD2_SHA}`);
    symlinkSync(join(repoRoot, 'node_modules'), join(aad2Wt, 'node_modules'));
    const injected = injectDashboardFullLook(
      readFileSync(join(aad2Wt, 'src/pages/DashboardPage.tsx'), 'utf8'),
      readFileSync(join(aad2Wt, 'src/lib/devFieldAuditAuth.ts'), 'utf8'),
      readFileSync(join(repoRoot, 'src/pages/DashboardPage.tsx'), 'utf8'),
    );
    writeFileSync(join(aad2Wt, 'src/pages/DashboardPage.tsx'), injected.page);
    writeFileSync(join(aad2Wt, 'src/lib/devFieldAuditAuth.ts'), injected.auth);
    const aad2Dist = join(work, 'aad2-dist');
    await viteBuild(aad2Wt, aad2Dist);

    // store harness, served from the head build so dist CSS + /fonts resolve
    writeFileSync(join(headDist, 'hf406-store.js'), await bundleStoreHarness(repoRoot));
    writeFileSync(join(headDist, 'hf406-store.html'), storeHtml(headDist));

    const head = await serveDir(headDist);
    servers.push(head.server);
    const aad2 = await serveDir(aad2Dist);
    servers.push(aad2.server);

    browser = await launch(engine);
    const env: Env = {
      engine, work, browser, headOrigin: head.origin, aad2Origin: aad2.origin, aad2Head,
      servers, aad2Wt, repoRoot, fullSeed: [],
    };
    env.fullSeed = await readLookSeed(env);
    return env;
  })();
  return envPromise;
}

/* ───────────────────────────── browser helpers ───────────────────────────── */

const FREEZE_DATE = `(() => {
  const fixed = Date.parse(${JSON.stringify(FROZEN_NOW)});
  const RealDate = Date;
  class FrozenDate extends RealDate {
    constructor(...args) { if (args.length === 0) super(fixed); else super(...args); }
    static now() { return fixed; }
  }
  FrozenDate.parse = RealDate.parse;
  FrozenDate.UTC = RealDate.UTC;
  globalThis.Date = FrozenDate;
})();`;

async function newPage(env: Env, width: number, height: number, init?: string): Promise<Any> {
  const ctx = await env.browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    locale: 'en-AU',
    timezoneId: BROWSER_TZ,
    serviceWorkers: 'block',
  });
  await ctx.route(/.*/, (route: Any) => {
    const u = route.request().url();
    if (u.startsWith('http://127.0.0.1:')) return route.continue();
    return route.abort();
  });
  await ctx.addInitScript({ content: FREEZE_DATE });
  if (init) await ctx.addInitScript({ content: init });
  const page = await ctx.newPage();
  const close = page.close.bind(page);
  page.close = async () => { await close(); await ctx.close(); };
  return page;
}

async function assertFonts(page: Any, where: string) {
  const f = await page.evaluate(async () => {
    await document.fonts.ready;
    const faces = [...document.fonts].map((x) => `${x.family.replace(/["']/g, '')}:${x.status}`);
    return { check: document.fonts.check('16px Geist'), faces };
  });
  if (!f.check || !f.faces.includes('Geist:loaded')) {
    throw new Error(`Geist font not loaded at ${where}: check=${f.check} faces=${f.faces.join(',')}`);
  }
}

async function frames(page: Any, n = 2) {
  await page.evaluate((count: number) => new Promise<void>((done) => {
    let left = count;
    const tick = () => { left -= 1; if (left <= 0) done(); else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }), n);
}

async function settle(page: Any) {
  let last = '';
  let same = 0;
  for (let i = 0; i < 60 && same < 2; i += 1) {
    const sig = await page.evaluate(() => [...document.querySelectorAll('[data-dashboard-widget-id]')]
      .map((el) => { const r = el.getBoundingClientRect(); return `${r.left.toFixed(1)},${r.top.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)}`; })
      .join('|'));
    if (sig === last) same += 1; else { same = 0; last = sig; }
    await frames(page, 3);
    await page.waitForTimeout(80);
  }
}

async function waitForCards(page: Any, where: string) {
  await page.waitForFunction(() => [...document.querySelectorAll('[data-dashboard-widget-id]')]
    .some((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; }), undefined, { timeout: 60_000 })
    .catch(() => { throw new Error(`setup: no dashboard cards painted at ${where}`); });
}

async function openLook(env: Env, origin: string, width: number, look: string, height = 900): Promise<Any> {
  const page = await newPage(env, width, height);
  await page.goto(`${origin}/?look=${look}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 60_000 });
  await waitForCards(page, `${origin} ${look} ${width}`);
  await assertFonts(page, `${look} ${width}`);
  await settle(page);
  return page;
}

async function enterEdit(page: Any) {
  await page.evaluate(async () => {
    const more = document.querySelector('.dashboard-home-more') as HTMLDetailsElement | null;
    if (!more) throw new Error('setup: more menu missing');
    more.open = true;
    const btn = [...more.querySelectorAll('button')].find((el) => /Customize|Done editing/.test(el.textContent || ''));
    if (!btn) throw new Error('setup: Customize missing');
    if (!/Done editing/.test(btn.textContent || '')) (btn as HTMLButtonElement).click();
    for (let i = 0; i < 200; i += 1) {
      if ([...document.querySelectorAll('button, a')].some((el) => /Add widget/.test(el.textContent || ''))) return;
      await new Promise((ok) => window.setTimeout(ok, 50));
    }
    throw new Error('setup: Customize never showed Add widget');
  });
  await page.waitForFunction(() => {
    const more = document.querySelector('.dashboard-home-more') as HTMLDetailsElement | null;
    if (more?.open) more.open = false;
    return !more?.open;
  });
  await settle(page);
}

async function openCustomize(env: Env, origin: string, width: number, look: string, height = 900): Promise<Any> {
  const page = await openLook(env, origin, width, look, height);
  await enterEdit(page);
  await assertFonts(page, `${look} ${width} Customize`);
  return page;
}

async function openStore(env: Env, width: number, seed: Array<Record<string, unknown>> | null, path: string): Promise<Any> {
  const init = `globalThis.__HF406_CFG__ = ${JSON.stringify({ path })};${seed ? `globalThis.__HF406_SEED__ = ${JSON.stringify(seed)};` : ''}`;
  const page = await newPage(env, width, 900, init);
  await page.goto(`${env.headOrigin}/hf406-store.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 60_000 });
  await waitForCards(page, `store ${width}`);
  await assertFonts(page, `store ${width}`);
  await settle(page);
  return page;
}

async function readLookSeed(env: Env): Promise<Array<Record<string, unknown>>> {
  const page = await openStore(env, 1280, null, '/?look=dashboard-full');
  const rows = await page.evaluate(() => {
    const c = (globalThis as Any).__HF406_CLIENT__;
    return JSON.parse(JSON.stringify(c?.getQueryData(['dashboard-widgets']) ?? null));
  }) as Array<Record<string, unknown>> | null;
  await page.close();
  if (!Array.isArray(rows) || rows.length !== 26) throw new Error(`setup: dashboard-full seed has ${rows?.length ?? 'no'} rows, expected 26`);
  return rows.map((row) => ({
    ...row,
    user_id: '00000000-0000-0000-0000-000000000002',
    company_id: '00000000-0000-0000-0000-000000000001',
  }));
}

/* In-page: visible top-level cards in document coordinates, plus the canvas box. */
function readLayoutInPage(): Layout {
  const vis = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const hosts = [...document.querySelectorAll('[data-dashboard-widget-id]')]
    .filter((el) => vis(el) && !el.parentElement?.closest('[data-dashboard-widget-id]')) as HTMLElement[];
  const scrollOff = (el: Element | null) => {
    let off = window.scrollY;
    for (let p = el?.parentElement ?? null; p; p = p.parentElement) off += p.scrollTop;
    return off;
  };
  const off = scrollOff(hosts[0] ?? null);
  const cards = hosts.map((el) => {
    const r = el.getBoundingClientRect();
    const x = r.left;
    const y = r.top + off;
    return { id: el.getAttribute('data-dashboard-widget-id') || '', x, y, w: r.width, h: r.height, r: r.right, b: r.bottom + off };
  });
  const canvasEl = [
    document.querySelector('.dashboard-home-canvas.is-editing'),
    document.querySelector('[data-dashboard-view-grid]'),
    hosts[0]?.parentElement ?? null,
  ].find((el) => el && vis(el)) as HTMLElement | undefined;
  let canvas: Layout['canvas'] = null;
  if (canvasEl) {
    const r = canvasEl.getBoundingClientRect();
    canvas = {
      left: r.left + canvasEl.clientLeft,
      right: r.left + canvasEl.clientLeft + canvasEl.clientWidth,
      found: canvasEl.className.toString().slice(0, 80),
    };
  }
  return { iw: window.innerWidth, cards, canvas, pageH: cards.length ? Math.max(...cards.map((c) => c.b)) : 0 };
}

async function readLayout(page: Any): Promise<Layout> {
  return page.evaluate(readLayoutInPage);
}

/* ───────────────────────────── geometry analysis ───────────────────────────── */

function clusterLefts(cards: Rect[]): Array<{ left: number; cards: Rect[] }> {
  const cols: Array<{ left: number; cards: Rect[] }> = [];
  for (const c of [...cards].sort((a, b) => a.x - b.x)) {
    const col = cols.find((k) => Math.abs(k.left - c.x) <= 0.5);
    if (col) col.cards.push(c); else cols.push({ left: c.x, cards: [c] });
  }
  return cols;
}

/** Longest vertical run (px) in [x0,x1] where some horizontal free span > 24px has no card. */
function longestEmptyRun(cards: Rect[], x0: number, x1: number): { run: number; at: number } {
  const top = Math.min(...cards.map((c) => c.y));
  const bot = Math.max(...cards.map((c) => c.b));
  let run = 0;
  let best = 0;
  let at = top;
  for (let y = Math.floor(top); y < bot; y += 1) {
    const spans = cards.filter((c) => c.y <= y + 0.5 && c.b > y + 0.5 && c.r > x0 && c.x < x1)
      .map((c) => [Math.max(x0, c.x), Math.min(x1, c.r)] as const)
      .sort((a, b) => a[0] - b[0]);
    let cursor = x0;
    let free = 0;
    for (const [a, b] of spans) { free = Math.max(free, a - cursor); cursor = Math.max(cursor, b); }
    free = Math.max(free, x1 - cursor);
    if (free > 24) { run += 1; if (run > best) { best = run; at = y - run + 1; } } else run = 0;
  }
  return { run: best, at };
}

function neighbourGaps(cards: Rect[]): { h: number[]; v: number[]; worst: string } {
  const h: number[] = [];
  const v: number[] = [];
  let worst = '';
  let worstGap = -Infinity;
  for (const a of cards) {
    const right = cards.filter((o) => o !== a && o.x >= a.r - 1 && o.y < a.b && o.b > a.y);
    if (right.length) {
      const g = Math.min(...right.map((o) => o.x)) - a.r;
      h.push(g);
      if (g > worstGap) { worstGap = g; worst = `h ${a.id} → ${g.toFixed(1)}`; }
    }
    const below = cards.filter((o) => o !== a && o.y >= a.b - 1 && o.x < a.r && o.r > a.x);
    if (below.length) {
      const g = Math.min(...below.map((o) => o.y)) - a.b;
      v.push(g);
      if (g > worstGap) { worstGap = g; worst = `v ${a.id} → ${g.toFixed(1)}`; }
    }
  }
  return { h, v, worst };
}

function sideOf(card: Rect, canvas: { left: number; right: number }): 'L' | 'R' | 'W' {
  const width = canvas.right - canvas.left;
  if (card.w > width / 2 + 0.5) return 'W';
  return card.x + card.w / 2 < (canvas.left + canvas.right) / 2 ? 'L' : 'R';
}

function columnsBySide(layout: Layout): { side: Map<string, string>; seq: Record<string, string[]> } {
  if (!layout.canvas) throw new Error('setup: no canvas box');
  const side = new Map<string, string>();
  const seq: Record<string, string[]> = { L: [], R: [], W: [] };
  for (const c of [...layout.cards].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const s = sideOf(c, layout.canvas);
    side.set(c.id, s);
    seq[s].push(c.id);
  }
  return { side, seq };
}

/* ───────────────────────────── in-page probes ───────────────────────────── */

type OverflowRow = { where: string; scrollWidth: number; clientWidth: number };
type TextHit = { id: string; text: string; right: number; limit: number };

function readCardOverflowInPage(): { cards: number; chrome: number; overflow: OverflowRow[]; text: TextHit[]; missingInk: string[] } {
  const vis = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  const hosts = [...document.querySelectorAll('[data-dashboard-widget-id]')]
    .filter((el) => vis(el) && !el.parentElement?.closest('[data-dashboard-widget-id]')) as HTMLElement[];
  const overflow: OverflowRow[] = [];
  const text: TextHit[] = [];
  const missingInk: string[] = [];
  let chrome = 0;
  const iw = window.innerWidth;
  for (const host of hosts) {
    const id = host.getAttribute('data-dashboard-widget-id') || '';
    const ink = host.querySelector('.dashboard-home-widget-ink');
    if (!ink) missingInk.push(id);
    const card = host.querySelector('.dashboard-home-widget') as HTMLElement | null;
    const boxes: Array<[string, HTMLElement]> = [[`${id} host`, host]];
    if (card && card !== host) boxes.push([`${id} card`, card]);
    for (const el of [...host.querySelectorAll('*')] as HTMLElement[]) {
      if (!(el instanceof HTMLElement) || !vis(el)) continue;
      if (ink && (el === ink || ink.contains(el))) continue;
      if (el === card) continue;
      chrome += 1;
      boxes.push([`${id} chrome <${el.tagName.toLowerCase()} class="${(el.className || '').toString().slice(0, 60)}">`, el]);
    }
    for (const [where, el] of boxes) {
      if (el.scrollWidth > el.clientWidth) overflow.push({ where, scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    }
    const hostRight = host.getBoundingClientRect().right;
    const tw = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      const t = (n.textContent || '').trim();
      if (!t || !n.parentElement || !vis(n.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      for (const r of [...range.getClientRects()]) {
        if (r.width < 1 || r.height < 1) continue;
        const limit = Math.min(hostRight, iw);
        if (r.right > limit + 0.5) text.push({ id, text: t.slice(0, 40), right: r.right, limit });
      }
    }
  }
  return { cards: hosts.length, chrome, overflow, text, missingInk };
}

function readPageOverflowInPage(): { iw: number; docSW: number; bodySW: number; maxRight: number; maxRightAt: string; maxText: number; maxTextAt: string } {
  const vis = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
  };
  let maxRight = 0;
  let maxRightAt = '';
  for (const el of [...document.querySelectorAll('body *')]) {
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.right > maxRight) { maxRight = r.right; maxRightAt = `<${el.tagName.toLowerCase()} class="${(el.getAttribute('class') || '').slice(0, 60)}">`; }
  }
  let maxText = 0;
  let maxTextAt = '';
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const t = (n.textContent || '').trim();
    if (!t || !n.parentElement || !vis(n.parentElement)) continue;
    const range = document.createRange();
    range.selectNodeContents(n);
    for (const r of [...range.getClientRects()]) {
      if (r.width < 1 || r.height < 1) continue;
      if (r.right > maxText) { maxText = r.right; maxTextAt = t.slice(0, 40); }
    }
  }
  return {
    iw: window.innerWidth,
    docSW: document.documentElement.scrollWidth,
    bodySW: document.body.scrollWidth,
    maxRight, maxRightAt, maxText, maxTextAt,
  };
}

type MoneyProbe = {
  found: boolean;
  cardId: string;
  bodyH: number;
  texts: Array<{ rect: { l: number; t: number; r: number; b: number }; box: { l: number; t: number; r: number; b: number }; outside: string[]; overflow: string[] }>;
};

function readMoneyInPage(arg: { money: string }): MoneyProbe {
  const host = [...document.querySelectorAll('[data-dashboard-widget-id]')].find((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && /outstanding[-_]invoices/.test(el.getAttribute('data-dashboard-widget-id') || '');
  }) as HTMLElement | undefined;
  if (!host) return { found: false, cardId: '', bodyH: 0, texts: [] };
  const card = (host.querySelector('.dashboard-home-widget') as HTMLElement | null) ?? host;
  const cs = getComputedStyle(card);
  const cr = card.getBoundingClientRect();
  const box = {
    l: cr.left + parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft),
    t: cr.top + parseFloat(cs.borderTopWidth) + parseFloat(cs.paddingTop),
    r: cr.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight),
    b: cr.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom),
  };
  const ink = host.querySelector('.dashboard-home-widget-ink') as HTMLElement | null;
  let bodyH = 0;
  if (ink) {
    const s = getComputedStyle(ink);
    bodyH = ink.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom);
  }
  const clips = (el: Element) => /hidden|clip|auto|scroll/.test(`${getComputedStyle(el).overflowX} ${getComputedStyle(el).overflowY}`);
  const texts: MoneyProbe['texts'] = [];
  const tw = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    if (!(n.textContent || '').includes(arg.money)) continue;
    const range = document.createRange();
    const start = (n.textContent || '').indexOf(arg.money);
    range.setStart(n, start);
    range.setEnd(n, start + arg.money.length);
    const r = range.getBoundingClientRect();
    const rect = { l: r.left, t: r.top, r: r.right, b: r.bottom };
    const outside: string[] = [];
    if (rect.l < box.l - 0.5) outside.push(`left ${rect.l.toFixed(1)} < card content ${box.l.toFixed(1)}`);
    if (rect.r > box.r + 0.5) outside.push(`right ${rect.r.toFixed(1)} > card content ${box.r.toFixed(1)}`);
    if (rect.t < box.t - 0.5) outside.push(`top ${rect.t.toFixed(1)} < card content ${box.t.toFixed(1)}`);
    if (rect.b > box.b + 0.5) outside.push(`bottom ${rect.b.toFixed(1)} > card content ${box.b.toFixed(1)}`);
    const overflow: string[] = [];
    for (let el = n.parentElement; el; el = el.parentElement) {
      if (el.scrollWidth > el.clientWidth && getComputedStyle(el).display !== 'inline') {
        overflow.push(`<${el.tagName.toLowerCase()} class="${(el.getAttribute('class') || '').slice(0, 50)}"> sw ${el.scrollWidth} > cw ${el.clientWidth}`);
      }
      if (clips(el)) {
        const k = el.getBoundingClientRect();
        if (rect.l < k.left - 0.5 || rect.r > k.right + 0.5 || rect.t < k.top - 0.5 || rect.b > k.bottom + 0.5) {
          outside.push(`clipped by <${el.tagName.toLowerCase()} class="${(el.getAttribute('class') || '').slice(0, 50)}"> ${k.left.toFixed(1)}..${k.right.toFixed(1)} x ${k.top.toFixed(1)}..${k.bottom.toFixed(1)}`);
        }
      }
      if (el === host) break;
    }
    texts.push({ rect, box, outside, overflow });
  }
  return { found: true, cardId: host.getAttribute('data-dashboard-widget-id') || '', bodyH, texts };
}

/* In-page K9: card-vs-card intersections, and descendant element/text rects (clipped by any
 * overflow-clipping ancestor up to and including the card) that leave the card's border box
 * and land inside another card's border box. Pure geometry, no computed-style-only asserts. */
type PaintHit = { id: string; into: string; what: string; rect: number[]; area: number };
function readPaintInPage(): { cards: number; overlaps: Array<{ a: string; b: string; ox: number; oy: number }>; spills: PaintHit[] } {
  const vis = (el: Element) => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none';
  };
  const hosts = [...document.querySelectorAll('[data-dashboard-widget-id]')]
    .filter((el) => vis(el) && !el.parentElement?.closest('[data-dashboard-widget-id]')) as HTMLElement[];
  type B = { l: number; t: number; r: number; b: number };
  const box = (r: DOMRect): B => ({ l: r.left, t: r.top, r: r.right, b: r.bottom });
  // The card is the painted, bordered surface: the inner .dashboard-home-widget when the host
  // wraps one (Customize FreeWidget), otherwise the host itself (view / phone stack).
  const cards = hosts.map((h) => {
    const surface = (h.matches('.dashboard-home-widget') ? h : h.querySelector(':scope > .dashboard-home-widget')) as HTMLElement | null;
    const el = surface && vis(surface) ? surface : h;
    return { id: h.getAttribute('data-dashboard-widget-id') || '', el, b: box(el.getBoundingClientRect()) };
  });
  const inter = (a: B, b: B) => ({ x: Math.min(a.r, b.r) - Math.max(a.l, b.l), y: Math.min(a.b, b.b) - Math.max(a.t, b.t) });
  const overlaps: Array<{ a: string; b: string; ox: number; oy: number }> = [];
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = i + 1; j < cards.length; j += 1) {
      const o = inter(cards[i].b, cards[j].b);
      if (o.x > 0.5 && o.y > 0.5) overlaps.push({ a: cards[i].id, b: cards[j].id, ox: Math.round(o.x * 10) / 10, oy: Math.round(o.y * 10) / 10 });
    }
  }
  const clipOf = (start: Element | null, host: HTMLElement): B | null => {
    // Intersect with every clipping element from start up to and including host.
    let clip: B | null = null;
    for (let p: Element | null = start; p; p = p.parentElement) {
      const st = getComputedStyle(p);
      if (st.overflowX !== 'visible' || st.overflowY !== 'visible') {
        const pb = box(p.getBoundingClientRect());
        const c: B = { l: pb.l + (p as HTMLElement).clientLeft, t: pb.t + (p as HTMLElement).clientTop, r: pb.l + (p as HTMLElement).clientLeft + (p as HTMLElement).clientWidth, b: pb.t + (p as HTMLElement).clientTop + (p as HTMLElement).clientHeight };
        const x: B = { l: c.l, t: st.overflowY === 'visible' ? -1e9 : c.t, r: c.r, b: st.overflowY === 'visible' ? 1e9 : c.b };
        if (st.overflowX === 'visible') { x.l = -1e9; x.r = 1e9; }
        clip = clip ? { l: Math.max(clip.l, x.l), t: Math.max(clip.t, x.t), r: Math.min(clip.r, x.r), b: Math.min(clip.b, x.b) } : x;
      }
      if (p === host) break;
    }
    return clip;
  };
  const spills: PaintHit[] = [];
  const check = (card: typeof cards[number], what: string, rb: B, clip: B | null) => {
    const v: B = clip ? { l: Math.max(rb.l, clip.l), t: Math.max(rb.t, clip.t), r: Math.min(rb.r, clip.r), b: Math.min(rb.b, clip.b) } : rb;
    if (v.r - v.l <= 0.5 || v.b - v.t <= 0.5) return;
    const c = card.b;
    if (v.l >= c.l - 0.5 && v.t >= c.t - 0.5 && v.r <= c.r + 0.5 && v.b <= c.b + 0.5) return;
    for (const other of cards) {
      if (other === card) continue;
      const o = inter(v, other.b);
      if (o.x > 0.5 && o.y > 0.5) {
        if (spills.length < 2000) spills.push({ id: card.id, into: other.id, what, rect: [v.l, v.t, v.r, v.b].map((n) => Math.round(n * 10) / 10), area: Math.round(o.x * o.y) });
        return;
      }
    }
  };
  for (const card of cards) {
    for (const el of card.el.querySelectorAll('*')) {
      if (!vis(el)) continue;
      check(card, `${el.tagName.toLowerCase()}.${String((el as HTMLElement).className || '').slice(0, 50)}`, box(el.getBoundingClientRect()), clipOf(el.parentElement, card.el));
    }
    const walker = document.createTreeWalker(card.el, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n.textContent || '').trim() || !n.parentElement || !vis(n.parentElement)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const clip = clipOf(n.parentElement, card.el);
      for (const r of range.getClientRects()) check(card, `text "${(n.textContent || '').trim().slice(0, 24)}"`, box(r), clip);
    }
  }
  return { cards: cards.length, overlaps, spills };
}

/* ───────────────────────────── store + pointer helpers ───────────────────────────── */

async function readStore(page: Any): Promise<{ json: string; rows: Array<Record<string, unknown>>; writes: number }> {
  return page.evaluate(() => {
    const s = (globalThis as Any).__HF406_STORE__;
    if (!s) throw new Error('setup: __HF406_STORE__ missing');
    return { json: JSON.stringify(s.rows), rows: JSON.parse(JSON.stringify(s.rows)), writes: s.writes.length };
  });
}

async function waitStoreQuiet(page: Any) {
  let last = -1;
  let same = 0;
  for (let i = 0; i < 40 && same < 4; i += 1) {
    const n = await page.evaluate(() => (globalThis as Any).__HF406_STORE__?.writes.length ?? 0);
    if (n === last) same += 1; else { same = 0; last = n; }
    await page.waitForTimeout(100);
  }
}

/** Real pointer drag: move, down, stepped moves with a frame between each, up. Works in WebKit 18. */
async function pointerDrag(page: Any, x: number, y: number, dx: number, dy: number) {
  await page.mouse.move(x, y);
  await frames(page, 2);
  await page.mouse.down();
  await frames(page, 2);
  await page.waitForTimeout(50);
  const steps = 20;
  for (let i = 1; i <= steps; i += 1) {
    await page.mouse.move(x + (dx * i) / steps, y + (dy * i) / steps);
    await frames(page, 1);
  }
  await page.waitForTimeout(80);
  await frames(page, 2);
  await page.mouse.up();
  await frames(page, 3);
  await waitStoreQuiet(page);
  await settle(page);
}

type DragTargets = { id: string; handle: { x: number; y: number } | null; body: { x: number; y: number }; corner: { x: number; y: number }; resize: { x: number; y: number } | null; h: number };

async function dragTargets(page: Any, id: string): Promise<DragTargets> {
  await page.evaluate((cid: string) => {
    const el = [...document.querySelectorAll(`[data-dashboard-widget-id="${cid}"]`)].find((h) => {
      const r = h.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    if (!el) throw new Error(`setup: card ${cid} not painted`);
    el.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, id);
  await settle(page);
  return page.evaluate((cid: string) => {
    const host = [...document.querySelectorAll(`[data-dashboard-widget-id="${cid}"]`)].find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }) as HTMLElement | undefined;
    if (!host) throw new Error(`setup: card ${cid} not painted`);
    const r = host.getBoundingClientRect();
    const center = (el: Element | null) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      if (b.width <= 0 || b.height <= 0) return null;
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    };
    return {
      id: cid,
      handle: center(host.querySelector('[title="Drag to move"]')),
      body: { x: r.left + r.width / 2, y: r.top + Math.min(24, r.height / 4) },
      corner: { x: r.right - 8, y: r.bottom - 8 },
      resize: center(host.querySelector('.dashboard-home-widget-resize')),
      h: r.height,
    };
  }, id);
}

function rowDiff(before: Array<Record<string, unknown>>, after: Array<Record<string, unknown>>): string[] {
  const out: string[] = [];
  const byId = new Map(after.map((r) => [String(r.id), r]));
  for (const b of before) {
    const a = byId.get(String(b.id));
    if (!a) { out.push(`${String(b.id)} removed`); continue; }
    for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
      const bv = JSON.stringify(b[k]);
      const av = JSON.stringify(a[k]);
      if (bv !== av) out.push(`${String(b.id)}.${k}: ${bv} → ${av}`);
    }
  }
  if (after.length !== before.length) out.push(`row count ${before.length} → ${after.length}`);
  return out;
}

/* ───────────────────────────── the matrix ───────────────────────────── */

export function defineFrozenKills(engine: Engine) {
  const runFile = process.env.WEBKIT_TESTS_RUN_FILE;

  afterEach((ctx: Any) => {
    if (engine === 'webkit' && runFile) appendFileSync(runFile, `hf406.frozen.webkit ${ctx?.task?.name ?? 'test'}\n`);
  });

  afterAll(async () => {
    if (envCleanup) await envCleanup();
  }, 120_000);

  describe(`HF-403-768 FROZEN kill (${engine})`, () => {
    it('K0 setup: in-run aad2eef7 worktree SHA, 26 cards on head and aad2, Geist loaded', async () => {
      const env = await setup(engine);
      expect(env.aad2Head, 'aad2 worktree HEAD').toBe(AAD2_SHA);
      if (engine === 'webkit') expect(env.browser.version(), 'WebKit version').toMatch(/^\d+\.\d+/);
      for (const origin of [env.headOrigin, env.aad2Origin]) {
        const page = await openCustomize(env, origin, 1280, 'dashboard-full');
        const lay = await readLayout(page);
        await page.close();
        expect(lay.cards.length, `${origin === env.headOrigin ? 'head' : 'aad2'} 1280 Customize cards`).toBe(26);
      }
      expect(env.fullSeed.length, 'store seed rows').toBe(26);
    }, TEST_MS);

    it('K1 768 Customize: 2 columns ≤352, gap 16±0.5, cards inside canvas, wide cards full row, no empty strip', async () => {
      const env = await setup(engine);
      const viewPage = await openLook(env, env.headOrigin, 768, 'dashboard-full');
      const view = await readLayout(viewPage);
      await viewPage.close();
      const page = await openCustomize(env, env.headOrigin, 768, 'dashboard-full');
      const lay = await readLayout(page);
      await page.close();
      expect(view.cards.length, '768 view cards').toBe(26);
      expect(lay.cards.length, '768 Customize cards').toBe(26);
      expect(lay.canvas, '768 Customize canvas').not.toBeNull();
      const canvas = lay.canvas!;
      const viewCanvas = view.canvas!;
      const wideIds = new Set(view.cards.filter((c) => sideOf(c, viewCanvas) === 'W').map((c) => c.id));
      const narrow = lay.cards.filter((c) => !wideIds.has(c.id));
      const cols = clusterLefts(narrow);
      expect(cols.length, `768 Customize column count (lefts ${cols.map((c) => c.left.toFixed(1)).join(',')})`).toBe(2);
      const colW = cols.map((col) => Math.max(...col.cards.map((c) => c.w)));
      for (const [i, col] of cols.entries()) {
        expect(colW[i], `768 Customize column ${i} width`).toBeLessThanOrEqual(352.5);
        for (const c of col.cards) expect(Math.abs(c.w - colW[i]), `768 ${c.id} width ${c.w} vs column ${colW[i]}`).toBeLessThanOrEqual(0.5);
      }
      const gap = cols[1].left - (cols[0].left + colW[0]);
      expect(Math.abs(gap - 16), `768 Customize column gap ${gap.toFixed(2)}`).toBeLessThanOrEqual(0.5);
      for (const c of lay.cards) {
        expect(c.r, `768 ${c.id} right vs canvas right ${canvas.right}`).toBeLessThanOrEqual(canvas.right + 0.5);
        expect(c.x, `768 ${c.id} left vs canvas left ${canvas.left}`).toBeGreaterThanOrEqual(canvas.left - 0.5);
      }
      const rowL = cols[0].left;
      const rowR = cols[1].left + colW[1];
      for (const c of lay.cards.filter((k) => wideIds.has(k.id))) {
        expect(Math.abs(c.x - rowL), `768 wide ${c.id} left ${c.x} vs row ${rowL}`).toBeLessThanOrEqual(0.5);
        expect(Math.abs(c.r - rowR), `768 wide ${c.id} right ${c.r} vs row ${rowR}`).toBeLessThanOrEqual(0.5);
      }
      const mid = (canvas.left + canvas.right) / 2;
      const oneCard = Math.min(...lay.cards.map((c) => c.h));
      const left = longestEmptyRun(lay.cards, canvas.left, mid);
      const right = longestEmptyRun(lay.cards, mid, canvas.right);
      expect(left.run, `768 left-side empty strip >24px run at y=${left.at} vs one card ${oneCard}`).toBeLessThanOrEqual(oneCard);
      expect(right.run, `768 right-side empty strip >24px run at y=${right.at} vs one card ${oneCard}`).toBeLessThanOrEqual(oneCard);
    }, TEST_MS);

    it('K2 768 Customize page height ≤ 1.15× view', async () => {
      const env = await setup(engine);
      const viewPage = await openLook(env, env.headOrigin, 768, 'dashboard-full');
      const view = await readLayout(viewPage);
      await viewPage.close();
      const page = await openCustomize(env, env.headOrigin, 768, 'dashboard-full');
      const lay = await readLayout(page);
      await page.close();
      expect(view.cards.length, '768 view cards').toBe(26);
      expect(lay.cards.length, '768 Customize cards').toBe(26);
      expect(lay.pageH / view.pageH, `768 Customize ${lay.pageH.toFixed(1)} / view ${view.pageH.toFixed(1)}`).toBeLessThanOrEqual(1.15);
    }, TEST_MS);

    it('K3 768 Customize card order and L/R column equal view', async () => {
      const env = await setup(engine);
      const viewPage = await openLook(env, env.headOrigin, 768, 'dashboard-full');
      const view = await readLayout(viewPage);
      await viewPage.close();
      const page = await openCustomize(env, env.headOrigin, 768, 'dashboard-full');
      const lay = await readLayout(page);
      await page.close();
      expect(view.cards.length, '768 view cards').toBe(26);
      expect(lay.cards.length, '768 Customize cards').toBe(26);
      const v = columnsBySide(view);
      const e = columnsBySide(lay);
      const sideDiff = [...v.side].filter(([id, s]) => e.side.get(id) !== s).map(([id, s]) => `${id} view ${s} → Customize ${e.side.get(id) ?? 'missing'}`);
      expect(sideDiff, '768 L/R column per card').toEqual([]);
      expect(e.seq.L, '768 left column order').toEqual(v.seq.L);
      expect(e.seq.R, '768 right column order').toEqual(v.seq.R);
      expect(e.seq.W, '768 wide card order').toEqual(v.seq.W);
    }, TEST_MS);

    it('K4 768 Customize: pointer drag + resize attempt leave the stored layout byte-identical; no resize handle, no drag cursor', async () => {
      const env = await setup(engine);
      const page = await openStore(env, 768, env.fullSeed, '/');
      await enterEdit(page);
      await waitStoreQuiet(page);
      const lay = await readLayout(page);
      expect(lay.cards.length, '768 store Customize cards').toBe(26);
      const before = await readStore(page);
      const sorted = [...lay.cards].sort((a, b) => a.y - b.y || a.x - b.x);
      const target = sorted.find((c) => lay.canvas && sideOf(c, lay.canvas) === 'R') ?? sorted[1];
      let t = await dragTargets(page, target.id);
      if (t.handle) {
        await pointerDrag(page, t.handle.x, t.handle.y, 0, t.h + 40);
        t = await dragTargets(page, target.id);
        if (t.handle) await pointerDrag(page, t.handle.x, t.handle.y, -200, 0);
        t = await dragTargets(page, target.id);
      }
      await pointerDrag(page, t.body.x, t.body.y, 0, t.h + 40);
      t = await dragTargets(page, target.id);
      await pointerDrag(page, t.body.x, t.body.y, -200, 0);
      t = await dragTargets(page, target.id);
      const grip = t.resize ?? t.corner;
      await pointerDrag(page, grip.x, grip.y, 60, 80);
      const after = await readStore(page);
      const chromeState = await page.evaluate(() => {
        const handleSel = '.dashboard-home-widget-resize, [title="Drag to resize"], [title*="resize" i], [aria-label*="resize" i]';
        const handles = [...document.querySelectorAll(handleSel)].map((el) => {
          const r = el.getBoundingClientRect();
          return `<${el.tagName.toLowerCase()} class="${(el.getAttribute('class') || '').slice(0, 40)}"> ${r.width.toFixed(0)}x${r.height.toFixed(0)}`;
        });
        const cursors: string[] = [];
        for (const host of [...document.querySelectorAll('[data-dashboard-widget-id]')]) {
          const hr = host.getBoundingClientRect();
          if (hr.width <= 0 || hr.height <= 0) continue;
          for (const el of [host, ...host.querySelectorAll('*')]) {
            const r = el.getBoundingClientRect();
            if (r.width <= 0 || r.height <= 0) continue;
            const c = getComputedStyle(el).cursor;
            if (/grab|move|resize/.test(c)) cursors.push(`${host.getAttribute('data-dashboard-widget-id')} <${el.tagName.toLowerCase()}> ${c}`);
          }
        }
        return { handles, cursors };
      });
      await page.close();
      const diff = rowDiff(before.rows, after.rows);
      expect(diff, `768 stored layout after drag/resize (writes ${before.writes}→${after.writes}, target ${target.id})`).toEqual([]);
      expect(after.rows, '768 stored rows deep-equal').toEqual(before.rows);
      expect(after.json === before.json, '768 stored rows byte-identical').toBe(true);
      expect(chromeState.handles, '768 resize handles in DOM').toEqual([]);
      expect(chromeState.cursors, '768 drag/resize cursors on cards').toEqual([]);
    }, TEST_MS);

    it('K4 CONTROL 1280 Customize: the same pointer drag changes the stored y/x', async () => {
      const env = await setup(engine);
      const page = await openStore(env, 1280, env.fullSeed, '/');
      await enterEdit(page);
      await waitStoreQuiet(page);
      const lay = await readLayout(page);
      expect(lay.cards.length, '1280 store Customize cards').toBe(26);
      const before = await readStore(page);
      const sorted = [...lay.cards].sort((a, b) => a.y - b.y || a.x - b.x);
      const target = sorted[1];
      const t = await dragTargets(page, target.id);
      const from = t.handle ?? t.body;
      await pointerDrag(page, from.x, from.y, 0, t.h + 40);
      const after = await readStore(page);
      await page.close();
      const b = before.rows.find((r) => r.id === target.id)!;
      const a = after.rows.find((r) => r.id === target.id)!;
      const moved = Math.abs(Number(a.grid_y) - Number(b.grid_y)) + Math.abs(Number(a.grid_x) - Number(b.grid_x));
      expect(moved, `1280 control: stored ${target.id} y ${String(b.grid_y)}→${String(a.grid_y)} x ${String(b.grid_x)}→${String(a.grid_x)} (writes ${before.writes}→${after.writes})`).toBeGreaterThan(0);
    }, TEST_MS);

    it('K5 1280 Customize dashboard-full: every card rect equals in-run aad2eef7 (±0.5)', async () => {
      const env = await setup(engine);
      const headPage = await openCustomize(env, env.headOrigin, 1280, 'dashboard-full');
      const head = await readLayout(headPage);
      await headPage.close();
      const refPage = await openCustomize(env, env.aad2Origin, 1280, 'dashboard-full');
      const ref = await readLayout(refPage);
      await refPage.close();
      expect(ref.cards.length, 'aad2 1280 Customize cards').toBe(26);
      expect(head.cards.length, 'head 1280 Customize cards').toBe(26);
      const refById = new Map(ref.cards.map((c) => [c.id, c]));
      const diff: string[] = [];
      for (const c of head.cards) {
        const r = refById.get(c.id);
        if (!r) { diff.push(`${c.id} missing on aad2`); continue; }
        for (const k of ['x', 'y', 'w', 'h'] as const) {
          if (Math.abs(c[k] - r[k]) > 0.5) diff.push(`${c.id}.${k} head ${c[k].toFixed(1)} aad2 ${r[k].toFixed(1)}`);
        }
      }
      expect(diff, '1280 Customize rects vs aad2eef7').toEqual([]);
    }, TEST_MS);

    it('K5 1024 dashboard-full: every neighbour gap ≤40 in view and Customize', async () => {
      const env = await setup(engine);
      for (const mode of ['view', 'Customize'] as const) {
        const page = mode === 'view'
          ? await openLook(env, env.headOrigin, 1024, 'dashboard-full')
          : await openCustomize(env, env.headOrigin, 1024, 'dashboard-full');
        const lay = await readLayout(page);
        await page.close();
        expect(lay.cards.length, `1024 ${mode} cards`).toBe(26);
        const g = neighbourGaps(lay.cards);
        expect(g.h.length + g.v.length, `1024 ${mode} gap pairs`).toBeGreaterThan(0);
        const max = Math.max(...g.h, ...g.v);
        expect(max, `1024 ${mode} max gap (${g.worst})`).toBeLessThanOrEqual(40);
      }
    }, TEST_MS);

    it('K6 min-content incl. chrome: card/chrome scrollWidth ≤ clientWidth, no text past card or viewport', async () => {
      const env = await setup(engine);
      const runs: Array<[number, 'view' | 'Customize']> = [
        [768, 'Customize'], [1024, 'Customize'], [1280, 'Customize'],
        [320, 'view'], [375, 'view'], [390, 'view'], [768, 'view'],
      ];
      for (const [width, mode] of runs) {
        const page = mode === 'view'
          ? await openLook(env, env.headOrigin, width, 'dashboard-full')
          : await openCustomize(env, env.headOrigin, width, 'dashboard-full');
        const box = await page.evaluate(readCardOverflowInPage);
        await page.close();
        expect(box.cards, `${width} ${mode} cards`).toBe(26);
        expect(box.missingInk, `${width} ${mode} cards without ink`).toEqual([]);
        if (mode === 'Customize' && width >= 1024) expect(box.chrome, `${width} Customize chrome elements`).toBeGreaterThan(0);
        expect(box.overflow, `${width} ${mode} card/chrome scrollWidth > clientWidth`).toEqual([]);
        expect(box.text, `${width} ${mode} text past card right or viewport`).toEqual([]);
      }
    }, TEST_MS);

    it("K7 768 Customize: '$836.00' fully painted in outstanding-invoices; edit body ≥167", async () => {
      const env = await setup(engine);
      for (const look of ['dashboard', 'dashboard-seed']) {
        const page = await openCustomize(env, env.headOrigin, 768, look);
        const probe = await page.evaluate(readMoneyInPage, { money: '$836.00' }) as MoneyProbe;
        await page.close();
        expect(probe.found, `${look} 768 outstanding-invoices card painted`).toBe(true);
        expect(probe.texts.length, `${look} 768 '$836.00' text nodes`).toBeGreaterThan(0);
        for (const [i, t] of probe.texts.entries()) {
          expect(t.outside, `${look} 768 '$836.00'[${i}] rect ${JSON.stringify(t.rect)} inside card content ${JSON.stringify(t.box)}`).toEqual([]);
          expect(t.overflow, `${look} 768 '$836.00'[${i}] ancestors scrollWidth ≤ clientWidth`).toEqual([]);
        }
        expect(probe.bodyH, `${look} 768 ${probe.cardId} edit body`).toBeGreaterThanOrEqual(167);
      }
    }, TEST_MS);

    it('K8 no horizontal overflow at 320/375/390/768 in view and Customize', async () => {
      const env = await setup(engine);
      for (const width of [320, 375, 390, 768]) {
        for (const mode of ['view', 'Customize'] as const) {
          const page = mode === 'view'
            ? await openLook(env, env.headOrigin, width, 'dashboard-full')
            : await openCustomize(env, env.headOrigin, width, 'dashboard-full');
          const o = await page.evaluate(readPageOverflowInPage);
          await page.close();
          expect(o.docSW, `${width} ${mode} documentElement.scrollWidth`).toBeLessThanOrEqual(o.iw);
          expect(o.bodySW, `${width} ${mode} body.scrollWidth`).toBeLessThanOrEqual(o.iw);
          expect(o.maxRight, `${width} ${mode} max rect.right (${o.maxRightAt})`).toBeLessThanOrEqual(o.iw + 0.5);
          expect(o.maxText, `${width} ${mode} max text rect.right (${o.maxTextAt})`).toBeLessThanOrEqual(o.iw + 0.5);
        }
      }
    }, TEST_MS);
    it('K9 no card overlap and no paint past a card into a neighbour (768 Customize/view strict; 1024/1280 Customize ⊆ in-run aad2eef7)', async () => {
      const env = await setup(engine);
      const runs: Array<[number, 'view' | 'Customize']> = [[768, 'Customize'], [1024, 'Customize'], [1280, 'Customize'], [768, 'view']];
      for (const [width, mode] of runs) {
        const page = mode === 'view'
          ? await openLook(env, env.headOrigin, width, 'dashboard-full')
          : await openCustomize(env, env.headOrigin, width, 'dashboard-full');
        const p: ReturnType<typeof readPaintInPage> = await page.evaluate(readPaintInPage);
        await page.close();
        expect(p.cards, `${width} ${mode} cards`).toBe(26);
        if (width < 1024) {
          expect(p.overlaps, `${width} ${mode} card rects intersecting (>0.5px)`).toEqual([]);
          expect(p.spills, `${width} ${mode} descendant/text paint past card into a neighbour`).toEqual([]);
          continue;
        }
        // ≥1024 must equal aad2eef7 (K5). aad2eef7 itself paints its Customize surfaces past their grid
        // slots, so at ≥1024 the measured head set must be a subset of the in-run aad2eef7 set, each
        // amount ≤ the aad2eef7 amount + 0.5. Anything new or larger is red.
        const refPage = await openCustomize(env, env.aad2Origin, width, 'dashboard-full');
        const r: ReturnType<typeof readPaintInPage> = await refPage.evaluate(readPaintInPage);
        await refPage.close();
        expect(r.cards, `aad2eef7 ${width} ${mode} cards`).toBe(26);
        const refO = new Map(r.overlaps.map((o) => [`${o.a}|${o.b}`, o] as const));
        const newO = p.overlaps.filter((o) => {
          const b = refO.get(`${o.a}|${o.b}`);
          return !b || o.ox > b.ox + 0.5 || o.oy > b.oy + 0.5;
        });
        const refS = new Map<string, number>();
        for (const x of r.spills) refS.set(`${x.id}|${x.into}`, Math.max(refS.get(`${x.id}|${x.into}`) ?? 0, x.area));
        const newS = p.spills.filter((x) => {
          const b = refS.get(`${x.id}|${x.into}`);
          return b === undefined || x.area > b + 0.5;
        });
        expect(newO, `${width} ${mode} card rects intersecting (>0.5px) beyond aad2eef7 (${r.overlaps.length} baseline pairs)`).toEqual([]);
        expect(newS, `${width} ${mode} paint past card into a neighbour beyond aad2eef7 (${r.spills.length} baseline hits)`).toEqual([]);
      }
    }, TEST_MS);
  });
}
