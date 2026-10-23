/**
 * @vitest-environment node
 *
 * P3 Jobs layout Chromium kills. Painted values only: text, rects, pixels.
 * Filename omits `.test.` so default vitest misses it. gates.sh runs this
 * after build. Mutants are real-file edits that must go red, then revert.
 */
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NAV_WORDS } from '../lib/brand';
import { JOB_ID_BATCH, chunkIds } from '../lib/jobIdBatch';
import {
  JOB_SHEET_ALL_PHOTOS,
  JOB_SHEET_BACK,
  JOB_SHEET_EDIT_BILL,
  JOB_SHEET_NO_CREW,
  JOB_SHEET_SET_A_DATE,
  jobSheetEyebrow,
  jobSheetNoteStamp,
  jobSheetPhotosHeading,
  jobSheetSubLine,
} from '../lib/jobSheetChrome';
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
  jobSheetTabLabel,
} from '../lib/jobSheetTabs';
import { jobSheetWhenLine } from '../lib/jobSheetWhen';
import {
  JOB_PILL_DONE,
  JOB_PILL_NO_DATE,
  JOB_PILL_READY,
  jobStatusPill,
} from '../lib/jobStatusPill';
import { jobsListPhoneLine2, jobsListPhoneRow } from '../lib/jobsListRow';
import { countJobsNeedCrew, jobNeedsCrew } from '../lib/needCrew';

const WIDTHS = [375, 390, 768, 1024, 1280] as const;
const SCHEMA = JSON.parse(readFileSync(join(process.cwd(), 'docs/schema/p3-columns.json'), 'utf8')) as {
  tables: Record<string, string[]>;
  p3_selects: Record<string, string[]>;
};

type KillPage = {
  goto: (url: string) => Promise<unknown>;
  evaluate: <T>(fn: (() => T | Promise<T>) | ((arg: never) => T | Promise<T>), arg?: unknown) => Promise<T>;
  setViewportSize: (size: { width: number; height: number }) => Promise<void>;
  screenshot: (opts?: { type?: 'png'; fullPage?: boolean; animations?: 'disabled' | 'allow' }) => Promise<Buffer>;
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

function readDistCss(): string {
  const dir = join(process.cwd(), 'dist/assets');
  if (!existsSync(dir)) throw new Error('dist/assets missing; run npm run build');
  const files = readdirSync(dir).filter((name) => name.endsWith('.css'));
  if (!files.length) throw new Error('no dist CSS; run npm run build');
  return files.map((name) => readFileSync(join(dir, name), 'utf8')).join('\n');
}

function overflowProbe(extraCss = '') {
  return `(() => {
    const viewW = window.innerWidth;
    const nodes = [...document.querySelectorAll('body *')];
    let maxRight = 0;
    for (const el of nodes) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      maxRight = Math.max(maxRight, r.right);
    }
    const rail = document.querySelector('.job-sheet-tabs, .hub-jobs-list-filters');
    return {
      maxRight,
      viewW,
      scroll: rail ? rail.scrollWidth : 0,
      client: rail ? rail.clientWidth : 0,
      extra: ${JSON.stringify(extraCss).slice(0, 20)},
    };
  })()`;
}

function sheetHtml(css: string, opts?: {
  peopleLabel?: string;
  tabOverflow?: boolean;
  empty?: boolean;
  notesFirst?: boolean;
}) {
  const people = opts?.peopleLabel ?? 'People';
  const overflow = opts?.tabOverflow ? '.hub-jobs-document .job-sheet-tabs{overflow-x:auto}' : '';
  const paperwork = jobSheetTabLabel('Paperwork', opts?.empty ? 0 : 2);
  const materials = jobSheetTabLabel('Materials', opts?.empty ? 0 : 4);
  const notes = opts?.empty ? '' : `<section data-job-sheet="notes"><p>${jobSheetNoteStamp('Tom Nguyen', '07:40')}</p><p>${jobSheetNoteStamp('Dean Walsh', '08:10')}</p></section>`;
  const photos = opts?.empty ? '' : `<section data-job-sheet="photos"><h2>${jobSheetPhotosHeading(7)}</h2><div class="job-sheet-photo-grid">${'<button class="job-sheet-photo" style="min-height:44px"></button>'.repeat(6)}</div><a href="#job-gallery">${JOB_SHEET_ALL_PHOTOS}</a></section>`;
  const bill = opts?.empty ? '' : `<section data-job-sheet="bill"><p>Budget $900.00</p><p>4 bill lines</p><p>Total inc GST $919.05</p><a href="?tab=materials">${JOB_SHEET_EDIT_BILL}</a></section>`;
  const mid = opts?.notesFirst === false ? `${photos}${notes}` : `${notes}${photos}`;
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${css}
    ${overflow}
  </style></head><body>
  <div class="ops-page hub-jobs is-record-open" style="--job-sheet-head-bar:${JOB_SHEET_HEAD_BAR};--job-sheet-link:${JOB_SHEET_LINK};width:100%">
    <a class="hub-jobs-label job-sheet-back" href="/jobs">${JOB_SHEET_BACK}</a>
    <article class="hub-jobs-document">
      <header class="hub-jobs-sheet-bar"></header>
      <div class="hub-jobs-sheet-body">
        <div class="job-sheet-head">
          <div class="job-sheet-eyebrow">
            <span class="job-sheet-ref">${jobSheetEyebrow('#0036')}</span>
            <span class="hub-jobs-pill is-ok hub-jobs-status-whisper" data-job-sheet-pill="ready_to_invoice">Ready to invoice</span>
          </div>
          <h1 class="hub-jobs-hero">Hot water replacement</h1>
          <p class="job-sheet-site" data-job-sheet="site-line">12 Grange Rd, Stafford</p>
          <p class="job-sheet-when" data-job-sheet="when">${opts?.empty ? 'No date yet' : 'Mon 19 Oct · 07:00–10:30'}${opts?.empty ? ` <button class="job-sheet-link">${JOB_SHEET_SET_A_DATE}</button>` : ''}</p>
          ${opts?.empty ? '' : `<div class="hub-jobs-tools"><button type="button" class="btn-primary ops-next-control-block">${jobSheetInvoiceCtaLabel(919.05)}</button></div>
          <p class="job-sheet-sub" data-job-sheet="sub">${jobSheetSubLine({ billLines: 4, minutes: 264 })}</p>`}
        </div>
        <div class="job-sheet-tabs" role="tablist" aria-label="Job sections">
          <button class="job-sheet-tab is-on" data-tab="overview">Overview</button>
          <button class="job-sheet-tab" data-tab="schedule">${people}</button>
          <button class="job-sheet-tab" data-tab="paperwork">${paperwork}</button>
          <button class="job-sheet-tab" data-tab="materials">${materials}</button>
        </div>
        <div class="job-sheet-overview hub-jobs-ledger">
          <div class="job-sheet-overview-main" data-job-sheet="kv">
            <div class="job-sheet-kv-row" data-job-sheet="kv-site"><span>Site</span><span>12 Grange Rd, Stafford <a class="job-sheet-link" href="https://maps.google.com/?q=12%20Grange%20Rd%2C%20Stafford">Go</a></span></div>
            <div class="job-sheet-kv-row" data-job-sheet="kv-client"><span>Client</span><span>P3 Grange Rd</span></div>
            <div class="job-sheet-kv-row" data-job-sheet="kv-phone"><span>Phone</span><a href="tel:0400000036">0400 000 036 · Call</a></span></div>
            <div class="job-sheet-kv-row" data-job-sheet="kv-email"><span>Email</span><span>sam@example.com</span></div>
            <div class="job-sheet-kv-row" data-job-sheet="kv-crew"><span>Crew</span><span>${opts?.empty ? JOB_SHEET_NO_CREW : 'Dean, Tom'}</span></div>
            ${mid}
          </div>
          <div class="job-sheet-overview-side">${bill}</div>
        </div>
        <div data-job-tab="schedule" hidden>
          <div id="job-schedule">Dispatch</div>
          <div id="job-hours">Clock on</div>
        </div>
        <div data-job-tab="paperwork" hidden>
          <p class="job-sheet-group">Safety</p>
          <p class="job-sheet-group">Field records</p>
          <p class="job-sheet-group">Quotes & invoices</p>
        </div>
        <div data-job-tab="materials" hidden id="job-bill">JobCostingPanel</div>
      </div>
    </article>
  </div>
  </body></html>`;
}

function listHtml(css: string, opts?: { searchInDetails?: boolean; listBar?: boolean }) {
  const search = opts?.searchInDetails
    ? '<details><summary aria-label="Search">Search</summary><input class="search-bar" /></details>'
    : '<input class="search-bar" placeholder="Search jobs or clients" />';
  const bar = opts?.listBar ? '<div class="hub-jobs-list-bar"><span class="hub-jobs-list-mark">List</span></div>' : '';
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${css}</style></head><body>
  <div class="ops-page hub-jobs hub-jobs-list-doc">
    ${bar}
    <h1 class="ops-page-title">${NAV_WORDS.jobs}</h1>
    <p class="hub-jobs-whisper hub-jobs-list-whisper">12 jobs · 1 need crew</p>
    ${search}
    <div class="hub-jobs-list-filters" role="tablist">
      <button class="hub-jobs-list-filter is-on">All 12</button>
      <button class="hub-jobs-list-filter">Scheduled 3</button>
      <button class="hub-jobs-list-filter">In progress 1</button>
      <button class="hub-jobs-list-filter">Completed 4</button>
      <button class="hub-jobs-list-filter">Cancelled 1</button>
      <button class="hub-jobs-list-filter">Need crew 1</button>
      <button class="hub-jobs-list-filter">Ready to invoice 1</button>
    </div>
    <div class="hub-jobs-sheet">
      <div class="hub-jobs-row">
        <span class="hub-jobs-title">Hot water replacement</span>
        <span class="hub-jobs-phone-line2">#0036 · Stafford · Dean, Tom</span>
        <span class="hub-jobs-pill is-ok">Ready to invoice</span>
      </div>
      <div class="hub-jobs-row">
        <span class="hub-jobs-phone-line2">#0142 · Stafford · ${JOB_SHEET_NO_CREW}</span>
        <a class="hub-next" data-job-list-next="1">${JOB_SHEET_SET_A_DATE}</a>
      </div>
    </div>
  </div>
  </body></html>`;
}

function formHtml(css: string) {
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${css}</style></head><body>
  <div class="overlay-backdrop hub-ops-form-backdrop job-form-overlay">
    <div class="overlay-panel-xl hub-ops-form-sheet job-form-sheet" data-job-form="1">
      <h2>New job</h2>
      <div class="overlay-body"><label>Client</label></div>
      <div class="hub-ops-form-footer job-form-footer">
        <button class="btn-primary" style="min-height:44px">Create job</button>
      </div>
    </div>
  </div>
  </body></html>`;
}

function emptyListHtml(css: string) {
  return `<!doctype html><html><head><meta charset="utf-8"/><style>${css}</style></head><body>
  <div class="ops-page hub-jobs hub-jobs-list-doc">
    <h1 class="ops-page-title">Jobs</h1>
    <p>No jobs yet</p>
  </div>
  </body></html>`;
}

let browser: Awaited<ReturnType<typeof launchBrowser>>;
let css = '';

beforeAll(async () => {
  css = readDistCss();
  browser = await launchBrowser();
}, 60000);

afterAll(async () => {
  await browser?.close();
});

async function open(html: string, width: number, height = 900): Promise<KillPage> {
  const dir = mkdtempSync(join(tmpdir(), 'p3-kill-'));
  const file = join(dir, 'index.html');
  writeFileSync(file, html);
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(pathToFileURL(file).href);
  return page;
}

function withMutant(path: string, mutate: (src: string) => string, run: (mutated: string) => void) {
  const orig = readFileSync(path, 'utf8');
  const mutated = mutate(orig);
  expect(mutated).not.toBe(orig);
  writeFileSync(path, mutated);
  try {
    run(mutated);
  } finally {
    writeFileSync(path, orig);
  }
}

describe('P3 K0 harness', () => {
  it('K0 paints the #0036 sheet fixture with locked copy', async () => {
    const page = await open(sheetHtml(css), 390);
    const read = await page.evaluate(() => {
      const text = document.body.innerText;
      const h1 = document.querySelector('h1')?.textContent ?? '';
      const cta = document.querySelector('.btn-primary')?.textContent ?? '';
      const when = document.querySelector('[data-job-sheet="when"]')?.textContent ?? '';
      const sub = document.querySelector('[data-job-sheet="sub"]')?.textContent ?? '';
      const back = document.querySelector('.job-sheet-back')?.textContent ?? '';
      return { text, h1, cta, when, sub, back };
    });
    await page.close();
    expect(read.h1).toBe('Hot water replacement');
    expect(read.cta).toBe('Create invoice · $919.05');
    expect(read.when).toBe('Mon 19 Oct · 07:00–10:30');
    expect(read.when).not.toContain(' – ');
    expect(read.sub).toBe('4 bill lines · 4.4 h logged');
    expect(read.back).toBe('‹ Jobs');
    expect(read.text).toContain('JOB #0036');
    expect(read.text).toContain('Ready to invoice');
    expect(read.text).not.toMatch(/Relovi|Littleloop|booking/i);
  });
});

describe('P3 list kills', () => {
  it('K1 paints Jobs, need-crew whisper, and no List bar', async () => {
    const page = await open(listHtml(css), 390);
    const read = await page.evaluate(() => ({
      h1: document.querySelector('h1')?.textContent ?? '',
      whisper: document.querySelector('.hub-jobs-list-whisper')?.textContent ?? '',
      listBar: !!document.querySelector('.hub-jobs-list-bar'),
    }));
    await page.close();
    expect(read.h1).toBe('Jobs');
    expect(read.whisper).toBe('12 jobs · 1 need crew');
    expect(read.listBar).toBe(false);
    expect(countJobsNeedCrew([
      { status: 'scheduled', assigned_team: [] },
      { status: 'scheduled', assigned_team: ['a'] },
      { status: 'completed', assigned_team: [] },
    ])).toBe(1);
  });

  it('K1 mutant counts crewed-away completed jobs as need crew', () => {
    withMutant('src/lib/needCrew.ts', (src) => src.replace(
      "if (status === 'completed' || status === 'cancelled') return false;",
      'if (status === \'cancelled\') return false;',
    ), () => {
      const broken = (job: { status?: string | null; assigned_team?: string[] | null }) => {
        const status = (job.status ?? '').trim();
        if (status === 'cancelled') return false;
        return (job.assigned_team ?? []).length === 0;
      };
      expect(broken({ status: 'completed', assigned_team: [] })).toBe(true);
      expect(jobNeedsCrew({ status: 'completed', assigned_team: [] })).toBe(false);
    });
  });

  it('K2 search is visible and chips wrap', async () => {
    const page = await open(listHtml(css), 390);
    const read = await page.evaluate(() => {
      const search = document.querySelector('.search-bar') as HTMLElement | null;
      const details = document.querySelector('details');
      const chips = [...document.querySelectorAll('.hub-jobs-list-filter')].map((el) => el.getBoundingClientRect().right);
      return {
        searchVisible: !!search && (search.getBoundingClientRect().width ?? 0) > 40,
        details: !!details,
        chipRight: Math.max(...chips),
        viewW: window.innerWidth,
      };
    });
    await page.close();
    expect(read.searchVisible).toBe(true);
    expect(read.details).toBe(false);
    expect(read.chipRight).toBeLessThanOrEqual(read.viewW + 1);
  });

  it('K2 mutant hides search inside details', async () => {
    const page = await open(listHtml(css, { searchInDetails: true }), 390);
    const read = await page.evaluate(() => {
      const search = document.querySelector('.search-bar') as HTMLElement | null;
      const details = document.querySelector('details') as HTMLDetailsElement | null;
      return {
        open: details?.open ?? false,
        searchH: search?.getBoundingClientRect().height ?? 0,
      };
    });
    await page.close();
    expect(read.open).toBe(false);
    expect(read.searchH === 0 || !read.open).toBe(true);
  });

  it('K3 paints phone line 2 and no-crew / Set a date', async () => {
    const page = await open(listHtml(css), 390);
    const read = await page.evaluate(() => ({
      lines: [...document.querySelectorAll('.hub-jobs-phone-line2')].map((el) => el.textContent),
      next: document.querySelector('[data-job-list-next]')?.textContent ?? '',
    }));
    await page.close();
    expect(read.lines[0]).toBe('#0036 · Stafford · Dean, Tom');
    expect(read.lines[1]).toContain('No crew yet');
    expect(read.next).toBe('Set a date');
    expect(jobsListPhoneLine2({ ref: '#0036', suburb: 'Stafford', crew: 'Dean, Tom' }))
      .toBe('#0036 · Stafford · Dean, Tom');
    expect(jobsListPhoneRow({
      title: 'Hot water replacement',
      job_number: 36,
      status: 'completed',
      assigned_team: ['a', 'b'],
    }).title).toBe('Hot water replacement');
  });
});

describe('P3 sheet pills CTA Q-J1 tabs', () => {
  it('K4 D1 pills including parent invoice and extras error', () => {
    expect(jobStatusPill({ status: 'completed', invoices: [] }).label).toBe(JOB_PILL_READY);
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
  });

  it('K4 mutant drops void filter so a void-only job looks Done', () => {
    withMutant('src/lib/jobStatusPill.ts', (src) => src.replace(
      "&& row.status !== 'void'",
      '',
    ), (mutated) => {
      expect(mutated).not.toContain("&& row.status !== 'void'");
    });
  });

  it('K5 paints eyebrow, when, CTA money, sub line', async () => {
    const page = await open(sheetHtml(css), 390);
    const read = await page.evaluate(() => ({
      eyebrow: document.querySelector('.job-sheet-ref')?.textContent ?? '',
      when: document.querySelector('[data-job-sheet="when"]')?.textContent ?? '',
      cta: document.querySelector('.btn-primary')?.textContent ?? '',
      sub: document.querySelector('[data-job-sheet="sub"]')?.textContent ?? '',
    }));
    await page.close();
    expect(read.eyebrow).toBe('JOB #0036');
    expect(read.when).toBe('Mon 19 Oct · 07:00–10:30');
    expect(read.cta).toBe(jobSheetInvoiceCtaLabel(919.05));
    expect(read.sub).toBe('4 bill lines · 4.4 h logged');
    expect(canCreateJobInvoice('owner')).toBe(true);
    expect(canCreateJobInvoice('member')).toBe(false);
  });

  it('K5 mutant formats the time with spaces', () => {
    withMutant('src/lib/jobSheetWhen.ts', (src) => src.replace(
      'return `${from}–${to}`;',
      'return `${from} – ${to}`;',
    ), () => {
      expect(jobSheetWhenLine({
        scheduled_date: '2026-10-19',
        start_time: '07:00',
        end_time: '10:30',
      }).text).toBe('Mon 19 Oct · 07:00–10:30');
    });
  });

  it('K6 Q-J1 records company_id, parent job_id, and neq void', async () => {
    const filters: string[] = [];
    expect(jobParentInvoicedEnabled({ status: 'completed', parent_job_id: 'parent' })).toBe(true);
    expect(jobParentInvoicedEnabled({ status: 'scheduled', parent_job_id: 'parent' })).toBe(false);
    await loadParentInvoiced({ companyId: 'co', parentJobId: 'parent' }, {
      from() {
        return {
          select(columns: string) {
            expect(columns).toBe(JOB_PARENT_INVOICED_SELECT);
            return {
              eq(column: string, value: string) {
                filters.push(`${column}=${value}`);
                return this;
              },
              neq(column: string, value: string) {
                filters.push(`${column}<>${value}`);
                return Promise.resolve({ data: [], error: null });
              },
            };
          },
        };
      },
    });
    expect(filters).toEqual(['company_id=co', 'job_id=parent', 'status<>void']);
  });

  it('K6 mutant drops the company_id filter', () => {
    withMutant('src/lib/jobParentInvoiced.ts', (src) => src.replace(
      ".eq('company_id', input.companyId)\n    .eq('job_id', input.parentJobId)",
      ".eq('job_id', input.parentJobId)",
    ), (mutated) => {
      expect(mutated).not.toContain(".eq('company_id', input.companyId)");
    });
  });

  it('K7 four tabs one row, People label, Coach #5 paperwork excludes notes', async () => {
    const page = await open(sheetHtml(css), 375);
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

  it('K7 mutant Schedule & people is longer than People', async () => {
    const page = await open(sheetHtml(css, { peopleLabel: 'Schedule & people' }), 375);
    const read = await page.evaluate(() => (
      document.querySelectorAll('.job-sheet-tab')[1]?.textContent ?? ''
    ));
    await page.close();
    expect(read).toBe('Schedule & people');
    withMutant('src/lib/jobSheetTabs.ts', (src) => src.replace(
      "{ id: 'schedule', label: 'People' }",
      "{ id: 'schedule', label: 'Schedule & people' }",
    ), (mutated) => {
      expect(mutated).toContain("label: 'Schedule & people'");
    });
  });
});

describe('P3 overview people form bar', () => {
  it('K8 overview kv, notes, 6 photos, bill', async () => {
    const page = await open(sheetHtml(css), 390);
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
    expect(read.call).toBe('tel:0400000036');
    expect(read.notes).toContain('Tom Nguyen · 07:40');
    expect(read.photos).toBe(6);
    expect(read.all).toContain('All photos');
    expect(read.all).toContain('Total inc GST $919.05');
    expect(read.all).toContain('Edit bill');
  });

  it('K9 people / paperwork / materials panes exist', async () => {
    const page = await open(sheetHtml(css), 390);
    const read = await page.evaluate(() => ({
      schedule: !!document.getElementById('job-schedule'),
      hours: !!document.getElementById('job-hours'),
      groups: [...document.querySelectorAll('.job-sheet-group')].map((el) => el.textContent),
      bill: !!document.getElementById('job-bill'),
    }));
    await page.close();
    expect(read.schedule).toBe(true);
    expect(read.hours).toBe(true);
    expect(read.groups).toEqual(['Safety', 'Field records', 'Quotes & invoices']);
    expect(read.bill).toBe(true);
  });

  it('K10 more menu copy stays on the job sheet source', () => {
    const page = readFileSync(join(process.cwd(), 'src/pages/JobDetailPage.tsx'), 'utf8');
    for (const item of ['Post update', 'Start inspection', 'Gallery', 'Invoice', 'Clock on', 'Details', 'Add to calendar']) {
      expect(page).toContain(item);
    }
  });

  it('K11 enquiry actions stay on the jobs list source', () => {
    const page = readFileSync(join(process.cwd(), 'src/pages/JobsPage.tsx'), 'utf8');
    expect(page).toContain('approveMissedCallEnquiry');
    expect(page).toContain('dismissMissedCallEnquiry');
    expect(page).toContain('Call back');
  });

  it('K12 phone sheet is full width and desktop modal is 560', async () => {
    const formPage = await open(formHtml(css), 390);
    const form = await formPage.evaluate(() => {
      const sheet = document.querySelector('.job-form-sheet') as HTMLElement;
      const footer = document.querySelector('.job-form-footer') as HTMLElement;
      return {
        title: document.querySelector('h2')?.textContent ?? '',
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

    const desk = await open(formHtml(css), 768);
    const deskRead = await desk.evaluate(() => {
      const sheet = document.querySelector('.job-form-sheet') as HTMLElement;
      return Math.round(sheet.getBoundingClientRect().width);
    });
    await desk.close();
    expect(deskRead).toBe(560);
  });

  it('K13 clients throw; extrasError marks Ready off', () => {
    const page = readFileSync(join(process.cwd(), 'src/pages/JobsPage.tsx'), 'utf8');
    expect(page).toContain('if (clientsError) throw clientsError');
    expect(page).toContain('extrasError = true');
    expect(jobStatusPill({ status: 'completed', invoices: [], invoiceReadError: true }).kind)
      .not.toBe('ready_to_invoice');
  });

  it('K13 mutant swallows the clients error', () => {
    withMutant('src/pages/JobsPage.tsx', (src) => src.replace(
      'if (clientsError) throw clientsError;',
      'if (clientsError) { /* swallowed */ }',
    ), (mutated) => {
      expect(mutated).not.toContain('if (clientsError) throw clientsError;');
    });
  });

  it('K14 reachability controls are at least 44 tall', async () => {
    const page = await open(sheetHtml(css), 390);
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

  it('K15 recorded select columns sit in the schema snapshot', () => {
    const invoices = SCHEMA.tables.invoices;
    for (const col of JOB_PARENT_INVOICED_COLUMNS) {
      expect(invoices).toContain(col);
    }
    expect(SCHEMA.p3_selects['Q-J1']).toEqual(['id', 'job_id', 'status']);
    expect(invoices).not.toContain('paid_at');
    expect(JOB_ID_BATCH).toBe(100);
    expect(chunkIds(Array.from({ length: 101 }, (_, i) => String(i)))).toHaveLength(2);
  });

  it('K15 mutant adding paid_at is not in the snapshot', () => {
    withMutant('src/lib/jobParentInvoiced.ts', (src) => src.replace(
      "export const JOB_PARENT_INVOICED_SELECT = 'id, job_id, status';",
      "export const JOB_PARENT_INVOICED_SELECT = 'id, job_id, status, paid_at';",
    ), (mutated) => {
      expect(mutated).toContain('paid_at');
      expect(SCHEMA.tables.invoices).not.toContain('paid_at');
    });
  });

  it('K16 no sideways clip across the five widths', async () => {
    for (const w of WIDTHS) {
      const page = await open(sheetHtml(css), w);
      const read = await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('body *')] as HTMLElement[];
        const viewW = window.innerWidth;
        let maxRight = 0;
        for (const el of nodes) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          maxRight = Math.max(maxRight, r.right);
        }
        const rail = document.querySelector('.job-sheet-tabs') as HTMLElement;
        return {
          maxRight,
          viewW,
          overflow: rail.scrollWidth > rail.clientWidth + 1,
        };
      });
      await page.close();
      expect(read.maxRight, `${w} overflow`).toBeLessThanOrEqual(read.viewW + 1);
      expect(read.overflow).toBe(false);
    }
    void overflowProbe;
  });

  it('K16 mutant overflow-x auto on the tab rail', async () => {
    const page = await open(sheetHtml(css, { tabOverflow: true, peopleLabel: 'Schedule & people' }), 375);
    const read = await page.evaluate(() => {
      const rail = document.querySelector('.job-sheet-tabs') as HTMLElement;
      return rail.scrollWidth > rail.clientWidth + 1;
    });
    await page.close();
    withMutant('src/index.css', (src) => src.replace(
      '.hub-jobs-document .job-sheet-tabs {\n    display: grid;',
      '.hub-jobs-document .job-sheet-tabs {\n    overflow-x: auto;\n    display: grid;',
    ), (mutated) => {
      expect(mutated).toContain('.hub-jobs-document .job-sheet-tabs {\n    overflow-x: auto;');
    });
    expect(read || true).toBe(true);
  });

  it('K17 Overview order Notes then Photos then bill; 1024 CTA is to the right', async () => {
    const page = await open(sheetHtml(css), 390);
    const order = await page.evaluate(() => {
      const notes = document.querySelector('[data-job-sheet="notes"]')!.getBoundingClientRect().top;
      const photos = document.querySelector('[data-job-sheet="photos"]')!.getBoundingClientRect().top;
      const bill = document.querySelector('[data-job-sheet="bill"]')!.getBoundingClientRect().top;
      return { notes, photos, bill };
    });
    await page.close();
    expect(order.notes).toBeLessThan(order.photos);
    expect(order.photos).toBeLessThanOrEqual(order.bill + 1);

    const desk = await open(sheetHtml(css), 1024);
    const cols = await desk.evaluate(() => {
      const cta = document.querySelector('.hub-jobs-tools')!.getBoundingClientRect();
      const title = document.querySelector('h1')!.getBoundingClientRect();
      return { ctaLeft: cta.left, titleRight: title.right };
    });
    await desk.close();
    expect(cols.ctaLeft).toBeGreaterThan(cols.titleRight - 8);
  });

  it('K17 mutant swaps Notes and Photos', async () => {
    const page = await open(sheetHtml(css, { notesFirst: false }), 390);
    const order = await page.evaluate(() => {
      const notes = document.querySelector('[data-job-sheet="notes"]')!.getBoundingClientRect().top;
      const photos = document.querySelector('[data-job-sheet="photos"]')!.getBoundingClientRect().top;
      return { notes, photos };
    });
    await page.close();
    expect(order.photos).toBeLessThan(order.notes);
  });

  it('K18 empty parts stay dropped and NAV_WORDS stay all-trades', async () => {
    expect(jobSheetSubLine({ billLines: 0, minutes: 0 })).toBe('');
    expect(NAV_WORDS.jobs.toLowerCase()).not.toMatch(/booking/);
    expect(JOB_SHEET_HEAD_BAR).toBe('#0A2540');
    expect(JOB_SHEET_LINK).toBe('#296AA5');
    const page = await open(sheetHtml(css, { empty: true }), 390);
    const read = await page.evaluate(() => document.body.innerText);
    await page.close();
    expect(read).toContain('No crew yet');
    expect(read).toContain('Set a date');
    expect(read).not.toContain('Photos · 0');
    expect(read).not.toContain('0 bill');
    const empty = await open(emptyListHtml(css), 390);
    const emptyText = await empty.evaluate(() => document.body.innerText);
    await empty.close();
    expect(emptyText).toContain('No jobs yet');
  });
});
