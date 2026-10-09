/** Phone schedule: collapsed unscheduled chip label (all trades). */
export function phoneUnscheduledChipLabel(count: number): string {
  const n = Math.max(0, Math.floor(count));
  return `Unscheduled · ${n}`;
}

/** Phone unscheduled list starts collapsed behind the count chip. */
export const PHONE_UNSCHEDULED_EXPANDED_DEFAULT = false;

/** Booked board mounts before the unscheduled chip on phone. */
export const PHONE_SCHEDULE_SECTION_ORDER = ['booked', 'unscheduled'] as const;
