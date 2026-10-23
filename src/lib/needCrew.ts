export type CrewNeedStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | string;

export type CrewNeedJob = {
  status?: CrewNeedStatus | null;
  scheduled_date?: unknown;
  assigned_team?: unknown;
};

/** Profile ids on a job. Null, a non-array, non-strings, and whitespace-only entries are no crew. */
export function assignedTeamIds(assigned: unknown): string[] {
  if (!Array.isArray(assigned)) return [];
  return assigned.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
}

/** A scheduled day is a non-empty trimmed string. Anything else is no date. */
export function scheduledDateText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isFinishedCrewStatus(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'Done' || status === 'cancelled';
}

export function needsCrew(job: CrewNeedJob | null | undefined): boolean {
  if (job == null) return false;
  if (!scheduledDateText(job.scheduled_date)) return false;
  if (isFinishedCrewStatus(job.status)) return false;
  return assignedTeamIds(job.assigned_team).length === 0;
}

export function countNeedsCrew(
  jobs: readonly unknown[] | null | undefined | string | number | object,
): number {
  if (!Array.isArray(jobs)) return 0;
  return (jobs as readonly (CrewNeedJob | null | undefined)[]).filter(needsCrew).length;
}

export const NEED_CREW_COPY = 'need crew';

<<<<<<< HEAD
/** Isolated until P1b lands. Swap is a one-line import onto #403's helper. */
export function jobNeedsCrew(job: CrewNeedJob | null | undefined): boolean {
  if (!job) return false;
  return needsCrew({
    ...job,
    status: job.status === 'done' ? 'Done' : job.status,
  });
}

export function countJobsNeedCrew(
  jobs: readonly unknown[] | null | undefined | string | number | object,
): number {
  return countNeedsCrew(jobs);
=======
/** Isolated until P1b lands `src/lib/needCrew.ts`. Swap is a one-line import. */
export function jobNeedsCrew(job: {
  status?: string | null;
  assigned_team?: string[] | null;
  scheduled_date?: string | null;
}): boolean {
  const status = (job.status ?? '').trim().toLowerCase();
  if (status === 'completed' || status === 'cancelled' || status === 'done') return false;
  if (!(job.scheduled_date ?? '').trim()) return false;
  return jobCrewMemberCount(job.assigned_team) === 0;
}

export function countJobsNeedCrew<T extends {
  status?: string | null;
  assigned_team?: string[] | null;
  scheduled_date?: string | null;
}>(jobs: readonly T[]): number {
  return jobs.reduce((n, job) => n + (jobNeedsCrew(job) ? 1 : 0), 0);
>>>>>>> a687535e (fix(jobs): P3 r3 real-mount kills, need-crew date, look gate)
}

export function jobsNeedCrewWhisper(count: number): string {
  return count > 0 ? `${count} ${NEED_CREW_COPY}` : '';
}

export function withNeedCrewWhisper(base: string, count: number): string {
  const extra = jobsNeedCrewWhisper(count);
  return extra ? `${base} · ${extra}` : base;
}
