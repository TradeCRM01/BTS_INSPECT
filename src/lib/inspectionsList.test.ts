import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inspectionOpenPath } from './inspectionNextAction';
import { resolveInspectionDueDate } from './inspectionDueReminder';
import {
  decorateInspectionForList,
  decorateInspectionList,
  filterInspectionListFloor,
  formatInspectionListDate,
  groupInspectionListFloor,
  inspectionListDueKind,
  inspectionListDueLabel,
  inspectionListDueOn,
  inspectionListEmptyMessage,
  inspectionListEmptyTitle,
  inspectionListFloorBucket,
  inspectionListJob,
  inspectionListOpenHref,
  inspectionListSearchHaystack,
  inspectionMatchesListFilter,
  inspectionMatchesSearch,
  normalizeInspectionSearch,
  padInspectionListJobNumber,
  sortInspectionListFloor,
  type InspectionListRow,
} from './inspectionsList';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

/** 16:00 Friday 21 Aug 2026 in Australia/Perth. */
const now = new Date('2026-08-21T08:00:00.000Z');
const today = '2026-08-21';

function row(over: Partial<InspectionListRow> = {}): InspectionListRow {
  return {
    id: 'insp-1',
    status: 'draft',
    archived: false,
    meta: { siteName: 'Plant A', siteAddress: '12 Smith St, Geelong VIC 3220' },
    responses: {},
    template_snapshot: { name: 'RCD test' },
    crm_job_id: 'job-1',
    due_on: null,
    started_at: '2026-08-20T01:00:00.000Z',
    completed_at: null,
    inspector_name: 'Sam Spark',
    job_title: 'Switchboard test',
    job_address: '12 Smith St, Geelong VIC 3220',
    job_number: 42,
    job_company_id: 'co-1',
    job_client_id: 'c1',
    job_client_name: 'Acme Plants',
    job_scheduled_date: null,
    ...over,
  };
}

describe('open or due inspections from existing fields', () => {
  it('treats a draft with no due date as open work', () => {
    const draft = row();
    expect(inspectionListFloorBucket(draft, now)).toBe('open');
    expect(inspectionListDueOn(draft, now)).toBeNull();
    expect(decorateInspectionForList(draft, now).href).toBe('/inspections/insp-1');
  });

  it('surfaces a completed next-test that is due today or overdue — not buried in Done', () => {
    const dueToday = row({
      id: 'insp-due',
      status: 'completed',
      meta: { next_test_date: today, siteName: 'Plant A' },
      completed_at: '2026-02-01T00:00:00.000Z',
    });
    const overdue = row({
      id: 'insp-over',
      status: 'issued',
      meta: { nextTestDate: '2026-08-01', siteName: 'Plant B' },
    });
    expect(inspectionListFloorBucket(dueToday, now)).toBe('due');
    expect(inspectionListFloorBucket(overdue, now)).toBe('due');
    expect(inspectionListDueKind(today, now)).toBe('today');
    expect(inspectionListDueKind('2026-08-01', now)).toBe('overdue');
    expect(inspectionMatchesListFilter(decorateInspectionForList(dueToday, now), 'action')).toBe(true);
    expect(inspectionMatchesListFilter(decorateInspectionForList(overdue, now), 'action')).toBe(true);
  });

  it('keeps a completed test without a next date on Done, off the action floor', () => {
    const done = row({
      status: 'completed',
      meta: { siteName: 'Plant A' },
      completed_at: '2026-08-01T00:00:00.000Z',
    });
    expect(inspectionListFloorBucket(done, now)).toBe('done');
    expect(inspectionMatchesListFilter(decorateInspectionForList(done, now), 'action')).toBe(false);
    expect(inspectionMatchesListFilter(decorateInspectionForList(done, now), 'all')).toBe(true);
    expect(inspectionMatchesListFilter(decorateInspectionForList(done, now), 'completed')).toBe(true);
  });

  it('does not promote an upcoming next-test onto the due floor', () => {
    const upcoming = row({
      status: 'completed',
      meta: { next_test_date: '2026-11-01' },
    });
    expect(inspectionListDueKind('2026-11-01', now)).toBe('upcoming');
    expect(inspectionListFloorBucket(upcoming, now)).toBe('done');
    expect(inspectionListDueLabel('2026-11-01', now)).toBe('Due 1 Nov 2026');
  });

  it('reuses resolveInspectionDueDate — open rows fall back to the linked job date', () => {
    const openOnJob = row({
      meta: { siteName: 'Plant A' },
      job_scheduled_date: today,
      due_on: null,
    });
    expect(resolveInspectionDueDate(openOnJob, inspectionListJob(openOnJob))).toBe(today);
    expect(inspectionListDueOn(openOnJob, now)).toBe(today);
    expect(inspectionListFloorBucket(openOnJob, now)).toBe('due');
  });

  it('reads the projected due_on when the resolver has nothing else', () => {
    const projected = row({
      status: 'completed',
      meta: { siteName: 'Plant A' },
      due_on: '2026-08-20',
      job_scheduled_date: today,
    });
    expect(resolveInspectionDueDate(projected, inspectionListJob(projected))).toBeNull();
    expect(inspectionListDueOn(projected, now)).toBe('2026-08-20');
    expect(inspectionListFloorBucket(projected, now)).toBe('due');
  });

  it('lets the explicit next-test win over a stale due_on or job date', () => {
    const explicit = row({
      status: 'completed',
      meta: { next_test_date: today },
      due_on: '2026-01-01',
      job_scheduled_date: '2026-07-01',
    });
    expect(inspectionListDueOn(explicit, now)).toBe(today);
  });
});

describe('tap opens the existing inspection', () => {
  it('uses the existing fill route — no new report type or path', () => {
    expect(inspectionListOpenHref('insp-1')).toBe('/inspections/insp-1');
    expect(inspectionListOpenHref('insp-1')).toBe(inspectionOpenPath('insp-1', 'open'));
    expect(inspectionListOpenHref('insp-due')).not.toContain('/report');
    expect(inspectionListOpenHref('insp-due')).not.toContain('/review');
    expect(decorateInspectionForList(row({ id: 'insp-due', status: 'completed', meta: { next_test_date: today } }), now).href)
      .toBe('/inspections/insp-due');
  });
});

describe('due labels a sparkie can read', () => {
  it('names overdue, today, and upcoming from the existing date', () => {
    expect(formatInspectionListDate(today)).toBe('21 Aug 2026');
    expect(inspectionListDueLabel(today, now)).toBe('Due today');
    expect(inspectionListDueLabel('2026-08-01', now)).toBe('Overdue · 1 Aug 2026');
    expect(inspectionListDueLabel('2026-09-03', now)).toBe('Due 3 Sep 2026');
    expect(inspectionListDueLabel(null, now)).toBeNull();
    expect(padInspectionListJobNumber(42)).toBe('0042');
    expect(padInspectionListJobNumber(null)).toBeNull();
  });
});

describe('find an inspection on the Field Work list', () => {
  it('strips a leading hash so #0042 matches the job number', () => {
    const rcd = row();
    expect(normalizeInspectionSearch('#0042')).toBe('0042');
    expect(inspectionMatchesSearch(rcd, '#42')).toBe(true);
    expect(inspectionMatchesSearch(rcd, '0042')).toBe(true);
    expect(inspectionMatchesSearch(rcd, '#0042')).toBe(true);
  });

  it('matches site, template, client, inspector, and job title', () => {
    const rcd = row();
    expect(inspectionMatchesSearch(rcd, 'geelong')).toBe(true);
    expect(inspectionMatchesSearch(rcd, 'rcd')).toBe(true);
    expect(inspectionMatchesSearch(rcd, 'acme')).toBe(true);
    expect(inspectionMatchesSearch(rcd, 'sam spark')).toBe(true);
    expect(inspectionMatchesSearch(rcd, 'switchboard')).toBe(true);
    expect(inspectionMatchesSearch(rcd, 'zzz')).toBe(false);
    expect(inspectionListSearchHaystack(rcd)).toContain('12 smith st, geelong vic 3220');
  });

  it('returns the full list when the box is empty or only a hash', () => {
    const items = decorateInspectionList([row(), row({ id: 'insp-2', job_title: 'Meter box' })], now);
    expect(filterInspectionListFloor(items, { filter: 'all', search: '' })).toEqual(items);
    expect(filterInspectionListFloor(items, { filter: 'all', search: '   ' })).toEqual(items);
    expect(filterInspectionListFloor(items, { filter: 'all', search: '#' })).toEqual(items);
    expect(filterInspectionListFloor(items, { filter: 'all', search: 'meter' }).map(i => i.row.id)).toEqual(['insp-2']);
  });
});

describe('sort and group the open-or-due floor', () => {
  it('floats overdue, then due today, then other open, then done', () => {
    const items = decorateInspectionList([
      row({ id: 'done', status: 'issued', meta: { siteName: 'Done' }, completed_at: '2026-08-20T00:00:00.000Z' }),
      row({ id: 'open-later', job_scheduled_date: '2026-08-24', started_at: '2026-08-19T00:00:00.000Z' }),
      row({ id: 'open-soon', job_scheduled_date: '2026-08-23', started_at: '2026-08-18T00:00:00.000Z' }),
      row({ id: 'today', status: 'completed', meta: { next_test_date: today } }),
      row({ id: 'older-overdue', status: 'completed', meta: { next_test_date: '2026-07-01' } }),
      row({ id: 'newer-overdue', status: 'completed', meta: { next_test_date: '2026-08-10' } }),
    ], now);
    expect(sortInspectionListFloor(items).map(item => item.row.id)).toEqual([
      'older-overdue',
      'newer-overdue',
      'today',
      'open-soon',
      'open-later',
      'done',
    ]);
  });

  it('groups due / open / done after the action filter', () => {
    const items = decorateInspectionList([
      row({ id: 'due', status: 'completed', meta: { next_test_date: today } }),
      row({ id: 'open', status: 'draft', meta: { siteName: 'Plant A' } }),
      row({ id: 'done', status: 'issued', meta: { siteName: 'Plant A' } }),
    ], now);
    const action = filterInspectionListFloor(items, { filter: 'action', search: '' });
    const groups = groupInspectionListFloor(sortInspectionListFloor(action));
    expect(groups.due.map(item => item.row.id)).toEqual(['due']);
    expect(groups.open.map(item => item.row.id)).toEqual(['open']);
    expect(groups.done).toEqual([]);
    expect(groupInspectionListFloor(items).done.map(item => item.row.id)).toEqual(['done']);
  });

  it('names the empty action floor without pretending there are no inspections', () => {
    expect(inspectionListEmptyTitle({ filter: 'action', archived: false, noneAtAll: false }))
      .toBe('Nothing open or due');
    expect(inspectionListEmptyMessage({ filter: 'action', archived: false, noneAtAll: false }))
      .toMatch(/All inspections/);
    expect(inspectionListEmptyTitle({ filter: 'action', archived: false, noneAtAll: true }))
      .toBe('No inspections yet');
    expect(inspectionListEmptyTitle({ filter: 'all', archived: true, noneAtAll: true }))
      .toBe('No archived inspections');
  });
});

describe('inspections list wiring', () => {
  it('shows open or due on /inspections and taps through to /inspections/:id', () => {
    const list = src('src/pages/InspectionsPage.tsx');
    const app = src('src/App.tsx');

    expect(list).toContain('decorateInspectionList');
    expect(list).toContain('filterInspectionListFloor');
    expect(list).toContain('sortInspectionListFloor');
    expect(list).toContain('groupInspectionListFloor');
    expect(list).toContain('inspectionListOpenHref');
    expect(list).toContain("useState<InspectionListFilter>('action')");
    expect(list).toContain('Open or due');
    expect(list).toContain('Search job, site, template, #0042');
    expect(list).toContain('title="Due"');
    expect(list).toContain('title="Open"');
    expect(list).toContain('title="Done"');
    expect(list).toContain('dueLabel');
    expect(list).not.toContain("path: '/inspections/");

    expect(app).toContain('<Route path="/inspections"');
    expect(app).toContain('<Route path="/inspections/:id"');
    expect(app).toContain('<Route path="/inspections/:id/review"');
    expect(app).toContain('<Route path="/inspections/:id/report"');
    expect(app.match(/path="\/inspections/g)?.length).toBe(5);
    expect(app).not.toContain('/field-work');
    expect(app).not.toContain('/due-inspections');
    expect(app).not.toContain('InspectionsFloorPage');
  });

  it('stays on inspections-list-owned files and does not pull isolated modules', () => {
    const list = src('src/pages/InspectionsPage.tsx');
    const floor = src('src/lib/inspectionsList.ts');
    const forbidden = [
      'ClientsPage',
      'ClientDetailPage',
      'clientsFloor',
      'SchedulePage',
      'BoardViews',
      'ScheduleJobSearch',
      'scheduleBoard',
      'JobsPage',
      'JobDetailPage',
      'inspectionTemplatePacks',
      'Relovi',
      'Littleloop',
    ];
    for (const name of forbidden) {
      expect(list).not.toContain(name);
      expect(floor).not.toContain(name);
    }
    expect(floor).toContain('resolveInspectionDueDate');
    expect(floor).toContain('inspectionOpenPath');
    expect(floor).not.toContain('createPortal');
    expect(src('src/pages/InspectionFillPage.tsx')).not.toContain('inspectionsList');
    expect(src('src/lib/inspectionTemplatePacks.ts')).not.toContain('inspectionsList');
  });
});
