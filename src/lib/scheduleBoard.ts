import { addDays, format, startOfWeek } from 'date-fns';
import { UNASSIGNED_ROW_ID } from './dispatch';
import { formatJobRef } from './jobRef';
import { pickJobColor } from './jobColors';

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

/** Week-board chip fields — existing job columns only, no new destination. */
export type WeekBoardJob = ScheduleDayJob & {
  job_number?: number | null;
  cost_code?: string | null;
  parent_job_id?: string | null;
  parent_job_number?: number | null;
  color?: string | null;
  description?: string | null;
};

export type WeekBoardChip = {
  id: string;
  ref: string;
  description: string;
  color: string;
};

export type WeekBoardCell<T extends WeekBoardJob = WeekBoardJob> = {
  date: string;
  jobs: T[];
  chips: WeekBoardChip[];
};

export type WeekBoardRow<T extends WeekBoardJob = WeekBoardJob> = {
  crewId: string;
  crewName: string;
  cells: WeekBoardCell<T>[];
};

export const WEEK_UNASSIGNED_CREW_ID = UNASSIGNED_ROW_ID;

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

/** Parent + children of the same quote share one colour key. */
export function weekBoardFamilyKey(job: WeekBoardJob): string {
  return job.parent_job_id || job.id || '';
}

export function weekBoardChipDescription(job: WeekBoardJob): string {
  return (job.title ?? '').trim() || (job.description ?? '').trim();
}

/**
 * Chip fill: the job's own `color` first. Siblings of the same quote inherit a
 * family colour so #0042.01 and #0042.02 read as two blocks of the same job.
 */
export function weekBoardChipColor(
  job: WeekBoardJob,
  familyJobs: WeekBoardJob[] = [],
): string {
  if (job.color) return job.color;
  const key = weekBoardFamilyKey(job);
  const painted = familyJobs.find(other => (
    weekBoardFamilyKey(other) === key && !!other.color
  ));
  if (painted?.color) return painted.color;
  return pickJobColor(key || job.id || 'job');
}

export function weekBoardChip(
  job: WeekBoardJob,
  familyJobs: WeekBoardJob[] = [],
): WeekBoardChip {
  return {
    id: job.id ?? '',
    ref: formatJobRef(job),
    description: weekBoardChipDescription(job),
    color: weekBoardChipColor(job, familyJobs),
  };
}

export function jobOnCrewRow(
  assigned: string[] | null | undefined,
  crewId: string,
): boolean {
  const team = assigned ?? [];
  if (crewId === WEEK_UNASSIGNED_CREW_ID) return team.length === 0;
  return team.includes(crewId);
}

export function jobsForCrewOnDay<T extends WeekBoardJob>(
  jobs: T[],
  crewId: string,
  ymd: string,
): T[] {
  return jobsOnScheduleDay(jobs, ymd).filter(job => jobOnCrewRow(job.assigned_team, crewId));
}

export function weekBoardCrews(
  members: ScheduleCrewMember[],
  filteredIds: Set<string> = new Set(),
): ScheduleCrewMember[] {
  if (filteredIds.size === 0) return members;
  return members.filter(member => filteredIds.has(member.id));
}

/** One row per crew (plus Unassigned when dated jobs have no crew). */
export function weekBoardRows<T extends WeekBoardJob>(
  jobs: T[],
  members: ScheduleCrewMember[],
  anchor: Date,
  filteredIds: Set<string> = new Set(),
): WeekBoardRow<T>[] {
  const days = scheduleWeekDayKeys(anchor);
  const visible = filterJobsByCrew(jobs, filteredIds);
  const crews = weekBoardCrews(members, filteredIds);
  const hasUnassigned = visible.some(job => (
    !!scheduleDayKey(job.scheduled_date) && (job.assigned_team ?? []).length === 0
  ));

  const rows: ScheduleCrewMember[] = [
    ...(hasUnassigned || crews.length === 0
      ? [{ id: WEEK_UNASSIGNED_CREW_ID, name: 'Unassigned' }]
      : []),
    ...crews,
  ];

  return rows.map(crew => ({
    crewId: crew.id,
    crewName: (crew.name ?? '').trim() || (crew.id === WEEK_UNASSIGNED_CREW_ID ? 'Unassigned' : 'Crew'),
    cells: days.map(date => {
      const cellJobs = jobsForCrewOnDay(visible, crew.id, date);
      return {
        date,
        jobs: cellJobs,
        chips: cellJobs.map(job => weekBoardChip(job, visible)),
      };
    }),
  }));
}
