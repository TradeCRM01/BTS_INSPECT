import { asTeamIds } from './dispatch';

export type NeedCrewJob = {
  status?: string | null;
  assigned_team?: unknown;
};

/** Isolated so P1b `src/lib/needCrew.ts` can replace this import in one line. */
export function isNeedCrewJob(job: NeedCrewJob): boolean {
  const status = job.status ?? '';
  if (status === 'completed' || status === 'cancelled') return false;
  if (asTeamIds(job.assigned_team).length > 0) return false;
  return status === 'scheduled' || status === 'in_progress';
}
