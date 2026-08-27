import { addDays, format, startOfWeek } from 'date-fns';

/** AU trade week — Monday first, matching the existing board. */
export const SCHEDULE_WEEK_STARTS_ON = 1 as const;

export type ScheduleViewMode = 'day' | 'week';

export type ScheduleDayJob = {
  id?: string;
  title?: string | null;
  scheduled_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  assigned_team?: string[] | null;
};

export type ScheduleCrewMember = {
  id: string;
  name?: string | null;
};

export type ScheduleDayColumn<T> = {
  date: string;
  jobs: T[];
};

/** Existing job sheet — do not invent another destination. */
export function scheduleJobHref(jobId: string): string {
  return `/jobs/${jobId}`;
}

export function parseScheduleView(raw: string | null | undefined): ScheduleViewMode {
  return raw === 'day' ? 'day' : 'week';
}

/** Calendar day from `jobs.scheduled_date` (date or ISO timestamp). */
export function scheduleDayKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const day = value.trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export function scheduleDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function scheduleWeekDays(anchor: Date): Date[] {
  const start = startOfWeek(anchor, { weekStartsOn: SCHEDULE_WEEK_STARTS_ON });
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function scheduleWeekDayKeys(anchor: Date): string[] {
  return scheduleWeekDays(anchor).map(scheduleDateKey);
}

export function compareScheduleJobs(a: ScheduleDayJob, b: ScheduleDayJob): number {
  const timeA = a.start_time ?? '99';
  const timeB = b.start_time ?? '99';
  if (timeA !== timeB) return timeA.localeCompare(timeB);
  return (a.title ?? '').localeCompare(b.title ?? '');
}

export function jobsOnScheduleDay<T extends ScheduleDayJob>(jobs: T[], ymd: string): T[] {
  return jobs
    .filter(job => scheduleDayKey(job.scheduled_date) === ymd)
    .sort(compareScheduleJobs);
}

export function groupJobsByScheduleDay<T extends ScheduleDayJob>(
  jobs: T[],
  dayKeys: string[],
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const key of dayKeys) map.set(key, []);
  for (const job of jobs) {
    const key = scheduleDayKey(job.scheduled_date);
    if (!key) continue;
    map.get(key)?.push(job);
  }
  for (const list of map.values()) list.sort(compareScheduleJobs);
  return map;
}

/** Seven Monday–Sunday columns for the week that contains `anchor`. */
export function scheduleWeekColumns<T extends ScheduleDayJob>(
  jobs: T[],
  anchor: Date,
): ScheduleDayColumn<T>[] {
  return scheduleWeekDayKeys(anchor).map(date => ({
    date,
    jobs: jobsOnScheduleDay(jobs, date),
  }));
}

export function jobMatchesCrewFilter(
  assigned: string[] | null | undefined,
  filteredIds: Set<string>,
): boolean {
  if (filteredIds.size === 0) return true;
  return (assigned ?? []).some(id => filteredIds.has(id));
}

export function filterJobsByCrew<T extends ScheduleDayJob>(
  jobs: T[],
  filteredIds: Set<string>,
): T[] {
  if (filteredIds.size === 0) return jobs;
  return jobs.filter(job => jobMatchesCrewFilter(job.assigned_team, filteredIds));
}

export function scheduleCrewNames(
  assigned: string[] | null | undefined,
  members: ScheduleCrewMember[] | null | undefined,
): string[] {
  const list = members ?? [];
  return (assigned ?? [])
    .map(id => list.find(member => member.id === id)?.name?.trim())
    .filter((name): name is string => !!name);
}

export function scheduleCrewLabel(
  assigned: string[] | null | undefined,
  members: ScheduleCrewMember[] | null | undefined,
): string {
  const names = scheduleCrewNames(assigned, members);
  if (names.length > 0) return names.join(', ');
  if ((assigned ?? []).filter(Boolean).length > 0) return 'Crew';
  return 'Unassigned';
}

/** 24h clock from stored `HH:MM:SS` — all-day jobs stay blank. */
export function scheduleClockLabel(
  start: string | null | undefined,
  end?: string | null,
): string | null {
  if (!start) return null;
  const from = start.slice(0, 5);
  if (!from) return null;
  const to = end?.slice(0, 5);
  return to ? `${from} – ${to}` : from;
}
