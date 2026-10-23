export type CrewNeedStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | string;

export type CrewNeedJob = {
  status?: CrewNeedStatus | null;
  scheduled_date?: string | null;
  assigned_team?: unknown;
};

/** Profile ids on a job. Null, a non-array, non-strings, and whitespace-only entries are no crew. */
export function assignedTeamIds(assigned: unknown): string[] {
  if (!Array.isArray(assigned)) return [];
  return assigned.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
}

export function isFinishedCrewStatus(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'Done' || status === 'cancelled';
}

export function needsCrew(job: CrewNeedJob): boolean {
  if (!(job.scheduled_date ?? '').trim()) return false;
  if (isFinishedCrewStatus(job.status)) return false;
  return assignedTeamIds(job.assigned_team).length === 0;
}

export function countNeedsCrew(jobs: readonly CrewNeedJob[]): number {
  return jobs.filter(needsCrew).length;
}
