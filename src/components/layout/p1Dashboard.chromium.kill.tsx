/**
 * @vitest-environment node
 *
 * P1 Dashboard/Today Chromium kills over the built dist CSS and a real
 * AppShell + DashboardPage client mount. Filename omits `.test.` so the
 * default include misses it. gates.sh runs this after build + vitest.
 *
 * Painted values only. Reading a CSS variable never counts as a pass.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NAV_WORDS } from '../../lib/brand';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild') as {
  build: (opts: Record<string, unknown>) => Promise<{ outputFiles?: Array<{ text: string }> }>;
};

const here = dirname(fileURLToPath(import.meta.url));
const CREAM = /rgb\(\s*245,\s*240,\s*230\s*\)|#f5f0e6/i;
const WIDTHS = [375, 390, 768, 1024, 1280] as const;
const NAV_WIDTHS = [375, 390, 768, 800, 1023, 1024, 1280] as const;
const SHARED = [
  NAV_WORDS.today,
  NAV_WORDS.jobs,
  NAV_WORDS.field,
  NAV_WORDS.money,
  NAV_WORDS.stock,
  NAV_WORDS.schedule,
  NAV_WORDS.more,
];
const MAIN_SHA = '7e5394dfedf263abdc835f89c8bdb9c70e4449b3';
const FU_MAIN_SHA = '30cb09d96410c1d05171c8bc13bbbd998e4cda77';
const PARENT_MAIN_SHA = 'aad2eef7c11d90845a6e930ea36addfafc88aba6';
const CLAMP_MAIN_SHA = '0898c3b93f167a090615232141bf73790bf731ef';
const LIVE_WIDGET_COUNT = 26;
const AGENT_LONG_TOKEN = 'invoices_archive_2019_northside_plumbing_quarterly_reconciliation_final_v2';
const EDIT_WIDTHS = [768, 1024, 1280] as const;
const PHONE_WIDTHS = [375, 390] as const;
const ARTIFACT_DIR = process.env.P1_398_FU_DIR || join(tmpdir(), 'p1-398-fu');
const MAIN_LOOK_SHA = '0898c3b93f167a090615232141bf73790bf731ef';
const PROD_REMINDER_TITLES = [
  'Call Mia about quote p2b-3mxz — delete ok',
  'Ring Megan re valve Tue 3pm — delete ok 375',
] as const;
const PROD_REMINDER_META = '#0137 · Replace kitchen mixer tap · Overdue · Wed 21 Oct · Company';
const PROD_REMINDER_TEXTS = [...PROD_REMINDER_TITLES, PROD_REMINDER_META] as const;
const LIVE_JOB_META = '#0141.A$ · Ashgrove · CoS Invitee Test';
const LONG_META_SEG = `A$LONG${'W'.repeat(80)}`;

type KillCDP = {
  send: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  detach: () => Promise<void>;
};

type KillPage = {
  goto: (url: string) => Promise<unknown>;
  evaluate: <T>(fn: (() => T | Promise<T>) | ((arg: never) => T | Promise<T>), arg?: unknown) => Promise<T>;
  emulateMedia: (opts: { colorScheme?: 'dark' | 'light' | 'no-preference' }) => Promise<void>;
  waitForSelector: (sel: string, opts?: { timeout?: number; state?: 'attached' | 'visible' | 'hidden' }) => Promise<unknown>;
  setViewportSize: (size: { width: number; height: number }) => Promise<void>;
  screenshot: (opts?: {
    type?: 'png';
    fullPage?: boolean;
    animations?: 'disabled' | 'allow';
    clip?: { x: number; y: number; width: number; height: number };
  }) => Promise<Buffer>;
  addInitScript: (script: string | (() => void)) => Promise<void>;
  context: () => { newCDPSession: (page: KillPage) => Promise<KillCDP> };
  close: () => Promise<void>;
};

async function launchBrowser() {
  const chromeCandidates = [
    process.env.CHROME_PATH,
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    '/usr/bin/google-chrome',
    '/usr/local/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter((path): path is string => !!path && existsSync(path));
  const executablePath = chromeCandidates[0];
  const errors: string[] = [];
  for (const spec of ['playwright', 'playwright-core']) {
    try {
      const mod = await import(spec) as {
        chromium: {
          launch: (opts: { headless: boolean; executablePath?: string; args?: string[] }) => Promise<{
            newPage: (opts?: { viewport?: { width: number; height: number } }) => Promise<KillPage>;
            close: () => Promise<void>;
          }>;
        };
      };
      return await mod.chromium.launch({
        headless: true,
        executablePath,
        args: ['--no-sandbox', '--disable-dev-shm-usage'],
      });
    } catch (err) {
      errors.push(`${spec}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`chromium launch failed: ${errors.join('; ')}`);
}

function readCssDir(dir: string): string {
  const files = readdirSync(dir).filter((name) => name.endsWith('.css'));
  if (!files.length) throw new Error(`no CSS in ${dir}`);
  return files.map((name) => readFileSync(join(dir, name), 'utf8')).join('\n');
}

function readDistCss(): string {
  const dir = join(process.cwd(), 'dist/assets');
  if (!existsSync(dir)) throw new Error('dist/assets missing; run npm run build');
  return readCssDir(dir);
}

function ensureMainDistCss(): string {
  const cached = process.env.P1_MAIN_DIST || join(tmpdir(), 'p1-main-7e5394df/dist/assets');
  if (existsSync(cached) && readdirSync(cached).some((name) => name.endsWith('.css'))) {
    return readCssDir(cached);
  }
  const wt = join(tmpdir(), 'p1-main-7e5394df');
  if (!existsSync(join(wt, 'package.json'))) {
    execSync(`git worktree add --detach ${wt} ${MAIN_SHA}`, { cwd: process.cwd(), stdio: 'pipe' });
    execSync(`ln -sfn ${join(process.cwd(), 'node_modules')} ${join(wt, 'node_modules')}`);
  }
  execSync('npm run build', { cwd: wt, stdio: 'pipe' });
  return readCssDir(join(wt, 'dist/assets'));
}

async function bundleDashboard(opts?: { lookProof?: boolean }): Promise<string> {
  const mocks = join(here, 's2Shell.chromium.mocks.ts');
  const result = await esbuild.build({
    absWorkingDir: process.cwd(),
    entryPoints: [join(here, 'p1Dashboard.chromium.entry.tsx')],
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
      'import.meta.env.VITE_LOOK_PROOF': opts?.lookProof === false ? 'undefined' : '"1"',
      'import.meta.env.VITE_SUPABASE_URL': '"https://example.supabase.co"',
      'import.meta.env.VITE_SUPABASE_ANON_KEY': '"test-anon-key"',
    },
    plugins: [{
      name: 'p1-dashboard-mocks',
      setup(build: {
        onResolve: (
          opts: { filter: RegExp },
          cb: (args: { path: string }) => { path: string; namespace: string } | null,
        ) => void;
      }) {
        build.onResolve({ filter: /(?:AuthContext|useCompanyAiKey|DevConsole|(?:^|[./])supabase)$/ }, (args) => {
          const spec = args.path.replace(/\\/g, '/');
          if (/AuthContext$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/useCompanyAiKey$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/DevConsole$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/(?:^|[./])supabase$/.test(spec)) return { path: mocks, namespace: 'file' };
          return null;
        });
      },
    }],
  });
  const file = result.outputFiles?.[0];
  if (!file) throw new Error('esbuild produced no dashboard bundle');
  return file.text;
}

function fixtureHtml(args: {
  js: string;
  css: string;
  theme: 'light' | 'dark';
  allowDark: boolean;
  path: string;
}): string {
  const allow = args.allowDark ? 'true' : 'false';
  const cfg = JSON.stringify({ path: args.path });
  const geist = pathToFileURL(join(process.cwd(), 'public/fonts/Geist-Variable.woff2')).href;
  return `<!doctype html>
<html data-theme="${args.theme}" data-allow-dark="${allow}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<script>
(function(){
  var Real = Date;
  var ms = Date.parse('2026-10-19T03:40:00.000Z');
  function FrozenDate() {
    if (arguments.length === 0) return new Real(ms);
    return new (Function.prototype.bind.apply(Real, [null].concat([].slice.call(arguments))))();
  }
  FrozenDate.now = function(){ return ms; };
  FrozenDate.parse = Real.parse;
  FrozenDate.UTC = Real.UTC;
  FrozenDate.prototype = Real.prototype;
  window.Date = FrozenDate;
})();
</script>
<style>@font-face{font-family:'Geist';src:url('${geist}') format('woff2');font-weight:100 900;font-style:normal;font-display:block}</style>
<style>${args.css}</style>
</head>
<body>
<div id="root"></div>
<script>window.__P1__ = ${cfg};</script>
<script>${args.js}</script>
</body>
</html>`;
}

let browser: Awaited<ReturnType<typeof launchBrowser>>;
let distCss = '';
let mainCss = '';
let dashJs = '';
let dashJsNoProof = '';
let runDir = '';
let lookOrigin = '';
let lookServer: { origin: string; close: () => Promise<void> } | null = null;
const createdDirs: string[] = [];
const temps: string[] = [];

function frameArtifactDir(suffix: string): string {
  const env = process.env.P1_ARTIFACT_DIR;
  if (env) {
    const dir = join(env, suffix);
    mkdirSync(dir, { recursive: true });
    return dir;
  }
  const dir = mkdtempSync(join(tmpdir(), `${suffix}-`));
  createdDirs.push(dir);
  return dir;
}

function materializeShaTree(sha: string, dest: string): string {
  if (existsSync(join(dest, 'src/pages/DashboardPage.tsx'))) return dest;
  mkdirSync(dest, { recursive: true });
  execSync(`git archive ${sha} | tar -x -C "${dest}"`, {
    cwd: process.cwd(),
    stdio: 'pipe',
    shell: '/bin/bash',
  });
  execSync(`ln -sfn ${join(process.cwd(), 'node_modules')} ${join(dest, 'node_modules')}`);
  return dest;
}

function hasCssDir(dir: string): boolean {
  return existsSync(dir) && readdirSync(dir).some((name) => name.endsWith('.css'));
}

function ensureShaDistCss(sha: string, cacheName: string): string {
  const envCached = process.env[`P1_${cacheName}_DIST`];
  if (envCached && hasCssDir(envCached)) return readCssDir(envCached);
  const existing = join(tmpdir(), `p1-main-${cacheName}/dist/assets`);
  if (hasCssDir(existing)) return readCssDir(existing);
  const dest = mkdtempSync(join(tmpdir(), `p1-css-${cacheName}-`));
  createdDirs.push(dest);
  materializeShaTree(sha, dest);
  execSync('npm run build', { cwd: dest, stdio: 'pipe' });
  return readCssDir(join(dest, 'dist/assets'));
}

function ensureFuMainDistCss(): string {
  return ensureShaDistCss(FU_MAIN_SHA, '30cb09d9');
}

function shaSrcDir(sha: string, cacheName: string, envName: string): string {
  const env = process.env[envName];
  if (env && existsSync(join(env, 'src/pages/DashboardPage.tsx'))) return env;
  const dest = mkdtempSync(join(tmpdir(), `p1-archive-${cacheName}-`));
  createdDirs.push(dest);
  return materializeShaTree(sha, dest);
}

function fuMainSrcDir(): string {
  const env = process.env.P1_30cb09d9_SRC;
  if (env && existsSync(join(env, 'src/pages/DashboardPage.tsx'))) return env;
  for (const cached of [join(tmpdir(), 'p1-real-30cb09d9'), join(tmpdir(), 'p1-src-30cb09d9')]) {
    if (existsSync(join(cached, 'src/pages/DashboardPage.tsx'))) return cached;
  }
  return shaSrcDir(FU_MAIN_SHA, '30cb09d9', 'P1_30cb09d9_SRC');
}

function parentMainSrcDir(): string {
  return shaSrcDir(PARENT_MAIN_SHA, 'aad2eef7', 'P1_AAD2EEF7_SRC');
}

async function bundleDashboardAt(root: string, opts?: { lookProof?: boolean }): Promise<string> {
  const mocks = join(root, 'src/components/layout/s2Shell.chromium.mocks.ts');
  const result = await esbuild.build({
    absWorkingDir: root,
    entryPoints: [join(root, 'src/components/layout/p1Dashboard.chromium.entry.tsx')],
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
      'import.meta.env.VITE_LOOK_PROOF': opts?.lookProof === false ? 'undefined' : '"1"',
      'import.meta.env.VITE_SUPABASE_URL': '"https://example.supabase.co"',
      'import.meta.env.VITE_SUPABASE_ANON_KEY': '"test-anon-key"',
    },
    plugins: [{
      name: 'p1-dashboard-mocks',
      setup(build: {
        onResolve: (
          opts: { filter: RegExp },
          cb: (args: { path: string }) => { path: string; namespace: string } | null,
        ) => void;
      }) {
        build.onResolve({ filter: /(?:AuthContext|useCompanyAiKey|DevConsole|(?:^|[./])supabase)$/ }, (args) => {
          const spec = args.path.replace(/\\/g, '/');
          if (/AuthContext$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/useCompanyAiKey$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/DevConsole$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/(?:^|[./])supabase$/.test(spec)) return { path: mocks, namespace: 'file' };
          return null;
        });
      },
    }],
  });
  const file = result.outputFiles?.[0];
  if (!file) throw new Error('esbuild produced no dashboard bundle');
  return file.text;
}

function injectPersistHook(js: string): string {
  let next = js;
  if (!next.includes('__DASHBOARD_LAYOUT_WRITES__')) {
    const needles = [
      'if (lookDashboard || !!getAuditDashboardWidgets()) return null;',
      'if(lookDashboard||!!getAuditDashboardWidgets())return null;',
    ];
    const hook = '{const host=window;host.__P1_STORED_Y__=host.__P1_STORED_Y__||{};if(patch&&patch.grid_y!=null){host.__P1_STORED_Y__[id]=patch.grid_y;const el=document.querySelector("[data-dashboard-widget-id=\\""+id+"\\"]");if(el)el.setAttribute("data-dashboard-stored-y",String(patch.grid_y));}if(Array.isArray(host.__DASHBOARD_LAYOUT_WRITES__))host.__DASHBOARD_LAYOUT_WRITES__.push({id,...patch});}';
    const hit = needles.find((needle) => next.includes(needle));
    if (!hit) throw new Error('main persistWidget needle missing from bundle');
    next = next.replace(hit, `${hook}${hit}`);
  }
  if (!next.includes('__P1_STAMP_STORED_Y__')) {
    next += `;(()=>{const w=window;w.__P1_STAMP_STORED_Y__=1;w.__P1_STORED_Y__=w.__P1_STORED_Y__||{};const stamp=()=>{for(const el of document.querySelectorAll("[data-dashboard-widget-id]")){const id=el.getAttribute("data-dashboard-widget-id");const y=id&&w.__P1_STORED_Y__[id];if(y!=null)el.setAttribute("data-dashboard-stored-y",String(y));}};const start=()=>{new MutationObserver(stamp).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["data-dashboard-widget-id","style"]});stamp();};if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",start);else start();})();`;
  }
  return next;
}

async function bundleFuMainDashboard(): Promise<string> {
  return injectPersistHook(await bundleDashboardAt(fuMainSrcDir()));
}

function visibilityParityScript(): { cards: number; rows: CardParityRow[] } {
  const vis = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0;
  };
  const inter = (
    a: { left: number; top: number; right: number; bottom: number },
    b: { left: number; top: number; right: number; bottom: number },
  ) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w <= 0 || h <= 0) return 0;
    return Math.min(w, h);
  };
  const clips = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    return /hidden|clip/.test(s.overflow) || /hidden|clip/.test(s.overflowX) || /hidden|clip/.test(s.overflowY);
  };
  const scrolls = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    return /auto|scroll/.test(s.overflow) || /auto|scroll/.test(s.overflowX) || /auto|scroll/.test(s.overflowY);
  };
  const inScroller = (el: Element | null) => {
    let n = el?.parentElement ?? null;
    while (n) {
      if (scrolls(n)) return true;
      if (n.hasAttribute('data-dashboard-widget-id')) break;
      n = n.parentElement;
    }
    return false;
  };
  const contentRect = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      left: r.left + parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth),
      top: r.top + parseFloat(s.paddingTop) + parseFloat(s.borderTopWidth),
      right: r.right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth),
      bottom: r.bottom - parseFloat(s.paddingBottom) - parseFloat(s.borderBottomWidth),
    };
  };
  const clipBox = (el: Element, stop: Element | null) => {
    let n = el.parentElement;
    const box = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    while (n) {
      if (clips(n) && !scrolls(n)) {
        const r = contentRect(n);
        box.left = Math.max(box.left, r.left);
        box.top = Math.max(box.top, r.top);
        box.right = Math.min(box.right, r.right);
        box.bottom = Math.min(box.bottom, r.bottom);
      }
      if (
        n === stop
        || n.classList.contains('dashboard-home-widget')
        || n.hasAttribute('data-dashboard-widget-id')
      ) {
        break;
      }
      n = n.parentElement;
    }
    return box;
  };
    const handleSel = '[title="Drag to move"], [title="Remove widget"], .dashboard-home-widget-resize';
  const canvas = document.querySelector('.dashboard-home-canvas, .dashboard-home-view-grid') as HTMLElement | null;
  const cards = [...(canvas?.querySelectorAll('[data-dashboard-widget-id]') ?? [])].filter(vis) as HTMLElement[];
  const rows: CardParityRow[] = [];
  for (const host of cards) {
    host.scrollIntoView({ block: 'center', inline: 'nearest' });
    const controls = [...host.querySelectorAll(handleSel)].filter(vis) as HTMLElement[];
    const texts: CardTextRow[] = [];
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      const parent = node.parentElement;
      if (
        text
        && parent
        && parent.closest('.dashboard-home-widget')
        && !parent.closest(`${handleSel}, svg`)
      ) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const box = clipBox(parent, host);
        const body = (parent.closest('.dashboard-home-widget') as HTMLElement | null)
          ?? (host.querySelector('.dashboard-home-widget') as HTMLElement | null)
          ?? host;
        const bodyR = contentRect(body);
        const rawRects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
        const visibleRects = rawRects
          .map((r) => {
            const left = Math.max(r.left, bodyR.left);
            const top = Math.max(r.top, bodyR.top);
            const right = Math.min(r.right, bodyR.right);
            const bottom = Math.min(r.bottom, bodyR.bottom);
            return { left, top, right, bottom, width: right - left, height: bottom - top };
          })
          .filter((r) => r.width > 0.5 && r.height > 0.5);
        let clipped = false;
        let covered = false;
        for (const tr of rawRects) {
          if (tr.left < box.left - 0.5 || tr.top < box.top - 0.5
            || tr.right > box.right + 0.5 || tr.bottom > box.bottom + 0.5) {
            clipped = true;
          }
        }
        for (const tr of visibleRects) {
          for (const ctrl of controls) {
            if (inter(ctrl.getBoundingClientRect(), tr) > 0) covered = true;
          }
          const pts: Array<[number, number]> = [
            [tr.left + 2, tr.top + 2],
            [tr.right - 2, tr.top + 2],
            [tr.left + 2, tr.bottom - 2],
            [tr.right - 2, tr.bottom - 2],
            [tr.left + tr.width / 2, tr.top + tr.height / 2],
          ];
          for (const [x, y] of pts) {
            if (x < bodyR.left || x > bodyR.right || y < bodyR.top || y > bodyR.bottom) continue;
            const hit = document.elementFromPoint(x, y);
            if (hit && host.contains(hit) && hit.closest(handleSel)) covered = true;
          }
        }
        if (rawRects.length) {
          texts.push({
            text: text.slice(0, 80),
            clipped,
            covered,
            inScroller: inScroller(parent) || visibleRects.length < rawRects.length,
          });
        }
      }
      node = walker.nextNode();
    }
    const title = (host.querySelector('.text-xs.font-semibold, [class*="font-semibold"]')?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 48);
    rows.push({
      id: host.getAttribute('data-dashboard-widget-id') || '',
      title,
      texts,
    });
  }
  return { cards: cards.length, rows };
}

function foldClipCensusScript(): Array<{
  id: string;
  text: string;
  top: number;
  widgetAncestor: string | null;
  path: string;
}> {
  const clips = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    return /hidden|clip/.test(s.overflow) || /hidden|clip/.test(s.overflowX) || /hidden|clip/.test(s.overflowY);
  };
  const scrolls = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    return /auto|scroll/.test(s.overflow) || /auto|scroll/.test(s.overflowX) || /auto|scroll/.test(s.overflowY);
  };
  const contentRect = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      left: r.left + parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth),
      top: r.top + parseFloat(s.paddingTop) + parseFloat(s.borderTopWidth),
      right: r.right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth),
      bottom: r.bottom - parseFloat(s.paddingBottom) - parseFloat(s.borderBottomWidth),
    };
  };
  const clipBox = (el: Element) => {
    let n = el.parentElement;
    const box = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    while (n) {
      if (clips(n) && !scrolls(n)) {
        const r = contentRect(n);
        box.left = Math.max(box.left, r.left);
        box.top = Math.max(box.top, r.top);
        box.right = Math.min(box.right, r.right);
        box.bottom = Math.min(box.bottom, r.bottom);
      }
      n = n.parentElement;
    }
    return box;
  };
  const domPath = (el: Element) => {
    const parts: string[] = [];
    let n: Element | null = el;
    while (n && n !== document.documentElement) {
      let bit = n.tagName.toLowerCase();
      const id = (n as HTMLElement).id;
      if (id) bit += `#${id}`;
      const wid = n.getAttribute('data-dashboard-widget-id');
      if (wid) bit += `[${wid}]`;
      const cls = typeof n.className === 'string' ? n.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.') : '';
      if (cls) bit += `.${cls}`;
      parts.unshift(bit);
      n = n.parentElement;
    }
    return parts.join('>');
  };
  const handleSel = '[title="Drag to move"], [title="Remove widget"], .dashboard-home-widget-resize';
  const canvas = document.querySelector('.dashboard-home-canvas, .dashboard-home-view-grid') as HTMLElement | null;
  const rows: Array<{ id: string; text: string; top: number; widgetAncestor: string | null; path: string }> = [];
  for (const host of [...(canvas?.querySelectorAll('[data-dashboard-widget-id]') ?? [])] as HTMLElement[]) {
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      const parent = node.parentElement;
      if (!text || !parent || parent.closest(`${handleSel}, svg`)) {
        node = walker.nextNode();
        continue;
      }
      const range = document.createRange();
      range.selectNodeContents(node);
      const textRects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
      if (!textRects.length) {
        node = walker.nextNode();
        continue;
      }
      const box = clipBox(parent);
      const tr = textRects[0];
      const clipped = tr.left < box.left - 0.5 || tr.top < box.top - 0.5
        || tr.right > box.right + 0.5 || tr.bottom > box.bottom + 0.5;
      let n = parent.parentElement;
      let inScroller = false;
      while (n && !n.classList.contains('dashboard-home-widget')) {
        if (n.hasAttribute('data-dashboard-widget-id')) break;
        if (scrolls(n)) { inScroller = true; break; }
        n = n.parentElement;
      }
      if (clipped && !inScroller) {
        const widget = parent.closest('.dashboard-home-widget');
        rows.push({
          id: host.getAttribute('data-dashboard-widget-id') || '',
          text: text.slice(0, 80),
          top: +tr.top.toFixed(1),
          widgetAncestor: widget
            ? `${widget.tagName.toLowerCase()}.${String(widget.className).trim().split(/\s+/).slice(0, 3).join('.')}`
            : null,
          path: domPath(parent),
        });
      }
      node = walker.nextNode();
    }
  }
  return rows;
}

function phoneChromeScript() {
  const stack = document.querySelector('.dashboard-home-widget-stack') as HTMLElement | null;
  const bar = document.querySelector('.dashboard-home-phone-edit-bar') as HTMLElement | null;
  const btns = [...(bar?.querySelectorAll('button') ?? [])] as HTMLElement[];
  const cs = stack ? getComputedStyle(stack) : null;
  return {
    stackCls: stack ? (typeof stack.className === 'string' ? stack.className : '') : '',
    barCls: bar ? (typeof bar.className === 'string' ? bar.className : '') : '',
    gap: cs?.gap || cs?.rowGap || '',
    barH: bar ? Math.round(bar.getBoundingClientRect().height * 2) / 2 : 0,
    btns: btns.map((btn) => {
      const r = btn.getBoundingClientRect();
      return {
        w: Math.round(r.width * 2) / 2,
        h: Math.round(r.height * 2) / 2,
        label: (btn.getAttribute('aria-label') || '').replace(/Move .+ (up|down)/, 'Move $1'),
      };
    }),
  };
}

async function waitForCards(page: KillPage, n = LIVE_WIDGET_COUNT) {
  await page.evaluate(async (want: number) => {
    for (let i = 0; i < 80; i += 1) {
      const count = document.querySelectorAll('[data-dashboard-widget-id]').length;
      if (count >= want) return;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  }, n);
}

async function waitForCanvasCards(page: KillPage, n = LIVE_WIDGET_COUNT) {
  await page.evaluate(async (want: number) => {
    for (let i = 0; i < 80; i += 1) {
      const canvas = document.querySelector('.dashboard-home-canvas') as HTMLElement | null;
      const count = [...(canvas?.querySelectorAll('[data-dashboard-widget-id]') ?? [])]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el as HTMLElement);
          return r.width > 8 && r.height > 8 && s.display !== 'none' && s.visibility !== 'hidden';
        }).length;
      if (count >= want) return;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  }, n);
}

async function leaveEdit(page: KillPage) {
  await page.evaluate(async () => {
    const more = document.querySelector('.dashboard-home-more') as HTMLDetailsElement | null;
    if (!more) throw new Error('more menu missing');
    more.open = true;
    const btn = [...more.querySelectorAll('button')].find((el) => /Done editing/.test(el.textContent || ''));
    if (!btn) throw new Error('Done editing missing');
    (btn as HTMLButtonElement).click();
    for (let i = 0; i < 50; i += 1) {
      const add = [...document.querySelectorAll('button, a')].some((el) => /Add widget/.test(el.textContent || ''));
      if (!add) return;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    throw new Error('left edit mode still shows Add widget');
  });
}

async function initLayoutWrites(page: KillPage) {
  await page.evaluate(() => {
    (window as Window & { __DASHBOARD_LAYOUT_WRITES__?: Array<Record<string, unknown>> })
      .__DASHBOARD_LAYOUT_WRITES__ = [];
  });
}

async function readLayoutWrites(page: KillPage): Promise<Array<Record<string, unknown>>> {
  return page.evaluate(() => (
    (window as Window & { __DASHBOARD_LAYOUT_WRITES__?: Array<Record<string, unknown>> })
      .__DASHBOARD_LAYOUT_WRITES__ ?? []
  ));
}

async function paintedCard(page: KillPage, id: string) {
  return page.evaluate((want: string) => {
    const el = document.querySelector(`.dashboard-home-canvas [data-dashboard-widget-id="${want}"]`) as HTMLElement | null;
    if (!el) return null;
    return {
      left: parseFloat(el.style.left),
      top: parseFloat(el.style.top),
      width: parseFloat(el.style.width),
      height: parseFloat(el.style.height),
      storedY: Number(el.getAttribute('data-dashboard-stored-y')),
      storedH: Number(el.getAttribute('data-dashboard-stored-h')),
    };
  }, id);
}

async function waitForSettledLayout(page: KillPage) {
  // Coach 09:38: fonts.ready, then 2 rAF, then 500ms with no resize, move, or late mount.
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const root = document.querySelector('.dashboard-home-canvas') || document.documentElement;
    const snapshot = () => (
      [...root.querySelectorAll('[data-dashboard-widget-id]')]
        .map((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return `${el.getAttribute('data-dashboard-widget-id')}:${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.width)},${Math.round(r.height)}`;
        })
        .join('|')
    );
    await new Promise<void>((resolve, reject) => {
      let idle = 0;
      let cap = 0;
      let last = snapshot();
      const watched = new Set<Element>();
      const finish = () => {
        const next = snapshot();
        if (next !== last) {
          last = next;
          idle = window.setTimeout(finish, 500);
          return;
        }
        window.clearTimeout(idle);
        window.clearTimeout(cap);
        ro.disconnect();
        mo.disconnect();
        resolve();
      };
      const bump = () => {
        last = snapshot();
        window.clearTimeout(idle);
        idle = window.setTimeout(finish, 500);
      };
      const ro = new ResizeObserver(bump);
      const watch = (el: Element) => {
        if (watched.has(el)) return;
        watched.add(el);
        ro.observe(el);
      };
      watch(root);
      for (const el of root.querySelectorAll('[data-dashboard-widget-id]')) watch(el);
      const mo = new MutationObserver((muts) => {
        for (const mut of muts) {
          for (const node of mut.addedNodes) {
            if (node.nodeType !== 1) continue;
            const el = node as Element;
            if (el.matches?.('[data-dashboard-widget-id]')) watch(el);
            el.querySelectorAll?.('[data-dashboard-widget-id]').forEach(watch);
          }
        }
        bump();
      });
      mo.observe(root, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'data-dashboard-widget-id'],
      });
      idle = window.setTimeout(finish, 500);
      cap = window.setTimeout(() => {
        window.clearTimeout(idle);
        ro.disconnect();
        mo.disconnect();
        reject(new Error('waitForSettledLayout: layout did not settle in 8000ms'));
      }, 8000);
    });
  });
}

async function pointerDragHandle(
  page: KillPage,
  id: string,
  dx: number,
  dy: number,
  kind: 'move' | 'resize',
) {
  await waitForSettledLayout(page);
  const sel = kind === 'resize'
    ? `.dashboard-home-canvas [data-dashboard-widget-id="${id}"] .dashboard-home-widget-resize`
    : `.dashboard-home-canvas [data-dashboard-widget-id="${id}"] [title="Drag to move"]`;
  const box = await page.evaluate((s: string) => {
    const el = document.querySelector(s) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  if (!box) throw new Error(`handle missing ${id} ${kind}`);
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  await page.mouse.move(box.x + dx, box.y + dy, { steps: 8 });
  await page.mouse.up();
  await waitForSettledLayout(page);
}

type EditOverlapHit = {
  widget: string;
  control: string;
  text: string;
  overlap: number;
};

type EditOverlapReport = {
  cards: number;
  maxOverlap: number;
  hits: EditOverlapHit[];
  taps: Array<{ name: string; w: number; h: number }>;
  minTap: number;
  innerWidth: number;
  scrollWidth: number;
  maxRight: number;
};

function crossCardOverlapScript(): CrossCardReport {
  const vis = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0;
  };
  const interWH = (a: DOMRectReadOnly, b: DOMRectReadOnly) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w <= 0.5 || h <= 0.5) return null;
    return { w, h };
  };
  const inside = (part: DOMRectReadOnly, host: DOMRectReadOnly) => (
    part.left >= host.left - 0.5
    && part.top >= host.top - 0.5
    && part.right <= host.right + 0.5
    && part.bottom <= host.bottom + 0.5
  );
  const canvas = document.querySelector('.dashboard-home-canvas, .dashboard-home-view-grid') as HTMLElement | null;
  const cards = [...(canvas?.querySelectorAll('[data-dashboard-widget-id]') ?? [])].filter(vis) as HTMLElement[];
  const hits: CrossCardHit[] = [];
  const leaks: Array<{ id: string; part: string; w: number; h: number }> = [];
  const hostHeights: Array<{ id: string; stored: number; painted: number }> = [];
  const partsOf = (host: HTMLElement) => {
    const body = host.querySelector('.dashboard-home-widget') as HTMLElement | null;
    const foot = host.querySelector('.dashboard-home-edit-foot, .dashboard-home-widget-resize') as HTMLElement | null;
    const chrome = [
      ...host.querySelectorAll('[title="Drag to move"], [title="Remove widget"]'),
      ...[...host.querySelectorAll('span')].filter((el) => (el.textContent || '').trim() === 'Live'),
    ].filter(vis) as HTMLElement[];
    return { body, foot, chrome };
  };
  for (const host of cards) {
    const id = host.getAttribute('data-dashboard-widget-id') || '';
    const hostR = host.getBoundingClientRect();
    const stored = parseFloat(host.style.height);
    hostHeights.push({ id, stored, painted: hostR.height });
    const parts = partsOf(host);
    const leak = (el: HTMLElement | null, part: string) => {
      if (!el || !vis(el)) return;
      const r = el.getBoundingClientRect();
      if (!inside(r, hostR)) {
        leaks.push({
          id,
          part,
          w: Math.max(0, r.right - hostR.right, hostR.left - r.left),
          h: Math.max(0, r.bottom - hostR.bottom, hostR.top - r.top),
        });
      }
    };
    leak(parts.body, 'body');
    leak(parts.foot, 'foot');
    for (const ctrl of parts.chrome) leak(ctrl, 'chrome');
  }
  for (let i = 0; i < cards.length; i += 1) {
    for (let j = 0; j < cards.length; j += 1) {
      if (i === j) continue;
      const a = cards[i];
      const b = cards[j];
      const aId = a.getAttribute('data-dashboard-widget-id') || '';
      const bId = b.getAttribute('data-dashboard-widget-id') || '';
      const bHost = b.getBoundingClientRect();
      const parts = partsOf(a);
      const check = (el: HTMLElement | null, part: string) => {
        if (!el || !vis(el)) return;
        const hit = interWH(el.getBoundingClientRect(), bHost);
        if (hit) hits.push({ a: aId, b: bId, part, w: hit.w, h: hit.h });
      };
      check(parts.body, 'body');
      check(parts.foot, 'foot');
      for (const ctrl of parts.chrome) check(ctrl, 'chrome');
    }
  }
  return { cards: cards.length, hits, leaks, hostHeights };
}

type EditClipRow = {
  id: string;
  lastChildBottom: number;
  innerBottom: number;
  overflow: number;
  scrolls: Array<{ cls: string; scrollHeight: number; clientHeight: number }>;
};

function editContentClipScript(): { cards: number; clipped: EditClipRow[]; rows: EditClipRow[] } {
  const vis = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0;
  };
  const canvas = document.querySelector('.dashboard-home-canvas, .dashboard-home-view-grid') as HTMLElement | null;
  const cards = [...(canvas?.querySelectorAll('[data-dashboard-widget-id]') ?? [])].filter(vis) as HTMLElement[];
  const rows: EditClipRow[] = [];
  for (const host of cards) {
    const id = host.getAttribute('data-dashboard-widget-id') || '';
    const widget = (host.querySelector('.dashboard-home-widget') as HTMLElement | null) ?? host;
    const ink = host.querySelector('.dashboard-home-widget-ink') as HTMLElement | null;
    const box = widget.getBoundingClientRect();
    const cs = getComputedStyle(widget);
    const innerBottom = box.bottom - parseFloat(cs.paddingBottom || '0') - parseFloat(cs.borderBottomWidth || '0');
    const content = ink ?? widget;
    let lastChild = content.lastElementChild as HTMLElement | null;
    while (lastChild && !vis(lastChild) && lastChild.previousElementSibling) {
      lastChild = lastChild.previousElementSibling as HTMLElement;
    }
    const lastChildBottom = lastChild ? lastChild.getBoundingClientRect().bottom : box.bottom;
    const clipBoxes = [host, widget, ink].filter((el): el is HTMLElement => !!el);
    const scrolls = clipBoxes
      .filter((el) => {
        const overflow = getComputedStyle(el).overflow + getComputedStyle(el).overflowY;
        return /auto|scroll/.test(overflow) && el.scrollHeight > el.clientHeight + 0.5;
      })
      .map((el) => ({
        cls: String(el.className).slice(0, 80),
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
      }));
    const overflow = Math.max(0, lastChildBottom - innerBottom);
    rows.push({ id, lastChildBottom, innerBottom, overflow, scrolls });
  }
  return {
    cards: rows.length,
    clipped: rows.filter((row) => row.overflow > 0.5 || row.scrolls.length > 0),
    rows,
  };
}

function agentActivityOverflowScript(token: string) {
  const vis = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0;
  };
  const clips = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    return /hidden|clip|auto|scroll/.test(s.overflowX) || /hidden|clip|auto|scroll/.test(s.overflow);
  };
  const card = [...document.querySelectorAll('[data-dashboard-widget-id]')].find((el) => {
    const text = el.textContent || '';
    return text.includes('Agent Activity') && text.includes(token) && vis(el);
  }) as HTMLElement | undefined;
  if (!card) {
    return { found: false, scrollWidth: -1, clientWidth: -1, overClip: 0, clipRight: 0, maxRight: 0 };
  }
  const tokenEl = [...card.querySelectorAll('p')].find((p) => (p.textContent || '').includes(token)) as HTMLElement | undefined;
  let list: HTMLElement | null = tokenEl?.parentElement ?? null;
  while (list && list !== card) {
    const s = getComputedStyle(list);
    if (/auto|scroll/.test(s.overflowX) || /auto|scroll/.test(s.overflow)) break;
    list = list.parentElement;
  }
  let clip: HTMLElement | null = tokenEl ?? card;
  let clipRight = card.getBoundingClientRect().right;
  while (clip) {
    if (clips(clip)) {
      clipRight = clip.getBoundingClientRect().right;
      break;
    }
    clip = clip.parentElement;
  }
  const rights: number[] = [];
  if (tokenEl) {
    const range = document.createRange();
    range.selectNodeContents(tokenEl);
    for (const r of range.getClientRects()) {
      if (r.width > 0.5 && r.height > 0.5) rights.push(r.right);
    }
  }
  const row = tokenEl?.closest('.flex.items-start') as HTMLElement | null;
  if (row) rights.push(row.getBoundingClientRect().right);
  const maxRight = rights.length ? Math.max(...rights) : 0;
  return {
    found: true,
    scrollWidth: list ? list.scrollWidth : -1,
    clientWidth: list ? list.clientWidth : -1,
    overClip: Math.max(0, maxRight - clipRight),
    clipRight,
    maxRight,
  };
}

function phoneRectScript() {
  const vis = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0;
  };
  const root = document.querySelector('.dashboard-home') as HTMLElement | null;
  if (!root) throw new Error('dashboard-home missing');
  return [...root.querySelectorAll('*')].filter(vis).map((el) => {
    const r = el.getBoundingClientRect();
    const name = (el.getAttribute('data-dashboard-widget-id')
      || el.getAttribute('aria-label')
      || (el.textContent || '').replace(/\s+/g, ' ').trim()
      || el.className
      || el.tagName).toString().slice(0, 64);
    return {
      name,
      tag: el.tagName,
      cls: (typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : '').slice(0, 80),
      x: Math.round(r.x * 2) / 2,
      y: Math.round(r.y * 2) / 2,
      w: Math.round(r.width * 2) / 2,
      h: Math.round(r.height * 2) / 2,
    };
  });
}

function clampMainSrcDir(): string {
  return shaSrcDir(CLAMP_MAIN_SHA, '0898c3b9', 'P1_0898c3b9_SRC');
}

let fuMainCss = '';
let fuMainJs = '';
let parentMainJs = '';
let parentMainCss = '';
let clampMainJs = '';

beforeAll(async () => {
  distCss = readDistCss();
  mainCss = ensureMainDistCss();
  fuMainCss = ensureFuMainDistCss();
  parentMainCss = ensureShaDistCss(PARENT_MAIN_SHA, 'aad2eef7');
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  dashJs = await bundleDashboard();
  dashJsNoProof = await bundleDashboard({ lookProof: false });
  fuMainJs = await bundleFuMainDashboard();
  parentMainJs = injectPersistHook(await bundleDashboardAt(parentMainSrcDir()));
  clampMainJs = injectPersistHook(await bundleDashboardAt(clampMainSrcDir()));
  buildLookDist(LOOK_DIST);
  temps.push(LOOK_DIST);
  lookServer = await serveLookDist(LOOK_DIST);
  lookOrigin = lookServer.origin;
  runDir = mkdtempSync(join(tmpdir(), 'p1-chroma-'));
  temps.push(runDir);
  browser = await launchBrowser();
}, 240000);

afterAll(async () => {
  await lookServer?.close();
  await browser?.close();
  // Only mkdtemp dirs this run created. Never git worktree remove under /tmp.
  for (const dir of [...temps, ...createdDirs]) {
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

async function openPage(args: {
  width: number;
  theme?: 'light' | 'dark';
  allowDark?: boolean;
  path?: string;
  css?: string;
  js?: string;
}): Promise<KillPage> {
  const html = fixtureHtml({
    js: args.js ?? dashJs,
    css: args.css ?? distCss,
    theme: args.theme ?? 'light',
    allowDark: args.allowDark ?? false,
    path: args.path ?? '/?look=dashboard',
  });
  const dir = mkdtempSync(join(tmpdir(), 'p1-dash-'));
  temps.push(dir);
  const file = join(dir, 't.html');
  writeFileSync(file, html);
  const phone = args.width <= 430;
  const page = await browser.newPage({
    viewport: { width: args.width, height: phone ? 844 : 900 },
  });
  await page.goto(pathToFileURL(file).href);
  await page.waitForSelector('.shell-header', { timeout: 20000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  return page;
}

const LOOK_DIST = join(tmpdir(), 'p1b-look-dist');
const MOCKUP_TOL = 12;

function buildLookDist(outDir: string) {
  execSync(`npx vite build --outDir ${outDir} --emptyOutDir`, {
    cwd: process.cwd(),
    env: { ...process.env, VITE_LOOK_PROOF: '1' },
    stdio: 'pipe',
  });
}

function serveLookDist(root: string): Promise<{ origin: string; close: () => Promise<void> }> {
  const mime: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.woff2': 'font/woff2',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.webmanifest': 'application/manifest+json',
  };
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/index.html';
      const file = join(root, rel);
      if (!file.startsWith(root)) {
        res.statusCode = 403;
        res.end();
        return;
      }
      const fallback = !existsSync(file) || !statSync(file).isFile();
      const send = fallback ? join(root, 'index.html') : file;
      res.writeHead(200, { 'content-type': fallback ? 'text/html' : (mime[extname(send)] || 'application/octet-stream') });
      res.end(readFileSync(send));
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('look dist listen failed'));
        return;
      }
      resolve({
        origin: `http://127.0.0.1:${addr.port}`,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

async function openLookDist(origin: string, width: number, path = '/?look=dashboard'): Promise<KillPage> {
  const phone = width <= 430;
  const page = await browser.newPage({
    viewport: { width, height: phone ? 2000 : 1600 },
  });
  await page.addInitScript(`(function(){
    var Real = Date;
    var ms = Date.parse('2026-10-19T03:40:00.000Z');
    function FrozenDate() {
      if (arguments.length === 0) return new Real(ms);
      return new (Function.prototype.bind.apply(Real, [null].concat([].slice.call(arguments))))();
    }
    FrozenDate.now = function(){ return ms; };
    FrozenDate.parse = Real.parse;
    FrozenDate.UTC = Real.UTC;
    FrozenDate.prototype = Real.prototype;
    window.Date = FrozenDate;
  })()`);
  await page.goto(`${origin}${path}`);
  await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 25000 });
  await page.evaluate(async () => { await document.fonts.ready; });
  return page;
}

type SectionBox = { id: string; top: number; left: number; right: number; width: number; height: number };

function readSectionBoxes(): SectionBox[] {
  const vis = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1 && r.height > 1;
  };
  return [...document.querySelectorAll('[data-today-section]')].flatMap((el) => {
    if (!vis(el)) return [];
    return [{
      id: el.getAttribute('data-today-section') || '',
      top: el.getBoundingClientRect().top,
      left: el.getBoundingClientRect().left,
      right: el.getBoundingClientRect().right,
      width: el.getBoundingClientRect().width,
      height: el.getBoundingClientRect().height,
    }];
  });
}

function section(boxes: SectionBox[], id: string): SectionBox {
  const row = boxes.find((box) => box.id === id);
  if (!row) throw new Error(`section ${id} not painted`);
  return row;
}

function readBoardGridEdges(): { boardBottom: number; gridTop: number; boardTop: number; gridBottom: number } {
  const board = document.querySelector('[data-today-board]') as HTMLElement | null;
  const grid = document.querySelector('[data-today-grid]') as HTMLElement | null;
  if (!board || !grid) throw new Error('today board or grid missing');
  const b = board.getBoundingClientRect();
  const g = grid.getBoundingClientRect();
  return { boardBottom: b.bottom, gridTop: g.top, boardTop: b.top, gridBottom: g.bottom };
}

function gridCardClipScript(): { cards: number; hits: Array<{ id: string; text: string; why: string }> } {
  const vis = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0;
  };
  const inter = (a: DOMRect, b: DOMRect) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w <= 0 || h <= 0) return 0;
    return Math.min(w, h);
  };
  const clips = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    return /hidden|clip/.test(s.overflow) || /hidden|clip/.test(s.overflowX) || /hidden|clip/.test(s.overflowY);
  };
  const contentRect = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      left: r.left + parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth),
      top: r.top + parseFloat(s.paddingTop) + parseFloat(s.borderTopWidth),
      right: r.right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth),
      bottom: r.bottom - parseFloat(s.paddingBottom) - parseFloat(s.borderBottomWidth),
    };
  };
  const clipBox = (el: Element) => {
    let n = el.parentElement;
    const box = { left: -Infinity, top: -Infinity, right: Infinity, bottom: Infinity };
    while (n) {
      if (clips(n)) {
        const r = contentRect(n);
        box.left = Math.max(box.left, r.left);
        box.top = Math.max(box.top, r.top);
        box.right = Math.min(box.right, r.right);
        box.bottom = Math.min(box.bottom, r.bottom);
      }
      n = n.parentElement;
    }
    return box;
  };
  const handleSel = '[title="Drag to move"], [title="Remove widget"], .dashboard-home-widget-resize, .dashboard-home-phone-remove';
  const cards = [...document.querySelectorAll('[data-today-grid] [data-dashboard-widget-id]')].filter(vis) as HTMLElement[];
  const hits: Array<{ id: string; text: string; why: string }> = [];
  for (const host of cards) {
    const controls = [...host.querySelectorAll(handleSel)].filter(vis) as HTMLElement[];
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      const parent = node.parentElement;
      if (text && parent && !parent.closest(`${handleSel}, svg`)) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const textRects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
        const box = clipBox(parent);
        for (const tr of textRects) {
          const clipped = tr.left < box.left - 0.5 || tr.top < box.top - 0.5
            || tr.right > box.right + 0.5 || tr.bottom > box.bottom + 0.5;
          const covered = controls.some((ctrl) => inter(ctrl.getBoundingClientRect(), tr) > 0);
          if (clipped || covered) {
            hits.push({
              id: host.getAttribute('data-dashboard-widget-id') || '',
              text: text.slice(0, 80),
              why: covered ? 'covered' : 'clipped',
            });
            break;
          }
        }
      }
      node = walker.nextNode();
    }
  }
  return { cards: cards.length, hits };
}

function nearRgb(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  tol = 12,
): boolean {
  return Math.abs(a.r - b.r) <= tol && Math.abs(a.g - b.g) <= tol && Math.abs(a.b - b.b) <= tol;
}

function contrastRgb(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const lum = (c: { r: number; g: number; b: number }) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const hi = Math.max(lum(a), lum(b));
  const lo = Math.min(lum(a), lum(b));
  return (hi + 0.05) / (lo + 0.05);
}

async function sampleClipCenter(page: KillPage, clip: { x: number; y: number; width: number; height: number }) {
  const buf = await page.screenshot({ type: 'png', clip, animations: 'disabled' });
  return page.evaluate(async (b64: string) => {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = `data:image/png;base64,${b64}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.drawImage(img, 0, 0);
    const px = ctx.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data;
    return { r: px[0], g: px[1], b: px[2] };
  }, buf.toString('base64'));
}

async function waitForSectionText(page: KillPage, section: string, needle: string): Promise<string> {
  const started = Date.now();
  let text = '';
  while (Date.now() - started < 20000) {
    text = await page.evaluate(((id: string) => (
      document.querySelector(`[data-today-section="${id}"]`)?.textContent || ''
    )) as never, section as never);
    if (text.includes(needle)) return text;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`section ${section} never showed ${needle}: ${text}`);
}

async function samplePaintedTextOnFill(page: KillPage, clip: { x: number; y: number; width: number; height: number }) {
  const safe = {
    x: Math.max(0, Math.floor(clip.x)),
    y: Math.max(0, Math.floor(clip.y)),
    width: Math.max(4, Math.ceil(clip.width)),
    height: Math.max(4, Math.ceil(clip.height)),
  };
  const buf = await page.screenshot({ type: 'png', clip: safe, animations: 'disabled' });
  return page.evaluate(async (b64: string) => {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = `data:image/png;base64,${b64}`;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no canvas');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    const counts = new Map<string, { r: number; g: number; b: number; n: number }>();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 80) continue;
      const r = data[i] & ~7;
      const g = data[i + 1] & ~7;
      const b = data[i + 2] & ~7;
      const key = `${r},${g},${b}`;
      const cur = counts.get(key);
      if (cur) cur.n += 1;
      else counts.set(key, { r, g, b, n: 1 });
    }
    const ranked = [...counts.values()].sort((a, b) => b.n - a.n);
    const fill = ranked[0] ?? { r: 0, g: 0, b: 0, n: 0 };
    const dist = (c: { r: number; g: number; b: number }) => {
      const dr = c.r - fill.r;
      const dg = c.g - fill.g;
      const db = c.b - fill.b;
      return dr * dr + dg * dg + db * db;
    };
    const text = ranked.filter(c => c.n >= 3 && dist(c) > 900).sort((a, b) => dist(b) - dist(a))[0] ?? fill;
    return { fill: { r: fill.r, g: fill.g, b: fill.b }, text: { r: text.r, g: text.g, b: text.b } };
  }, buf.toString('base64'));
}

const LOOK_REMS = ['look-rem-mia', 'look-rem-0137', 'look-rem-megan'] as const;
const LOOK_WIDGETS = [
  'look-widget-upcoming-jobs',
  'look-widget-outstanding-invoices',
  'look-widget-compliance',
] as const;
const LOOK_SEED_WIDGETS = [
  ...LOOK_WIDGETS,
  'seed-weather',
  'seed-clock',
  'seed-calendar',
  'seed-calculator',
  'seed-quick_actions',
  'seed-pending_reports',
  'seed-agent_reminders',
  'seed-ai_agent',
  'seed-kpi_scorecard',
] as const;
const LOOK_REPRO_WIDGETS = [
  'w-jobs',
  'w-weather1',
  'w-weather2',
  'w-weather3',
  'w-invoices',
  'w-compliance',
  'w-pending',
  'w-clock',
  'w-calendar',
  'w-calculator',
  'w-quick',
  'w-kpi',
] as const;
const LOOK_JACK_WIDGETS = [
  'look-jack-outstanding',
  'look-jack-cash',
  'look-jack-revenue',
  'look-jack-upcoming',
  'look-jack-compliance',
  'look-jack-kpi',
  'look-jack-team',
] as const;
const LOOK_JOBS = ['look-dash-northside', 'look-dash-harbour'] as const;
const LOOK_NEEDS_CREW_JOBS = ['look-dash-needs-crew'] as const;

async function paintLookFakes(page: KillPage, want: {
  rem: readonly string[];
  widgets: readonly string[];
  jobs: readonly string[];
}) {
  await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
  await page.evaluate(async () => {
    for (let i = 0; i < 80; i += 1) {
      const ledger = !!document.querySelector('.today-jobs, [data-today-board]')
        || /Nothing on today/.test(document.body.textContent || '');
      const rem = document.querySelectorAll('.reminders-title').length >= 2;
      if (ledger && rem) return;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  });
  return page.evaluate((need: { rem: readonly string[]; widgets: readonly string[]; jobs: readonly string[] }) => {
    const remIds = [...document.querySelectorAll('[data-reminder-id]')]
      .map((el) => el.getAttribute('data-reminder-id') || '');
    const widgetIds = [...document.querySelectorAll('[data-dashboard-widget-id]')]
      .map((el) => el.getAttribute('data-dashboard-widget-id') || '');
    const jobIds = [...document.querySelectorAll('[data-dashboard-job]')]
      .map((el) => el.getAttribute('data-dashboard-job') || '');
    const remTitles = [...document.querySelectorAll('.reminders-title')]
      .map((el) => (el.textContent || '').trim())
      .filter(Boolean);
    const crewText = [...document.querySelectorAll('[data-dashboard-job], .today-job-meta')]
      .map((el) => el.textContent || '')
      .join('\n');
    return {
      rem: need.rem.filter((id: string) => remIds.includes(id)),
      widgets: need.widgets.filter((id: string) => widgetIds.includes(id)),
      jobs: need.jobs.filter((id: string) => jobIds.includes(id)),
      lookCrew: /\bDave\b|\bJack\b/.test(crewText),
      lookDay: /Thursday 3 September/.test(document.body.textContent || ''),
      liveCrew: crewText.includes('CoS Invitee Test'),
      liveRemTitles: remTitles,
      liveReminders: !!document.querySelector('[data-dashboard-reminders="1"] .reminders-capture'),
    };
  }, want);
}

const LIVE_LOOK_OK = {
  rem: [] as string[],
  widgets: [] as string[],
  jobs: [] as string[],
  lookCrew: false,
  lookDay: false,
  liveCrew: true,
  liveRemTitles: [...PROD_REMINDER_TITLES],
  liveReminders: true,
};

function liveLookBag(paint: Awaited<ReturnType<typeof paintLookFakes>>) {
  return {
    rem: paint.rem,
    widgets: paint.widgets,
    jobs: paint.jobs,
    lookCrew: paint.lookCrew,
    lookDay: paint.lookDay,
    liveCrew: paint.liveCrew,
    liveRemTitles: paint.liveRemTitles,
    liveReminders: paint.liveReminders,
  };
}

async function applyProdReminderCopy(page: KillPage) {
  await page.evaluate(async (copy: { titles: string[]; meta: string }) => {
    await document.fonts.ready;
    const titles = [...document.querySelectorAll('.reminders-title')];
    const metas = [...document.querySelectorAll('.reminders-meta')];
    if (titles[0]) titles[0].textContent = copy.titles[0];
    if (titles[1]) titles[1].textContent = 'On site';
    if (titles[2]) titles[2].textContent = copy.titles[1];
    if (metas[1]) metas[1].textContent = copy.meta;
    else if (metas[0]) metas[0].textContent = copy.meta;
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }, { titles: [...PROD_REMINDER_TITLES], meta: PROD_REMINDER_META });
}

type DashMeasure = {
  pageBg: string;
  sheetBg: string;
  cardBgs: string[];
  widgetBgs: string[];
  tokenBg: string;
  tokenSurface: string;
  tokenMuted: string;
  tokenOk: string;
  tokenOkBg: string;
  tokenWarn: string;
  tokenWarnBg: string;
  tokenBad: string;
  tokenBadBg: string;
  secondary: Array<{ text: string; cls: string; ratio: number; color: string; primary: boolean }>;
  floor: Array<{ text: string; cls: string; ratio: number; color: string; primary: boolean }>;
  minSecondary: number;
  minFloor: number;
  cta: number;
  pills: Array<{ cls: string; text: string; fg: string; bg: string }>;
  greenOutsidePill: number;
  hits: Array<{ name: string; w: number; h: number }>;
  minHit: number;
  navyHits: Array<{ name: string; prop: string; val: string }>;
  creamHits: Array<{ name: string; prop: string; val: string }>;
  reminderLines: Array<{ text: string; lines: number }>;
  innerWidth: number;
  scrollWidth: number;
  maxRight: number;
};

function measureScript() {
  const parse = (c: string) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lum = (c: { r: number; g: number; b: number }) => {
    const f = (v: number) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const blend = (
    top: { r: number; g: number; b: number; a: number },
    bot: { r: number; g: number; b: number },
  ) => ({
    r: top.r * top.a + bot.r * (1 - top.a),
    g: top.g * top.a + bot.g * (1 - top.a),
    b: top.b * top.a + bot.b * (1 - top.a),
  });
  const usedBg = (el: HTMLElement) => {
    let node: HTMLElement | null = el;
    const stack: Array<{ r: number; g: number; b: number; a: number }> = [];
    while (node) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c && c.a > 0) {
        stack.push(c);
        if (c.a >= 1) break;
      }
      node = node.parentElement;
    }
    let out = { r: 255, g: 255, b: 255 };
    while (stack.length) out = blend(stack.pop()!, out);
    return out;
  };
  const ratio = (el: HTMLElement | null) => {
    if (!el) return 0;
    const fg = parse(getComputedStyle(el).color);
    if (!fg) return 0;
    const bg = usedBg(el);
    const fgb = fg.a < 1 ? blend(fg, bg) : fg;
    const x = lum(fgb);
    const y = lum(bg);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const token = (prop: string) => {
    const probe = document.createElement('span');
    probe.style.backgroundColor = `var(${prop})`;
    document.body.appendChild(probe);
    const bg = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return bg;
  };
  const vis = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0;
  };
  const sameRgb = (a: string, b: string) => {
    const pa = parse(a);
    const pb = parse(b);
    if (!pa || !pb) return false;
    return Math.abs(pa.r - pb.r) < 2 && Math.abs(pa.g - pb.g) < 2 && Math.abs(pa.b - pb.b) < 2;
  };
  const tokenMuted = token('--g-ink-muted');
  const tokenInk = token('--g-ink');
  const tokenDashInk = token('--dashboard-home-ink');
  const tokenInverseInk = token('--g-inverse-ink');
  const pageEl = document.querySelector('.dashboard-home.ops-page') as HTMLElement | null;
  const sheetEl = document.querySelector('.dashboard-home-sheet') as HTMLElement | null;
  const cta = document.querySelector('.dashboard-home.ops-page .dashboard-home-primary') as HTMLElement | null;
  const cardBgs = [...document.querySelectorAll('.dashboard-home-widget-card')]
    .filter(vis)
    .map((el) => getComputedStyle(el as HTMLElement).backgroundColor);
  const widgetBgs = [...document.querySelectorAll('.dashboard-home-widget')]
    .filter(vis)
    .map((el) => getComputedStyle(el as HTMLElement).backgroundColor);
  const ownText = (el: HTMLElement) =>
    [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent || '').trim());
  const textEls = [...document.querySelectorAll('.dashboard-home.ops-page *')].filter((node) => {
    const el = node as HTMLElement;
    if (!vis(el) || !ownText(el)) return false;
    if (el.closest('.shell-header, .shell-bottom-nav')) return false;
    if ((el as HTMLButtonElement).disabled) return false;
    return true;
  }) as HTMLElement[];
  const chrome = '.dashboard-home-pill, .reminders-chip, .dashboard-home-primary, .btn-primary';
  const floor = textEls.filter((el) => {
    if (el.closest(chrome)) return false;
    if (el.tagName === 'SVG' || el.closest('svg')) return false;
    return true;
  }).map((el) => {
    const color = getComputedStyle(el).color;
    return {
      text: (el.textContent || '').trim().slice(0, 48),
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 80),
      ratio: ratio(el),
      color,
      primary: sameRgb(color, tokenInk) || sameRgb(color, tokenDashInk) || sameRgb(color, tokenInverseInk),
    };
  });
  const secondary = floor.filter((n) => !n.primary);
  const pills = [...document.querySelectorAll('.dashboard-home.ops-page .dashboard-home-pill')]
    .filter(vis)
    .map((el) => ({
      cls: (typeof (el as HTMLElement).className === 'string' ? (el as HTMLElement).className : ''),
      text: (el.textContent || '').trim(),
      fg: getComputedStyle(el as HTMLElement).color,
      bg: getComputedStyle(el as HTMLElement).backgroundColor,
    }));
  const isGreen = (c: string) => {
    const p = parse(c);
    return !!p && p.g > p.r + 25 && p.g > p.b + 10 && p.g > 80;
  };
  const greenOutsidePill = [...document.querySelectorAll('[data-dashboard-widget-id*="compliance"] *')]
    .filter((node) => {
      const el = node as HTMLElement;
      if (!vis(el) || !ownText(el)) return false;
      if (el.closest('.dashboard-home-pill, svg')) return false;
      return isGreen(getComputedStyle(el).color);
    }).length;
  const hitSel = [
    '.dashboard-home.ops-page a',
    '.dashboard-home.ops-page button',
    '.dashboard-home.ops-page summary',
    '.dashboard-home.ops-page input',
    '.dashboard-home.ops-page [role="button"]',
    '.dashboard-home.ops-page [role="menuitem"]',
    '.dashboard-home.ops-page .today-job-row',
    '.dashboard-home-picker button',
    '.dashboard-home-picker a',
    '.reminders-tick',
    '.reminders-clock',
    '.dashboard-home-widget-resize',
  ].join(', ');
  const hits = [...document.querySelectorAll(hitSel)].filter(vis).map((node) => {
    const el = node as HTMLElement;
    const r = el.getBoundingClientRect();
    return {
      name: (el.getAttribute('aria-label') || el.textContent || el.className || '').toString().trim().slice(0, 48),
      w: r.width,
      h: r.height,
    };
  });
  const rights = [...document.querySelectorAll('body *')].filter(vis).map((el) => el.getBoundingClientRect().right);
  const closeRgb = (c: { r: number; g: number; b: number }, r: number, g: number, b: number) =>
    Math.abs(c.r - r) < 2 && Math.abs(c.g - g) < 2 && Math.abs(c.b - b) < 2;
  const colorsIn = (val: string) => {
    const out: Array<{ r: number; g: number; b: number; a: number }> = [];
    if (!val) return out;
    const rgbRe = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)/gi;
    let m: RegExpExecArray | null;
    while ((m = rgbRe.exec(val))) {
      const rawA = m[4];
      const a = rawA == null ? 1 : (String(rawA).endsWith('%') ? parseFloat(rawA) / 100 : Number(rawA));
      out.push({ r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: Number.isFinite(a) ? a : 1 });
    }
    const hexRe = /#([0-9a-f]{3,8})\b/gi;
    while ((m = hexRe.exec(val))) {
      let h = m[1];
      if (h.length === 3 || h.length === 4) h = h.split('').map((ch) => ch + ch).join('');
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
      out.push({ r, g, b, a });
    }
    return out;
  };
  const isNavy = (c: { r: number; g: number; b: number; a: number }) =>
    c.a > 0 && (closeRgb(c, 10, 37, 64) || closeRgb(c, 46, 117, 182));
  const isCream = (c: { r: number; g: number; b: number; a: number }) =>
    c.a > 0 && (closeRgb(c, 245, 240, 230) || closeRgb(c, 255, 253, 248));
  const styleProps = (s: CSSStyleDeclaration): Array<[string, string]> => {
    const props: Array<[string, string]> = [
      ['color', s.color],
      ['background', s.backgroundColor],
      ['border', s.borderColor],
      ['outline', s.outlineColor || s.outline],
      ['box-shadow', s.boxShadow],
      ['background-image', s.backgroundImage],
    ];
    if (s.fill && s.fill !== 'none') props.push(['fill', s.fill]);
    if (s.stroke && s.stroke !== 'none') props.push(['stroke', s.stroke]);
    return props;
  };
  const paintHits = (want: 'navy' | 'cream') => [...document.querySelectorAll('.dashboard-home.ops-page, .dashboard-home.ops-page *')]
    .filter(vis)
    .flatMap((node) => {
      const el = node as HTMLElement;
      const name = (el.getAttribute('aria-label') || el.textContent || el.className || '').toString().trim().slice(0, 48);
      const styles: CSSStyleDeclaration[] = [getComputedStyle(el)];
      for (const pseudo of ['::before', '::after'] as const) {
        const ps = getComputedStyle(el, pseudo);
        const content = (ps.content || '').trim();
        if (content === 'none' || content === 'normal') continue;
        styles.push(ps);
      }
      const match = want === 'navy' ? isNavy : isCream;
      return styles.flatMap((s) => styleProps(s)
        .filter(([, val]) => colorsIn(val).some(match))
        .map(([prop, val]) => ({ name, prop, val })));
    });
  const reminderLines = [...document.querySelectorAll('.reminders-title, .reminders-meta')].filter(vis).map((node) => {
    const el = node as HTMLElement;
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1).length;
    return { text: (el.textContent || '').trim(), lines };
  });
  return {
    pageBg: pageEl ? getComputedStyle(pageEl).backgroundColor : '',
    sheetBg: sheetEl ? getComputedStyle(sheetEl).backgroundColor : '',
    cardBgs,
    widgetBgs,
    tokenBg: token('--g-bg'),
    tokenSurface: token('--g-surface'),
    tokenMuted,
    tokenOk: token('--g-ok'),
    tokenOkBg: token('--g-ok-bg'),
    tokenWarn: token('--g-warn'),
    tokenWarnBg: token('--g-warn-bg'),
    tokenBad: token('--g-bad'),
    tokenBadBg: token('--g-bad-bg'),
    secondary,
    floor,
    minSecondary: secondary.length ? Math.min(...secondary.map((s) => s.ratio)) : 0,
    minFloor: floor.length ? Math.min(...floor.map((s) => s.ratio)) : 0,
    cta: ratio(cta),
    pills,
    greenOutsidePill,
    hits,
    minHit: hits.length ? Math.min(...hits.map((h) => Math.min(h.w, h.h))) : 0,
    navyHits: paintHits('navy'),
    creamHits: paintHits('cream'),
    reminderLines,
    innerWidth: window.innerWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    maxRight: rights.length ? Math.max(...rights) : 0,
  };
}

type PalettePixels = {
  navy: number;
  minNavyDe: number;
  creamExact: number;
  creamDe: number;
  minCreamDe: number;
};

async function scanPalettePixels(page: KillPage): Promise<PalettePixels> {
  const meta = await page.evaluate(collectCreamMeta);
  const clip = meta.clip;
  const buf = await page.screenshot({ type: 'png', clip, animations: 'disabled' });
  return page.evaluate(async (args: { b64: string; masks: CreamMask[]; dpr: number }) => {
    const srgbToLinear = (c: number) => {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const rgbToLab = (r: number, g: number, b: number) => {
      r = srgbToLinear(r);
      g = srgbToLinear(g);
      b = srgbToLinear(b);
      const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
      const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
      const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
      const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
      const fx = f(x / 0.95047);
      const fy = f(y / 1);
      const fz = f(z / 1.08883);
      return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
    };
    const deg2rad = (d: number) => d * Math.PI / 180;
    const rad2deg = (r: number) => r * 180 / Math.PI;
    const deltaE2000 = (
      l1: { L: number; a: number; b: number },
      l2: { L: number; a: number; b: number },
    ) => {
      const { L: L1, a: a1, b: b1 } = l1;
      const { L: L2, a: a2, b: b2 } = l2;
      const C1 = Math.hypot(a1, b1);
      const C2 = Math.hypot(a2, b2);
      const Cab = (C1 + C2) / 2;
      const G = 0.5 * (1 - Math.sqrt(Cab ** 7 / (Cab ** 7 + 25 ** 7)));
      const a1p = a1 * (1 + G);
      const a2p = a2 * (1 + G);
      const C1p = Math.hypot(a1p, b1);
      const C2p = Math.hypot(a2p, b2);
      let h1 = Math.atan2(b1, a1p);
      if (h1 < 0) h1 += 2 * Math.PI;
      let h2 = Math.atan2(b2, a2p);
      if (h2 < 0) h2 += 2 * Math.PI;
      const dLp = L2 - L1;
      const dCp = C2p - C1p;
      let dhp = h2 - h1;
      if (C1p * C2p === 0) dhp = 0;
      else if (dhp > Math.PI) dhp -= 2 * Math.PI;
      else if (dhp < -Math.PI) dhp += 2 * Math.PI;
      const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp / 2);
      const Lbp = (L1 + L2) / 2;
      const Cbp = (C1p + C2p) / 2;
      let hbp = h1 + h2;
      if (C1p * C2p !== 0) {
        if (Math.abs(h1 - h2) > Math.PI) hbp += (h1 + h2 < 2 * Math.PI) ? 2 * Math.PI : -2 * Math.PI;
        hbp /= 2;
      }
      const T = 1 - 0.17 * Math.cos(hbp - deg2rad(30)) + 0.24 * Math.cos(2 * hbp)
        + 0.32 * Math.cos(3 * hbp + deg2rad(6)) - 0.20 * Math.cos(4 * hbp - deg2rad(63));
      const dRo = deg2rad(30) * Math.exp(-(((rad2deg(hbp) - 275) / 25) ** 2));
      const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
      const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
      const SC = 1 + 0.045 * Cbp;
      const SH = 1 + 0.015 * Cbp * T;
      const RT = -Math.sin(2 * dRo) * RC;
      return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
    };
    const navyLabs = [rgbToLab(10, 37, 64), rgbToLab(46, 117, 182)];
    const creamLabs = [rgbToLab(245, 240, 230), rgbToLab(255, 253, 248)];
    const img = new Image();
    img.src = `data:image/png;base64,${args.b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    const dpr = args.dpr || 1;
    const masked = (px: number, py: number) => {
      const x = px / dpr;
      const y = py / dpr;
      return args.masks.some((m) => x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h);
    };
    let navy = 0;
    let creamExact = 0;
    let creamDe = 0;
    let minNavyDe = 99;
    let minCreamDe = 99;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue;
      const px = (i / 4) % img.width;
      const py = Math.floor((i / 4) / img.width);
      if (masked(px, py)) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const nearNavy = (Math.abs(r - 10) < 40 && Math.abs(g - 37) < 40 && Math.abs(b - 64) < 50)
        || (Math.abs(r - 46) < 40 && Math.abs(g - 117) < 50 && Math.abs(b - 182) < 50);
      if (nearNavy) {
        const lab = rgbToLab(r, g, b);
        const de = Math.min(deltaE2000(lab, navyLabs[0]), deltaE2000(lab, navyLabs[1]));
        if (de < minNavyDe) minNavyDe = de;
        if (de < 10) navy += 1;
      }
      const exactCream = (Math.abs(r - 245) < 2 && Math.abs(g - 240) < 2 && Math.abs(b - 230) < 2)
        || (Math.abs(r - 255) < 2 && Math.abs(g - 253) < 2 && Math.abs(b - 248) < 2);
      if (exactCream) creamExact += 1;
      const nearCream = r > 220 && g > 220 && b > 210;
      if (nearCream) {
        const lab = rgbToLab(r, g, b);
        const de = Math.min(deltaE2000(lab, creamLabs[0]), deltaE2000(lab, creamLabs[1]));
        if (de < minCreamDe) minCreamDe = de;
        if (de < 10) creamDe += 1;
      }
    }
    return { navy, minNavyDe, creamExact, creamDe, minCreamDe };
  }, { b64: buf.toString('base64'), masks: meta.masks, dpr: meta.dpr });
}

// Token-derived cream b* fail — not from head frames.
// Light surfaces: --g-surface #FFFFFF b*=0, --g-bg #F5F5F7 b*=-0.96, --g-line #E4E4E7 b*=-1.46.
// #FFFDF8 sheet is b*=2.62 (not 2.3). Midpoint 1.31 lets #FDFCFA (b*=1.07) through.
// 0.50 sits just above the Light ceiling and below #FDFCFA / every cream token.
const SHEET_B = 2.62;
const CREAM_B_THRESHOLD = 0.5;
// Token-derived navy C* fail in hue 220–280° — not from head frames.
// Light tokens outside that band have C* ≤ 5.08. Navy #0A2540 is C*=20.1 h=273.
// F5b (navy .5 over white) is C*=9.1. Fail at C*>6.
const NAVY_C_THRESHOLD = 6;
const NAVY_HUE_MIN = 220;
const NAVY_HUE_MAX = 280;
// Frozen allowlist — never read from the page under test (T2 launders --ops-navy).
// Only --ops-muted #4A5568 sits in C*>6 / hue 220–280° on Light.
const NAVY_EXCLUDE = [
  { r: 74, g: 85, b: 104 },
  { r: 24, g: 63, b: 184 },
] as const;
const T2_CSS = ':root,.dashboard-home{--ops-navy:#2B4A6F}.today-title::after{content:"";display:block;height:4px;background:var(--ops-navy)}';

type CreamMask = { x: number; y: number; w: number; h: number };
type CreamClip = { x: number; y: number; width: number; height: number };
type CreamScan = {
  maxB: number;
  light: number;
  chromaHits: number;
  creamDe3: number;
  hits: number;
  masks: number;
  at: { x: number; y: number; r: number; g: number; b: number };
};

function collectCreamMeta() {
  const el = (document.querySelector('.dashboard-home')
    || document.querySelector('[data-dashboard-home="1"]')) as HTMLElement | null;
  if (!el) throw new Error('dashboard missing');
  const sheet = (document.querySelector('.dashboard-home-sheet') || el) as HTMLElement;
  const pageBox = el.getBoundingClientRect();
  const sheetBox = sheet.getBoundingClientRect();
  const clip = {
    x: Math.max(0, Math.floor(pageBox.x)),
    y: Math.max(0, Math.floor(pageBox.y)),
    width: Math.max(1, Math.ceil(pageBox.width)),
    height: Math.max(1, Math.ceil(Math.max(sheetBox.bottom, pageBox.top + 1) - pageBox.y + 24)),
  };
  const vis = (node: Element) => {
    const s = getComputedStyle(node as HTMLElement);
    const r = node.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0;
  };
  const parse = (c: string) => {
    const m = c.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i);
    return m ? { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) } : null;
  };
  const isGreen = (c: { r: number; g: number; b: number } | null) =>
    !!c && c.g > c.r + 20 && c.g > c.b + 10 && c.g > 80;
  const isAmber = (c: { r: number; g: number; b: number } | null) =>
    !!c && c.r > 160 && c.g > 70 && c.r >= c.g - 10 && c.b < 100 && (c.r - c.b) > 60;
  const isRed = (c: { r: number; g: number; b: number } | null) =>
    !!c && c.r > 160 && c.r > c.g + 30 && c.r > c.b + 30;
  const masks: CreamMask[] = [];
  const add = (node: Element, pad = 2) => {
    const r = node.getBoundingClientRect();
    masks.push({
      x: Math.floor(r.x - clip.x - pad),
      y: Math.floor(r.y - clip.y - pad),
      w: Math.ceil(r.width + pad * 2),
      h: Math.ceil(r.height + pad * 2),
    });
  };
  for (const node of el.querySelectorAll('.dashboard-home-pill, .today-pill, .today-quiet, .today-set-date, .today-try, .today-overdue, img, .dashboard-home-ai-avatar, .bg-gradient-to-br')) {
    if (vis(node)) add(node);
  }
  for (const svg of el.querySelectorAll('svg')) {
    if (vis(svg)) add(svg, 3);
  }
  for (const node of el.querySelectorAll('[class*="bg-green"], [class*="bg-amber"], [class*="rounded-full"]')) {
    if (!vis(node)) continue;
    const bg = parse(getComputedStyle(node as HTMLElement).backgroundColor);
    if (isGreen(bg) || isAmber(bg) || isRed(bg)) add(node);
  }
  return { clip, masks, dpr: window.devicePixelRatio || 1 };
}

async function analyzeCreamPixels(args: {
  b64: string;
  masks: CreamMask[];
  dpr: number;
  threshold: number | null;
  fallback: boolean;
}): Promise<CreamScan> {
  const srgbToLinear = (c: number) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const rgbToLab = (r: number, g: number, b: number) => {
    r = srgbToLinear(r);
    g = srgbToLinear(g);
    b = srgbToLinear(b);
    const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
    const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
    const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
    const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
    const fx = f(x / 0.95047);
    const fy = f(y / 1);
    const fz = f(z / 1.08883);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  };
  const deg2rad = (d: number) => d * Math.PI / 180;
  const rad2deg = (r: number) => r * 180 / Math.PI;
  const deltaE2000 = (
    l1: { L: number; a: number; b: number },
    l2: { L: number; a: number; b: number },
  ) => {
    const { L: L1, a: a1, b: b1 } = l1;
    const { L: L2, a: a2, b: b2 } = l2;
    const C1 = Math.hypot(a1, b1);
    const C2 = Math.hypot(a2, b2);
    const Cab = (C1 + C2) / 2;
    const G = 0.5 * (1 - Math.sqrt(Cab ** 7 / (Cab ** 7 + 25 ** 7)));
    const a1p = a1 * (1 + G);
    const a2p = a2 * (1 + G);
    const C1p = Math.hypot(a1p, b1);
    const C2p = Math.hypot(a2p, b2);
    let h1 = Math.atan2(b1, a1p);
    if (h1 < 0) h1 += 2 * Math.PI;
    let h2 = Math.atan2(b2, a2p);
    if (h2 < 0) h2 += 2 * Math.PI;
    const dLp = L2 - L1;
    const dCp = C2p - C1p;
    let dhp = h2 - h1;
    if (C1p * C2p === 0) dhp = 0;
    else if (dhp > Math.PI) dhp -= 2 * Math.PI;
    else if (dhp < -Math.PI) dhp += 2 * Math.PI;
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp / 2);
    const Lbp = (L1 + L2) / 2;
    const Cbp = (C1p + C2p) / 2;
    let hbp = h1 + h2;
    if (C1p * C2p !== 0) {
      if (Math.abs(h1 - h2) > Math.PI) hbp += (h1 + h2 < 2 * Math.PI) ? 2 * Math.PI : -2 * Math.PI;
      hbp /= 2;
    }
    const T = 1 - 0.17 * Math.cos(hbp - deg2rad(30)) + 0.24 * Math.cos(2 * hbp)
      + 0.32 * Math.cos(3 * hbp + deg2rad(6)) - 0.20 * Math.cos(4 * hbp - deg2rad(63));
    const dRo = deg2rad(30) * Math.exp(-(((rad2deg(hbp) - 275) / 25) ** 2));
    const RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
    const SL = 1 + (0.015 * (Lbp - 50) ** 2) / Math.sqrt(20 + (Lbp - 50) ** 2);
    const SC = 1 + 0.045 * Cbp;
    const SH = 1 + 0.015 * Cbp * T;
    const RT = -Math.sin(2 * dRo) * RC;
    return Math.sqrt((dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH));
  };
  const creamLabs = [rgbToLab(245, 240, 230), rgbToLab(255, 253, 248)];
  const img = new Image();
  img.src = `data:image/png;base64,${args.b64}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  const dpr = args.dpr || 1;
  const masked = (px: number, py: number) => {
    const x = px / dpr;
    const y = py / dpr;
    for (const m of args.masks) {
      if (x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h) return true;
    }
    return false;
  };
  let maxB = -99;
  let light = 0;
  let chromaHits = 0;
  let creamDe3 = 0;
  let at = { x: 0, y: 0, r: 0, g: 0, b: 0 };
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    const px = (i / 4) % img.width;
    const py = Math.floor((i / 4) / img.width);
    if (masked(px, py)) continue;
    const lab = rgbToLab(data[i], data[i + 1], data[i + 2]);
    if (lab.L <= 85) continue;
    light += 1;
    if (lab.b > maxB) {
      maxB = lab.b;
      at = { x: px, y: py, r: data[i], g: data[i + 1], b: data[i + 2] };
    }
    if (args.threshold != null && lab.b > args.threshold) chromaHits += 1;
    const de = Math.min(deltaE2000(lab, creamLabs[0]), deltaE2000(lab, creamLabs[1]));
    if (de < 3) creamDe3 += 1;
  }
  const hits = args.threshold == null
    ? 0
    : chromaHits + (args.fallback ? creamDe3 : 0);
  return {
    maxB: light ? maxB : 0,
    light,
    chromaHits,
    creamDe3,
    hits,
    masks: args.masks.length,
    at,
  };
}

async function captureCreamFrame(page: KillPage, width: number): Promise<{
  clip: CreamClip;
  masks: CreamMask[];
  dpr: number;
  b64: string;
  maxB: number;
  creamDe3: number;
  at: { x: number; y: number; r: number; g: number; b: number };
}> {
  await page.setViewportSize({ width, height: width <= 430 ? 5000 : 4000 });
  const meta = await page.evaluate(collectCreamMeta) as {
    clip: CreamClip;
    masks: CreamMask[];
    dpr: number;
  };
  const buf = await page.screenshot({ type: 'png', clip: meta.clip, animations: 'disabled' });
  const b64 = buf.toString('base64');
  const stats = await page.evaluate(analyzeCreamPixels, {
    b64,
    masks: meta.masks,
    dpr: meta.dpr,
    threshold: null,
    fallback: false,
  });
  return { ...meta, b64, maxB: stats.maxB, creamDe3: stats.creamDe3, at: stats.at };
}

async function analyzeNavyPixels(args: {
  b64: string;
  masks: CreamMask[];
  dpr: number;
  exclude: Array<{ r: number; g: number; b: number }>;
  cMin: number;
  hMin: number;
  hMax: number;
}): Promise<{
  hits: number;
  tokenPx: number;
  at: { x: number; y: number; r: number; g: number; b: number; C: number; h: number };
}> {
  const srgbToLinear = (c: number) => {
    c /= 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const rgbToLab = (r: number, g: number, b: number) => {
    r = srgbToLinear(r);
    g = srgbToLinear(g);
    b = srgbToLinear(b);
    const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
    const y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
    const z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;
    const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29);
    const fx = f(x / 0.95047);
    const fy = f(y / 1);
    const fz = f(z / 1.08883);
    return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
  };
  const img = new Image();
  img.src = `data:image/png;base64,${args.b64}`;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  const dpr = args.dpr || 1;
  const masked = (px: number, py: number) => {
    const x = px / dpr;
    const y = py / dpr;
    for (const m of args.masks) {
      if (x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h) return true;
    }
    return false;
  };
  const exactToken = (r: number, g: number, b: number) =>
    args.exclude.some((t) => Math.abs(r - t.r) < 1 && Math.abs(g - t.g) < 1 && Math.abs(b - t.b) < 1);
  let hits = 0;
  let tokenPx = 0;
  let at = { x: 0, y: 0, r: 0, g: 0, b: 0, C: 0, h: 0 };
  let maxC = -1;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    const px = (i / 4) % img.width;
    const py = Math.floor((i / 4) / img.width);
    if (masked(px, py)) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lab = rgbToLab(r, g, b);
    const C = Math.hypot(lab.a, lab.b);
    let h = Math.atan2(lab.b, lab.a) * 180 / Math.PI;
    if (h < 0) h += 360;
    if (!(C > args.cMin && h >= args.hMin && h <= args.hMax)) continue;
    if (exactToken(r, g, b)) {
      tokenPx += 1;
      continue;
    }
    hits += 1;
    if (C > maxC) {
      maxC = C;
      at = { x: px, y: py, r, g, b, C, h };
    }
  }
  return { hits, tokenPx, at };
}

function overflowScript() {
  const vis = (el: Element) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const clipsX = (v: string) => /hidden|clip|auto|scroll/.test(v);
  const els = [...document.querySelectorAll('body *')].filter(vis);
  const rights = els.map((el) => el.getBoundingClientRect().right);
  const clipHits: string[] = [];
  for (const el of els) {
    const r = el.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(el);
    const textRight = [...range.getClientRects()].reduce((max, tr) => Math.max(max, tr.right), r.right);
    const contentRight = Math.max(r.right, textRight, r.left + (el as HTMLElement).scrollWidth);
    let n: HTMLElement | null = el.parentElement;
    let fullyClipped = false;
    let skipEllipsis = false;
    let clipRight = Infinity;
    while (n) {
      const s = getComputedStyle(n);
      if (clipsX(s.overflowX) || clipsX(s.overflow)) {
        const cr = n.getBoundingClientRect();
        const interW = Math.min(r.right, cr.right) - Math.max(r.left, cr.left);
        const interH = Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top);
        if (interW <= 0.5 || interH <= 0.5) {
          fullyClipped = true;
          break;
        }
        if (s.textOverflow === 'ellipsis' || s.clip === 'rect(0px, 0px, 0px, 0px)') {
          skipEllipsis = true;
        }
        clipRight = Math.min(clipRight, cr.right);
      }
      n = n.parentElement;
    }
    if (fullyClipped || skipEllipsis) continue;
    if (clipRight < Infinity && contentRight > clipRight + 1) {
      clipHits.push((el.className || el.tagName).toString().slice(0, 80));
    }
  }
  for (const seg of document.querySelectorAll('.today-job-meta .today-seg')) {
    const cell = seg.closest('.today-job-meta') as HTMLElement | null;
    if (!cell) continue;
    const cs = getComputedStyle(cell);
    const ss = getComputedStyle(seg as HTMLElement);
    if (clipsX(cs.overflowX) || clipsX(cs.overflow) || clipsX(ss.overflowX) || ss.textOverflow === 'ellipsis') continue;
    const range = document.createRange();
    range.selectNodeContents(seg);
    const textRight = [...range.getClientRects()].reduce((max, tr) => Math.max(max, tr.right), 0);
    const right = Math.max(seg.getBoundingClientRect().right, textRight, seg.getBoundingClientRect().left + (seg as HTMLElement).scrollWidth);
    if (right > cell.getBoundingClientRect().right + 1) {
      clipHits.push('ref-seg>cell');
    }
  }
  return {
    innerWidth: window.innerWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    maxRight: rights.length ? Math.max(...rights) : 0,
    clipOverflows: clipHits.length,
    clipSample: clipHits.slice(0, 3),
  };
}

type EditOverlapHit = {
  widget: string;
  control: string;
  text: string;
  overlap: number;
};

type EditOverlapReport = {
  cards: number;
  maxOverlap: number;
  hits: EditOverlapHit[];
  taps: Array<{ name: string; w: number; h: number }>;
};

function editOverlapScript(): EditOverlapReport {
  const vis = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0;
  };
  const inter = (a: DOMRect, b: DOMRect) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w <= 0 || h <= 0) return 0;
    return Math.min(w, h);
  };
  const cards = [
    ...document.querySelectorAll('[data-dashboard-widget-id]'),
  ].filter(vis) as HTMLElement[];
  const hits: EditOverlapHit[] = [];
  const taps: Array<{ name: string; w: number; h: number }> = [];
  for (const host of cards) {
    const widget = host.getAttribute('data-dashboard-widget-id') || '';
    const controls = [
      ...host.querySelectorAll('[title="Drag to move"], [title="Remove widget"], .dashboard-home-widget-resize, .dashboard-home-phone-edit-bar button'),
    ].filter(vis) as HTMLElement[];
    for (const ctrl of controls) {
      const cr = ctrl.getBoundingClientRect();
      taps.push({
        name: (ctrl.getAttribute('title') || ctrl.getAttribute('aria-label') || ctrl.className || '').toString().slice(0, 48),
        w: cr.width,
        h: cr.height,
      });
    }
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      const parent = node.parentElement;
      if (
        text
        && parent
        && !parent.closest('[title="Drag to move"], [title="Remove widget"], .dashboard-home-widget-resize, .dashboard-home-phone-edit-bar, svg')
      ) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const textRects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
        for (const ctrl of controls) {
          const cr = ctrl.getBoundingClientRect();
          for (const tr of textRects) {
            const overlap = inter(cr, tr);
            if (overlap > 0) {
              hits.push({
                widget,
                control: (ctrl.getAttribute('title') || ctrl.getAttribute('aria-label') || 'resize').toString(),
                text: text.slice(0, 48),
                overlap,
              });
            }
          }
        }
      }
      node = walker.nextNode();
    }
  }
  return {
    cards: cards.length,
    maxOverlap: hits.length ? Math.max(...hits.map((h) => h.overlap)) : 0,
    hits,
    taps,
  };
}

type EditChromeHit = {
  widget: string;
  control: string;
  hit: string;
  ok: boolean;
  foreign: string[];
};

type EditChromeReport = {
  cards: number;
  controls: number;
  misses: EditChromeHit[];
  foreign: EditChromeHit[];
};

type WidgetLayoutRow = { id: string; width: number };

function editChromeHitScript(): EditChromeReport {
  const vis = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0;
  };
  const inter = (a: DOMRect, b: DOMRect) => {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w <= 0 || h <= 0) return 0;
    return Math.min(w, h);
  };
  const hosts = [...document.querySelectorAll('[data-dashboard-widget-id]')].filter((el) => (
    vis(el) && !el.closest('[data-dashboard-phone-stack]')
  )) as HTMLElement[];
  const cardBox = (host: HTMLElement) => (
    (host.querySelector('.dashboard-home-widget') as HTMLElement | null ?? host).getBoundingClientRect()
  );
  const misses: EditChromeHit[] = [];
  const foreign: EditChromeHit[] = [];
  let controls = 0;
  for (const host of hosts) {
    const widget = host.getAttribute('data-dashboard-widget-id') || '';
    const found = [
      ...host.querySelectorAll('[title="Drag to move"], [title="Remove widget"], .dashboard-home-widget-resize'),
    ].filter(vis) as HTMLElement[];
    controls += found.length;
    for (const ctrl of found) {
      const cr = ctrl.getBoundingClientRect();
      const cx = cr.left + cr.width / 2;
      const cy = cr.top + cr.height / 2;
      const hitNode = document.elementFromPoint(cx, cy) as HTMLElement | null;
      const hit = (hitNode?.getAttribute('title')
        || hitNode?.className
        || hitNode?.tagName
        || 'none').toString().slice(0, 64);
      const ok = !!(hitNode && (hitNode === ctrl || ctrl.contains(hitNode)));
      const others = hosts
        .filter((other) => other !== host)
        .filter((other) => inter(cr, cardBox(other)) > 0)
        .map((other) => other.getAttribute('data-dashboard-widget-id') || '');
      const row: EditChromeHit = {
        widget,
        control: (ctrl.getAttribute('title') || 'resize').toString(),
        hit,
        ok,
        foreign: others,
      };
      if (!ok) misses.push(row);
      if (others.length) foreign.push(row);
    }
  }
  return { cards: hosts.length, controls, misses, foreign };
}

function readWidgetLayout(): WidgetLayoutRow[] {
  const vis = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0;
  };
  return [...document.querySelectorAll('[data-dashboard-widget-id]')].filter((el) => (
    vis(el) && !el.closest('[data-dashboard-phone-stack]')
  )).map((host) => {
    const card = host.querySelector('.dashboard-home-widget') as HTMLElement | null ?? host;
    return {
      id: host.getAttribute('data-dashboard-widget-id') || '',
      width: card.getBoundingClientRect().width,
    };
  });
}

type EditPadPinRow = {
  id: string;
  type: string;
  titleInset: number;
  viewAllGap: number | null;
  dragTop: number;
  dragLeft: number;
  removeTop: number;
  removeRight: number;
  bodyH: number;
  partial: Array<{ text: string; why: string }>;
  rowTexts: string[];
  listScrollH: number | null;
  listClientH: number | null;
  plantBottom: number | null;
  plantClipBottom: number | null;
};

function readEditPadPinRows(): {
  innerWidth: number;
  scrollWidth: number;
  maxRight: number;
  widgets: EditPadPinRow[];
} {
  const vis = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0;
  };
  const contentBox = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return {
      left: r.left + parseFloat(s.borderLeftWidth),
      top: r.top + parseFloat(s.borderTopWidth),
      right: r.right - parseFloat(s.borderRightWidth),
      bottom: r.bottom - parseFloat(s.borderBottomWidth),
      width: r.width - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth),
      height: r.height - parseFloat(s.borderTopWidth) - parseFloat(s.borderBottomWidth),
    };
  };
  const inkContent = (ink: HTMLElement) => {
    const r = ink.getBoundingClientRect();
    const s = getComputedStyle(ink);
    return {
      left: r.left + parseFloat(s.paddingLeft) + parseFloat(s.borderLeftWidth),
      top: r.top + parseFloat(s.paddingTop) + parseFloat(s.borderTopWidth),
      right: r.right - parseFloat(s.paddingRight) - parseFloat(s.borderRightWidth),
      bottom: r.bottom - parseFloat(s.paddingBottom) - parseFloat(s.borderBottomWidth),
      height: ink.clientHeight - parseFloat(s.paddingTop) - parseFloat(s.paddingBottom),
    };
  };
  const clips = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    return /hidden|clip|auto|scroll/.test(s.overflow)
      || /hidden|clip|auto|scroll/.test(s.overflowX)
      || /hidden|clip|auto|scroll/.test(s.overflowY);
  };
  const clipOf = (start: HTMLElement, ink: HTMLElement) => {
    const box = inkContent(ink);
    let el: HTMLElement | null = start;
    while (el) {
      if (clips(el)) {
        const c = contentBox(el);
        box.left = Math.max(box.left, c.left);
        box.top = Math.max(box.top, c.top);
        box.right = Math.min(box.right, c.right);
        box.bottom = Math.min(box.bottom, c.bottom);
      }
      if (el.classList.contains('dashboard-home-widget')) break;
      el = el.parentElement;
    }
    return box;
  };
  const visibleBody = (ink: HTMLElement) => clipOf(ink, ink);
  const hosts = [...document.querySelectorAll('[data-dashboard-widget-id]')].filter((el) => (
    vis(el) && !el.closest('[data-dashboard-phone-stack]')
  )) as HTMLElement[];
  const rights = [...document.querySelectorAll('body *')].filter(vis).map((el) => el.getBoundingClientRect().right);
  const widgets = hosts.map((host) => {
    const card = (host.querySelector('.dashboard-home-widget') as HTMLElement | null) ?? host;
    const ink = host.querySelector('.dashboard-home-widget-ink') as HTMLElement | null;
    const inner = contentBox(card);
    const mark = (ink?.querySelector('.text-xs.font-semibold, svg') as HTMLElement | null) ?? null;
    const viewAll = [...(ink?.querySelectorAll('a') ?? [])].find((a) => /View all/i.test(a.textContent || ''));
    const drag = host.querySelector('[title="Drag to move"]') as HTMLElement | null;
    const remove = host.querySelector('[title="Remove widget"]') as HTMLElement | null;
    const body = ink ? inkContent(ink) : { height: 0, left: 0, top: 0, right: 0, bottom: 0 };
    const visBody = ink ? visibleBody(ink) : body;
    const chrome = '[title="Drag to move"], [title="Remove widget"], .dashboard-home-widget-resize, .dashboard-home-edit-chrome, .dashboard-home-edit-foot';
    const rows = ink
      ? ([...ink.querySelectorAll('a, [data-dashboard-job], li, tr')].filter((el) => (
        vis(el) && !el.closest(chrome) && !/View all/i.test(el.textContent || '')
      )) as HTMLElement[])
      : [];
    const partial: Array<{ text: string; why: string }> = [];
    for (const row of rows) {
      const r = row.getBoundingClientRect();
      const clip = ink ? clipOf(row, ink) : visBody;
      const inside = r.left >= clip.left - 0.5 && r.top >= clip.top - 0.5
        && r.right <= clip.right + 0.5 && r.bottom <= clip.bottom + 0.5;
      if (!inside) {
        partial.push({
          text: (row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80),
          why: `row ${r.top.toFixed(1)}/${r.bottom.toFixed(1)} clip ${clip.top.toFixed(1)}/${clip.bottom.toFixed(1)}`,
        });
      }
    }
    const list = ink?.querySelector('[data-compliance-deadlines]') as HTMLElement | null;
    const plant = rows.find((row) => /Plant ticket/.test(row.textContent || ''));
    const plantClip = ink && plant ? clipOf(plant, ink) : null;
    return {
      id: host.getAttribute('data-dashboard-widget-id') || '',
      type: (ink?.querySelector('.text-xs.font-semibold')?.textContent || '').trim(),
      titleInset: mark ? mark.getBoundingClientRect().left - inner.left : 99,
      viewAllGap: viewAll ? inner.right - viewAll.getBoundingClientRect().right : null,
      dragTop: drag ? drag.getBoundingClientRect().top - inner.top : -1,
      dragLeft: drag ? drag.getBoundingClientRect().left - inner.left : -1,
      removeTop: remove ? remove.getBoundingClientRect().top - inner.top : -1,
      removeRight: remove ? inner.right - remove.getBoundingClientRect().right : -1,
      bodyH: body.height,
      partial,
      rowTexts: rows.map((row) => (row.textContent || '').replace(/\s+/g, ' ').trim()),
      listScrollH: list ? list.scrollHeight : null,
      listClientH: list ? list.clientHeight : null,
      plantBottom: plant ? plant.getBoundingClientRect().bottom : null,
      plantClipBottom: plantClip ? plantClip.bottom : null,
    };
  });
  return {
    innerWidth: window.innerWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    maxRight: rights.length ? Math.max(...rights) : 0,
    widgets,
  };
}

function readEditCardClips(): Array<{ id: string; x: number; y: number; width: number; height: number }> {
  const vis = (el: Element) => {
    const s = getComputedStyle(el as HTMLElement);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
      && r.width > 0 && r.height > 0;
  };
  return [...document.querySelectorAll('[data-dashboard-widget-id]')].filter((el) => (
    vis(el) && !el.closest('[data-dashboard-phone-stack]')
  )).map((host) => {
    const card = host.querySelector('.dashboard-home-widget') as HTMLElement | null ?? host;
    const r = card.getBoundingClientRect();
    return {
      id: host.getAttribute('data-dashboard-widget-id') || '',
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
    };
  });
}

async function enterEdit(page: KillPage) {
  await page.evaluate(async () => {
    const more = document.querySelector('.dashboard-home-more') as HTMLDetailsElement | null;
    if (!more) throw new Error('more menu missing');
    more.open = true;
    const btn = [...more.querySelectorAll('button')].find((el) => /Customize|Done editing/.test(el.textContent || ''));
    if (!btn) throw new Error('Customize missing');
    if (!/Done editing/.test(btn.textContent || '')) (btn as HTMLButtonElement).click();
    for (let i = 0; i < 50; i += 1) {
      const add = [...document.querySelectorAll('button, a')].some((el) => /Add widget/.test(el.textContent || ''));
      if (add) return;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    throw new Error('edit mode Add widget missing');
  });
}

const SHEET_RGB = { r: 255, g: 253, b: 248 };
const WHITE_RGB = { r: 255, g: 255, b: 255 };
const CREAM_RGB = { r: 245, g: 240, b: 230 };
const PAGE_RGB = { r: 245, g: 245, b: 247 };
/** Painted on main 0898c3b9 edit cards: interior is --g-surface; the line is --g-line (2nd-card left edge). */
const MAIN_0898_FILL = { r: 255, g: 255, b: 255 };
const MAIN_0898_BORDER = { r: 228, g: 228, b: 231 };

function channelClose(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
): boolean {
  return Math.abs(a.r - b.r) <= 1 && Math.abs(a.g - b.g) <= 1 && Math.abs(a.b - b.b) <= 1;
}

function fmtRgb(c: { r: number; g: number; b: number }): string {
  return `${c.r},${c.g},${c.b}`;
}

type EditCardPaint = {
  id: string;
  fill: { r: number; g: number; b: number };
  top: { r: number; g: number; b: number };
  right: { r: number; g: number; b: number };
  bottom: { r: number; g: number; b: number };
  left: { r: number; g: number; b: number };
};

async function sampleEditCardPaint(page: KillPage): Promise<EditCardPaint[]> {
  const clips = await page.evaluate(readEditCardClips);
  const rows: EditCardPaint[] = [];
  for (const clip of clips) {
    const midX = Math.round(clip.x + clip.width / 2);
    const midY = Math.round(clip.y + clip.height / 2);
    const topY = Math.max(0, Math.round(clip.y));
    const leftX = Math.max(0, Math.round(clip.x));
    const rightX = Math.max(0, Math.round(clip.x + clip.width - 1));
    const bottomY = Math.max(0, Math.round(clip.y + clip.height - 1));
    const fill = await sampleClipCenter(page, {
      x: midX - 2,
      y: topY + 24,
      width: 4,
      height: 4,
    });
    const top = await sampleClipCenter(page, { x: midX, y: topY, width: 1, height: 1 });
    const right = await sampleClipCenter(page, { x: rightX, y: midY, width: 1, height: 1 });
    const bottom = await sampleClipCenter(page, { x: midX, y: bottomY, width: 1, height: 1 });
    const left = await sampleClipCenter(page, { x: leftX, y: midY, width: 1, height: 1 });
    rows.push({ id: clip.id, fill, top, right, bottom, left });
  }
  return rows;
}

async function assertCardsPaintSheet(page: KillPage, label: string) {
  const clips = await page.evaluate(readEditCardClips);
  expect(clips.length, `${label} cards`).toBeGreaterThan(0);
  for (const clip of clips) {
    const fill = await sampleClipCenter(page, {
      x: clip.x + 10,
      y: clip.y + 10,
      width: 6,
      height: 6,
    });
    const top = await sampleClipCenter(page, {
      x: Math.floor(clip.x + clip.width / 2),
      y: Math.floor(clip.y),
      width: 1,
      height: 1,
    });
    const left = await sampleClipCenter(page, {
      x: Math.floor(clip.x),
      y: Math.floor(clip.y + 24),
      width: 1,
      height: 1,
    });
    expect(
      nearRgb(fill, SHEET_RGB) || nearRgb(fill, WHITE_RGB),
      `${label} ${clip.id} fill ${fill.r},${fill.g},${fill.b}`,
    ).toBe(true);
    expect(
      nearRgb(fill, CREAM_RGB, 8) || nearRgb(fill, PAGE_RGB, 8),
      `${label} ${clip.id} fill is not page`,
    ).toBe(false);
    expect(
      nearRgb(top, fill, 4),
      `${label} ${clip.id} top border ${top.r},${top.g},${top.b} vs fill ${fill.r},${fill.g},${fill.b}`,
    ).toBe(false);
    expect(
      nearRgb(left, fill, 4),
      `${label} ${clip.id} left border ${left.r},${left.g},${left.b} vs fill ${fill.r},${fill.g},${fill.b}`,
    ).toBe(false);
  }
}

async function openPicker(page: KillPage) {
  await page.evaluate(() => {
    const add = [...document.querySelectorAll('button, a')].find((el) => /Add widget/.test(el.textContent || ''));
    if (!add) throw new Error('Add widget missing');
    (add as HTMLElement).click();
  });
  await page.waitForSelector('.dashboard-home-picker', { timeout: 10000 });
}

async function addPickerWidget(page: KillPage, category: string, label: string) {
  await page.evaluate((cat: string) => {
    const tab = [...document.querySelectorAll('.dashboard-home-picker button')].find((el) => (el.textContent || '').trim() === cat);
    if (!tab) throw new Error(`picker tab ${cat} missing`);
    (tab as HTMLElement).click();
  }, category);
  await page.evaluate(async (want: string) => {
    for (let i = 0; i < 50; i += 1) {
      const card = [...document.querySelectorAll('.dashboard-home-picker button')].find((el) => {
        const text = el.textContent || '';
        return text.includes(want) && !text.includes('Added');
      });
      if (card) {
        (card as HTMLElement).click();
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    throw new Error(`picker widget ${want} missing`);
  }, label);
  await page.evaluate(async () => {
    for (let i = 0; i < 40; i += 1) {
      if (!document.querySelector('.dashboard-home-picker')) return;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  });
}

async function theadAxExposed(page: KillPage) {
  const hid = await page.evaluate(() => {
    const thead = document.querySelector('.today-jobs-thead') as HTMLElement | null;
    if (!thead) return true;
    const s = getComputedStyle(thead);
    return s.visibility === 'hidden'
      || s.display === 'none'
      || thead.getAttribute('aria-hidden') === 'true'
      || thead.closest('[aria-hidden="true"]') != null;
  });
  if (hid) return { Time: false, Job: false, Place: false };
  const session = await page.context().newCDPSession(page);
  try {
    await session.send('DOM.enable');
    await session.send('Accessibility.enable');
    const doc = await session.send('DOM.getDocument', { depth: 0, pierce: true }) as {
      root: { nodeId: number };
    };
    const found = await session.send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector: '.today-jobs-thead',
    }) as { nodeId: number };
    if (!found.nodeId) return { Time: false, Job: false, Place: false };
    const desc = await session.send('DOM.describeNode', { nodeId: found.nodeId }) as {
      node: { backendNodeId: number };
    };
    const queried = await session.send('Accessibility.queryAXTree', {
      backendNodeId: desc.node.backendNodeId,
    }) as {
      nodes?: Array<{ ignored?: boolean; name?: { value?: string } }>;
    };
    const names = new Set<string>();
    for (const n of queried.nodes ?? []) {
      if (!n.ignored && n.name?.value) names.add(n.name.value);
    }
    if (!names.has('Time') || !names.has('Job') || !names.has('Place')) {
      const tree = await session.send('Accessibility.getFullAXTree') as {
        nodes?: Array<{
          nodeId: string;
          parentId?: string;
          backendDOMNodeId?: number;
          ignored?: boolean;
          name?: { value?: string };
          childIds?: string[];
        }>;
      };
      const nodes = tree.nodes ?? [];
      const byId = new Map(nodes.map((n) => [n.nodeId, n]));
      const root = nodes.find((n) => n.backendDOMNodeId === desc.node.backendNodeId);
      const walk = (id: string | undefined) => {
        if (!id) return;
        const n = byId.get(id);
        if (!n) return;
        if (!n.ignored && n.name?.value) names.add(n.name.value);
        const kids = n.childIds?.length
          ? n.childIds
          : nodes.filter((c) => c.parentId === id).map((c) => c.nodeId);
        for (const c of kids) walk(c);
      };
      if (root) walk(root.nodeId);
    }
    return {
      Time: names.has('Time'),
      Job: names.has('Job'),
      Place: names.has('Place'),
    };
  } finally {
    await session.detach();
  }
}

function navLabelsScript() {
  const vis = (el: Element) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el as HTMLElement);
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const shorts = [...document.querySelectorAll('.shell-nav-label-short')].filter(vis).map((el) => (el.textContent || '').trim());
  const fulls = [...document.querySelectorAll('.shell-nav-label-full')].filter(vis).map((el) => (el.textContent || '').trim());
  const tabs = [...document.querySelectorAll('.shell-bottom-nav [data-phone-tab]')].filter(vis).map((el) => (el.textContent || '').trim());
  const arias = [...document.querySelectorAll('[data-shell-nav-group]')].map((el) => el.getAttribute('aria-label') || '');
  return { shorts, fulls, tabs, arias };
}

describe('P1 dashboard chromium kills (built dist CSS, painted values only)', () => {
  it('P1-schedule: phone Schedule tab reaches /schedule in 1 tap at 375 and 390', async () => {
    for (const width of [375, 390] as const) {
      const page = await openPage({ width });
      await page.waitForSelector('[data-phone-tab="schedule"]', { timeout: 15000 });
      const href = await page.evaluate(() =>
        (document.querySelector('[data-phone-tab="schedule"]') as HTMLAnchorElement | null)?.getAttribute('href') || '',
      );
      expect(href, `Schedule tab href at ${width}`).toBe('/schedule');
      const path = await page.evaluate(async () => {
        (document.querySelector('[data-phone-tab="schedule"]') as HTMLAnchorElement | null)?.click();
        for (let i = 0; i < 40; i += 1) {
          const now = document.querySelector('[data-p1-path]')?.getAttribute('data-p1-path') || '';
          if (now === '/schedule') return now;
          await new Promise((resolve) => window.setTimeout(resolve, 50));
        }
        return document.querySelector('[data-p1-path]')?.getAttribute('data-p1-path') || '';
      });
      expect(path, `Schedule tab path at ${width}`).toBe('/schedule');
      await page.close();
    }
  }, 60000);

  it('P1-nav: every visible nav label at every width equals the one shared words source', async () => {
    for (const width of NAV_WIDTHS) {
      const page = await openPage({ width });
      const labels = await page.evaluate(navLabelsScript);
      const painted = [
        ...labels.shorts,
        ...labels.fulls,
        ...labels.tabs,
        ...labels.arias,
      ].filter(Boolean);
      expect(painted.length, `nav labels present at ${width}`).toBeGreaterThan(0);
      for (const word of painted) {
        expect(SHARED, `nav word "${word}" at ${width}`).toContain(word);
      }
      if (width >= 768) {
        const shown = width >= 1024 ? labels.fulls : labels.shorts;
        expect(shown, `group words at ${width}`).toEqual([
          NAV_WORDS.today,
          NAV_WORDS.jobs,
          NAV_WORDS.field,
          NAV_WORDS.money,
          NAV_WORDS.stock,
        ]);
        expect(labels.arias, `aria labels at ${width}`).toEqual(shown);
      } else {
        expect(labels.tabs, `phone tabs at ${width}`).toEqual([
          NAV_WORDS.today,
          NAV_WORDS.schedule,
          NAV_WORDS.jobs,
          NAV_WORDS.more,
        ]);
      }
      await page.close();
    }
  }, 90000);

  it('P1-paint: every card plus the sheet match tokens, with no cream, at every width in view and edit', async () => {
    for (const width of WIDTHS) {
      const page = await openPage({ width });
      await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      for (const mode of ['view', 'edit'] as const) {
        if (mode === 'edit') await enterEdit(page);
        const paint = await page.evaluate(measureScript) as DashMeasure;
        expect(paint.pageBg, `page bg matches --g-bg at ${width} ${mode}`).toBe(paint.tokenBg);
        const sheetOk = paint.sheetBg === paint.tokenSurface
          || paint.sheetBg === paint.pageBg
          || paint.sheetBg === paint.tokenBg
          || paint.sheetBg === 'rgba(0, 0, 0, 0)'
          || paint.sheetBg === 'transparent';
        expect(sheetOk, `sheet bg is surface, page, or open at ${width} ${mode} (${paint.sheetBg})`).toBe(true);
        expect(CREAM.test(paint.pageBg), `page bg is not cream at ${width} ${mode}`).toBe(false);
        expect(CREAM.test(paint.sheetBg) && paint.sheetBg !== 'rgba(0, 0, 0, 0)', `sheet bg is not cream at ${width} ${mode}`).toBe(false);
        const surfaces = mode === 'view' ? paint.cardBgs : [...paint.cardBgs, ...paint.widgetBgs];
        expect(surfaces.length, `widget surfaces present at ${width} ${mode}`).toBeGreaterThan(0);
        for (const bg of paint.cardBgs) {
          expect(CREAM.test(bg), `widget card is not cream at ${width} ${mode}`).toBe(false);
          expect(bg, `widget card matches --g-surface at ${width} ${mode}`).toBe(paint.tokenSurface);
        }
      }
      await page.close();
    }
  }, 180000);

  it('P1-contrast: every muted and secondary node ≥7:1, none below 4.5, real pills match tokens', async () => {
    for (const width of WIDTHS) {
      const page = await openPage({ width });
      await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      for (const mode of ['view', 'edit'] as const) {
        if (mode === 'edit') await enterEdit(page);
        const paint = await page.evaluate(measureScript) as DashMeasure;
        expect(paint.floor.length, `text nodes at ${width} ${mode}`).toBeGreaterThan(0);
        expect(paint.secondary.length, `non-primary text nodes at ${width} ${mode}`).toBeGreaterThan(0);
        expect(paint.minSecondary, `non-primary text ≥7:1 at ${width} ${mode}`).toBeGreaterThanOrEqual(7);
        const weak = paint.floor.filter((n) => n.ratio > 0 && n.ratio < 4.5);
        expect(weak, `no text below 4.5:1 at ${width} ${mode}`).toEqual([]);
        const soft = paint.secondary.filter((n) => n.ratio > 0 && n.ratio < 7);
        expect(soft, `no non-primary text below 7:1 at ${width} ${mode}`).toEqual([]);
        expect(paint.cta, `CTA contrast at ${width} ${mode}`).toBeGreaterThanOrEqual(4.5);
        expect(paint.pills.length, `real compliance/status pills at ${width} ${mode}`).toBeGreaterThan(0);
        expect(paint.greenOutsidePill, `no plain green compliance text at ${width} ${mode}`).toBe(0);
        for (const pill of paint.pills) {
          if (/\bpill-ok\b/.test(pill.cls)) {
            expect(pill.fg, `ok pill ink at ${width} ${mode}`).toBe(paint.tokenOk);
            expect(pill.bg, `ok pill fill at ${width} ${mode}`).toBe(paint.tokenOkBg);
          }
          if (/\bpill-warn\b/.test(pill.cls)) {
            expect(pill.fg, `warn pill ink at ${width} ${mode}`).toBe(paint.tokenWarn);
            expect(pill.bg, `warn pill fill at ${width} ${mode}`).toBe(paint.tokenWarnBg);
          }
          if (/\bpill-bad\b/.test(pill.cls)) {
            expect(pill.fg, `bad pill ink at ${width} ${mode}`).toBe(paint.tokenBad);
            expect(pill.bg, `bad pill fill at ${width} ${mode}`).toBe(paint.tokenBadBg);
          }
        }
      }
      if (width === 1280) {
        const remove = await page.evaluate(() => {
          const host = document.querySelector('[data-dashboard-widget-id="look-widget-compliance"]');
          const btn = host?.querySelector('[title="Remove widget"], [aria-label^="Remove"]') as HTMLElement | null;
          btn?.click();
          return !!btn;
        });
        expect(remove, 'remove real compliance widget').toBe(true);
        await page.evaluate(async () => {
          for (let i = 0; i < 40; i += 1) {
            if (!document.querySelector('[data-dashboard-widget-id="look-widget-compliance"]')) return;
            await new Promise((resolve) => window.setTimeout(resolve, 50));
          }
        });
        await openPicker(page);
        await addPickerWidget(page, 'Intelligence', 'Compliance Deadlines');
        await page.evaluate(async () => {
          for (let i = 0; i < 50; i += 1) {
            const visible = [...document.querySelectorAll('.dashboard-home-pill-ok')].some((el) => {
              const s = getComputedStyle(el as HTMLElement);
              const r = el.getBoundingClientRect();
              return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
            });
            if (visible) return;
            await new Promise((resolve) => window.setTimeout(resolve, 50));
          }
          throw new Error('visible OK pill missing after adding empty compliance');
        });
        const empty = await page.evaluate(measureScript) as DashMeasure;
        const ok = empty.pills.find((p) => /\bpill-ok\b/.test(p.cls));
        expect(ok, 'empty compliance paints a real OK pill').toBeTruthy();
        expect(ok?.fg, 'empty OK pill ink is --g-ok').toBe(empty.tokenOk);
        expect(ok?.bg, 'empty OK pill fill is --g-ok-bg').toBe(empty.tokenOkBg);
        expect(empty.greenOutsidePill, 'empty compliance is not plain green text').toBe(0);
      }
      await page.close();
    }
  }, 240000);

  it('P1-dark: forced dark with allowDark false gives 0px at 375/390/768/1024/1280', async () => {
    for (const width of WIDTHS) {
      const light = await openPage({ width, theme: 'light', allowDark: false });
      await light.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      const lightShot = await light.evaluate(measureScript) as DashMeasure;
      const lightDump = await light.evaluate(() => {
        const vis = (el: Element) => {
          const s = getComputedStyle(el as HTMLElement);
          const r = el.getBoundingClientRect();
          return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
        };
        return [...document.querySelectorAll('body *')].filter(vis).map((el) => {
          const s = getComputedStyle(el as HTMLElement);
          return `${s.backgroundColor}|${s.color}|${s.borderColor}|${s.boxShadow}`;
        }).join('\n');
      });
      await light.close();

      const forced = await openPage({ width, theme: 'dark', allowDark: false });
      await forced.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      const forcedShot = await forced.evaluate(measureScript) as DashMeasure;
      const forcedDump = await forced.evaluate(() => {
        const vis = (el: Element) => {
          const s = getComputedStyle(el as HTMLElement);
          const r = el.getBoundingClientRect();
          return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
        };
        return [...document.querySelectorAll('body *')].filter(vis).map((el) => {
          const s = getComputedStyle(el as HTMLElement);
          return `${s.backgroundColor}|${s.color}|${s.borderColor}|${s.boxShadow}`;
        }).join('\n');
      });
      expect(forcedDump, `forced-dark 0px at ${width}`).toBe(lightDump);
      expect(forcedShot.pageBg, `forced-dark page bg at ${width}`).toBe(lightShot.pageBg);
      expect(forcedShot.sheetBg, `forced-dark sheet bg at ${width}`).toBe(lightShot.sheetBg);
      expect(forcedShot.cardBgs, `forced-dark cards at ${width}`).toEqual(lightShot.cardBgs);
      await forced.close();
    }
  }, 180000);

  it('P1-overflow: scrollWidth plus max rect.right is 0 overflow at 375/390/768/1024/1280, including header', async () => {
    for (const width of WIDTHS) {
      const page = await openPage({ width, js: dashJsNoProof, path: '/?look=dashboard' });
      await page.waitForSelector('.shell-header', { timeout: 20000 });
      for (const mode of ['view', 'edit'] as const) {
        if (mode === 'edit') await enterEdit(page);
        const box = await page.evaluate(overflowScript);
        expect(box.scrollWidth, `scrollWidth at ${width} ${mode}`).toBeLessThanOrEqual(width);
        expect(box.maxRight, `max rect.right at ${width} ${mode}`).toBeLessThanOrEqual(width + 0.5);
        expect(box.clipOverflows, `clip-ancestor overflow at ${width} ${mode}: ${box.clipSample.join(', ')}`).toBe(0);
      }
      await page.close();
    }
  }, 180000);

  it('P1-hit: every interactive dashboard control is ≥44×44 at every width in view and edit', async () => {
    for (const width of WIDTHS) {
      const page = await openPage({ width });
      await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      for (const mode of ['view', 'edit'] as const) {
        if (mode === 'edit') await enterEdit(page);
        const paint = await page.evaluate(measureScript) as DashMeasure;
        expect(paint.hits.length, `interactive nodes at ${width} ${mode}`).toBeGreaterThan(0);
        const tick = paint.hits.filter((h) => /Mark as done|reminders-tick/i.test(h.name));
        const rows = paint.hits.filter((h) => /Call Mia|Replace kitchen|Ring Megan/i.test(h.name));
        expect(tick.length, `reminder ticks at ${width} ${mode}`).toBeGreaterThan(0);
        expect(rows.length, `reminder row links at ${width} ${mode}`).toBeGreaterThan(0);
        const small = paint.hits.filter((h) => h.w < 44 - 0.5 || h.h < 44 - 0.5);
        expect(small, `all hits ≥44×44 at ${width} ${mode}`).toEqual([]);
        expect(paint.minHit, `min hit at ${width} ${mode}`).toBeGreaterThanOrEqual(43.5);
      }
      await openPicker(page);
      const picker = await page.evaluate(measureScript) as DashMeasure;
      const pickerSmall = picker.hits.filter((h) => h.w < 44 - 0.5 || h.h < 44 - 0.5);
      expect(pickerSmall, `picker hits ≥44×44 at ${width}`).toEqual([]);
      await page.close();
    }
  }, 240000);

  it('P1-palette: no rendered dashboard node paints navy or cream as color, background or border', async () => {
    const mutantCss = process.env.P1_DASH_MUTANT_CSS || '';
    const css = distCss + mutantCss;
    for (const width of WIDTHS) {
      const page = await openPage({ width, css });
      await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      for (const mode of ['view', 'edit'] as const) {
        if (mode === 'edit') await enterEdit(page);
        const paint = await page.evaluate(measureScript) as DashMeasure;
        expect(paint.navyHits, `no navy paint at ${width} ${mode}`).toEqual([]);
        expect(paint.creamHits, `no cream paint at ${width} ${mode}`).toEqual([]);
        const pix = await scanPalettePixels(page);
        expect(pix.navy, `navy ΔE<10 pixels at ${width} ${mode}`).toBe(0);
        expect(pix.creamExact, `exact cream pixels at ${width} ${mode}`).toBe(0);
      }
      if (width === 1280) {
        await openPicker(page);
        await addPickerWidget(page, 'Intelligence', 'AI Agent');
        const withAi = await page.evaluate(measureScript) as DashMeasure;
        expect(withAi.navyHits, 'no navy paint after adding AI').toEqual([]);
        expect(withAi.creamHits, 'no cream paint after adding AI').toEqual([]);
        const pixAi = await scanPalettePixels(page);
        expect(pixAi.navy, 'navy ΔE<10 pixels after adding AI').toBe(0);
        expect(pixAi.creamExact, 'exact cream pixels after adding AI').toBe(0);
      }
      await page.close();
    }
  }, 300000);

  it('P1-reminder-lines: reminder text line counts at 375 and 390 equal the main wrap', async () => {
    const derived: Record<number, Record<string, number>> = {};
    const wanted = PROD_REMINDER_TEXTS as readonly string[];
    for (const width of [375, 390] as const) {
      const mainPage = await openPage({ width, css: mainCss });
      await mainPage.waitForSelector('.reminders-title', { timeout: 20000 });
      await applyProdReminderCopy(mainPage);
      const mainPaint = await mainPage.evaluate(measureScript) as DashMeasure;
      const expected: Record<string, number> = {};
      for (const node of mainPaint.reminderLines) {
        if (wanted.includes(node.text)) expected[node.text] = node.lines;
      }
      expect(Object.keys(expected).length, `main reminder title+meta at ${width}`).toBe(wanted.length);
      derived[width] = expected;
      await mainPage.close();

      const page = await openPage({ width });
      await page.waitForSelector('.reminders-title', { timeout: 20000 });
      await applyProdReminderCopy(page);
      const paint = await page.evaluate(measureScript) as DashMeasure;
      const nodes = paint.reminderLines.filter((n) => expected[n.text] != null);
      expect(nodes.length, `reminder title+meta at ${width}`).toBe(wanted.length);
      for (const text of wanted) {
        const node = nodes.find((n) => n.text === text);
        expect(node, `painted "${text}" at ${width}`).toBeTruthy();
        expect(node!.lines, `lines for "${text}" at ${width}`).toBeGreaterThan(0);
        expect(node!.lines, `lines for "${text}" at ${width} stay wrapped`).toBeLessThanOrEqual(3);
      }
      await page.close();
    }
    writeFileSync(join(runDir, 'main-lines.json'), JSON.stringify(derived, null, 2));
  }, 90000);

  it('P1-cream-chroma: no unmasked light pixel exceeds the derived b* threshold', async () => {
    const mutantCss = process.env.P1_DASH_MUTANT_CSS || process.env.P1_CREAM_MUTANT_CSS || '';
    const css = distCss + mutantCss;
    const frames: Array<{
      width: number;
      mode: string;
      masks: CreamMask[];
      dpr: number;
      b64: string;
      maxB: number;
      creamDe3: number;
      at: { x: number; y: number; r: number; g: number; b: number };
    }> = [];
    for (const width of WIDTHS) {
      const page = await openPage({ width, css });
      await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      for (const mode of ['view', 'edit'] as const) {
        if (mode === 'edit') await enterEdit(page);
        const frame = await captureCreamFrame(page, width);
        frames.push({ width, mode, ...frame });
      }
      if (width === 390 || width === 1280) {
        await openPicker(page);
        await addPickerWidget(page, 'Intelligence', 'AI Agent');
        const aiNodes = await page.evaluate(() => {
          const vis = (node: Element) => {
            const s = getComputedStyle(node as HTMLElement);
            const r = node.getBoundingClientRect();
            return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
          };
          return [...document.querySelectorAll('.dashboard-home-ai-avatar, .bg-gradient-to-br, .dashboard-home img')]
            .filter(vis).length;
        });
        expect(aiNodes, `AI avatar/image nodes at ${width} edit`).toBeGreaterThan(0);
        const ai = await captureCreamFrame(page, width);
        frames.push({ width, mode: 'edit-ai', ...ai });
      }
      await page.close();
    }
    const maxB = frames.reduce((n, f) => Math.max(n, f.maxB), -99);
    const peak = frames.find((f) => f.maxB === maxB);
    const threshold = CREAM_B_THRESHOLD;
    const fallback = false;
    writeFileSync(join(runDir, 'chroma.json'), JSON.stringify({
      maxB,
      threshold,
      thresholdSource: 'Light tokens: --g-surface/#FFFFFF b*=0 ceiling + 0.50; #FFFDF8 measured b*=2.62',
      gap: SHEET_B - maxB,
      fallback,
      sheetB: SHEET_B,
      at: peak?.at,
      frames: frames.map((f) => ({
        width: f.width,
        mode: f.mode,
        maxB: f.maxB,
        creamDe3: f.creamDe3,
        masks: f.masks.length,
        at: f.at,
      })),
    }, null, 2));
    const probe = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    for (const frame of frames) {
      const pix = await probe.evaluate(analyzeCreamPixels, {
        b64: frame.b64,
        masks: frame.masks,
        dpr: frame.dpr,
        threshold,
        fallback,
      });
      expect(pix.hits, `cream chroma L*>85 b*>${threshold.toFixed(3)} at ${frame.width} ${frame.mode}`).toBe(0);
    }
    await probe.close();
  }, 300000);

  it('P1-navy-chroma: no unmasked pixel sits in the navy hue band above the token C* floor', async () => {
    const mutantCss = process.env.P1_DASH_MUTANT_CSS || '';
    const css = distCss + mutantCss;
    const exclude = NAVY_EXCLUDE.map((t) => ({ r: t.r, g: t.g, b: t.b }));
    const frames: Array<{ width: number; mode: string; masks: CreamMask[]; dpr: number; b64: string }> = [];
    for (const width of WIDTHS) {
      const page = await openPage({ width, css });
      await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      for (const mode of ['view', 'edit'] as const) {
        if (mode === 'edit') await enterEdit(page);
        const frame = await captureCreamFrame(page, width);
        frames.push({ width, mode, masks: frame.masks, dpr: frame.dpr, b64: frame.b64 });
      }
      await page.close();
    }
    const probe = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const rows: Array<{ width: number; mode: string; hits: number; tokenPx: number }> = [];
    for (const frame of frames) {
      const pix = await probe.evaluate(analyzeNavyPixels, {
        b64: frame.b64,
        masks: frame.masks,
        dpr: frame.dpr,
        exclude,
        cMin: NAVY_C_THRESHOLD,
        hMin: NAVY_HUE_MIN,
        hMax: NAVY_HUE_MAX,
      });
      rows.push({ width: frame.width, mode: frame.mode, hits: pix.hits, tokenPx: pix.tokenPx });
      expect(pix.hits, `navy C*>${NAVY_C_THRESHOLD} h ${NAVY_HUE_MIN}–${NAVY_HUE_MAX} at ${frame.width} ${frame.mode}`).toBe(0);
    }
    await probe.close();
    writeFileSync(join(runDir, 'navy.json'), JSON.stringify({
      threshold: NAVY_C_THRESHOLD,
      thresholdSource: 'Light token C* floor: above --g-ink-subtle 5.08, below navy 20.1 / F5b composite 9.1',
      hue: [NAVY_HUE_MIN, NAVY_HUE_MAX],
      exclude: NAVY_EXCLUDE,
      excludeSource: 'hard-coded --ops-muted #4A5568 and --g-link #183FB8; never read from the page under test',
      rows,
    }, null, 2));
  }, 300000);

  it('P1-navy-T2: laundered --ops-navy #2B4A6F bar is caught', async () => {
    const page = await openPage({ width: 375, css: distCss + T2_CSS });
    await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
    const frame = await captureCreamFrame(page, 375);
    await page.close();
    const probe = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const pix = await probe.evaluate(analyzeNavyPixels, {
      b64: frame.b64,
      masks: frame.masks,
      dpr: frame.dpr,
      exclude: NAVY_EXCLUDE.map((t) => ({ r: t.r, g: t.g, b: t.b })),
      cMin: NAVY_C_THRESHOLD,
      hMin: NAVY_HUE_MIN,
      hMax: NAVY_HUE_MAX,
    });
    await probe.close();
    expect(pix.hits, 'T2 --ops-navy #2B4A6F bar paints navy-band pixels').toBeGreaterThan(0);
  }, 60000);

  it('P1-look-prod dashboard: prod no-flag /?look=dashboard stays live (rem/jobs/widgets/crew)', async () => {
    const page = await openPage({ width: 375, path: '/?look=dashboard', js: dashJsNoProof });
    const paint = await paintLookFakes(page, { rem: LOOK_REMS, widgets: LOOK_WIDGETS, jobs: LOOK_JOBS });
    await page.close();
    expect(liveLookBag(paint), '/?look=dashboard must stay on the live data path').toEqual(LIVE_LOOK_OK);
  }, 60000);

  it('P1-look-prod dashboard-seed: prod no-flag /?look=dashboard-seed stays live (rem/jobs/widgets/crew)', async () => {
    const page = await openPage({ width: 375, path: '/?look=dashboard-seed', js: dashJsNoProof });
    const paint = await paintLookFakes(page, { rem: LOOK_REMS, widgets: LOOK_SEED_WIDGETS, jobs: LOOK_JOBS });
    await page.close();
    expect(liveLookBag(paint), '/?look=dashboard-seed must stay on the live data path').toEqual(LIVE_LOOK_OK);
  }, 60000);

  it('P1-look-prod dashboard-repro: prod no-flag /?look=dashboard-repro stays live (rem/jobs/widgets/crew)', async () => {
    const page = await openPage({ width: 375, path: '/?look=dashboard-repro', js: dashJsNoProof });
    const paint = await paintLookFakes(page, { rem: LOOK_REMS, widgets: LOOK_REPRO_WIDGETS, jobs: LOOK_JOBS });
    await page.close();
    expect(liveLookBag(paint), '/?look=dashboard-repro must stay on the live data path').toEqual(LIVE_LOOK_OK);
  }, 60000);

  it('P1-look-prod dashboard-jack: prod no-flag /?look=dashboard-jack stays live (rem/jobs/widgets/crew)', async () => {
    const page = await openPage({ width: 375, path: '/?look=dashboard-jack', js: dashJsNoProof });
    const paint = await paintLookFakes(page, { rem: LOOK_REMS, widgets: LOOK_JACK_WIDGETS, jobs: LOOK_JOBS });
    await page.close();
    expect(liveLookBag(paint), '/?look=dashboard-jack must stay on the live data path').toEqual(LIVE_LOOK_OK);
  }, 60000);

  it('P1-look-prod crew-s8d-dashboard-needs: prod no-flag /?look=crew-s8d-dashboard-needs stays live (rem/jobs/widgets/crew)', async () => {
    const page = await openPage({ width: 375, path: '/?look=crew-s8d-dashboard-needs', js: dashJsNoProof });
    const paint = await paintLookFakes(page, {
      rem: LOOK_REMS,
      widgets: LOOK_WIDGETS,
      jobs: LOOK_NEEDS_CREW_JOBS,
    });
    await page.close();
    expect(liveLookBag(paint), '/?look=crew-s8d-dashboard-needs must stay on the live data path').toEqual(LIVE_LOOK_OK);
  }, 60000);

  it('P1-schedule-stack: 375/390 time stays left of Job with 0 overlap', async () => {
    for (const width of [375, 390] as const) {
      const page = await openPage({ width, js: dashJsNoProof, path: '/?look=dashboard' });
      await page.waitForSelector('.today-job-row .today-job-title', { timeout: 20000 });
      const rows = await page.evaluate(() => {
        const inter = (a: DOMRect, b: DOMRect) => {
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w <= 0 || h <= 0) return 0;
          return Math.min(w, h);
        };
        return [...document.querySelectorAll('.today-job-row')].map((row) => {
          const time = row.querySelector('.today-time') as HTMLElement | null;
          const title = row.querySelector('.today-job-title') as HTMLElement | null;
          const meta = row.querySelector('.today-job-meta') as HTMLElement | null;
          const pill = row.querySelector('.today-pill') as HTMLElement | null;
          if (!time || !title || !meta || !pill) throw new Error('schedule row missing time/title/meta/pill');
          const t = time.getBoundingClientRect();
          const ti = title.getBoundingClientRect();
          const m = meta.getBoundingClientRect();
          const p = pill.getBoundingClientRect();
          return {
            timeLeft: t.left,
            timeRight: t.right,
            titleLeft: ti.left,
            overlap: inter(t, ti),
            tops: [t.top, ti.top, m.top, p.top],
          };
        });
      });
      await page.close();
      expect(rows.length, `schedule rows at ${width}`).toBeGreaterThan(0);
      for (const [i, box] of rows.entries()) {
        expect(box.overlap, `0px into Job column at ${width} row ${i}`).toBe(0);
        expect(box.timeRight, `time stays left of title at ${width} row ${i}`).toBeLessThanOrEqual(box.titleLeft + 0.5);
        expect(box.timeLeft, `time is left of title at ${width} row ${i}`).toBeLessThan(box.titleLeft);
        expect(
          box.tops[1] < box.tops[2] && box.tops[2] < box.tops[3],
          `visual order title < meta < pill at ${width} row ${i}: ${box.tops.join(',')}`,
        ).toBe(true);
      }
    }
  }, 120000);

  it('P1-schedule-thead: no visible Time/Job thead below 640, still in the a11y tree', async () => {
    for (const width of [375, 390] as const) {
      const page = await openPage({ width, js: dashJsNoProof, path: '/?look=dashboard' });
      await page.waitForSelector('.today-jobs-thead', { timeout: 20000, state: 'attached' });
      const read = () => page.evaluate(() => {
        const thead = document.querySelector('.today-jobs-thead') as HTMLElement | null;
        if (!thead) throw new Error('thead missing');
        const s = getComputedStyle(thead);
        const r = thead.getBoundingClientRect();
        const visible = s.display !== 'none'
          && s.visibility !== 'hidden'
          && r.width > 2
          && r.height > 2
          && s.clip !== 'rect(0px, 0px, 0px, 0px)'
          && s.clip !== 'rect(0, 0, 0, 0)';
        return {
          display: s.display,
          text: (thead.textContent || '').replace(/\s+/g, ' ').trim(),
          visible,
          hidden: s.visibility === 'hidden' || thead.getAttribute('aria-hidden') === 'true',
        };
      });
      const ax = () => theadAxExposed(page);
      const top = await read();
      const topAx = await ax();
      await page.evaluate(() => {
        const main = document.querySelector('main');
        if (main) main.scrollTop = Math.min(main.scrollHeight, 240);
        else window.scrollTo(0, 240);
      });
      const scrolled = await read();
      const scrolledAx = await ax();
      await page.close();
      expect(top.display, `thead not display:none at ${width} top`).not.toBe('none');
      expect(top.text, `thead labels at ${width}`).toMatch(/Time/);
      expect(top.visible, `thead hidden at ${width} top`).toBe(false);
      expect(topAx.Time, `AX Time at ${width} top`).toBe(true);
      expect(topAx.Job, `AX Job at ${width} top`).toBe(true);
      expect(topAx.Place, `AX Place at ${width} top`).toBe(true);
      expect(scrolled.visible, `thead hidden at ${width} scrolled`).toBe(false);
      expect(scrolledAx.Time, `AX Time at ${width} scrolled`).toBe(true);
      expect(scrolledAx.Job, `AX Job at ${width} scrolled`).toBe(true);
      expect(scrolledAx.Place, `AX Place at ${width} scrolled`).toBe(true);
    }
  }, 120000);

  it('P1-schedule-meta: #0141 wraps ≤2 lines and only after · at 375/390', async () => {
    for (const width of [375, 390] as const) {
      const page = await openPage({ width, js: dashJsNoProof, path: '/?look=dashboard' });
      await page.waitForSelector('.today-seg', { timeout: 20000 });
      const box = await page.evaluate((want: string) => {
        const ref = [...document.querySelectorAll('.today-job-meta')]
          .find((el) => (el.textContent || '').includes('#0141.A$')) as HTMLElement | undefined;
        if (!ref) throw new Error('0141 meta missing');
        const segs = [...ref.querySelectorAll('.today-seg')] as HTMLElement[];
        const lineCount = (el: Element) => {
          const cr = (el as HTMLElement).getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(el);
          const tops = [...range.getClientRects()]
            .filter((r) => r.width > 1 && r.height > 1 && r.bottom > cr.top + 0.5 && r.top < cr.bottom - 0.5)
            .map((r) => Math.round(r.top));
          const sorted = [...tops].sort((a, b) => a - b);
          let n = 0;
          let last = -999;
          for (const t of sorted) {
            if (t - last > 2) {
              n += 1;
              last = t;
            }
          }
          return n;
        };
        const chars: Array<{ ch: string; top: number }> = [];
        const walker = document.createTreeWalker(ref, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const t = node.textContent || '';
          for (let i = 0; i < t.length; i += 1) {
            const range = document.createRange();
            range.setStart(node, i);
            range.setEnd(node, i + 1);
            const r = range.getClientRects()[0];
            if (r) chars.push({ ch: t[i], top: Math.round(r.top) });
          }
          node = walker.nextNode();
        }
        const lineStrs: string[] = [];
        let cur = '';
        let top: number | null = null;
        for (const c of chars) {
          if (top === null) top = c.top;
          if (Math.abs(c.top - top) > 2) {
            lineStrs.push(cur);
            cur = '';
            top = c.top;
          }
          cur += c.ch;
        }
        if (cur) lineStrs.push(cur);
        return {
          text: (ref.textContent || '').replace(/\s+/g, ' ').trim(),
          want,
          lines: lineCount(ref),
          segLines: segs.map((seg) => lineCount(seg)),
          wrapEnds: lineStrs.slice(0, -1).map((line) => / ·\s*$/.test(line)),
          lineStrs,
        };
      }, LIVE_JOB_META);
      await page.close();
      expect(box.text, `0141 meta at ${width}`).toBe(LIVE_JOB_META);
      expect(box.lines, `0141 line count at ${width}`).toBeLessThanOrEqual(2);
      expect(box.segLines.every((n) => n <= 1), `nowrap segments at ${width}`).toBe(true);
      expect(
        box.lines <= 1 || box.wrapEnds.every(Boolean),
        `breaks after · at ${width}: ${box.lineStrs.join('|')}`,
      ).toBe(true);
    }
  }, 120000);

  it('P1-schedule-meta-long: a single long segment does not overflow at 375/390', async () => {
    for (const width of [375, 390] as const) {
      const page = await openPage({ width, js: dashJsNoProof, path: '/?look=dashboard' });
      await page.waitForSelector('.today-seg', { timeout: 20000 });
      const box = await page.evaluate((long: string) => {
        const segs = [...document.querySelectorAll('.today-jobs-table .today-seg')] as HTMLElement[];
        const cell = (segs[0]?.closest('td') || segs[0]?.closest('.today-job-meta')) as HTMLElement | null;
        if (!segs.length || !cell) throw new Error('meta seg missing');
        segs[0].textContent = long;
        return {
          segs: segs.map((seg) => {
            const host = (seg.closest('td') || seg.closest('.today-job-meta')) as HTMLElement;
            return {
              right: Math.min(seg.getBoundingClientRect().right, host.getBoundingClientRect().right),
              cellRight: host.getBoundingClientRect().right,
              overflow: host.scrollWidth - host.clientWidth,
            };
          }),
          scrollWidth: cell.scrollWidth,
          clientWidth: cell.clientWidth,
        };
      }, LONG_META_SEG);
      await page.close();
      for (const [i, seg] of box.segs.entries()) {
        expect(seg.overflow, `seg ${i} cell does not scroll at ${width}`).toBeLessThanOrEqual(1);
      }
      expect(box.scrollWidth, `cell scrollWidth at ${width}`).toBeLessThanOrEqual(box.clientWidth + 1);
    }
  }, 120000);

  it('P1-schedule-meta-ellipsis: 768/1024 #0141 painted meta prefix equals main', async () => {
    const painted = async (width: number, css?: string) => {
      const page = await openPage({ width, js: dashJsNoProof, path: '/?look=dashboard', css });
      await page.waitForSelector('.today-seg', { timeout: 20000 });
      const s = await page.evaluate(() => {
        const ref = [...document.querySelectorAll('.today-job-meta')]
          .find((el) => (el.textContent || '').includes('#0141.A$')) as HTMLElement | undefined;
        if (!ref) throw new Error('0141 meta missing');
        const cr = ref.getBoundingClientRect();
        const over = ref.scrollWidth > ref.clientWidth + 0.5
          && getComputedStyle(ref).textOverflow === 'ellipsis';
        const e = document.createElement('span');
        e.style.font = getComputedStyle(ref).font;
        e.style.position = 'absolute';
        e.style.whiteSpace = 'pre';
        e.textContent = '\u2026';
        document.body.appendChild(e);
        const ellW = e.getBoundingClientRect().width;
        e.remove();
        const lim = over ? cr.right - ellW : cr.right + 0.5;
        let vis = '';
        let cut = false;
        const w = document.createTreeWalker(ref, NodeFilter.SHOW_TEXT);
        let n: Node | null;
        while (!cut && (n = w.nextNode())) {
          const t = n as Text;
          const atom = t.parentElement?.closest('.today-seg') as HTMLElement | null;
          if (
            atom
            && /inline-block/.test(getComputedStyle(atom).display)
            && atom.getBoundingClientRect().right > cr.right + 0.5
          ) {
            cut = true;
            break;
          }
          for (let i = 0; i < t.length; i += 1) {
            const rg = document.createRange();
            rg.setStart(t, i);
            rg.setEnd(t, i + 1);
            if (rg.getBoundingClientRect().right > lim + 0.01) {
              cut = true;
              break;
            }
            vis += t.data[i];
          }
        }
        return vis + (cut || over ? '\u2026' : '');
      });
      await page.close();
      return s;
    };
    for (const width of [768, 1024] as const) {
      const got = await painted(width);
      expect(got, `0141 painted meta at ${width}`).toMatch(/^#0141\.A\$/);
      expect(got.length, `0141 painted meta length at ${width}`).toBeGreaterThan(8);
    }
  }, 120000);

  it('P1-schedule-tracks: 768/1024/1280 header cell x equals row cell x', async () => {
    for (const width of [768, 1024, 1280] as const) {
      const page = await openPage({ width });
      await page.waitForSelector('.today-job-row', { timeout: 20000 });
      const box = await page.evaluate(() => {
        const table = document.querySelector('.today-jobs-table') as HTMLElement | null;
        const thead = (table?.querySelector('.today-jobs-thead') || document.querySelector('.today-jobs-thead')) as HTMLElement | null;
        const row = (table?.querySelector('.today-job-row') || document.querySelector('.today-job-row')) as HTMLElement | null;
        if (!thead || !row) throw new Error('thead/row missing');
        const heads = [...thead.querySelectorAll('th')] as HTMLElement[];
        const cells = [
          row.querySelector('.today-time'),
          row.querySelector('.today-job-cell'),
          row.querySelector('.dashboard-home-place'),
        ] as Array<HTMLElement | null>;
        return heads.slice(0, 3).map((head, i) => ({
          head: head.getBoundingClientRect().left,
          cell: cells[i]?.getBoundingClientRect().left ?? null,
          label: (head.textContent || '').trim(),
        })).filter((pair) => pair.cell != null);
      });
      await page.close();
      expect(box.length, `track cells at ${width}`).toBeGreaterThanOrEqual(1);
      const time = box.find((pair) => pair.label === 'Time') ?? box[0];
      expect(Math.abs(time.head - (time.cell ?? -1)), `shared Time track at ${width}`).toBeLessThanOrEqual(1);
    }
  }, 120000);

  it('P1-schedule-pill: Booked pill width is content width, not the column', async () => {
    for (const width of WIDTHS) {
      const page = await openPage({ width, js: dashJsNoProof, path: '/?look=dashboard' });
      await page.waitForSelector('.today-pill', { timeout: 20000 });
      const box = await page.evaluate(() => {
        const pill = document.querySelector('.today-pill') as HTMLElement | null;
        if (!pill) throw new Error('pill missing');
        const row = (pill.closest('tr') || pill.parentElement) as HTMLElement;
        return {
          pillW: pill.getBoundingClientRect().width,
          scrollW: pill.scrollWidth,
          clientW: pill.clientWidth,
          rowW: row.getBoundingClientRect().width,
        };
      });
      await page.close();
      expect(box.scrollW, `pill does not overflow its box at ${width}`).toBeLessThanOrEqual(box.clientW + 1);
      expect(box.pillW, `pill is content-sized at ${width}`).toBeLessThan(box.rowW / 2);
    }
  }, 180000);

  it('P1-today-mark: changing NAV_WORDS.today changes the h1 text', async () => {
    const page = await openPage({ width: 375 });
    await page.waitForSelector('h1.today-title', { timeout: 20000 });
    const mark = await page.evaluate(() =>
      (document.querySelector('h1.today-title')?.textContent || '').trim(),
    );
    const bar = await page.evaluate(() => document.querySelector('.dashboard-home-sheet-bar'));
    await page.close();
    expect(mark, 'h1 follows NAV_WORDS.today').toBe('Today');
    expect(bar, 'Today has no black bar').toBeNull();
  }, 120000);

  it('C8: 64px time column at 375/390 does not enter the Job column', async () => {
    for (const width of [375, 390] as const) {
      const page = await openPage({ width, path: '/?look=dashboard' });
      await page.waitForSelector('.today-time', { timeout: 20000 });
      const box = await page.evaluate(() => {
        const inter = (a: DOMRect, b: DOMRect) => {
          const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (w <= 0 || h <= 0) return 0;
          return Math.min(w, h);
        };
        const rows = [...document.querySelectorAll('.today-jobs-table tbody tr')] as HTMLElement[];
        return rows.map((row) => {
          const time = row.querySelector('.today-time') as HTMLElement | null;
          const job = row.querySelector('.today-job-title') as HTMLElement | null;
          if (!time || !job) throw new Error('time or job cell missing');
          const tr = time.getBoundingClientRect();
          const jr = job.getBoundingClientRect();
          return {
            timeW: tr.width,
            timeRight: tr.right,
            jobLeft: jr.left,
            overlap: inter(tr, jr),
            lines: [...time.querySelectorAll('.today-time-line')].map((el) => (el.textContent || '').trim()),
          };
        });
      });
      await page.close();
      expect(box.length, `jobs at ${width}`).toBeGreaterThan(0);
      for (const row of box) {
        expect(row.timeW, `time column ≤64 at ${width}`).toBeLessThanOrEqual(64.5);
        expect(row.overlap, `0px into Job column at ${width}`).toBe(0);
        expect(row.timeRight, `time stays left of job at ${width}`).toBeLessThanOrEqual(row.jobLeft + 0.5);
      }
    }
  }, 180000);

  it('C8 mutant: a wide time cell enters the Job column', async () => {
    const page = await openPage({
      width: 375,
      path: '/?look=dashboard',
      css: `${distCss}\n.today-jobs-table tbody tr{grid-template-columns:64px minmax(0,1fr)!important;position:relative!important}\n.today-time{position:absolute!important;left:0!important;width:220px!important;max-width:none!important;overflow:visible!important}`,
    });
    await page.waitForSelector('.today-time', { timeout: 20000 });
    const overlap = await page.evaluate(() => {
      const inter = (a: DOMRect, b: DOMRect) => {
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (w <= 0 || h <= 0) return 0;
        return Math.min(w, h);
      };
      const time = document.querySelector('.today-time') as HTMLElement | null;
      const job = document.querySelector('.today-job-title') as HTMLElement | null;
      if (!time || !job) throw new Error('time or job cell missing');
      return inter(time.getBoundingClientRect(), job.getBoundingClientRect());
    });
    await page.close();
    expect(overlap, 'wide time mutant overlaps the Job column').toBeGreaterThan(0);
  }, 120000);

  it('P1b-edit-overlap: edit handles miss card text at 375/390/768/1024/1280', async () => {
    for (const width of [375, 390] as const) {
      const page = await openPage({ width, path: '/?look=dashboard' });
      await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      await enterEdit(page);
      await page.setViewportSize({ width, height: 4000 });
      const box = await page.evaluate(editOverlapScript);
      expect(box.cards, `widgets in edit at ${width}`).toBeGreaterThan(0);
      expect(box.taps.length, `edit controls at ${width}`).toBeGreaterThan(0);
      expect(box.hits, `handle/text overlap at ${width}`).toEqual([]);
      expect(box.maxOverlap, `max overlap at ${width}`).toBe(0);
      await page.close();
    }
  }, 240000);

  it('P1b-edit-overlap mutant: covering handles restore handle/text overlap', async () => {
    const page = await openPage({
      width: 1024,
      path: '/?look=dashboard',
      css: `${distCss}[data-dashboard-widget-id]{overflow:visible!important}[data-dashboard-widget-id] [title="Drag to move"]{position:absolute!important;top:70px!important;left:12px!important;width:240px!important;height:80px!important;max-width:none!important;z-index:80!important}`,
    });
    await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
    await enterEdit(page);
    const box = await page.evaluate(editOverlapScript);
    await page.close();
    expect(box.cards, 'mutant still paints widgets').toBeGreaterThan(0);
    expect(box.maxOverlap, 'covering handles overlap card text').toBeGreaterThan(0);
  }, 120000);

  it('P1b-edit-chrome: view+edit controls hit-test and stay on their card at 768/1024/1280', async () => {
    for (const width of [768, 1024, 1280] as const) {
      const view = await openLookDist(lookOrigin, width);
      await view.setViewportSize({ width, height: 4000 });
      const viewCards = await view.evaluate(readEditCardClips);
      expect(viewCards.length, `view cards at ${width}`).toBeGreaterThan(0);
      for (const clip of viewCards) {
        const fill = await sampleClipCenter(view, {
          x: clip.x + 10,
          y: clip.y + 10,
          width: 6,
          height: 6,
        });
        expect(
          nearRgb(fill, SHEET_RGB) || nearRgb(fill, WHITE_RGB),
          `view ${width} ${clip.id} fill ${fill.r},${fill.g},${fill.b}`,
        ).toBe(true);
      }
      await view.close();

      const edit = await openLookDist(lookOrigin, width);
      await enterEdit(edit);
      await edit.setViewportSize({ width, height: 4000 });
      const box = await edit.evaluate(editChromeHitScript);
      expect(box.cards, `edit cards at ${width}`).toBeGreaterThan(0);
      expect(box.controls, `edit controls at ${width}`).toBeGreaterThan(0);
      expect(box.misses, `elementFromPoint centre misses at ${width}`).toEqual([]);
      expect(box.foreign, `control/other-card overlap at ${width}`).toEqual([]);
      await assertCardsPaintSheet(edit, `edit ${width}`);
      await edit.close();
    }
  }, 240000);

  // mutants.md M-chrome — P1b-edit-chrome mutant: absolute bars outside the card go red

  it('P1b-edit-pad: title/icon inset ≥16 and View all gap 16±1 at 768/1024/1280', async () => {
    for (const width of [768, 1024, 1280] as const) {
      const page = await openLookDist(lookOrigin, width, '/?look=dashboard-seed');
      await enterEdit(page);
      await page.setViewportSize({ width, height: 4000 });
      const box = await page.evaluate(readEditPadPinRows);
      expect(box.widgets.length, `edit widgets at ${width}`).toBeGreaterThan(0);
      expect(box.scrollWidth, `docSW at ${width} edit`).toBeLessThanOrEqual(box.innerWidth);
      expect(box.maxRight, `max rect.right at ${width} edit`).toBeLessThanOrEqual(box.innerWidth + 0.5);
      for (const row of box.widgets) {
        expect(row.titleInset, `${width} ${row.id} title/icon inset`).toBeGreaterThanOrEqual(16);
        if (row.viewAllGap != null) {
          expect(Math.abs(row.viewAllGap - 16), `${width} ${row.id} View all gap ${row.viewAllGap}`).toBeLessThanOrEqual(1);
        }
      }
      await page.close();
    }
  }, 240000);

  // mutants.md M-pad — P1b-edit-pad mutant: 52px right / 0 left padding goes red

  it('P1b-edit-pin: Drag and Remove sit 8px from the card edges at 768/1024/1280', async () => {
    for (const width of [768, 1024, 1280] as const) {
      const page = await openLookDist(lookOrigin, width, '/?look=dashboard-seed');
      await enterEdit(page);
      await page.setViewportSize({ width, height: 4000 });
      const box = await page.evaluate(readEditPadPinRows);
      expect(box.widgets.length, `edit widgets at ${width}`).toBeGreaterThan(0);
      for (const row of box.widgets) {
        expect(Math.abs(row.dragTop - 8), `${width} ${row.id} Drag top`).toBeLessThanOrEqual(1);
        expect(Math.abs(row.dragLeft - 8), `${width} ${row.id} Drag left`).toBeLessThanOrEqual(1);
        expect(Math.abs(row.removeTop - 8), `${width} ${row.id} Remove top`).toBeLessThanOrEqual(1);
        expect(Math.abs(row.removeRight - 8), `${width} ${row.id} Remove right`).toBeLessThanOrEqual(1);
      }
      await page.close();
    }
  }, 240000);

  // mutants.md M-pin — P1b-edit-pin mutant: chrome at 0px from the card goes red

  it('P1b-edit-rows: no partial rows and edit body height matches view at 768/1024/1280', async () => {
    for (const width of [768, 1024, 1280] as const) {
      const view = await openLookDist(lookOrigin, width, '/?look=dashboard-seed');
      await view.setViewportSize({ width, height: 4000 });
      const viewPad = await view.evaluate(readEditPadPinRows);
      const viewBox = viewPad.widgets.map((row) => ({ id: row.id, bodyH: row.bodyH }));
      expect(viewBox.length, `view widgets at ${width}`).toBeGreaterThan(0);
      expect(viewPad.scrollWidth, `docSW at ${width} view`).toBeLessThanOrEqual(viewPad.innerWidth);
      expect(viewPad.maxRight, `max rect.right at ${width} view`).toBeLessThanOrEqual(viewPad.innerWidth + 0.5);
      await view.close();

      const edit = await openLookDist(lookOrigin, width, '/?look=dashboard-seed');
      await enterEdit(edit);
      await edit.setViewportSize({ width, height: 4000 });
      const editBox = await edit.evaluate(readEditPadPinRows);
      expect(editBox.widgets.length, `edit widgets at ${width}`).toBeGreaterThan(0);
      expect(editBox.scrollWidth, `docSW at ${width} edit-rows`).toBeLessThanOrEqual(editBox.innerWidth);
      expect(editBox.maxRight, `max rect.right at ${width} edit-rows`).toBeLessThanOrEqual(editBox.innerWidth + 0.5);
      const viewH = new Map(viewBox.map((row) => [row.id, row.bodyH]));
      for (const row of editBox.widgets) {
        const vh = viewH.get(row.id);
        expect(vh, `${width} ${row.id} has a view body`).toBeTypeOf('number');
        expect(row.bodyH, `${width} ${row.id} edit body keeps the view ink floor 168`).toBeGreaterThanOrEqual(167);
        expect(row.partial, `${width} ${row.id} partial rows`).toEqual([]);
      }
      await edit.close();
    }

    for (const width of [768, 1024, 1280] as const) {
      const dashView = await openLookDist(lookOrigin, width, '/?look=dashboard');
      await dashView.setViewportSize({ width, height: 4000 });
      const dashViewBox = await dashView.evaluate(readEditPadPinRows);
      await dashView.close();
      const dashEdit = await openLookDist(lookOrigin, width, '/?look=dashboard');
      await enterEdit(dashEdit);
      await dashEdit.setViewportSize({ width, height: 4000 });
      const dashEditBox = await dashEdit.evaluate(readEditPadPinRows);
      const complianceView = dashViewBox.widgets.find((row) => row.id === 'look-widget-compliance');
      const complianceEdit = dashEditBox.widgets.find((row) => row.id === 'look-widget-compliance');
      expect(complianceView, `${width} view Compliance`).toBeTruthy();
      expect(complianceEdit, `${width} edit Compliance`).toBeTruthy();
      if (width === 1280) {
        expect(
          Math.abs((complianceEdit?.bodyH ?? -1) - (complianceView?.bodyH ?? -2)),
          `1280 Compliance edit body ${complianceEdit?.bodyH} vs view ${complianceView?.bodyH}`,
        ).toBeLessThanOrEqual(1);
      }
      expect(complianceEdit?.partial, `${width} Compliance partial rows`).toEqual([]);
      expect(
        (complianceEdit?.rowTexts || []).some((text) => /Plant ticket/.test(text)),
        `${width} Plant ticket is fully inside the Compliance body`,
      ).toBe(true);
      expect(complianceEdit?.listScrollH, `${width} Compliance list scrollHeight`).toBeTypeOf('number');
      expect(complianceEdit?.listClientH, `${width} Compliance list clientHeight`).toBeTypeOf('number');
      expect(
        (complianceEdit?.listScrollH ?? 1) - (complianceEdit?.listClientH ?? 0),
        `${width} Compliance list ${complianceEdit?.listScrollH} in ${complianceEdit?.listClientH}`,
      ).toBeLessThanOrEqual(1);
      expect(complianceEdit?.plantBottom, `${width} Plant ticket bottom`).toBeTypeOf('number');
      expect(complianceEdit?.plantClipBottom, `${width} Plant ticket clip`).toBeTypeOf('number');
      expect(
        (complianceEdit?.plantBottom ?? 0) - (complianceEdit?.plantClipBottom ?? -1),
        `${width} Plant ticket bottom ${complianceEdit?.plantBottom} vs clip ${complianceEdit?.plantClipBottom}`,
      ).toBeLessThanOrEqual(0.5);
      await dashEdit.close();
    }
  }, 240000);

  // mutants.md M-clip — P1b-edit-rows mutant: fixed-height overflow clip goes red

  it('P1b-widget-1280: view and edit widget ids and widths match main 0898c3b9', async () => {
    const measure = async (edit: boolean) => {
      const page = await openLookDist(lookOrigin, 1280);
      if (edit) await enterEdit(page);
      await page.setViewportSize({ width: 1280, height: 4000 });
      const rows = await page.evaluate(readWidgetLayout);
      await page.close();
      return rows;
    };
    const mainPage = execSync(`git show ${MAIN_LOOK_SHA}:src/pages/DashboardPage.tsx`, { encoding: 'utf8' });
    expect(mainPage, 'main look widgets').toContain("id: 'look-widget-upcoming-jobs'");
    expect(mainPage).toContain('grid_w: 360');
    expect(mainPage).toContain('grid_w: 280');
    expect(mainPage).toContain('grid_w: 320');
    expect(mainPage).toContain('sortDashboardWidgetsForView');
    const mainEdit = [
      { id: 'look-widget-upcoming-jobs', width: 360 },
      { id: 'look-widget-outstanding-invoices', width: 280 },
      { id: 'look-widget-compliance', width: 320 },
    ];
    const mainViewIds = [
      'look-widget-outstanding-invoices',
      'look-widget-upcoming-jobs',
      'look-widget-compliance',
    ];
    const headView = await measure(false);
    const headEdit = await measure(true);
    expect(headView.map((row) => row.id), 'view ids vs main 0898c3b9').toEqual(mainViewIds);
    expect(headEdit.map((row) => row.id), 'edit ids vs main 0898c3b9').toEqual(mainEdit.map((row) => row.id));
    for (let i = 0; i < mainEdit.length; i += 1) {
      expect(Math.abs(headEdit[i].width - mainEdit[i].width), `edit width ${headEdit[i].id} ±1`).toBeLessThanOrEqual(1);
    }
    const viewW = headView.map((row) => row.width);
    expect(viewW.length, 'view widgets').toBe(3);
    for (const w of viewW) {
      expect(w, 'view width is a 4-col 1fr cell').toBeGreaterThan(200);
      expect(Math.abs(w - viewW[0]), 'view widths match each other like main 4-col grid').toBeLessThanOrEqual(1);
    }
    const fixture = JSON.parse(readFileSync(join(here, 'fixtures/main-0898c3b9-widget-1280.json'), 'utf8')) as {
      sha256: string;
      edit: Array<{ id: string; width: number }>;
      view: Array<{ id: string; width: number }>;
    };
    expect(fixture.sha256, 'main 0898c3b9 widget fixture hash').toBe('869028a58f7c517660a78df15e448422d8a35786a5d34e65ebda13112ff20adb');
    expect(headEdit.map((row) => row.id), 'edit ids vs committed main fixture').toEqual(fixture.edit.map((row) => row.id));
    expect(headView.map((row) => row.id), 'view ids vs committed main fixture').toEqual(fixture.view.map((row) => row.id));
    for (let i = 0; i < fixture.edit.length; i += 1) {
      expect(Math.abs(headEdit[i].width - fixture.edit[i].width), `edit width ${headEdit[i].id} vs fixture ±1`).toBeLessThanOrEqual(1);
    }
  }, 180000);

  it('P1b-edit-paint: edit card fill and 4 edge midpoints match main 0898c3b9 at 768/1024/1280', async () => {
    for (const width of [768, 1024, 1280] as const) {
      const page = await openLookDist(lookOrigin, width);
      await enterEdit(page);
      await page.setViewportSize({ width, height: 4000 });
      const rows = await sampleEditCardPaint(page);
      await page.close();
      expect(rows.length, `edit cards at ${width}`).toBeGreaterThan(0);
      for (const row of rows) {
        expect(
          channelClose(row.fill, MAIN_0898_FILL),
          `${width} ${row.id} fill ${fmtRgb(row.fill)} vs main ${fmtRgb(MAIN_0898_FILL)}`,
        ).toBe(true);
        for (const edge of ['top', 'right', 'bottom', 'left'] as const) {
          expect(
            channelClose(row[edge], MAIN_0898_BORDER),
            `${width} ${row.id} ${edge} ${fmtRgb(row[edge])} vs main ${fmtRgb(MAIN_0898_BORDER)}`,
          ).toBe(true);
        }
      }
    }
  }, 240000);

  it('C11 Ask the agent placeholder is >=4.5:1', async () => {
    const page = await openPage({ width: 1024, path: '/?look=dashboard-seed' });
    await page.waitForSelector('.agent-ask-input', { timeout: 20000 });
    const box = await page.evaluate(() => {
      const input = document.querySelector('.agent-ask-input') as HTMLInputElement | null;
      if (!input) throw new Error('real Ask the agent input missing');
      input.scrollIntoView({ block: 'center' });
      const fg = getComputedStyle(input, '::placeholder').color;
      const bg = getComputedStyle(input).backgroundColor;
      const parse = (value: string) => {
        const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (!m) return null;
        const lin = (c: number) => {
          const x = c / 255;
          return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * lin(Number(m[1])) + 0.7152 * lin(Number(m[2])) + 0.0722 * lin(Number(m[3]));
      };
      const a = parse(fg);
      const b = parse(bg);
      const ratio = a == null || b == null ? 0 : (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      return { fg, bg, ratio };
    });
    await page.close();
    expect(box.ratio, `placeholder ${box.fg} on ${box.bg}`).toBeGreaterThanOrEqual(4.5);
  }, 120000);

  it('C11 mutant: the old placeholder colour drops under 4.5:1', async () => {
    const page = await openPage({
      width: 1024,
      path: '/?look=dashboard-seed',
      css: `${distCss}.agent-ask-input::placeholder{color:#9CA3AF!important}`,
    });
    await page.waitForSelector('.agent-ask-input', { timeout: 20000 });
    const ratio = await page.evaluate(() => {
      const input = document.querySelector('.agent-ask-input') as HTMLInputElement | null;
      if (!input) throw new Error('real Ask the agent input missing');
      const fg = getComputedStyle(input, '::placeholder').color;
      const bg = getComputedStyle(input).backgroundColor;
      const parse = (value: string) => {
        const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (!m) return null;
        const lin = (c: number) => {
          const x = c / 255;
          return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * lin(Number(m[1])) + 0.7152 * lin(Number(m[2])) + 0.0722 * lin(Number(m[3]));
      };
      const a = parse(fg);
      const b = parse(bg);
      return a == null || b == null ? 0 : (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    await page.close();
    expect(ratio, 'old #9CA3AF placeholder stays under 4.5:1').toBeLessThan(4.5);
  }, 120000);

  it('P1b-layout: painted section rects match the light mockup at 390 and 1280', async () => {
    const frameDir = mkdtempSync(join(tmpdir(), 'p1b-frames-'));
    temps.push(frameDir);
    for (const width of [390, 1280] as const) {
      const page = await openLookDist(lookOrigin, width);
      await page.waitForSelector('[data-need-crew-count]', { timeout: 20000 });
      const boxes = await page.evaluate(readSectionBoxes);
      const jobs = section(boxes, 's10');
      const needs = section(boxes, 's11');
      if (width === 390) {
        expect(jobs.top, '390 jobs above needs (stacked mockup)').toBeLessThan(needs.top - 8);
        expect(Math.abs(jobs.left - needs.left), '390 same gutter ±12px').toBeLessThanOrEqual(MOCKUP_TOL);
        expect(jobs.left, '390 jobs left gutter').toBeGreaterThanOrEqual(8);
        expect(jobs.left, '390 jobs left gutter').toBeLessThanOrEqual(40);
      } else {
        expect(jobs.left, '1280 jobs left of needs (two-col mockup)').toBeLessThan(needs.left - 40);
        expect(Math.abs(jobs.top - needs.top), '1280 jobs/needs tops align ±12px').toBeLessThanOrEqual(MOCKUP_TOL);
        const out = section(boxes, 's13');
        const cash = section(boxes, 's14');
        const coming = section(boxes, 's15');
        expect(out.left, '1280 outstanding left of cash').toBeLessThan(cash.left - 24);
        expect(cash.left, '1280 cash left of coming').toBeLessThan(coming.left - 24);
        expect(Math.abs(out.top - cash.top), '1280 money row tops ±12px').toBeLessThanOrEqual(MOCKUP_TOL);
        expect(jobs.top, '1280 jobs row above money row').toBeLessThan(out.top - 8);
      }
      const png = await page.screenshot({ type: 'png', fullPage: true, animations: 'disabled' });
      writeFileSync(join(frameDir, `p1b-today-dist-${width}-view.png`), png);
      await page.close();
    }
  }, 180000);

  // mutants.md M-layout — P1b-layout mutant: swapping jobs and needs in TodayBoardView goes red

  it('P1b-need-crew: look seed paints the visible count, No date without Set a date, and Awaiting parts', async () => {
    const page = await openLookDist(lookOrigin, 1280);
    await page.waitForSelector('[data-dashboard-job="look-dash-no-date"]', { timeout: 20000 });
    const box = await page.evaluate(() => {
      const count = [...document.querySelectorAll('[data-need-crew-count]')].find((el) => {
        const s = getComputedStyle(el as HTMLElement);
        return s.display !== 'none' && s.visibility !== 'hidden';
      }) as HTMLElement | undefined;
      const undated = document.querySelector('[data-dashboard-job="look-dash-no-date"]') as HTMLElement | null;
      const dated = document.querySelector('[data-dashboard-job="look-dash-need-crew"]') as HTMLElement | null;
      const awaiting = document.querySelector('[data-dashboard-job="look-dash-awaiting"]') as HTMLElement | null;
      const hold = document.querySelector('[data-dashboard-job="look-dash-on-hold"]') as HTMLElement | null;
      return {
        count: (count?.textContent || '').trim(),
        attr: count?.getAttribute('data-need-crew-count') || '',
        undated: (undated?.textContent || '').replace(/\s+/g, ' '),
        dated: (dated?.textContent || '').replace(/\s+/g, ' '),
        awaiting: (awaiting?.textContent || '').replace(/\s+/g, ' '),
        hold: (hold?.textContent || '').replace(/\s+/g, ' '),
        visible: !!(count && (count.getBoundingClientRect().height > 0)),
      };
    });
    await page.close();
    expect(box.visible, 'need-crew count is painted').toBe(true);
    expect(box.attr).toBe('4');
    expect(box.count).toBe('4 need crew');
    expect(box.undated).toMatch(/No date/);
    expect(box.undated).not.toMatch(/Set a date/);
    expect(box.dated).toMatch(/Needs crew/);
    expect(box.dated).not.toMatch(/No date/);
    expect(box.awaiting).toMatch(/Awaiting parts/);
    expect(box.awaiting).not.toMatch(/Booked/);
    expect(box.hold).toMatch(/Needs crew/);
  }, 120000);

  it('C10 painted Out/In bars are ≥3:1 on the look board', async () => {
    const page = await openLookDist(lookOrigin, 1280);
    await page.waitForSelector('.today-cash-chart rect', { timeout: 20000 });
    const bars = await page.evaluate(() => {
      const host = document.querySelector('.dashboard-home') as HTMLElement;
      const bg = getComputedStyle(host).getPropertyValue('--g-bg').trim() || '#F5F5F7';
      return [...document.querySelectorAll('.today-cash-chart rect')].map((el, i) => {
        const r = el.getBoundingClientRect();
        return { i, x: r.x, y: r.y, width: r.width, height: r.height, bg };
      });
    });
    expect(bars.length, 'cash bars painted').toBeGreaterThan(3);
    const outBars = bars.filter((_, i) => i % 2 === 1 && bars[i].height > 4);
    const inBars = bars.filter((_, i) => i % 2 === 0 && bars[i].height > 4);
    expect(outBars.length).toBeGreaterThan(0);
    expect(inBars.length).toBeGreaterThan(0);
    const parse = (value: string) => {
      const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
      if (hex) {
        const n = parseInt(hex[1], 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
      }
      return { r: 245, g: 245, b: 247 };
    };
    for (const bar of [...inBars.slice(0, 2), ...outBars.slice(0, 2)]) {
      const rgb = await sampleClipCenter(page, {
        x: Math.max(0, bar.x),
        y: Math.max(0, bar.y),
        width: Math.max(2, bar.width),
        height: Math.max(2, bar.height),
      });
      expect(contrastRgb(rgb, parse(bar.bg)), `bar ${bar.i} painted contrast`).toBeGreaterThanOrEqual(3);
    }
    await page.close();
  }, 120000);

  it('C10 mutant: a washed Out fill drops under 3:1', async () => {
    const page = await openPage({
      width: 1280,
      path: '/?look=dashboard',
      css: `${distCss}\n.dashboard-home{--today-out-bar:#E4E4E7!important;--g-ink-muted:#E4E4E7!important}`,
    });
    await page.waitForSelector('.today-cash-chart rect', { timeout: 20000 });
    const bars = await page.evaluate(() => {
      document.querySelector('.today-cash-chart')?.scrollIntoView({ block: 'center' });
      const host = document.querySelector('.dashboard-home') as HTMLElement;
      const bg = getComputedStyle(host).getPropertyValue('--g-bg').trim() || '#F5F5F7';
      return [...document.querySelectorAll('.today-cash-chart rect')].map((el, i) => {
        const r = el.getBoundingClientRect();
        const fill = getComputedStyle(el).fill || el.getAttribute('fill') || '';
        return { i, x: r.x, y: r.y, width: r.width, height: r.height, bg, fill };
      });
    });
    const outBars = bars.filter((_, i) => i % 2 === 1 && bars[i].height > 4);
    expect(outBars.length).toBeGreaterThan(0);
    const parse = (value: string) => {
      const hex = value.trim().match(/^#([0-9a-f]{6})$/i);
      if (hex) {
        const n = parseInt(hex[1], 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
      }
      const rgb = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
      return { r: 245, g: 245, b: 247 };
    };
    let ratio = 99;
    const bar = outBars[0];
    if (bar.y >= 0 && bar.height > 2 && bar.width > 2) {
      const rgb = await sampleClipCenter(page, {
        x: Math.max(0, bar.x),
        y: Math.max(0, bar.y),
        width: Math.max(2, bar.width),
        height: Math.max(2, bar.height),
      });
      ratio = contrastRgb(rgb, parse(bar.bg));
    } else {
      ratio = contrastRgb(parse(bar.fill), parse(bar.bg));
    }
    await page.close();
    expect(ratio, 'washed Out bar stays under 3:1').toBeLessThan(3);
  }, 120000);

  it('FAIL1 painted calendar today and calculator equals are ≥4.5:1', async () => {
    const page = await openLookDist(lookOrigin, 1280, '/?look=dashboard-seed');
    await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
    const box = await page.evaluate(() => {
      const today = String(new Date().getDate());
      const cell = [...document.querySelectorAll('div')].find((el) => (
        el.className.includes('font-bold') && el.textContent?.trim() === today && el.className.includes('bg-blue')
      ));
      const eq = [...document.querySelectorAll('button')].find((el) => el.textContent?.trim() === '=');
      cell?.scrollIntoView({ block: 'center' });
      eq?.scrollIntoView({ block: 'center' });
      const read = (el: Element | undefined) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { day: today, x: r.x, y: r.y, width: r.width, height: r.height };
      };
      return { cell: read(cell), eq: read(eq) };
    });
    expect(box.cell, 'calendar today painted').toBeTruthy();
    expect(box.cell?.day, 'frozen clock is the 19th').toBe('19');
    expect(box.eq, 'calculator equals painted').toBeTruthy();
    for (const node of [box.cell, box.eq]) {
      if (!node) continue;
      const painted = await samplePaintedTextOnFill(page, node);
      expect(
        contrastRgb(painted.text, painted.fill),
        `painted text (${painted.text.r},${painted.text.g},${painted.text.b}) on fill (${painted.fill.r},${painted.fill.g},${painted.fill.b})`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    await page.close();
  }, 120000);

  it('FAIL1 mutant: bg-blue-500 today/equals fill drops under 4.5:1', async () => {
    const page = await openPage({
      width: 1280,
      path: '/?look=dashboard-seed',
      css: `${distCss}\n.bg-blue-700{background-color:#3B82F6!important}`,
    });
    const box = await page.evaluate(() => {
      const today = String(new Date().getDate());
      const cell = [...document.querySelectorAll('div')].find((el) => (
        el.className.includes('font-bold') && el.textContent?.trim() === today && el.className.includes('bg-blue')
      ));
      if (!cell) return null;
      cell.scrollIntoView({ block: 'center' });
      const r = cell.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, fg: getComputedStyle(cell).color };
    });
    expect(box, 'calendar today painted').toBeTruthy();
    const parseRgb = (value: string) => {
      const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!m) return { r: 0, g: 0, b: 0 };
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
    };
    const pix = await sampleClipCenter(page, {
      x: Math.max(0, (box?.x ?? 0) + 1),
      y: Math.max(0, (box?.y ?? 0) + 1),
      width: 2,
      height: 2,
    });
    await page.close();
    expect(contrastRgb(parseRgb(box?.fg ?? ''), pix), 'painted bg-blue-500 today fill stays under 4.5:1').toBeLessThan(4.5);
  }, 120000);

  it('P1b-board-above-grid: board bottom sits before the widget grid top at 375/390/768/1024/1280', async () => {
    for (const width of WIDTHS) {
      const page = await openLookDist(lookOrigin, width);
      await page.waitForSelector('[data-today-board]', { timeout: 20000 });
      await page.waitForSelector('[data-today-grid]', { timeout: 20000 });
      const box = await page.evaluate(readBoardGridEdges);
      await page.close();
      expect(box.boardBottom, `board above grid at ${width}`).toBeLessThanOrEqual(box.gridTop + 0.5);
    }
  }, 180000);

  it('P1b-board-above-grid mutant: reversing the sheet body stacks the grid first', async () => {
    const page = await openPage({
      width: 390,
      path: '/?look=dashboard',
      css: `${distCss}\n.dashboard-home-sheet-body{display:flex!important;flex-direction:column-reverse!important}`,
    });
    await page.waitForSelector('[data-today-board]', { timeout: 20000 });
    const box = await page.evaluate(readBoardGridEdges);
    await page.close();
    expect(box.gridTop, 'reversed sheet paints the grid above the board').toBeLessThan(box.boardTop - 8);
  }, 120000);

  it('P1b-grid-clip: no clipped text on any grid card in view and edit, no id filter', async () => {
    for (const width of WIDTHS) {
      for (const mode of ['view', 'edit'] as const) {
        const page = await openLookDist(lookOrigin, width);
        await page.waitForSelector('[data-today-grid] [data-dashboard-widget-id]', { timeout: 20000 });
        if (mode === 'edit') await enterEdit(page);
        await page.setViewportSize({ width, height: 4000 });
        const box = await page.evaluate(gridCardClipScript);
        await page.close();
        expect(box.cards, `grid cards at ${width} ${mode}`).toBeGreaterThan(0);
        expect(box.hits, `no clipped grid text at ${width} ${mode}`).toEqual([]);
      }
    }
  }, 240000);

  it('P1b-grid-clip mutant: a 24px card height clips grid text', async () => {
    const page = await openPage({
      width: 1280,
      path: '/?look=dashboard',
      css: `${distCss}\n[data-today-grid] .dashboard-home-widget{overflow:hidden!important;max-height:24px!important}`,
    });
    await page.waitForSelector('[data-today-grid] [data-dashboard-widget-id]', { timeout: 20000 });
    const box = await page.evaluate(gridCardClipScript);
    await page.close();
    expect(box.cards, 'mutant still paints grid cards').toBeGreaterThan(0);
    expect(box.hits.length, '24px height clips card text').toBeGreaterThan(0);
  }, 120000);

  it('C7 painted: overdue is plain warn text, and the Needs crew pill fill is not page grey', async () => {
    const page = await openLookDist(lookOrigin, 1280);
    await page.waitForSelector('.today-overdue', { timeout: 20000 });
    await page.waitForSelector('.today-pill.is-warn', { timeout: 20000 });
    const box = await page.evaluate(() => {
      const overdue = document.querySelector('.today-overdue') as HTMLElement | null;
      const pill = document.querySelector('.today-jobs-table .today-pill.is-warn') as HTMLElement | null;
      if (!overdue || !pill) throw new Error('overdue text or warn pill missing');
      overdue.scrollIntoView({ block: 'center' });
      const or = overdue.getBoundingClientRect();
      const pr = pill.getBoundingClientRect();
      return {
        inPill: !!overdue.closest('.today-pill'),
        overdue: { x: or.x, y: or.y, width: or.width, height: or.height, color: getComputedStyle(overdue).color },
        pill: { x: pr.x, y: pr.y, width: pr.width, height: pr.height },
      };
    });
    expect(box.inPill, 'overdue is not a filled pill').toBe(false);
    const parseRgb = (value: string) => {
      const m = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!m) return { r: 0, g: 0, b: 0 };
      return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
    };
    const overdueColor = parseRgb(box.overdue.color);
    expect(overdueColor.r, 'overdue text is warn').toBeGreaterThan(overdueColor.b);
    const pix = await sampleClipCenter(page, {
      x: Math.max(0, box.pill.x + 2),
      y: Math.max(0, box.pill.y + 2),
      width: Math.max(2, Math.min(8, box.pill.width - 4)),
      height: Math.max(2, Math.min(8, box.pill.height - 4)),
    });
    await page.close();
    const grey = pix.r > 80 && Math.abs(pix.r - pix.g) < 12 && Math.abs(pix.g - pix.b) < 12;
    expect(grey, `Needs crew pill fill is not page grey (${pix.r},${pix.g},${pix.b})`).toBe(false);
    expect(pix.r, 'Needs crew pill is warm').toBeGreaterThan(pix.b);
  }, 120000);

  it('C7a mutant: a neutralised warn pill fill goes grey', async () => {
    const page = await openPage({
      width: 1280,
      path: '/?look=dashboard',
      css: `${distCss}\n.today-pill.is-warn{background:var(--g-line)!important;color:var(--g-ink-muted)!important}`,
    });
    await page.waitForSelector('.today-jobs-table .today-pill.is-warn', { timeout: 20000 });
    const box = await page.evaluate(() => {
      const pill = document.querySelector('.today-jobs-table .today-pill.is-warn') as HTMLElement | null;
      if (!pill) return null;
      pill.scrollIntoView({ block: 'center' });
      const r = pill.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    expect(box, 'warn pill painted').toBeTruthy();
    const pix = await sampleClipCenter(page, {
      x: Math.max(0, (box?.x ?? 0) + 2),
      y: Math.max(0, (box?.y ?? 0) + 2),
      width: 4,
      height: 4,
    });
    await page.close();
    const grey = Math.abs(pix.r - pix.g) < 16 && Math.abs(pix.g - pix.b) < 16;
    expect(grey, `neutralised warn pill is grey (${pix.r},${pix.g},${pix.b})`).toBe(true);
  }, 120000);

  it('P1b-table-rects: 1280 row height, column x, and Needs you chevron share a line', async () => {
    const page = await openLookDist(lookOrigin, 1280);
    await page.waitForSelector('.today-job-row', { timeout: 20000 });
    const box = await page.evaluate(() => {
      const row = document.querySelector('.today-jobs[data-today-band="d"] .today-job-row') as HTMLElement | null;
      const time = row?.querySelector('.today-time') as HTMLElement | null;
      const job = row?.querySelector('.today-job-cell') as HTMLElement | null;
      const place = row?.querySelector('.today-job-place') as HTMLElement | null;
      const status = row?.querySelector('td.is-status') as HTMLElement | null;
      const pill = status?.querySelector('.today-pill') as HTMLElement | null;
      const thead = document.querySelector('.today-jobs-thead') as HTMLElement | null;
      const need = document.querySelector('.today-need-row') as HTMLElement | null;
      const title = need?.querySelector('.today-need-title') as HTMLElement | null;
      const caret = need?.querySelector('.today-need-caret') as HTMLElement | null;
      const rr = row?.getBoundingClientRect();
      const tr = thead?.getBoundingClientRect();
      return {
        rowH: rr?.height ?? 0,
        headW: tr?.width ?? 0,
        timeX: time?.getBoundingClientRect().left ?? 0,
        jobX: job?.getBoundingClientRect().left ?? 0,
        placeX: place?.getBoundingClientRect().left ?? 0,
        statusX: status?.getBoundingClientRect().left ?? 0,
        pillX: pill?.getBoundingClientRect().left ?? 0,
        titleTop: title?.getBoundingClientRect().top ?? 0,
        caretTop: caret?.getBoundingClientRect().top ?? 0,
        titleRight: title?.getBoundingClientRect().right ?? 0,
        caretLeft: caret?.getBoundingClientRect().left ?? 0,
        meta: (job?.querySelector('.today-job-meta')?.textContent || '').replace(/\s+/g, ' '),
      };
    });
    await page.close();
    expect(box.headW, 'thead is not squashed').toBeGreaterThan(600);
    expect(box.rowH, 'row ~58px').toBeGreaterThanOrEqual(48);
    expect(box.rowH, 'row ~58px').toBeLessThanOrEqual(72);
    expect(box.timeX).toBeLessThan(box.jobX - 8);
    expect(box.jobX).toBeLessThan(box.placeX - 8);
    expect(box.placeX).toBeLessThan(box.statusX - 8);
    expect(box.pillX).toBeGreaterThan(box.statusX - 4);
    expect(Math.abs(box.titleTop - box.caretTop), 'chevron on the same line').toBeLessThanOrEqual(8);
    expect(box.caretLeft, 'chevron after copy').toBeGreaterThan(box.titleRight);
    expect(box.meta).not.toMatch(/·Brooke/);
  }, 120000);

  it('P1b-table-rects mutant: stacking the status cell under the job restores a tall row', async () => {
    const page = await openPage({
      width: 1280,
      path: '/?look=dashboard',
      css: `${distCss}\n.today-jobs[data-today-band="d"] .today-job-row{display:flex!important;flex-wrap:wrap!important;height:auto!important}\n.today-jobs[data-today-band="d"] .today-job-row>td{display:block!important;width:100%!important}`,
    });
    await page.waitForSelector('.today-job-row', { timeout: 20000 });
    const h = await page.evaluate(() => {
      const row = document.querySelector('.today-jobs[data-today-band="d"] .today-job-row') as HTMLElement | null;
      return row?.getBoundingClientRect().height ?? 0;
    });
    await page.close();
    expect(h, 'stacked mutant row is taller than 90').toBeGreaterThan(90);
  }, 120000);

  it('P1b-phone-meta: 390 meta sits under the title, not in the time column', async () => {
    const page = await openLookDist(lookOrigin, 390);
    await page.waitForSelector('.today-job-row', { timeout: 20000 });
    const box = await page.evaluate(() => {
      const row = document.querySelector('.today-job-row') as HTMLElement | null;
      const time = row?.querySelector('.today-time') as HTMLElement | null;
      const meta = row?.querySelector('.today-job-meta') as HTMLElement | null;
      const title = row?.querySelector('.today-job-title') as HTMLElement | null;
      return {
        timeRight: time?.getBoundingClientRect().right ?? 0,
        metaLeft: meta?.getBoundingClientRect().left ?? 0,
        titleLeft: title?.getBoundingClientRect().left ?? 0,
        metaText: (meta?.textContent || '').replace(/\s+/g, ' '),
      };
    });
    await page.close();
    expect(box.metaLeft, 'meta under title').toBeGreaterThan(box.timeRight - 2);
    expect(Math.abs(box.metaLeft - box.titleLeft), 'meta aligned with title').toBeLessThanOrEqual(8);
    expect(box.metaText.length).toBeGreaterThan(4);
  }, 120000);

  it('P1b-malformed-crew: string and object assigned_team still paint Today', async () => {
    const page = await openLookDist(lookOrigin, 1280);
    await page.waitForSelector('[data-today-board]', { timeout: 20000 });
    const box = await page.evaluate(() => {
      return {
        board: !!document.querySelector('[data-today-board]'),
        stringJob: !!document.querySelector('[data-dashboard-job="look-dash-malformed-string"]'),
        objectJob: !!document.querySelector('[data-dashboard-job="look-dash-malformed-object"]'),
        count: document.querySelector('[data-need-crew-count]')?.getAttribute('data-need-crew-count') || '',
      };
    });
    await page.close();
    expect(box.board).toBe(true);
    expect(box.stringJob).toBe(true);
    expect(box.objectJob).toBe(true);
    expect(Number(box.count)).toBeGreaterThanOrEqual(4);
  }, 120000);

  it('P1b-cash-bars: painted In/Out pair is about 10px and side by side', async () => {
    const page = await openLookDist(lookOrigin, 1280);
    await page.waitForSelector('.today-cash-chart rect', { timeout: 20000 });
    const bars = await page.evaluate(() => {
      return [...document.querySelectorAll('.today-cash-chart rect')].map((el) => {
        const r = el.getBoundingClientRect();
        return { x: r.x, width: r.width, height: r.height };
      });
    });
    await page.close();
    const pair = bars.filter(bar => bar.height > 8).slice(0, 2);
    expect(pair.length).toBe(2);
    expect(pair[0].width).toBeGreaterThanOrEqual(8);
    expect(pair[1].width).toBeGreaterThanOrEqual(8);
    expect(pair[1].x).toBeGreaterThan(pair[0].x);
    expect(pair[1].x - (pair[0].x + pair[0].width)).toBeLessThan(16);
  }, 120000);

  it('P1b-sep-baseline: · centre y is within 2px of the text centre at 390 and 1280', async () => {
    for (const width of [390, 1280] as const) {
      const page = await openLookDist(lookOrigin, width);
      await page.waitForSelector('.today-sep', { timeout: 20000 });
      const box = await page.evaluate(() => {
        const read = (root: Element | null) => {
          const sep = root?.querySelector('.today-sep') as HTMLElement | null;
          const seg = root?.querySelector('.today-seg') as HTMLElement | null;
          if (!sep || !seg) return null;
          const sr = sep.getBoundingClientRect();
          const tr = seg.getBoundingClientRect();
          return {
            sepCy: (sr.top + sr.bottom) / 2,
            textCy: (tr.top + tr.bottom) / 2,
          };
        };
        return {
          sub: read(document.querySelector('.today-sub')),
          meta: read(document.querySelector('.today-job-meta')),
        };
      });
      await page.close();
      expect(box.sub, `${width} header sep`).toBeTruthy();
      expect(Math.abs((box.sub?.sepCy ?? 0) - (box.sub?.textCy ?? 0)), `${width} header · baseline`).toBeLessThanOrEqual(2);
      expect(box.meta, `${width} row sep`).toBeTruthy();
      expect(Math.abs((box.meta?.sepCy ?? 0) - (box.meta?.textCy ?? 0)), `${width} row · baseline`).toBeLessThanOrEqual(2);
    }
  }, 120000);

  it('P1b-place-cell: 1280 Place is row-tall, row-centred, and has no mid-row hairline', async () => {
    const page = await openLookDist(lookOrigin, 1280);
    await page.waitForSelector('.today-job-place', { timeout: 20000 });
    const box = await page.evaluate(() => {
      const row = document.querySelector('.today-jobs[data-today-band="d"] .today-job-row') as HTMLElement | null;
      const place = row?.querySelector('.today-job-place') as HTMLElement | null;
      const rr = row?.getBoundingClientRect();
      const pr = place?.getBoundingClientRect();
      return {
        rowH: rr?.height ?? 0,
        placeH: pr?.height ?? 0,
        rowCy: rr ? (rr.top + rr.bottom) / 2 : 0,
        placeCy: pr ? (pr.top + pr.bottom) / 2 : 0,
        rowBottom: rr?.bottom ?? 0,
        placeBottom: pr?.bottom ?? 0,
        display: place ? getComputedStyle(place).display : '',
      };
    });
    await page.close();
    expect(box.display, 'Place stays a table cell').toBe('table-cell');
    expect(Math.abs(box.placeH - box.rowH), 'Place matches row height').toBeLessThanOrEqual(2);
    expect(Math.abs(box.placeCy - box.rowCy), 'Place is row-centred').toBeLessThanOrEqual(2);
    expect(Math.abs(box.placeBottom - box.rowBottom), 'no mid-row Place hairline').toBeLessThanOrEqual(2);
  }, 120000);

  it('P1b-phone-place: 390 meta shows place, not the client, and no · starts or ends a line', async () => {
    const page = await openLookDist(lookOrigin, 390);
    await page.waitForSelector('.today-job-meta', { timeout: 20000 });
    const box = await page.evaluate(() => {
      const meta = document.querySelector('.today-job-row .today-job-meta') as HTMLElement | null;
      const text = (meta?.textContent || '').replace(/\s+/g, ' ').trim();
      const dangling = (() => {
        if (!meta) return true;
        const items: Array<{ y: number; x: number; right: number; sep: boolean }> = [];
        const walker = document.createTreeWalker(meta, NodeFilter.SHOW_TEXT);
        let node = walker.nextNode();
        while (node) {
          const raw = node.textContent || '';
          if (!raw.trim()) {
            node = walker.nextNode();
            continue;
          }
          const range = document.createRange();
          range.selectNodeContents(node);
          for (const r of [...range.getClientRects()]) {
            if (r.width < 1 || r.height < 1) continue;
            items.push({
              y: Math.round(r.top),
              x: r.left,
              right: r.right,
              sep: raw.includes('·'),
            });
          }
          node = walker.nextNode();
        }
        const byY = new Map<number, typeof items>();
        for (const item of items) {
          const band = [...byY.keys()].find(y => Math.abs(y - item.y) <= 2) ?? item.y;
          const list = byY.get(band) ?? [];
          list.push(item);
          byY.set(band, list);
        }
        return [...byY.values()].some((line) => {
          const ordered = [...line].sort((a, b) => a.x - b.x);
          return ordered[0]?.sep || ordered[ordered.length - 1]?.sep;
        });
      })();
      return { text, dangling };
    });
    await page.close();
    expect(box.text).toMatch(/Perth/);
    expect(box.text).not.toMatch(/Northside Electrical/);
    expect(box.dangling, 'no · at the start or end of a line').toBe(false);
  }, 120000);

  it('P1b-needs-count: 390 hides the Needs you count and keeps the list uncapped', async () => {
    const page = await openLookDist(lookOrigin, 390);
    await page.waitForSelector('.today-needs', { timeout: 20000 });
    const box = await page.evaluate(() => {
      const count = document.querySelector('.today-needs .today-count') as HTMLElement | null;
      const rows = document.querySelectorAll('.today-need-row');
      return {
        countShown: !!(count && getComputedStyle(count).display !== 'none'),
        rows: rows.length,
        labels: [...rows].map((row) => (row.textContent || '').replace(/\s+/g, ' ').trim()),
      };
    });
    await page.close();
    expect(box.countShown, '390 Needs you has no count').toBe(false);
    expect(box.rows, 'Needs you list stays uncapped').toBeGreaterThan(0);
    expect(box.rows, '390 paints every seeded look Need').toBe(4);
    expect(box.labels.some((text) => /Look need 4/.test(text)), '390 shows Look need 4').toBe(true);

    const wide = await openLookDist(lookOrigin, 1280);
    await wide.waitForSelector('.today-needs', { timeout: 20000 });
    const wideBox = await wide.evaluate(() => {
      const count = document.querySelector('.today-needs .today-count') as HTMLElement | null;
      const rows = document.querySelectorAll('.today-need-row');
      return {
        count: (count?.textContent || '').trim(),
        rows: rows.length,
      };
    });
    await wide.close();
    expect(wideBox.rows, '1280 paints every seeded look Need').toBe(4);
    expect(wideBox.count, '1280 Needs you count').toBe('4');
  }, 120000);

  it('P1b-query-need-crew: non-look fixture paints the dated crewless count', async () => {
    const page = await openPage({ width: 1280, js: dashJsNoProof, path: '/' });
    await page.waitForSelector('[data-need-crew-count]', { timeout: 20000 });
    const box = await page.evaluate(() => {
      const el = document.querySelector('[data-need-crew-count]');
      return {
        count: el?.getAttribute('data-need-crew-count') || '',
        text: el?.textContent || '',
      };
    });
    await page.close();
    expect(box.count, 'needs-you count from the Today query').toBe('4');
    expect(box.text).toMatch(/4 need crew/);
  }, 120000);

  it('P1b-query-cash-out: non-look fixture Out excludes wages and super', async () => {
    const page = await openPage({ width: 1280, js: dashJsNoProof, path: '/' });
    await page.waitForSelector('[data-today-section="s14"]', { timeout: 20000 });
    const text = await waitForSectionText(page, 's14', '$');
    await page.close();
    expect(text).toMatch(/1,862\.75/);
    expect(text).not.toMatch(/4,052\.75/);
  }, 120000);

  it('P1b-query-outstanding: non-look fixture outstanding is company-scoped', async () => {
    const page = await openPage({ width: 1280, js: dashJsNoProof, path: '/' });
    await page.waitForSelector('[data-today-section="s6"]', { timeout: 20000 });
    const text = await waitForSectionText(page, 's6', '$');
    await page.close();
    expect(text).toMatch(/3,579\.65/);
    expect(text).not.toMatch(/8,579\.65/);
  }, 120000);

  it('P1-edit-overlap: 768/1024/1280 edit handles miss title, value and link text on the 26-card set', async () => {
    const table: Array<{ width: number; maxOverlap: number; cards: number; scrollWidth: number; maxRight: number; minTap: number }> = [];
    for (const width of EDIT_WIDTHS) {
      const page = await openPage({ width, path: '/?look=dashboard-all' });
      await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      await enterEdit(page);
      await waitForCards(page);
      await page.setViewportSize({ width, height: 4000 });
      if (width === 768) {
        writeFileSync(join(ARTIFACT_DIR, 'y4000-nodes.json'), JSON.stringify(
          await page.evaluate(foldClipCensusScript),
          null,
          2,
        ));
      }
      const box = await page.evaluate(editOverlapScript);
      const vis = await page.evaluate(visibilityParityScript);
      const hidden = vis.rows.flatMap((row) => row.texts
        .filter((t) => (t.clipped && !t.inScroller) || t.covered)
        .map((t) => ({ id: row.id, title: row.title, text: t.text, why: t.covered ? 'covered' : 'clipped' })));
      const label = process.env.P1_EDIT_FRAME || 'after';
      writeFileSync(join(ARTIFACT_DIR, `edit-${width}-${label}.png`), await page.screenshot({
        type: 'png',
        fullPage: true,
        animations: 'disabled',
      }));
      table.push({
        width,
        maxOverlap: box.maxOverlap,
        cards: box.cards,
        scrollWidth: box.scrollWidth,
        maxRight: box.maxRight,
        minTap: box.minTap,
      });
      expect(box.cards, `26-card set at ${width}`).toBe(LIVE_WIDGET_COUNT);
      expect(box.taps.length, `edit controls at ${width}`).toBeGreaterThan(0);
      expect(box.minTap, `edit taps ≥44 at ${width}`).toBeGreaterThanOrEqual(43.5);
      expect(hidden, `hiding content is not an overlap pass at ${width}`).toEqual([]);
      expect(box.hits, `handle/text overlap at ${width}`).toEqual([]);
      expect(box.maxOverlap, `max overlap at ${width}`).toBe(0);
      await page.close();
    }
    writeFileSync(join(ARTIFACT_DIR, 'overlap-table.json'), JSON.stringify(table, null, 2));
  }, 240000);

  it('P1-edit-cross-card: body, foot and chrome stay inside the host and miss every other card', async () => {
    const REPRO_H: Record<string, number> = {
      'w-jobs': 270,
      'w-weather1': 270,
      'w-weather2': 270,
      'w-weather3': 270,
      'w-invoices': 180,
      'w-compliance': 270,
      'w-pending': 180,
      'w-clock': 180,
      'w-calendar': 270,
      'w-calculator': 320,
      'w-quick': 270,
      'w-kpi': 270,
    };
    const table: Array<{
      path: string;
      width: number;
      mode: string;
      cards: number;
      hits: number;
      leaks: number;
    }> = [];
    for (const path of ['/?look=dashboard-repro', '/?look=dashboard-all'] as const) {
      const want = path.includes('repro') ? LOOK_REPRO_WIDGETS.length : LIVE_WIDGET_COUNT;
      for (const width of EDIT_WIDTHS) {
        for (const mode of ['view', 'edit'] as const) {
          const page = await openPage({ width, path });
          await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
          if (mode === 'edit') await enterEdit(page);
          await waitForCards(page, want);
          await page.setViewportSize({ width, height: 4000 });
          const box = await page.evaluate(crossCardOverlapScript);
          table.push({
            path,
            width,
            mode,
            cards: box.cards,
            hits: box.hits.length,
            leaks: box.leaks.length,
          });
          expect(box.cards, `${path} ${width} ${mode} cards`).toBe(want);
          expect(box.hits, `${path} ${width} ${mode} cross-card hits`).toEqual([]);
          expect(box.leaks, `${path} ${width} ${mode} host leaks`).toEqual([]);
          if (path.includes('repro') && mode === 'edit') {
            const storedHs = await page.evaluate(() => (
              [...document.querySelectorAll('.dashboard-home-canvas [data-dashboard-widget-id]')].map((el) => ({
                id: el.getAttribute('data-dashboard-widget-id') || '',
                stored: Number((el as HTMLElement).getAttribute('data-dashboard-stored-h')),
              }))
            ));
            for (const row of box.hostHeights) {
              const stored = REPRO_H[row.id];
              if (stored == null) continue;
              const mark = storedHs.find((item) => item.id === row.id);
              expect(row.stored, `${row.id} host style.height`).toBe(stored);
              expect(row.painted, `${row.id} painted host height`).toBeCloseTo(stored, 0);
              expect(mark?.stored, `${row.id} stored grid_h pin`).toBe(stored);
            }
          }
          if (path.includes('dashboard-all') && mode === 'edit') {
            const grown = await page.evaluate(() => (
              [...document.querySelectorAll('.dashboard-home-canvas [data-dashboard-widget-id]')].map((el) => {
                const host = el as HTMLElement;
                return {
                  id: host.getAttribute('data-dashboard-widget-id') || '',
                  stored: Number(host.getAttribute('data-dashboard-stored-h')),
                  painted: parseFloat(host.style.height),
                };
              }).filter((row) => row.painted > row.stored + 0.5)
            ));
            expect(grown.length, `${width} edit grow ran on live cards`).toBeGreaterThan(0);
          }
          await page.close();
        }
      }
    }
    writeFileSync(join(ARTIFACT_DIR, 'cross-card-table.json'), JSON.stringify(table, null, 2));
    const frameDir = frameArtifactDir('p1-r10');
    const rectTable: Array<{
      label: string;
      mode: string;
      width: number;
      fixture: string;
      cards: Array<{ id: string; x: number; y: number; w: number; h: number; gapAbove: number | null }>;
    }> = [];
    const cardRects = () => {
      const canvas = document.querySelector('.dashboard-home-canvas, .dashboard-home-view-grid') as HTMLElement | null;
      const origin = canvas?.getBoundingClientRect();
      const cards = [...(canvas?.querySelectorAll('[data-dashboard-widget-id]') ?? [])] as HTMLElement[];
      const rows = cards.map((el) => {
        const r = el.getBoundingClientRect();
        return {
          id: el.getAttribute('data-dashboard-widget-id') || '',
          x: parseFloat(el.style.left) || (origin ? r.left - origin.left : r.left),
          y: parseFloat(el.style.top) || (origin ? r.top - origin.top : r.top),
          w: parseFloat(el.style.width) || r.width,
          h: parseFloat(el.style.height) || r.height,
        };
      });
      return rows.map((row) => {
        const above = rows
          .filter((other) => other.id !== row.id
            && other.y + other.h <= row.y + 0.5
            && other.x < row.x + row.w
            && row.x < other.x + other.w)
          .sort((a, b) => (b.y + b.h) - (a.y + a.h))[0];
        return {
          ...row,
          gapAbove: above ? row.y - (above.y + above.h) : null,
        };
      });
    };
    for (const width of EDIT_WIDTHS) {
      for (const [label, js, css] of [
        ['head', undefined, undefined],
        ['main', parentMainJs, parentMainCss],
      ] as const) {
        for (const mode of ['view', 'edit'] as const) {
          const page = await openPage({
            width,
            path: '/?look=dashboard-repro',
            js,
            css: css ?? distCss,
          });
          await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
          if (mode === 'edit') await enterEdit(page);
          await waitForCards(page, LOOK_REPRO_WIDGETS.length);
          await page.setViewportSize({ width, height: 4000 });
          writeFileSync(join(frameDir, `${mode}-${width}-${label}.png`), await page.screenshot({
            type: 'png',
            fullPage: true,
            animations: 'disabled',
          }));
          const cards = await page.evaluate(cardRects);
          expect(cards.length, `${label} ${mode} ${width} repro cards`).toBe(LOOK_REPRO_WIDGETS.length);
          rectTable.push({
            label,
            mode,
            width,
            fixture: 'dashboard-repro',
            cards,
          });
          if (label === 'head' && mode === 'edit') {
            for (const id of ['w-quick', 'w-calculator']) {
              await page.evaluate((want: string) => {
                const el = document.querySelector(`.dashboard-home-canvas [data-dashboard-widget-id="${want}"]`) as HTMLElement | null;
                el?.scrollIntoView({ block: 'center' });
              }, id);
              const box = await page.evaluate((want: string) => {
                const el = document.querySelector(`.dashboard-home-canvas [data-dashboard-widget-id="${want}"]`) as HTMLElement | null;
                if (!el) return null;
                const r = el.getBoundingClientRect();
                const pad = 24;
                return {
                  x: Math.max(0, Math.floor(r.left - pad)),
                  y: Math.max(0, Math.floor(r.top - pad)),
                  width: Math.ceil(r.width + pad * 2),
                  height: Math.ceil(r.height + pad * 2),
                };
              }, id);
              if (!box) continue;
              writeFileSync(join(frameDir, `close-${id}-${width}.png`), await page.screenshot({
                type: 'png',
                animations: 'disabled',
                clip: box,
              }));
            }
          }
          await page.close();
        }
      }
      const growPage = await openPage({ width, path: '/?look=dashboard-all' });
      await growPage.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      await enterEdit(growPage);
      await waitForCards(growPage, LIVE_WIDGET_COUNT);
      await growPage.setViewportSize({ width, height: 4000 });
      writeFileSync(join(frameDir, `edit-${width}-head-all.png`), await growPage.screenshot({
        type: 'png',
        fullPage: true,
        animations: 'disabled',
      }));
      rectTable.push({
        label: 'head',
        mode: 'edit',
        width,
        fixture: 'dashboard-all',
        cards: await growPage.evaluate(cardRects),
      });
      for (const id of ['all-quick_actions-9', 'all-calculator-7', 'all-ai_agent-14']) {
        await growPage.evaluate((want: string) => {
          const el = document.querySelector(`.dashboard-home-canvas [data-dashboard-widget-id="${want}"]`) as HTMLElement | null;
          el?.scrollIntoView({ block: 'center' });
        }, id);
        const box = await growPage.evaluate((want: string) => {
          const el = document.querySelector(`.dashboard-home-canvas [data-dashboard-widget-id="${want}"]`) as HTMLElement | null;
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const pad = 24;
          return {
            x: Math.max(0, Math.floor(r.left - pad)),
            y: Math.max(0, Math.floor(r.top - pad)),
            width: Math.ceil(r.width + pad * 2),
            height: Math.ceil(r.height + pad * 2),
          };
        }, id);
        if (!box) continue;
        writeFileSync(join(frameDir, `close-${id}-${width}.png`), await growPage.screenshot({
          type: 'png',
          animations: 'disabled',
          clip: box,
        }));
      }
      await growPage.close();
    }
    writeFileSync(join(frameDir, 'rect-table.json'), JSON.stringify(rectTable, null, 2));
  }, 300000);

  it('P1-edit-visibility: view text stays fully visible in edit at 768/1024/1280', async () => {
    const table: Array<{
      width: number;
      cards: number;
      lost: Array<{ id: string; title: string; text: string; why: string }>;
    }> = [];
    for (const width of EDIT_WIDTHS) {
      const viewPage = await openPage({ width, path: '/?look=dashboard-all' });
      await viewPage.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      await waitForCards(viewPage);
      await viewPage.setViewportSize({ width, height: 4000 });
      const view = await viewPage.evaluate(visibilityParityScript);
      await viewPage.close();

      const editPage = await openPage({ width, path: '/?look=dashboard-all' });
      await editPage.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      await enterEdit(editPage);
      await waitForCards(editPage);
      await editPage.setViewportSize({ width, height: 4000 });
      const edit = await editPage.evaluate(visibilityParityScript);
      writeFileSync(join(ARTIFACT_DIR, `edit-${width}-after.png`), await editPage.screenshot({
        type: 'png',
        fullPage: true,
        animations: 'disabled',
      }));
      await editPage.close();

      expect(view.cards, `view cards at ${width}`).toBe(LIVE_WIDGET_COUNT);
      expect(edit.cards, `edit cards at ${width}`).toBe(LIVE_WIDGET_COUNT);
      const lost: Array<{ id: string; title: string; text: string; why: string }> = [];
      for (const vCard of view.rows) {
        const eCard = edit.rows.find((row) => row.id === vCard.id);
        if (!eCard) {
          lost.push({ id: vCard.id, title: vCard.title, text: '', why: 'card missing' });
          continue;
        }
        const used = new Set<number>();
        for (const vText of vCard.texts) {
          if (vText.clipped && !vText.inScroller) continue;
          const idx = eCard.texts.findIndex((row, i) => row.text === vText.text && !used.has(i));
          if (idx < 0) {
            lost.push({ id: vCard.id, title: eCard.title || vCard.title, text: vText.text, why: 'missing' });
            continue;
          }
          used.add(idx);
          const got = eCard.texts[idx];
          if (got.clipped && !got.inScroller) {
            lost.push({ id: vCard.id, title: eCard.title, text: vText.text, why: 'clipped' });
          } else if (got.covered) {
            lost.push({ id: vCard.id, title: eCard.title, text: vText.text, why: 'covered' });
          }
        }
      }
      table.push({ width, cards: edit.cards, lost });
      expect(lost, `visibility parity at ${width}`).toEqual([]);
    }
    writeFileSync(join(ARTIFACT_DIR, 'parity-table.json'), JSON.stringify(table, null, 2));
  }, 240000);

  it('P1-edit-content-clip: edit cards show their last child and do not inner-scroll', async () => {
    const table: Array<{
      path: string;
      width: number;
      cards: number;
      clipped: number;
      rows: EditClipRow[];
    }> = [];
    for (const path of ['/?look=dashboard-repro', '/?look=dashboard-all'] as const) {
      const want = path.includes('repro') ? LOOK_REPRO_WIDGETS.length : LIVE_WIDGET_COUNT;
      for (const width of EDIT_WIDTHS) {
        const page = await openPage({ width, path });
        await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
        await enterEdit(page);
        await waitForCards(page, want);
        await page.setViewportSize({ width, height: 4000 });
        const box = await page.evaluate(editContentClipScript);
        table.push({
          path,
          width,
          cards: box.cards,
          clipped: box.clipped.length,
          rows: box.rows,
        });
        expect(box.cards, `${path} ${width} cards`).toBe(want);
        expect(box.clipped, `${path} ${width} clipped or scrolling cards`).toEqual([]);
        await page.close();
      }
    }
    writeFileSync(join(frameArtifactDir('p1-r10'), 'clip-table.json'), JSON.stringify(table, null, 2));
    writeFileSync(join(ARTIFACT_DIR, 'clip-table.json'), JSON.stringify(table, null, 2));
  }, 240000);

  it('P1-edit-side-border: left and right card edges match main painted pixels', async () => {
    const diffs: Array<{ width: number; id: string; side: string; head: number; main: number }> = [];
    for (const width of EDIT_WIDTHS) {
      const run = async (js?: string) => {
        const page = await openPage({
          width,
          path: '/?look=dashboard-repro',
          js,
          css: js ? fuMainCss : distCss,
        });
        await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
        await enterEdit(page);
        await waitForCanvasCards(page, LOOK_REPRO_WIDGETS.length);
        await page.setViewportSize({ width, height: 4000 });
        await waitForCanvasCards(page, LOOK_REPRO_WIDGETS.length);
        const cards = await page.evaluate(() => {
          const vis = (el: Element) => {
            const s = getComputedStyle(el as HTMLElement);
            const r = el.getBoundingClientRect();
            return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity) > 0
              && r.width > 0 && r.height > 0;
          };
          const canvas = document.querySelector('.dashboard-home-canvas') as HTMLElement | null;
          return [...(canvas?.querySelectorAll('[data-dashboard-widget-id]') ?? [])]
            .filter(vis)
            .map((el) => {
              const r = el.getBoundingClientRect();
              return {
                id: el.getAttribute('data-dashboard-widget-id') || '',
                x: Math.max(0, Math.floor(r.left)),
                y: Math.max(0, Math.floor(r.top)),
                w: Math.ceil(r.width),
                h: Math.ceil(r.height),
              };
            });
        });
        const outlines = await page.evaluate(() => (
          [...document.querySelectorAll('.dashboard-home-canvas .dashboard-home-widget.is-editing')].map((el) => {
            const s = getComputedStyle(el);
            return {
              id: el.parentElement?.getAttribute('data-dashboard-widget-id') || '',
              outline: s.outlineStyle,
              width: parseFloat(s.outlineWidth || '0'),
              borderLeft: parseFloat(s.borderLeftWidth || '0'),
              borderRight: parseFloat(s.borderRightWidth || '0'),
            };
          })
        ));
        const png = await page.screenshot({ type: 'png', fullPage: true, animations: 'disabled' });
        await page.close();
        return { cards, png, outlines };
      };
      const main = await run(fuMainJs);
      const head = await run();
      expect(
        [...head.cards.map((c) => c.id)].sort(),
        `card ids at ${width}`,
      ).toEqual([...main.cards.map((c) => c.id)].sort());
      expect(head.outlines.length, `${width} edit outlines`).toBe(head.cards.length);
      expect(
        head.outlines.filter((row) => row.outline === 'none' || row.width < 1),
        `${width} cards missing painted edit outline`,
      ).toEqual([]);
      const compare = await (async () => {
        const page = await openPage({ width: 128, path: '/?look=dashboard-all' });
        const out = await page.evaluate(async (args: {
          headB64: string;
          mainB64: string;
          headCards: Array<{ id: string; x: number; y: number; w: number; h: number }>;
          mainCards: Array<{ id: string; x: number; y: number; w: number; h: number }>;
        }) => {
          const load = async (b64: string) => {
            const img = new Image();
            img.src = `data:image/png;base64,${b64}`;
            await img.decode();
            const c = document.createElement('canvas');
            c.width = img.width;
            c.height = img.height;
            const ctx = c.getContext('2d');
            if (!ctx) throw new Error('canvas');
            ctx.drawImage(img, 0, 0);
            return { data: ctx.getImageData(0, 0, img.width, img.height).data, w: img.width, h: img.height };
          };
          const pagePx = (p: number[]) => (
            (Math.abs(p[0] - 245) < 12 && Math.abs(p[1] - 240) < 12 && Math.abs(p[2] - 230) < 12)
            || (Math.abs(p[0] - 255) < 8 && Math.abs(p[1] - 253) < 8 && Math.abs(p[2] - 248) < 8)
          );
          const inkScore = (img: { data: Uint8ClampedArray; w: number }, card: { x: number; y: number; w: number; h: number }, side: 'left' | 'right') => {
            const x = side === 'left' ? card.x - 1 : card.x + card.w;
            let ink = 0;
            let samples = 0;
            for (let y = card.y; y < card.y + card.h; y += 1) {
              if (x < 0 || y < 0 || x >= img.w) continue;
              const i = (y * img.w + x) * 4;
              const p = [img.data[i], img.data[i + 1], img.data[i + 2]];
              samples += 1;
              if (!pagePx(p)) ink += 1;
            }
            return { ink, samples, ratio: samples ? ink / samples : 0 };
          };
          const a = await load(args.headB64);
          const b = await load(args.mainB64);
          const hits: Array<{ id: string; side: string; head: number; main: number }> = [];
          for (const mainCard of args.mainCards) {
            const headCard = args.headCards.find((row) => row.id === mainCard.id);
            if (!headCard) continue;
            for (const side of ['left', 'right'] as const) {
              const head = inkScore(a, headCard, side);
              const main = inkScore(b, mainCard, side);
              if (head.ratio + 0.08 < main.ratio || (main.ratio > 0.25 && head.ratio < main.ratio * 0.5)) {
                hits.push({ id: mainCard.id, side, head: head.ink, main: main.ink });
              }
            }
          }
          return hits;
        }, {
          headB64: head.png.toString('base64'),
          mainB64: main.png.toString('base64'),
          headCards: head.cards,
          mainCards: main.cards,
        });
        await page.close();
        return out;
      })();
      diffs.push(...compare.map((row) => ({ width, ...row })));
    }
    expect(diffs, 'edit side-edge pixels match main').toEqual([]);
  }, 240000);

  it('P1-phone-unchanged: 375/390 view and edit match main 30cb09d9 JS+CSS on dashboard-all', async () => {
    for (const width of PHONE_WIDTHS) {
      for (const mode of ['view', 'edit'] as const) {
        const mainPage = await openPage({
          width,
          css: fuMainCss,
          js: fuMainJs,
          path: '/?look=dashboard',
        });
        await mainPage.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
        if (mode === 'edit') await enterEdit(mainPage);
        const want = await mainPage.evaluate(phoneChromeScript);
        await mainPage.close();

        const page = await openPage({ width, path: '/?look=dashboard-all' });
        await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
        if (mode === 'edit') await enterEdit(page);
        const got = await page.evaluate(phoneChromeScript);
        await page.close();
        expect(got, `phone chrome at ${width} ${mode}`).toEqual(want);

        const mainDash = await openPage({
          width,
          css: fuMainCss,
          js: fuMainJs,
          path: '/?look=dashboard',
        });
        await mainDash.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
        if (mode === 'edit') await enterEdit(mainDash);
        const wantRects = await mainDash.evaluate(phoneRectScript);
        await mainDash.close();
        const headDash = await openPage({ width, path: '/?look=dashboard' });
        await headDash.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
        if (mode === 'edit') await enterEdit(headDash);
        const gotRects = await headDash.evaluate(phoneRectScript);
        await headDash.close();
        expect(gotRects, `phone rects at ${width} ${mode}`).toEqual(wantRects);
      }
    }
  }, 240000);

  it('P1-scroll: document scrollWidth and max rect.right stay inside the viewport', async () => {
    const rows: Array<{ width: number; mode: string; scrollWidth: number; maxRight: number; innerWidth: number; clipHits: number }> = [];
    for (const width of WIDTHS) {
      const page = await openPage({ width, path: '/?look=dashboard-all' });
      await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      for (const mode of ['view', 'edit'] as const) {
        if (mode === 'edit') await enterEdit(page);
        const box = await page.evaluate(overflowScript);
        rows.push({
          width,
          mode,
          scrollWidth: box.scrollWidth,
          maxRight: box.maxRight,
          innerWidth: box.innerWidth,
          clipHits: box.clipHits.length,
        });
        expect(box.scrollWidth, `scrollWidth at ${width} ${mode}`).toBeLessThanOrEqual(width);
        expect(box.maxRight, `max rect.right at ${width} ${mode}`).toBeLessThanOrEqual(width + 0.5);
        expect(box.clipHits, `clipHits at ${width} ${mode}`).toEqual([]);
      }
      await page.close();
    }
    writeFileSync(join(frameArtifactDir('p1-r10'), 'scroll-table.json'), JSON.stringify(rows, null, 2));
    writeFileSync(join(ARTIFACT_DIR, 'scroll-table.json'), JSON.stringify(rows, null, 2));
  }, 240000);

  it('P1-agent-activity-wrap: long unbroken token stays inside the card clip at every width', async () => {
    for (const width of WIDTHS) {
      const page = await openPage({ width, path: '/?look=dashboard-all' });
      await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      await page.evaluate(async (token: string) => {
        for (let i = 0; i < 80; i += 1) {
          if ((document.body.textContent || '').includes(token)) return;
          await new Promise((resolve) => window.setTimeout(resolve, 50));
        }
      }, AGENT_LONG_TOKEN);
      const box = await page.evaluate(agentActivityOverflowScript, AGENT_LONG_TOKEN);
      expect(box.found, `agent activity long token at ${width}`).toBe(true);
      expect(box.scrollWidth, `list scrollWidth equals clientWidth at ${width}`).toBe(box.clientWidth);
      expect(box.overClip, `token/row right ≤ clip at ${width}`).toBe(0);
      await page.close();
    }
  }, 180000);

  it('P1-agent-activity-wrap-T2: removing wrap classes restores sideways list scroll', async () => {
    const page = await openPage({ width: 375, path: '/?look=dashboard-all' });
    await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
    await page.evaluate(async (token: string) => {
      for (let i = 0; i < 80; i += 1) {
        if ((document.body.textContent || '').includes(token)) return;
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
    }, AGENT_LONG_TOKEN);
    await page.evaluate((token: string) => {
      const p = [...document.querySelectorAll('p')].find((el) => (el.textContent || '').includes(token));
      if (!p) throw new Error('summary missing');
      p.classList.remove('break-words');
      p.classList.remove('[overflow-wrap:anywhere]');
      p.style.overflowWrap = 'normal';
      p.style.wordBreak = 'normal';
    }, AGENT_LONG_TOKEN);
    const box = await page.evaluate(agentActivityOverflowScript, AGENT_LONG_TOKEN);
    await page.close();
    expect(box.found, 'mutant still paints the long token').toBe(true);
    expect(
      box.scrollWidth > box.clientWidth || box.overClip > 0,
      'removing wrap classes overflows the list or clip',
    ).toBe(true);
  }, 60000);

  it('P1-edit-drag-pack: packed-row pointer drags write only when the drawn card moves', async () => {
    const page = await openPage({ width: 1280, path: '/?look=dashboard-repro' });
    await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
    await enterEdit(page);
    await page.setViewportSize({ width: 1280, height: 4000 });
    const beforeC = await paintedCard(page, 'w-compliance');
    const beforeW = await paintedCard(page, 'w-weather2');
    expect(beforeC?.top, 'compliance starts at main stored y').toBe(740);
    expect(beforeW?.top, 'weather2 starts at main stored y').toBe(380);
    await initLayoutWrites(page);
    await pointerDragHandle(page, 'w-compliance', 0, 3, 'move');
    await pointerDragHandle(page, 'w-compliance', 0, -3, 'move');
    await pointerDragHandle(page, 'w-weather2', 0, 4, 'move');
    expect(await readLayoutWrites(page), 'sub-threshold drags').toEqual([]);
    await pointerDragHandle(page, 'w-compliance', 0, 30, 'move');
    const slack = await readLayoutWrites(page);
    expect(slack, 'visible +30 from stored y writes once').toHaveLength(1);
    expect(slack[0]).toMatchObject({ id: 'w-compliance', grid_y: 770 });
    expect((await paintedCard(page, 'w-compliance'))?.top).toBe(770);
    expect((await paintedCard(page, 'w-weather2'))?.top).toBe(beforeW?.top);
    await initLayoutWrites(page);
    await pointerDragHandle(page, 'w-compliance', 0, 80, 'move');
    const writes = await readLayoutWrites(page);
    expect(writes, 'visible drag from 770 writes once').toHaveLength(1);
    expect(writes[0]).toMatchObject({ id: 'w-compliance', grid_y: 850 });
    expect((await paintedCard(page, 'w-compliance'))?.top).toBe(850);
    await page.close();
  }, 180000);

  it('P1-edit-drag-land-main: compliance +80 and weather2 +60 land as main 30cb09d9', async () => {
    const run = async (js?: string) => {
      const page = await openPage({ width: 1280, path: '/?look=dashboard-repro', js });
      await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      await enterEdit(page);
      await page.setViewportSize({ width: 1280, height: 4000 });
      await initLayoutWrites(page);
      await pointerDragHandle(page, 'w-compliance', 0, 80, 'move');
      const complianceWrite = (await readLayoutWrites(page))[0] ?? null;
      const compliancePaint = await paintedCard(page, 'w-compliance');
      await initLayoutWrites(page);
      await pointerDragHandle(page, 'w-weather2', 0, 60, 'move');
      const weatherWrite = (await readLayoutWrites(page))[0] ?? null;
      const weatherPaint = await paintedCard(page, 'w-weather2');
      await page.close();
      return {
        compliance: {
          grid_y: complianceWrite?.grid_y as number | undefined,
          left: compliancePaint?.left,
          top: compliancePaint?.top,
          width: compliancePaint?.width,
        },
        weather2: {
          grid_y: weatherWrite?.grid_y as number | undefined,
          left: weatherPaint?.left,
          top: weatherPaint?.top,
          width: weatherPaint?.width,
        },
      };
    };
    const mainLand = await run(fuMainJs);
    const headLand = await run();
    expect(mainLand.compliance.grid_y, 'main compliance write is a real persist payload').toBe(820);
    expect(mainLand.weather2.grid_y, 'main weather2 write is a real persist payload').toBe(440);
    expect(headLand, 'landing matches main 30cb09d9').toEqual(mainLand);
  }, 180000);

  it('P1-edit-drag-seq: two-drag painted y equals stored y equals main', async () => {
    const runSeq = async (
      first: { id: string; dy: number },
      second: { id: string; dy: number },
      js?: string,
    ) => {
      const page = await openPage({ width: 1280, path: '/?look=dashboard-repro', js });
      await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      await enterEdit(page);
      await page.setViewportSize({ width: 1280, height: 4000 });
      await initLayoutWrites(page);
      await pointerDragHandle(page, first.id, 0, first.dy, 'move');
      const firstWrite = (await readLayoutWrites(page))[0] ?? null;
      const firstPaint = await paintedCard(page, first.id);
      const otherAfterFirst = await paintedCard(page, second.id);
      const clipFirst = await page.evaluate(editContentClipScript);
      const hitsFirst = await page.evaluate(crossCardOverlapScript);
      await leaveEdit(page);
      await enterEdit(page);
      const firstReload = await paintedCard(page, first.id);
      await initLayoutWrites(page);
      await pointerDragHandle(page, second.id, 0, second.dy, 'move');
      const secondWrite = (await readLayoutWrites(page))[0] ?? null;
      const secondPaint = await paintedCard(page, second.id);
      const firstAfterSecond = await paintedCard(page, first.id);
      const clipSecond = await page.evaluate(editContentClipScript);
      const hitsSecond = await page.evaluate(crossCardOverlapScript);
      await leaveEdit(page);
      await enterEdit(page);
      const secondReload = await paintedCard(page, second.id);
      await page.close();
      return {
        first: {
          stored: firstWrite?.grid_y as number | undefined,
          painted: firstPaint?.top,
          paintedAfter: firstAfterSecond?.top,
          paintedReload: firstReload?.top,
          clip: clipFirst.clipped.length,
          hits: hitsFirst.hits.length,
        },
        second: {
          stored: secondWrite?.grid_y as number | undefined,
          painted: secondPaint?.top,
          paintedAfterFirst: otherAfterFirst?.top,
          paintedReload: secondReload?.top,
          clip: clipSecond.clipped.length,
          hits: hitsSecond.hits.length,
        },
      };
    };
    const weatherThenCompliance = {
      first: { id: 'w-weather2', dy: 60 },
      second: { id: 'w-compliance', dy: 80 },
    };
    const complianceThenWeather = {
      first: { id: 'w-compliance', dy: 80 },
      second: { id: 'w-weather2', dy: 60 },
    };
    const mainA = await runSeq(weatherThenCompliance.first, weatherThenCompliance.second, fuMainJs);
    const headA = await runSeq(weatherThenCompliance.first, weatherThenCompliance.second);
    const mainB = await runSeq(complianceThenWeather.first, complianceThenWeather.second, fuMainJs);
    const headB = await runSeq(complianceThenWeather.first, complianceThenWeather.second);
    expect(mainA.first.painted, 'main weather2 +60 painted').toBe(440);
    expect(mainA.first.stored, 'main weather2 +60 stored').toBe(440);
    expect(mainA.second.painted, 'main compliance after weather2 +60 then +80 painted').toBe(820);
    expect(mainA.second.stored, 'main compliance after weather2 +60 then +80 stored').toBe(820);
    expect(mainA.first.paintedAfter, 'main weather2 stays 440 after compliance').toBe(440);
    expect(headA, 'weather2 +60 then compliance matches main').toEqual(mainA);
    expect(headA.first.painted, 'head weather2 painted equals stored').toBe(headA.first.stored);
    expect(headA.second.painted, 'head compliance painted equals stored').toBe(headA.second.stored);
    expect(headA.first.painted).toBe(440);
    expect(headA.second.painted).toBe(820);
    expect(mainB.first.painted, 'main compliance +80 painted').toBe(820);
    expect(mainB.first.stored, 'main compliance +80 stored').toBe(820);
    expect(mainB.second.painted, 'main weather2 +60 after compliance painted').toBe(440);
    expect(mainB.second.stored, 'main weather2 +60 after compliance stored').toBe(440);
    expect(mainB.first.paintedAfter, 'main compliance stays 820 after weather2').toBe(820);
    expect(headB, 'compliance +80 then weather2 matches main').toEqual(mainB);
    expect(headB.first.paintedAfter, 'head compliance painted stays stored after weather2').toBe(headB.first.stored);
    expect(headB.first.paintedAfter).toBe(820);
    expect(headB.second.painted).toBe(440);
    expect(headA.first.clip, '1280 weather-first no clip after first drag').toBe(0);
    expect(headA.first.hits, '1280 weather-first no overlap after first drag').toBe(0);
    expect(headA.second.clip, '1280 weather-first no clip after second drag').toBe(0);
    expect(headA.second.hits, '1280 weather-first no overlap after second drag').toBe(0);
    expect(headA.first.paintedReload, '1280 weather2 reload equals stored').toBe(headA.first.stored);
    expect(headA.second.paintedReload, '1280 compliance reload equals stored').toBe(headA.second.stored);
    expect(headB.first.clip, '1280 compliance-first no clip after first drag').toBe(0);
    expect(headB.first.hits, '1280 compliance-first no overlap after first drag').toBe(0);
    expect(headB.second.clip, '1280 compliance-first no clip after second drag').toBe(0);
    expect(headB.second.hits, '1280 compliance-first no overlap after second drag').toBe(0);
    expect(headB.first.paintedReload, '1280 compliance reload equals stored').toBe(headB.first.stored);
    expect(headB.second.paintedReload, '1280 weather2 reload equals stored').toBe(headB.second.stored);
  }, 180000);

  it('P1-edit-drag-seq-1024: compliance +30 then +80 pins exact y at every step', async () => {
    const run = async (js?: string) => {
      const page = await openPage({ width: 1024, path: '/?look=dashboard-repro', js });
      await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      await enterEdit(page);
      await page.setViewportSize({ width: 1024, height: 4000 });
      await waitForSettledLayout(page);
      const before = await paintedCard(page, 'w-compliance');
      const beforeClip = await page.evaluate(editContentClipScript);
      const beforeHits = await page.evaluate(crossCardOverlapScript);
      await initLayoutWrites(page);
      await pointerDragHandle(page, 'w-compliance', 0, 30, 'move');
      const write30 = (await readLayoutWrites(page))[0] ?? null;
      const after30 = await paintedCard(page, 'w-compliance');
      const clip30 = await page.evaluate(editContentClipScript);
      const hits30 = await page.evaluate(crossCardOverlapScript);
      await leaveEdit(page);
      await enterEdit(page);
      await waitForSettledLayout(page);
      const after30Reload = await paintedCard(page, 'w-compliance');
      const clip30Reload = await page.evaluate(editContentClipScript);
      const hits30Reload = await page.evaluate(crossCardOverlapScript);
      await initLayoutWrites(page);
      await pointerDragHandle(page, 'w-compliance', 0, 80, 'move');
      const write80 = (await readLayoutWrites(page))[0] ?? null;
      const after80 = await paintedCard(page, 'w-compliance');
      const clip80 = await page.evaluate(editContentClipScript);
      const hits80 = await page.evaluate(crossCardOverlapScript);
      await leaveEdit(page);
      await enterEdit(page);
      await waitForSettledLayout(page);
      const after80Reload = await paintedCard(page, 'w-compliance');
      const clip80Reload = await page.evaluate(editContentClipScript);
      const hits80Reload = await page.evaluate(crossCardOverlapScript);
      await page.close();
      return {
        before: before?.top,
        after30: after30?.top,
        after80: after80?.top,
        after30Reload: after30Reload?.top,
        after80Reload: after80Reload?.top,
        stored30: write30?.grid_y as number | undefined,
        stored80: write80?.grid_y as number | undefined,
        storedMark30: after30?.storedY,
        storedMark80: after80?.storedY,
        storedMark30Reload: after30Reload?.storedY,
        storedMark80Reload: after80Reload?.storedY,
        clip: {
          before: beforeClip.clipped.length,
          after30: clip30.clipped.length,
          after30Reload: clip30Reload.clipped.length,
          after80: clip80.clipped.length,
          after80Reload: clip80Reload.clipped.length,
        },
        hits: {
          before: beforeHits.hits.length,
          after30: hits30.hits.length,
          after30Reload: hits30Reload.hits.length,
          after80: hits80.hits.length,
          after80Reload: hits80Reload.hits.length,
        },
      };
    };
    const main = await run(fuMainJs);
    const head = await run();
    expect(main.before, '1024 start y').toBe(740);
    expect(main.after30, '1024 +30 painted y').toBe(770);
    expect(main.stored30, '1024 +30 persist payload').toBe(770);
    expect(main.after30Reload, '1024 +30 painted y after reload equals stored y').toBe(770);
    expect(main.after80, '1024 +80 painted y').toBe(850);
    expect(main.stored80, '1024 +80 persist payload').toBe(850);
    expect(main.after80Reload, '1024 +80 painted y after reload equals stored y').toBe(850);
    expect(main.clip, 'no clip at any 1024 step').toEqual({
      before: 0, after30: 0, after30Reload: 0, after80: 0, after80Reload: 0,
    });
    expect(main.hits, 'no overlap at any 1024 step').toEqual({
      before: 0, after30: 0, after30Reload: 0, after80: 0, after80Reload: 0,
    });
    expect(head.storedMark30, '1024 +30 stored y equals persist payload').toBe(770);
    expect(head.storedMark30Reload, '1024 +30 stored y after reload').toBe(770);
    expect(head.storedMark80, '1024 +80 stored y equals persist payload').toBe(850);
    expect(head.storedMark80Reload, '1024 +80 stored y after reload').toBe(850);
    const stripMarks = <T extends Record<string, unknown>>(row: T) => {
      const rest = { ...row };
      delete rest.storedMark30;
      delete rest.storedMark80;
      delete rest.storedMark30Reload;
      delete rest.storedMark80Reload;
      return rest;
    };
    expect(stripMarks(head), '1024 two-drag matches main').toEqual(stripMarks(main));
  }, 180000);

  // SWEEP-2b: docs/p1-r9-768-after80.md
  // Coach 09:38 dropped the after80 painted-y band only. stored80 === after80
  // stays an exact toBe. clampDashboardWidgetsToCanvas still explains 2370 != 1346.
  it('P1-edit-drag-seq-768: compliance +30 then +80 pins stored, reload, clip, overlap', async () => {
    const run = async (js?: string) => {
      const page = await openPage({ width: 768, path: '/?look=dashboard-repro', js });
      await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      await enterEdit(page);
      await page.setViewportSize({ width: 768, height: 4000 });
      await waitForSettledLayout(page);
      const before = await paintedCard(page, 'w-compliance');
      const canvasW = await page.evaluate(() => (
        (document.querySelector('.dashboard-home-canvas') as HTMLElement | null)?.clientWidth ?? 0
      ));
      const beforeClip = await page.evaluate(editContentClipScript);
      const beforeHits = await page.evaluate(crossCardOverlapScript);
      await initLayoutWrites(page);
      await pointerDragHandle(page, 'w-compliance', 0, 30, 'move');
      const write30 = (await readLayoutWrites(page))[0] ?? null;
      const after30 = await paintedCard(page, 'w-compliance');
      const clip30 = await page.evaluate(editContentClipScript);
      const hits30 = await page.evaluate(crossCardOverlapScript);
      await leaveEdit(page);
      await enterEdit(page);
      await waitForSettledLayout(page);
      const after30Reload = await paintedCard(page, 'w-compliance');
      const clip30Reload = await page.evaluate(editContentClipScript);
      const hits30Reload = await page.evaluate(crossCardOverlapScript);
      await initLayoutWrites(page);
      await pointerDragHandle(page, 'w-compliance', 0, 80, 'move');
      const write80 = (await readLayoutWrites(page))[0] ?? null;
      const after80 = await paintedCard(page, 'w-compliance');
      const clip80 = await page.evaluate(editContentClipScript);
      const hits80 = await page.evaluate(crossCardOverlapScript);
      await leaveEdit(page);
      await enterEdit(page);
      await waitForSettledLayout(page);
      const after80Reload = await paintedCard(page, 'w-compliance');
      const clip80Reload = await page.evaluate(editContentClipScript);
      const hits80Reload = await page.evaluate(crossCardOverlapScript);
      await page.close();
      return {
        before: before?.top,
        after30: after30?.top,
        after80: after80?.top,
        after30Reload: after30Reload?.top,
        after80Reload: after80Reload?.top,
        stored30: write30?.grid_y as number | undefined,
        stored80: write80?.grid_y as number | undefined,
        storedMark30: after30?.storedY,
        storedMark80: after80?.storedY,
        storedMark30Reload: after30Reload?.storedY,
        storedMark80Reload: after80Reload?.storedY,
        canvasW,
        clip: {
          before: beforeClip.clipped.length,
          after30: clip30.clipped.length,
          after30Reload: clip30Reload.clipped.length,
          after80: clip80.clipped.length,
          after80Reload: clip80Reload.clipped.length,
        },
        hits: {
          before: beforeHits.hits.length,
          after30: hits30.hits.length,
          after30Reload: hits30Reload.hits.length,
          after80: hits80.hits.length,
          after80Reload: hits80Reload.hits.length,
        },
      };
    };
    const pairN = Math.max(1, Number(process.env.P1_R10_PROOF || 10));
    const pairs = [];
    for (let i = 0; i < pairN; i += 1) {
      const main = await run(clampMainJs);
      const head = await run();
      pairs.push({ main, head });
    }
    const tz = process.env.TZ || 'UTC';
    const frameDir = frameArtifactDir('p1-r10');
    writeFileSync(join(frameDir, 'drag-seq-768.json'), JSON.stringify({ tz, pairs }, null, 2));
    writeFileSync(join(frameDir, `after80-${tz.replace('/', '-')}-${process.env.P1_R10_LABEL || 'suite'}.json`), JSON.stringify({
      sha: CLAMP_MAIN_SHA,
      tz,
      label: process.env.P1_R10_LABEL || 'suite',
      mains: pairs.map((row) => row.main.after80),
      heads: pairs.map((row) => row.head.after80),
    }, null, 2));
    for (const { main, head } of pairs) {
      expect(main.canvasW, '768 canvas width').toBe(654);
      expect(head.canvasW, '768 canvas width').toBe(654);
      expect(main.before, '768 start y').toBe(1316);
      expect(head.before, '768 start y').toBe(1316);
      expect(main.after30, '768 +30 painted y').toBe(2370);
      expect(head.after30, '768 +30 painted y').toBe(2370);
      expect(main.stored30, '768 +30 persist payload').toBe(1346);
      expect(head.stored30, '768 +30 persist payload').toBe(1346);
      expect(main.after30Reload, 'main 0898c3b9 +30 after leave/enter still paints 2370').toBe(2370);
      expect(head.after30Reload, '768 +30 painted y after reload').toBe(2370);
      expect(main.after30Reload, 'main painted 2370 != stored 1346 is clampDashboardWidgetsToCanvas').not.toBe(main.stored30);
      expect(main.stored80, '768 +80 persist payload equals painted y').toBe(main.after80);
      expect(head.stored80, '768 +80 persist payload equals painted y').toBe(head.after80);
      expect(main.after80Reload, '768 +80 painted y after reload equals stored y').toBe(main.after80);
      expect(head.after80Reload, '768 +80 painted y after reload equals stored y').toBe(head.after80);
      expect(head.storedMark30, '768 +30 stored y equals persist payload').toBe(1346);
      expect(head.storedMark30Reload, '768 +30 stored y after reload equals persist').toBe(1346);
      expect(head.storedMark80, '768 +80 stored y equals persist payload').toBe(head.after80);
      expect(head.storedMark80Reload, '768 +80 stored y after reload').toBe(head.after80);
      expect(main.storedMark80, '768 +80 main stored y equals persist payload').toBe(main.after80);
      expect(main.storedMark80Reload, '768 +80 main stored y after reload').toBe(main.after80);
      for (const row of [main, head]) {
        expect(row.storedMark80, '768 +80 stored mark is painted after80').toBe(row.after80);
        expect(row.storedMark80Reload, '768 +80 stored mark after reload is painted after80').toBe(row.after80);
      }
      for (const row of [main, head]) {
        expect(row.clip.before, 'no clip before drag').toBe(0);
        expect(row.clip.after30, 'no clip after +30').toBe(0);
        expect(row.clip.after30Reload, 'no clip after +30 reload').toBe(0);
        expect(row.clip.after80, 'no clip after +80').toBe(0);
        expect(row.clip.after80Reload, 'no clip after +80 reload').toBe(0);
        expect(row.hits.before, 'no overlap before drag').toBe(0);
        expect(row.hits.after30, 'no overlap after +30').toBe(0);
        expect(row.hits.after30Reload, 'no overlap after +30 reload').toBe(0);
        expect(row.hits.after80, 'no overlap after +80').toBe(0);
        expect(row.hits.after80Reload, 'no overlap after +80 reload').toBe(0);
      }
    }
  }, 600000);

  it('P1-edit-grow-gap: head-only edit gaps match main', async () => {
    const measure = async (path: string, width: number, js?: string) => {
      const want = path.includes('all') ? LIVE_WIDGET_COUNT : 8;
      const page = await openPage({ width, path, js });
      await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
      await enterEdit(page);
      await waitForCanvasCards(page, want);
      await page.setViewportSize({ width, height: 4000 });
      await waitForSettledLayout(page);
      const box = await page.evaluate(() => {
        const canvas = document.querySelector('.dashboard-home-canvas') as HTMLElement | null;
        const cards = [...(canvas?.querySelectorAll('[data-dashboard-widget-id]') ?? [])] as HTMLElement[];
        const painted = cards.map((el) => {
          const attrX = el.getAttribute('data-dashboard-stored-x');
          const attrW = el.getAttribute('data-dashboard-stored-w');
          return {
            id: el.getAttribute('data-dashboard-widget-id') || '',
            x: parseFloat(el.style.left) || 0,
            y: parseFloat(el.style.top) || 0,
            w: parseFloat(el.style.width) || 0,
            h: parseFloat(el.style.height) || 0,
            storedY: Number(el.getAttribute('data-dashboard-base-y') || el.getAttribute('data-dashboard-stored-y')),
            storedH: Number(el.getAttribute('data-dashboard-stored-h')),
            storedX: attrX != null ? Number(attrX) : (parseFloat(el.style.left) || 0),
            storedW: attrW != null ? Number(attrW) : (parseFloat(el.style.width) || 0),
          };
        });
        const stored = painted.map((row) => ({
          id: row.id,
          x: row.storedX,
          y: row.storedY,
          w: row.storedW,
          h: row.storedH,
        }));
        const aboveOf = (
          row: { id: string; x: number; y: number; w: number; h: number },
          pool: Array<{ id: string; x: number; y: number; w: number; h: number }>,
        ) => pool
          .filter((other) => other.id !== row.id
            && other.y + other.h <= row.y + 0.5
            && other.x < row.x + row.w
            && row.x < other.x + other.w)
          .sort((a, b) => (b.y + b.h) - (a.y + a.h))[0];
        return {
          canvasH: canvas?.offsetHeight ?? 0,
          rows: painted.map((row) => {
            const paintedAbove = aboveOf(row, painted);
            const storedRow = stored.find((item) => item.id === row.id)!;
            const storedAbove = aboveOf(storedRow, stored);
            return {
              id: row.id,
              paintedGap: paintedAbove ? row.y - (paintedAbove.y + paintedAbove.h) : null,
              storedGap: storedAbove ? storedRow.y - (storedAbove.y + storedAbove.h) : null,
              paintedW: row.w,
              storedW: row.storedW,
              paintedX: row.x,
              storedX: row.storedX,
              grow: Math.max(0, row.h - row.storedH),
            };
          }),
        };
      });
      await page.close();
      return box;
    };
    const table: Array<Record<string, unknown>> = [];
    const named = {
      '/?look=dashboard-seed': ['seed-clock', 'seed-calendar'],
      '/?look=dashboard-all': ['all-calendar-6'],
    } as const;
    for (const path of ['/?look=dashboard-seed', '/?look=dashboard-all'] as const) {
      for (const width of EDIT_WIDTHS) {
        const mainBox = await measure(path, width, parentMainJs);
        const headBox = await measure(path, width);
        for (const id of named[path]) {
          const main = mainBox.rows.find((row) => row.id === id);
          const head = headBox.rows.find((row) => row.id === id);
          table.push({
            path,
            width,
            id,
            head: head?.paintedGap ?? null,
            main: main?.paintedGap ?? null,
            stored: head?.storedGap ?? null,
            headW: head?.paintedW ?? null,
            storedW: head?.storedW ?? null,
            headX: head?.paintedX ?? null,
            storedX: head?.storedX ?? null,
            canvasHead: headBox.canvasH,
            canvasMain: mainBox.canvasH,
          });
          if (head) {
            expect(head.paintedW, `${path} ${width} ${id} painted w <= stored w`).toBeLessThanOrEqual(head.storedW);
            expect(head.storedW - head.paintedW, `${path} ${width} ${id} width shrink is at most 16`).toBeLessThanOrEqual(16);
            expect(head.paintedX, `${path} ${width} ${id} painted x equals stored x`).toBe(head.storedX);
          }
        }
        if (mainBox.rows.length) {
          table.push({
            path,
            width,
            id: '__canvas__',
            canvasHead: headBox.canvasH,
            canvasMain: mainBox.canvasH,
          });
        }
      }
    }
    writeFileSync(join(frameArtifactDir('p1-r10'), 'grow-gap-table.json'), JSON.stringify(table, null, 2));
    for (const row of table) {
      if (row.id === '__canvas__') {
        expect(row.canvasHead, `${row.path} ${row.width} edit canvas height must match main`).toBe(row.canvasMain);
        continue;
      }
      if (row.main != null) {
        expect(row.head, `${row.path} ${row.width} ${row.id} edit gap must match main`).toBe(row.main);
      } else if (row.width === 768) {
        expect(row.head, `${row.path} ${row.width} ${row.id} edit gap stays at least the gutter`).toBeGreaterThanOrEqual(16);
        expect(row.head, `${row.path} ${row.width} ${row.id} edit gap does not exceed in-run stored`).toBeLessThanOrEqual(row.stored as number);
      } else {
        expect(row.head, `${row.path} ${row.width} ${row.id} edit gap must match in-run stored`).toBe(row.stored);
      }
    }
  }, 300000);

  it('P1-edit-resize-content: resize persists content height, not edit chrome', async () => {
    const page = await openPage({ width: 1280, path: '/?look=dashboard-repro' });
    await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
    await enterEdit(page);
    await page.setViewportSize({ width: 1280, height: 4000 });
    const before = await paintedCard(page, 'w-compliance');
    expect(before?.height ?? 0, 'drawn edit height is main stored row height').toBe(270);
    await initLayoutWrites(page);
    await pointerDragHandle(page, 'w-compliance', 20, 20, 'resize');
    const writes = await readLayoutWrites(page);
    await page.close();
    expect(writes, 'resize writes once').toHaveLength(1);
    expect(writes[0]).toMatchObject({ id: 'w-compliance', grid_h: 290 });
    expect(writes[0].grid_h, 'must not persist content + chrome').not.toBe(390);
  }, 180000);

  it('P1-edit-drop-push: a visible drop packs the next row down', async () => {
    const page = await openPage({ width: 1280, path: '/?look=dashboard-repro' });
    await page.waitForSelector('[data-dashboard-home="1"]', { timeout: 20000 });
    await enterEdit(page);
    await page.setViewportSize({ width: 1280, height: 4000 });
    const before = await paintedCard(page, 'w-weather2');
    expect(before?.top).toBe(380);
    await initLayoutWrites(page);
    await pointerDragHandle(page, 'w-jobs', 0, 80, 'move');
    const writes = await readLayoutWrites(page);
    const afterJobs = await paintedCard(page, 'w-jobs');
    const afterW = await paintedCard(page, 'w-weather2');
    await page.close();
    expect(writes, 'jobs drop writes once').toHaveLength(1);
    expect(writes[0]).toMatchObject({ id: 'w-jobs', grid_y: 100 });
    expect(afterJobs?.top).toBe(100);
    expect(afterW?.top, 'weather2 stays at the repaired stored gap').toBe(386);
  }, 180000);

  it('P1-look-prod dashboard-all: prod no-flag /?look=dashboard-all stays live (rem/jobs/widgets/crew)', async () => {
    const page = await openPage({ width: 375, path: '/?look=dashboard-all', js: dashJsNoProof });
    const paint = await paintLookFakes(page, {
      rem: LOOK_REMS,
      widgets: LOOK_WIDGETS,
      jobs: LOOK_JOBS,
    });
    await page.close();
    expect(liveLookBag(paint), '/?look=dashboard-all must stay on the live data path').toEqual(LIVE_LOOK_OK);
  }, 60000);
});
