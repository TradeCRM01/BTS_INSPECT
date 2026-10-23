/**
 * @vitest-environment node
 *
 * P3 Jobs Chromium kills. Real JobsPage / JobDetailPage / JobFormModal
 * mounts plus a fixture data layer. Painted values only. Filename omits
 * `.test.` so default vitest misses it. gates.sh runs this after build.
 */
import { AssertionError } from 'node:assert';
import { existsSync, mkdtempSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NAV_WORDS } from '../lib/brand';
import { JOB_ID_BATCH, chunkIds } from '../lib/jobIdBatch';
import { JOB_SHEET_BACK } from '../lib/jobSheetChrome';
import { canCreateJobInvoice, jobSheetInvoiceCtaLabel } from '../lib/jobSheetInvoiceCta';
import { JOB_SHEET_HEAD_BAR, JOB_SHEET_LINK } from '../lib/jobSheetLocks';
import {
  JOB_PARENT_INVOICED_COLUMNS,
  JOB_PARENT_INVOICED_SELECT,
  jobParentInvoicedEnabled,
  loadParentInvoiced,
} from '../lib/jobParentInvoiced';
import {
  JOB_SHEET_TABS,
  jobSheetPaperworkCount,
} from '../lib/jobSheetTabs';
import { jobSheetWhenLine } from '../lib/jobSheetWhen';
import {
  JOB_PILL_DONE,
  JOB_PILL_NO_DATE,
  JOB_PILL_READY,
  jobStatusPill,
} from '../lib/jobStatusPill';
import { jobsListPhoneLine2 } from '../lib/jobsListRow';
import { countJobsNeedCrew, jobNeedsCrew } from '../lib/needCrew';

const require = createRequire(import.meta.url);
const esbuild = require('esbuild') as {
  build: (opts: Record<string, unknown>) => Promise<{ outputFiles?: Array<{ text: string }> }>;
};

const here = dirname(fileURLToPath(import.meta.url));
const WIDTHS = [375, 390, 768, 1024, 1280] as const;
const SCHEMA = JSON.parse(readFileSync(join(process.cwd(), 'docs/schema/p3-columns.json'), 'utf8')) as {
  tables: Record<string, string[]>;
  p3_selects: Record<string, string[]>;
};
const LOOK_SEED = ['Northside Electrical', 'Harbour Lights', 'Site labour', 'Warehouse lights'] as const;

type KillPage = {
  goto: (url: string) => Promise<unknown>;
  evaluate: <T>(fn: (() => T | Promise<T>) | ((arg: never) => T | Promise<T>), arg?: unknown) => Promise<T>;
  waitForSelector: (sel: string, opts?: { timeout?: number; state?: 'attached' | 'visible' | 'hidden' }) => Promise<unknown>;
  setViewportSize: (size: { width: number; height: number }) => Promise<void>;
  close: () => Promise<void>;
};

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

function readDistCss(): string {
  const dir = join(process.cwd(), 'dist/assets');
  if (!existsSync(dir)) throw new Error('dist/assets missing; run npm run build');
  const files = readdirSync(dir).filter((name) => name.endsWith('.css'));
  if (!files.length) throw new Error('no dist CSS; run npm run build');
  return files.map((name) => readFileSync(join(dir, name), 'utf8')).join('\n');
}

async function bundleJobs(opts?: { lookProof?: boolean }): Promise<string> {
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
      'import.meta.env.MODE': '"test"',
      'import.meta.env.DEV': 'false',
      'import.meta.env.PROD': 'true',
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

function fixtureHtml(args: { js: string; css: string; path: string; empty?: boolean; clientsError?: boolean }): string {
  const cfg = JSON.stringify({
    path: args.path,
    empty: args.empty === true,
    clientsError: args.clientsError === true,
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

let browser: Awaited<ReturnType<typeof launchBrowser>>;
let distCss = '';
let jobsJs = '';
let jobsJsNoProof = '';
const temps: string[] = [];

beforeAll(async () => {
  distCss = readDistCss();
  jobsJs = await bundleJobs();
  jobsJsNoProof = await bundleJobs({ lookProof: false });
  browser = await launchBrowser();
}, 180000);

afterAll(async () => {
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
  height?: number;
}): Promise<KillPage> {
  const html = fixtureHtml({
    js: args.js ?? jobsJs,
    css: args.css ?? distCss,
    path: args.path ?? '/jobs',
    empty: args.empty,
    clientsError: args.clientsError,
  });
  const dir = mkdtempSync(join(tmpdir(), 'p3-kill-'));
  temps.push(dir);
  const file = join(dir, 't.html');
  writeFileSync(file, html);
  const phone = args.width <= 430;
  const page = await browser.newPage({
    viewport: { width: args.width, height: args.height ?? (phone ? 844 : 900) },
  });
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

function redFromError(err: unknown, mutant: string): RedHit {
  if (!(err instanceof Error)) throw err;
  const isAssert = err instanceof AssertionError
    || err.name === 'AssertionError'
    || /expected|toBe|toEqual|toContain/i.test(err.message);
  if (!isAssert) throw err;
  const match = (err.stack || '').match(/p3Jobs\.chromium\.kill\.tsx:(\d+)/);
  return {
    file: 'src/pages/p3Jobs.chromium.kill.tsx',
    line: match ? Number(match[1]) : 0,
    message: err.message,
    mutant,
  };
}

async function captureMutantRed(args: {
  path: string;
  mutate: (src: string) => string;
  run: () => Promise<void> | void;
  mutant: string;
}): Promise<RedHit> {
  const orig = readFileSync(args.path, 'utf8');
  const mutated = args.mutate(orig);
  expect(mutated, `mutant must change ${args.path}`).not.toBe(orig);
  writeFileSync(args.path, mutated);
  try {
    await args.run();
    throw new Error(`mutant stayed green: ${args.mutant}`);
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('mutant stayed green')) throw err;
    const hit = redFromError(err, args.mutant);
    redHits.push(hit);
    return hit;
  } finally {
    writeFileSync(args.path, orig);
  }
}

function killIt(name: string, fn: () => Promise<unknown> | unknown, ms = 180000) {
  it(name, fn, ms);
}

async function importFresh<T>(rel: string): Promise<T> {
  const src = readFileSync(join(process.cwd(), rel), 'utf8');
  const freshRel = rel.replace(/\.ts$/, `.fresh${Date.now()}.ts`);
  const freshPath = join(process.cwd(), freshRel);
  writeFileSync(freshPath, src);
  try {
    return await import(pathToFileURL(freshPath).href) as T;
  } finally {
    try { unlinkSync(freshPath); } catch { /* ignore */ }
  }
}

function twoCompanyInvoiceClient() {
  const all = [
    { id: 'inv-c1', company_id: 'c1', job_id: 'parent', status: 'sent' },
    { id: 'inv-c2', company_id: 'c2', job_id: 'parent', status: 'sent' },
  ];
  return {
    from() {
      let rows = all.map((row) => ({ ...row }));
      const chain: {
        select: (columns?: string) => typeof chain;
        eq: (column: string, value: string) => typeof chain;
        neq: (column: string, value: string) => Promise<{ data: typeof rows; error: null }>;
      } = {
        select() { return chain; },
        eq(column, value) {
          rows = rows.filter((row) => row[column as keyof typeof row] === value);
          return chain;
        },
        neq(column, value) {
          rows = rows.filter((row) => row[column as keyof typeof row] !== value);
          return Promise.resolve({ data: rows, error: null });
        },
      };
      return chain;
    },
  };
}

function selectCaptureClient() {
  let selected = '';
  return {
    selected() { return selected; },
    from() {
      return {
        select(columns: string) {
          selected = columns;
          return {
            eq() { return this; },
            neq() { return Promise.resolve({ data: [], error: null }); },
          };
        },
      };
    },
  };
}

describe('P3 K0 harness', () => {
  killIt('K0 paints the #0036 sheet from JobDetailPage', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    const read = await page.evaluate(() => ({
      h1: document.querySelector('h1.hub-jobs-hero')?.textContent ?? '',
      cta: document.querySelector('.btn-primary')?.textContent ?? '',
      when: document.querySelector('[data-job-sheet="when"]')?.textContent ?? '',
      sub: document.querySelector('[data-job-sheet="sub"]')?.textContent ?? '',
      back: document.querySelector('.job-sheet-back')?.textContent ?? '',
      text: document.body.innerText,
    }));
    await page.close();
    expect(read.h1).toBe('Hot water replacement');
    expect(read.cta.replace(/\s+/g, ' ').trim()).toBe(jobSheetInvoiceCtaLabel(919.05));
    expect(read.when).toContain('Mon 19 Oct');
    expect(read.when).toContain('07:00–10:30');
    expect(read.when).not.toContain(' – ');
    expect(read.sub).toBe('4 bill lines · 4.4 h logged');
    expect(read.back).toBe(JOB_SHEET_BACK);
    expect(read.text).toContain('JOB #0036');
    expect(read.text).toContain('Ready to invoice');
    expect(read.text).not.toMatch(/Relovi|Littleloop|booking/i);
  });

  killIt('K0 mutant changes the back copy so the sheet goes red', async () => {
    const red = await captureMutantRed({
      path: 'src/lib/jobSheetChrome.ts',
      mutant: 'src/lib/jobSheetChrome.ts JOB_SHEET_BACK ‹ Jobs → Back',
      mutate: (src) => src.replace("export const JOB_SHEET_BACK = '‹ Jobs';", "export const JOB_SHEET_BACK = 'Back';"),
      run: async () => {
        const js = await bundleJobs();
        const page = await openPage({ width: 390, path: '/jobs/p3-0036', js });
        await waitSheet(page);
        const back = await page.evaluate(() => document.querySelector('.job-sheet-back')?.textContent ?? '');
        await page.close();
        expect(back).toBe('‹ Jobs');
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/‹ Jobs|Back|expected/i);
  }, 120000);
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
    expect(read.whisper).toBe('All · 12 jobs · 1 need crew');
    expect(read.listBar).toBe(false);
    expect(countJobsNeedCrew([
      { status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: [] },
      { status: 'scheduled', scheduled_date: null, assigned_team: [] },
      { status: 'completed', scheduled_date: '2026-10-19', assigned_team: [] },
    ])).toBe(1);
  });

  killIt('K1 mutant counts an undated crewless job in the whisper', async () => {
    const red = await captureMutantRed({
      path: 'src/lib/needCrew.ts',
      mutant: 'src/lib/needCrew.ts drop scheduled_date check',
      mutate: (src) => src.replace(
        "if (!(job.scheduled_date ?? '').trim()) return false;\n  return jobCrewMemberCount(job.assigned_team) === 0;",
        'return jobCrewMemberCount(job.assigned_team) === 0;',
      ),
      run: async () => {
        const js = await bundleJobs();
        const page = await openPage({ width: 390, path: '/jobs', js });
        await waitList(page);
        const whisper = await page.evaluate(() => (
          document.querySelector('.hub-jobs-list-whisper')?.textContent ?? ''
        ));
        await page.close();
        expect(whisper).toBe('All · 12 jobs · 1 need crew');
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/1 need crew|2 need crew|expected/i);
  }, 120000);

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
    expect(read.whisper).toBe('All · 12 jobs · 1 need crew');
    expect(read.whisper).not.toContain('2 need crew');
    expect(read.undatedText).toContain('No date');
    expect(read.undatedText).toContain('Set a date');
    expect(read.undatedText).not.toContain('Needs crew');
    expect(read.needCrewPills).toBe(1);
    expect(read.noDatePills).toBeGreaterThanOrEqual(1);
  });

  killIt('K1b mutant drops the date check so the undated job is counted', async () => {
    const red = await captureMutantRed({
      path: 'src/lib/needCrew.ts',
      mutant: 'src/lib/needCrew.ts drop scheduled_date check',
      mutate: (src) => src.replace(
        "if (!(job.scheduled_date ?? '').trim()) return false;\n  return jobCrewMemberCount(job.assigned_team) === 0;",
        'return jobCrewMemberCount(job.assigned_team) === 0;',
      ),
      run: async () => {
        const js = await bundleJobs();
        const page = await openPage({ width: 390, path: '/jobs', js });
        await waitList(page);
        const undatedText = await page.evaluate(() => (
          [...document.querySelectorAll('[data-jobs-phone-row="p3-undated"]')]
            .map((el) => el.textContent)
            .join(' ')
        ));
        await page.close();
        expect(undatedText).toContain('No date');
        expect(undatedText).toContain('Set a date');
        const { countJobsNeedCrew: freshCount } = await importFresh<{
          countJobsNeedCrew: typeof countJobsNeedCrew;
        }>('src/lib/needCrew.ts');
        expect(freshCount([{
          status: 'scheduled',
          scheduled_date: null,
          assigned_team: [],
        }])).toBe(0);
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/0|1|expected/i);
  }, 120000);

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

  killIt('K2 mutant hides search inside details', async () => {
    const red = await captureMutantRed({
      path: 'src/pages/JobsPage.tsx',
      mutant: 'src/pages/JobsPage.tsx wrap SearchBar in <details>',
      mutate: (src) => src.replace(
        '<div className="hub-jobs-list-search">\n              <SearchBar',
        '<div className="hub-jobs-list-search">\n              <details><summary aria-label="Search">Search</summary><SearchBar',
      ).replace(
        'placeholder={showEnquiries ? \'Search name, suburb or phone\' : \'Search jobs or clients\'}\n              />\n            </div>',
        'placeholder={showEnquiries ? \'Search name, suburb or phone\' : \'Search jobs or clients\'}\n              /></details>\n            </div>',
      ),
      run: async () => {
        const js = await bundleJobs();
        const page = await openPage({ width: 390, path: '/jobs', js });
        await waitList(page);
        const read = await page.evaluate(() => {
          const details = document.querySelector('.hub-jobs-list-search details') as HTMLDetailsElement | null;
          return { details: !!details, open: details?.open ?? false };
        });
        await page.close();
        expect(read.details).toBe(false);
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/details|expected/i);
  }, 120000);

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
    expect(read.next).toBe('Set a date');
    expect(jobsListPhoneLine2({ ref: '#0036', suburb: 'Stafford', crew: 'Dean, Tom' }))
      .toBe('#0036 · Stafford · Dean, Tom');
  });

  killIt('K3 mutant breaks phone line 2', async () => {
    const red = await captureMutantRed({
      path: 'src/lib/jobsListRow.ts',
      mutant: 'src/lib/jobsListRow.ts jobsListPhoneLine2 join with /',
      mutate: (src) => src.replace(
        'return [input.ref, input.suburb, input.crew].filter(Boolean).join(\' · \');',
        'return [input.ref, input.suburb, input.crew].filter(Boolean).join(\' / \');',
      ),
      run: async () => {
        const js = await bundleJobs();
        const page = await openPage({ width: 390, path: '/jobs', js });
        await waitList(page);
        const line = await page.evaluate(() => (
          document.querySelector('[data-jobs-phone-row="p3-0036"] .hub-jobs-phone-meta')?.textContent ?? ''
        ));
        await page.close();
        expect(line).toBe('#0036 · Stafford · Dean, Tom');
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/0036|expected/i);
  }, 120000);
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

  killIt('K4 mutant drops void filter so a void-only job looks Done', async () => {
    const red = await captureMutantRed({
      path: 'src/lib/jobStatusPill.ts',
      mutant: 'src/lib/jobStatusPill.ts drop && row.status !== \'void\'',
      mutate: (src) => src.replace("&& row.status !== 'void'", ''),
      run: async () => {
        const js = await bundleJobs();
        const page = await openPage({ width: 390, path: '/jobs', js });
        await waitList(page);
        const child = await page.evaluate(() => (
          document.querySelector('[data-jobs-phone-row="p3-void-child"] [data-jobs-pill]')?.textContent ?? ''
        ));
        await page.close();
        expect(child).toBe(JOB_PILL_READY);
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/Ready to invoice|Done|expected/i);
  }, 120000);

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

  killIt('K5 mutant formats the time with spaces', async () => {
    const red = await captureMutantRed({
      path: 'src/lib/jobSheetWhen.ts',
      mutant: 'src/lib/jobSheetWhen.ts clock range uses spaced en-dash',
      mutate: (src) => src.replace('return `${from}–${to}`;', 'return `${from} – ${to}`;'),
      run: async () => {
        const js = await bundleJobs();
        const page = await openPage({ width: 390, path: '/jobs/p3-0036', js });
        await waitSheet(page);
        const when = await page.evaluate(() => (
          document.querySelector('[data-job-sheet="when"]')?.textContent ?? ''
        ));
        await page.close();
        expect(when).toContain('07:00–10:30');
        expect(when).not.toContain(' – ');
        expect(jobSheetWhenLine({
          scheduled_date: '2026-10-19',
          start_time: '07:00',
          end_time: '10:30',
        }).text).toBe('Mon 19 Oct · 07:00–10:30');
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/07:00|expected/i);
  }, 120000);

  killIt('K6 Q-J1 records company_id, parent job_id, and neq void', async () => {
    expect(jobParentInvoicedEnabled({ status: 'completed', parent_job_id: 'parent' })).toBe(true);
    expect(jobParentInvoicedEnabled({ status: 'scheduled', parent_job_id: 'parent' })).toBe(false);
    const rows = await loadParentInvoiced(
      { companyId: 'c1', parentJobId: 'parent' },
      twoCompanyInvoiceClient(),
    );
    expect(rows.map((row) => row.id)).toEqual(['inv-c1']);
    expect(rows.some((row) => row.id === 'inv-c2')).toBe(false);
  });

  killIt('K6 mutant drops the company_id filter', async () => {
    const red = await captureMutantRed({
      path: 'src/lib/jobParentInvoiced.ts',
      mutant: 'src/lib/jobParentInvoiced.ts drop .eq(company_id)',
      mutate: (src) => src.replace(
        ".eq('company_id', input.companyId)\n    .eq('job_id', input.parentJobId)",
        ".eq('job_id', input.parentJobId)",
      ),
      run: async () => {
        const { loadParentInvoiced: freshLoad } = await importFresh<{
          loadParentInvoiced: typeof loadParentInvoiced;
        }>('src/lib/jobParentInvoiced.ts');
        const rows = await freshLoad(
          { companyId: 'c1', parentJobId: 'parent' },
          twoCompanyInvoiceClient(),
        );
        expect(rows.map((row) => row.id)).toEqual(['inv-c1']);
        expect(rows.some((row) => row.id === 'inv-c2')).toBe(false);
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/inv-c1|inv-c2|expected/i);
  });

  killIt('K7 four tabs one row, People label, Coach #5 paperwork excludes notes', async () => {
    const page = await openPage({ width: 375, path: '/jobs/p3-0036' });
    await waitSheet(page);
    const read = await page.evaluate(() => {
      const tabs = [...document.querySelectorAll('.job-sheet-tab')] as HTMLElement[];
      const rail = document.querySelector('.job-sheet-tabs') as HTMLElement;
      return {
        labels: tabs.map((t) => t.textContent?.trim()),
        heights: tabs.map((t) => t.getBoundingClientRect().height),
        rights: tabs.map((t) => t.getBoundingClientRect().right),
        viewW: window.innerWidth,
        scroll: rail.scrollWidth,
        client: rail.clientWidth,
      };
    });
    await page.close();
    expect(read.labels).toEqual(['Overview', 'People', 'Paperwork 2', 'Materials 4']);
    expect(Math.min(...read.heights)).toBeGreaterThanOrEqual(44);
    expect(Math.max(...read.rights)).toBeLessThanOrEqual(read.viewW + 1);
    expect(read.scroll).toBeLessThanOrEqual(read.client + 1);
    expect(JOB_SHEET_TABS.map((t) => t.label)).toEqual(['Overview', 'People', 'Paperwork', 'Materials']);
    expect(jobSheetPaperworkCount({
      jhaCount: 1, take5Count: 0, inspectionCount: 0, quoteCount: 1, invoiceCount: 0,
    })).toBe(2);
  });

  killIt('K7 mutant Schedule & people is longer than People', async () => {
    const red = await captureMutantRed({
      path: 'src/lib/jobSheetTabs.ts',
      mutant: 'src/lib/jobSheetTabs.ts People → Schedule & people',
      mutate: (src) => src.replace(
        "{ id: 'schedule', label: 'People' }",
        "{ id: 'schedule', label: 'Schedule & people' }",
      ),
      run: async () => {
        const js = await bundleJobs();
        const page = await openPage({ width: 375, path: '/jobs/p3-0036', js });
        await waitSheet(page);
        const label = await page.evaluate(() => (
          document.querySelectorAll('.job-sheet-tab')[1]?.textContent ?? ''
        ));
        await page.close();
        expect(label).toBe('People');
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/People|Schedule|expected/i);
  }, 120000);
});

describe('P3 overview people form bar', () => {
  killIt('K8 overview kv, notes, 6 photos, bill', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    const read = await page.evaluate(() => {
      const kv = [...document.querySelectorAll('[data-job-sheet^="kv-"]')].map((el) => (
        el.getAttribute('data-job-sheet')
      ));
      const go = document.querySelector('[data-job-sheet="kv-site"] a') as HTMLAnchorElement | null;
      const call = document.querySelector('[data-job-sheet="kv-phone"] a') as HTMLAnchorElement | null;
      const notes = document.querySelector('[data-job-sheet="notes"]')?.textContent ?? '';
      const photos = document.querySelectorAll('.job-sheet-photo').length;
      const all = document.body.innerText;
      return { kv, go: go?.href ?? '', call: call?.getAttribute('href') ?? '', notes, photos, all };
    });
    await page.close();
    expect(read.kv).toEqual(['kv-site', 'kv-client', 'kv-phone', 'kv-email', 'kv-crew']);
    expect(read.go).toContain('maps.google.com');
    expect(read.call).toMatch(/tel:0400/);
    expect(read.notes).toContain('Tom Nguyen · 07:40');
    expect(read.notes).toContain('Dean Walsh · 08:10');
    expect(read.photos).toBe(6);
    expect(read.all).toContain('All photos');
    expect(read.all).toContain('Total inc GST');
    expect(read.all).toContain('$919.05');
    expect(read.all).toContain('Edit bill');
  });

  killIt('K8 mutant drops the notes section', async () => {
    const red = await captureMutantRed({
      path: 'src/pages/JobDetailPage.tsx',
      mutant: 'src/pages/JobDetailPage.tsx hide notes when overviewNotes.length > 0',
      mutate: (src) => src.replace(
        '{!notesBusy && overviewNotes.length > 0 && (',
        '{!notesBusy && overviewNotes.length > 999 && (',
      ),
      run: async () => {
        const js = await bundleJobs();
        const page = await openPage({ width: 390, path: '/jobs/p3-0036', js });
        await waitSheet(page);
        const notes = await page.evaluate(() => (
          document.querySelector('[data-job-sheet="notes"]')?.textContent ?? ''
        ));
        await page.close();
        expect(notes).toContain('Tom Nguyen · 07:40');
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/Tom Nguyen|expected/i);
  }, 120000);

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

  killIt('K9 mutant renames the People pane id', async () => {
    const red = await captureMutantRed({
      path: 'src/pages/JobDetailPage.tsx',
      mutant: 'src/pages/JobDetailPage.tsx id=job-schedule → id=job-dispatch',
      mutate: (src) => src.replace('id="job-schedule"', 'id="job-dispatch"'),
      run: async () => {
        const js = await bundleJobs();
        const page = await openPage({ width: 390, path: '/jobs/p3-0036', js });
        await waitSheet(page);
        const ok = await page.evaluate(() => !!document.getElementById('job-schedule'));
        await page.close();
        expect(ok).toBe(true);
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/true|expected/i);
  }, 120000);

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
    for (const item of ['Post update', 'Start inspection', 'Gallery', 'Invoice', 'Clock on', 'Details']) {
      expect(items, item).toContain(item);
    }
    expect(readFileSync(join(process.cwd(), 'src/pages/JobDetailPage.tsx'), 'utf8')).toContain('Add to calendar');
  });

  killIt('K10 mutant changes Post update', async () => {
    const red = await captureMutantRed({
      path: 'src/pages/JobDetailPage.tsx',
      mutant: 'src/pages/JobDetailPage.tsx Post update → Post note',
      mutate: (src) => src.replace(/Post update/g, 'Post note'),
      run: async () => {
        const js = await bundleJobs();
        const page = await openPage({ width: 390, path: '/jobs/p3-0036', js });
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
        expect(items).toContain('Post update');
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/Post update|expected/i);
  }, 120000);

  killIt('K11 enquiry actions stay on the jobs list source', async () => {
    const page = await openPage({ width: 390, path: '/jobs?look=enquiries' });
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

  killIt('K11 mutant drops Call back', async () => {
    const red = await captureMutantRed({
      path: 'src/pages/JobsPage.tsx',
      mutant: 'src/pages/JobsPage.tsx Call back → Ring',
      mutate: (src) => src.replace('Call back', 'Ring'),
      run: async () => {
        const js = await bundleJobs();
        const page = await openPage({ width: 390, path: '/jobs?look=enquiries', js });
        await page.waitForSelector('[data-enquiry-call]', { timeout: 20000, state: 'attached' });
        const text = await page.evaluate(() => (
          document.querySelector('[data-enquiry-call]')?.textContent ?? ''
        ));
        await page.close();
        expect(text).toContain('Call back');
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/Call back|Ring|expected/i);
  }, 120000);

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

  killIt('K12 mutant shrinks the 768 modal to 480', async () => {
    const red = await captureMutantRed({
      path: 'src/index.css',
      mutant: 'src/index.css .job-form-sheet 560px → 480px',
      mutate: (src) => src.replace(
        '    .job-form-sheet {\n      width: 560px !important;\n      max-width: 560px !important;',
        '    .job-form-sheet {\n      width: 480px !important;\n      max-width: 480px !important;',
      ),
      run: async () => {
        const css = distCss
          .replace('width:560px!important', 'width:480px!important')
          .replace('max-width:560px!important', 'max-width:480px!important')
          .replace('width: 560px !important', 'width: 480px !important')
          .replace('max-width: 560px !important', 'max-width: 480px !important');
        const page = await openPage({ width: 768, path: '/jobs', css });
        await waitList(page);
        await openForm(page);
        const width = await page.evaluate(() => (
          Math.round((document.querySelector('.job-form-sheet') as HTMLElement).getBoundingClientRect().width)
        ));
        await page.close();
        expect(width).toBe(560);
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/560|480|expected/i);
  }, 120000);

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

  killIt('K12b mutant widens the 768 modal to 800', async () => {
    const red = await captureMutantRed({
      path: 'src/index.css',
      mutant: 'src/index.css .job-form-sheet 560px → 800px',
      mutate: (src) => src.replace(
        '    .job-form-sheet {\n      width: 560px !important;\n      max-width: 560px !important;',
        '    .job-form-sheet {\n      width: 800px !important;\n      max-width: 800px !important;',
      ),
      run: async () => {
        const css = distCss
          .replace('width:560px!important', 'width:800px!important')
          .replace('max-width:560px!important', 'max-width:800px!important')
          .replace('width: 560px !important', 'width: 800px !important')
          .replace('max-width: 560px !important', 'max-width: 800px !important');
        const page = await openPage({ width: 768, path: '/jobs', css });
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
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/560|800|16|expected/i);
  }, 120000);

  killIt('K13 clients throw; extrasError marks Ready off', async () => {
    const page = await openPage({ width: 390, path: '/jobs', clientsError: true });
    await page.waitForSelector('.ops-page, .hub-jobs, p', { timeout: 20000, state: 'attached' });
    const text = await page.evaluate(async () => {
      for (let i = 0; i < 80; i += 1) {
        const body = document.body.innerText;
        if (/Could not load jobs|Failed to load/.test(body)) return body;
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
      return document.body.innerText;
    });
    await page.close();
    expect(text).toContain('Could not load jobs');
    expect(text).toContain('Failed to load');
    expect(text).not.toContain('Hot water replacement');
    expect(jobStatusPill({ status: 'completed', invoices: [], invoiceReadError: true }).kind)
      .not.toBe('ready_to_invoice');
  });

  killIt('K13 mutant swallows the clients error', async () => {
    const red = await captureMutantRed({
      path: 'src/pages/JobsPage.tsx',
      mutant: 'src/pages/JobsPage.tsx swallow clientsError',
      mutate: (src) => src.replace(
        'if (clientsError) throw clientsError;',
        'if (clientsError) { /* swallowed */ }',
      ),
      run: async () => {
        const js = await bundleJobs();
        const page = await openPage({ width: 390, path: '/jobs', js, clientsError: true });
        await page.waitForSelector('.ops-page, .hub-jobs, p', { timeout: 20000, state: 'attached' });
        const text = await page.evaluate(async () => {
          for (let i = 0; i < 80; i += 1) {
            const body = document.body.innerText;
            if (/Could not load jobs|Hot water replacement/.test(body)) return body;
            await new Promise((resolve) => window.setTimeout(resolve, 50));
          }
          return document.body.innerText;
        });
        await page.close();
        expect(text).toContain('Could not load jobs');
        expect(text).not.toContain('Hot water replacement');
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/Could not load jobs|Hot water replacement|expected/i);
  }, 120000);

  killIt('K14 reachability controls are at least 44 tall', async () => {
    const page = await openPage({ width: 390, path: '/jobs/p3-0036' });
    await waitSheet(page);
    const read = await page.evaluate(() => {
      const sels = ['.job-sheet-back', '.job-sheet-tab', '.btn-primary', '.job-sheet-link', '.job-sheet-photo'];
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

  killIt('K14 mutant shrinks the sheet link below 44', async () => {
    const red = await captureMutantRed({
      path: 'src/index.css',
      mutant: 'src/index.css .job-sheet-link min-height 44 → 20',
      mutate: (src) => src.replace(
        '  .hub-jobs-document .job-sheet-link {\n    display: inline-flex;\n    align-items: center;\n    color: var(--job-sheet-link, #296AA5);\n    background: none;\n    border: none;\n    padding: 0;\n    min-height: 44px;',
        '  .hub-jobs-document .job-sheet-link {\n    display: inline-flex;\n    align-items: center;\n    color: var(--job-sheet-link, #296AA5);\n    background: none;\n    border: none;\n    padding: 0;\n    min-height: 20px;',
      ),
      run: async () => {
        const css = `${distCss}\n.hub-jobs-document .job-sheet-link{min-height:20px!important;height:20px!important}`;
        const page = await openPage({ width: 390, path: '/jobs/p3-0036', css });
        await waitSheet(page);
        const h = await page.evaluate(() => (
          (document.querySelector('.job-sheet-link') as HTMLElement | null)?.getBoundingClientRect().height ?? 0
        ));
        await page.close();
        expect(h).toBeGreaterThanOrEqual(44);
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/44|20|expected/i);
  }, 120000);

  killIt('K15 recorded select columns sit in the schema snapshot', async () => {
    const invoices = SCHEMA.tables.invoices;
    const client = selectCaptureClient();
    await loadParentInvoiced({ companyId: 'c1', parentJobId: 'parent' }, client);
    const cols = client.selected().split(',').map((col) => col.trim()).filter(Boolean);
    for (const col of cols) {
      expect(invoices).toContain(col);
    }
    expect(cols).toEqual(['id', 'job_id', 'status']);
    expect(cols).not.toContain('paid_at');
    expect(invoices).not.toContain('paid_at');
    expect(SCHEMA.p3_selects['Q-J1']).toEqual(['id', 'job_id', 'status']);
    expect(JOB_ID_BATCH).toBe(100);
    expect(chunkIds(Array.from({ length: 101 }, (_, i) => String(i)))).toHaveLength(2);
  });

  killIt('K15 mutant adding paid_at is not in the snapshot', async () => {
    const red = await captureMutantRed({
      path: 'src/lib/jobParentInvoiced.ts',
      mutant: 'src/lib/jobParentInvoiced.ts SELECT adds paid_at',
      mutate: (src) => src.replace(
        "export const JOB_PARENT_INVOICED_SELECT = 'id, job_id, status';",
        "export const JOB_PARENT_INVOICED_SELECT = 'id, job_id, status, paid_at';",
      ),
      run: async () => {
        const { loadParentInvoiced: freshLoad } = await importFresh<{
          loadParentInvoiced: typeof loadParentInvoiced;
        }>('src/lib/jobParentInvoiced.ts');
        const client = selectCaptureClient();
        await freshLoad({ companyId: 'c1', parentJobId: 'parent' }, client);
        const cols = client.selected().split(',').map((col) => col.trim()).filter(Boolean);
        expect(cols).not.toContain('paid_at');
        for (const col of cols) {
          expect(SCHEMA.tables.invoices, col).toContain(col);
        }
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/paid_at|expected/i);
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
      await sheet.close();
    }
  }, 240000);

  killIt('K16 mutant overflow-x auto on the tab rail', async () => {
    const red = await captureMutantRed({
      path: 'src/pages/JobDetailPage.tsx',
      mutant: 'src/pages/JobDetailPage.tsx 2000px overflow probe',
      mutate: (src) => src.replace(
        '<Link to="/jobs" className="hub-jobs-label job-sheet-back">{JOB_SHEET_BACK}</Link>',
        '<Link to="/jobs" className="hub-jobs-label job-sheet-back">{JOB_SHEET_BACK}</Link><div data-p3-overflow-mutant="1" style={{ width: 2000, height: 1 }} />',
      ),
      run: async () => {
        const js = await bundleJobs();
        const page = await openPage({ width: 375, path: '/jobs/p3-0036', js });
        await waitSheet(page);
        const box = await page.evaluate(overflowScript);
        await page.close();
        expect(box.maxRight, 'maxRight after 2000px mutant').toBeLessThanOrEqual(box.innerWidth);
        expect(box.scrollWidth, 'scrollWidth after 2000px mutant').toBeLessThanOrEqual(box.innerWidth);
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/maxRight|scrollWidth|innerWidth|expected/i);
  });

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

  killIt('K17 mutant swaps Notes and Photos', async () => {
    const red = await captureMutantRed({
      path: 'src/pages/JobDetailPage.tsx',
      mutant: 'src/pages/JobDetailPage.tsx photos block before notes',
      mutate: (src) => {
        const notes = src.match(/\{!notesBusy && overviewNotes\.length > 0 && \([\s\S]*?<\/section>\s*\)\}/);
        const photos = src.match(/\{!photosBusy && gallery\.length > 0 && \([\s\S]*?<\/section>\s*\)\}/);
        if (!notes || !photos) throw new Error('notes/photos blocks missing');
        return src.replace(notes[0], '__NOTES__').replace(photos[0], notes[0]).replace('__NOTES__', photos[0]);
      },
      run: async () => {
        const js = await bundleJobs();
        const page = await openPage({ width: 390, path: '/jobs/p3-0036', js });
        await waitSheet(page);
        const order = await page.evaluate(() => {
          const notes = document.querySelector('[data-job-sheet="notes"]')!.getBoundingClientRect().top;
          const photos = document.querySelector('[data-job-sheet="photos"]')!.getBoundingClientRect().top;
          return { notes, photos };
        });
        await page.close();
        expect(order.notes).toBeLessThan(order.photos);
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/less|greater|expected/i);
  }, 120000);

  killIt('K18 empty parts stay dropped and NAV_WORDS stay all-trades', async () => {
    expect(NAV_WORDS.jobs.toLowerCase()).not.toMatch(/booking/);
    expect(JOB_SHEET_HEAD_BAR).toBe('#0A2540');
    expect(JOB_SHEET_LINK).toBe('#296AA5');
    const page = await openPage({ width: 390, path: '/jobs/p3-undated' });
    await waitSheet(page);
    const read = await page.evaluate(() => document.body.innerText);
    await page.close();
    expect(read).toContain('No crew yet');
    expect(read).toContain('Set a date');
    expect(read).not.toContain('Photos · 0');
    expect(read).not.toContain('0 bill');
    const empty = await openPage({ width: 390, path: '/jobs', empty: true });
    await waitList(empty);
    const emptyText = await empty.evaluate(() => document.body.innerText);
    await empty.close();
    expect(emptyText).toContain('No jobs yet');
  });

  killIt('K18 mutant shows Photos · 0 on the empty sheet', async () => {
    const red = await captureMutantRed({
      path: 'src/pages/JobDetailPage.tsx',
      mutant: 'src/pages/JobDetailPage.tsx always render photos heading',
      mutate: (src) => src.replace(
        '{!photosBusy && gallery.length > 0 && (',
        '{!photosBusy && (',
      ),
      run: async () => {
        const js = await bundleJobs();
        const page = await openPage({ width: 390, path: '/jobs/p3-undated', js });
        await waitSheet(page);
        const text = await page.evaluate(() => document.body.innerText);
        await page.close();
        expect(text).not.toContain('Photos · 0');
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/Photos · 0|expected|not to contain/i);
  }, 120000);
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
    expect(text).toContain('All · 12 jobs · 1 need crew');
  });

  killIt('LOOK-GATE mutant un-gates Jobs ?look= so prod no-flag paints seeds', async () => {
    const red = await captureMutantRed({
      path: 'src/pages/JobsPage.tsx',
      mutant: 'src/pages/JobsPage.tsx drop DEV/VITE_LOOK_PROOF look gate',
      mutate: (src) => src
        .replace(
          "const lookParam = (import.meta.env.DEV || import.meta.env.VITE_LOOK_PROOF === '1') ? searchParams.get('look') : null;",
          'const lookParam = searchParams.get(\'look\');',
        )
        .replace(
          "const lookJobsList = (import.meta.env.DEV || import.meta.env.VITE_LOOK_PROOF === '1') && searchParams.get('look') === JOBS_LIST_LOOK;",
          'const lookJobsList = searchParams.get(\'look\') === JOBS_LIST_LOOK;',
        ),
      run: async () => {
        const js = await bundleJobs({ lookProof: false });
        const page = await openPage({
          width: 390,
          path: '/jobs?look=jobs-list',
          js,
        });
        await waitList(page);
        const text = await page.evaluate(() => document.body.innerText);
        await page.close();
        for (const seed of LOOK_SEED) {
          expect(text, seed).not.toContain(seed);
        }
      },
    });
    expect(red.line).toBeGreaterThan(0);
    expect(red.message).toMatch(/Northside Electrical|Harbour Lights|Site labour|Warehouse lights|expected/i);
  }, 120000);
});
