/**
 * @vitest-environment node
 *
 * P3 Jobs Chromium kills. Real JobsPage / JobDetailPage / JobFormModal
 * mounts plus a fixture data layer. Painted values only. Filename omits
 * `.test.` so default vitest misses it. gates.sh runs this after build.
 */
import { createServer, type Server } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, extname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NAV_WORDS } from '../lib/brand';
import { JOB_ID_BATCH, chunkIds } from '../lib/jobIdBatch';
import { JOB_SHEET_BACK } from '../lib/jobSheetChrome';
import { canCreateJobInvoice, jobSheetInvoiceCtaLabel } from '../lib/jobSheetInvoiceCta';
import { JOB_SHEET_LINK } from '../lib/jobSheetLocks';
import {
  JOB_PARENT_INVOICED_SELECT,
  jobParentInvoicedEnabled,
  loadParentInvoiced,
} from '../lib/jobParentInvoiced';
import {
  JOB_SHEET_TABS,
  jobSheetPaperworkCount,
} from '../lib/jobSheetTabs';
import {
  JOB_PILL_DONE,
  JOB_PILL_NEEDS_CREW,
  JOB_PILL_NO_DATE,
  JOB_PILL_READY,
  jobStatusPill,
} from '../lib/jobStatusPill';
import {
  JOB_EXTRAS_INVOICE_SELECT,
  JOB_EXTRAS_QUOTE_SELECT,
} from '../lib/jobCardExtras';
import { jobsListPhoneLine2 } from '../lib/jobsListRow';
import { countJobsNeedCrew, jobNeedsCrew, needsCrew } from '../lib/needCrew';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild') as {
  build: (opts: Record<string, unknown>) => Promise<{ outputFiles?: Array<{ text: string }> }>;
};

const here = dirname(fileURLToPath(import.meta.url));
const WIDTHS = [375, 390, 768, 1024, 1280] as const;
const LOOK_SEED = ['Northside Electrical', 'Harbour Lights', 'Site labour', 'Warehouse lights'] as const;

type KillPage = {
  goto: (url: string) => Promise<unknown>;
  evaluate: <T>(fn: (() => T | Promise<T>) | ((arg: never) => T | Promise<T>), arg?: unknown) => Promise<T>;
  waitForSelector: (sel: string, opts?: { timeout?: number; state?: 'attached' | 'visible' | 'hidden' | 'detached' }) => Promise<unknown>;
  click: (sel: string) => Promise<unknown>;
  fill: (sel: string, value: string) => Promise<unknown>;
  setViewportSize: (size: { width: number; height: number }) => Promise<void>;
  setContent: (html: string) => Promise<unknown>;
  screenshot: (opts?: {
    type?: 'png';
    clip?: { x: number; y: number; width: number; height: number };
    fullPage?: boolean;
    animations?: 'disabled';
    path?: string;
  }) => Promise<Buffer>;
  close: () => Promise<void>;
};

type KillBrowser = {
  newContext: (opts: {
    viewport?: { width: number; height: number };
    timezoneId?: string; isMobile?: boolean;
  }) => Promise<{
    newPage: () => Promise<KillPage>;
    close: () => Promise<void>;
  }>;
  close: () => Promise<void>;
};

const KILL_TZ = process.env.TZ || 'Australia/Brisbane';
const NOTE_TOM_ISO = '2026-10-19T07:40:00.000Z';
const NOTE_DEAN_ISO = '2026-10-19T08:10:00.000Z';

type OverflowRow = {
  width: number;
  mode: 'VIEW' | 'EDIT';
  surface: 'list' | 'sheet' | 'form';
  scrollWidth: number;
  innerWidth: number;
  maxRight: number;
  scrollOk: boolean;
  rightOk: boolean;
};

const overflowRows: OverflowRow[] = [];

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
          launch: (opts: { headless: boolean; executablePath?: string; args?: string[] }) => Promise<KillBrowser>;
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

async function launchWebkit(): Promise<KillBrowser> {
  const errors: string[] = [];
  for (const spec of ['playwright', 'playwright-core']) {
    try {
      const mod = await import(spec) as {
        webkit: {
          launch: (opts: { headless: boolean; args?: string[] }) => Promise<KillBrowser>;
        };
      };
      return await mod.webkit.launch({ headless: true });
    } catch (err) {
      errors.push(`${spec}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(`webkit launch failed: ${errors.join('; ')}`);
}

function readDistCss(): string {
  const dir = join(process.cwd(), 'dist/assets');
  if (!existsSync(dir)) throw new Error('dist/assets missing; run npm run build');
  const files = readdirSync(dir).filter((name) => name.endsWith('.css'));
  if (!files.length) throw new Error('no dist CSS; run npm run build');
  return files.map((name) => readFileSync(join(dir, name), 'utf8')).join('\n')
    .replace(/font-display:\s*optional/g, 'font-display:swap');
}

async function bundleJobs(opts?: { lookProof?: boolean; dev?: boolean }): Promise<string> {
  const mocks = join(here, 'p3Jobs.chromium.mocks.ts');
  const result = await esbuild.build({
    absWorkingDir: process.cwd(),
    entryPoints: [join(here, 'p3Jobs.chromium.entry.tsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    logLevel: 'silent',
    define: {
      'process.env.NODE_ENV': '"test"',
      'import.meta.env.MODE': opts?.dev ? '"development"' : '"test"',
      'import.meta.env.DEV': opts?.dev ? 'true' : 'false',
      'import.meta.env.PROD': opts?.dev ? 'false' : 'true',
      'import.meta.env.SSR': 'false',
      'import.meta.env.VITE_LOOK_PROOF': opts?.lookProof === false ? 'undefined' : '"1"',
      'import.meta.env.VITE_SUPABASE_URL': '"https://example.supabase.co"',
      'import.meta.env.VITE_SUPABASE_ANON_KEY': '"test-anon-key"',
    },
    plugins: [{
      name: 'p3-jobs-mocks',
      setup(build: {
        onResolve: (
          opts: { filter: RegExp },
          cb: (args: { path: string }) => { path: string; namespace: string } | null,
        ) => void;
      }) {
        build.onResolve({ filter: /(?:AuthContext|useCompanyAiKey|DevConsole|GlobalSearch|(?:^|[./])supabase)$/ }, (args) => {
          const spec = args.path.replace(/\\/g, '/');
          if (/AuthContext$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/useCompanyAiKey$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/DevConsole$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/GlobalSearch$/.test(spec)) return { path: mocks, namespace: 'file' };
          if (/(?:^|[./])supabase$/.test(spec)) return { path: mocks, namespace: 'file' };
          return null;
        });
      },
    }],
  });
  const file = result.outputFiles?.[0];
  if (!file) throw new Error('esbuild produced no jobs bundle');
  return file.text;
}

function fixtureHtml(args: {
  js: string;
  css: string;
  path: string;
  empty?: boolean;
  clientsError?: boolean;
  extrasError?: boolean;
}): string {
  const cfg = JSON.stringify({
    path: args.path,
    empty: args.empty === true,
    clientsError: args.clientsError === true,
    extrasError: args.extrasError === true,
  });
  return `<!doctype html>
<html data-theme="light" data-allow-dark="false">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>${args.css}</style>
</head>
<body>
<div id="root"></div>
<script>window.__P3__ = ${cfg};</script>
<script>${args.js}</script>
</body>
</html>`;
}

let browser: KillBrowser;
let distCss = '';
let jobsJs = '';
let jobsJsNoProof = '';
let jobsJsDev = '';
let harnessDir = '';
let harnessPort = 0;
let harnessSeq = 0;
const temps: string[] = [];
const servers: Server[] = [];
const contexts: Array<{ close: () => Promise<void> }> = [];

function serveDir(root: string): Server {
  return createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    const rel = urlPath.replace(/^\/+/, '');
    const abs = join(root, rel);
    if (!abs.startsWith(root) || !existsSync(abs)) {
      res.statusCode = 404;
      res.end('not found');
      return;
    }
    res.setHeader('content-type', MOCKUP_MIME[extname(abs)] || 'application/octet-stream');
    res.end(readFileSync(abs));
  });
}

beforeAll(async () => {
  distCss = readDistCss();
  jobsJs = await bundleJobs();
  jobsJsNoProof = await bundleJobs({ lookProof: false });
  jobsJsDev = await bundleJobs({ dev: true });
  harnessDir = mkdtempSync(join(tmpdir(), 'p3-r9-harness-'));
  temps.push(harnessDir);
  mkdirSync(join(harnessDir, 'fonts'), { recursive: true });
  const geist = join(process.cwd(), 'public/fonts/Geist-Variable.woff2');
  if (existsSync(geist)) copyFileSync(geist, join(harnessDir, 'fonts/Geist-Variable.woff2'));
  const harness = serveDir(harnessDir);
  servers.push(harness);
  harnessPort = await listen(harness);
  browser = await launchBrowser();
}, 180000);

afterAll(async () => {
  if (process.env.P3_OVERFLOW === '1' && overflowRows.length) {
    console.log(`P3_OVERFLOW ${JSON.stringify(overflowRows)}`);
  }
  for (const context of contexts.splice(0)) {
    try { await context.close(); } catch { /* already closed */ }
  }
  await browser?.close();
  for (const server of servers.splice(0)) {
    try { server.close(); } catch { /* already closed */ }
  }
  for (const dir of temps.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* already gone */ }
  }
});

async function openPage(args: {
  width: number;
  path?: string;
  css?: string;
  js?: string;
  empty?: boolean;
  clientsError?: boolean;
  extrasError?: boolean;
  height?: number;
  timezoneId?: string;
}): Promise<KillPage> {
  const html = fixtureHtml({
    js: args.js ?? jobsJs,
    css: args.css ?? distCss,
    path: args.path ?? '/jobs',
    empty: args.empty,
    clientsError: args.clientsError,
    extrasError: args.extrasError,
  });
  const name = `t-${++harnessSeq}.html`;
  writeFileSync(join(harnessDir, name), html);
  const phone = args.width <= 430;
  const context = await browser.newContext({
    viewport: { width: args.width, height: args.height ?? (phone ? 844 : 900) },
    timezoneId: args.timezoneId ?? KILL_TZ, isMobile: false,
  });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${harnessPort}/${name}`);
  await page.waitForSelector('#root', { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  return page;
}

async function waitList(page: KillPage) {
  await page.waitForSelector('.hub-jobs-list-whisper', { timeout: 20000, state: 'attached' });
  await page.evaluate(async () => {
    for (let i = 0; i < 80; i += 1) {
      const whisper = (document.querySelector('.hub-jobs-list-whisper')?.textContent || '').trim();
      const rows = document.querySelector('[data-jobs-phone-list]');
      const empty = /No jobs yet/.test(document.body.textContent || '');
      if ((whisper && (rows || empty)) || empty) return;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  });
}

async function waitSheet(page: KillPage) {
  await page.waitForSelector('h1.hub-jobs-hero', { timeout: 20000, state: 'attached' });
  await page.evaluate(async () => {
    try {
      await document.fonts.load('600 14px Geist');
    } catch {
      /* already ready */
    }
    await document.fonts.ready;
  });
  await page.evaluate(async () => {
    for (let i = 0; i < 100; i += 1) {
      const h1 = (document.querySelector('h1.hub-jobs-hero')?.textContent || '').trim();
      const held = document.querySelector('[data-job-next-held="1"]');
      if (h1 && !held) return;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  });
}

async function waitSettledLayout(page: KillPage, sel = '.job-sheet-tabs') {
  await page.evaluate(async (selector: string) => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const target = (document.querySelector(selector) || document.body) as Element;
    await new Promise<void>((resolve) => {
      let last = Date.now();
      const ro = new ResizeObserver(() => { last = Date.now(); });
      ro.observe(target);
      const tick = () => {
        if (Date.now() - last >= 500) {
          ro.disconnect();
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, sel);
}

function textNodeWalkScript() {
  const range = document.createRange();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const overflow: { text: string; right: number; cls: string }[] = [];
  while (walk.nextNode()) {
    const node = walk.currentNode;
    if (!node.textContent?.trim()) continue;
    const parent = node.parentElement;
    if (!parent) continue;
    const cs = getComputedStyle(parent);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    range.selectNodeContents(node);
    for (const box of range.getClientRects()) {
      if (box.width > 0 && box.right > window.innerWidth + 0.5) {
        overflow.push({
          text: (node.textContent || '').slice(0, 48),
          right: box.right,
          cls: parent.className.toString().slice(0, 80),
        });
      }
    }
  }
  return { innerWidth: window.innerWidth, overflow, scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), bodyScrollWidth: document.body.scrollWidth };
}

function inkDotCount(shot: { width: number; height: number; pixels: number[][] }) {
  let n = 0;
  for (const p of shot.pixels) {
    const y = 0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2];
    if (y < 80) n += 1;
  }
  return n;
}

async function openForm(page: KillPage) {
  await page.evaluate(() => {
    const btn = document.querySelector('[data-jobs-new="1"]') as HTMLButtonElement | null;
    if (!btn) throw new Error('New job missing');
    btn.click();
  });
  await page.waitForSelector('[data-job-form="1"]', { timeout: 15000 });
}

function migrationColumns(table: string): Set<string> {
  const dir = join(process.cwd(), 'supabase/migrations');
  const cols = new Set<string>();
  const create = new RegExp(`create table(?: if not exists)? (?:public\\.)?${table}\\s*\\(([^;]+)\\)`, 'i');
  const alter = new RegExp(`alter table(?: if exists)? (?:public\\.)?${table}[\\s\\S]*?add column(?: if not exists)? ([a-z0-9_]+)`, 'gi');
  for (const name of readdirSync(dir).filter((file) => file.endsWith('.sql'))) {
    const sql = readFileSync(join(dir, name), 'utf8');
    const body = create.exec(sql)?.[1] ?? '';
    for (const line of body.split(',')) {
      const col = line.trim().match(/^([a-z][a-z0-9_]*)\s/i)?.[1];
      if (col && !/^(constraint|primary|unique|check|foreign)$/i.test(col)) cols.add(col);
    }
    let hit: RegExpExecArray | null;
    const add = new RegExp(alter.source, alter.flags);
    while ((hit = add.exec(sql))) cols.add(hit[1]);
  }
  return cols;
}

async function loadParentInvoicedRecorded(input: { companyId: string; parentJobId: string }) {
  const calls: string[] = [];
  const rows = [
    { id: 'inv-c1', company_id: 'c1', job_id: 'parent', status: 'sent' },
    { id: 'inv-c2', company_id: 'c2', job_id: 'parent', status: 'sent' },
  ];
  const client = createClient('https://example.supabase.co', 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url) => {
        const href = String(url);
        calls.push(href);
        const parsed = new URL(href);
        const filtered = rows.filter((row) => {
          for (const [key, raw] of parsed.searchParams) {
            if (key === 'select') continue;
            const [op, val] = raw.includes('.') ? [raw.slice(0, raw.indexOf('.')), raw.slice(raw.indexOf('.') + 1)] : ['eq', raw];
            const cell = String(row[key as keyof typeof row] ?? '');
            if (op === 'eq' && cell !== val) return false;
            if (op === 'neq' && cell === val) return false;
          }
          return true;
        });
        return new Response(JSON.stringify(filtered), {
          headers: { 'Content-Type': 'application/json' },
        });
      },
    },
  });
  const data = await loadParentInvoiced(input, client as unknown as Parameters<typeof loadParentInvoiced>[1]);
  return { data, calls };
}

function overflowScript() {
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
    bodyScrollWidth: document.body.scrollWidth,
    maxRight: rights.length ? Math.max(...rights) : 0,
  };
}

function recordOverflow(width: number, mode: OverflowRow['mode'], surface: OverflowRow['surface'], box: {
  innerWidth: number;
  scrollWidth: number;
  maxRight: number;
}) {
  overflowRows.push({
    width,
    mode,
    surface,
    scrollWidth: box.scrollWidth,
    innerWidth: box.innerWidth,
    maxRight: box.maxRight,
    scrollOk: box.scrollWidth <= box.innerWidth,
    rightOk: box.maxRight <= box.innerWidth,
  });
}

function lin(c: number) {
  const x = c / 255;
  return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
}

function lum(rgb: [number, number, number]) {
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

function contrastRatio(a: [number, number, number], b: [number, number, number]) {
  const left = lum(a);
  const right = lum(b);
  const hi = Math.max(left, right);
  const lo = Math.min(left, right);
  return (hi + 0.05) / (lo + 0.05);
}

async function samplePngFillAndText(buf: Buffer): Promise<{
  fill: [number, number, number];
  text: [number, number, number];
  contrast: number;
}> {
  const context = await browser.newContext({ viewport: { width: 64, height: 64 } });
  contexts.push(context);
  const page = await context.newPage();
  const b64 = buf.toString('base64');
  const painted = await page.evaluate(async (src: string) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    const dark: number[][] = [];
    const light: number[][] = [];
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 200) continue;
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (y < 60) dark.push([r, g, b]);
      if (y > 220) light.push([r, g, b]);
    }
    const mean = (rows: number[][]): [number, number, number] => {
      if (!rows.length) return [0, 0, 0];
      const n = rows.length;
      return [
        Math.round(rows.reduce((sum, row) => sum + row[0], 0) / n),
        Math.round(rows.reduce((sum, row) => sum + row[1], 0) / n),
        Math.round(rows.reduce((sum, row) => sum + row[2], 0) / n),
      ];
    };
    return { fill: mean(dark), text: mean(light), darks: dark.length, lights: light.length };
  }, b64);
  await context.close();
  expect(painted.darks, 'screenshot has dark CTA fill pixels').toBeGreaterThan(20);
  expect(painted.lights, 'screenshot has light CTA text pixels').toBeGreaterThan(20);
  const fill = painted.fill as [number, number, number];
  const text = painted.text as [number, number, number];
  return { fill, text, contrast: contrastRatio(fill, text) };
}

async function sampleCtaPaintedRgb(page: KillPage, sel: string): Promise<{
  center: [number, number, number];
  fill: [number, number, number];
}> {
  const clip = await page.evaluate((selector) => {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }, sel);
  if (!clip || clip.width < 8 || clip.height < 8) throw new Error(`CTA ${sel} has no painted rect`);
  const buf = await page.screenshot({
    type: 'png',
    animations: 'disabled',
    clip: {
      x: Math.max(0, clip.x),
      y: Math.max(0, clip.y),
      width: clip.width,
      height: clip.height,
    },
  });
  const b64 = buf.toString('base64');
  const probe = await browser.newContext({ viewport: { width: 64, height: 64 } });
  contexts.push(probe);
  const view = await probe.newPage();
  await view.setContent(`<!doctype html><canvas id="c"></canvas><script>
    window.__ready = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.getElementById('c');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const mid = ctx.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data;
        const fillX = Math.min(img.width - 1, Math.max(0, Math.round(img.width * 0.08)));
        const fill = ctx.getImageData(fillX, Math.floor(img.height / 2), 1, 1).data;
        resolve({
          center: [mid[0], mid[1], mid[2]],
          fill: [fill[0], fill[1], fill[2]],
        });
      };
      img.src = 'data:image/png;base64,${b64}';
    });
  </script>`);
  const rgb = await view.evaluate(() => (
    window as unknown as { __ready: Promise<{ center: [number, number, number]; fill: [number, number, number] }> }
  ).__ready);
  await probe.close();
  return rgb;
}

async function samplePaintedPixels(page: KillPage, sel: string, pad = 2): Promise<{
  width: number;
  height: number;
  pixels: number[][];
}> {
  const clip = await page.evaluate((selector) => {
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) return null;
    const box = el.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  }, sel);
  if (!clip || clip.width < 1 || clip.height < 1) throw new Error(`${sel} has no painted rect`);
  const vp = await page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const x = Math.max(0, Math.floor(clip.x) - pad);
  const y = Math.max(0, Math.floor(clip.y) - pad);
  const width = Math.max(3, Math.min(vp.w - x, Math.ceil(clip.width) + pad * 2));
  const height = Math.max(3, Math.min(vp.h - y, Math.ceil(clip.height) + pad * 2));
  const buf = await page.screenshot({
    type: 'png',
    animations: 'disabled',
    clip: { x, y, width, height },
  });
  const b64 = buf.toString('base64');
  const probe = await browser.newContext({ viewport: { width: Math.max(64, width), height: Math.max(64, height) } });
  contexts.push(probe);
  const view = await probe.newPage();
  await view.setContent(`<!doctype html><canvas id="c"></canvas><script>
    window.__ready = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.getElementById('c');
        c.width = img.width; c.height = img.height;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, img.width, img.height).data;
        const pixels = [];
        for (let i = 0; i < data.length; i += 4) pixels.push([data[i], data[i + 1], data[i + 2]]);
        resolve({ width: img.width, height: img.height, pixels });
      };
      img.src = 'data:image/png;base64,${b64}';
    });
  </script>`);
  const rgb = await view.evaluate(() => (
    window as unknown as { __ready: Promise<{ width: number; height: number; pixels: number[][] }> }
  ).__ready);
  await probe.close();
  return rgb;
}

function nearestPainted(
  shot: { width: number; height: number; pixels: number[][] },
  target: [number, number, number],
  region?: { x0: number; x1: number; y0: number; y1: number },
): { rgb: [number, number, number]; dist: number } {
  const x0 = Math.max(0, region?.x0 ?? 0);
  const y0 = Math.max(0, region?.y0 ?? 0);
  const x1 = Math.min(shot.width, region?.x1 ?? shot.width);
  const y1 = Math.min(shot.height, region?.y1 ?? shot.height);
  let best: [number, number, number] = [255, 255, 255];
  let bestDist = Infinity;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const p = shot.pixels[y * shot.width + x] as [number, number, number];
      const dist = Math.abs(p[0] - target[0]) + Math.abs(p[1] - target[1]) + Math.abs(p[2] - target[2]);
      if (dist < bestDist) {
        best = p;
        bestDist = dist;
      }
    }
  }
  return { rgb: best, dist: bestDist };
}

async function hideFixedNav(page: KillPage) {
  await page.evaluate(() => {
    document.querySelectorAll('.shell-bottom-nav, .tabbar, .home-ind').forEach((el) => {
      (el as HTMLElement).style.setProperty('display', 'none', 'important');
    });
  });
}

async function revealEl(page: KillPage, sel: string) {
  await hideFixedNav(page);
  await page.evaluate((selector) => {
    (document.querySelector(selector) as HTMLElement | null)?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, sel);
}

const MOCKUP_FIXTURE = join(process.cwd(), 'docs/look/p3/fixtures');

function mockupHtmlPath(): string {
  return join(MOCKUP_FIXTURE, 'job-390-light.html');
}

function mockupTokensPath(): string {
  return join(MOCKUP_FIXTURE, 'tokens.css');
}

function mockupAppCssPath(): string {
  return join(MOCKUP_FIXTURE, 'app.css');
}

function mockupDirectionPath(): string {
  return join(MOCKUP_FIXTURE, 'direction.css');
}

const MOCKUP_MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function writeMockupTree(root: string) {
  const htmlDir = join(root, 'directions/4-dark-light/html');
  const tokenDir = join(root, 'directions/4-dark-light');
  const srcDir = join(root, 'directions/_src');
  const fontDir = join(root, 'directions/fonts');
  mkdirSync(htmlDir, { recursive: true });
  mkdirSync(srcDir, { recursive: true });
  mkdirSync(fontDir, { recursive: true });
  copyFileSync(mockupHtmlPath(), join(htmlDir, 'job-390-light.html'));
  copyFileSync(mockupTokensPath(), join(tokenDir, 'tokens.css'));
  copyFileSync(mockupAppCssPath(), join(srcDir, 'app.css'));
  copyFileSync(mockupDirectionPath(), join(htmlDir, 'direction.css'));
  const geist = join(process.cwd(), 'public/fonts/Geist-Variable.woff2');
  if (existsSync(geist)) copyFileSync(geist, join(fontDir, 'Geist-VariableFont_wght.ttf'));
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('mockup server has no port'));
        return;
      }
      resolve(addr.port);
    });
    server.on('error', reject);
  });
}

async function openMockup(width = 390): Promise<KillPage> {
  const dir = mkdtempSync(join(tmpdir(), 'p3-r9-mock-'));
  temps.push(dir);
  writeMockupTree(dir);
  const server = serveDir(dir);
  servers.push(server);
  const port = await listen(server);
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    timezoneId: KILL_TZ, isMobile: false,
  });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/directions/4-dark-light/html/job-390-light.html`);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

function killIt(name: string, fn: () => Promise<unknown> | unknown, ms = 180000) {
  it(name, fn, ms);
}

describe('P3 K0 harness', () => {
  killIt('K0 paints the #0036 sheet from JobDetailPage', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    const read = await page.evaluate(() => {
      const painted = (el: Element | null) => {
        if (!el) return false;
        const node = el as HTMLElement;
        const style = getComputedStyle(node);
        const box = node.getBoundingClientRect();
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        if (box.width <= 0 || box.height <= 0) return false;
        if (box.right <= 0 || box.bottom <= 0 || box.left >= vw || box.top >= vh) return false;
        if (typeof node.checkVisibility === 'function'
          && !node.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
        return true;
      };
      const when = document.querySelector('[data-job-sheet="when"]') as HTMLElement | null;
      const more = document.querySelector('.job-sheet-appbar .hub-job-more') as HTMLElement | null;
      const search = document.querySelector('.job-sheet-appbar-search') as HTMLElement | null;
      const avatar = document.querySelector('.job-sheet-appbar-avatar') as HTMLElement | null;
      const chevron = document.querySelector('.job-sheet-back-chevron') as HTMLElement | null;
      const pageEl = document.querySelector('.hub-jobs.is-record-open.ops-page') as HTMLElement | null;
      return {
        h1: document.querySelector('h1.hub-jobs-hero')?.textContent ?? '',
        cta: document.querySelector('.btn-primary')?.textContent ?? '',
        when: when?.textContent ?? '',
        whenPainted: painted(when),
        sub: document.querySelector('[data-job-sheet="sub"]')?.textContent ?? '',
        back: document.querySelector('.job-sheet-back')?.textContent ?? '',
        text: document.body.innerText,
        morePainted: painted(more),
        searchBesideAvatar: !!search && !!avatar
          && search.getBoundingClientRect().right <= avatar.getBoundingClientRect().left + 2
          && Math.abs(search.getBoundingClientRect().top - avatar.getBoundingClientRect().top) <= 8,
        chevronColor: chevron ? getComputedStyle(chevron).color : '',
        pageBg: pageEl ? getComputedStyle(pageEl).backgroundColor : '',
        gutter: pageEl ? parseFloat(getComputedStyle(pageEl).paddingLeft) : -1,
      };
    });
    await page.close();
    expect(read.h1).toBe('Blocked sewer, CCTV inspection');
    expect(read.cta.replace(/\s+/g, ' ').trim()).toBe(jobSheetInvoiceCtaLabel(919.05));
    expect(read.whenPainted, 'when line is painted (display/visibility/size/on-screen)').toBe(true);
    expect(read.when).toContain('Mon 19 Oct');
    expect(read.when).toContain('07:00–10:30');
    expect(read.when).not.toContain(' – ');
    expect(read.sub).toBe('4 bill lines · 4.4 h logged');
    expect(read.back).toBe(JOB_SHEET_BACK);
    expect(read.text).toContain('JOB #0036');
    expect(read.text).toContain('Ready to invoice');
    expect(read.text).not.toMatch(/Relovi|Littleloop|booking/i);
    expect(read.morePainted, 'phone appbar has no … menu').toBe(false);
    expect(read.searchBesideAvatar, 'search sits right beside the avatar').toBe(true);
    expect(read.chevronColor.replace(/\s+/g, '')).toMatch(/rgb\(24,\s*63,\s*184\)/);
    expect(read.pageBg.replace(/\s+/g, '')).toMatch(/rgb\(245,\s*245,\s*247\)/);
    expect(read.gutter).toBe(16);
  });

});

describe('P3 list kills', () => {
  killIt('K1 paints Jobs, need-crew whisper, and no List bar', async () => {
    const page = await openPage({ width: 390, path: '/jobs' });
    await waitList(page);
    const read = await page.evaluate(() => ({
      h1: document.querySelector('h1')?.textContent ?? '',
      whisper: document.querySelector('.hub-jobs-list-whisper')?.textContent ?? '',
      listBar: !!document.querySelector('.hub-jobs-list-bar'),
    }));
    await page.close();
    expect(read.h1).toBe('Jobs');
    expect(read.whisper).toBe('All · 17 jobs · 3 need crew');
    expect(read.listBar).toBe(false);
    expect(countJobsNeedCrew([
      { status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: [] },
      { status: 'scheduled', scheduled_date: null, assigned_team: [] },
      { status: 'completed', scheduled_date: '2026-10-19', assigned_team: [] },
    ])).toBe(1);
  });

  killIt('K1b undated crewless job is excluded from needsCrew and the count', async () => {
    const page = await openPage({ width: 390, path: '/jobs' });
    await waitList(page);
    const read = await page.evaluate(() => {
      const undated = [...document.querySelectorAll('[data-jobs-phone-row="p3-undated"]')];
      return {
        whisper: document.querySelector('.hub-jobs-list-whisper')?.textContent ?? '',
        undatedText: undated.map((el) => el.textContent).join(' '),
        needCrewPills: [...document.querySelectorAll('[data-jobs-phone-list] [data-jobs-pill="needs_crew"]')].length,
        noDatePills: [...document.querySelectorAll('[data-jobs-phone-list] [data-jobs-pill="no_date"]')].length,
      };
    });
    await page.close();
    expect(jobNeedsCrew({ status: 'scheduled', scheduled_date: null, assigned_team: [] })).toBe(false);
    expect(read.whisper).toBe('All · 17 jobs · 3 need crew');
    expect(read.whisper).not.toContain('4 need crew');
    expect(read.undatedText).toContain('No date');
    expect(read.undatedText).not.toContain('Set a date');
    expect(read.undatedText).not.toContain('Needs crew');
    expect(read.needCrewPills).toBe(3);
    expect(read.noDatePills).toBeGreaterThanOrEqual(1);
  });

  killIt('OWN-c whitespace crew ids paint Needs crew on 390 and 1280', async () => {
    const phone = await openPage({ width: 390, path: '/jobs' });
    await waitList(phone);
    const phoneRead = await phone.evaluate(() => ({
      pill: (document.querySelector('[data-jobs-phone-row="x-ws"] [data-jobs-pill]')?.textContent || '').trim(),
      kind: document.querySelector('[data-jobs-phone-row="x-ws"] [data-jobs-pill]')?.getAttribute('data-jobs-pill') || '',
      next: (document.querySelector('[data-jobs-phone-row="x-ws"] [data-job-list-next]')?.textContent || '').trim(),
    }));
    await phone.close();
    const desk = await openPage({ width: 1280, path: '/jobs' });
    await waitList(desk);
    const deskRead = await desk.evaluate(() => {
      const row = [...document.querySelectorAll('.hub-jobs-row')].find((el) => (
        (el.querySelector('.hub-jobs-title')?.textContent || '').includes('Whitespace crew')
      ));
      return {
        pill: (row?.querySelector('[data-jobs-pill]')?.textContent || '').trim(),
        next: (row?.querySelector('[data-job-list-next]')?.textContent || '').trim(),
      };
    });
    await desk.close();
    const sheet = await openPage({ width: 390, path: '/jobs/x-ws' });
    await waitSheet(sheet);
    const sheetPill = await sheet.evaluate(() => (
      (document.querySelector('[data-job-sheet-pill]')?.textContent || '').trim()
    ));
    await sheet.close();
    expect(phoneRead.kind).toBe('needs_crew');
    expect(phoneRead.pill).toBe(JOB_PILL_NEEDS_CREW);
    expect(phoneRead.next).toBe('Assign crew');
    expect(deskRead.pill).toBe(JOB_PILL_NEEDS_CREW);
    expect(deskRead.next).toBe('Assign crew');
    expect(sheetPill).toBe(JOB_PILL_NEEDS_CREW);
  });

  killIt('OWN-d undated row is No date only, never need crew, on list and sheet', async () => {
    const phone = await openPage({ width: 390, path: '/jobs' });
    await waitList(phone);
    const phoneText = await phone.evaluate(() => {
      const row = document.querySelector('[data-jobs-phone-row="p3-undated"]') as HTMLElement | null;
      return {
        pill: (row?.querySelector('[data-jobs-pill]')?.textContent || '').trim(),
        text: row?.innerText || '',
      };
    });
    await phone.close();
    const desk = await openPage({ width: 1280, path: '/jobs' });
    await waitList(desk);
    const deskText = await desk.evaluate(() => {
      const row = [...document.querySelectorAll('.hub-jobs-row')].find((el) => (
        (el.querySelector('.hub-jobs-title')?.textContent || '').includes('Undated crewless')
      ));
      return {
        pill: (row?.querySelector('[data-jobs-pill]')?.textContent || '').trim(),
        text: (row as HTMLElement | undefined)?.innerText || '',
      };
    });
    await desk.close();
    const sheet = await openPage({ width: 390, path: '/jobs/p3-undated' });
    await waitSheet(sheet);
    const sheetRead = await sheet.evaluate(() => ({
      pill: (document.querySelector('[data-job-sheet-pill]')?.textContent || '').trim(),
      text: document.body.innerText,
    }));
    await sheet.close();
    expect(phoneText.pill).toBe(JOB_PILL_NO_DATE);
    expect(phoneText.text).not.toContain('Set a date');
    expect(phoneText.text).not.toMatch(/needs? crew/i);
    expect(deskText.pill).toBe(JOB_PILL_NO_DATE);
    expect(deskText.text).not.toContain('Set a date');
    expect(deskText.text).not.toMatch(/needs? crew/i);
    expect(sheetRead.pill).toBe(JOB_PILL_NO_DATE);
    expect(sheetRead.text).toContain('Set a date');
    expect(sheetRead.text).not.toMatch(/needs? crew/i);
  });

  killIt('K2 search is visible and chips wrap', async () => {
    const page = await openPage({ width: 390, path: '/jobs' });
    await waitList(page);
    const read = await page.evaluate(() => {
      const search = document.querySelector('.hub-jobs-list-search input') as HTMLElement | null;
      const details = document.querySelector('.hub-jobs-list-search details');
      const chips = [...document.querySelectorAll('.hub-jobs-list-filter')].map((el) => el.getBoundingClientRect().right);
      return {
        searchVisible: !!search && (search.getBoundingClientRect().width ?? 0) > 40,
        details: !!details,
        chipRight: chips.length ? Math.max(...chips) : 0,
        viewW: window.innerWidth,
      };
    });
    await page.close();
    expect(read.searchVisible).toBe(true);
    expect(read.details).toBe(false);
    expect(read.chipRight).toBeLessThanOrEqual(read.viewW + 1);
  });

  killIt('K3 paints phone line 2 and no-crew / Set a date', async () => {
    const page = await openPage({ width: 390, path: '/jobs' });
    await waitList(page);
    const read = await page.evaluate(() => ({
      line36: document.querySelector('[data-jobs-phone-row="p3-0036"] .hub-jobs-phone-meta')?.textContent ?? '',
      undated: document.querySelector('[data-jobs-phone-row="p3-undated"]')?.textContent ?? '',
      next: document.querySelector('[data-jobs-phone-row="p3-undated"] [data-job-list-next]')?.textContent ?? '',
    }));
    await page.close();
    expect(read.line36).toBe('#0036 · Stafford · Dean Moretti, Tom Nguyen');
    expect(read.undated).toContain('No crew yet');
    expect(read.undated).toContain('No date');
    expect(read.undated).not.toContain('Set a date');
    expect(read.next).toBe('');
    expect(jobsListPhoneLine2({ ref: '#0036', suburb: 'Stafford', crew: 'Dean Moretti, Tom Nguyen' }))
      .toBe('#0036 · Stafford · Dean Moretti, Tom Nguyen');
  });

});

describe('P3 sheet pills CTA Q-J1 tabs', () => {
  killIt('K4 D1 pills including parent invoice and extras error', async () => {
    const page = await openPage({ width: 390, path: '/jobs' });
    await waitList(page);
    const read = await page.evaluate(() => {
      const child = document.querySelector('[data-jobs-phone-row="p3-void-child"] [data-jobs-pill]');
      const parent = document.querySelector('[data-jobs-phone-row="p3-void-parent"] [data-jobs-pill]');
      return {
        child: child?.textContent ?? '',
        childKind: child?.getAttribute('data-jobs-pill') ?? '',
        parent: parent?.textContent ?? '',
      };
    });
    await page.close();
    expect(read.child).toBe(JOB_PILL_READY);
    expect(read.childKind).toBe('ready_to_invoice');
    expect(read.parent).toBe(JOB_PILL_READY);
    expect(jobStatusPill({
      status: 'completed',
      invoices: [],
      parentInvoices: [{ status: 'void' }],
    }).label).toBe(JOB_PILL_READY);
    expect(jobStatusPill({ status: 'completed', invoices: [{ status: 'void' }] }).label).toBe(JOB_PILL_READY);
    expect(jobStatusPill({ status: 'completed', invoices: [{ status: 'draft' }] }).label).toBe(JOB_PILL_DONE);
    expect(jobStatusPill({
      status: 'completed',
      invoices: [],
      parentInvoices: [{ status: 'sent' }],
    }).label).toBe(JOB_PILL_DONE);
    expect(jobStatusPill({
      status: 'completed',
      invoices: [],
      children: [{ status: 'scheduled' }],
    }).label).toBe(JOB_PILL_DONE);
    expect(jobStatusPill({ status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: [] }).kind)
      .toBe('needs_crew');
    expect(jobStatusPill({ status: 'scheduled', scheduled_date: null }).label).toBe(JOB_PILL_NO_DATE);
    expect(jobStatusPill({ status: 'completed', invoices: [], invoiceReadError: true }).kind)
      .not.toBe('ready_to_invoice');
    expect(jobStatusPill({ status: 'booked', scheduled_date: '2026-10-19', assigned_team: [] }).kind)
      .toBe('needs_crew');
  });

  killIt('K5 paints eyebrow, when, CTA money, sub line', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    const read = await page.evaluate(() => ({
      eyebrow: document.querySelector('.job-sheet-ref')?.textContent ?? '',
      when: document.querySelector('[data-job-sheet="when"]')?.textContent ?? '',
      cta: (document.querySelector('.btn-primary')?.textContent ?? '').replace(/\s+/g, ' ').trim(),
      sub: document.querySelector('[data-job-sheet="sub"]')?.textContent ?? '',
    }));
    await page.close();
    expect(read.eyebrow).toBe('JOB #0036');
    expect(read.when).toContain('Mon 19 Oct · 07:00–10:30');
    expect(read.cta).toBe(jobSheetInvoiceCtaLabel(919.05));
    expect(read.sub).toBe('4 bill lines · 4.4 h logged');
    expect(canCreateJobInvoice('owner')).toBe(true);
    expect(canCreateJobInvoice('member')).toBe(false);
  });

  killIt('K6 Q-J1 records company_id, parent job_id, and neq void', async () => {
    expect(jobParentInvoicedEnabled({ status: 'completed', parent_job_id: 'parent' })).toBe(true);
    expect(jobParentInvoicedEnabled({ status: 'scheduled', parent_job_id: 'parent' })).toBe(false);
    const { data, calls } = await loadParentInvoicedRecorded({ companyId: 'c1', parentJobId: 'parent' });
    expect(data.map((row) => row.id)).toEqual(['inv-c1']);
    expect(data.some((row) => row.id === 'inv-c2')).toBe(false);
    expect(calls.some((url) => url.includes('company_id=eq.c1'))).toBe(true);
    expect(calls.some((url) => url.includes('job_id=eq.parent'))).toBe(true);
    expect(calls.some((url) => url.includes('status=neq.void'))).toBe(true);
  });


  killIt('K7 four tabs one row, People label, Coach #5 paperwork excludes notes', async () => {
    for (const width of [375, 390] as const) {
      const page = await openPage({ width, path: '/jobs/p3-0036' });
      await waitSheet(page);
      const read = await page.evaluate(() => {
        const textBox = (el: HTMLElement) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const rects = [...range.getClientRects()].filter((box) => box.width > 0 && box.height > 0);
          if (!rects.length) return { left: 0, right: 0, top: 0, bottom: 0 };
          return {
            left: Math.min(...rects.map((box) => box.left)),
            right: Math.max(...rects.map((box) => box.right)),
            top: Math.min(...rects.map((box) => box.top)),
            bottom: Math.max(...rects.map((box) => box.bottom)),
          };
        };
        const tabs = [...document.querySelectorAll('.job-sheet-tab')] as HTMLElement[];
        const rail = document.querySelector('.job-sheet-tabs') as HTMLElement;
        const boxes = tabs.map((tab) => {
          const tabBox = tab.getBoundingClientRect();
          const label = textBox(tab);
          return {
            label: tab.textContent?.trim() ?? '',
            tab: { left: tabBox.left, right: tabBox.right, top: tabBox.top, bottom: tabBox.bottom },
            text: label,
            textInside: label.left >= tabBox.left - 0.5
              && label.right <= tabBox.right + 0.5
              && label.top >= tabBox.top - 0.5
              && label.bottom <= tabBox.bottom + 0.5,
          };
        });
        const overlap = boxes.some((a, i) => boxes.some((b, j) => (
          i < j
          && a.tab.left < b.tab.right - 0.5
          && b.tab.left < a.tab.right - 0.5
          && a.tab.top < b.tab.bottom - 0.5
          && b.tab.top < a.tab.bottom - 0.5
        )));
        const tops = tabs.map((t) => Math.round(t.getBoundingClientRect().top));
        return {
          labels: boxes.map((row) => row.label),
          heights: tabs.map((t) => t.getBoundingClientRect().height),
          rights: tabs.map((t) => t.getBoundingClientRect().right),
          tops,
          columns: getComputedStyle(rail).gridTemplateColumns.split(' ').filter(Boolean).length,
          uniqueLefts: new Set(tabs.map((t) => Math.round(t.getBoundingClientRect().left))).size,
          viewW: window.innerWidth,
          scroll: rail.scrollWidth,
          client: rail.clientWidth,
          textInside: boxes.map((row) => row.textInside),
          textRights: boxes.map((row) => row.text.right),
          overlap,
        };
      });
      await page.close();
      expect(read.labels, `${width} labels`).toEqual(['Overview', 'People', 'Paperwork 2', 'Materials 4']);
      expect(Math.min(...read.heights)).toBeGreaterThanOrEqual(44);
      expect(Math.max(...read.rights), `${width} tab right`).toBeLessThanOrEqual(read.viewW + 1);
      expect(read.scroll).toBeLessThanOrEqual(read.client + 1);
      expect(read.columns).toBe(4);
      expect(read.uniqueLefts, `${width} unique tab columns`).toBe(4);
      expect(Math.max(...read.tops) - Math.min(...read.tops)).toBeLessThanOrEqual(2);
      expect(read.overlap, `${width} tabs overlap`).toBe(false);
      for (const [i, inside] of read.textInside.entries()) {
        expect(inside, `${width} ${read.labels[i]} text sits inside its tab (right ${read.textRights[i]})`).toBe(true);
      }
    }
    expect(JOB_SHEET_TABS.map((t) => t.label)).toEqual(['Overview', 'People', 'Paperwork', 'Materials']);
    expect(jobSheetPaperworkCount({
      jhaCount: 1, take5Count: 0, inspectionCount: 0, quoteCount: 1, invoiceCount: 0,
    })).toBe(2);
  });

});

describe('P3 overview people form bar', () => {
  killIt('K8 overview kv, notes, 6 photos, bill', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    const read = await page.evaluate((stamps: { tom: string; dean: string }) => {
      const hmm = (iso: string) => {
        const date = new Date(iso);
        return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
      };
      const painted = (el: Element | null) => {
        if (!el) return false;
        const node = el as HTMLElement;
        if (typeof node.checkVisibility === 'function' && !node.checkVisibility()) return false;
        const box = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return box.width > 0 && box.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      };
      const kv = [...document.querySelectorAll('[data-job-sheet^="kv-"]')].map((el) => (
        el.getAttribute('data-job-sheet')
      ));
      const site = document.querySelector('[data-job-sheet="kv-site"]') as HTMLElement | null;
      const label = site?.querySelector('.job-sheet-kv-label') as HTMLElement | null;
      const value = site?.querySelector('.job-sheet-kv-value') as HTMLElement | null;
      const go = document.querySelector('[data-job-sheet="kv-site"] a') as HTMLAnchorElement | null;
      const call = document.querySelector('[data-job-sheet="kv-phone"] a') as HTMLAnchorElement | null;
      const notes = document.querySelector('[data-job-sheet="notes"]') as HTMLElement | null;
      const crew = document.querySelector('[data-job-sheet="kv-crew"]') as HTMLElement | null;
      const detail = document.querySelector('.ops-next-detail') as HTMLElement | null;
      const shell = document.querySelector('.shell-header') as HTMLElement | null;
      const appbar = document.querySelector('.job-sheet-appbar') as HTMLElement | null;
      const labelBox = label?.getBoundingClientRect();
      const valueBox = value?.getBoundingClientRect();
      const notesBox = notes?.getBoundingClientRect();
      const crewBox = crew?.getBoundingClientRect();
      const all = document.body.innerText;
      return {
        kv,
        go: go?.href ?? '',
        call: call?.getAttribute('href') ?? '',
        notes: notes?.textContent ?? '',
        photos: document.querySelectorAll('.job-sheet-photo').length,
        all,
        tom: hmm(stamps.tom),
        dean: hmm(stamps.dean),
        labelLeftOfValue: !!labelBox && !!valueBox
          && labelBox.right <= valueBox.left + 2
          && Math.abs(labelBox.top - valueBox.top) <= 12,
        notesBelowCrew: (notesBox?.top ?? 0) >= (crewBox?.bottom ?? 99) - 2,
        fromJobPainted: painted(detail) || (all.includes('From job') && painted(detail)),
        fromJobText: all.includes('From job'),
        shellPainted: painted(shell),
        appbarPainted: painted(appbar),
      };
    }, { tom: NOTE_TOM_ISO, dean: NOTE_DEAN_ISO });
    await page.close();
    expect(read.kv).toEqual(['kv-site', 'kv-client', 'kv-phone', 'kv-crew']);
    expect(read.go).toContain('maps.google.com');
    expect(read.call).toMatch(/tel:0400/);
    expect(read.notes).toContain(`Tom Nguyen · ${read.tom}`);
    expect(read.notes).toContain(`Dean Walsh · ${read.dean}`);
    expect(read.photos).toBe(6);
    expect(read.all).toContain('All photos');
    expect(read.all).toContain('Total (inc GST)');
    expect(read.all).toContain('$919.05');
    expect(read.all).toContain('Edit bill');
    expect(read.labelLeftOfValue, 'Site label sits left of the address').toBe(true);
    expect(read.notesBelowCrew, 'Notes stay under Crew, not beside it').toBe(true);
    expect(read.fromJobPainted, 'From job line stays off the sheet').toBe(false);
    expect(read.fromJobText, 'From job copy stays off the sheet').toBe(false);
    expect(read.shellPainted, 'GRAFTER shell header stays off the phone sheet').toBe(false);
    expect(read.appbarPainted, 'back-bar with search and avatar paints').toBe(true);

    const wide = await openPage({ width: 1280, path: '/jobs/p3-0036' });
    await waitSheet(wide);
    const wideRead = await wide.evaluate(() => {
      const notes = document.querySelector('[data-job-sheet="notes"]') as HTMLElement | null;
      const photos = document.querySelector('[data-job-sheet="photos"]') as HTMLElement | null;
      const crew = document.querySelector('[data-job-sheet="kv-crew"]') as HTMLElement | null;
      return {
        notesWidth: notes?.getBoundingClientRect().width ?? 0,
        photosWidth: photos?.getBoundingClientRect().width ?? 0,
        notesTop: notes?.getBoundingClientRect().top ?? 0,
        crewBottom: crew?.getBoundingClientRect().bottom ?? 0,
        innerWidth: window.innerWidth,
      };
    });
    await wide.close();
    expect(wideRead.notesWidth, '1280 Notes not a sub-column').toBeGreaterThan(720);
    expect(wideRead.photosWidth, '1280 Photos not a sub-column').toBeGreaterThan(720);
    expect(wideRead.notesTop, '1280 Notes stay under Crew').toBeGreaterThan(wideRead.crewBottom - 2);

    for (const tz of ['UTC', 'Australia/Brisbane', 'America/Los_Angeles'] as const) {
      const tzPage = await openPage({ width: 390, path: '/jobs/p3-0036', timezoneId: tz });
      await waitSheet(tzPage);
      const stamp = await tzPage.evaluate((tomIso: string) => {
        const date = new Date(tomIso);
        const hmm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        return {
          painted: document.querySelector('[data-job-sheet="notes"]')?.textContent ?? '',
          hmm,
        };
      }, NOTE_TOM_ISO);
      await tzPage.close();
      expect(stamp.painted, `K8 Tom stamp under ${tz}`).toContain(`Tom Nguyen · ${stamp.hmm}`);
    }
  });

  killIt('K9 people / paperwork / materials panes exist', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    await page.evaluate(() => {
      const tab = [...document.querySelectorAll('.job-sheet-tab')].find((el) => (
        (el.textContent || '').includes('People')
      )) as HTMLElement | undefined;
      tab?.click();
    });
    await page.evaluate(async () => {
      for (let i = 0; i < 40; i += 1) {
        if (document.getElementById('job-schedule') && !document.getElementById('job-schedule')?.hidden) return;
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
    });
    const people = await page.evaluate(() => ({
      schedule: !!document.getElementById('job-schedule'),
      hours: !!document.getElementById('job-hours'),
    }));
    await page.evaluate(() => {
      const tab = [...document.querySelectorAll('.job-sheet-tab')].find((el) => (
        (el.textContent || '').includes('Paperwork')
      )) as HTMLElement | undefined;
      tab?.click();
    });
    await page.evaluate(async () => {
      for (let i = 0; i < 40; i += 1) {
        if (document.querySelector('.job-sheet-group')) return;
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
    });
    const paper = await page.evaluate(() => (
      [...document.querySelectorAll('.job-sheet-group')].map((el) => el.textContent)
    ));
    await page.evaluate(() => {
      const tab = [...document.querySelectorAll('.job-sheet-tab')].find((el) => (
        (el.textContent || '').includes('Materials')
      )) as HTMLElement | undefined;
      tab?.click();
    });
    const bill = await page.evaluate(() => !!document.getElementById('job-bill'));
    await page.close();
    expect(people.schedule).toBe(true);
    expect(people.hours).toBe(true);
    expect(paper).toEqual(['Safety', 'Field records', 'Quotes & invoices']);
    expect(bill).toBe(true);
  });

  killIt('K10 more menu copy stays on the job sheet source', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    await page.evaluate(() => {
      const more = document.querySelector('.hub-job-more') as HTMLDetailsElement | null;
      if (more) more.open = true;
    });
    const items = await page.evaluate(() => (
      [...document.querySelectorAll('.hub-job-more-menu [role="menuitem"]')]
        .map((el) => (el.textContent || '').trim())
    ));
    await page.close();
    for (const item of ['Post update', 'Start inspection', 'Gallery', 'Invoice', 'Clock on', 'Details', 'Add to calendar']) {
      expect(items, item).toContain(item);
    }
  });

  killIt('K11 enquiry actions stay on the jobs list source', async () => {
    const page = await openPage({ width: 390, path: '/jobs?look=enquiries', js: jobsJsDev });
    await page.waitForSelector('[data-enquiry-call]', { timeout: 20000, state: 'attached' });
    const read = await page.evaluate(() => {
      const btn = document.querySelector('[data-enquiry-call]') as HTMLAnchorElement | null;
      const r = btn?.getBoundingClientRect();
      return {
        text: btn?.textContent ?? '',
        href: btn?.getAttribute('href') ?? '',
        disabled: btn?.getAttribute('aria-disabled') ?? btn?.getAttribute('disabled'),
        w: r?.width ?? 0,
        h: r?.height ?? 0,
      };
    });
    await page.close();
    expect(read.text).toContain('Call back');
    expect(read.href).toMatch(/^tel:/);
    expect(read.disabled).toBeFalsy();
    expect(read.w).toBeGreaterThan(0);
    expect(read.h).toBeGreaterThanOrEqual(44);
  });

  killIt('K12 phone sheet is full width and desktop modal is 560', async () => {
    const formPage = await openPage({ width: 390, path: '/jobs' });
    await waitList(formPage);
    await openForm(formPage);
    const form = await formPage.evaluate(() => {
      const sheet = document.querySelector('.job-form-sheet') as HTMLElement;
      const footer = document.querySelector('.job-form-footer') as HTMLElement;
      return {
        title: document.querySelector('[data-job-form="1"] h2')?.textContent ?? '',
        sheetW: sheet.getBoundingClientRect().width,
        footerBottom: footer.getBoundingClientRect().bottom,
        viewH: window.innerHeight,
        viewW: window.innerWidth,
      };
    });
    await formPage.close();
    expect(form.title).toBe('New job');
    expect(form.sheetW).toBeGreaterThan(form.viewW - 2);
    expect(form.footerBottom).toBeLessThanOrEqual(form.viewH + 1);

    const desk = await openPage({ width: 768, path: '/jobs' });
    await waitList(desk);
    await openForm(desk);
    const deskRead = await desk.evaluate(() => {
      const sheet = document.querySelector('.job-form-sheet') as HTMLElement;
      return Math.round(sheet.getBoundingClientRect().width);
    });
    await desk.close();
    expect(deskRead).toBe(560);
  });

  killIt('K12b 768 JobFormModal is 560 with 16px gutters and no inner sideways scroll', async () => {
    const page = await openPage({ width: 768, path: '/jobs' });
    await waitList(page);
    await openForm(page);
    const box = await page.evaluate(() => {
      const sheet = document.querySelector('.job-form-sheet') as HTMLElement;
      const r = sheet.getBoundingClientRect();
      return {
        width: r.width,
        left: r.left,
        right: r.right,
        innerWidth: window.innerWidth,
        scrollWidth: sheet.scrollWidth,
        clientWidth: sheet.clientWidth,
      };
    });
    await page.close();
    expect(Math.abs(box.width - 560)).toBeLessThanOrEqual(1);
    expect(box.left).toBeGreaterThanOrEqual(16);
    expect(box.right).toBeLessThanOrEqual(box.innerWidth - 16);
    expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth);
  });

  killIt('K13 extras-read failure keeps a completed job off Ready to invoice', async () => {
    const page = await openPage({ width: 390, path: '/jobs', extrasError: true });
    await waitList(page);
    const read = await page.evaluate(() => {
      const row = document.querySelector('[data-jobs-phone-row="p3-0036"]');
      return {
        pill: (row?.querySelector('[data-jobs-pill]')?.textContent || '').trim(),
        kind: row?.querySelector('[data-jobs-pill]')?.getAttribute('data-jobs-pill') || '',
        text: (row as HTMLElement | null)?.innerText || '',
      };
    });
    await page.close();
    expect(read.kind).toBe('done');
    expect(read.pill).toBe(JOB_PILL_DONE);
    expect(read.text).not.toContain(JOB_PILL_READY);
    expect(jobStatusPill({ status: 'completed', invoices: [], invoiceReadError: true }).kind)
      .not.toBe('ready_to_invoice');
  });

  killIt('K14 reachability controls are at least 44 tall', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    const read = await page.evaluate(() => {
      const sels = ['.job-sheet-back', '.job-sheet-tab', '.btn-primary', '.job-sheet-kv-act', '.job-sheet-photo', '.job-sheet-section-head .job-sheet-link'];
      return sels.map((sel) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        const r = el?.getBoundingClientRect();
        return { sel, h: r?.height ?? 0, w: r?.width ?? 0 };
      });
    });
    await page.close();
    for (const row of read) {
      expect(row.h, row.sel).toBeGreaterThanOrEqual(44);
    }
  });

  killIt('K15 recorded select columns sit in the live migration chain', async () => {
    const pinned = [
      { table: 'invoices', select: JOB_PARENT_INVOICED_SELECT, cols: ['id', 'job_id', 'status'] },
      { table: 'invoices', select: JOB_EXTRAS_INVOICE_SELECT, cols: ['id', 'job_id', 'invoice_number', 'status', 'total', 'due_date'] },
      { table: 'quotes', select: JOB_EXTRAS_QUOTE_SELECT, cols: ['id', 'job_id', 'quote_number', 'status', 'total'] },
    ];
    for (const row of pinned) {
      const live = migrationColumns(row.table);
      const cols = row.select.split(',').map((col) => col.trim()).filter(Boolean);
      expect(cols, row.select).toEqual(row.cols);
      expect(cols, row.select).not.toContain('paid_on');
      expect(cols, row.select).not.toContain('paid_at');
      for (const col of cols) {
        expect(live.has(col), `${row.table}.${col}`).toBe(true);
      }
    }
    const { calls } = await loadParentInvoicedRecorded({ companyId: 'c1', parentJobId: 'parent' });
    const select = calls.map((url) => new URL(url).searchParams.get('select') || '').find(Boolean) || '';
    const recorded = select.split(',').map((col) => col.trim()).filter(Boolean);
    expect(recorded).toEqual(['id', 'job_id', 'status']);
    expect(JOB_ID_BATCH).toBe(100);
    expect(chunkIds(Array.from({ length: 101 }, (_, i) => String(i)))).toHaveLength(2);
  });


  killIt('K16 no sideways clip across the five widths in VIEW and EDIT', async () => {
    for (const w of WIDTHS) {
      const list = await openPage({ width: w, path: '/jobs' });
      await waitList(list);
      const listBox = await list.evaluate(overflowScript);
      recordOverflow(w, 'VIEW', 'list', listBox);
      expect(listBox.scrollWidth, `${w} list VIEW scrollWidth`).toBeLessThanOrEqual(listBox.innerWidth);
      expect(listBox.bodyScrollWidth, `${w} list VIEW bodySW`).toBeLessThanOrEqual(listBox.innerWidth);
      expect(listBox.maxRight, `${w} list VIEW maxRight`).toBeLessThanOrEqual(listBox.innerWidth);

      await openForm(list);
      const formBox = await list.evaluate(overflowScript);
      recordOverflow(w, 'EDIT', 'form', formBox);
      expect(formBox.scrollWidth, `${w} form EDIT scrollWidth`).toBeLessThanOrEqual(formBox.innerWidth);
      expect(formBox.bodyScrollWidth, `${w} form EDIT bodySW`).toBeLessThanOrEqual(formBox.innerWidth);
      expect(formBox.maxRight, `${w} form EDIT maxRight`).toBeLessThanOrEqual(formBox.innerWidth);
      await list.close();

      const sheet = await openPage({ width: w, path: '/jobs/p3-0036' });
      await waitSheet(sheet);
      const sheetBox = await sheet.evaluate(overflowScript);
      recordOverflow(w, 'VIEW', 'sheet', sheetBox);
      expect(sheetBox.scrollWidth, `${w} sheet VIEW scrollWidth`).toBeLessThanOrEqual(sheetBox.innerWidth);
      expect(sheetBox.bodyScrollWidth, `${w} sheet VIEW bodySW`).toBeLessThanOrEqual(sheetBox.innerWidth);
      expect(sheetBox.maxRight, `${w} sheet VIEW maxRight`).toBeLessThanOrEqual(sheetBox.innerWidth);
      if (w === 768) {
        await sheet.evaluate(() => {
          const tab = [...document.querySelectorAll('.job-sheet-tab')].find((el) => (
            (el.textContent || '').includes('Materials')
          )) as HTMLElement | undefined;
          tab?.click();
        });
        await sheet.evaluate(async () => {
          for (let i = 0; i < 40; i += 1) {
            if (document.querySelector('#job-bill .job-bill-lines-table')) return;
            await new Promise((resolve) => window.setTimeout(resolve, 50));
          }
        });
        const clip = await sheet.evaluate(() => {
          const table = document.querySelector('#job-bill .job-bill-lines-table') as HTMLElement | null;
          const wrap = document.querySelector('#job-bill .job-bill-lines-wrap') as HTMLElement | null;
          const last = table?.querySelector('thead th:last-child, tbody td:last-child') as HTMLElement | null;
          const wrapBox = wrap?.getBoundingClientRect();
          const lastBox = last?.getBoundingClientRect();
          return {
            wrapRight: wrapBox?.right ?? 0,
            lastRight: lastBox?.right ?? 0,
            overflow: wrap ? getComputedStyle(wrap).overflowX : '',
            scrollWidth: wrap?.scrollWidth ?? 0,
            clientWidth: wrap?.clientWidth ?? 0,
            innerWidth: window.innerWidth,
            maxRight: lastBox?.right ?? 0,
          };
        });
        expect(clip.lastRight, '768 Materials last column right').toBeLessThanOrEqual(clip.wrapRight + 1);
        expect(clip.scrollWidth, '768 Materials wrap scrollWidth').toBeLessThanOrEqual(clip.clientWidth + 8);
        expect(clip.maxRight, '768 Materials maxRight').toBeLessThanOrEqual(clip.innerWidth);
        await sheet.click('[data-tab="overview"]');
        await waitSheet(sheet);
      }
      await sheet.click('[data-job-sheet="actions"] > summary');
      await sheet.click('[data-job-action="details"]');
      await sheet.waitForSelector('[data-job-form="1"]', { timeout: 10000 });
      const sheetEdit = await sheet.evaluate(overflowScript);
      recordOverflow(w, 'EDIT', 'sheet', sheetEdit);
      expect(sheetEdit.scrollWidth, `${w} sheet EDIT scrollWidth`).toBeLessThanOrEqual(sheetEdit.innerWidth);
      expect(sheetEdit.bodyScrollWidth, `${w} sheet EDIT bodySW`).toBeLessThanOrEqual(sheetEdit.innerWidth);
      expect(sheetEdit.maxRight, `${w} sheet EDIT maxRight`).toBeLessThanOrEqual(sheetEdit.innerWidth);
      await sheet.close();
    }
  }, 240000);


  killIt('K17 Overview order Notes then Photos then bill; 1024 CTA is to the right', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    const order = await page.evaluate(() => {
      const notes = document.querySelector('[data-job-sheet="notes"]')!.getBoundingClientRect().top;
      const photos = document.querySelector('[data-job-sheet="photos"]')!.getBoundingClientRect().top;
      const bill = document.querySelector('[data-job-sheet="bill"]')!.getBoundingClientRect().top;
      return { notes, photos, bill };
    });
    await page.close();
    expect(order.notes).toBeLessThan(order.photos);
    expect(order.photos).toBeLessThanOrEqual(order.bill + 1);

    const desk = await openPage({ width: 1024, path: '/jobs/p3-0036' });
    await waitSheet(desk);
    const cols = await desk.evaluate(() => {
      const cta = document.querySelector('.hub-jobs-tools')!.getBoundingClientRect();
      const title = document.querySelector('h1')!.getBoundingClientRect();
      return { ctaLeft: cta.left, titleRight: title.right };
    });
    await desk.close();
    expect(cols.ctaLeft).toBeGreaterThan(cols.titleRight - 8);
  });

  killIt('K18 empty parts stay dropped and NAV_WORDS stay all-trades', async () => {
    expect(NAV_WORDS.jobs.toLowerCase()).not.toMatch(/booking/);
    expect(JOB_SHEET_LINK).toBe('#296AA5');
    const page = await openPage({ width: 390, path: '/jobs/p3-undated' });
    await waitSheet(page);
    const read = await page.evaluate(() => document.body.innerText);
    await page.close();
    expect(read).toMatch(/No crew yet|Unassigned/);
    expect(read).toContain('Set a date');
    expect(read).not.toContain('Photos · 0');
    expect(read).not.toContain('0 bill');
    const empty = await openPage({ width: 390, path: '/jobs', empty: true });
    await waitList(empty);
    const emptyText = await empty.evaluate(() => document.body.innerText);
    await empty.close();
    expect(emptyText).toContain('No jobs yet');
  });

});

describe('P3 look gate', () => {
  killIt('LOOK-GATE prod no-flag ?look= values render nothing', async () => {
    const page = await openPage({
      width: 390,
      path: '/jobs?look=jobs-list',
      js: jobsJsNoProof,
    });
    await waitList(page);
    const text = await page.evaluate(() => document.body.innerText);
    await page.close();
    for (const seed of LOOK_SEED) {
      expect(text, seed).not.toContain(seed);
    }
    expect(text).toContain('Blocked sewer, CCTV inspection');
    expect(text).toContain('All · 17 jobs · 3 need crew');
  });

});

describe('P3 r6 type, CTA contrast, hairlines', () => {
  const readHeroType = () => {
    const hero = document.querySelector('h1.hub-jobs-hero') as HTMLElement | null;
    if (!hero) {
      return {
        title: '',
        lines: 0,
        fontSize: 0,
        weight: '',
        scrollHeight: 0,
        clientHeight: 0,
        scrollWidth: 0,
        clientWidth: 0,
        right: 0,
        innerWidth: window.innerWidth,
      };
    }
    const range = document.createRange();
    range.selectNodeContents(hero);
    const tops = [...range.getClientRects()].map((box) => Math.round(box.top));
    const box = hero.getBoundingClientRect();
    return {
      title: hero.textContent ?? '',
      lines: new Set(tops).size,
      fontSize: parseFloat(getComputedStyle(hero).fontSize),
      weight: getComputedStyle(hero).fontWeight,
      scrollHeight: hero.scrollHeight,
      clientHeight: hero.clientHeight,
      scrollWidth: hero.scrollWidth,
      clientWidth: hero.clientWidth,
      right: box.right,
      innerWidth: window.innerWidth,
    };
  };

  killIt('R6-1 fixture title is one line at 375 and 390', async () => {
    for (const width of [375, 390] as const) {
      const page = await openPage({ width, path: '/jobs/p3-0036' });
      await waitSheet(page);
      const read = await page.evaluate(readHeroType);
      await page.close();
      expect(read.title).toBe('Blocked sewer, CCTV inspection');
      expect(read.fontSize).toBe(24);
      expect(Number(read.weight)).toBe(600);
      expect(read.lines, `${width} fixture title lines`).toBe(1);
    }
  });

  killIt('R15 long title wraps to two lines at 375 and 390 without clip', async () => {
    const longTitle = 'Hot water system replacement and backflow test';
    for (const width of [375, 390] as const) {
      const page = await openPage({ width, path: '/jobs/p3-0036' });
      await waitSheet(page);
      await page.evaluate((title: string) => {
        const hero = document.querySelector('h1.hub-jobs-hero') as HTMLElement | null;
        if (hero) hero.textContent = title;
      }, longTitle);
      const read = await page.evaluate(readHeroType);
      await page.close();
      expect(read.title).toBe(longTitle);
      expect(read.fontSize, `${width} long title size`).toBe(24);
      expect(Number(read.weight), `${width} long title weight`).toBe(600);
      expect(read.lines, `${width} long title lines`).toBe(2);
      expect(read.scrollHeight, `${width} long title scrollHeight`).toBeLessThanOrEqual(read.clientHeight);
      expect(read.scrollWidth, `${width} long title scrollWidth`).toBeLessThanOrEqual(read.clientWidth);
      expect(read.right, `${width} long title right`).toBeLessThanOrEqual(read.innerWidth);
    }
  });

  killIt('R6-4 invoice CTA contrast against white is at least 7', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    const read = await page.evaluate(() => {
      const cta = document.querySelector('[data-job-sheet="cta"]') as HTMLElement | null;
      const box = cta?.getBoundingClientRect();
      return {
        text: (cta?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        disabled: cta?.hasAttribute('disabled') ?? true,
        icon: !!cta?.querySelector('svg'),
        clip: box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null,
      };
    });
    expect(read.disabled, 'invoice CTA is not a disabled state').toBe(false);
    expect(read.text).toContain('Create invoice');
    expect(read.icon, 'receipt icon paints').toBe(true);
    expect(read.clip, 'CTA has a painted rect').toBeTruthy();
    const clip = read.clip!;
    const paintedCta = await sampleCtaPaintedRgb(page, '[data-job-sheet="cta"]');
    const buf = await page.screenshot({
      type: 'png',
      clip,
      animations: 'disabled',
    });
    await page.close();
  expect(paintedCta.fill[0], `CTA fill ${paintedCta.fill} centre ${paintedCta.center}`).toBeLessThanOrEqual(22);
    expect(paintedCta.fill[1], `CTA fill ${paintedCta.fill}`).toBeLessThanOrEqual(22);
    expect(paintedCta.fill[2], `CTA fill ${paintedCta.fill}`).toBeLessThanOrEqual(22);
    const painted = await samplePngFillAndText(buf);
    expect(painted.fill[0], `painted fill ${painted.fill}`).toBeLessThanOrEqual(18);
    expect(painted.fill[1], 'CTA is not navy').toBeLessThanOrEqual(18);
    expect(painted.fill[2], 'CTA is not navy').toBeLessThanOrEqual(18);
    expect(Math.abs(painted.fill[0] - 10)).toBeLessThanOrEqual(8);
    expect(Math.abs(painted.fill[1] - 10)).toBeLessThanOrEqual(8);
    expect(Math.abs(painted.fill[2] - 11)).toBeLessThanOrEqual(8);
    expect(painted.text[0], `painted text ${painted.text}`).toBeGreaterThanOrEqual(230);
    expect(painted.contrast, `painted fill ${painted.fill} vs text ${painted.text}`).toBeGreaterThanOrEqual(7);
  });

  killIt('R6-5 hairline rect sits between each Overview pair', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    const read = await page.evaluate(() => {
      const ids = ['kv-site', 'kv-client', 'kv-phone', 'kv-crew'];
      const rows = ids.map((id) => document.querySelector(`[data-job-sheet="${id}"]`) as HTMLElement | null);
      const hairs = [...document.querySelectorAll('[data-job-kv-rule]')] as HTMLElement[];
      return {
        rowCount: rows.filter(Boolean).length,
        hairCount: hairs.length,
        pairs: hairs.map((hair, i) => {
          const box = hair.getBoundingClientRect();
          const row = rows[i]?.getBoundingClientRect();
          const prev = i === 0 ? null : rows[i - 1]?.getBoundingClientRect();
          return {
            height: box.height,
            width: box.width,
            above: !!row && box.bottom <= row.top + 2 && (!prev || box.top >= prev.bottom - 2),
          };
        }),
      };
    });
    await page.close();
    expect(read.rowCount).toBe(4);
    expect(read.hairCount).toBe(4);
    for (const pair of read.pairs) {
      expect(pair.height, 'hairline rect height').toBeGreaterThanOrEqual(1);
      expect(pair.width, 'hairline rect width').toBeGreaterThan(100);
      expect(pair.above, 'hairline rect above its row').toBe(true);
    }
  });

});

describe('P3 Coach needCrew throw-safe and unknown status pills', () => {
  killIt('needCrew never throws; malformed assigned_team is no crew', async () => {
    const dated = { status: 'scheduled' as const, scheduled_date: '2026-10-19' };
    const malformed = [{ bad: 1 }, 'dean', 12, [1], { 0: 'p3-dean' }];
    for (const assigned_team of malformed) {
      expect(() => jobNeedsCrew({ ...dated, assigned_team })).not.toThrow();
      expect(jobNeedsCrew({ ...dated, assigned_team }), String(assigned_team)).toBe(true);
    }
    expect(() => needsCrew(null)).not.toThrow();
    expect(() => needsCrew(undefined)).not.toThrow();
    expect(() => jobNeedsCrew(null)).not.toThrow();
    expect(needsCrew(null)).toBe(false);
    expect(jobNeedsCrew(null)).toBe(false);
    expect(jobNeedsCrew({ status: 'scheduled', scheduled_date: 20261019 as never, assigned_team: [] })).toBe(false);
    expect(jobNeedsCrew({ status: 'scheduled', scheduled_date: { ymd: '2026-10-19' } as never, assigned_team: [] })).toBe(false);
  });

  killIt('unknown dated crewless is Needs crew on the list and sheet', async () => {
    const phone = await openPage({ width: 390, path: '/jobs' });
    await waitList(phone);
    const listRead = await phone.evaluate(() => {
      const pill = document.querySelector('[data-jobs-phone-row="x-unknown"] [data-jobs-pill]');
      return {
        label: (pill?.textContent || '').trim(),
        kind: pill?.getAttribute('data-jobs-pill') || '',
      };
    });
    await phone.close();
    const desk = await openPage({ width: 1280, path: '/jobs' });
    await waitList(desk);
    const deskRead = await desk.evaluate(() => {
      const row = [...document.querySelectorAll('.hub-jobs-row')].find((el) => (
        (el.querySelector('.hub-jobs-title')?.textContent || '').includes('Unknown status dated crewless')
      ));
      const pill = row?.querySelector('[data-jobs-pill]');
      return { label: (pill?.textContent || '').trim(), kind: pill?.getAttribute('data-jobs-pill') || '' };
    });
    await desk.close();
    const sheet = await openPage({ width: 390, path: '/jobs/x-unknown' });
    await waitSheet(sheet);
    const sheetRead = await sheet.evaluate(() => {
      const pill = document.querySelector('[data-job-sheet-pill]');
      return { label: (pill?.textContent || '').trim(), kind: pill?.getAttribute('data-job-sheet-pill') || '' };
    });
    await sheet.close();
    expect(listRead.kind).toBe('needs_crew');
    expect(listRead.label).toBe(JOB_PILL_NEEDS_CREW);
    expect(deskRead.label).toBe(JOB_PILL_NEEDS_CREW);
    expect(sheetRead.kind).toBe('needs_crew');
    expect(sheetRead.label).toBe(JOB_PILL_NEEDS_CREW);
    expect(listRead.label).not.toBe('Scheduled');
    expect(listRead.label).not.toBe('Booked');
    expect(sheetRead.label).not.toBe('Scheduled');
    expect(sheetRead.label).not.toBe('Booked');
  });

  killIt('unknown otherwise is raw sentence-case on the list and sheet', async () => {
    const phone = await openPage({ width: 390, path: '/jobs' });
    await waitList(phone);
    const listRead = await phone.evaluate(() => {
      const pill = document.querySelector('[data-jobs-phone-row="x-unknown-crew"] [data-jobs-pill]');
      return {
        label: (pill?.textContent || '').trim(),
        kind: pill?.getAttribute('data-jobs-pill') || '',
      };
    });
    await phone.close();
    const desk = await openPage({ width: 1280, path: '/jobs' });
    await waitList(desk);
    const deskRead = await desk.evaluate(() => {
      const row = [...document.querySelectorAll('.hub-jobs-row')].find((el) => (
        (el.querySelector('.hub-jobs-title')?.textContent || '').includes('Unknown status dated with crew')
      ));
      const pill = row?.querySelector('[data-jobs-pill]');
      return { label: (pill?.textContent || '').trim(), kind: pill?.getAttribute('data-jobs-pill') || '' };
    });
    await desk.close();
    const sheet = await openPage({ width: 390, path: '/jobs/x-unknown-crew' });
    await waitSheet(sheet);
    const sheetRead = await sheet.evaluate(() => {
      const pill = document.querySelector('[data-job-sheet-pill]');
      return { label: (pill?.textContent || '').trim(), kind: pill?.getAttribute('data-job-sheet-pill') || '' };
    });
    await sheet.close();
    expect(listRead.kind).toBe('unknown');
    expect(listRead.label).toBe('Awaiting parts');
    expect(deskRead.label).toBe('Awaiting parts');
    expect(sheetRead.kind).toBe('unknown');
    expect(sheetRead.label).toBe('Awaiting parts');
    expect(listRead.label).not.toBe('Scheduled');
    expect(listRead.label).not.toBe('Booked');
    expect(sheetRead.label).not.toBe('Scheduled');
    expect(sheetRead.label).not.toBe('Booked');
  });

});

describe('P3 r9 mockup vs head at 390', () => {
  killIt('R9 job-390-light named elements match the real mockup render', async () => {
    const selectors = {
      mockup: {
        side: 'mockup',
        cta: '.cta .btn.btn-primary',
        page: 'body',
        content: '.j .ref',
        eyebrow: '.eyebrow',
        title: 'h1.h1',
        pill: '.pill.ok',
        sub: '.cta p',
        label: '.kv dt',
        value: '.kv dd',
        act: '.kv .act',
        more: '.appbar [aria-label="More"]',
        search: '.appbar [aria-label="Search"]',
        avatar: '.appbar .av',
        chevron: '.appbar .back .ic',
        email: '.kv-email',
      },
      head: {
        side: 'head',
        cta: '[data-job-sheet="cta"]',
        page: '.hub-jobs.is-record-open.ops-page',
        content: '.job-sheet-head',
        eyebrow: '.job-sheet-ref',
        title: 'h1.hub-jobs-hero',
        pill: '[data-job-sheet-pill]',
        sub: '[data-job-sheet="sub"]',
        label: '[data-job-sheet="kv-site"] .job-sheet-kv-label',
        value: '[data-job-sheet="kv-site"] .job-sheet-kv-value',
        act: '[data-job-sheet="kv-site"] .job-sheet-kv-act',
        more: '.job-sheet-appbar .hub-job-more',
        search: '.job-sheet-appbar-search',
        avatar: '.job-sheet-appbar-avatar',
        chevron: '.job-sheet-back-chevron',
        email: '.job-sheet-kv-email',
      },
    };
    const measure = (sels: typeof selectors.mockup) => {
      const fixedInk = (el: Element | null) => {
        if (!el) return 0;
        const cs = getComputedStyle(el as HTMLElement);
        const ctx = document.createElement('canvas').getContext('2d');
        if (!ctx) return 0;
        ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        return ctx.measureText('Hamburgefonstiv 0123456789').width;
      };
      const visibleTextWeight = (el: Element | null) => {
        if (!el) return '';
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        while (walk.nextNode()) {
          const node = walk.currentNode;
          if (!node.textContent?.trim()) continue;
          const parent = node.parentElement;
          if (!parent) continue;
          const cs = getComputedStyle(parent);
          if (cs.display === 'none' || cs.visibility === 'hidden') continue;
          return cs.fontWeight;
        }
        return '';
      };
      const inkBox = (el: Element | null) => {
        if (!el) return { width: 0, left: 0, top: 0, height: 0 };
        const range = document.createRange();
        const texts: { left: number; right: number; top: number; bottom: number }[] = [];
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        while (walk.nextNode()) {
          const node = walk.currentNode;
          if (!node.textContent?.trim()) continue;
          range.selectNodeContents(node);
          for (const box of range.getClientRects()) {
            if (box.width > 0 && box.height > 0) {
              texts.push({ left: box.left, right: box.right, top: box.top, bottom: box.bottom });
            }
          }
        }
        if (!texts.length) return { width: 0, left: 0, top: 0, height: 0 };
        const left = Math.min(...texts.map((box) => box.left));
        const right = Math.max(...texts.map((box) => box.right));
        const top = Math.min(...texts.map((box) => box.top));
        const bottom = Math.max(...texts.map((box) => box.bottom));
        return { width: right - left, left, top, height: bottom - top };
      };
      const pageEl = document.querySelector(sels.page) as HTMLElement | null;
      const cta = document.querySelector(sels.cta) as HTMLElement | null;
      const content = document.querySelector(sels.content) as HTMLElement | null;
      const eyebrow = document.querySelector(sels.eyebrow) as HTMLElement | null;
      const title = document.querySelector(sels.title) as HTMLElement | null;
      const pill = document.querySelector(sels.pill) as HTMLElement | null;
      const sub = document.querySelector(sels.sub) as HTMLElement | null;
      const label = document.querySelector(sels.label) as HTMLElement | null;
      const value = document.querySelector(sels.value) as HTMLElement | null;
      const act = document.querySelector(sels.act) as HTMLElement | null;
      const more = document.querySelector(sels.more) as HTMLElement | null;
      const search = document.querySelector(sels.search) as HTMLElement | null;
      const avatar = document.querySelector(sels.avatar) as HTMLElement | null;
      const chevron = document.querySelector(sels.chevron) as HTMLElement | null;
      const email = document.querySelector(sels.email) as HTMLElement | null;
      const labelBox = label?.getBoundingClientRect();
      const valueBox = value?.getBoundingClientRect();
      const actBox = act?.getBoundingClientRect();
      const moreBox = more?.getBoundingClientRect();
      const emailBox = email?.getBoundingClientRect();
      const moreStyle = more ? getComputedStyle(more) : null;
      const emailStyle = email ? getComputedStyle(email) : null;
      const mock = sels.side === 'mockup';
      const rail = document.querySelector(mock ? '.segc.fill' : '.job-sheet-tabs') as HTMLElement | null
        || document.querySelector('.segc') as HTMLElement | null
        || document.querySelector('.job-sheet-tabs') as HTMLElement | null;
      if (rail) {
        ['Overview', 'People', 'Paperwork 3', 'Materials 1'].forEach((label, i) => {
          const child = rail.children[i] as HTMLElement | undefined;
          if (child) child.textContent = label;
        });
      }
      const railStyle = rail ? getComputedStyle(rail) : null;
      const kvRows = [...document.querySelectorAll(mock ? '.kv' : '.job-sheet-kv-row')] as HTMLElement[];
      const appbar = document.querySelector(mock ? '.appbar' : '.job-sheet-appbar') as HTMLElement | null;
      const note = document.querySelector(mock ? '.note' : '.job-sheet-note') as HTMLElement | null;
      const noteBy = document.querySelector(mock ? '.note .by' : '.job-sheet-note-by') as HTMLElement | null;
      const noteP = document.querySelector(mock ? '.note p' : '.job-sheet-note p') as HTMLElement | null;
      const notesSec = mock
        ? ([...document.querySelectorAll('section.sec')] as HTMLElement[])
          .find((sec) => /Notes/.test((sec.querySelector('.h2')?.textContent || ''))) ?? null
        : document.querySelector('[data-job-sheet="notes"]') as HTMLElement | null;
      const notesH = (notesSec?.querySelector(mock ? '.h2' : 'h2') || null) as HTMLElement | null;
      const notesExtraEl = mock
        ? (notesSec?.querySelector('.row .small, .row .muted') as HTMLElement | null)
        : (notesSec?.querySelector('.job-sheet-link') as HTMLElement | null);
      const photosSec = mock
        ? ([...document.querySelectorAll('section.sec')] as HTMLElement[])
          .find((sec) => /Photos/.test((sec.querySelector('.h2')?.textContent || ''))) ?? null
        : document.querySelector('[data-job-sheet="photos"]') as HTMLElement | null;
      const photosH = (photosSec?.querySelector(mock ? '.h2' : 'h2') || null) as HTMLElement | null;
      const photosExtraEl = mock
        ? (photosSec?.querySelector('.row .small, .row .muted') as HTMLElement | null)
        : (photosSec?.querySelector('.job-sheet-link') as HTMLElement | null);
      const photos = document.querySelector(mock ? '.photos' : '.job-sheet-photo-grid') as HTMLElement | null;
      const photoTiles = [...document.querySelectorAll(mock ? '.ph' : '.job-sheet-photo')] as HTMLElement[];
      const photo = photoTiles.find((tile) => {
        const img = tile.querySelector('img') as HTMLImageElement | null;
        if (!img) return true;
        const st = img.getAttribute('style') || '';
        const cs = getComputedStyle(img);
        return cs.display === 'none' || /display:\s*none/i.test(st) || (img.getAttribute('src') || '').includes('example.test');
      }) ?? photoTiles[0] ?? null;
      const photoBox = photo?.getBoundingClientRect();
      const photoIcon = (photo?.querySelector('.job-sheet-photo-ic, svg.ic, svg') as HTMLElement | null);
      const photoCap = (photo?.querySelector('.job-sheet-photo-cap') as HTMLElement | null)
        ?? (photo
          ? [...photo.querySelectorAll('span')].find((el) => (
            (el.textContent || '').trim() && !el.querySelector('svg') && !el.classList.contains('job-sheet-photo-ic')
          )) ?? null
          : null);
      const iconBox = photoIcon?.getBoundingClientRect();
      const capBox = photoCap?.getBoundingClientRect();
      const bill3 = document.querySelector(mock ? '.bill3' : '.job-sheet-bill3') as HTMLElement | null;
      const billL = document.querySelector(mock ? '.bill3 .l' : '.job-sheet-bill-l') as HTMLElement | null;
      const billV = document.querySelector(mock ? '.bill3 .v' : '.job-sheet-bill-v') as HTMLElement | null;
      const billCells = [...(bill3?.children ?? [])] as HTMLElement[];
      const billCellLefts = [...new Set(billCells.map((cell) => Math.round(cell.getBoundingClientRect().left)))];
      const billCellTops = [...new Set(billCells.map((cell) => Math.round(cell.getBoundingClientRect().top)))];
      const billCellVs = billCells.map((cell) => cell.querySelector(mock ? '.v' : '.job-sheet-bill-v') as HTMLElement | null);
      const billSubs = [...document.querySelectorAll(mock ? '.bl .s' : '.job-sheet-bill-s')] as HTMLElement[];
      const totBig = document.querySelector(mock ? '.tot.big' : '.job-sheet-bill-tot.is-big') as HTMLElement | null;
      return {
        selectors: sels,
        ctaBg: cta ? getComputedStyle(cta).backgroundColor : '',
        ctaWidth: cta ? cta.getBoundingClientRect().width : 0,
        ctaY: cta ? cta.getBoundingClientRect().top : -1,
        ctaDisabled: cta ? (cta as HTMLButtonElement).disabled === true : false,
        pageBg: pageEl ? getComputedStyle(pageEl).backgroundColor : '',
        contentLeft: content ? content.getBoundingClientRect().left : -1,
        labelLeft: !!labelBox && !!valueBox && labelBox.right <= valueBox.left + 2,
        labelWidth: labelBox ? Math.round(labelBox.width) : 0,
        actRightOfValue: !!valueBox && !!actBox && valueBox.right <= actBox.left + 2,
        morePresent: !!more && moreStyle?.display !== 'none' && (moreBox?.width || 0) > 0,
        searchBesideAvatar: !!search && !!avatar
          && search.getBoundingClientRect().right <= avatar.getBoundingClientRect().left + 4,
        chevronColor: chevron ? getComputedStyle(chevron).color : '',
        backWeight: document.querySelector(mock ? '.appbar .back' : '.job-sheet-back')
          ? getComputedStyle(document.querySelector(mock ? '.appbar .back' : '.job-sheet-back') as HTMLElement).fontWeight
          : '',
        eyebrow: (eyebrow?.textContent || '').trim(),
        eyebrowTransform: eyebrow ? getComputedStyle(eyebrow).textTransform : '',
        eyebrowTracking: eyebrow ? parseFloat(getComputedStyle(eyebrow).letterSpacing) : 0,
        eyebrowWeight: eyebrow ? getComputedStyle(eyebrow).fontWeight : '',
        eyebrowY: eyebrow ? eyebrow.getBoundingClientRect().top : -1,
        titleSize: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
        titleWeight: title ? getComputedStyle(title).fontWeight : '',
        titleY: title ? title.getBoundingClientRect().top : -1,
        titleBottom: title ? title.getBoundingClientRect().bottom : -1,
        appbarY: appbar ? appbar.getBoundingClientRect().top : -1,
        avatarW: avatar ? avatar.getBoundingClientRect().width : 0,
        avatarH: avatar ? avatar.getBoundingClientRect().height : 0,
        avatarBg: avatar ? getComputedStyle(avatar).backgroundColor : '',
        kvHeights: kvRows.map((row) => Math.round(row.getBoundingClientRect().height)),
        kvValueWeight: value ? getComputedStyle(value).fontWeight : '',
        phoneTextWeight: visibleTextWeight(document.querySelector(mock ? '.kv:nth-of-type(3) dd' : '[data-job-sheet="kv-phone"] .job-client-phone-num')),
        siteTextWeight: visibleTextWeight(value),
        phoneInk: inkBox(document.querySelector(mock ? '.kv:nth-of-type(3) dd' : '[data-job-sheet="kv-phone"] .job-client-phone-num')).width,
        tabPad: railStyle ? parseFloat(railStyle.paddingTop) : -1,
        tabGap: railStyle ? parseFloat(railStyle.columnGap || railStyle.gap) : -1,
        tabRadius: railStyle ? parseFloat(railStyle.borderRadius) : -1,
        tabH: rail ? rail.getBoundingClientRect().height : -1,
        tabBg: railStyle ? railStyle.backgroundColor : '',
        pillText: (pill?.textContent || '').replace(/\s+/g, ' ').trim(),
        subAlign: sub ? getComputedStyle(sub).textAlign : '',
        emailPainted: !!email && emailStyle?.display !== 'none' && (emailBox?.width || 0) > 0 && (emailBox?.height || 0) > 0,
        scopeH: (document.querySelector(mock ? '.sec .h2' : '.job-sheet-scope-h') as HTMLElement | null)
          ? getComputedStyle(document.querySelector(mock ? '.sec .h2' : '.job-sheet-scope-h') as HTMLElement).fontSize
          : '',
        clientHref: (document.querySelector(mock ? '.kv dd' : 'a.job-sheet-kv-name') as HTMLAnchorElement | null)?.getAttribute('href') || '',
        tabFontSize: rail ? parseFloat(getComputedStyle(rail.querySelector(mock ? 'a' : '.job-sheet-tab') as HTMLElement).fontSize) : -1,
        tabFontWeight: rail ? getComputedStyle(rail.querySelector(mock ? 'a' : '.job-sheet-tab') as HTMLElement).fontWeight : '',
        tabLabels: [...(rail?.children ?? [])].map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()),
        tabWidths: [...(rail?.children ?? [])].map((el) => (el as HTMLElement).getBoundingClientRect().width),
        tabScrollWidths: [...(rail?.children ?? [])].map((el) => (el as HTMLElement).scrollWidth),
        tabPadX: [...(rail?.children ?? [])].map((el) => {
          const cs = getComputedStyle(el as HTMLElement);
          return parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        }),
        tabWeights: [...(rail?.children ?? [])].map((el) => getComputedStyle(el as HTMLElement).fontWeight),
        tabOnShadow: (() => {
          const on = [...(rail?.children ?? [])].find((el) => (
            (el as HTMLElement).classList.contains('is-on')
          )) as HTMLElement | undefined;
          return on ? getComputedStyle(on).boxShadow : '';
        })(),
        searchX: search ? search.getBoundingClientRect().left : -1,
        avatarX: avatar ? avatar.getBoundingClientRect().left : -1,
        eyebrowColor: eyebrow ? getComputedStyle(eyebrow).color : '',
        subLh: sub ? parseFloat(getComputedStyle(sub).lineHeight) : -1,
        crewText: (document.querySelector(mock ? '.kv:nth-of-type(4) dd' : '[data-job-sheet="kv-crew"] .job-sheet-kv-value')?.textContent || '').replace(/\s+/g, ' ').trim(),
        noteBySize: noteBy ? parseFloat(getComputedStyle(noteBy).fontSize) : -1,
        noteByWeight: noteBy ? getComputedStyle(noteBy).fontWeight : '',
        noteByColor: noteBy ? getComputedStyle(noteBy).color : '',
        notePSize: noteP ? parseFloat(getComputedStyle(noteP).fontSize) : -1,
        notePLh: noteP ? parseFloat(getComputedStyle(noteP).lineHeight) : -1,
        notePWeight: noteP ? getComputedStyle(noteP).fontWeight : '',
        notePad: note ? parseFloat(getComputedStyle(note).paddingTop) : -1,
        noteBorder: note ? getComputedStyle(note).borderBottomWidth : '',
        notesHSize: notesH ? parseFloat(getComputedStyle(notesH).fontSize) : -1,
        notesHWeight: notesH ? getComputedStyle(notesH).fontWeight : '',
        notesExtra: (notesExtraEl?.textContent || '').replace(/\s+/g, ' ').trim(),
        photosH: (photosH?.textContent || '').replace(/\s+/g, ' ').trim(),
        photosExtra: (photosExtraEl?.textContent || '').replace(/\s+/g, ' ').trim(),
        photoCols: photos ? getComputedStyle(photos).gridTemplateColumns.split(' ').filter(Boolean).length : 0,
        photoGap: photos ? parseFloat(getComputedStyle(photos).columnGap || getComputedStyle(photos).gap) : -1,
        photoRatio: photoBox && photoBox.height > 0 ? photoBox.width / photoBox.height : 0,
        photoRadius: photo ? parseFloat(getComputedStyle(photo).borderRadius) : -1,
        photoShadow: photo ? getComputedStyle(photo).boxShadow : '',
        photoHasIcon: !!photoIcon && (iconBox?.width || 0) > 0 && (iconBox?.height || 0) > 0,
        photoIconX: photoBox && iconBox ? iconBox.left - photoBox.left : -1,
        photoIconY: photoBox && iconBox ? iconBox.top - photoBox.top : -1,
        photoCapX: photoBox && capBox ? capBox.left - photoBox.left : -1,
        photoCapBottom: photoBox && capBox ? photoBox.bottom - capBox.bottom : -1,
        photoCapAlign: photoCap ? getComputedStyle(photoCap).textAlign : (photo ? getComputedStyle(photo).textAlign : ''),
        photoCapClamp: photoCap ? getComputedStyle(photoCap).webkitLineClamp : '',
        bill3Display: bill3 ? getComputedStyle(bill3).display : '',
        bill3Cols: billCellLefts.length,
        bill3Rows: billCellTops.length,
        billCellTopList: billCells.map((cell) => cell.getBoundingClientRect().top),
        billCellLeftList: billCells.map((cell) => cell.getBoundingClientRect().left),
        billFirstPadL: billCells[0] ? parseFloat(getComputedStyle(billCells[0]).paddingLeft) : -1,
        billFirstBorderL: billCells[0] ? parseFloat(getComputedStyle(billCells[0]).borderLeftWidth) : -1,
        billCellPadL: billCells[1] ? parseFloat(getComputedStyle(billCells[1]).paddingLeft) : -1,
        billCellBorderL: billCells[1] ? parseFloat(getComputedStyle(billCells[1]).borderLeftWidth) : -1,
        bill3BorderTop: bill3 ? getComputedStyle(bill3).borderTopWidth : '',
        bill3BorderBottom: bill3 ? getComputedStyle(bill3).borderBottomWidth : '',
        billLSize: billL ? parseFloat(getComputedStyle(billL).fontSize) : -1,
        billLColor: billL ? getComputedStyle(billL).color : '',
        billVSize: billV ? parseFloat(getComputedStyle(billV).fontSize) : -1,
        billVLh: billV ? parseFloat(getComputedStyle(billV).lineHeight) : -1,
        billVWeight: billV ? getComputedStyle(billV).fontWeight : '',
        billVVariant: billV ? getComputedStyle(billV).fontVariantNumeric : '',
        billVInsets: billCells.map((cell, i) => {
          const v = billCellVs[i];
          return v ? v.getBoundingClientRect().left - cell.getBoundingClientRect().left : -1;
        }),
        billVSizes: billCellVs.map((v) => (v ? parseFloat(getComputedStyle(v).fontSize) : -1)),
        billVLhs: billCellVs.map((v) => (v ? parseFloat(getComputedStyle(v).lineHeight) : -1)),
        billVWeights: billCellVs.map((v) => (v ? getComputedStyle(v).fontWeight : '')),
        billSubCount: billSubs.length,
        billSubText: (billSubs[0]?.textContent || '').replace(/\s+/g, ' ').trim(),
        totBigSize: totBig ? parseFloat(getComputedStyle(totBig).fontSize) : -1,
        totBigWeight: totBig ? getComputedStyle(totBig).fontWeight : '',
        totBigBorderTop: totBig ? getComputedStyle(totBig).borderTopWidth : '',
        billCellH: billCells[0] ? billCells[0].getBoundingClientRect().height : -1,
        billLabelTop: billCells.map((cell) => {
          const labelEl = cell.querySelector(mock ? '.l' : '.job-sheet-bill-l');
          const ink = inkBox(labelEl);
          return labelEl ? ink.top - cell.getBoundingClientRect().top : -1;
        }),
        billValueX: billCells.map((cell, i) => {
          const v = billCellVs[i];
          const ink = inkBox(v);
          return v ? ink.left - cell.getBoundingClientRect().left : -1;
        }),
        totH: (() => {
          const tot = document.querySelector(mock ? '.tot:not(.big)' : '[data-job-bill-tot="sub"]') as HTMLElement | null;
          return tot ? tot.getBoundingClientRect().height : -1;
        })(),
        totLh: (() => {
          const tot = document.querySelector(mock ? '.tot:not(.big)' : '[data-job-bill-tot="sub"]') as HTMLElement | null;
          return tot ? parseFloat(getComputedStyle(tot).lineHeight) : -1;
        })(),
        totBigH: totBig ? totBig.getBoundingClientRect().height : -1,
        totBigLh: totBig ? parseFloat(getComputedStyle(totBig).lineHeight) : -1,
        noteByH: noteBy ? noteBy.getBoundingClientRect().height : -1,
        noteByLh: noteBy ? parseFloat(getComputedStyle(noteBy).lineHeight) : -1,
        titleInk: inkBox(title).width,
        kvLabelInk: inkBox(label).width,
        kvValueInk: inkBox(value).width,
        notePInk: inkBox(noteP).width,
        noteByInk: inkBox(noteBy).width,
        scopeHInk: inkBox(document.querySelector(mock ? '.sec .h2' : '.job-sheet-scope-h')).width,
        ctaInk: inkBox(cta).width,
        tabInks: [...(rail?.children ?? [])].map((el) => inkBox(el).width),
        titleFixedInk: fixedInk(title),
        kvLabelFixedInk: fixedInk(label),
        kvValueFixedInk: fixedInk(value),
        notePFixedInk: fixedInk(noteP),
        scopeHFixedInk: fixedInk(document.querySelector(mock ? '.sec .h2' : '.job-sheet-scope-h')),
        ctaFixedInk: fixedInk(cta),
        tabOnFixedInk: (() => {
          const on = [...(rail?.children ?? [])].find((el) => (el as HTMLElement).classList.contains('is-on')) as HTMLElement | undefined;
          return fixedInk(on ?? null);
        })(),
        tabOffFixedInk: (() => {
          const off = [...(rail?.children ?? [])].find((el) => !(el as HTMLElement).classList.contains('is-on')) as HTMLElement | undefined;
          return fixedInk(off ?? null);
        })(),
      };
    };
    const pinTabLabels = async (page: KillPage, sel: string, labels: string[]) => {
      await page.evaluate(async (arg: { selector: string; next: string[] }) => {
        const { selector, next } = arg;
        const apply = () => {
          const rail = document.querySelector(selector) as HTMLElement | null;
          const kids = [...(rail?.children ?? [])] as HTMLElement[];
          kids.forEach((el, i) => {
            if (next[i]) el.textContent = next[i];
          });
        };
        try {
          await document.fonts.load('600 14px Geist');
        } catch {
          /* font face may already be ready */
        }
        await document.fonts.ready;
        let prev = '';
        for (let i = 0; i < 40; i += 1) {
          apply();
          const rail = document.querySelector(selector) as HTMLElement | null;
          const kids = [...(rail?.children ?? [])] as HTMLElement[];
          const texts = kids.map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
          const widths = kids.map((el) => el.getBoundingClientRect().width);
          const now = widths.map((w) => w.toFixed(2)).join(',');
          const geistOn = document.fonts.check('600 14px Geist') || document.fonts.check('14px Geist');
          const matchesMock = widths.length === 4
            && Math.abs(widths[0] - 79) <= 1
            && Math.abs(widths[1] - 75.8) <= 1
            && Math.abs(widths[2] - 101.2) <= 1
            && Math.abs(widths[3] - 87.9) <= 1;
          if (
            geistOn
            && texts.join('|') === next.join('|')
            && matchesMock
            && now
            && now === prev
          ) return;
          prev = now;
          await new Promise((resolve) => window.setTimeout(resolve, 50));
        }
      }, { selector: sel, next: labels });
    };
    const mockLabels = ['Overview', 'People', 'Paperwork 3', 'Materials 1'];
    const mockPage = await openMockup(390);
    await pinTabLabels(mockPage, '.segc.fill', mockLabels);
    const mockup = await mockPage.evaluate(measure, selectors.mockup);
    const mockCtaRgb = await sampleCtaPaintedRgb(mockPage, selectors.mockup.cta);
    await revealEl(mockPage, '.ph');
    const mockPhotoShot = await samplePaintedPixels(mockPage, '.ph', 2);
    await mockPage.close();
    const headPage = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(headPage);
    await pinTabLabels(headPage, '.job-sheet-tabs', mockLabels);
    await waitSettledLayout(headPage, '.job-sheet-tabs');
    const head = await headPage.evaluate(measure, selectors.head);
    const headCtaRgb = await sampleCtaPaintedRgb(headPage, selectors.head.cta);
    await revealEl(headPage, '.job-sheet-photo');
    const headPhotoShot = await samplePaintedPixels(headPage, '.job-sheet-photo', 2);
    await headPage.close();
    if (process.env.P3_PROPS === '1') {
      console.log(`P3_PROPS ${JSON.stringify({ mockup, head, mockCtaRgb, headCtaRgb })}`);
    }
    const near = (a: number, b: number, tol = 1) => Math.abs(a - b) <= tol;
    expect(headCtaRgb.fill[0], `head CTA fill ${headCtaRgb.fill}`).toBeLessThanOrEqual(22);
    expect(headCtaRgb.fill[1], `head CTA fill ${headCtaRgb.fill}`).toBeLessThanOrEqual(22);
    expect(headCtaRgb.fill[2], `head CTA fill ${headCtaRgb.fill}`).toBeLessThanOrEqual(22);
    expect(mockCtaRgb.fill[0], `mockup CTA fill ${mockCtaRgb.fill}`).toBeLessThanOrEqual(22);
    expect(near(head.ctaWidth, mockup.ctaWidth, 2), `cta width head ${head.ctaWidth} mock ${mockup.ctaWidth}`).toBe(true);
    expect(head.pageBg.replace(/\s+/g, '')).toMatch(/rgb\(245,\s*245,\s*247\)/);
    expect(mockup.pageBg.replace(/\s+/g, '')).toMatch(/rgb\(245,\s*245,\s*247\)/);
    expect(near(head.contentLeft, mockup.contentLeft), `contentLeft head ${head.contentLeft} mock ${mockup.contentLeft}`).toBe(true);
    expect(head.labelWidth, '72px kv column').toBe(72);
    expect(mockup.labelWidth, 'mockup 72px kv column').toBe(72);
    expect(head.labelLeft).toBe(true);
    expect(head.actRightOfValue).toBe(true);
    expect(head.morePresent, 'appbar has no …').toBe(false);
    expect(mockup.morePresent).toBe(false);
    expect(head.searchBesideAvatar).toBe(true);
    expect(head.chevronColor.replace(/\s+/g, '')).toMatch(/rgb\(24,\s*63,\s*184\)/);
    expect(mockup.chevronColor.replace(/\s+/g, '')).toMatch(/rgb\(24,\s*63,\s*184\)/);
    expect(Number(head.backWeight)).toBe(600);
    expect(Number(mockup.backWeight)).toBe(600);
    expect(head.eyebrow.toUpperCase()).toBe('JOB #0036');
    expect(Number(head.eyebrowWeight)).toBe(500);
    expect(Number(mockup.eyebrowWeight)).toBe(500);
    expect(head.eyebrowTracking).toBeCloseTo(mockup.eyebrowTracking, 0);
    expect(Number(head.titleWeight)).toBe(600);
    expect(Number(mockup.titleWeight)).toBe(600);
    expect(head.titleSize).toBe(24);
    expect(mockup.titleSize).toBe(34);
    expect(near(head.appbarY, mockup.appbarY), `appbar y head ${head.appbarY} mock ${mockup.appbarY}`).toBe(true);
    expect(near(head.eyebrowY, mockup.eyebrowY), `eyebrow y head ${head.eyebrowY} mock ${mockup.eyebrowY}`).toBe(true);
    expect(near(head.titleY, mockup.titleY), `title y head ${head.titleY} mock ${mockup.titleY}`).toBe(true);
    expect(head.ctaY, 'head ctaY is titleBottom plus mock title-to-CTA gap').toBe(
      head.titleBottom + (mockup.ctaY - mockup.titleBottom),
    );
    expect(head.ctaY, 'head fixture ctaY at 390').toBe(199);
    expect(near(head.avatarW, 32)).toBe(true);
    expect(near(head.avatarH, 32)).toBe(true);
    expect(head.avatarBg.replace(/\s+/g, '')).toMatch(/rgb\(10,\s*10,\s*11\)/);
    expect(head.tabBg.replace(/\s+/g, '')).toMatch(/rgb\(235,\s*235,\s*238\)/);
    expect(mockup.tabBg.replace(/\s+/g, '')).toMatch(/rgb\(235,\s*235,\s*238\)/);
    expect(near(head.tabPad, mockup.tabPad)).toBe(true);
    expect(near(head.tabGap, mockup.tabGap)).toBe(true);
    expect(near(head.tabRadius, mockup.tabRadius)).toBe(true);
    expect(near(head.tabH, mockup.tabH)).toBe(true);
    expect(Number(head.kvValueWeight)).toBe(400);
    expect(Number(mockup.kvValueWeight)).toBe(400);
    expect(Number(head.phoneTextWeight), 'head phone visible text weight').toBe(400);
    expect(Number(head.siteTextWeight), 'head site visible text weight').toBe(400);
    expect(Math.abs(head.phoneInk - 103.875), `head phone ink ${head.phoneInk}`).toBeLessThanOrEqual(0.3);
    expect(head.tabFontSize).toBe(14);
    expect(mockup.tabFontSize).toBe(14);
    expect(Number(head.tabFontWeight)).toBe(500);
    expect(Number(mockup.tabFontWeight)).toBe(600);
    expect(head.tabLabels, 'head tab labels pinned to mock').toEqual(mockLabels);
    expect(mockup.tabLabels).toEqual(mockLabels);
    expect(head.tabWidths.length, 'four tab columns').toBe(4);
    expect(mockup.tabWidths.length).toBe(4);
    // R9 pins mock labels (Paperwork 3 / Materials 1). Settled widths stay the
    // r15 pin; Jack native 390 (Paperwork 2 / Materials 4) is 79.73/79.73/97.61/86.92.
    const headTabW390 = [81.390625, 81.390625, 97.53125, 83.6875];
    if (process.env.P3_R16M) {
      console.log('P3_R16M R9 tabs', JSON.stringify({
        labels: head.tabLabels,
        widths: head.tabWidths,
        inks: head.tabInks,
        padX: head.tabPadX,
        phoneTextWeight: head.phoneTextWeight,
        phoneInk: head.phoneInk,
      }));
    }
    head.tabWidths.forEach((w, i) => {
      expect(w, `tab ${i} width head ${w}`).toBe(headTabW390[i]);
      expect(Number(head.tabWeights[i]), `tab ${i} weight`).toBe(i === 0 ? 500 : 400);
      const pad = head.tabPadX[i];
      const ink = head.tabInks[i];
      expect(w, `tab ${i} holds ink+pad ${ink}+${pad}`).toBeGreaterThanOrEqual(ink + pad - 1);
      expect(w - pad, `tab ${i} content box >= ink`).toBeGreaterThanOrEqual(ink - 1);
    });
    expect(head.tabOnShadow.replace(/\s+/g, ''), 'active tab --line ring').toMatch(/rgb\(228,228,231\)/);
    expect(near(head.searchX, mockup.searchX), `searchX head ${head.searchX} mock ${mockup.searchX}`).toBe(true);
    expect(near(head.avatarX, mockup.avatarX), `avatarX head ${head.avatarX} mock ${mockup.avatarX}`).toBe(true);
    expect(head.eyebrowColor.replace(/\s+/g, '')).toMatch(/rgb\(74,\s*74,\s*82\)/);
    expect(mockup.eyebrowColor.replace(/\s+/g, '')).toMatch(/rgb\(74,\s*74,\s*82\)/);
    expect(near(head.subLh, 24)).toBe(true);
    expect(near(mockup.subLh, 24)).toBe(true);
    expect(head.crewText).toBe('Dean Moretti, Tom Nguyen');
    expect(mockup.crewText).toBe('Dean Moretti, Tom Nguyen');
    expect(head.kvHeights[head.kvHeights.length - 1], `crew row ${head.kvHeights[head.kvHeights.length - 1]}`).toBeGreaterThanOrEqual(54);
    expect(head.pillText).toContain('Ready to invoice');
    expect(head.subAlign).toBe('center');
    expect(head.emailPainted, 'Email is not its own painted row').toBe(false);
    expect(head.clientHref).toBe('/clients/p3-client-36');
    expect(head.scopeH).toMatch(/20px/);
    expect(near(head.noteBySize, 14)).toBe(true);
    expect(near(mockup.noteBySize, 14)).toBe(true);
    expect(Number(head.noteByWeight)).toBe(500);
    expect(Number(mockup.noteByWeight)).toBe(500);
    expect(head.noteByColor.replace(/\s+/g, '')).toMatch(/rgb\(74,\s*74,\s*82\)/);
    expect(mockup.noteByColor.replace(/\s+/g, '')).toMatch(/rgb\(74,\s*74,\s*82\)/);
    expect(near(head.notePSize, 16)).toBe(true);
    expect(near(mockup.notePSize, 16)).toBe(true);
    expect(near(head.notePLh, 24)).toBe(true);
    expect(near(mockup.notePLh, 24)).toBe(true);
    expect(Number(head.notePWeight), 'head note body weight 400').toBe(400);
    expect(Number(mockup.notePWeight), 'mock note body weight 400').toBe(400);
    expect(near(head.notesHSize, mockup.notesHSize), `Notes h size head ${head.notesHSize} mock ${mockup.notesHSize}`).toBe(true);
    expect(Number(head.notesHWeight), 'head Notes heading weight').toBe(Number(mockup.notesHWeight));
    expect(near(head.notesHSize, 20)).toBe(true);
    expect(Number(head.notesHWeight)).toBe(600);
    expect(mockup.notesExtra, 'mock Notes header has no extra (disclosed)').toBe('');
    expect(head.notesExtra, 'head Notes header extra disclosed; mock has none').toBe('All notes');
    expect(near(head.notePad, 14)).toBe(true);
    expect(near(mockup.notePad, 14)).toBe(true);
    expect(head.noteBorder).toBe('1px');
    expect(mockup.noteBorder).toBe('1px');
    expect(head.photoCols, 'photos 3-col').toBe(3);
    expect(mockup.photoCols).toBe(3);
    expect(near(head.photoGap, 6)).toBe(true);
    expect(near(mockup.photoGap, 6)).toBe(true);
    expect(near(head.photoRatio, 1, 0.08)).toBe(true);
    expect(near(mockup.photoRatio, 1, 0.08)).toBe(true);
    expect(near(head.photoRadius, mockup.photoRadius)).toBe(true);
    expect(head.photoShadow).toMatch(/inset/i);
    expect(mockup.photoShadow).toMatch(/inset/i);
    expect(mockup.photosH, 'mock Photos heading is the word Photos').toBe('Photos');
    expect(mockup.photosExtra, 'mock Photos count format N · …').toMatch(/^\d+ · /);
    expect(head.photosH, 'head Photos heading disclosed; count is data, format Photos · N not mock extra N · …').toMatch(/^Photos · \d+$/);
    expect(head.photosExtra, 'head Photos extra disclosed; mock extra is N · placeholders').toBe('All photos');
    expect(head.photoHasIcon, 'head placeholder camera icon').toBe(true);
    expect(mockup.photoHasIcon, 'mock placeholder camera icon').toBe(true);
    expect(near(head.photoIconX, mockup.photoIconX), `photo icon X head ${head.photoIconX} mock ${mockup.photoIconX}`).toBe(true);
    expect(near(head.photoIconY, mockup.photoIconY), `photo icon Y head ${head.photoIconY} mock ${mockup.photoIconY}`).toBe(true);
    expect(near(head.photoCapX, mockup.photoCapX), `photo cap X head ${head.photoCapX} mock ${mockup.photoCapX}`).toBe(true);
    expect(near(head.photoCapBottom, mockup.photoCapBottom), `photo cap bottom head ${head.photoCapBottom} mock ${mockup.photoCapBottom}`).toBe(true);
    expect(['left', 'start'].includes(head.photoCapAlign), `head photo cap align ${head.photoCapAlign}`).toBe(true);
    expect(['left', 'start'].includes(mockup.photoCapAlign), `mock photo cap align ${mockup.photoCapAlign}`).toBe(true);
    expect(String(head.photoCapClamp), 'head caption 2-line clamp').toBe('2');
    const photoFillTarget: [number, number, number] = [235, 235, 238];
    const photoRingTarget: [number, number, number] = [228, 228, 231];
    const photoFillRegion = (shot: { width: number; height: number }) => {
      const midX = Math.floor(shot.width / 2);
      const midY = Math.floor(shot.height / 2);
      return {
        x0: Math.max(0, midX - 4),
        x1: Math.min(shot.width, midX + 5),
        y0: Math.max(0, midY - 4),
        y1: Math.min(shot.height, midY + 5),
      };
    };
    const photoRingRegion = (shot: { width: number; height: number }) => {
      const midY = Math.floor(shot.height / 2);
      return {
        x0: 2,
        x1: Math.min(shot.width, 5),
        y0: Math.max(0, midY - 4),
        y1: Math.min(shot.height, midY + 5),
      };
    };
    const mockPhotoFill = nearestPainted(mockPhotoShot, photoFillTarget, photoFillRegion(mockPhotoShot));
    const headPhotoFill = nearestPainted(headPhotoShot, photoFillTarget, photoFillRegion(headPhotoShot));
    const mockPhotoRing = nearestPainted(mockPhotoShot, photoRingTarget, photoRingRegion(mockPhotoShot));
    const headPhotoRing = nearestPainted(headPhotoShot, photoRingTarget, photoRingRegion(headPhotoShot));
    expect(mockPhotoFill.dist, `mock photo fill ${mockPhotoFill.rgb} d${mockPhotoFill.dist}`).toBeLessThanOrEqual(3);
    expect(headPhotoFill.dist, `head photo fill ${headPhotoFill.rgb} d${headPhotoFill.dist}`).toBeLessThanOrEqual(3);
    expect(mockPhotoRing.dist, `mock photo ring ${mockPhotoRing.rgb} d${mockPhotoRing.dist}`).toBeLessThanOrEqual(3);
    expect(headPhotoRing.dist, `head photo ring ${headPhotoRing.rgb} d${headPhotoRing.dist}`).toBeLessThanOrEqual(3);
    expect(head.bill3Display).toBe('grid');
    expect(mockup.bill3Display).toBe('grid');
    expect(head.bill3Cols, 'bill3 three painted columns').toBe(3);
    expect(mockup.bill3Cols).toBe(3);
    expect(head.bill3Rows, 'bill3 one row').toBe(1);
    expect(mockup.bill3Rows).toBe(1);
    expect(head.billCellTopList.length, 'bill3 three cell tops').toBe(3);
    expect(head.billCellLeftList.length, 'bill3 three cell lefts').toBe(3);
    expect(Math.abs(head.billCellTopList[0] - head.billCellTopList[1]) <= 1, `bill3 tops 0/1 ${head.billCellTopList}`).toBe(true);
    expect(Math.abs(head.billCellTopList[1] - head.billCellTopList[2]) <= 1, `bill3 tops 1/2 ${head.billCellTopList}`).toBe(true);
    expect(head.billCellLeftList[0] < head.billCellLeftList[1], `bill3 lefts 0<1 ${head.billCellLeftList}`).toBe(true);
    expect(head.billCellLeftList[1] < head.billCellLeftList[2], `bill3 lefts 1<2 ${head.billCellLeftList}`).toBe(true);
    expect(mockup.billCellTopList.length, 'mock bill3 three cell tops').toBe(3);
    expect(Math.abs(mockup.billCellTopList[0] - mockup.billCellTopList[1]) <= 1, `mock bill3 tops ${mockup.billCellTopList}`).toBe(true);
    expect(mockup.billCellLeftList[0] < mockup.billCellLeftList[1], `mock bill3 lefts ${mockup.billCellLeftList}`).toBe(true);
    expect(head.billFirstPadL).toBe(0);
    expect(head.billFirstBorderL).toBe(0);
    expect(head.billCellPadL).toBe(12);
    expect(head.billCellBorderL).toBe(1);
    expect(mockup.billFirstPadL).toBe(0);
    expect(mockup.billFirstBorderL).toBe(0);
    expect(mockup.billCellPadL).toBe(12);
    expect(mockup.billCellBorderL).toBe(1);
    expect(head.bill3BorderTop).toBe('1px');
    expect(head.bill3BorderBottom).toBe('1px');
    expect(near(head.billLSize, 13)).toBe(true);
    expect(head.billLColor.replace(/\s+/g, '')).toMatch(/rgb\(74,\s*74,\s*82\)/);
    expect(near(head.billVSize, 20)).toBe(true);
    expect(near(head.billVLh, 26)).toBe(true);
    expect(Number(head.billVWeight)).toBe(600);
    expect(head.billVVariant).toMatch(/tabular-nums/);
    expect(near(mockup.billVSize, 20)).toBe(true);
    expect(near(mockup.billVLh, 26)).toBe(true);
    expect(Number(mockup.billVWeight)).toBe(600);
    expect(mockup.billVVariant).toMatch(/tabular-nums/);
    expect(head.billVInsets.length, 'head bill value insets').toBe(3);
    expect(mockup.billVInsets.length, 'mock bill value insets').toBe(3);
    expect(near(head.billVInsets[0], 0), `head Budget value inset ${head.billVInsets[0]}`).toBe(true);
    expect(near(head.billVInsets[1], 12), `head Cost value inset ${head.billVInsets[1]}`).toBe(true);
    expect(near(head.billVInsets[2], 12), `head Charge value inset ${head.billVInsets[2]}`).toBe(true);
    expect(near(mockup.billVInsets[0], 0), `mock Budget value inset ${mockup.billVInsets[0]}`).toBe(true);
    expect(near(mockup.billVInsets[1], 12), `mock Cost value inset ${mockup.billVInsets[1]}`).toBe(true);
    expect(near(mockup.billVInsets[2], 12), `mock Charge value inset ${mockup.billVInsets[2]}`).toBe(true);
    expect(near(head.billVSizes[0], 20), `head Budget .v size ${head.billVSizes[0]}`).toBe(true);
    expect(near(head.billVSizes[1], 20), `head Cost .v size ${head.billVSizes[1]}`).toBe(true);
    expect(near(head.billVSizes[2], 20), `head Charge .v size ${head.billVSizes[2]}`).toBe(true);
    expect(near(head.billVLhs[0], 26), `head Budget .v lh ${head.billVLhs[0]}`).toBe(true);
    expect(near(head.billVLhs[1], 26), `head Cost .v lh ${head.billVLhs[1]}`).toBe(true);
    expect(near(head.billVLhs[2], 26), `head Charge .v lh ${head.billVLhs[2]}`).toBe(true);
    expect(Number(head.billVWeights[0]), 'head Budget .v weight').toBe(600);
    expect(Number(head.billVWeights[1]), 'head Cost .v weight').toBe(600);
    expect(Number(head.billVWeights[2]), 'head Charge .v weight').toBe(600);
    expect(near(mockup.billVSizes[0], 20), `mock Budget .v size ${mockup.billVSizes[0]}`).toBe(true);
    expect(near(mockup.billVSizes[1], 20), `mock Cost .v size ${mockup.billVSizes[1]}`).toBe(true);
    expect(near(mockup.billVSizes[2], 20), `mock Charge .v size ${mockup.billVSizes[2]}`).toBe(true);
    expect(near(mockup.billVLhs[0], 26), `mock Budget .v lh ${mockup.billVLhs[0]}`).toBe(true);
    expect(near(mockup.billVLhs[1], 26), `mock Cost .v lh ${mockup.billVLhs[1]}`).toBe(true);
    expect(near(mockup.billVLhs[2], 26), `mock Charge .v lh ${mockup.billVLhs[2]}`).toBe(true);
    expect(Number(mockup.billVWeights[0]), 'mock Budget .v weight').toBe(600);
    expect(Number(mockup.billVWeights[1]), 'mock Cost .v weight').toBe(600);
    expect(Number(mockup.billVWeights[2]), 'mock Charge .v weight').toBe(600);
    expect(head.billSubCount, 'real line sub-lines').toBeGreaterThan(0);
    expect(mockup.billSubCount).toBeGreaterThan(0);
    expect(head.billSubText).toMatch(/·/);
    expect(mockup.billSubText).toMatch(/·/);
    expect(near(head.totBigSize, 17)).toBe(true);
    expect(Number(head.totBigWeight)).toBe(700);
    expect(head.totBigBorderTop).toBe('1px');
    expect(near(mockup.totBigSize, 17)).toBe(true);
    expect(Number(mockup.totBigWeight)).toBe(700);
    expect(head.billCellH, 'head bill3 cell height below 768').toBe(122);
    expect(mockup.billCellH, 'mock bill3 cell height').toBe(122);
    expect(head.billLabelTop[0], `head Budget label top ${head.billLabelTop[0]}`).toBe(mockup.billLabelTop[0]);
    expect(head.billLabelTop[1], `head Cost label top ${head.billLabelTop[1]}`).toBe(mockup.billLabelTop[1]);
    expect(head.billLabelTop[2], `head Charge label top ${head.billLabelTop[2]}`).toBe(mockup.billLabelTop[2]);
    expect(head.billValueX[0], `head Budget value x ${head.billValueX[0]}`).toBe(13);
    expect(head.billValueX[1], `head Cost value x ${head.billValueX[1]}`).toBe(26);
    expect(head.billValueX[2], `head Charge value x ${head.billValueX[2]}`).toBe(26);
    expect(mockup.billValueX[0], `mock Budget value x ${mockup.billValueX[0]}`).toBe(13);
    expect(mockup.billValueX[1], `mock Cost value x ${mockup.billValueX[1]}`).toBe(26);
    expect(mockup.billValueX[2], `mock Charge value x ${mockup.billValueX[2]}`).toBe(26);
    expect(head.totH, 'head tot row height').toBe(40);
    expect(mockup.totH, 'mock tot row height').toBe(40);
    expect(head.totBigH, 'head tot.big row height').toBe(45);
    expect(mockup.totBigH, 'mock tot.big row height').toBe(45);
    expect(head.noteByH, 'head note .by height').toBe(24);
    expect(head.noteByLh, 'head note .by lh').toBe(24);
    expect(mockup.noteByH, 'mock note .by height').toBe(24);
    expect(mockup.noteByLh, 'mock note .by lh').toBe(24);
      expect(Math.abs(head.titleInk - 333.96875), `head title ink ${head.titleInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(head.kvLabelInk - 23.3125), `head kv label ink ${head.kvLabelInk}`).toBeLessThanOrEqual(0.3);
      expect(Math.abs(head.kvValueInk - 162.734375), `head kv value ink ${head.kvValueInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(head.notePInk - 90.875), `head note p ink ${head.notePInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(head.scopeHInk - 144.21875), `head scope ink ${head.scopeHInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(head.ctaInk - 184.125), `head cta ink ${head.ctaInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(head.tabInks[0] - 61.296875), `head tab on ink ${head.tabInks[0]}`).toBeLessThanOrEqual(1);
      expect(Math.abs(head.tabInks[1] - 44.078125), `head tab off ink ${head.tabInks[1]}`).toBeLessThanOrEqual(1);
      expect(Math.abs(head.titleFixedInk - 348.1621398925781), `head title fixed ink ${head.titleFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(head.kvLabelFixedInk - 179.76409912109375), `head kv label fixed ink ${head.kvLabelFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(head.kvValueFixedInk - 221.24844360351562), `head kv value fixed ink ${head.kvValueFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(head.notePFixedInk - 221.24844360351562), `head note p fixed ink ${head.notePFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(head.scopeHFixedInk - 290.1357421875), `head scope fixed ink ${head.scopeHFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(head.ctaFixedInk - 246.6151123046875), `head cta fixed ink ${head.ctaFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(head.tabOnFixedInk - 198.3568115234375), `head tab on fixed ink ${head.tabOnFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(head.tabOffFixedInk - 193.59127807617188), `head tab off fixed ink ${head.tabOffFixedInk}`).toBeLessThanOrEqual(1);
  });

  async function assertActionsVisible(page: KillPage, width: number) {
    await page.evaluate(() => {
      document.querySelector('[data-job-sheet="actions"]')?.scrollIntoView({ block: 'center' });
    });
    const box = await page.evaluate(() => {
      const el = document.querySelector('[data-job-sheet="actions"]') as HTMLElement | null;
      const summary = document.querySelector('[data-job-sheet="actions"] > summary') as HTMLElement | null;
      const style = el ? getComputedStyle(el) : null;
      const r = el?.getBoundingClientRect();
      const sr = summary?.getBoundingClientRect();
      const innerW = window.innerWidth;
      const innerH = window.innerHeight;
      const top = r?.top ?? -1;
      const bottom = r?.bottom ?? -1;
      const left = r?.left ?? -1;
      const right = r?.right ?? -1;
      return {
        display: style?.display || '',
        visibility: style?.visibility || '',
        width: r?.width ?? 0,
        height: r?.height ?? 0,
        top,
        bottom,
        left,
        right,
        innerW,
        innerH,
        visW: Math.min(right, innerW) - Math.max(left, 0),
        visH: Math.min(bottom, innerH) - Math.max(top, 0),
        sumW: sr?.width ?? 0,
        sumH: sr?.height ?? 0,
      };
    });
    expect(box.display, `${width} Actions display`).not.toBe('none');
    expect(box.visibility, `${width} Actions visibility`).not.toBe('hidden');
    expect(box.width, `${width} Actions width`).toBeGreaterThan(0);
    expect(box.height, `${width} Actions height`).toBeGreaterThan(0);
    expect(box.visW, `${width} Actions visible width in viewport`).toBeGreaterThan(0);
    expect(box.visH, `${width} Actions visible height in viewport`).toBeGreaterThan(0);
    expect(box.top, `${width} Actions top`).toBeLessThan(box.innerH);
    expect(box.bottom, `${width} Actions bottom`).toBeGreaterThan(0);
    expect(box.left, `${width} Actions left`).toBeLessThan(box.innerW);
    expect(box.right, `${width} Actions right`).toBeGreaterThan(0);
    expect(box.top, `${width} Actions top`).toBeGreaterThanOrEqual(-1);
    expect(box.bottom, `${width} Actions bottom`).toBeLessThanOrEqual(box.innerH + 1);
    expect(box.left, `${width} Actions left`).toBeGreaterThanOrEqual(-1);
    expect(box.right, `${width} Actions right`).toBeLessThanOrEqual(box.innerW + 1);
    expect(box.sumW, `${width} Actions summary width`).toBeGreaterThan(0);
    expect(box.sumH, `${width} Actions summary height`).toBeGreaterThan(0);
    expect(box.sumW, `${width} Actions summary fills gutters`).toBeGreaterThanOrEqual(box.innerW - 32 - 1);
    return box;
  }

  async function assertActionsHitTest(page: KillPage, width: number) {
    if (await page.evaluate(() => !!document.querySelector('[data-job-form="1"]'))) {
      await page.click('.hub-ops-form-close');
      await page.waitForSelector('[data-job-form="1"]', { state: 'detached', timeout: 5000 });
    }
    await page.evaluate(() => {
      document.querySelector('[data-job-sheet="actions"]')?.scrollIntoView({ block: 'center' });
    });
    const hit = await page.evaluate(() => {
      const summary = document.querySelector('[data-job-sheet="actions"] > summary') as HTMLElement | null;
      const sr = summary?.getBoundingClientRect();
      const cx = sr ? sr.left + sr.width / 2 : -1;
      const cy = sr ? sr.top + sr.height / 2 : -1;
      const el = (cx >= 0 && cy >= 0) ? document.elementFromPoint(cx, cy) : null;
      return {
        ok: !!summary && !!el && (el === summary || summary.contains(el)),
        tag: el ? `${(el as HTMLElement).tagName}.${(el as HTMLElement).className}`.replace(/\s+/g, '.') : 'null',
        cx,
        cy,
        sumW: sr?.width ?? 0,
        sumH: sr?.height ?? 0,
      };
    });
    expect(hit.sumW, `${width} Actions hit-test summary width`).toBeGreaterThan(0);
    expect(hit.sumH, `${width} Actions hit-test summary height`).toBeGreaterThan(0);
    expect(hit.ok, `${width} Actions hit-test at centre ${hit.tag} @${hit.cx},${hit.cy}`).toBe(true);
    return hit;
  }

  killIt('R9 existing job edit save writes the new title', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    await assertActionsVisible(page, 390);
    await assertActionsHitTest(page, 390);
    await page.click('[data-job-sheet="actions"] > summary');
    await page.click('[data-job-action="details"]');
    await page.waitForSelector('[data-job-form="1"]', { timeout: 10000 });
    await page.evaluate(() => {
      const input = document.querySelector('[data-job-form="1"] input.form-input') as HTMLInputElement | null;
      if (!input) throw new Error('title input missing');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'Blocked sewer, CCTV inspection edited');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await page.evaluate(() => {
      const save = [...document.querySelectorAll('[data-job-form="1"] button')]
        .find((el) => /Save Changes/i.test(el.textContent || '')) as HTMLElement | undefined;
      save?.click();
    });
    const writes = await page.evaluate(async () => {
      type JobWrite = { table: string; values: Record<string, unknown>; id?: unknown };
      for (let i = 0; i < 50; i += 1) {
        const rows = (window as unknown as { __P3_JOB_UPDATES__?: JobWrite[] }).__P3_JOB_UPDATES__ ?? [];
        if (rows.some((row) => row.table === 'jobs' && row.values.title === 'Blocked sewer, CCTV inspection edited')) return rows;
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
      return (window as unknown as { __P3_JOB_UPDATES__?: JobWrite[] }).__P3_JOB_UPDATES__ ?? [];
    });
    await page.close();
    expect(writes.some((row) => (
      row.table === 'jobs'
      && row.id === 'p3-0036'
      && row.values.title === 'Blocked sewer, CCTV inspection edited'
    )), JSON.stringify(writes)).toBe(true);
  });

  killIt('R9 sheet actions stay reachable at 375 390 768', async () => {
    for (const width of [375, 390, 768] as const) {
      const page = await openPage({ width, path: '/jobs/p3-0036' });
      await waitSheet(page);
      await assertActionsVisible(page, width);
      await assertActionsHitTest(page, width);
      await page.click('[data-job-sheet="actions"] > summary');
      await assertActionsHitTest(page, width);
      await page.evaluate(() => {
        document.querySelector('[data-job-action="details"]')?.scrollIntoView({ block: 'center' });
      });
      const read = await page.evaluate(() => {
        const appMore = document.querySelector('.job-sheet-appbar .hub-job-more') as HTMLElement | null;
        const items = [...document.querySelectorAll('[data-job-sheet="actions"] [role="menuitem"]')]
          .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());
        const appStyle = appMore ? getComputedStyle(appMore) : null;
        const details = document.querySelector('[data-job-action="details"]') as HTMLElement | null;
        const d = details?.getBoundingClientRect();
        const style = details ? getComputedStyle(details) : null;
        const innerW = window.innerWidth;
        const innerH = window.innerHeight;
        const visW = d ? Math.min(d.right, innerW) - Math.max(d.left, 0) : 0;
        const visH = d ? Math.min(d.bottom, innerH) - Math.max(d.top, 0) : 0;
        const menu = document.querySelector('[data-job-sheet="actions"] .hub-job-more-menu') as HTMLElement | null;
        const summary = document.querySelector('[data-job-sheet="actions"] > summary') as HTMLElement | null;
        const m = menu?.getBoundingClientRect();
        const s = summary?.getBoundingClientRect();
        return {
          appMorePainted: !!appMore && appStyle?.display !== 'none' && (appMore.getBoundingClientRect().width || 0) > 0,
          items,
          detailsW: d?.width ?? 0,
          detailsH: d?.height ?? 0,
          detailsVis: style?.visibility || '',
          detailsVisW: visW,
          detailsVisH: visH,
          menuW: m?.width ?? 0,
          menuL: m?.left ?? -1,
          menuR: m?.right ?? -1,
          sumL: s?.left ?? -1,
          sumR: s?.right ?? -1,
          innerW,
        };
      });
      expect(read.appMorePainted, `${width} appbar …`).toBe(false);
      expect(read.detailsW, `${width} Details width`).toBeGreaterThan(0);
      expect(read.detailsH, `${width} Details height`).toBeGreaterThan(0);
      expect(read.detailsVis, `${width} Details visibility`).not.toBe('hidden');
      expect(read.detailsVisW, `${width} Details visible width in viewport`).toBeGreaterThan(0);
      expect(read.detailsVisH, `${width} Details visible height in viewport`).toBeGreaterThan(0);
      expect(read.menuW, `${width} Actions menu width`).toBeGreaterThanOrEqual(read.innerW - 32 - 1);
      expect(Math.abs(read.menuL - read.sumL) <= 1, `${width} Actions menu left under button ${read.menuL}/${read.sumL}`).toBe(true);
      expect(Math.abs(read.menuR - read.sumR) <= 1, `${width} Actions menu right under button ${read.menuR}/${read.sumR}`).toBe(true);
      await page.click('[data-job-action="details"]');
      await page.waitForSelector('[data-job-form="1"]', { timeout: 10000 });
      await assertActionsVisible(page, width);
      await page.close();
      expect(read.items, `${width} actions`).toEqual(expect.arrayContaining([
        'Details',
        'Add to calendar',
        'Post update',
        'Invoice',
        'Start inspection',
      ]));
      expect(read.items.some((item) => /Clock (on|off)/.test(item)), `${width} clock`).toBe(true);
      expect(read.items.some((item) => /JHA/.test(item)), `${width} JHA`).toBe(true);
    }
  });

  killIt('R9 tab labels keep 8px inset with two-digit counts at 375 and 390', async () => {
    for (const width of [375, 390] as const) {
      const page = await openPage({ width, path: '/jobs/p3-0036' });
      await waitSheet(page);
      const read = await page.evaluate(() => {
        const tabs = [...document.querySelectorAll('.job-sheet-tab')] as HTMLElement[];
        const paperwork = tabs.find((tab) => /Paperwork/.test(tab.textContent || ''));
        const materials = tabs.find((tab) => /Materials/.test(tab.textContent || ''));
        if (paperwork) paperwork.textContent = 'Paperwork 12';
        if (materials) materials.textContent = 'Materials 12';
        const textBox = (el: HTMLElement) => {
          const range = document.createRange();
          range.selectNodeContents(el);
          const rects = [...range.getClientRects()].filter((box) => box.width > 0 && box.height > 0);
          if (!rects.length) return { left: 0, right: 0 };
          return {
            left: Math.min(...rects.map((box) => box.left)),
            right: Math.max(...rects.map((box) => box.right)),
          };
        };
        return [paperwork, materials].filter(Boolean).map((tab) => {
          const box = tab!.getBoundingClientRect();
          const text = textBox(tab!);
          return {
            label: tab!.textContent,
            leftGap: text.left - box.left,
            rightGap: box.right - text.right,
          };
        });
      });
      await page.close();
      expect(read.length).toBe(2);
      for (const row of read) {
        expect(row.leftGap, `${width} ${row.label} left`).toBeGreaterThanOrEqual(8);
        expect(row.rightGap, `${width} ${row.label} right`).toBeGreaterThanOrEqual(8);
      }
    }
  });

  killIt('R9 disabled CTA paints disabled, not ink', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    await page.evaluate(() => {
      const cta = document.querySelector('[data-job-sheet="cta"]') as HTMLButtonElement | null;
      if (!cta) throw new Error('cta missing');
      cta.disabled = true;
    });
    const painted = await sampleCtaPaintedRgb(page, '[data-job-sheet="cta"]');
    await page.close();
    const ink = painted.fill[0] <= 22 && painted.fill[1] <= 22 && painted.fill[2] <= 22;
    expect(ink, `disabled CTA fill ${painted.fill}`).toBe(false);
    expect(painted.fill[1], `disabled CTA stays grey ${painted.fill}`).toBeGreaterThan(80);
  });

  killIt('R10 Go/Call ring paints line-strong on the edge', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    const shot = await samplePaintedPixels(page, '[data-job-sheet="kv-site"] .job-sheet-kv-act', 2);
    const midY = Math.floor(shot.height / 2);
    const edge = nearestPainted(shot, [161, 161, 170], {
      x0: 0,
      x1: Math.min(6, shot.width),
      y0: Math.max(0, midY - 4),
      y1: Math.min(shot.height, midY + 5),
    });
    await page.close();
    expect(Math.abs(edge.rgb[0] - 161), `Go ring R ${edge.rgb} d${edge.dist}`).toBeLessThanOrEqual(18);
    expect(Math.abs(edge.rgb[1] - 161), `Go ring G ${edge.rgb}`).toBeLessThanOrEqual(18);
    expect(Math.abs(edge.rgb[2] - 170), `Go ring B ${edge.rgb}`).toBeLessThanOrEqual(18);
  });

  killIt('R10 Site hairline paints above the first KV row', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    const shot = await samplePaintedPixels(page, '[data-job-sheet="kv"] > [data-job-kv-rule]', 2);
    const hair = nearestPainted(shot, [228, 228, 231]);
    await page.close();
    expect(Math.abs(hair.rgb[0] - 228), `Site hair R ${hair.rgb} d${hair.dist}`).toBeLessThanOrEqual(12);
    expect(Math.abs(hair.rgb[1] - 228), `Site hair G ${hair.rgb}`).toBeLessThanOrEqual(12);
    expect(Math.abs(hair.rgb[2] - 231), `Site hair B ${hair.rgb}`).toBeLessThanOrEqual(12);
  });

  killIt('R10 KV value paints ink at weight 400', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    const read = await page.evaluate(() => {
      const value = document.querySelector('[data-job-sheet="kv-site"] .job-sheet-kv-value') as HTMLElement | null;
      return value ? getComputedStyle(value).fontWeight : '';
    });
    const shot = await samplePaintedPixels(page, '[data-job-sheet="kv-site"] .job-sheet-kv-value', 1);
    const ink = nearestPainted(shot, [10, 10, 11]);
    const kvInkW = await page.evaluate(() => {
      const value = document.querySelector('[data-job-sheet="kv-site"] .job-sheet-kv-value');
      if (!value) return 0;
      const range = document.createRange();
      range.selectNodeContents(value);
      const rects = [...range.getClientRects()].filter((box) => box.width > 0);
      if (!rects.length) return 0;
      return Math.max(...rects.map((box) => box.right)) - Math.min(...rects.map((box) => box.left));
    });
    const kvFixedInk = await page.evaluate(() => {
      const value = document.querySelector('[data-job-sheet="kv-site"] .job-sheet-kv-value') as HTMLElement | null;
      if (!value) return 0;
      const cs = getComputedStyle(value);
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) return 0;
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      return ctx.measureText('Hamburgefonstiv 0123456789').width;
    });
    await page.close();
    expect(Number(read)).toBe(400);
    expect(Math.abs(kvInkW - 162.734375), `kv value ink width ${kvInkW}`).toBeLessThanOrEqual(1);
    expect(Math.abs(kvFixedInk - 221.24844360351562), `kv value fixed ink ${kvFixedInk}`).toBeLessThanOrEqual(1);
    expect(ink.rgb[0], `kv ink ${ink.rgb}`).toBeLessThanOrEqual(40);
    expect(ink.rgb[1], `kv ink ${ink.rgb}`).toBeLessThanOrEqual(40);
    expect(ink.rgb[2], `kv ink ${ink.rgb}`).toBeLessThanOrEqual(40);
  });

  killIt('R12 Actions paints kit secondary border and fills the gutters', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    const box = await assertActionsVisible(page, 390);
    await assertActionsHitTest(page, 390);
    expect(box.sumW, '390 Actions summary fills gutters').toBeGreaterThanOrEqual(box.innerW - 32 - 1);
    const paint = await page.evaluate(() => {
      const summary = document.querySelector('[data-job-sheet="actions"] > summary') as HTMLElement | null;
      const cs = summary ? getComputedStyle(summary) : null;
      return {
        borderTop: cs?.borderTopWidth || '',
        borderRight: cs?.borderRightWidth || '',
        borderBottom: cs?.borderBottomWidth || '',
        borderLeft: cs?.borderLeftWidth || '',
        bg: cs?.backgroundColor || '',
      };
    });
    const shot = await samplePaintedPixels(page, '[data-job-sheet="actions"] > summary', 2);
    const midY = Math.floor(shot.height / 2);
    const midX = Math.floor(shot.width / 2);
    const edge = nearestPainted(shot, [229, 231, 235], {
      x0: 0,
      x1: Math.min(6, shot.width),
      y0: Math.max(0, midY - 4),
      y1: Math.min(shot.height, midY + 5),
    });
    const fill = nearestPainted(shot, [255, 255, 255], {
      x0: Math.max(0, midX - 4),
      x1: Math.min(shot.width, midX + 5),
      y0: Math.max(0, midY - 4),
      y1: Math.min(shot.height, midY + 5),
    });
    await page.close();
    expect(paint.borderTop, 'Actions computed border-top').toBe('1px');
    expect(paint.borderRight, 'Actions computed border-right').toBe('1px');
    expect(paint.borderBottom, 'Actions computed border-bottom').toBe('1px');
    expect(paint.borderLeft, 'Actions computed border-left').toBe('1px');
    expect(paint.bg.replace(/\s+/g, ''), 'Actions computed fill').toMatch(/rgb\(255,\s*255,\s*255\)/);
    expect(Math.abs(edge.rgb[0] - 229), `Actions border R ${edge.rgb} d${edge.dist}`).toBeLessThanOrEqual(18);
    expect(Math.abs(edge.rgb[1] - 231), `Actions border G ${edge.rgb}`).toBeLessThanOrEqual(18);
    expect(Math.abs(edge.rgb[2] - 235), `Actions border B ${edge.rgb}`).toBeLessThanOrEqual(18);
    expect(Math.abs(edge.rgb[0] - 229), `Actions border R tight ${edge.rgb}`).toBeLessThanOrEqual(3);
    expect(Math.abs(edge.rgb[1] - 231), `Actions border G tight ${edge.rgb}`).toBeLessThanOrEqual(3);
    expect(Math.abs(edge.rgb[2] - 235), `Actions border B tight ${edge.rgb}`).toBeLessThanOrEqual(3);
    const creamDist = Math.abs(edge.rgb[0] - 245) + Math.abs(edge.rgb[1] - 245) + Math.abs(edge.rgb[2] - 247);
    expect(edge.dist < creamDist, `Actions border closer to #E5E7EB than cream ${edge.rgb} d${edge.dist} cream${creamDist}`).toBe(true);
    const fillCream = Math.abs(fill.rgb[0] - 245) + Math.abs(fill.rgb[1] - 245) + Math.abs(fill.rgb[2] - 247);
    expect(fill.dist < fillCream, `Actions fill closer to white than cream ${fill.rgb} d${fill.dist} cream${fillCream}`).toBe(true);
  });
});

describe('P3 r15 phone type below 768', () => {
  const readType = () => {
    const styleOf = (el: Element | null) => (el ? getComputedStyle(el as HTMLElement) : null);
    const inkBox = (el: Element | null) => {
      if (!el) return { width: 0, left: 0, top: 0, height: 0 };
      const range = document.createRange();
      const texts: { left: number; right: number; top: number; bottom: number }[] = [];
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) {
        const node = walk.currentNode;
        if (!node.textContent?.trim()) continue;
        range.selectNodeContents(node);
        for (const box of range.getClientRects()) {
          if (box.width > 0 && box.height > 0) {
            texts.push({ left: box.left, right: box.right, top: box.top, bottom: box.bottom });
          }
        }
      }
      if (!texts.length) return { width: 0, left: 0, top: 0, height: 0 };
      const left = Math.min(...texts.map((box) => box.left));
      const right = Math.max(...texts.map((box) => box.right));
      const top = Math.min(...texts.map((box) => box.top));
      const bottom = Math.max(...texts.map((box) => box.bottom));
      return { width: right - left, left, top, height: bottom - top };
    };
    const fixedInk = (el: Element | null) => {
      if (!el) return 0;
      const cs = getComputedStyle(el as HTMLElement);
      const ctx = document.createElement('canvas').getContext('2d');
      if (!ctx) return 0;
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      return ctx.measureText('Hamburgefonstiv 0123456789').width;
    };
    const visibleTextWeight = (el: Element | null) => {
      if (!el) return '';
      const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      while (walk.nextNode()) {
        const node = walk.currentNode;
        if (!node.textContent?.trim()) continue;
        const parent = node.parentElement;
        if (!parent) continue;
        const cs = getComputedStyle(parent);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        return cs.fontWeight;
      }
      return '';
    };
    const hero = document.querySelector('h1.hub-jobs-hero');
    const label = document.querySelector('[data-job-sheet="kv-site"] .job-sheet-kv-label');
    const values = [...document.querySelectorAll('.job-sheet-kv-row > .job-sheet-kv-value')];
    const scopeH = document.querySelector('.job-sheet-scope-h');
    const notesH = document.querySelector('[data-job-sheet="notes"] h2');
    const cta = document.querySelector('[data-job-sheet="cta"]');
    const tabs = [...document.querySelectorAll('.job-sheet-tab')] as HTMLElement[];
    const on = tabs.find((tab) => tab.classList.contains('is-on'));
    const off = tabs.find((tab) => !tab.classList.contains('is-on'));
    const vis = (el: Element) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const els = [...document.querySelectorAll('body *')].filter(vis);
    const rights = els.map((el) => el.getBoundingClientRect().right);
    return {
      innerWidth: window.innerWidth,
      titleSize: hero ? parseFloat(styleOf(hero)!.fontSize) : -1,
      titleLh: hero ? parseFloat(styleOf(hero)!.lineHeight) : -1,
      titleWeight: hero ? styleOf(hero)!.fontWeight : '',
      kvLabelSize: label ? parseFloat(styleOf(label)!.fontSize) : -1,
      kvLabelLh: label ? parseFloat(styleOf(label)!.lineHeight) : -1,
      kvLabelWeight: label ? styleOf(label)!.fontWeight : '',
      kvValueWeights: values.map((el) => styleOf(el)!.fontWeight),
      kvTextWeights: values.map((el) => visibleTextWeight(el)),
      phoneTextWeight: visibleTextWeight(document.querySelector('[data-job-sheet="kv-phone"] .job-client-phone-num')),
      phoneInk: inkBox(document.querySelector('[data-job-sheet="kv-phone"] .job-client-phone-num')).width,
      kvValueSize: values[0] ? parseFloat(styleOf(values[0])!.fontSize) : -1,
      kvValueLh: values[0] ? parseFloat(styleOf(values[0])!.lineHeight) : -1,
      scopeHSize: scopeH ? parseFloat(styleOf(scopeH)!.fontSize) : -1,
      scopeHLh: scopeH ? parseFloat(styleOf(scopeH)!.lineHeight) : -1,
      scopeHWeight: scopeH ? styleOf(scopeH)!.fontWeight : '',
      notesHSize: notesH ? parseFloat(styleOf(notesH)!.fontSize) : -1,
      notesHLh: notesH ? parseFloat(styleOf(notesH)!.lineHeight) : -1,
      notesHWeight: notesH ? styleOf(notesH)!.fontWeight : '',
      ctaSize: cta ? parseFloat(styleOf(cta)!.fontSize) : -1,
      ctaLh: cta ? parseFloat(styleOf(cta)!.lineHeight) : -1,
      ctaWeight: cta ? styleOf(cta)!.fontWeight : '',
      titleBottom: hero ? hero.getBoundingClientRect().bottom : -1,
      ctaY: cta ? (cta as HTMLElement).getBoundingClientRect().top : -1,
      tabWidths: tabs.map((tab) => tab.getBoundingClientRect().width),
      tabScrollWidths: tabs.map((tab) => tab.scrollWidth),
      tabPadX: tabs.map((tab) => {
        const cs = getComputedStyle(tab);
        return parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      }),
      tabWeights: tabs.map((tab) => styleOf(tab)!.fontWeight),
      tabOnShadow: on ? styleOf(on)!.boxShadow : '',
      tabOnWeight: on ? styleOf(on)!.fontWeight : '',
      tabOffWeight: off ? styleOf(off)!.fontWeight : '',
      tabOnSize: on ? parseFloat(styleOf(on)!.fontSize) : -1,
      tabOffSize: off ? parseFloat(styleOf(off)!.fontSize) : -1,
      tabOnLh: on ? parseFloat(styleOf(on)!.lineHeight) : -1,
      tabOffLh: off ? parseFloat(styleOf(off)!.lineHeight) : -1,
      tabCols: document.querySelector('.job-sheet-tabs')
        ? getComputedStyle(document.querySelector('.job-sheet-tabs') as HTMLElement).gridTemplateColumns.split(' ').filter(Boolean).length
        : 0,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
      bodyScrollWidth: document.body.scrollWidth,
      maxRight: rights.length ? Math.max(...rights) : 0,
      titleInk: inkBox(hero).width,
      kvLabelInk: inkBox(label).width,
      kvValueInk: inkBox(values[0]).width,
      scopeHInk: inkBox(scopeH).width,
      notesHInk: inkBox(notesH).width,
      ctaInk: inkBox(cta).width,
      tabOnInk: inkBox(on ?? null).width,
      tabOffInk: inkBox(off ?? null).width,
      tabInks: tabs.map((tab) => inkBox(tab).width),
      notePInk: inkBox(document.querySelector('.job-sheet-note p')).width,
      titleFixedInk: fixedInk(hero),
      kvLabelFixedInk: fixedInk(label),
      kvValueFixedInk: fixedInk(values[0] ?? null),
      scopeHFixedInk: fixedInk(scopeH),
      notesHFixedInk: fixedInk(notesH),
      ctaFixedInk: fixedInk(cta),
      tabOnFixedInk: fixedInk(on ?? null),
      tabOffFixedInk: fixedInk(off ?? null),
      notePFixedInk: fixedInk(document.querySelector('.job-sheet-note p')),
      noteByH: (() => {
        const by = document.querySelector('.job-sheet-note-by') as HTMLElement | null;
        return by ? by.getBoundingClientRect().height : -1;
      })(),
      noteByLh: (() => {
        const by = document.querySelector('.job-sheet-note-by') as HTMLElement | null;
        return by ? parseFloat(getComputedStyle(by).lineHeight) : -1;
      })(),
      totH: (() => {
        const tot = document.querySelector('[data-job-bill-tot="sub"]') as HTMLElement | null;
        return tot ? tot.getBoundingClientRect().height : -1;
      })(),
      totBigH: (() => {
        const tot = document.querySelector('[data-job-bill-tot="total"]') as HTMLElement | null;
        return tot ? tot.getBoundingClientRect().height : -1;
      })(),
      billCellH: (() => {
        const cell = document.querySelector('[data-job-bill-cell="budget"]') as HTMLElement | null;
        return cell ? cell.getBoundingClientRect().height : -1;
      })(),
      billLabelTop: (() => {
        const cell = document.querySelector('[data-job-bill-cell="budget"]') as HTMLElement | null;
        const lab = cell?.querySelector('.job-sheet-bill-l') || null;
        return cell && lab ? inkBox(lab).top - cell.getBoundingClientRect().top : -1;
      })(),
      billValueX: ['budget', 'cost', 'charge'].map((id) => {
        const cell = document.querySelector(`[data-job-bill-cell="${id}"]`) as HTMLElement | null;
        const v = cell?.querySelector('.job-sheet-bill-v') || null;
        return cell && v ? inkBox(v).left - cell.getBoundingClientRect().left : -1;
      }),
    };
  };

  killIt('R15 Jack phone type at 375 and 390', async () => {
    for (const width of [375, 390] as const) {
      const page = await openPage({ width, path: '/jobs/p3-0036' });
      await waitSheet(page);
      await waitSettledLayout(page, '.job-sheet-tabs');
      const read = await page.evaluate(readType);
      await page.close();
      expect(read.innerWidth, `${width} innerWidth`).toBe(width);
      expect(read.titleSize, `${width} title size`).toBe(24);
      expect(read.titleLh, `${width} title lh`).toBe(30);
      expect(Number(read.titleWeight), `${width} title weight`).toBe(600);
      expect(Number(read.kvLabelWeight), `${width} kv label weight`).toBe(400);
      expect(read.kvValueWeights.length, `${width} kv values`).toBeGreaterThanOrEqual(4);
      for (const [i, weight] of read.kvValueWeights.entries()) {
        expect(Number(weight), `${width} kv value ${i} weight`).toBe(400);
      }
      for (const [i, weight] of read.kvTextWeights.entries()) {
        expect(Number(weight), `${width} kv visible text ${i} weight`).toBe(400);
      }
      expect(Number(read.phoneTextWeight), `${width} phone visible text weight`).toBe(400);
      expect(Math.abs(read.phoneInk - 103.875), `${width} phone ink ${read.phoneInk}`).toBeLessThanOrEqual(0.3);
      expect(Number(read.scopeHWeight), `${width} Scope of works weight`).toBe(600);
      expect(Number(read.notesHWeight), `${width} Notes heading weight`).toBe(600);
      expect(Number(read.ctaWeight), `${width} CTA weight`).toBe(600);
      expect(Number(read.tabOnWeight), `${width} active tab weight`).toBe(500);
      expect(Number(read.tabOffWeight), `${width} inactive tab weight`).toBe(400);
      expect(read.ctaY, `${width} ctaY is titleBottom plus mock title-to-CTA gap`).toBe(
        read.titleBottom + 72,
      );
      expect(read.ctaY, `${width} fixture ctaY`).toBe(199);
      const tabW = width === 375
        ? [87.796875, 87.796875, 97.609375, 87.796875]
        : [79.734375, 79.734375, 97.609375, 86.921875];
      expect(read.tabWidths.length, `${width} tab count`).toBe(4);
      if (width === 375) {
        expect(read.tabWidths[0], '375 leftover tabs share equally').toBe(87.796875);
        expect(read.tabWidths[1], '375 leftover tabs share equally').toBe(87.796875);
        expect(read.tabWidths[3], '375 leftover tabs share equally').toBe(87.796875);
        expect(read.tabWidths[2], '375 Paperwork stays content-min').toBe(97.609375);
      }
      read.tabWidths.forEach((w, i) => {
        expect(w, `${width} tab ${i} width`).toBe(tabW[i]);
        expect(Number(read.tabWeights[i]), `${width} tab ${i} weight`).toBe(i === 0 ? 500 : 400);
        const pad = read.tabPadX[i];
        const ink = read.tabInks[i];
        expect(w, `${width} tab ${i} holds ink+pad`).toBeGreaterThanOrEqual(ink + pad - 1);
        expect(w - pad, `${width} tab ${i} content box >= ink`).toBeGreaterThanOrEqual(ink - 1);
      });
      expect(read.tabOnShadow.replace(/\s+/g, ''), `${width} active tab --line ring`).toMatch(/rgb\(228,228,231\)/);
      expect(read.tabCols, `${width} tab columns`).toBe(4);
      expect(read.scrollWidth, `${width} docSW`).toBeLessThanOrEqual(read.innerWidth);
      expect(read.bodyScrollWidth, `${width} bodySW`).toBeLessThanOrEqual(read.innerWidth);
      expect(read.maxRight, `${width} maxRight`).toBeLessThanOrEqual(read.innerWidth);
      expect(read.billCellH, `${width} bill3 cell height`).toBe(122);
      expect(read.billValueX[0], `${width} Budget value x`).toBe(13);
      expect(read.billValueX[1], `${width} Cost value x`).toBe(26);
      expect(read.billValueX[2], `${width} Charge value x`).toBe(26);
      expect(read.totH, `${width} tot row height`).toBe(40);
      expect(read.totBigH, `${width} tot.big row height`).toBe(45);
      expect(read.noteByH, `${width} note .by height`).toBe(24);
      expect(read.noteByLh, `${width} note .by lh`).toBe(24);
      expect(Math.abs(read.titleInk - 333.96875), `${width} title ink ${read.titleInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.kvLabelInk - 23.3125), `${width} kv label ink ${read.kvLabelInk}`).toBeLessThanOrEqual(0.3);
      expect(Math.abs(read.kvValueInk - 162.734375), `${width} kv value ink ${read.kvValueInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.scopeHInk - 144.21875), `${width} scope ink ${read.scopeHInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.notesHInk - 55.703125), `${width} notes h ink ${read.notesHInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.ctaInk - 184.125), `${width} cta ink ${read.ctaInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.tabOnInk - 61.296875), `${width} tab on ink ${read.tabOnInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.tabOffInk - 44.078125), `${width} tab off ink ${read.tabOffInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.notePInk - 90.875), `${width} note p ink ${read.notePInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.titleFixedInk - 348.1621398925781), `${width} title fixed ink ${read.titleFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.kvLabelFixedInk - 179.76409912109375), `${width} kv label fixed ink ${read.kvLabelFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.kvValueFixedInk - 221.24844360351562), `${width} kv value fixed ink ${read.kvValueFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.scopeHFixedInk - 290.1357421875), `${width} scope fixed ink ${read.scopeHFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.notesHFixedInk - 290.1357421875), `${width} notes h fixed ink ${read.notesHFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.ctaFixedInk - 246.6151123046875), `${width} cta fixed ink ${read.ctaFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.tabOnFixedInk - 198.3568115234375), `${width} tab on fixed ink ${read.tabOnFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.tabOffFixedInk - 193.59127807617188), `${width} tab off fixed ink ${read.tabOffFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.notePFixedInk - 221.24844360351562), `${width} note p fixed ink ${read.notePFixedInk}`).toBeLessThanOrEqual(1);
    }
  });

  killIt('R15 weight pins have painted ink widths at 375 and 390', async () => {
    for (const width of [375, 390] as const) {
      const page = await openPage({ width, path: '/jobs/p3-0036' });
      await waitSheet(page);
      await waitSettledLayout(page, '.job-sheet-tabs');
      const read = await page.evaluate(readType);
      const labelDots = inkDotCount(await samplePaintedPixels(page, '[data-job-sheet="kv-site"] .job-sheet-kv-label', 1));
      const titleDots = inkDotCount(await samplePaintedPixels(page, 'h1.hub-jobs-hero', 1));
      const phoneDots = inkDotCount(await samplePaintedPixels(page, '[data-job-sheet="kv-phone"] .job-client-phone-num', 1));
      if (process.env.P3_R16M) {
        console.log('P3_R16M ink dots', width, JSON.stringify({
          labelDots,
          titleDots,
          phoneDots,
          kvLabelInk: read.kvLabelInk,
          phoneInk: read.phoneInk,
          phoneTextWeight: read.phoneTextWeight,
        }));
      }
      await page.close();
      const ink = {
        title: 333.96875,
        kvLabel: 23.3125,
        kvValue: 162.734375,
        scopeH: 144.21875,
        notesH: 55.703125,
        cta: 184.125,
        tabOn: 61.296875,
        tabOff: 44.078125,
        noteP: 90.875,
      };
      expect(labelDots, `${width} kv label painted dots`).toBe(28);
      expect(titleDots, `${width} title painted dots`).toBe(2060);
      expect(phoneDots, `${width} phone painted dots`).toBe(290);
      expect(Math.abs(read.phoneInk - 103.875), `${width} phone ink ${read.phoneInk}`).toBeLessThanOrEqual(0.3);
      expect(Math.abs(read.titleInk - ink.title), `${width} title ink ${read.titleInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.kvLabelInk - ink.kvLabel), `${width} kv label ink ${read.kvLabelInk}`).toBeLessThanOrEqual(0.3);
      expect(Math.abs(read.kvValueInk - ink.kvValue), `${width} kv value ink ${read.kvValueInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.scopeHInk - ink.scopeH), `${width} scope ink ${read.scopeHInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.notesHInk - ink.notesH), `${width} notes h ink ${read.notesHInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.ctaInk - ink.cta), `${width} cta ink ${read.ctaInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.tabOnInk - ink.tabOn), `${width} tab on ink ${read.tabOnInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.tabOffInk - ink.tabOff), `${width} tab off ink ${read.tabOffInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.notePInk - ink.noteP), `${width} note p ink ${read.notePInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.titleFixedInk - 348.1621398925781), `${width} title fixed ink ${read.titleFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.kvLabelFixedInk - 179.76409912109375), `${width} kv label fixed ink ${read.kvLabelFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.kvValueFixedInk - 221.24844360351562), `${width} kv value fixed ink ${read.kvValueFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.scopeHFixedInk - 290.1357421875), `${width} scope fixed ink ${read.scopeHFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.notesHFixedInk - 290.1357421875), `${width} notes h fixed ink ${read.notesHFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.ctaFixedInk - 246.6151123046875), `${width} cta fixed ink ${read.ctaFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.tabOnFixedInk - 198.3568115234375), `${width} tab on fixed ink ${read.tabOnFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.tabOffFixedInk - 193.59127807617188), `${width} tab off fixed ink ${read.tabOffFixedInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.notePFixedInk - 221.24844360351562), `${width} note p fixed ink ${read.notePFixedInk}`).toBeLessThanOrEqual(1);
    }
  });

  killIt('R15 1024 and 1280 type unchanged vs r14 1dd0d37b', async () => {
    for (const width of [1024, 1280] as const) {
      const page = await openPage({ width, path: '/jobs/p3-0036' });
      await waitSheet(page);
      await waitSettledLayout(page, '.job-sheet-tabs');
      const read = await page.evaluate(readType);
      const paintSel = async (sel: string) => {
        await revealEl(page, sel);
        return inkDotCount(await samplePaintedPixels(page, sel, 1));
      };
      if (process.env.P3_R16M) {
        console.log('P3_R16M desk ink', width, JSON.stringify({
          titleInk: read.titleInk,
          kvLabelInk: read.kvLabelInk,
          scopeHInk: read.scopeHInk,
          notesHInk: read.notesHInk,
          ctaInk: read.ctaInk,
          tabOnInk: read.tabOnInk,
          tabOffInk: read.tabOffInk,
          tabWidths: read.tabWidths,
        }));
      }
      const deskDots = {
        title: await paintSel('h1.hub-jobs-hero'),
        label: await paintSel('[data-job-sheet="kv-site"] .job-sheet-kv-label'),
        scope: await paintSel('.job-sheet-scope-h'),
        notes: await paintSel('[data-job-sheet="notes"] h2'),
        cta: await paintSel('[data-job-sheet="cta"]'),
        tabOn: await paintSel('.job-sheet-tab.is-on'),
        tabOff: await paintSel('.job-sheet-tab:not(.is-on)'),
      };
      if (process.env.P3_R16M) console.log('P3_R16M desk dots', width, JSON.stringify(deskDots));
      await page.close();
      expect(read.innerWidth, `${width} innerWidth`).toBe(width);
      expect(Math.abs(read.titleInk - 339.140625), `${width} title ink ${read.titleInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.kvLabelInk - 24.125), `${width} kv label ink ${read.kvLabelInk}`).toBeLessThanOrEqual(0.3);
      expect(Math.abs(read.scopeHInk - 144.21875), `${width} scope ink ${read.scopeHInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.notesHInk - 55.703125), `${width} notes h ink ${read.notesHInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.ctaInk - 184.125), `${width} cta ink ${read.ctaInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.tabOnInk - 63.046875), `${width} tab on ink ${read.tabOnInk}`).toBeLessThanOrEqual(1);
      expect(Math.abs(read.tabOffInk - 46.28125), `${width} tab off ink ${read.tabOffInk}`).toBeLessThanOrEqual(1);
      expect(deskDots.title, `${width} title painted dots`).toBe(1674);
      expect(deskDots.label, `${width} kv label painted dots`).toBe(35);
      expect(deskDots.scope, `${width} scope painted dots`).toBe(645);
      expect(deskDots.notes, `${width} notes painted dots`).toBe(280);
      expect(deskDots.cta, `${width} cta painted dots`).toBe(16532);
      if (width === 1024) {
        expect(deskDots.tabOn, '1024 tab on painted dots').toBe(193);
        expect(deskDots.tabOff, '1024 tab off painted dots').toBe(105);
      } else {
        expect(deskDots.tabOn, '1280 tab on painted dots').toBe(196);
        expect(deskDots.tabOff, '1280 tab off painted dots').toBe(106);
      }
      expect(read.titleSize, `${width} title size`).toBe(22);
      expect(read.titleLh, `${width} title lh`).toBe(26.4);
      expect(Number(read.titleWeight), `${width} title weight`).toBe(600);
      expect(read.kvLabelSize, `${width} kv label size`).toBe(13);
      expect(read.kvLabelLh, `${width} kv label lh`).toBe(19.5);
      expect(Number(read.kvLabelWeight), `${width} kv label weight`).toBe(500);
      expect(read.kvValueSize, `${width} kv value size`).toBe(16);
      expect(read.kvValueLh, `${width} kv value lh`).toBe(22);
      for (const [i, weight] of read.kvValueWeights.entries()) {
        expect(Number(weight), `${width} kv value ${i} weight`).toBe(400);
      }
      expect(read.scopeHSize, `${width} Scope size`).toBe(20);
      expect(read.scopeHLh, `${width} Scope lh`).toBe(26);
      expect(Number(read.scopeHWeight), `${width} Scope weight`).toBe(600);
      expect(read.notesHSize, `${width} Notes h size`).toBe(20);
      expect(read.notesHLh, `${width} Notes h lh`).toBe(26);
      expect(Number(read.notesHWeight), `${width} Notes h weight`).toBe(600);
      expect(read.ctaSize, `${width} CTA size`).toBe(17);
      expect(read.ctaLh, `${width} CTA lh`).toBe(20);
      expect(Number(read.ctaWeight), `${width} CTA weight`).toBe(600);
      expect(read.tabOnSize, `${width} active tab size`).toBe(14);
      expect(read.tabOffSize, `${width} inactive tab size`).toBe(14);
      expect(read.tabOnLh, `${width} active tab lh`).toBe(21);
      expect(read.tabOffLh, `${width} inactive tab lh`).toBe(21);
      expect(Number(read.tabOnWeight), `${width} active tab weight`).toBe(600);
      expect(Number(read.tabOffWeight), `${width} inactive tab weight`).toBe(600);
      expect(read.tabCols, `${width} tab columns`).toBe(4);
      expect(read.scrollWidth, `${width} docSW`).toBeLessThanOrEqual(read.innerWidth);
      expect(read.bodyScrollWidth, `${width} bodySW`).toBeLessThanOrEqual(read.innerWidth);
      expect(read.maxRight, `${width} maxRight`).toBeLessThanOrEqual(read.innerWidth);
      expect(read.billCellH, `${width} bill3 cell height stays r14`).toBe(69.5);
      expect(read.billValueX[0], `${width} Budget value x stays r14`).toBe(0);
      expect(read.billValueX[1], `${width} Cost value x stays r14`).toBe(13);
      expect(read.billValueX[2], `${width} Charge value x stays r14`).toBe(13);
      expect(read.totH, `${width} tot row height stays r14`).toBe(38.5);
      expect(read.totBigH, `${width} tot.big row height stays r14`).toBe(46.5);
      expect(read.noteByH, `${width} note .by height stays r14`).toBe(21);
    }
  });
});

function textWalkAndOverflow(page: KillPage, width: number, tag: string) {
  return page.evaluate(textNodeWalkScript).then((walk) => {
    expect(walk.innerWidth, `${tag} ${width} innerWidth`).toBe(width);
    expect(walk.scrollWidth, `${tag} ${width} docSW`).toBeLessThanOrEqual(walk.innerWidth);
    expect(walk.bodyScrollWidth, `${tag} ${width} bodySW`).toBeLessThanOrEqual(walk.innerWidth);
    expect(walk.overflow, `${tag} ${width} text-node rights ${JSON.stringify(walk.overflow)}`).toEqual([]);
    return walk;
  });
}

describe('P3 r16 11:41 gates', () => {
  killIt('R16 text-node walk at 320 375 390', async () => {
    for (const width of [320, 375, 390] as const) {
      const page = await openPage({ width, path: '/jobs/p3-0036', height: 844 });
      await waitSheet(page);
      const box = await page.evaluate(overflowScript);
      expect(box.scrollWidth, `${width} docSW`).toBeLessThanOrEqual(box.innerWidth);
      expect(box.bodyScrollWidth, `${width} bodySW`).toBeLessThanOrEqual(box.innerWidth);
      expect(box.maxRight, `${width} maxRight`).toBeLessThanOrEqual(box.innerWidth);
      await textWalkAndOverflow(page, width, 'chromium');
      await page.close();
    }
  });

  killIt('R16 standalone safe-area 47/34 reports main until HF-LAND-1', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    const read = await page.evaluate(() => {
      const root = document.documentElement;
      root.style.setProperty('--safe-area-inset-top', '47px');
      root.style.setProperty('--safe-area-inset-bottom', '34px');
      document.body.insertAdjacentHTML('beforeend', `
        <header class="shell-header" data-r16-safe="header" style="position:relative">
          <div data-r16-safe="header-content">Jobs</div>
        </header>
        <nav class="shell-bottom-nav" data-r16-safe="nav"><span>Jobs</span></nav>
      `);
      const header = document.querySelector('[data-r16-safe="header"]') as HTMLElement;
      const content = document.querySelector('[data-r16-safe="header-content"]') as HTMLElement;
      const nav = document.querySelector('[data-r16-safe="nav"]') as HTMLElement;
      const csH = getComputedStyle(header);
      const csN = getComputedStyle(nav);
      return {
        headerPadTop: parseFloat(csH.paddingTop),
        contentTop: content.getBoundingClientRect().top - header.getBoundingClientRect().top,
        navPadBottom: parseFloat(csN.paddingBottom),
        envTop: getComputedStyle(root).getPropertyValue('--safe-area-inset-top').trim(),
        envBottom: getComputedStyle(root).getPropertyValue('--safe-area-inset-bottom').trim(),
      };
    });
    await page.close();
    if (process.env.P3_R16M) console.log('P3_R16M safe-area', read);
    expect(read.envTop).toBe('47px');
    expect(read.envBottom).toBe('34px');
    // HF-LAND-1 #405 is OPEN, not on this base. Product CSS uses env() only (Playwright = 0).
    expect(read.headerPadTop, 'main header pad-top without #405 var() fallback').toBeLessThan(47);
    expect(read.navPadBottom, 'main nav pad-bottom without #405 var() fallback').toBeLessThan(34);
    expect(read.contentTop, 'main header content top without #405').toBeLessThan(47);
    expect(read.headerPadTop, 'main header pad-top pinned').toBe(0);
    expect(read.navPadBottom, 'main nav pad-bottom pinned').toBe(0);
    expect(read.contentTop, 'main header content top pinned').toBe(0);
  });
});

describe('P3 r16 WebKit 375/390', () => {
  let webkitBrowser: KillBrowser;

  beforeAll(async () => {
    webkitBrowser = await launchWebkit();
  }, 120000);

  afterAll(async () => {
    await webkitBrowser?.close();
  });

  async function openWebkit(width: number, path: string) {
    const html = fixtureHtml({ js: jobsJs, css: distCss, path });
    const name = `w-${++harnessSeq}.html`;
    writeFileSync(join(harnessDir, name), html);
    const context = await webkitBrowser.newContext({
      viewport: { width, height: 844 },
      timezoneId: KILL_TZ, isMobile: false,
    });
    contexts.push(context);
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${harnessPort}/${name}`);
    await page.waitForSelector('#root', { timeout: 20000 });
    await waitSheet(page);
    return page;
  }

  killIt('R16 WebKit overflow and text-node walk at 320 375 390', async () => {
    for (const width of [320, 375, 390] as const) {
      const page = await openWebkit(width, '/jobs/p3-0036');
      const box = await page.evaluate(overflowScript);
      expect(box.scrollWidth, `webkit ${width} docSW`).toBeLessThanOrEqual(box.innerWidth);
      expect(box.bodyScrollWidth, `webkit ${width} bodySW`).toBeLessThanOrEqual(box.innerWidth);
      expect(box.maxRight, `webkit ${width} maxRight`).toBeLessThanOrEqual(box.innerWidth);
      await textWalkAndOverflow(page, width, 'webkit');
      await page.close();
    }
  });

  killIt('R16 WebKit standalone safe-area 47/34 reports main until HF-LAND-1', async () => {
    const page = await openWebkit(390, '/jobs/p3-0036');
    const read = await page.evaluate(() => {
      const root = document.documentElement;
      root.style.setProperty('--safe-area-inset-top', '47px');
      root.style.setProperty('--safe-area-inset-bottom', '34px');
      document.body.insertAdjacentHTML('beforeend', `
        <header class="shell-header" data-r16-safe="header" style="position:relative">
          <div data-r16-safe="header-content">Jobs</div>
        </header>
        <nav class="shell-bottom-nav" data-r16-safe="nav"><span>Jobs</span></nav>
      `);
      const header = document.querySelector('[data-r16-safe="header"]') as HTMLElement;
      const content = document.querySelector('[data-r16-safe="header-content"]') as HTMLElement;
      const nav = document.querySelector('[data-r16-safe="nav"]') as HTMLElement;
      const csH = getComputedStyle(header);
      const csN = getComputedStyle(nav);
      return {
        headerPadTop: parseFloat(csH.paddingTop),
        contentTop: content.getBoundingClientRect().top - header.getBoundingClientRect().top,
        navPadBottom: parseFloat(csN.paddingBottom),
        envTop: getComputedStyle(root).getPropertyValue('--safe-area-inset-top').trim(),
        envBottom: getComputedStyle(root).getPropertyValue('--safe-area-inset-bottom').trim(),
      };
    });
    await page.close();
    if (process.env.P3_R16M) console.log('P3_R16M webkit safe-area', read);
    expect(read.envTop).toBe('47px');
    expect(read.envBottom).toBe('34px');
    expect(read.headerPadTop, 'webkit header pad-top without #405 var() fallback').toBeLessThan(47);
    expect(read.navPadBottom, 'webkit nav pad-bottom without #405 var() fallback').toBeLessThan(34);
    expect(read.contentTop, 'webkit header content top without #405').toBeLessThan(47);
    expect(read.headerPadTop, 'webkit header pad-top pinned').toBe(0);
    expect(read.navPadBottom, 'webkit nav pad-bottom pinned').toBe(0);
    expect(read.contentTop, 'webkit header content top pinned').toBe(0);
  });

  killIt('R16 WebKit Jobs filter chips wrap at 320 375 390', async () => {
    const wk = webkitBrowser as KillBrowser & { version?: () => string };
    console.log(`P3 r16 WebKit version ${wk.version?.() ?? 'unknown'}`);
    for (const width of [320, 375, 390] as const) {
      const html = fixtureHtml({ js: jobsJs, css: distCss, path: '/jobs' });
      const name = `w-${++harnessSeq}.html`;
      writeFileSync(join(harnessDir, name), html);
      const context = await webkitBrowser.newContext({
        viewport: { width, height: 844 },
        timezoneId: KILL_TZ, isMobile: false,
      });
      contexts.push(context);
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${harnessPort}/${name}`);
      await page.waitForSelector('#root', { timeout: 20000 });
      await waitList(page);
      await waitSettledLayout(page, 'div.hub-jobs-list-filters');
      const read = await page.evaluate(chipScrollerScript);
      if (process.env.P3_R16M) console.log('P3_R16M webkit chip wrap', width, read);
      expect(read.innerWidth, `webkit ${width} jobs innerWidth`).toBe(width);
      expect(read.bodyScrollWidth, `webkit ${width} bodySW`).toBeLessThanOrEqual(read.innerWidth);
      expect(read.hits, `webkit ${width} overflow-x scrollers ${JSON.stringify(read.hits)}`).toEqual([]);
      expect(read.wrap, `webkit ${width} filters flex-wrap`).toBe('wrap');
      expect(read.ox === 'auto' || read.ox === 'scroll', `webkit ${width} filters overflow-x`).toBe(false);
      expect(read.rows, `webkit ${width} filter chip rows`).toBe(2);
      await page.close();
    }
  });

  killIt('R16 WebKit is playwright 1.48.2 and launches', async () => {
    const pw = require('playwright/package.json') as { version: string };
    const core = require('playwright-core/package.json') as { version: string };
    expect(pw.version, 'do not bump playwright').toBe('1.48.2');
    expect(core.version, 'do not bump playwright-core').toBe('1.48.2');
    if (!webkitBrowser) throw new Error('webkit launch failed: FAIL, never skip');
    const v = (webkitBrowser as KillBrowser & { version?: () => string }).version?.();
    if (!v) throw new Error('webkit launch failed: no version (FAIL, never skip)');
    console.log(`P3 r16 WebKit version ${v}`);
    expect(v, 'WebKit version').toBe('18.0');
  });
});

function chipScrollerScript() {
  const hits: { cls: string; ox: string; sw: number; cw: number }[] = [];
  for (const el of document.querySelectorAll('body *')) {
    if (el.classList.contains('hub-day-track')) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX !== 'auto' && cs.overflowX !== 'scroll') continue;
    if (el.scrollWidth > el.clientWidth) {
      const cls = typeof (el as HTMLElement).className === 'string'
        ? (el as HTMLElement).className
        : el.classList.value;
      hits.push({ cls, ox: cs.overflowX, sw: el.scrollWidth, cw: el.clientWidth });
    }
  }
  const filters = document.querySelector('div.hub-jobs-list-filters') as HTMLElement | null;
  const chips = [...document.querySelectorAll('div.hub-jobs-list-filters .hub-jobs-list-filter')] as HTMLElement[];
  const tops = [...new Set(chips.map((chip) => Math.round(chip.offsetTop)))];
  const fcs = filters ? getComputedStyle(filters) : null;
  return {
    hits,
    wrap: fcs?.flexWrap ?? '',
    ox: fcs?.overflowX ?? '',
    chipCount: chips.length,
    rows: tops.length,
    innerWidth: window.innerWidth,
    bodyScrollWidth: document.body.scrollWidth,
  };
}

describe('P3 r16 chip wrap', () => {
  killIt('R16 Jobs filter chips wrap at 320 375 390', async () => {
    for (const width of [320, 375, 390] as const) {
      const page = await openPage({ width, path: '/jobs', height: 844 });
      await waitList(page);
      await waitSettledLayout(page, 'div.hub-jobs-list-filters');
      const read = await page.evaluate(chipScrollerScript);
      if (process.env.P3_R16M) console.log('P3_R16M chromium chip wrap', width, read);
      expect(read.innerWidth, `chromium ${width} jobs innerWidth`).toBe(width);
      expect(read.bodyScrollWidth, `chromium ${width} bodySW`).toBeLessThanOrEqual(read.innerWidth);
      expect(read.hits, `chromium ${width} overflow-x scrollers ${JSON.stringify(read.hits)}`).toEqual([]);
      expect(read.wrap, `chromium ${width} filters flex-wrap`).toBe('wrap');
      expect(read.ox === 'auto' || read.ox === 'scroll', `chromium ${width} filters overflow-x`).toBe(false);
      expect(read.rows, `chromium ${width} filter chip rows`).toBe(2);
      await page.close();
    }
  });
});
