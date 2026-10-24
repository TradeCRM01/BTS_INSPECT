import { boardShownLabel } from './scheduleBoard';

/** Phone schedule: collapsed unscheduled chip label (all trades). */
export function phoneUnscheduledChipLabel(count: number, more = false): string {
  const n = Math.max(0, Math.floor(count));
  return `Unscheduled · ${boardShownLabel(n, more)}`;
}

/** Phone unscheduled list starts collapsed behind the count chip. */
export const PHONE_UNSCHEDULED_EXPANDED_DEFAULT = false;

/** Booked board mounts before the unscheduled chip on phone. */
export const PHONE_SCHEDULE_SECTION_ORDER = ['booked', 'unscheduled'] as const;
