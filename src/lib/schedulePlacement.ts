import { decideDispatchWrite, evaluateDispatch, newIdempotencyKey, type DispatchConflict, type DispatchRole, type DispatchSnapshot } from './dispatchResources';
import { rescheduleJobPatch, type JobDropPayload } from './dispatch';
import { DISPATCH_UNAVAILABLE, type SaveJobDispatchInput, type SaveJobDispatchResult } from './saveJobDispatch';
import type { JobWithClient } from '../types/crm';

export type PlacementSummary = {
  jobId: string;
  jobLabel: string;
  crewLabel: string;
  whenLabel: string;
  movingExisting: boolean;
  previousWhen: string | null;
};

export type PreparedPlacement = {
  input: SaveJobDispatchInput;
  conflicts: DispatchConflict[];
  summary: PlacementSummary;
  fingerprint: string;
};

export type PlacementDecision =
  | { status: 'save'; prepared: PreparedPlacement }
  | { status: 'need_override'; prepared: PreparedPlacement }
  | { status: 'need_time'; drop: JobDropPayload; job: JobWithClient; summary: PlacementSummary }
  | { status: 'member_blocked'; message: string; nextAction: string; conflicts: DispatchConflict[]; summary: PlacementSummary }
  | { status: 'hard_blocked'; message: string; conflicts: DispatchConflict[]; summary: PlacementSummary }
  | { status: 'unavailable'; message: string }
  | { status: 'missing_job'; message: string };

export function placementFingerprint(input: SaveJobDispatchInput): string {
  return [
    input.jobId,
    input.snapshot.job.scheduled_date ?? '',
    input.snapshot.job.start_time ?? '',
    input.snapshot.job.end_time ?? '',
    (input.assignedTeam ?? []).slice().sort().join(','),
    (input.overrideReason ?? '').trim(),
  ].join('|');
}

export function nextPlacementIdempotencyKey(
  previous: { fingerprint: string; key: string } | null,
  next: SaveJobDispatchInput,
): string {
  const fingerprint = placementFingerprint(next);
  if (previous && previous.fingerprint === fingerprint) return previous.key;
  return newIdempotencyKey();
}

export function isRetryableDispatchFailure(result: SaveJobDispatchResult): boolean {
  return !result.ok && (result.code === 'error' || result.code === 'stale' || result.code === 'unavailable');
}

export function memberPlacementNextAction(conflicts: DispatchConflict[]): string {
  if (conflicts.some(c => c.kind === 'hours_unknown')) {
    return 'Record hours for that person in Hours & leave, or place the job on another crew.';
  }
  if (conflicts.some(c => c.kind === 'hours_unavailable')) {
    return 'Pick another crew, or change Hours & leave if they are actually working.';
  }
  if (conflicts.some(c => c.kind === 'hours_over_window')) {
    return 'Shorten the booking to their recorded hours, or pick another crew.';
  }
  return 'Choose a compatible crew and time, or ask an admin to review it.';
}

function timeLabel(start?: string | null, end?: string | null): string {
  if (!start) return 'time not set';
  const from = start.slice(0, 5);
  const to = end ? end.slice(0, 5) : '';
  return to ? `${from}–${to}` : from;
}

export function placementSummary(args: {
  job: Pick<JobWithClient, 'id' | 'title' | 'job_number' | 'scheduled_date' | 'start_time' | 'end_time'>;
  proposed: Pick<JobWithClient, 'scheduled_date' | 'start_time' | 'end_time'>;
  crewLabel: string;
}): PlacementSummary {
  const num = args.job.job_number != null ? `#${String(args.job.job_number).padStart(4, '0')}` : 'Job';
  const title = (args.job.title ?? '').trim();
  const movingExisting = !!args.job.scheduled_date;
  return {
    jobId: args.job.id,
    jobLabel: title ? `${num} ${title}` : num,
    crewLabel: args.crewLabel,
    whenLabel: `${args.proposed.scheduled_date ?? 'no date'} · ${timeLabel(args.proposed.start_time, args.proposed.end_time)}`,
    movingExisting,
    previousWhen: movingExisting
      ? `${args.job.scheduled_date} · ${timeLabel(args.job.start_time, args.job.end_time)}`
      : null,
  };
}

export function weekDropNeedsTime(drop: JobDropPayload, currentStart: string | null | undefined): boolean {
  return !drop.startTime && !currentStart;
}

export function decideExistingJobPlacement(args: {
  job: JobWithClient | undefined;
  drop: JobDropPayload;
  role: DispatchRole;
  packMissing: boolean;
  snapshot: DispatchSnapshot | null;
  crewLabel: string;
  overrideReason?: string | null;
  idempotencyKey: string;
}): PlacementDecision {
  if (!args.job) return { status: 'missing_job', message: 'That job is not loaded. Search again and retry.' };
  if (args.packMissing || !args.snapshot) {
    return { status: 'unavailable', message: DISPATCH_UNAVAILABLE };
  }

  const patch = rescheduleJobPatch({
    assigned_team: args.job.assigned_team,
    start_time: args.job.start_time,
    end_time: args.job.end_time,
  }, args.drop);
  const proposed = {
    ...args.job,
    scheduled_date: patch.scheduled_date,
    assigned_team: patch.assigned_team ?? args.job.assigned_team,
    start_time: patch.start_time ?? args.job.start_time,
    end_time: patch.end_time === undefined ? args.job.end_time : patch.end_time,
  };
  const summary = placementSummary({
    job: args.job,
    proposed,
    crewLabel: args.crewLabel,
  });

  if (weekDropNeedsTime(args.drop, args.job.start_time)) {
    return { status: 'need_time', drop: args.drop, job: args.job, summary };
  }

  const snap: DispatchSnapshot = {
    ...args.snapshot,
    job: {
      id: proposed.id,
      status: proposed.status,
      scheduled_date: proposed.scheduled_date,
      start_time: proposed.start_time,
      end_time: proposed.end_time,
      assigned_team: proposed.assigned_team,
    },
    assignedTeam: proposed.assigned_team ?? [],
  };
  const conflicts = evaluateDispatch(snap);
  const write = decideDispatchWrite({
    role: args.role,
    conflicts,
    overrideReason: args.overrideReason,
  });
  const input: SaveJobDispatchInput = {
    jobId: args.job.id,
    expectedUpdatedAt: args.job.updated_at,
    assignedTeam: proposed.assigned_team ?? [],
    resourceIds: snap.allocations.map(a => a.resourceId),
    skillRequirements: snap.skillRequirements,
    resourceRequirements: snap.resourceRequirements,
    requiredCrewCount: snap.requiredCrewCount,
    dispatchReady: snap.dispatchReady,
    role: args.role,
    overrideReason: args.overrideReason ?? null,
    reschedule: true,
    idempotencyKey: args.idempotencyKey,
    snapshot: snap,
  };
  const prepared: PreparedPlacement = {
    input,
    conflicts,
    summary,
    fingerprint: placementFingerprint(input),
  };

  if (write.ok) return { status: 'save', prepared };
  if (write.blocker === 'override_reason_required') return { status: 'need_override', prepared };
  if (write.blocker === 'member_hard') {
    return {
      status: 'member_blocked',
      message: write.message ?? 'This assignment needs an admin.',
      nextAction: memberPlacementNextAction(conflicts),
      conflicts,
      summary,
    };
  }
  return {
    status: 'hard_blocked',
    message: write.message ?? 'Assignment blocked.',
    conflicts,
    summary,
  };
}
