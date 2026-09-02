import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectionOpenPath } from './inspectionNextAction';
import { resolveInspectionDueDate } from './inspectionDueReminder';
import {
  JOB_TESTING_DUE_EMPTY,
  JOB_TESTING_DUE_TITLE,
  jobTestingDueEmptyTitle,
  jobTestingDueHref,
  jobTestingDueRows,
} from './jobTestingDue';
import type { DueInspection, DueInspectionJob } from './inspectionDueReminder';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

/** 16:00 Friday 21 Aug 2026 in Australia/Perth. */
const now = new Date('2026-08-21T08:00:00.000Z');
const today = '2026-08-21';

function job(over: Partial<DueInspectionJob> = {}): DueInspectionJob {
  return {
    id: 'job-1',
    company_id: 'co-1',
    client_id: 'c1',
    title: 'Switchboard test',
    scheduled_date: null,
    address: '12 Smith St, Geelong VIC 3220',
    job_number: 42,
    ...over,
  };
}

function insp(over: Partial<DueInspection> = {}): DueInspection {
  return {
    id: 'insp-1',
    status: 'draft',
    archived: false,
    meta: { siteName: 'Plant A' },
    responses: {},
    template_snapshot: { name: 'RCD test' },
    crm_job_id: 'job-1',
    due_on: null,
    started_at: '2026-08-20T01:00:00.000Z',
    completed_at: null,
    ...over,
  };
}

describe('testing due on the job sheet', () => {
  it('shows a due-today inspection so the sparkie can open it', () => {
    const due = insp({
      id: 'insp-due',
      status: 'completed',
      meta: { next_test_date: today },
    });
    const rows = jobTestingDueRows([due], job(), now);
    expect(rows).toEqual([{
      id: 'insp-due',
      title: 'RCD test',
      dueOn: today,
      dueKind: 'today',
      dueLabel: 'Due today',
      href: '/inspections/insp-due',
    }]);
  });

  it('shows an overdue inspection on the sheet', () => {
    const overdue = insp({
      id: 'insp-over',
      status: 'issued',
      meta: { nextTestDate: '2026-08-01' },
    });
    const rows = jobTestingDueRows([overdue], job(), now);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'insp-over',
      dueKind: 'overdue',
      dueLabel: 'Overdue · 1 Aug 2026',
      href: '/inspections/insp-over',
    });
  });

  it('is honest empty when nothing is due', () => {
    expect(jobTestingDueRows([], job(), now)).toEqual([]);
    expect(jobTestingDueRows(null, job(), now)).toEqual([]);
    expect(jobTestingDueRows([
      insp({ status: 'completed', meta: { siteName: 'Plant A' } }),
      insp({ id: 'insp-later', status: 'completed', meta: { next_test_date: '2026-11-01' } }),
      insp({ id: 'insp-open', status: 'draft', meta: { siteName: 'Plant A' } }),
    ], job(), now)).toEqual([]);
    expect(jobTestingDueEmptyTitle()).toBe(JOB_TESTING_DUE_EMPTY);
    expect(JOB_TESTING_DUE_EMPTY).toBe('Nothing due on this job.');
    expect(JOB_TESTING_DUE_TITLE).toBe('Testing due');
  });

  it('skips archived and upcoming next-tests', () => {
    const rows = jobTestingDueRows([
      insp({ id: 'archived', archived: true, meta: { next_test_date: today } }),
      insp({ id: 'upcoming', status: 'completed', meta: { next_test_date: '2026-11-01' } }),
      insp({ id: 'due', status: 'completed', meta: { next_test_date: today } }),
    ], job(), now);
    expect(rows.map(r => r.id)).toEqual(['due']);
  });

  it('floats overdue ahead of due today', () => {
    const rows = jobTestingDueRows([
      insp({ id: 'today', status: 'completed', meta: { next_test_date: today } }),
      insp({ id: 'older', status: 'completed', meta: { next_test_date: '2026-07-01' } }),
      insp({ id: 'newer', status: 'completed', meta: { next_test_date: '2026-08-10' } }),
    ], job(), now);
    expect(rows.map(r => r.id)).toEqual(['older', 'newer', 'today']);
  });

  it('reuses resolveInspectionDueDate — open rows fall back to the linked job date', () => {
    const openOnJob = insp({ meta: { siteName: 'Plant A' }, due_on: null });
    const linked = job({ scheduled_date: today });
    expect(resolveInspectionDueDate(openOnJob, linked)).toBe(today);
    expect(jobTestingDueRows([openOnJob], linked, now)[0]?.dueKind).toBe('today');
  });

  it('reads the projected due_on when the resolver has nothing else', () => {
    const projected = insp({
      status: 'completed',
      meta: { siteName: 'Plant A' },
      due_on: '2026-08-20',
    });
    expect(resolveInspectionDueDate(projected, job())).toBeNull();
    expect(jobTestingDueRows([projected], job({ scheduled_date: today }), now)[0]).toMatchObject({
      id: 'insp-1',
      dueKind: 'overdue',
      dueOn: '2026-08-20',
    });
  });
});

describe('tap opens the existing inspection fill', () => {
  it('uses the existing fill route — no new testing path', () => {
    expect(jobTestingDueHref('insp-1')).toBe('/inspections/insp-1');
    expect(jobTestingDueHref('insp-1')).toBe(inspectionOpenPath('insp-1', 'open'));
    expect(jobTestingDueHref('insp-due')).not.toContain('/report');
    expect(jobTestingDueHref('insp-due')).not.toContain('/review');
    expect(jobTestingDueHref('insp-due')).not.toContain('/testing');
  });
});

describe('job sheet wiring', () => {
  it('surfaces due tests on JobDetailPage and taps through to /inspections/:id', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const app = src('src/App.tsx');

    expect(page).toContain('jobTestingDueRows');
    expect(page).toContain('JOB_TESTING_DUE_TITLE');
    expect(page).toContain('JOB_TESTING_DUE_EMPTY');
    expect(page).toContain('id="job-testing-due"');
    expect(page).toContain('jobTestingDueRows');
    expect(page).not.toContain("path: '/testing");
    expect(page).not.toContain('/due-tests');
    expect(page).not.toContain('TestingDuePage');

    expect(app).toContain('<Route path="/inspections/:id"');
    expect(app).not.toContain('/due-tests');
    expect(app).not.toContain('/testing-due');
    expect(app).not.toContain('TestingDuePage');
    expect(app.match(/path="\/inspections/g)?.length).toBe(5);
  });

  it('does not invent a reminders module or put Take 5 on this tray', () => {
    const helper = src('src/lib/jobTestingDue.ts');
    const page = src('src/pages/JobDetailPage.tsx');
    const dueBlockStart = page.indexOf('id="job-testing-due"');
    const dueBlockEnd = page.indexOf('id="job-insp"');
    const dueBlock = page.slice(dueBlockStart, dueBlockEnd);

    expect(helper).toContain('resolveInspectionDueDate');
    expect(helper).toContain('decorateInspectionList');
    expect(helper).not.toContain('InspectionDueReminder');
    expect(helper).not.toContain('decideInspectionDueSend');
    expect(helper).not.toContain('take5');
    expect(helper).not.toContain('Take 5');
    expect(dueBlock).not.toContain('Take 5');
    expect(dueBlock).not.toContain('startTake5');
    expect(dueBlock).not.toContain('InspectionDueReminder');
    expect(dueBlock).toContain('Open');
  });
});

describe('isolation — stay-off surfaces stay off this change', () => {
  it('stays on the job sheet and existing inspection-due helpers', () => {
    const helper = src('src/lib/jobTestingDue.ts');
    const page = src('src/pages/JobDetailPage.tsx');
    const forbidden = [
      'QuotesPage',
      'QuoteSendDialog',
      'quoteNextAction',
      'sendQuote',
      'InvoicesPage',
      'InstallPrompt',
      'Relovi',
      'Littleloop',
      'Privacy',
      'Terms of Service',
    ];
    for (const name of forbidden) {
      expect(helper).not.toContain(name);
    }
    expect(helper).not.toContain('LoginPage');
    expect(helper).not.toContain('MarketingPage');
    expect(src('src/pages/QuotesPage.tsx')).not.toContain('jobTestingDue');
    expect(src('src/pages/InvoicesPage.tsx')).not.toContain('jobTestingDue');
    expect(src('src/lib/quoteNextAction.ts')).not.toContain('jobTestingDue');
    expect(src('src/lib/sendQuote.ts')).not.toContain('jobTestingDue');
    expect(src('src/components/ui/InstallPrompt.tsx')).not.toContain('jobTestingDue');
    expect(page).toContain("from '../lib/jobTestingDue'");
    expect(helper).toContain("from './inspectionsList'");
    expect(helper).toContain("from './inspectionDueReminder'");
  });
});
