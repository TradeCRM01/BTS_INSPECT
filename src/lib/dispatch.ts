/** Day-board time grid (matches BoardViews). */
export const DAY_START_HOUR = 6;
export const DAY_END_HOUR = 20;
export const HOUR_WIDTH_PX = 96;
export const SNAP_MINUTES = 15;
export const DEFAULT_SLOT_MINUTES = 60;
export const DEFAULT_SLOT_START = '08:00:00';
export type ResizeEdge = 'start' | 'end';

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
): { start_time: string; end_time: string } {
  const startM = timeToMinutes(currentStart);
  const endM = timeToMinutes(currentEnd);
  const nextStart = timeToMinutes(newStart) ?? startM ?? DAY_START_HOUR * 60;
  const duration =
    startM != null && endM != null && endM > startM
      ? endM - startM
      : DEFAULT_SLOT_MINUTES;
  return {
    start_time: minutesToTime(nextStart),
    end_time: minutesToTime(nextStart + duration),
  };
}

export function resizeJobTimes(
  start: string,
  end: string | null | undefined,
  edge: ResizeEdge,
  pointerMinutes: number,
  opts?: { minMinutes?: number; dayStart?: number; dayEnd?: number; snapMinutes?: number },
): { start_time: string; end_time: string } {
  const snap = opts?.snapMinutes ?? SNAP_MINUTES;
  const minDur = opts?.minMinutes ?? SNAP_MINUTES;
  const dayStart = (opts?.dayStart ?? DAY_START_HOUR) * 60;
  const dayEnd = (opts?.dayEnd ?? DAY_END_HOUR) * 60;
  let startM = timeToMinutes(start) ?? dayStart;
  let endM = timeToMinutes(end) ?? startM + DEFAULT_SLOT_MINUTES;
  const snapped = Math.round(pointerMinutes / snap) * snap;
  const pointer = Math.min(dayEnd, Math.max(dayStart, snapped));
  if (edge === 'start') {
    startM = Math.min(pointer, endM - minDur);
    startM = Math.max(dayStart, startM);
  } else {
    endM = Math.max(pointer, startM + minDur);
    endM = Math.min(dayEnd, endM);
  }
  return { start_time: minutesToTime(startM), end_time: minutesToTime(endM) };
}

export type JobDropInput = {
  date: string;
  /** undefined = leave crew; null = unassign; string = assign/add that person */
  employeeId?: string | null;
  startTime?: string;
};

export type JobDropPayload = JobDropInput & { jobId: string };

export const UNASSIGNED_ROW_ID = '__unassigned__';

export type DayRowJob = {
  id: string;
  start_time: string | null | undefined;
  end_time: string | null | undefined;
};

export type DayRowPlacement = {
  id: string;
  allDay: boolean;
  lane: number;
};

/**
 * Stack all-day jobs, then pack timed jobs into overlap lanes so they don't sit on top of each other.
 */
export function placeDayRowJobs(jobs: DayRowJob[]): {
  placements: DayRowPlacement[];
  allDayCount: number;
  timedLaneCount: number;
} {
  const allDay = jobs.filter(j => !j.start_time);
  const timed = jobs
    .filter(j => j.start_time)
    .slice()
    .sort((a, b) => (a.start_time ?? '').localeCompare(b.start_time ?? ''));

  const placements: DayRowPlacement[] = allDay.map((j, i) => ({
    id: j.id,
    allDay: true,
    lane: i,
  }));

  const laneEnds: number[] = [];
  for (const job of timed) {
    const start = timeToMinutes(job.start_time) ?? 0;
    const end = timeToMinutes(job.end_time) ?? start + 60;
    let lane = laneEnds.findIndex(e => e <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    placements.push({ id: job.id, allDay: false, lane });
  }

  return {
    placements,
    allDayCount: allDay.length,
    timedLaneCount: Math.max(laneEnds.length, timed.length > 0 ? 1 : 0),
  };
}

export function dayRowHeightPx(
  allDayCount: number,
  timedLaneCount: number,
  opts?: { min?: number; allDayH?: number; timedH?: number; pad?: number },
): number {
  const min = opts?.min ?? 72;
  const allDayH = opts?.allDayH ?? 22;
  const timedH = opts?.timedH ?? 48;
  const pad = opts?.pad ?? 6;
  const timed = Math.max(timedLaneCount, allDayCount > 0 ? 0 : 1);
  return Math.max(min, pad + allDayCount * allDayH + timed * timedH + pad);
}

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
  } else if (drop.employeeId && !current.start_time) {
    const slot = applyDropStartTime(null, null, DEFAULT_SLOT_START);
    updates.start_time = slot.start_time;
    updates.end_time = slot.end_time;
  }
  return updates;
}
