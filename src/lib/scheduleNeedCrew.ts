import { asTeamIds } from './dispatch';

export type NeedCrewJob = {
  status?: string | null;
  scheduled_date?: string | null;
  assigned_team?: unknown;
};

export function isFinishedCrewStatus(status: string | null | undefined): boolean {
  return status === 'completed' || status === 'Done' || status === 'cancelled';
}

/** Whitespace-only and non-array assigned_team count as no crew. Never throws. */
export function crewIds(assigned: unknown): string[] {
  return asTeamIds(assigned).filter(id => id.trim());
}

export function isNeedCrewJob(job: NeedCrewJob): boolean {
  if (!(job.scheduled_date ?? '').trim()) return false;
  if (isFinishedCrewStatus(job.status)) return false;
  return crewIds(job.assigned_team).length === 0;
}
