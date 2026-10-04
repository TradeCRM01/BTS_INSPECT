import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { bookingDraftAfterRefresh, bookingFieldsForWrite, buildDispatchPayload, mapDispatchRpcError, saveJobDispatch, skillRequirementsForWrite } from './saveJobDispatch';
import type { DispatchSnapshot } from './dispatchResources';

const snap: DispatchSnapshot = {
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
  hours: [],
  names: new Map(),
  today: '2026-09-14',
};

describe('save_job_dispatch payload', () => {
  it('sends one idempotency key so a retry cannot mint a second event', () => {
    const a = buildDispatchPayload({
      jobId: 'job-1',
      expectedUpdatedAt: '2026-09-14T00:00:00.000Z',
      assignedTeam: ['alice'],
      resourceIds: ['res-1'],
      skillRequirements: [],
      resourceRequirements: [],
      requiredCrewCount: 0,
      dispatchReady: false,
      role: 'member',
      idempotencyKey: 'same-retry-key-0001',
      snapshot: snap,
    }, { overridden: false });
    const b = buildDispatchPayload({
      jobId: 'job-1',
      expectedUpdatedAt: '2026-09-14T00:00:00.000Z',
      assignedTeam: ['alice'],
      resourceIds: ['res-1'],
      skillRequirements: [],
      resourceRequirements: [],
      requiredCrewCount: 0,
      dispatchReady: false,
      role: 'member',
      idempotencyKey: 'same-retry-key-0001',
      snapshot: snap,
    }, { overridden: false });
    expect(a.idempotency_key).toBe('same-retry-key-0001');
    expect(b.idempotency_key).toBe(a.idempotency_key);
    expect(a.resource_ids).toEqual(['res-1']);
  });

  it('keeps the #228 client compatible: always-sent clocks are not treated as a clear', () => {
    const timed = buildDispatchPayload({
      jobId: 'job-1',
      expectedUpdatedAt: '2026-09-14T00:00:00.000Z',
      assignedTeam: ['alice'],
      resourceIds: [],
      skillRequirements: [],
      resourceRequirements: [],
      requiredCrewCount: 0,
      dispatchReady: false,
      role: 'member',
      snapshot: snap,
    }, { overridden: false });
    expect(Object.prototype.hasOwnProperty.call(timed, 'start_time')).toBe(true);
    expect(timed.start_time).toBe('09:00:00');
    expect(timed.end_time).toBe('11:00:00');
  });

  it('sends present null clocks so a clear is not omitted', () => {
    const payload = buildDispatchPayload({
      jobId: 'job-1',
      expectedUpdatedAt: '2026-09-14T00:00:00.000Z',
      assignedTeam: [],
      resourceIds: [],
      skillRequirements: [],
      resourceRequirements: [],
      requiredCrewCount: 0,
      dispatchReady: false,
      role: 'admin',
      overrideReason: 'Restore untimed booking',
      snapshot: {
        ...snap,
        job: { ...snap.job, start_time: null, end_time: null, assigned_team: [] },
        assignedTeam: [],
      },
    }, { overridden: true });
    expect(payload).toMatchObject({ start_time: null, end_time: null });
    expect(Object.prototype.hasOwnProperty.call(payload, 'start_time')).toBe(true);
  });
});

describe('booking draft stays off requirement writes', () => {
  const committed = {
    scheduled_date: '2026-10-04',
    start_time: '10:00:00',
    end_time: '11:00:00',
    assigned_team: ['jack'],
  };

  it('keeps the saved booking when a requirement patch omits clocks', () => {
    expect(bookingFieldsForWrite(committed, {})).toEqual(committed);
    expect(bookingFieldsForWrite(committed, {
      scheduled_date: '2026-10-05',
      start_time: null,
      end_time: null,
      assigned_team: ['m6'],
    })).toEqual({
      scheduled_date: '2026-10-05',
      start_time: null,
      end_time: null,
      assigned_team: ['m6'],
    });
  });

  it('keeps min holders on skills the user did not change', () => {
    const stored = [{ skillId: 'licence', minHolders: 2 }, { skillId: 'height', minHolders: 1 }];
    expect(skillRequirementsForWrite(stored)).toEqual(stored);
    expect(skillRequirementsForWrite(stored, ['licence', 'new-skill'])).toEqual([
      { skillId: 'licence', minHolders: 2 },
      { skillId: 'new-skill', minHolders: 1 },
    ]);
  });

  it('refreshes a clean draft and keeps a dirty one', () => {
    const incoming = { date: '2026-10-05', start: '08:00', end: '09:00', crew: ['ada'] };
    const draft = { date: '2026-10-04', start: '10:00', end: '12:00', crew: ['jack'] };
    expect(bookingDraftAfterRefresh(false, incoming, draft).draft).toEqual(incoming);
    expect(bookingDraftAfterRefresh(false, incoming, draft).conflict).toBeNull();
    const kept = bookingDraftAfterRefresh(true, incoming, draft);
    expect(kept.draft).toEqual(draft);
    expect(kept.conflict).toMatch(/unsaved booking/);
  });

  it('sends reschedule so a move is not recorded as an assignment', () => {
    const payload = buildDispatchPayload({
      jobId: 'job-1',
      expectedUpdatedAt: '2026-09-14T00:00:00.000Z',
      assignedTeam: ['alice'],
      resourceIds: [],
      skillRequirements: [{ skillId: 'licence', minHolders: 2 }],
      resourceRequirements: [],
      requiredCrewCount: 0,
      dispatchReady: false,
      role: 'admin',
      reschedule: true,
      snapshot: snap,
    }, { overridden: false });
    expect(payload.reschedule).toBe(true);
    expect(payload.event_kind).toBe('reschedule');
    expect(payload.skill_requirements).toEqual([{ skill_id: 'licence', min_holders: 2 }]);
  });
});

describe('production dispatch SQL is tenant scoped and without anon DML', () => {
  it('ships the reviewed save_job_dispatch migration without a demo catalogue', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260918200000_083_save_job_dispatch.sql'), 'utf8');
    expect(sql).not.toMatch(/LOCAL SANDBOX ONLY/i);
    expect(sql).not.toMatch(/Local demo catalogue/i);
    expect(sql).not.toMatch(/INSERT INTO dispatch_skills/i);
    expect(sql).not.toMatch(/GRANT\s+[^;]*\banon\b/i);
    expect(sql).toMatch(/REVOKE ALL ON TABLE %I FROM anon/i);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION (?:public\.)?save_job_dispatch\(jsonb\) FROM PUBLIC, anon/i);
    expect(sql).toMatch(/stale_dispatch/);
    expect(sql).toMatch(/updated_at = clock_timestamp\(\)/);
    expect(sql).toMatch(/tenant_mismatch/);
    expect(sql).toMatch(/ON CONFLICT \(company_id, idempotency_key\)/);
    expect(sql).toMatch(/replayed/);
    expect(sql).toMatch(/override_forbidden/);
    expect(sql).toMatch(/dispatch_blocked/);
    expect(sql).toMatch(/FOR UPDATE/);
    expect(sql).toMatch(/SET search_path = pg_catalog, public/);
    expect(sql).toMatch(/public\.job_resource_allocations/);
    expect(sql).toMatch(/REVOKE INSERT, UPDATE, DELETE ON TABLE %I FROM authenticated/);
    expect(sql).toMatch(/company_insert_admin/);
    expect(sql).not.toMatch(/CREATE TABLE.*staff_hours/i);
    for (const table of [
      'dispatch_skills',
      'dispatch_member_qualifications',
      'dispatch_resources',
      'job_skill_requirements',
      'job_resource_requirements',
      'job_resource_allocations',
      'dispatch_events',
    ]) {
      expect(sql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}[\\s\\S]*?company_id uuid NOT NULL`));
    }
    expect(sql).toMatch(/CREATE POLICY company_select ON %I FOR SELECT TO authenticated/);
    expect(sql).toMatch(/auth\.uid\(\)/);
  });

  it('lets a present null clock clear stored times and rejects a zero-length slot', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260919120000_084_save_job_dispatch_clear_times.sql'), 'utf8');
    expect(sql).toMatch(/dispatch_json_clock/);
    expect(sql).toMatch(/p \? key/);
    expect(sql).toMatch(/invalid_interval/);
    expect(sql).toMatch(/already received save_job_dispatch_clear_times/);
    expect(sql).not.toMatch(/v_start := coalesce\(nullif\(p->>'start_time'/);
    const leave = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261004120000_085_save_job_dispatch_leave_date_kind.sql'), 'utf8');
    expect(leave).toMatch(/NOT \(p \? 'scheduled_date'\)/);
    expect(leave).toMatch(/hours_unavailable/);
    expect(leave).toMatch(/h\.working IS NOT TRUE/);
    expect(leave).toMatch(/p->>'event_kind'/);
    expect(sql).not.toMatch(/CREATE TABLE/);
    expect(mapDispatchRpcError({ message: 'invalid_interval', code: '22007' }).message).toMatch(/End must be after start/);
  });

  it('rejects a stale write and a cross-tenant write cleanly', () => {
    expect(mapDispatchRpcError({ message: 'stale_dispatch', code: '40001' })).toEqual({
      ok: false,
      code: 'stale',
      message: 'Someone else just changed this job. Refresh and try again.',
    });
    expect(mapDispatchRpcError({ message: 'tenant_mismatch' }).code).toBe('tenant');
    expect(mapDispatchRpcError({ message: 'override_forbidden' }).code).toBe('blocked');
    expect(mapDispatchRpcError({
      message: 'dispatch_blocked',
      details: JSON.stringify({
        code: 'missing_qualification',
        conflicts: [{ kind: 'missing_qualification', severity: 'hard', message: 'Needs qualified crew for Tester ticket.', overridable: false }],
      }),
    }).message).toMatch(/Tester ticket/);
    expect(mapDispatchRpcError({
      message: 'column "pg_proc" does not exist',
      details: 'HINT:  No operator matches the given name and argument types',
    })).toEqual({
      ok: false,
      code: 'error',
      message: 'Could not save dispatch.',
    });
  });

  it('does not open an RPC when the browser reports offline', async () => {
    Object.defineProperty(globalThis.navigator, 'onLine', { configurable: true, value: false });
    const result = await saveJobDispatch({
      jobId: 'job-1',
      expectedUpdatedAt: '2026-09-14T00:00:00.000Z',
      assignedTeam: ['alice'],
      resourceIds: [],
      skillRequirements: [],
      resourceRequirements: [],
      requiredCrewCount: 0,
      dispatchReady: false,
      role: 'admin',
      overrideReason: 'offline retry check',
      idempotencyKey: 'offline-retry-key-0001',
      snapshot: { ...snap, hours: [{ memberId: 'alice', date: '2026-09-14', working: true, start: '07:00', end: '17:00' }] },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('error');
    expect(result.message).toMatch(/back online/);
  });
});
