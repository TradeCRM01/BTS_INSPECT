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
