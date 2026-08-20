/** Day-board time grid (matches BoardViews). */
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 20;
export const HOUR_WIDTH_PX = 96;
export const SNAP_MINUTES = 15;

export type AssignmentDrop = 'unassigned' | { employeeId: string };

export function asTeamIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/**
 * Least-surprising crew change for a small AU trade board.
 *
 * - Drop on Unassigned: clear crew (caller keeps scheduled_date).
 * - Drop on a person when the job is unassigned: that person owns it.
 * - Drop on a person when it is already a crew job: add them, never replace the rest.
 * - Drop on a person already in the crew: leave the crew as-is.
 */
export function nextAssignedTeam(
  current: string[] | null | undefined,
  drop: AssignmentDrop,
): string[] {
  const crew = asTeamIds(current);
  if (drop === 'unassigned') return [];
  if (crew.length === 0) return [drop.employeeId];
  if (crew.includes(drop.employeeId)) return crew;
  return [...crew, drop.employeeId];
}

export function timeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function minutesToTime(total: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(total)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

/** Snap a pixel offset on the day grid to a start time (HH:MM:SS). */
export function startTimeFromDropOffset(
  offsetPx: number,
  opts?: { hourWidth?: number; dayStart?: number; dayEnd?: number; snapMinutes?: number },
): string {
  const hourWidth = opts?.hourWidth ?? HOUR_WIDTH_PX;
  const dayStart = opts?.dayStart ?? DAY_START_HOUR;
  const dayEnd = opts?.dayEnd ?? DAY_END_HOUR;
  const snap = opts?.snapMinutes ?? SNAP_MINUTES;
  const hoursFromStart = offsetPx / hourWidth;
  let total = Math.round((dayStart * 60 + hoursFromStart * 60) / snap) * snap;
  const minM = dayStart * 60;
  const maxM = dayEnd * 60;
  total = Math.min(maxM, Math.max(minM, total));
  return minutesToTime(total);
}

export function applyDropStartTime(
  currentStart: string | null | undefined,
  currentEnd: string | null | undefined,
  newStart: string,
): { start_time: string; end_time: string | null } {
  const startM = timeToMinutes(currentStart);
  const endM = timeToMinutes(currentEnd);
  if (startM == null || endM == null) {
    return { start_time: newStart, end_time: currentEnd ?? null };
  }
  const duration = Math.max(0, endM - startM);
  const nextStart = timeToMinutes(newStart) ?? startM;
  return {
    start_time: minutesToTime(nextStart),
    end_time: minutesToTime(nextStart + duration),
  };
}

export type JobDropInput = {
  date: string;
  /** undefined = leave crew; null = unassign; string = assign/add that person */
  employeeId?: string | null;
  startTime?: string;
};

export type JobDropPayload = JobDropInput & { jobId: string };

export function rescheduleJobPatch(
  current: {
    assigned_team: unknown;
    start_time: string | null;
    end_time: string | null;
  },
  drop: JobDropInput,
): {
  scheduled_date: string;
  assigned_team?: string[];
  start_time?: string;
  end_time?: string | null;
} {
  const updates: ReturnType<typeof rescheduleJobPatch> = {
    scheduled_date: drop.date,
  };
  if (drop.employeeId !== undefined) {
    updates.assigned_team = nextAssignedTeam(
      asTeamIds(current.assigned_team),
      drop.employeeId === null ? 'unassigned' : { employeeId: drop.employeeId },
    );
  }
  if (drop.startTime) {
    const shifted = applyDropStartTime(current.start_time, current.end_time, drop.startTime);
    updates.start_time = shifted.start_time;
    updates.end_time = shifted.end_time;
  }
  return updates;
}
