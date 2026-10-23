import { needsCrew } from './needCrew';

export const JOB_CREW_SCHEDULE_NEEDS_CREW = 'Needs crew';
export const JOB_CREW_SCHEDULE_BOOKED = 'Booked';
export const JOB_CREW_SCHEDULE_NO_DATE = 'No date';
export const JOB_CREW_SCHEDULE_IN_PROGRESS = 'In progress';
export const JOB_CREW_SCHEDULE_DONE = 'Done';
export const JOB_CREW_SCHEDULE_CANCELLED = 'Cancelled';

export type JobCrewScheduleKind =
  | 'needs_crew'
  | 'booked'
  | 'no_date'
  | 'in_progress'
  | 'done'
  | 'cancelled';

export type JobCrewScheduleStatus = {
  label: string;
  kind: JobCrewScheduleKind;
};

export function jobCrewMemberCount(assignedTeam: string[] | null | undefined): number {
  return (assignedTeam ?? []).filter(id => (id ?? '').trim().length > 0).length;
}

export function jobCrewScheduleStatus(
  status: string | null | undefined,
  scheduledDate: string | null | undefined,
  assignedTeam: string[] | null | undefined,
): JobCrewScheduleStatus {
  if (status === 'completed') {
    return { label: JOB_CREW_SCHEDULE_DONE, kind: 'done' };
  }
  if (status === 'cancelled') {
    return { label: JOB_CREW_SCHEDULE_CANCELLED, kind: 'cancelled' };
  }
  const hasDate = !!(scheduledDate ?? '').trim();
  if (!hasDate) {
    return { label: JOB_CREW_SCHEDULE_NO_DATE, kind: 'no_date' };
  }
  if (needsCrew({ status, scheduled_date: scheduledDate, assigned_team: assignedTeam })) {
    return { label: JOB_CREW_SCHEDULE_NEEDS_CREW, kind: 'needs_crew' };
  }
  if (status === 'in_progress') {
    return { label: JOB_CREW_SCHEDULE_IN_PROGRESS, kind: 'in_progress' };
  }
  return { label: JOB_CREW_SCHEDULE_BOOKED, kind: 'booked' };
}

export function jobCrewScheduleNeedsCrewClass(kind: JobCrewScheduleKind): string {
  return kind === 'needs_crew' ? 'hub-crew-schedule-needs' : '';
}

export type JobCrewScheduleOverviewTone = 'ok' | 'wait' | 'warn';

export function jobCrewScheduleOverviewTone(kind: JobCrewScheduleKind): JobCrewScheduleOverviewTone {
  if (kind === 'booked' || kind === 'done') return 'ok';
  if (kind === 'needs_crew') return 'warn';
  return 'wait';
}
