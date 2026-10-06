/** Crew/schedule status copy (F2c + S8d) — three surfaces only. */

export const JOB_CREW_SCHEDULE_NEEDS_CREW = 'Needs crew';
export const JOB_CREW_SCHEDULE_BOOKED = 'Booked';
export const JOB_CREW_SCHEDULE_NOT_SCHEDULED = 'Not scheduled';

export type JobCrewScheduleKind = 'needs_crew' | 'booked' | 'not_scheduled';

export type JobCrewScheduleStatus = {
  label: string;
  kind: JobCrewScheduleKind;
};

export function jobCrewMemberCount(assignedTeam: string[] | null | undefined): number {
  return (assignedTeam ?? []).filter(id => (id ?? '').trim().length > 0).length;
}

export function jobCrewScheduleStatus(
  scheduledDate: string | null | undefined,
  assignedTeam: string[] | null | undefined,
): JobCrewScheduleStatus {
  const hasDate = !!(scheduledDate ?? '').trim();
  const crewCount = jobCrewMemberCount(assignedTeam);
  if (!hasDate) {
    return { label: JOB_CREW_SCHEDULE_NOT_SCHEDULED, kind: 'not_scheduled' };
  }
  if (crewCount > 0) {
    return { label: JOB_CREW_SCHEDULE_BOOKED, kind: 'booked' };
  }
  return { label: JOB_CREW_SCHEDULE_NEEDS_CREW, kind: 'needs_crew' };
}

export function jobCrewScheduleNeedsCrewClass(kind: JobCrewScheduleKind): string {
  return kind === 'needs_crew' ? 'hub-crew-schedule-needs' : '';
}

export type JobCrewScheduleOverviewTone = 'ok' | 'wait' | 'warn';

export function jobCrewScheduleOverviewTone(kind: JobCrewScheduleKind): JobCrewScheduleOverviewTone {
  if (kind === 'booked') return 'ok';
  if (kind === 'needs_crew') return 'warn';
  return 'wait';
}
