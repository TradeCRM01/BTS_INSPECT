export type CrewNeedStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | string;

export type CrewNeedJob = {
  status?: CrewNeedStatus | null;
  scheduled_date?: string | null;
  assigned_team?: string[] | null;
};

export function needsCrew(job: CrewNeedJob): boolean {
  const status = job.status ?? '';
  if (status === 'completed' || status === 'cancelled') return false;
  if (status !== 'scheduled' && status !== 'in_progress') return false;
  return (job.assigned_team ?? []).every(id => !id?.trim());
}
