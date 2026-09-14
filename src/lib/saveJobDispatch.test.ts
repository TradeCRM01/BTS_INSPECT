import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDispatchPayload, mapDispatchRpcError } from './saveJobDispatch';
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
});

describe('local dispatch SQL is not a production grant path', () => {
  it('stays local-only, tenant scoped, and without anon DML', () => {
    const sql = readFileSync(resolve(process.cwd(), 'scripts/local-m6-dispatch-resources.sql'), 'utf8');
    expect(sql).toMatch(/LOCAL SANDBOX ONLY/i);
    expect(sql).toMatch(/Not a production migration/i);
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
  });
});
