import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { rpc, from } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock('./supabase', () => ({
  supabase: { rpc, from },
}));

import {
  DISPATCH_UNAVAILABLE,
  isDispatchRpcUnavailable,
  mapDispatchRpcError,
  nextIdempotencyKeyAfterResult,
  saveJobDispatch,
  type SaveJobDispatchInput,
} from './saveJobDispatch';
import type { DispatchSnapshot } from './dispatchResources';

const workingHours = [{ memberId: 'alice', date: '2026-09-14', working: true, start: '07:00', end: '17:00' }];

const baseSnap: DispatchSnapshot = {
  job: {
    id: 'job-1',
    status: 'scheduled',
    scheduled_date: '2026-09-14',
    start_time: '09:00:00',
    end_time: '11:00:00',
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
  hours: workingHours,
  names: new Map([['alice', 'Alice']]),
  today: '2026-09-14',
};

function input(over: Partial<SaveJobDispatchInput> = {}, snap: DispatchSnapshot = baseSnap): SaveJobDispatchInput {
  return {
    jobId: 'job-1',
    expectedUpdatedAt: '2026-09-14T00:00:00.000Z',
    assignedTeam: ['alice'],
    resourceIds: [],
    skillRequirements: [],
    resourceRequirements: [],
    requiredCrewCount: 0,
    dispatchReady: false,
    role: 'member',
    idempotencyKey: 'retry-key-keep-0001',
    snapshot: snap,
    ...over,
  };
}

beforeEach(() => {
  rpc.mockReset();
  from.mockReset();
  Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: true });
});

describe('M6 write fallback is closed', () => {
  it('does not treat a missing RPC as a jobs.update path', () => {
    expect(isDispatchRpcUnavailable({ code: '42883', message: 'function public.save_job_dispatch(jsonb) does not exist' })).toBe(true);
    expect(isDispatchRpcUnavailable({ code: 'PGRST202', message: 'Could not find the function' })).toBe(true);
    expect(mapDispatchRpcError({ code: 'PGRST202', message: 'Could not find the function public.save_job_dispatch' })).toEqual({
      ok: false,
      code: 'unavailable',
      message: DISPATCH_UNAVAILABLE,
    });
    const panel = readFileSync(resolve(process.cwd(), 'src/components/jobs/JobDispatchPanel.tsx'), 'utf8');
    const schedule = readFileSync(resolve(process.cwd(), 'src/pages/SchedulePage.tsx'), 'utf8');
    expect(panel).toContain('throw new Error(DISPATCH_UNAVAILABLE)');
    expect(panel).not.toMatch(/if \(!snapshot \|\| !pack \|\| pack\.missing\)[\s\S]{0,200}from\('jobs'\)\s*\.update/);
    expect(schedule).toContain('DISPATCH_UNAVAILABLE');
    expect(schedule).not.toMatch(/if \(!dispatchPack \|\| dispatchPack\.missing\)[\s\S]{0,160}rescheduleJob\.mutate/);
    expect(schedule).not.toMatch(/from\('jobs'\)\.update\(\{\s*start_time/);
  });

  it('missing RPC cannot bypass required dispatch validation', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function public.save_job_dispatch(jsonb) does not exist' },
    });
    const result = await saveJobDispatch(input());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('unavailable');
    expect(from).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('hard rejection never opens the RPC or a direct write', async () => {
    const hardSnap: DispatchSnapshot = {
      ...baseSnap,
      skillRequirements: [{ skillId: 'sk-test' }],
      skills: [{ id: 'sk-test', name: 'Tester ticket' }],
      qualifications: [],
    };
    const result = await saveJobDispatch(input({
      role: 'admin',
      overrideReason: 'please',
      skillRequirements: [{ skillId: 'sk-test' }],
    }, hardSnap));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('blocked');
    expect(result.message).toMatch(/Tester ticket|qualified/i);
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('permission rejection never opens the RPC or a direct write', async () => {
    const unknownHours: DispatchSnapshot = { ...baseSnap, hours: [] };
    const result = await saveJobDispatch(input({ role: 'member' }, unknownHours));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('blocked');
    expect(rpc).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it('network failure retains a retryable operation without changing its idempotency key', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'TypeError: Failed to fetch' },
    });
    const first = await saveJobDispatch(input({ idempotencyKey: 'lost-response-key-0001' }));
    const second = await saveJobDispatch(input({ idempotencyKey: 'lost-response-key-0001' }));
    expect(first.ok).toBe(false);
    expect(second.ok).toBe(false);
    if (first.ok || second.ok) return;
    expect(first.code).toBe('error');
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][1].p.idempotency_key).toBe('lost-response-key-0001');
    expect(rpc.mock.calls[1][1].p.idempotency_key).toBe('lost-response-key-0001');
    expect(nextIdempotencyKeyAfterResult(first, 'lost-response-key-0001', () => 'minted-new')).toBe('lost-response-key-0001');
    expect(from).not.toHaveBeenCalled();
  });
});
