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

type KillPage = {
  goto: (url: string) => Promise<unknown>;
  evaluate: <T>(fn: (() => T | Promise<T>) | ((arg: never) => T | Promise<T>), arg?: unknown) => Promise<T>;
  emulateMedia: (opts: { colorScheme?: 'dark' | 'light' | 'no-preference' }) => Promise<void>;
  waitForSelector: (sel: string, opts?: { timeout?: number }) => Promise<unknown>;
  setViewportSize: (size: { width: number; height: number }) => Promise<void>;
  screenshot: (opts?: {
    type?: 'png';
    fullPage?: boolean;
    animations?: 'disabled' | 'allow';
    clip?: { x: number; y: number; width: number; height: number };
  }) => Promise<Buffer>;
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

async function bundleDashboard(): Promise<string> {
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
        build.onResolve({ filter: /(?:AuthContext|useCompanyAiKey|DevConsole|\/lib\/supabase)$/ }, (args) => {
          const spec = args.path.replace(/\\/g, '/');
          if (/AuthContext$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/useCompanyAiKey$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/DevConsole$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/\/lib\/supabase$/.test(spec)) return { path: mocks, namespace: 'file' };
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
const temps: string[] = [];

beforeAll(async () => {
  distCss = readDistCss();
  mainCss = ensureMainDistCss();
  dashJs = await bundleDashboard();
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
}): Promise<KillPage> {
  const html = fixtureHtml({
    js: dashJs,
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
    c.a > 0.01 && (closeRgb(c, 10, 37, 64) || closeRgb(c, 46, 117, 182));
  const isCream = (c: { r: number; g: number; b: number; a: number }) =>
    c.a > 0.01 && (closeRgb(c, 245, 240, 230) || closeRgb(c, 255, 253, 248));
  const paintHits = (want: 'navy' | 'cream') => [...document.querySelectorAll('.dashboard-home.ops-page, .dashboard-home.ops-page *')]
    .filter(vis)
    .flatMap((node) => {
      const el = node as HTMLElement;
      const s = getComputedStyle(el);
      const name = (el.getAttribute('aria-label') || el.textContent || el.className || '').toString().trim().slice(0, 48);
      const props: Array<[string, string]> = [
        ['color', s.color],
        ['background', s.backgroundColor],
        ['border', s.borderColor],
      ];
      if (s.boxShadow && s.boxShadow !== 'none') props.push(['box-shadow', s.boxShadow]);
      if (s.outlineStyle && s.outlineStyle !== 'none' && parseFloat(s.outlineWidth || '0') > 0) {
        props.push(['outline', s.outlineColor || s.outline]);
      }
      if (s.backgroundImage && s.backgroundImage !== 'none') props.push(['background-image', s.backgroundImage]);
      if (s.fill && s.fill !== 'none') props.push(['fill', s.fill]);
      if (s.stroke && s.stroke !== 'none') props.push(['stroke', s.stroke]);
      const match = want === 'navy' ? isNavy : isCream;
      return props
        .filter(([, val]) => colorsIn(val).some(match))
        .map(([prop, val]) => ({ name, prop, val }));
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

function overflowScript() {
  const vis = (el: Element) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const rights = [...document.querySelectorAll('body *')].filter(vis).map((el) => el.getBoundingClientRect().right);
  return {
    innerWidth: window.innerWidth,
    scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    maxRight: rights.length ? Math.max(...rights) : 0,
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
      const page = await openPage({ width });
      await page.waitForSelector('.shell-header', { timeout: 20000 });
      for (const mode of ['view', 'edit'] as const) {
        if (mode === 'edit') await enterEdit(page);
        const box = await page.evaluate(overflowScript);
        expect(box.scrollWidth, `scrollWidth at ${width} ${mode}`).toBeLessThanOrEqual(width);
        expect(box.maxRight, `max rect.right at ${width} ${mode}`).toBeLessThanOrEqual(width + 0.5);
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
    for (const width of WIDTHS) {
      const page = await openPage({ width });
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
    writeFileSync('/tmp/p1-r5-main-lines.json', JSON.stringify(derived, null, 2));
  }, 90000);
});
