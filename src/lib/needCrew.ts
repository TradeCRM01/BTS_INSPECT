export type CrewNeedStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | string;

export type CrewNeedJob = {
  status?: CrewNeedStatus | null;
  scheduled_date?: string | null;
  assigned_team?: string[] | null;
};

export function isFinishedCrewStatus(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'Done' || status === 'cancelled';
}

export function needsCrew(job: CrewNeedJob): boolean {
  if (!(job.scheduled_date ?? '').trim()) return false;
  if (isFinishedCrewStatus(job.status)) return false;
  return (job.assigned_team ?? []).every(id => !id?.trim());
}

export function countNeedsCrew(jobs: readonly CrewNeedJob[]): number {
  return jobs.filter(needsCrew).length;
}
