import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('SWEEP-AI ai_settings grants', () => {
  it('revokes table-wide access and never re-grants api_key', () => {
    const sql = src('supabase/migrations/20261019000000_088_ai_settings_lockdown.sql');
    const rollback = src('supabase/rollbacks/20261019000000_088_ai_settings_lockdown.rollback.sql');
    const probe = src('supabase/tests/ai_settings_api_key_grant.sql');
    expect(sql).toContain('ALTER COLUMN admin_tools_enabled SET DEFAULT false');
    expect(sql).toContain('REVOKE ALL ON TABLE public.ai_settings FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('GRANT SELECT (id, company_id, model, created_at, updated_at)');
    expect(sql).not.toMatch(/GRANT[\s\S]*anthropic_api_key/);
    expect(sql).not.toMatch(/GRANT SELECT, INSERT, UPDATE ON/);
    expect(rollback).toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.ai_settings TO authenticated');
    expect(probe).toContain("has_column_privilege('authenticated', 'public.ai_settings', 'anthropic_api_key', 'SELECT')");
  });

  it('refuses authenticated SELECT on api_key when a local database is present', async () => {
    const databaseUrl = process.env.SWEEP_AI_DATABASE_URL || process.env.DATABASE_URL || '';
    const psql = existsSync('/usr/bin/psql') || existsSync('/usr/local/bin/psql');
    if (!databaseUrl || !psql) {
      expect(true).toBe(true);
      return;
    }
    const probe = resolve(process.cwd(), 'supabase/tests/ai_settings_api_key_grant.sql');
    const { stdout } = await execFileAsync('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', probe], {
      timeout: 15000,
    });
    expect(stdout).toMatch(/authenticated_can_select_api_key/);
    expect(stdout).not.toMatch(/authenticated_can_select_api_key\s*\|\s*t/i);
  });
});
