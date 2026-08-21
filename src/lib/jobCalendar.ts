import { COMPANY_TIME_ZONE, dateOnly, padJobNumber } from './jobReminder';

/** Company-local calendar. Perth is UTC+8 year-round — no DST. */
export const JOB_CALENDAR_TZ = COMPANY_TIME_ZONE;
export const JOB_CALENDAR_MISS = 'Needs a date on the board.';

export type CalendarJob = {
  id: string;
  title?: string | null;
  address?: string | null;
  assigned_team?: string[] | null;
  scheduled_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  job_number?: number | null;
};

export type CalendarMember = {
  id: string;
  name?: string | null;
};

export type JobCalendarOk = {
  ok: true;
  ics: string;
  filename: string;
  href: string;
  title: string;
  site: string;
  crew: string[];
};

export type JobCalendarMiss = {
  ok: false;
  reason: 'no_date';
  message: string;
};

export type JobCalendarResult = JobCalendarOk | JobCalendarMiss;

export function calendarSite(...parts: Array<string | null | undefined>): string {
  for (const part of parts) {
    const trimmed = (part ?? '').trim();
    if (trimmed) return trimmed;
  }
  return '';
}

/** Resolve assigned_team ids through the same member list the board/job already load. */
export function calendarCrewNames(
  assigned: string[] | null | undefined,
  members: CalendarMember[] | null | undefined,
): string[] {
  const list = members ?? [];
  return (assigned ?? [])
    .map(id => list.find(m => m.id === id)?.name?.trim())
    .filter((name): name is string => !!name);
}

function parseHm(value: string | null | undefined): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})/.exec((value ?? '').trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function compactDate(ymd: string): string {
  return ymd.replace(/-/g, '');
}

function localStamp(ymd: string, h: number, m: number): string {
  return `${compactDate(ymd)}T${pad2(h)}${pad2(m)}00`;
}

function utcStamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function addOneHour(ymd: string, h: number, m: number): { ymd: string; h: number; m: number } {
  if (h < 23) return { ymd, h: h + 1, m };
  const [y, month, d] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(y, month - 1, d + 1));
  return {
    ymd: `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`,
    h: 0,
    m,
  };
}

function addOneDay(ymd: string): string {
  const [y, month, d] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(y, month - 1, d + 1));
  return `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
}

function escapeIcs(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\n|\r/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** RFC 5545 line folding at 75 octets. ASCII job fields stay within char === octet. */
function foldIcs(line: string): string {
  if (line.length <= 75) return line;
  const parts = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    parts.push(` ${rest.slice(0, 74)}`);
    rest = rest.slice(74);
  }
  if (rest) parts.push(` ${rest}`);
  return parts.join('\r\n');
}

function eventTitle(job: CalendarJob): string {
  const title = (job.title ?? '').trim();
  if (title) return title;
  return job.job_number != null ? `Job #${padJobNumber(job.job_number)}` : 'Job';
}

function crewDescription(names: string[], assignedCount: number): string | null {
  if (names.length > 0) return `Crew: ${names.join(', ')}`;
  if (assignedCount > 0) return null;
  return 'Crew: Unassigned';
}

export function buildJobCalendar(
  job: CalendarJob,
  opts?: {
    site?: string | null;
    crewNames?: string[];
    members?: CalendarMember[];
    now?: Date;
  },
): JobCalendarResult {
  const day = dateOnly(job.scheduled_date);
  if (!day) {
    return { ok: false, reason: 'no_date', message: JOB_CALENDAR_MISS };
  }

  const title = eventTitle(job);
  const site = calendarSite(opts?.site, job.address);
  const crew = opts?.crewNames ?? calendarCrewNames(job.assigned_team, opts?.members);
  const start = parseHm(job.start_time);
  const end = parseHm(job.end_time);
  const now = opts?.now ?? new Date();
  const assignedCount = (job.assigned_team ?? []).filter(Boolean).length;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BTS Inspect//Job Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VTIMEZONE',
    `TZID:${JOB_CALENDAR_TZ}`,
    `X-LIC-LOCATION:${JOB_CALENDAR_TZ}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:AWST',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:job-${job.id}@bts-inspect`,
    `DTSTAMP:${utcStamp(now)}`,
  ];

  if (start) {
    const fallback = addOneHour(day, start.h, start.m);
    const endDay = end ? day : fallback.ymd;
    const endH = end ? end.h : fallback.h;
    const endM = end ? end.m : fallback.m;
    lines.push(`DTSTART;TZID=${JOB_CALENDAR_TZ}:${localStamp(day, start.h, start.m)}`);
    lines.push(`DTEND;TZID=${JOB_CALENDAR_TZ}:${localStamp(endDay, endH, endM)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(day)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(addOneDay(day))}`);
  }

  lines.push(`SUMMARY:${escapeIcs(title)}`);
  if (site) lines.push(`LOCATION:${escapeIcs(site)}`);
  const description = crewDescription(crew, assignedCount);
  if (description) lines.push(`DESCRIPTION:${escapeIcs(description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');

  const ics = `${lines.map(foldIcs).join('\r\n')}\r\n`;
  const filename = job.job_number != null
    ? `job-${padJobNumber(job.job_number)}.ics`
    : `job-${job.id.slice(0, 8)}.ics`;
  const href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;

  return { ok: true, ics, filename, href, title, site, crew };
}

export function downloadJobCalendar(built: JobCalendarOk): void {
  const anchor = document.createElement('a');
  anchor.href = built.href;
  anchor.download = built.filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
