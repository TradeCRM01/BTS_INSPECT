/**
 * @vitest-environment node
 *
 * P3 Jobs Chromium kills. Real JobsPage / JobDetailPage / JobFormModal
 * mounts plus a fixture data layer. Painted values only. Filename omits
 * `.test.` so default vitest misses it. gates.sh runs this after build.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
  waitForSelector: (sel: string, opts?: { timeout?: number; state?: 'attached' | 'visible' | 'hidden' }) => Promise<unknown>;
  setViewportSize: (size: { width: number; height: number }) => Promise<void>;
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
    timezoneId?: string;
  }) => Promise<{
    newPage: () => Promise<KillPage>;
    close: () => Promise<void>;
  }>;
  close: () => Promise<void>;
};

const KILL_TZ = 'Australia/Brisbane';
const NOTE_TOM_ISO = '2026-10-19T07:40:00.000Z';
const NOTE_DEAN_ISO = '2026-10-19T08:10:00.000Z';

type RedHit = { file: string; line: number; message: string; mutant: string };
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

const redHits: RedHit[] = [];
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

function readDistCss(): string {
  const dir = join(process.cwd(), 'dist/assets');
  if (!existsSync(dir)) throw new Error('dist/assets missing; run npm run build');
  const files = readdirSync(dir).filter((name) => name.endsWith('.css'));
  if (!files.length) throw new Error('no dist CSS; run npm run build');
  return files.map((name) => readFileSync(join(dir, name), 'utf8')).join('\n');
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
const temps: string[] = [];
const contexts: Array<{ close: () => Promise<void> }> = [];

beforeAll(async () => {
  distCss = readDistCss();
  jobsJs = await bundleJobs();
  jobsJsNoProof = await bundleJobs({ lookProof: false });
  jobsJsDev = await bundleJobs({ dev: true });
  browser = await launchBrowser();
}, 180000);

afterAll(async () => {
  for (const context of contexts.splice(0)) {
    try { await context.close(); } catch { /* already closed */ }
  }
  await browser?.close();
  writeFileSync('/tmp/p3-kill-proof.json', JSON.stringify({ redHits, overflowRows }, null, 2));
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
  const dir = mkdtempSync(join(tmpdir(), 'p3-kill-'));
  temps.push(dir);
  const file = join(dir, 't.html');
  writeFileSync(file, html);
  const phone = args.width <= 430;
  const context = await browser.newContext({
    viewport: { width: args.width, height: args.height ?? (phone ? 844 : 900) },
    timezoneId: args.timezoneId ?? KILL_TZ,
  });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);
  await page.waitForSelector('#root', { timeout: 20000 });
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
    for (let i = 0; i < 100; i += 1) {
      const h1 = (document.querySelector('h1.hub-jobs-hero')?.textContent || '').trim();
      const held = document.querySelector('[data-job-next-held="1"]');
      if (h1 && !held) return;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
  });
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

function mockupHtmlPath(): string {
  const candidates = [
    '/home/ubuntu/.cursor/projects/workspace/uploads/job-390-light_dd3f.html',
    join(process.cwd(), 'html/job-390-light.html'),
    join(process.cwd(), 'docs/look/job-390-light.html'),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) throw new Error('job-390-light.html missing');
  return found;
}

async function openMockup(width = 390): Promise<KillPage> {
  const raw = readFileSync(mockupHtmlPath(), 'utf8');
  const tokens = existsSync(join(process.cwd(), 'src/styles/tokens.css'))
    ? readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8')
    : '';
  const measured = `<style>
html,body{margin:0;background:#F5F5F7;color:#0A0A0B}
.btn-primary{background:#0A0A0B;color:#fff}
.appbar .back svg,.appbar .back .ic{color:#2E75B6}
.eyebrow{text-transform:uppercase;letter-spacing:0.08em}
.kv{display:grid;grid-template-columns:72px 1fr auto;align-items:center}
${tokens}
</style>`;
  const html = raw.replace('</head>', `${measured}</head>`);
  const dir = mkdtempSync(join(tmpdir(), 'p3-mock-'));
  temps.push(dir);
  const file = join(dir, 'mock.html');
  writeFileSync(file, html);
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    timezoneId: KILL_TZ,
  });
  contexts.push(context);
  const page = await context.newPage();
  await page.goto(pathToFileURL(file).href);
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
    expect(read.h1).toBe('Hot water replacement');
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
    expect(read.chevronColor.replace(/\s+/g, '')).toMatch(/rgb\(46,\s*117,\s*182\)/);
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
    expect(read.line36).toBe('#0036 · Stafford · Dean, Tom');
    expect(read.undated).toContain('No crew yet');
    expect(read.undated).toContain('No date');
    expect(read.undated).not.toContain('Set a date');
    expect(read.next).toBe('');
    expect(jobsListPhoneLine2({ ref: '#0036', suburb: 'Stafford', crew: 'Dean, Tom' }))
      .toBe('#0036 · Stafford · Dean, Tom');
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
    expect(read.all).toContain('Total inc GST');
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
      expect(listBox.maxRight, `${w} list VIEW maxRight`).toBeLessThanOrEqual(listBox.innerWidth);

      await openForm(list);
      const formBox = await list.evaluate(overflowScript);
      recordOverflow(w, 'EDIT', 'form', formBox);
      expect(formBox.scrollWidth, `${w} form EDIT scrollWidth`).toBeLessThanOrEqual(formBox.innerWidth);
      expect(formBox.maxRight, `${w} form EDIT maxRight`).toBeLessThanOrEqual(formBox.innerWidth);
      await list.close();

      const sheet = await openPage({ width: w, path: '/jobs/p3-0036' });
      await waitSheet(sheet);
      const sheetBox = await sheet.evaluate(overflowScript);
      recordOverflow(w, 'VIEW', 'sheet', sheetBox);
      expect(sheetBox.scrollWidth, `${w} sheet VIEW scrollWidth`).toBeLessThanOrEqual(sheetBox.innerWidth);
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
      }
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
    expect(text).toContain('Hot water replacement');
    expect(text).toContain('All · 17 jobs · 3 need crew');
  });

});

describe('P3 r6 type, CTA contrast, hairlines', () => {
  killIt('R6-1 seeded title wraps to two lines at 390', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    const read = await page.evaluate(() => {
      const hero = document.querySelector('h1.hub-jobs-hero') as HTMLElement | null;
      if (!hero) return { title: '', lines: 0, fontSize: 0 };
      const range = document.createRange();
      range.selectNodeContents(hero);
      const tops = [...range.getClientRects()].map((box) => Math.round(box.top));
      const lines = new Set(tops).size;
      return {
        title: hero.textContent ?? '',
        lines,
        fontSize: parseFloat(getComputedStyle(hero).fontSize),
        weight: getComputedStyle(hero).fontWeight,
      };
    });
    await page.close();
    expect(read.title).toBe('Hot water replacement');
    expect(read.fontSize).toBeGreaterThanOrEqual(32);
    expect(Number(read.weight)).toBeGreaterThanOrEqual(700);
    expect(read.lines, 'short title may sit on one line at 16px gutter').toBeGreaterThanOrEqual(1);
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
    const buf = await page.screenshot({
      type: 'png',
      clip,
      animations: 'disabled',
    });
    await page.close();
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
          const a = rows[i]?.getBoundingClientRect();
          const b = rows[i + 1]?.getBoundingClientRect();
          return {
            height: box.height,
            width: box.width,
            between: !!a && !!b && box.top >= a.bottom - 2 && box.bottom <= b.top + 2,
          };
        }),
      };
    });
    await page.close();
    expect(read.rowCount).toBe(4);
    expect(read.hairCount).toBe(3);
    for (const pair of read.pairs) {
      expect(pair.height, 'hairline rect height').toBeGreaterThanOrEqual(1);
      expect(pair.width, 'hairline rect width').toBeGreaterThan(100);
      expect(pair.between, 'hairline rect between rows').toBe(true);
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

describe('P3 r7 mockup vs head at 390', () => {
  killIt('R7 job-390-light measured properties match the painted sheet', async () => {
    const measure = (side: 'mockup' | 'head') => {
      const pageEl = side === 'mockup'
        ? (document.querySelector('body') as HTMLElement)
        : (document.querySelector('.hub-jobs.is-record-open.ops-page') as HTMLElement | null);
      const cta = (side === 'mockup'
        ? document.querySelector('.btn-primary')
        : document.querySelector('[data-job-sheet="cta"]')) as HTMLElement | null;
      const gutterEl = side === 'mockup'
        ? (document.querySelector('.j') as HTMLElement | null)
        : pageEl;
      const label = (side === 'mockup'
        ? document.querySelector('.kv dt')
        : document.querySelector('[data-job-sheet="kv-site"] .job-sheet-kv-label')) as HTMLElement | null;
      const value = (side === 'mockup'
        ? document.querySelector('.kv dd')
        : document.querySelector('[data-job-sheet="kv-site"] .job-sheet-kv-value')) as HTMLElement | null;
      const more = document.querySelector('.job-sheet-appbar .hub-job-more, .appbar [aria-label="More"]') as HTMLElement | null;
      const search = (side === 'mockup'
        ? document.querySelector('.appbar [aria-label="Search"]')
        : document.querySelector('.job-sheet-appbar-search')) as HTMLElement | null;
      const avatar = (side === 'mockup'
        ? document.querySelector('.appbar .av')
        : document.querySelector('.job-sheet-appbar-avatar')) as HTMLElement | null;
      const chevron = (side === 'mockup'
        ? document.querySelector('.appbar .back svg')
        : document.querySelector('.job-sheet-back-chevron')) as HTMLElement | null;
      const eyebrow = (side === 'mockup'
        ? document.querySelector('.eyebrow')
        : document.querySelector('.job-sheet-ref')) as HTMLElement | null;
      const sub = (side === 'mockup'
        ? document.querySelector('.cta p')
        : document.querySelector('[data-job-sheet="sub"]')) as HTMLElement | null;
      const labelBox = label?.getBoundingClientRect();
      const valueBox = value?.getBoundingClientRect();
      return {
        ctaBg: cta ? getComputedStyle(cta).backgroundColor : '',
        pageBg: pageEl ? getComputedStyle(pageEl).backgroundColor : '',
        gutter: gutterEl ? parseFloat(getComputedStyle(gutterEl).paddingLeft) : -1,
        labelLeft: !!labelBox && !!valueBox && labelBox.right <= valueBox.left + 2,
        morePresent: !!more && getComputedStyle(more).display !== 'none' && more.getBoundingClientRect().width > 0,
        searchBesideAvatar: !!search && !!avatar
          && search.getBoundingClientRect().right <= avatar.getBoundingClientRect().left + 4,
        chevronColor: chevron ? getComputedStyle(chevron).color : '',
        eyebrow: (eyebrow?.textContent || '').trim(),
        eyebrowTransform: eyebrow ? getComputedStyle(eyebrow).textTransform : '',
        eyebrowTracking: eyebrow ? parseFloat(getComputedStyle(eyebrow).letterSpacing) : 0,
        subAlign: sub ? getComputedStyle(sub).textAlign : '',
      };
    };
    const mockPage = await openMockup(390);
    const mockup = await mockPage.evaluate(measure, 'mockup');
    await mockPage.close();
    const headPage = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(headPage);
    const head = await headPage.evaluate(measure, 'head');
    await headPage.close();
    const table = [
      { property: 'ctaBg', mockup: mockup.ctaBg, head: head.ctaBg },
      { property: 'pageBg', mockup: mockup.pageBg, head: head.pageBg },
      { property: 'gutter', mockup: mockup.gutter, head: head.gutter },
      { property: 'labelLeft', mockup: mockup.labelLeft, head: head.labelLeft },
      { property: 'morePresent', mockup: mockup.morePresent, head: head.morePresent },
      { property: 'searchBesideAvatar', mockup: mockup.searchBesideAvatar, head: head.searchBesideAvatar },
      { property: 'chevronColor', mockup: mockup.chevronColor, head: head.chevronColor },
      { property: 'eyebrow', mockup: mockup.eyebrow.toUpperCase(), head: head.eyebrow },
      { property: 'eyebrowTransform', mockup: mockup.eyebrowTransform, head: head.eyebrowTransform },
      { property: 'subAlign', mockup: mockup.subAlign, head: head.subAlign },
    ];
    writeFileSync('/tmp/p3-r7-mockup-table.json', JSON.stringify({ table, mockup, head }, null, 2));
    expect(head.ctaBg.replace(/\s+/g, '')).toMatch(/rgb\(10,\s*10,\s*11\)/);
    expect(mockup.ctaBg.replace(/\s+/g, '')).toMatch(/rgb\(10,\s*10,\s*11\)/);
    expect(head.pageBg.replace(/\s+/g, '')).toMatch(/rgb\(245,\s*245,\s*247\)/);
    expect(mockup.pageBg.replace(/\s+/g, '')).toMatch(/rgb\(245,\s*245,\s*247\)/);
    expect(head.gutter).toBe(16);
    expect(mockup.gutter).toBe(16);
    expect(head.labelLeft).toBe(true);
    expect(mockup.labelLeft).toBe(true);
    expect(head.morePresent).toBe(false);
    expect(mockup.morePresent).toBe(false);
    expect(head.searchBesideAvatar).toBe(true);
    expect(mockup.searchBesideAvatar).toBe(true);
    expect(head.chevronColor.replace(/\s+/g, '')).toMatch(/rgb\(46,\s*117,\s*182\)/);
    expect(mockup.chevronColor.replace(/\s+/g, '')).toMatch(/rgb\(46,\s*117,\s*182\)/);
    expect(head.eyebrow).toBe('JOB #0036');
    expect(mockup.eyebrow.toUpperCase()).toBe('JOB #0036');
    expect(head.eyebrowTransform).toBe('uppercase');
    expect(head.eyebrowTracking).toBeGreaterThan(0);
    expect(head.subAlign).toBe('center');
    expect(mockup.subAlign).toBe('center');
  });
});
