import { addDays, format, parseISO, startOfWeek } from 'date-fns';
import { DEV_AUDIT_COMPANY, DEV_AUDIT_PROFILE, isDevFieldAuditAuth } from './devFieldAuditAuth';
import { AUDIT_DOC_JOB_ID } from './devFieldAuditDocs';
import { padJobNumber } from './jobRef';
import type { Timesheet, TimesheetEntry } from '../types/fsm';
import {
  TIMESHEET_CLOCK_OFF_STATUS,
  buildTimesheetClockOnUpdate,
  entryMinutes,
  localDateIso,
  planTimesheetClockOff,
  timesheetWorkedMinutes,
} from './timesheetJob';

export {
  TIMESHEET_CLOCK_OFF_STATUS,
  buildTimesheetClockOnUpdate,
  localDateIso,
  planTimesheetClockOff,
  timesheetWorkedMinutes,
};

/** Default /timesheets floor: this week’s sheets so a sparkie can see and open one. */
export type TimesheetListFilter = 'all' | 'open' | 'done';

export type TimesheetListBucket = 'open' | 'done';

export type TimesheetListEmptyKind = 'none' | 'none-open' | 'none-done' | 'none-match';

export const TIMESHEET_LIST_DEFAULT_FILTER: TimesheetListFilter = 'all';

export const TIMESHEET_LIST_FILTERS: Array<{ value: TimesheetListFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'done', label: 'Submitted' },
];

export const TIMESHEET_LIST_STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
};

export type TimesheetListRow = {
  id: string;
  employee_id: string;
  date: string;
  status: string;
  total_minutes: number;
  clock_in?: string | null;
  clock_out?: string | null;
  employee_name?: string | null;
  job_titles?: string[];
  job_numbers?: Array<number | null>;
  entry_minutes?: number;
};

export type TimesheetListFloorItem<T extends TimesheetListRow = TimesheetListRow> = {
  row: T;
  href: string;
  bucket: TimesheetListBucket;
  title: string;
  hoursLabel: string;
  statusLabel: string;
  jobLine: string | null;
};

/** Existing path only — open a timesheet on /timesheets, no payroll route. */
export function timesheetListOpenHref(id: string, job?: string | null): string {
  const params = new URLSearchParams();
  params.set('id', id);
  const jobId = (job ?? '').trim();
  if (jobId) params.set('job', jobId);
  return `/timesheets?${params.toString()}`;
}

export function timesheetListOpenId(raw: string | null | undefined): string | null {
  const id = (raw ?? '').trim();
  return id || null;
}

export function timesheetListBucket(status: string): TimesheetListBucket {
  return status === 'submitted' || status === 'approved' ? 'done' : 'open';
}

export function timesheetListMatchesFilter(status: string, filter: TimesheetListFilter): boolean {
  if (filter === 'all') return true;
  return timesheetListBucket(status) === (filter === 'done' ? 'done' : 'open');
}

export function timesheetListNormalizeQuery(raw: string): string {
  return raw.replace(/^#+/, '').trim().toLowerCase();
}

export function timesheetListJobRef(jobNumber: number | null | undefined): string | null {
  if (jobNumber == null || !Number.isFinite(jobNumber)) return null;
  return `#${padJobNumber(jobNumber)}`;
}

export function timesheetListHoursLabel(minutes: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${h}h ${m}m`;
}

export function timesheetListTitle(date: string): string {
  const parsed = parseISO(date);
  if (Number.isNaN(parsed.getTime())) return (date ?? '').trim() || 'Timesheet';
  return format(parsed, 'EEE d MMM');
}

export function timesheetListJobLine(row: Pick<TimesheetListRow, 'job_titles' | 'job_numbers'>): string | null {
  const refs = (row.job_numbers ?? [])
    .map(n => timesheetListJobRef(n))
    .filter((ref): ref is string => !!ref);
  const titles = (row.job_titles ?? []).map(title => title.trim()).filter(Boolean);
  const first = [refs[0], titles[0]].filter(Boolean).join(' ').trim();
  const extra = Math.max(refs.length, titles.length) - (first ? 1 : 0);
  if (!first && extra <= 0) return null;
  if (!first) return extra === 1 ? '1 job' : `${extra} jobs`;
  if (extra > 0) return `${first} · ${extra + 1} jobs`;
  return first;
}

export function timesheetListSearchBits(row: TimesheetListRow): string[] {
  const bits: string[] = [];
  const push = (value: string | null | undefined) => {
    const trimmed = (value ?? '').trim();
    if (trimmed) bits.push(trimmed);
  };
  push(row.date);
  push(timesheetListTitle(row.date));
  push(row.status);
  push(TIMESHEET_LIST_STATUS_LABELS[row.status]);
  push(row.employee_name);
  push(timesheetListHoursLabel(timesheetListWorkedMinutes(row)));
  for (const title of row.job_titles ?? []) push(title);
  for (const n of row.job_numbers ?? []) {
    const ref = timesheetListJobRef(n);
    if (n != null) {
      bits.push(String(n));
      if (ref) bits.push(ref, padJobNumber(n));
    }
  }
  return bits;
}

export function timesheetListSearchHaystack(row: TimesheetListRow): string {
  return timesheetListSearchBits(row).join(' ').toLowerCase();
}

export function timesheetListMatchesQuery(row: TimesheetListRow, raw: string): boolean {
  const needle = timesheetListNormalizeQuery(raw);
  if (!needle) return true;
  return timesheetListSearchHaystack(row).includes(needle);
}

export function timesheetListWorkedMinutes(
  row: Pick<TimesheetListRow, 'total_minutes' | 'clock_in' | 'clock_out' | 'entry_minutes'>,
): number {
  return timesheetWorkedMinutes({
    totalMinutes: row.total_minutes,
    clockIn: row.clock_in,
    clockOut: row.clock_out,
    entryMinutes: row.entry_minutes,
  });
}

export function timesheetListAttachJobs<T extends { id: string }>(
  row: T,
  entries: Array<{ timesheet_id: string; job_id?: string | null; start_time?: string | null; end_time?: string | null }>,
  jobs: Array<{ id: string; title?: string | null; job_number?: number | null }>,
): T & { job_titles: string[]; job_numbers: Array<number | null>; entry_minutes: number } {
  const sheetEntries = entries.filter(entry => entry.timesheet_id === row.id);
  const jobIds = [...new Set(
    sheetEntries
      .filter(entry => entry.job_id)
      .map(entry => entry.job_id as string),
  )];
  const matched = jobIds
    .map(id => jobs.find(job => job.id === id))
    .filter((job): job is { id: string; title?: string | null; job_number?: number | null } => !!job);
  return {
    ...row,
    job_titles: matched.map(job => (job.title ?? '').trim()).filter(Boolean),
    job_numbers: matched.map(job => job.job_number ?? null),
    entry_minutes: sheetEntries.reduce((sum, entry) => sum + entryMinutes(entry.start_time, entry.end_time), 0),
  };
}

export function decorateTimesheetForList<T extends TimesheetListRow>(
  row: T,
  job?: string | null,
): TimesheetListFloorItem<T> {
  return {
    row,
    href: timesheetListOpenHref(row.id, job),
    bucket: timesheetListBucket(row.status),
    title: timesheetListTitle(row.date),
    hoursLabel: timesheetListHoursLabel(timesheetListWorkedMinutes(row)),
    statusLabel: TIMESHEET_LIST_STATUS_LABELS[row.status] ?? row.status,
    jobLine: timesheetListJobLine(row),
  };
}

export function decorateTimesheetList<T extends TimesheetListRow>(
  rows: T[],
  job?: string | null,
): TimesheetListFloorItem<T>[] {
  return rows.map(row => decorateTimesheetForList(row, job));
}

export function compareTimesheetListItems(
  a: TimesheetListFloorItem,
  b: TimesheetListFloorItem,
): number {
  if (a.bucket !== b.bucket) return a.bucket === 'open' ? -1 : 1;
  const date = (b.row.date || '').localeCompare(a.row.date || '');
  if (date !== 0) return date;
  return (b.row.id || '').localeCompare(a.row.id || '');
}

export function sortTimesheetListFloor<T extends TimesheetListRow>(
  items: TimesheetListFloorItem<T>[],
): TimesheetListFloorItem<T>[] {
  return [...items].sort(compareTimesheetListItems);
}

export function filterTimesheetListFloor<T extends TimesheetListRow>(
  items: TimesheetListFloorItem<T>[],
  opts: { filter: TimesheetListFilter; query?: string },
): TimesheetListFloorItem<T>[] {
  return items.filter(item => (
    timesheetListMatchesFilter(item.row.status, opts.filter)
    && timesheetListMatchesQuery(item.row, opts.query ?? '')
  ));
}

export function timesheetListVisibleItems<T extends TimesheetListRow>(
  rows: T[],
  opts: { filter: TimesheetListFilter; query?: string; job?: string | null },
): TimesheetListFloorItem<T>[] {
  return sortTimesheetListFloor(
    filterTimesheetListFloor(decorateTimesheetList(rows, opts.job), opts),
  );
}

export function timesheetListEmptyKind(input: {
  total: number;
  visible: number;
  filter: TimesheetListFilter;
  query: string;
}): TimesheetListEmptyKind | null {
  if (input.total === 0) return 'none';
  if (input.visible > 0) return null;
  if (timesheetListNormalizeQuery(input.query)) return 'none-match';
  if (input.filter === 'open') return 'none-open';
  if (input.filter === 'done') return 'none-done';
  return 'none-match';
}

export function timesheetListEmptyTitle(kind: TimesheetListEmptyKind): string {
  if (kind === 'none-open') return 'No open timesheets';
  if (kind === 'none-done') return 'No submitted timesheets';
  if (kind === 'none-match') return 'No matching timesheets';
  return 'No timesheets this week';
}

export function timesheetListEmptyMessage(kind: TimesheetListEmptyKind): string {
  if (kind === 'none-open') return 'Submitted sheets sit under All. Open one from there, or clock in to start today.';
  if (kind === 'none-done') return 'Open sheets stay under Open until you submit them.';
  if (kind === 'none-match') return 'Try another job, date, or #.';
  return 'Clock in or add an entry to start a timesheet, then open it from this list.';
}

export function timesheetListWeekStart(date: string, now = new Date()): Date {
  const parsed = parseISO(date);
  const day = Number.isNaN(parsed.getTime()) ? now : parsed;
  return startOfWeek(day, { weekStartsOn: 1 });
}

export function timesheetListOpened<T extends { id: string }>(
  rows: T[],
  openId: string | null,
): T | null {
  if (!openId) return null;
  return rows.find(row => row.id === openId) ?? null;
}

export function timesheetListCountLabel(count: number): string {
  const n = Math.max(0, Math.round(Number.isFinite(count) ? count : 0));
  return n === 1 ? '1 timesheet · tap one to open' : `${n} timesheets · tap one to open`;
}

export function timesheetListPillClass(status: string): string {
  if (status === 'submitted') return 'is-submitted';
  if (status === 'approved') return 'is-approved';
  if (status === 'rejected') return 'is-rejected';
  return 'is-open';
}

/** Field Audit only — this week’s clocked-off sheet plus one OPEN running row. Not live rows. */
export const AUDIT_TIMESHEET_ID = 'audit-timesheet-week';
export const AUDIT_TIMESHEET_ENTRY_ID = 'audit-timesheet-entry';
export const AUDIT_TIMESHEET_OPEN_ID = 'audit-timesheet-open';
export const AUDIT_TIMESHEET_OPEN_ENTRY_ID = 'audit-timesheet-open-entry';

function auditTimesheetLookDates(now: Date): { closedDate: string; openDate: string } {
  const today = localDateIso(now);
  const weekStart = timesheetListWeekStart(today, now);
  const monday = format(weekStart, 'yyyy-MM-dd');
  return {
    closedDate: today,
    openDate: monday === today ? format(addDays(weekStart, 1), 'yyyy-MM-dd') : monday,
  };
}

export function getAuditTimesheets(now = new Date()): Timesheet[] | null {
  if (!isDevFieldAuditAuth()) return null;
  const { closedDate, openDate } = auditTimesheetLookDates(now);
  return [{
    id: AUDIT_TIMESHEET_ID,
    company_id: DEV_AUDIT_COMPANY.id,
    employee_id: DEV_AUDIT_PROFILE.id,
    date: closedDate,
    clock_in: `${closedDate}T07:30:00+10:00`,
    clock_out: `${closedDate}T15:00:00+10:00`,
    break_minutes: 30,
    total_minutes: 450,
    status: TIMESHEET_CLOCK_OFF_STATUS,
    notes: null,
    created_at: `${closedDate}T07:30:00+10:00`,
    updated_at: `${closedDate}T15:00:00+10:00`,
  }, {
    id: AUDIT_TIMESHEET_OPEN_ID,
    company_id: DEV_AUDIT_COMPANY.id,
    employee_id: DEV_AUDIT_PROFILE.id,
    date: openDate,
    clock_in: `${openDate}T07:30:00+10:00`,
    clock_out: null,
    break_minutes: 0,
    total_minutes: 0,
    status: 'open',
    notes: null,
    created_at: `${openDate}T07:30:00+10:00`,
    updated_at: `${openDate}T07:30:00+10:00`,
  }];
}

export function getAuditTimesheetEntries(now = new Date()): TimesheetEntry[] | null {
  if (!isDevFieldAuditAuth()) return null;
  const { closedDate, openDate } = auditTimesheetLookDates(now);
  return [{
    id: AUDIT_TIMESHEET_ENTRY_ID,
    timesheet_id: AUDIT_TIMESHEET_ID,
    company_id: DEV_AUDIT_COMPANY.id,
    job_id: AUDIT_DOC_JOB_ID,
    start_time: `${closedDate}T07:30:00+10:00`,
    end_time: `${closedDate}T15:00:00+10:00`,
    work_type: 'Site work',
    billable: true,
    notes: null,
    created_at: `${closedDate}T07:30:00+10:00`,
  }, {
    id: AUDIT_TIMESHEET_OPEN_ENTRY_ID,
    timesheet_id: AUDIT_TIMESHEET_OPEN_ID,
    company_id: DEV_AUDIT_COMPANY.id,
    job_id: AUDIT_DOC_JOB_ID,
    start_time: `${openDate}T07:30:00+10:00`,
    end_time: null,
    work_type: 'Site work',
    billable: true,
    notes: null,
    created_at: `${openDate}T07:30:00+10:00`,
  }];
}
