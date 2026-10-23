import { asTeamIds } from './dispatch';

export type NeedCrewJob = {
  status?: string | null;
  scheduled_date?: string | null;
  assigned_team?: unknown;
};

export function isFinishedCrewStatus(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'Done' || status === 'cancelled';
}

export function isNeedCrewJob(job: NeedCrewJob): boolean {
  if (!(job.scheduled_date ?? '').trim()) return false;
  if (isFinishedCrewStatus(job.status)) return false;
  return asTeamIds(job.assigned_team).filter(id => id.trim()).length === 0;
}
