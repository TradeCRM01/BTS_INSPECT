import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const APPLY = 'scripts/local-apply-cogs-hours.sql';
const SEED = 'scripts/local-validation-fixtures.sql';
const DISPATCH = 'scripts/local-m6-dispatch-resources.sql';
const DISPATCH_SEC = 'scripts/local-m6-dispatch-security.sql';

describe('local sandbox SQL is not a production grant path', () => {
  it('keeps fixture scripts local-only, idempotent, and off the migrations tree', () => {
    const apply = src(APPLY);
    const seed = src(SEED);
    expect(apply).toMatch(/LOCAL SANDBOX ONLY/i);
    expect(seed).toMatch(/LOCAL SANDBOX ONLY/i);
    expect(apply).toMatch(/Not a production migration/i);
    expect(seed).toMatch(/Not a production migration/i);
    expect(apply).toContain('NOT EXISTS');
    expect(seed).toContain('NOT EXISTS');
    expect(existsSync(resolve(process.cwd(), 'supabase/migrations', 'local-apply-cogs-hours.sql'))).toBe(false);
    const migrationNames = readdirSync(resolve(process.cwd(), 'supabase/migrations'));
    expect(migrationNames.some(name => /cogs-hours|local-validation-fixtures|local-apply|local-m6-dispatch/i.test(name))).toBe(false);
    const dispatch = src(DISPATCH);
    expect(dispatch).toMatch(/LOCAL SANDBOX ONLY/i);
    expect(dispatch).toMatch(/Not a production migration/i);
    expect(dispatch).not.toMatch(/GRANT\s+[^;]*\banon\b/i);
    const dispatchSec = src(DISPATCH_SEC);
    expect(dispatchSec).toMatch(/LOCAL SANDBOX ONLY/i);
    expect(dispatchSec).toMatch(/override_forbidden/);
    expect(dispatchSec).toMatch(/tenant_mismatch/);
    expect(dispatchSec).toMatch(/stale_dispatch/);
    expect(dispatchSec).toMatch(/m6-sec-retry-key-0001/);
    expect(dispatchSec).not.toMatch(/GRANT\s+[^;]*\banon\b/i);
  });

  it('does not grant anon or PUBLIC DML on expenses or staff_hours', () => {
    const apply = src(APPLY);
    const seed = src(SEED);
    expect(apply).not.toMatch(/GRANT\s+[^;]*\banon\b/i);
    expect(seed).not.toMatch(/GRANT\s+/i);
    expect(apply).toMatch(/REVOKE ALL ON TABLE expenses FROM anon/i);
    expect(apply).toMatch(/REVOKE ALL ON TABLE staff_hours FROM anon/i);
    expect(apply).toMatch(/REVOKE ALL ON TABLE expenses FROM PUBLIC/i);
    expect(apply).toMatch(/REVOKE ALL ON TABLE staff_hours FROM PUBLIC/i);
    expect(apply).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE expenses TO authenticated, service_role/i);
    expect(apply).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE staff_hours TO authenticated, service_role/i);
    expect(apply).toMatch(/TO authenticated\b/);
    expect(apply).not.toMatch(/FOR (SELECT|INSERT|UPDATE|DELETE) TO anon/i);
  });
});
