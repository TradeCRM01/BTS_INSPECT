import { describe, expect, it } from 'vitest';
import { evaluateDispatch, type DispatchSnapshot } from './dispatchResources';
import {
  decideExistingJobPlacement,
  draftFromJobDrop,
  isRetryableDispatchFailure,
  memberPlacementNextAction,
  nextPlacementIdempotencyKey,
  placementFingerprint,
  weekDropNeedsTime,
} from './schedulePlacement';
import type { JobWithClient } from '../types/crm';

function job(over: Partial<JobWithClient> = {}): JobWithClient {
  return {
    id: 'job-1',
    company_id: 'co',
    client_id: null,
    title: 'Switchboard',
    description: null,
    status: 'scheduled',
    priority: 'medium',
    scheduled_date: null,
    start_time: null,
    end_time: null,
    address: null,
    assigned_team: [],
    inspection_id: null,
    created_by: 'u',
    created_at: '2026-09-18T00:00:00.000Z',
    updated_at: '2026-09-18T00:00:00.000Z',
    job_number: 12,
    color: null,
    budget: null,
    parent_job_id: null,
    ...over,
  } as JobWithClient;
}

function snap(over: Partial<DispatchSnapshot> = {}): DispatchSnapshot {
  return {
    job: {
      id: 'job-1',
      status: 'scheduled',
      scheduled_date: '2026-09-21',
      start_time: '08:00:00',
      end_time: '09:00:00',
      assigned_team: ['alice'],
    },
    dispatchReady: false,
    requiredCrewCount: 0,
    assignedTeam: ['alice'],
    skillRequirements: [],
    resourceRequirements: [],
    allocations: [],
    skills: [],
    qualifications: [],
    resources: [],
    siblingJobs: [],
    siblingAllocations: [],
    hours: [],
    names: new Map([['alice', 'Alice']]),
    today: '2026-09-18',
    ...over,
  };
}

describe('existing-job placement decisions', () => {
  it('asks an admin for a reason instead of saving hours_unknown', () => {
    const decision = decideExistingJobPlacement({
      job: job(),
      drop: { jobId: 'job-1', date: '2026-09-21', employeeId: 'alice', startTime: '08:00:00' },
      role: 'admin',
      packMissing: false,
      snapshot: snap(),
      crewLabel: 'Alice',
      idempotencyKey: 'key-1',
    });
    expect(decision.status).toBe('need_override');
    if (decision.status !== 'need_override') return;
    expect(decision.prepared.conflicts.some(c => c.kind === 'hours_unknown')).toBe(true);
    expect(decision.prepared.input.overrideReason).toBeFalsy();
  });

  it('saves once the admin reason is on the same placement', () => {
    const decision = decideExistingJobPlacement({
      job: job(),
      drop: { jobId: 'job-1', date: '2026-09-21', employeeId: 'alice', startTime: '08:00:00' },
      role: 'admin',
      packMissing: false,
      snapshot: snap(),
      crewLabel: 'Alice',
      overrideReason: 'Usual Monday pattern',
      idempotencyKey: 'key-1',
    });
    expect(decision.status).toBe('save');
  });

  it('explains a member block and a permitted next action', () => {
    const decision = decideExistingJobPlacement({
      job: job(),
      drop: { jobId: 'job-1', date: '2026-09-21', employeeId: 'alice', startTime: '08:00:00' },
      role: 'member',
      packMissing: false,
      snapshot: snap(),
      crewLabel: 'Alice',
      idempotencyKey: 'key-1',
    });
    expect(decision.status).toBe('member_blocked');
    if (decision.status !== 'member_blocked') return;
    expect(decision.message).toMatch(/unknown/i);
    expect(decision.nextAction).toMatch(/Hours & leave/);
    expect(memberPlacementNextAction(decision.conflicts)).toMatch(/Record hours/);
  });

  it('keeps a hard crew overlap blocked', () => {
    const decision = decideExistingJobPlacement({
      job: job({ start_time: '08:00:00', end_time: '09:00:00' }),
      drop: { jobId: 'job-1', date: '2026-09-21', employeeId: 'alice', startTime: '08:00:00' },
      role: 'admin',
      packMissing: false,
      snapshot: snap({
        hours: [{ memberId: 'alice', date: '2026-09-21', working: true, start: '07:00', end: '17:00' }],
        siblingJobs: [{
          id: 'other',
          status: 'scheduled',
          scheduled_date: '2026-09-21',
          start_time: '08:00:00',
          end_time: '10:00:00',
          assigned_team: ['alice'],
        }],
      }),
      crewLabel: 'Alice',
      overrideReason: 'please',
      idempotencyKey: 'key-1',
    });
    expect(decision.status).toBe('hard_blocked');
  });

  it('rejects a zero-length interval instead of saving 09:00–09:00', () => {
    const decision = decideExistingJobPlacement({
      job: job({ start_time: '09:00:00', end_time: '09:00:00' }),
      drop: { jobId: 'job-1', date: '2026-09-10', employeeId: null, startTime: '09:00:00' },
      role: 'admin',
      packMissing: false,
      snapshot: snap(),
      crewLabel: 'Unassigned',
      times: { start_time: '09:00:00', end_time: '09:00:00' },
      idempotencyKey: 'key-1',
    });
    expect(decision.status).toBe('invalid_interval');
  });

  it('commits an explicit untimed draft without asking for a start', () => {
    const dated = job({ scheduled_date: '2026-09-10', start_time: '09:00:00', end_time: '09:00:00' });
    const draft = draftFromJobDrop(dated, { jobId: dated.id, date: '2026-09-10', employeeId: null });
    expect(draft.startTime).toBe('09:00:00');
    const decision = decideExistingJobPlacement({
      job: dated,
      drop: { jobId: dated.id, date: '2026-09-10', employeeId: null },
      role: 'admin',
      packMissing: false,
      snapshot: snap(),
      crewLabel: 'Unassigned',
      times: { start_time: null, end_time: null },
      overrideReason: 'Restore untimed test booking',
      idempotencyKey: 'key-clear',
    });
    expect(decision.status).toBe('save');
    if (decision.status !== 'save') return;
    expect(decision.prepared.input.snapshot.job.start_time).toBeNull();
    expect(decision.prepared.input.snapshot.job.end_time).toBeNull();
  });

  it('asks for time on a week drop that has none', () => {
    expect(weekDropNeedsTime({ jobId: 'job-1', date: '2026-09-21', employeeId: 'alice' }, null)).toBe(true);
    expect(weekDropNeedsTime({ jobId: 'job-1', date: '2026-09-21', employeeId: 'alice' }, '08:00:00')).toBe(false);
    const decision = decideExistingJobPlacement({
      job: job(),
      drop: { jobId: 'job-1', date: '2026-09-21', employeeId: 'alice' },
      role: 'admin',
      packMissing: false,
      snapshot: snap(),
      crewLabel: 'Alice',
      idempotencyKey: 'key-1',
    });
    expect(decision.status).toBe('need_time');
  });

  it('reuses an idempotency key only for the same placement fingerprint', () => {
    const base = {
      jobId: 'job-1',
      expectedUpdatedAt: 't',
      assignedTeam: ['alice'],
      resourceIds: [],
      skillRequirements: [],
      resourceRequirements: [],
      requiredCrewCount: 0,
      dispatchReady: false,
      role: 'admin' as const,
      reschedule: true,
      snapshot: snap(),
    };
    const a = { ...base, overrideReason: '', idempotencyKey: 'old' };
    const same = nextPlacementIdempotencyKey(
      { fingerprint: placementFingerprint(a), key: 'keep-me' },
      { ...a, idempotencyKey: 'ignored' },
    );
    expect(same).toBe('keep-me');
    const changed = nextPlacementIdempotencyKey(
      { fingerprint: placementFingerprint(a), key: 'keep-me' },
      { ...a, overrideReason: 'site open', idempotencyKey: 'ignored' },
    );
    expect(changed).not.toBe('keep-me');
  });

  it('reserves retry for lost, stale, or missing-RPC failures', () => {
    expect(isRetryableDispatchFailure({ ok: false, code: 'error', message: 'offline', conflicts: [] })).toBe(true);
    expect(isRetryableDispatchFailure({ ok: false, code: 'stale', message: 'stale', conflicts: [] })).toBe(true);
    expect(isRetryableDispatchFailure({ ok: false, code: 'unavailable', message: 'rpc', conflicts: [] })).toBe(true);
    expect(isRetryableDispatchFailure({ ok: false, code: 'blocked', message: 'Admin override needs a reason.', conflicts: [] })).toBe(false);
  });

  it('wording keeps unknown hours distinct from a recorded day off', () => {
    const unknown = evaluateDispatch(snap());
    expect(unknown.find(c => c.kind === 'hours_unknown')?.message).toMatch(/unknown/);
    expect(unknown.find(c => c.kind === 'hours_unknown')?.message).not.toMatch(/confirmed unavailability/);
    const off = evaluateDispatch(snap({
      hours: [{ memberId: 'alice', date: '2026-09-21', working: false }],
    }));
    expect(off.find(c => c.kind === 'hours_unavailable')?.message).toMatch(/confirmed unavailability/);
  });
});
