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
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
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
const PROD_REMINDER_TITLES = [
  'Call Mia about quote p2b-3mxz — delete ok',
  'Ring Megan re valve Tue 3pm — delete ok 375',
] as const;
const PROD_REMINDER_META = '#0137 · Replace kitchen mixer tap · Overdue · Wed 21 Oct · Company';
const PROD_REMINDER_TEXTS = [...PROD_REMINDER_TITLES, PROD_REMINDER_META] as const;
const LIVE_JOB_META = '#0141.A$ · Owen Price — delete ok · Ashgrove · CoS Invitee Test';
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
const temps: string[] = [];

beforeAll(async () => {
  distCss = readDistCss();
  mainCss = ensureMainDistCss();
  dashJs = await bundleDashboard();
  dashJsNoProof = await bundleDashboard({ lookProof: false });
  runDir = mkdtempSync(join(tmpdir(), 'p1-chroma-'));
  temps.push(runDir);
  browser = await launchBrowser();
}, 180000);

afterAll(async () => {
  await browser?.close();
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
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
      const ledger = !!document.querySelector('.dashboard-home-ledger')
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
    const crewText = [...document.querySelectorAll('[data-dashboard-job], .dashboard-home-ref')]
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
    '.dashboard-home.ops-page .dashboard-home-row',
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
  const clip = await page.evaluate(() => {
    const el = (document.querySelector('[data-dashboard-home="1"]')
      || document.querySelector('.dashboard-home')) as HTMLElement | null;
    if (!el) throw new Error('dashboard missing');
    const r = el.getBoundingClientRect();
    const x = Math.max(0, Math.floor(r.x));
    const y = Math.max(0, Math.floor(r.y));
    const right = Math.min(window.innerWidth, Math.ceil(r.right));
    const bottom = Math.min(window.innerHeight, Math.ceil(r.bottom));
    return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) };
  });
  const buf = await page.screenshot({ type: 'png', clip, animations: 'disabled' });
  return page.evaluate(async (b64: string) => {
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
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width;
    c.height = img.height;
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    let navy = 0;
    let creamExact = 0;
    let creamDe = 0;
    let minNavyDe = 99;
    let minCreamDe = 99;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 8) continue;
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
  }, buf.toString('base64'));
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
const NAVY_EXCLUDE = [{ r: 74, g: 85, b: 104 }] as const;
const T2_CSS = ':root,.dashboard-home{--ops-navy:#2B4A6F}.dashboard-home-hero::after{content:"";display:block;height:4px;background:var(--ops-navy)}';

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
  for (const node of el.querySelectorAll('.dashboard-home-pill, img, .dashboard-home-ai-avatar, .bg-gradient-to-br')) {
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
  for (const seg of document.querySelectorAll('.dashboard-home-ref-seg')) {
    const cell = seg.closest('.dashboard-home-ref') as HTMLElement | null;
    if (!cell) continue;
    const cs = getComputedStyle(cell);
    if (clipsX(cs.overflowX) || clipsX(cs.overflow)) continue;
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
    const thead = document.querySelector('.dashboard-home-thead') as HTMLElement | null;
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
      selector: '.dashboard-home-thead',
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
        expect(paint.sheetBg, `sheet bg matches --g-surface at ${width} ${mode}`).toBe(paint.tokenSurface);
        expect(CREAM.test(paint.pageBg), `page bg is not cream at ${width} ${mode}`).toBe(false);
        expect(CREAM.test(paint.sheetBg), `sheet bg is not cream at ${width} ${mode}`).toBe(false);
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
        expect(node!.lines, `lines for "${text}" at ${width}`).toBe(expected[text]);
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
      excludeSource: 'hard-coded --ops-muted #4A5568; never read from the page under test',
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

  it('P1-schedule-stack: 375/390 time left equals Job title left', async () => {
    for (const width of [375, 390] as const) {
      const page = await openPage({ width, js: dashJsNoProof, path: '/?look=dashboard' });
      await page.waitForSelector('.dashboard-home-row .dashboard-home-title', { timeout: 20000 });
      const rows = await page.evaluate(() => {
        return [...document.querySelectorAll('.dashboard-home-row')].map((row) => {
          const time = row.querySelector('.dashboard-home-time') as HTMLElement | null;
          const title = row.querySelector('.dashboard-home-title') as HTMLElement | null;
          const meta = row.querySelector('.dashboard-home-ref') as HTMLElement | null;
          const pill = row.querySelector('.dashboard-home-crew-schedule') as HTMLElement | null;
          if (!time || !title || !meta || !pill) throw new Error('schedule row missing time/title/meta/pill');
          const t = time.getBoundingClientRect();
          const ti = title.getBoundingClientRect();
          const m = meta.getBoundingClientRect();
          const p = pill.getBoundingClientRect();
          return {
            timeLeft: t.left,
            titleLeft: ti.left,
            gap: ti.top - t.bottom,
            tops: [t.top, ti.top, m.top, p.top],
          };
        });
      });
      await page.close();
      expect(rows.length, `schedule rows at ${width}`).toBeGreaterThan(0);
      for (const [i, box] of rows.entries()) {
        expect(
          Math.abs(box.timeLeft - box.titleLeft),
          `time left equals title left at ${width} row ${i}`,
        ).toBeLessThanOrEqual(1);
        expect(Math.abs(box.gap - 4), `time→title gap 4px at ${width} row ${i}`).toBeLessThanOrEqual(1);
        expect(
          box.tops[0] < box.tops[1] && box.tops[1] < box.tops[2] && box.tops[2] < box.tops[3],
          `visual order time < title < meta < pill at ${width} row ${i}: ${box.tops.join(',')}`,
        ).toBe(true);
      }
    }
  }, 120000);

  it('P1-schedule-thead: no visible Time/Job thead below 640, still in the a11y tree', async () => {
    for (const width of [375, 390] as const) {
      const page = await openPage({ width, js: dashJsNoProof, path: '/?look=dashboard' });
      await page.waitForSelector('.dashboard-home-thead', { timeout: 20000, state: 'attached' });
      const read = () => page.evaluate(() => {
        const thead = document.querySelector('.dashboard-home-thead') as HTMLElement | null;
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
      await page.waitForSelector('.dashboard-home-ref-seg', { timeout: 20000 });
      const box = await page.evaluate((want: string) => {
        const ref = [...document.querySelectorAll('.dashboard-home-ref')]
          .find((el) => (el.textContent || '').includes('#0141.A$')) as HTMLElement | undefined;
        if (!ref) throw new Error('0141 meta missing');
        const segs = [...ref.querySelectorAll('.dashboard-home-ref-seg')] as HTMLElement[];
        const lineTops = (el: Element) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return [...range.getClientRects()].map((r) => Math.round(r.top));
        };
        const lineCount = (tops: number[]) => {
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
          lines: lineCount(lineTops(ref)),
          segLines: segs.map((seg) => lineCount(lineTops(seg))),
          wrapEnds: lineStrs.slice(0, -1).map((line) => / ·\s*$/.test(line)),
          lineStrs,
        };
      }, LIVE_JOB_META);
      await page.close();
      expect(box.text, `0141 meta at ${width}`).toBe(LIVE_JOB_META);
      expect(box.lines, `0141 line count at ${width}`).toBeLessThanOrEqual(2);
      expect(box.segLines.every((n) => n <= 1), `nowrap segments at ${width}`).toBe(true);
      expect(box.wrapEnds.every(Boolean), `breaks after · at ${width}`).toBe(true);
    }
  }, 120000);

  it('P1-schedule-meta-long: a single long segment does not overflow at 375/390', async () => {
    for (const width of [375, 390] as const) {
      const page = await openPage({ width, js: dashJsNoProof, path: '/?look=dashboard' });
      await page.waitForSelector('.dashboard-home-ref-seg', { timeout: 20000 });
      const box = await page.evaluate((long: string) => {
        const segs = [...document.querySelectorAll('.dashboard-home-ref-seg')] as HTMLElement[];
        const cell = segs[0]?.closest('.dashboard-home-ref') as HTMLElement | null;
        if (!segs.length || !cell) throw new Error('meta seg missing');
        segs[0].textContent = long;
        return {
          segs: segs.map((seg) => {
            const host = seg.closest('.dashboard-home-ref') as HTMLElement;
            const range = document.createRange();
            range.selectNodeContents(seg);
            const textRight = [...range.getClientRects()].reduce((max, r) => Math.max(max, r.right), 0);
            return {
              right: Math.max(seg.getBoundingClientRect().right, textRight),
              cellRight: host.getBoundingClientRect().right,
            };
          }),
          scrollWidth: cell.scrollWidth,
          clientWidth: cell.clientWidth,
        };
      }, LONG_META_SEG);
      await page.close();
      for (const [i, seg] of box.segs.entries()) {
        expect(seg.right, `seg ${i} right ≤ cell at ${width}`).toBeLessThanOrEqual(seg.cellRight + 1);
      }
      expect(box.scrollWidth, `cell scrollWidth at ${width}`).toBeLessThanOrEqual(box.clientWidth + 1);
    }
  }, 120000);

  it('P1-schedule-tracks: 768/1024/1280 header cell x equals row cell x', async () => {
    for (const width of [768, 1024, 1280] as const) {
      const page = await openPage({ width });
      await page.waitForSelector('.dashboard-home-row', { timeout: 20000 });
      const box = await page.evaluate(() => {
        const thead = document.querySelector('.dashboard-home-thead') as HTMLElement | null;
        const row = document.querySelector('.dashboard-home-row') as HTMLElement | null;
        if (!thead || !row) throw new Error('thead/row missing');
        const heads = [...thead.children] as HTMLElement[];
        const cells = [
          row.querySelector('.dashboard-home-time'),
          row.querySelector('.dashboard-home-job'),
          row.querySelector('.dashboard-home-place'),
        ] as Array<HTMLElement | null>;
        return heads.map((head, i) => ({
          head: head.getBoundingClientRect().left,
          cell: cells[i]?.getBoundingClientRect().left ?? -1,
        }));
      });
      await page.close();
      expect(box.length, `track cells at ${width}`).toBe(3);
      for (const pair of box) {
        expect(Math.abs(pair.head - pair.cell), `shared track at ${width}`).toBeLessThanOrEqual(1);
      }
    }
  }, 120000);

  it('P1-schedule-pill: Booked pill width is content width, not the column', async () => {
    for (const width of WIDTHS) {
      const page = await openPage({ width, js: dashJsNoProof, path: '/?look=dashboard' });
      await page.waitForSelector('.dashboard-home-crew-schedule', { timeout: 20000 });
      const box = await page.evaluate(() => {
        const pill = document.querySelector('.dashboard-home-crew-schedule') as HTMLElement | null;
        if (!pill) throw new Error('pill missing');
        const cs = getComputedStyle(pill);
        const range = document.createRange();
        range.selectNodeContents(pill);
        const textW = [...range.getClientRects()].reduce((max, r) => Math.max(max, r.width), 0);
        const pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        const border = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
        return {
          pillW: pill.getBoundingClientRect().width,
          contentW: textW + pad + border,
        };
      });
      await page.close();
      expect(
        Math.abs(box.pillW - box.contentW),
        `pill width ≈ content at ${width} (${box.pillW} vs ${box.contentW})`,
      ).toBeLessThanOrEqual(1);
    }
  }, 180000);

  it('P1-today-mark: changing NAV_WORDS.today changes the black bar text', async () => {
    const brandPath = join(process.cwd(), 'src/lib/brand.ts');
    const orig = readFileSync(brandPath, 'utf8');
    try {
      if (!orig.includes("today: 'Today'")) throw new Error('NAV_WORDS.today literal missing');
      writeFileSync(brandPath, orig.replace("today: 'Today'", "today: 'Tonight'"));
      const js = await bundleDashboard();
      writeFileSync(brandPath, orig);
      const page = await openPage({ width: 375, js });
      await page.waitForSelector('.dashboard-home-mark', { timeout: 20000 });
      const mark = await page.evaluate(() =>
        (document.querySelector('.dashboard-home-mark')?.textContent || '').trim(),
      );
      await page.close();
      expect(mark, 'black bar follows NAV_WORDS.today').toBe('Tonight');
    } finally {
      writeFileSync(brandPath, orig);
    }
  }, 120000);
});
