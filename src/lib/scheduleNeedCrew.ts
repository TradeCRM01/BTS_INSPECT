import { asTeamIds } from './dispatch';

export type NeedCrewJob = {
  status?: unknown;
  scheduled_date?: unknown;
  assigned_team?: unknown;
};

/** Coerce a job date. Non-strings are undated. Never throws. */
export function asDateText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Coerce a job status. Non-strings are empty. Never throws. */
export function asStatusText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function isFinishedCrewStatus(status: unknown): boolean {
  const raw = asStatusText(status);
  return raw === 'completed' || raw === 'Done' || raw === 'cancelled';
}

/** Whitespace-only and non-array assigned_team count as no crew. Never throws. */
export function crewIds(assigned: unknown): string[] {
  return asTeamIds(assigned).filter(id => id.trim());
}

export function isNeedCrewJob(job: NeedCrewJob): boolean {
  if (!asDateText(job.scheduled_date)) return false;
  if (isFinishedCrewStatus(job.status)) return false;
  return crewIds(job.assigned_team).length === 0;
}
