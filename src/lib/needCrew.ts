export type CrewNeedStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | string;

export type CrewNeedJob = {
  status?: CrewNeedStatus | null;
  scheduled_date?: string | null;
  assigned_team?: unknown;
};

export function isFinishedCrewStatus(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'Done' || status === 'cancelled';
}

/** Malformed assigned_team is no crew. Never throws. */
export function needsCrew(job: CrewNeedJob): boolean {
  if (!(job.scheduled_date ?? '').trim()) return false;
  if (isFinishedCrewStatus(job.status)) return false;
  const team = job.assigned_team;
  if (!Array.isArray(team)) return true;
  return team.every(id => typeof id !== 'string' || !id.trim());
}

export function countNeedsCrew(jobs: readonly CrewNeedJob[]): number {
  return jobs.filter(needsCrew).length;
}

export const NEED_CREW_COPY = 'need crew';

/** Isolated until P1b lands. Swap is a one-line import onto #403's helper. */
export function jobNeedsCrew(job: CrewNeedJob): boolean {
  return needsCrew({
    ...job,
    status: job.status === 'done' ? 'Done' : job.status,
  });
}

export function countJobsNeedCrew<T extends CrewNeedJob>(jobs: readonly T[]): number {
  return countNeedsCrew(jobs);
}

export function jobsNeedCrewWhisper(count: number): string {
  return count > 0 ? `${count} ${NEED_CREW_COPY}` : '';
}

export function withNeedCrewWhisper(base: string, count: number): string {
  const extra = jobsNeedCrewWhisper(count);
  return extra ? `${base} · ${extra}` : base;
}
