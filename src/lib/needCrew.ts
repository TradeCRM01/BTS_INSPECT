import { jobCrewMemberCount } from './jobCrewScheduleStatus';

export const NEED_CREW_COPY = 'need crew';

/** Isolated until P1b lands `src/lib/needCrew.ts`. Swap is a one-line import. */
export function jobNeedsCrew(job: {
  status?: string | null;
  assigned_team?: string[] | null;
}): boolean {
  const status = (job.status ?? '').trim();
  if (status === 'completed' || status === 'cancelled') return false;
  if (status !== 'scheduled' && status !== 'in_progress') return false;
  return jobCrewMemberCount(job.assigned_team) === 0;
}

export function countJobsNeedCrew<T extends {
  status?: string | null;
  assigned_team?: string[] | null;
}>(jobs: readonly T[]): number {
  return jobs.reduce((n, job) => n + (jobNeedsCrew(job) ? 1 : 0), 0);
}

export function jobsNeedCrewWhisper(count: number): string {
  return count > 0 ? `${count} ${NEED_CREW_COPY}` : '';
}

export function withNeedCrewWhisper(base: string, count: number): string {
  const extra = jobsNeedCrewWhisper(count);
  return extra ? `${base} · ${extra}` : base;
}
