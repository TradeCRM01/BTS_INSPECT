import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TIMESHEET_LIST_DEFAULT_FILTER,
  TIMESHEET_LIST_FILTERS,
  compareTimesheetListItems,
  decorateTimesheetForList,
  timesheetListAttachJobs,
  timesheetListBucket,
  timesheetListEmptyKind,
  timesheetListEmptyMessage,
  timesheetListEmptyTitle,
  getAuditTimesheetEntries,
  getAuditTimesheets,
  timesheetListCountLabel,
  timesheetListHoursLabel,
  timesheetListJobLine,
  timesheetListJobRef,
  timesheetListMatchesFilter,
  timesheetListMatchesQuery,
  timesheetListNormalizeQuery,
  timesheetListOpenHref,
  timesheetListOpenId,
  timesheetListOpened,
  timesheetListPillClass,
  timesheetListTitle,
  timesheetListVisibleItems,
  timesheetListWeekStart,
  type TimesheetListRow,
} from './timesheetsList';

function row(partial: Partial<TimesheetListRow> & { id: string }): TimesheetListRow {
  return {
    employee_id: 'emp-1',
    date: '2026-08-24',
    status: 'open',
    total_minutes: 480,
    ...partial,
  };
}

describe('timesheet list open href', () => {
  it('opens the existing /timesheets page with the timesheet id', () => {
    expect(timesheetListOpenHref('ts-9')).toBe('/timesheets?id=ts-9');
    expect(timesheetListOpenHref('ts-9', 'job-1')).toBe('/timesheets?id=ts-9&job=job-1');
  });

  it('does not invent a timesheet, payroll, or export route', () => {
    const href = timesheetListOpenHref('ts-9');
    expect(href.startsWith('/timesheets?')).toBe(true);
    expect(href).not.toContain('/timesheets/');
    expect(href).not.toContain('/payroll');
    expect(href).not.toContain('/export');
    expect(href).not.toContain('spreadsheet');
  });

  it('reads a real id and ignores blanks', () => {
    expect(timesheetListOpenId('ts-9')).toBe('ts-9');
    expect(timesheetListOpenId('  ')).toBeNull();
    expect(timesheetListOpenId(null)).toBeNull();
  });
});

describe('timesheet list floor filter', () => {
  it('defaults to All so this week’s sheets are visible', () => {
    expect(TIMESHEET_LIST_DEFAULT_FILTER).toBe('all');
    expect(TIMESHEET_LIST_FILTERS.map(f => f.value)).toEqual(['all', 'open', 'done']);
    expect(TIMESHEET_LIST_FILTERS[2].label).toBe('Submitted');
  });

  it('treats open and rejected as open; submitted and approved as done', () => {
    expect(timesheetListBucket('open')).toBe('open');
    expect(timesheetListBucket('rejected')).toBe('open');
    expect(timesheetListBucket('submitted')).toBe('done');
    expect(timesheetListBucket('approved')).toBe('done');
    expect(timesheetListMatchesFilter('open', 'all')).toBe(true);
    expect(timesheetListMatchesFilter('submitted', 'all')).toBe(true);
    expect(timesheetListMatchesFilter('open', 'open')).toBe(true);
    expect(timesheetListMatchesFilter('submitted', 'open')).toBe(false);
    expect(timesheetListMatchesFilter('approved', 'done')).toBe(true);
    expect(timesheetListMatchesFilter('open', 'done')).toBe(false);
  });
});

describe('timesheet list search and job line', () => {
  const board = row({
    id: 'ts-board',
    date: '2026-08-24',
    job_titles: ['Switchboard upgrade'],
    job_numbers: [42],
    employee_name: 'Sam Spark',
    total_minutes: 90,
  });

  it('strips a leading hash so #0042 and 42 match the job', () => {
    expect(timesheetListNormalizeQuery('#0042')).toBe('0042');
    expect(timesheetListMatchesQuery(board, '#0042')).toBe(true);
    expect(timesheetListMatchesQuery(board, '0042')).toBe(true);
    expect(timesheetListMatchesQuery(board, '42')).toBe(true);
    expect(timesheetListJobRef(42)).toBe('#0042');
    expect(timesheetListJobRef(null)).toBeNull();
  });

  it('matches date, job title, employee, hours, and status', () => {
    expect(timesheetListMatchesQuery(board, '24 aug')).toBe(true);
    expect(timesheetListMatchesQuery(board, 'switch')).toBe(true);
    expect(timesheetListMatchesQuery(board, 'sam spark')).toBe(true);
    expect(timesheetListMatchesQuery(board, '1h 30m')).toBe(true);
    expect(timesheetListMatchesQuery(board, 'open')).toBe(true);
    expect(timesheetListMatchesQuery(board, 'zzz')).toBe(false);
  });

  it('writes a Simpro-style job line from the linked jobs', () => {
    expect(timesheetListJobLine(board)).toBe('#0042 Switchboard upgrade');
    expect(timesheetListJobLine({
      job_titles: ['Switchboard upgrade', 'Meter'],
      job_numbers: [42, 43],
    })).toBe('#0042 Switchboard upgrade · 2 jobs');
    expect(timesheetListJobLine({ job_titles: [], job_numbers: [] })).toBeNull();
  });
});

describe('timesheet list sort, open, and empty kinds', () => {
  const monday = row({ id: 'ts-mon', date: '2026-08-24', status: 'open', total_minutes: 480 });
  const friday = row({ id: 'ts-fri', date: '2026-08-28', status: 'submitted', total_minutes: 420 });
  const thursday = row({ id: 'ts-thu', date: '2026-08-27', status: 'open', total_minutes: 60 });

  it('sorts open first, then newest date', () => {
    const sorted = [friday, monday, thursday]
      .map(r => decorateTimesheetForList(r))
      .sort(compareTimesheetListItems);
    expect(sorted.map(item => item.row.id)).toEqual(['ts-thu', 'ts-mon', 'ts-fri']);
  });

  it('Open hides submitted rows; All keeps them after open', () => {
    const rows = [friday, monday, thursday];
    expect(timesheetListVisibleItems(rows, { filter: 'open' }).map(item => item.row.id)).toEqual([
      'ts-thu',
      'ts-mon',
    ]);
    expect(timesheetListVisibleItems(rows, { filter: 'done' }).map(item => item.row.id)).toEqual([
      'ts-fri',
    ]);
    expect(timesheetListVisibleItems(rows, { filter: 'all' }).map(item => item.row.id)).toEqual([
      'ts-thu',
      'ts-mon',
      'ts-fri',
    ]);
  });

  it('search + All returns the matching sheet and its existing open href', () => {
    const visible = timesheetListVisibleItems(
      [
        timesheetListAttachJobs(monday, [{ timesheet_id: 'ts-mon', job_id: 'job-1' }], [
          { id: 'job-1', title: 'Switchboard upgrade', job_number: 42 },
        ]),
        friday,
      ],
      { filter: 'all', query: '#0042', job: 'job-1' },
    );
    expect(visible.map(item => item.row.id)).toEqual(['ts-mon']);
    expect(visible[0].href).toBe('/timesheets?id=ts-mon&job=job-1');
    expect(visible[0].jobLine).toBe('#0042 Switchboard upgrade');
    expect(visible[0].title).toBe('Mon 24 Aug');
    expect(visible[0].hoursLabel).toBe('8h 0m');
  });

  it('finds the opened row and jumps the week to that date', () => {
    expect(timesheetListOpened([monday, friday], 'ts-fri')?.id).toBe('ts-fri');
    expect(timesheetListOpened([monday], 'missing')).toBeNull();
    expect(timesheetListOpened([monday], null)).toBeNull();
    expect(timesheetListWeekStart('2026-08-28')).toEqual(new Date(2026, 7, 24));
  });

  it('tells none / none-open / none-done / none-match apart', () => {
    expect(timesheetListEmptyKind({ total: 0, visible: 0, filter: 'all', query: '' })).toBe('none');
    expect(timesheetListEmptyKind({ total: 3, visible: 0, filter: 'open', query: '' })).toBe('none-open');
    expect(timesheetListEmptyKind({ total: 3, visible: 0, filter: 'done', query: '' })).toBe('none-done');
    expect(timesheetListEmptyKind({ total: 3, visible: 0, filter: 'all', query: '#99' })).toBe('none-match');
    expect(timesheetListEmptyKind({ total: 3, visible: 2, filter: 'all', query: '' })).toBeNull();
    expect(timesheetListEmptyTitle('none')).toBe('No timesheets this week');
    expect(timesheetListEmptyMessage('none')).toContain('Clock in');
  });

  it('formats hours without going negative', () => {
    expect(timesheetListHoursLabel(90)).toBe('1h 30m');
    expect(timesheetListHoursLabel(-12)).toBe('0h 0m');
    expect(timesheetListTitle('not-a-date')).toBe('not-a-date');
  });

  it('shows elapsed hours from clock stamps when total_minutes was left at 0', () => {
    const leftover = decorateTimesheetForList(row({
      id: 'ts-clock',
      date: '2026-09-02',
      status: 'submitted',
      total_minutes: 0,
      clock_in: '2026-09-02T00:00:00.000Z',
      clock_out: '2026-09-02T01:15:00.000Z',
    }));
    expect(leftover.hoursLabel).toBe('1h 15m');
    expect(leftover.statusLabel).not.toBe('Open');
  });

  it('shows 0h 0m when clock-off was immediate and still not Open after close', () => {
    const instant = decorateTimesheetForList(row({
      id: 'ts-now',
      date: '2026-09-02',
      status: 'submitted',
      total_minutes: 0,
      clock_in: '2026-09-02T00:00:00.000Z',
      clock_out: '2026-09-02T00:00:00.000Z',
    }));
    expect(instant.hoursLabel).toBe('0h 0m');
    expect(instant.statusLabel).toBe('Submitted');
  });

  it('writes an honest list count and status pill class', () => {
    expect(timesheetListCountLabel(0)).toBe('0 timesheets · tap one to open');
    expect(timesheetListCountLabel(1)).toBe('1 timesheet · tap one to open');
    expect(timesheetListCountLabel(2)).toBe('2 timesheets · tap one to open');
    expect(timesheetListPillClass('open')).toBe('is-open');
    expect(timesheetListPillClass('submitted')).toBe('is-submitted');
    expect(timesheetListPillClass('approved')).toBe('is-approved');
    expect(timesheetListPillClass('rejected')).toBe('is-rejected');
  });

  it('does not invent Field Audit sheets outside the audit session', () => {
    expect(getAuditTimesheets()).toBeNull();
    expect(getAuditTimesheetEntries()).toBeNull();
  });

  it('look seed stamps a clocked-off interval so list hours are not 0h 0m OPEN', () => {
    const helper = readFileSync(resolve(process.cwd(), 'src/lib/timesheetsList.ts'), 'utf8');
    expect(helper).toContain('AUDIT_TIMESHEET_OPEN_ID');
    expect(helper).toContain('total_minutes: 450');
    expect(helper).toContain('TIMESHEET_CLOCK_OFF_STATUS');
    expect(helper).toContain('T07:30:00+10:00');
    expect(helper).toContain('T15:00:00+10:00');
    expect(helper).toContain("status: 'open'");
    expect(helper).not.toMatch(/\bute\b/i);
  });
});
