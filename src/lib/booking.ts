import { timeToMinutes } from './dispatch';

export type BookedJob = {
  id: string;
  job_number?: number | null;
  title?: string | null;
  status: string;
  scheduled_date: string | null;
  start_time: string | null;
  end_time: string | null;
  assigned_team: string[] | null;
};

/** One dated exception: a day off, or different hours on that date. */
export type StaffHours = {
  memberId: string;
  date: string;
  working: boolean;
  start?: string | null;
  end?: string | null;
  reason?: string | null;
};

export function jobBookingLabel(job: Pick<BookedJob, 'job_number' | 'title'>): string {
  const num = job.job_number != null ? `#${String(job.job_number).padStart(4, '0')}` : 'Job';
  const title = (job.title ?? '').trim();
  return title ? `${num} ${title}` : num;
}

export function isOpenBooking(job: BookedJob): boolean {
  return job.status !== 'cancelled';
}

function dateKey(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.slice(0, 10);
}

function interval(job: BookedJob): { start: number; end: number } | null {
  const start = timeToMinutes(job.start_time);
  if (start == null) return null;
  const end = timeToMinutes(job.end_time);
  return { start, end: end != null && end > start ? end : start + 60 };
}

/** Same calendar day, times overlap. Untimed jobs occupy the whole day. */
export function jobsClash(a: BookedJob, b: BookedJob): boolean {
  if (a.id === b.id) return false;
  if (!isOpenBooking(a) || !isOpenBooking(b)) return false;
  const da = dateKey(a.scheduled_date);
  const db = dateKey(b.scheduled_date);
  if (!da || !db || da !== db) return false;
  const ia = interval(a);
  const ib = interval(b);
  if (!ia || !ib) return true;
  return ia.start < ib.end && ia.end > ib.start;
}

export function sharedCrew(a: BookedJob, b: BookedJob): string[] {
  const left = new Set(a.assigned_team ?? []);
  return (b.assigned_team ?? []).filter(id => left.has(id));
}

export function crewConflictWarnings(
  proposed: BookedJob,
  others: BookedJob[],
  names: Map<string, string>,
): string[] {
  if (!dateKey(proposed.scheduled_date)) return [];
  const warnings: string[] = [];
  for (const other of others) {
    const people = sharedCrew(proposed, other);
    if (people.length === 0 || !jobsClash(proposed, other)) continue;
    const who = people.map(id => names.get(id) ?? 'Someone').join(', ');
    warnings.push(`${who} is already on ${jobBookingLabel(other)} that day.`);
  }
  return [...new Set(warnings)];
}

function hoursFor(memberId: string, date: string, hours: StaffHours[]): StaffHours | undefined {
  return hours.find(h => h.memberId === memberId && h.date === date);
}

export function hoursWarnings(
  proposed: BookedJob,
  hours: StaffHours[],
  names: Map<string, string>,
): string[] {
  const date = dateKey(proposed.scheduled_date);
  if (!date) return [];
  const slot = interval(proposed);
  const warnings: string[] = [];
  for (const memberId of proposed.assigned_team ?? []) {
    const row = hoursFor(memberId, date, hours);
    if (!row) continue;
    const name = names.get(memberId) ?? 'Someone';
    const why = row.reason?.trim() ? ` (${row.reason.trim()})` : '';
    if (!row.working) {
      warnings.push(`${name} is marked off on ${date}${why}.`);
      continue;
    }
    if (!slot || !row.start || !row.end) continue;
    const start = timeToMinutes(row.start);
    const end = timeToMinutes(row.end);
    if (start == null || end == null) continue;
    if (slot.start < start || slot.end > end) {
      warnings.push(`${name} is only available ${row.start.slice(0, 5)}–${row.end.slice(0, 5)} on ${date}${why}.`);
    }
  }
  return warnings;
}

export function bookingWarnings(
  proposed: BookedJob,
  others: BookedJob[],
  names: Map<string, string>,
  hours: StaffHours[] = [],
): string[] {
  return [...crewConflictWarnings(proposed, others, names), ...hoursWarnings(proposed, hours, names)];
}

export function clashingJobIds(jobs: BookedJob[]): Set<string> {
  const ids = new Set<string>();
  for (let i = 0; i < jobs.length; i++) {
    for (let j = i + 1; j < jobs.length; j++) {
      if (sharedCrew(jobs[i], jobs[j]).length === 0) continue;
      if (!jobsClash(jobs[i], jobs[j])) continue;
      ids.add(jobs[i].id);
      ids.add(jobs[j].id);
    }
  }
  return ids;
}

export function shouldProceedWithBooking(
  warnings: string[],
  confirmFn: (message: string) => boolean,
): boolean {
  if (warnings.length === 0) return true;
  return confirmFn(`${warnings.join('\n')}\n\nBook anyway?`);
}

export function memberNameMap(members: { id: string; name: string }[]): Map<string, string> {
  return new Map(members.map(m => [m.id, m.name]));
}

export function staffHoursFromRow(row: {
  member_id: string;
  date: string;
  working: boolean;
  start_time?: string | null;
  end_time?: string | null;
  reason?: string | null;
}): StaffHours {
  return {
    memberId: row.member_id,
    date: String(row.date).slice(0, 10),
    working: row.working,
    start: row.start_time,
    end: row.end_time,
    reason: row.reason,
  };
}

export function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || /staff_hours/i.test(error.message ?? '');
}

export const STAFF_HOURS_CONFLICT = 'company_id,member_id,date';

/** HH:MM for the time column. HTML time inputs are already this shape. */
export function clockTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1].padStart(2, '0')}:${match[2]}`;
}

/** Unique key is company_id + member_id + date. company_id must be the signed-in company. */
export function staffHoursUpsertPayload(
  companyId: string,
  row: StaffHours,
  now = new Date(),
): {
  company_id: string;
  member_id: string;
  date: string;
  working: boolean;
  start_time: string | null;
  end_time: string | null;
  reason: string | null;
  updated_at: string;
} {
  const company = companyId.trim();
  if (!company) throw new Error('No company on this session — cannot save hours.');
  if (!row.memberId) throw new Error('Pick a person.');
  const date = dateKey(row.date);
  if (!date) throw new Error('Pick a date.');
  const start = row.working ? clockTime(row.start ?? null) : null;
  const end = row.working ? clockTime(row.end ?? null) : null;
  if (row.working && (!start || !end)) throw new Error('Set start and end times.');
  return {
    company_id: company,
    member_id: row.memberId,
    date,
    working: row.working,
    start_time: start,
    end_time: end,
    reason: row.reason?.trim() || null,
    updated_at: now.toISOString(),
  };
}
