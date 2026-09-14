import { supabase } from './supabase';
import {
  decideDispatchWrite,
  dispatchEventKind,
  evaluateDispatch,
  newIdempotencyKey,
  type DispatchConflict,
  type DispatchRole,
  type DispatchSnapshot,
} from './dispatchResources';

export type SaveJobDispatchInput = {
  jobId: string;
  expectedUpdatedAt: string;
  assignedTeam: string[];
  resourceIds: string[];
  skillRequirements: Array<{ skillId: string; minHolders?: number }>;
  resourceRequirements: Array<{ resourceId?: string | null; category?: string | null; quantity?: number }>;
  requiredCrewCount: number;
  dispatchReady: boolean;
  role: DispatchRole;
  overrideReason?: string | null;
  reschedule?: boolean;
  idempotencyKey?: string;
  snapshot: DispatchSnapshot;
};

export type SaveJobDispatchResult =
  | { ok: true; updatedAt: string; dispatchVersion: number; eventId: string; overridden: boolean; replayed?: boolean }
  | { ok: false; code: 'blocked' | 'stale' | 'tenant' | 'error'; message: string; conflicts: DispatchConflict[] };

export function buildDispatchPayload(input: SaveJobDispatchInput, write: { overridden: boolean }): Record<string, unknown> {
  const conflicts = evaluateDispatch({
    ...input.snapshot,
    assignedTeam: input.assignedTeam,
    dispatchReady: input.dispatchReady,
    requiredCrewCount: input.requiredCrewCount,
    skillRequirements: input.skillRequirements,
    resourceRequirements: input.resourceRequirements,
    allocations: input.resourceIds.map(resourceId => ({ jobId: input.jobId, resourceId })),
  });
  return {
    job_id: input.jobId,
    expected_updated_at: input.expectedUpdatedAt,
    assigned_team: input.assignedTeam,
    resource_ids: input.resourceIds,
    skill_requirements: input.skillRequirements.map(s => ({
      skill_id: s.skillId,
      min_holders: s.minHolders ?? 1,
    })),
    resource_requirements: input.resourceRequirements.map(r => ({
      resource_id: r.resourceId ?? null,
      category: r.category ?? null,
      quantity: r.quantity ?? 1,
    })),
    required_crew_count: input.requiredCrewCount,
    dispatch_ready: input.dispatchReady,
    scheduled_date: input.snapshot.job.scheduled_date,
    start_time: input.snapshot.job.start_time,
    end_time: input.snapshot.job.end_time,
    override_reason: input.overrideReason ?? null,
    overridden: write.overridden,
    event_kind: dispatchEventKind(write.overridden, !!input.reschedule),
    idempotency_key: input.idempotencyKey ?? newIdempotencyKey(),
    conflicts: conflicts.map(c => ({ kind: c.kind, severity: c.severity, message: c.message })),
  };
}

export function parseDispatchBlocked(details?: string | null): {
  code: string;
  message: string;
  conflicts: DispatchConflict[];
} | null {
  if (!details) return null;
  try {
    const parsed = JSON.parse(details) as {
      code?: string;
      conflicts?: Array<{ kind?: string; severity?: string; message?: string; overridable?: boolean }>;
    };
    const conflicts = (parsed.conflicts ?? []).map(c => ({
      kind: (c.kind ?? 'missing_qualification') as DispatchConflict['kind'],
      severity: (c.severity === 'soft' ? 'soft' : 'hard') as DispatchConflict['severity'],
      message: c.message ?? 'Assignment blocked.',
      overridable: !!c.overridable,
    }));
    return {
      code: parsed.code ?? 'dispatch_blocked',
      message: conflicts[0]?.message ?? 'Assignment blocked.',
      conflicts,
    };
  } catch {
    return null;
  }
}

export function mapDispatchRpcError(error: { message?: string; code?: string; details?: string }): {
  ok: false;
  code: 'blocked' | 'stale' | 'tenant' | 'error';
  message: string;
  conflicts?: DispatchConflict[];
} {
  const text = error.message ?? '';
  const blocked = parseDispatchBlocked(error.details);
  if (/dispatch_blocked/i.test(text) || blocked) {
    return {
      ok: false,
      code: 'blocked',
      message: blocked?.message ?? 'Assignment blocked.',
      conflicts: blocked?.conflicts,
    };
  }
  if (/stale_dispatch/i.test(text) || error.code === '40001') {
    return { ok: false, code: 'stale', message: 'Someone else just changed this job. Refresh and try again.' };
  }
  if (/tenant_mismatch/i.test(text)) {
    return { ok: false, code: 'tenant', message: 'That job is not in this company.' };
  }
  if (/override_forbidden/i.test(text)) {
    return { ok: false, code: 'blocked', message: 'A member can only save a compatible assignment.' };
  }
  if (/override_reason_required/i.test(text)) {
    return { ok: false, code: 'blocked', message: 'Admin override needs a reason.' };
  }
  return { ok: false, code: 'error', message: text || 'Could not save dispatch.' };
}

export async function saveJobDispatch(input: SaveJobDispatchInput): Promise<SaveJobDispatchResult> {
  const nextSnap: DispatchSnapshot = {
    ...input.snapshot,
    assignedTeam: input.assignedTeam,
    dispatchReady: input.dispatchReady,
    requiredCrewCount: input.requiredCrewCount,
    skillRequirements: input.skillRequirements,
    resourceRequirements: input.resourceRequirements,
    allocations: input.resourceIds.map(resourceId => ({ jobId: input.jobId, resourceId })),
    job: { ...input.snapshot.job, assigned_team: input.assignedTeam },
  };
  const conflicts = evaluateDispatch(nextSnap);
  const write = decideDispatchWrite({
    role: input.role,
    conflicts,
    overrideReason: input.overrideReason,
  });
  if (!write.ok) {
    return { ok: false, code: 'blocked', message: write.message ?? 'Assignment blocked.', conflicts };
  }
  const payload = buildDispatchPayload(input, { overridden: write.overridden });
  const { data, error } = await supabase.rpc('save_job_dispatch', { p: payload });
  if (error) {
    const mapped = mapDispatchRpcError(error);
    return { ...mapped, conflicts: mapped.conflicts ?? conflicts };
  }
  const row = data as { updated_at?: string; dispatch_version?: number; event_id?: string; replayed?: boolean };
  return {
    ok: true,
    updatedAt: String(row.updated_at ?? input.expectedUpdatedAt),
    dispatchVersion: Number(row.dispatch_version ?? 0),
    eventId: String(row.event_id ?? ''),
    overridden: write.overridden,
    replayed: !!row.replayed,
  };
}
