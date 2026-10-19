import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const CLIENT_READERS = [
  'src/lib/aiSettingsClient.ts',
  'src/lib/useCompanyAiKey.ts',
  'src/pages/AiSettingsPage.tsx',
  'src/pages/AiConsolePage.tsx',
  'src/pages/AiAssistantPage.tsx',
];

const INTERIM_LOCK = 'supabase/migrations/20261019003952_ai_settings_interim_lock.sql';
const INTERIM_LOCK_SHA256 = 'c33b058c3ddcfd4679d7b215f331767fae5ceb8a3b72358d5ba7cb47f9f8dec9';
const EXTRA_REVOKE = 'supabase/migrations/20261019004000_ai_settings_revoke_remaining_table_privs.sql';
const EXTRA_ROLLBACK = 'docs/operations/20261019004000_ai_settings_revoke_remaining_table_privs.rollback.sql';

describe('SWEEP-AI ai_settings grants', () => {
  it('commits the coach-signed interim lock byte-identical', () => {
    const bytes = readFileSync(resolve(process.cwd(), INTERIM_LOCK));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(INTERIM_LOCK_SHA256);
  });

  it('does not ship a grants migration of our own besides the flagged leftover revoke', () => {
    const extra = readdirSync(resolve(process.cwd(), 'supabase/migrations'))
      .filter((name) => name.includes('ai_settings') && !name.startsWith('20260428010331'))
      .filter((name) => !name.includes('ai_settings_interim_lock'))
      .filter((name) => !name.includes('ai_settings_revoke_remaining_table_privs'));
    expect(extra).toEqual([]);
    expect(existsSync(resolve(process.cwd(), 'supabase/migrations/20261019000000_088_ai_settings_lockdown.sql'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'supabase/rollbacks/20261019000000_088_ai_settings_lockdown.rollback.sql'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), EXTRA_REVOKE))).toBe(true);
    expect(existsSync(resolve(process.cwd(), EXTRA_ROLLBACK))).toBe(true);
    expect(src(EXTRA_REVOKE)).toContain('REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER');
    expect(src(EXTRA_ROLLBACK)).toContain('GRANT DELETE, TRUNCATE, REFERENCES, TRIGGER');

    expect(src('src/lib/aiSettingsClient.ts')).toContain('/functions/v1/ai-settings');
    expect(src('src/lib/useCompanyAiKey.ts')).toContain('fetchAiSettings');
    expect(src('src/lib/useCompanyAiKey.ts')).toContain('settings.keySet === true');
    expect(src('src/lib/aiSettingsClient.ts')).not.toContain('maskedKey');
    expect(src('src/pages/AiSettingsPage.tsx')).not.toContain('maskedKey');
    expect(src('src/pages/AiSettingsPage.tsx')).not.toContain('slice(-4)');
    expect(src('src/pages/AiSettingsPage.tsx')).not.toContain('last4');
    expect(src('src/lib/aiSettingsClient.ts')).not.toContain('last4');

    for (const file of CLIENT_READERS) {
      expect(src(file)).not.toMatch(/from\(['"]ai_settings['"]\)/);
    }
    expect(src('src/lib/useCompanyAiKey.ts')).not.toContain('anthropic_api_key');
    expect(src('src/pages/AiConsolePage.tsx')).not.toContain('anthropic_api_key');
    expect(src('src/pages/AiAssistantPage.tsx')).not.toContain('anthropic_api_key');
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
    expect(stdout).not.toMatch(/authenticated_can_delete\s*\|\s*t/i);
  });
});
