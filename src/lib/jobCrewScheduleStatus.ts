import { assignedTeamIds, needsCrew, scheduledDateText } from './needCrew';

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
  | 'cancelled'
  | 'unknown';

export type JobCrewScheduleStatus = {
  label: string;
  kind: JobCrewScheduleKind;
};

export function sentenceCaseStatus(status: string): string {
  const raw = status.trim().replace(/_/g, ' ');
  if (!raw) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

export function jobCrewMemberCount(assignedTeam: unknown): number {
  return assignedTeamIds(assignedTeam).length;
}

export function jobCrewScheduleStatus(
  status: string | null | undefined,
  scheduledDate: string | null | undefined,
  assignedTeam: unknown,
): JobCrewScheduleStatus {
  if (status === 'completed' || status === 'Done') {
    return { label: JOB_CREW_SCHEDULE_DONE, kind: 'done' };
  }
  if (status === 'cancelled') {
    return { label: JOB_CREW_SCHEDULE_CANCELLED, kind: 'cancelled' };
  }
  const hasDate = !!scheduledDateText(scheduledDate);
  if (!hasDate) {
    return { label: JOB_CREW_SCHEDULE_NO_DATE, kind: 'no_date' };
  }
  if (needsCrew({ status, scheduled_date: scheduledDate, assigned_team: assignedTeam })) {
    return { label: JOB_CREW_SCHEDULE_NEEDS_CREW, kind: 'needs_crew' };
  }
  if (status === 'in_progress') {
    return { label: JOB_CREW_SCHEDULE_IN_PROGRESS, kind: 'in_progress' };
  }
  if (status === 'scheduled') {
    return { label: JOB_CREW_SCHEDULE_BOOKED, kind: 'booked' };
  }
  const raw = (status ?? '').trim();
  if (!raw) {
    return { label: JOB_CREW_SCHEDULE_BOOKED, kind: 'booked' };
  }
  return { label: sentenceCaseStatus(raw), kind: 'unknown' };
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
