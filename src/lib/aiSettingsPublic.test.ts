import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANTHROPIC_KEY_TEST_FAILED,
  buildAiSettingsUpsert,
  publicAiSettings,
  resolveAdminToolsEnabled,
} from '../../supabase/functions/ai-settings/aiSettingsPublic.ts';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('SWEEP-AI ai-settings public payload', () => {
  it('returns only keySet as a boolean and never last-4 characters', () => {
    const unset = publicAiSettings(null);
    expect(unset).toEqual({ keySet: false, model: 'claude-opus-4-7' });
    const set = publicAiSettings({
      anthropic_api_key: 'sk-ant-api03-secret-abcd',
      model: 'claude-haiku-4-5',
    });
    expect(set.keySet).toBe(true);
    expect(JSON.stringify(set)).not.toContain('abcd');
    expect(JSON.stringify(set)).not.toContain('sk-ant');
    expect(set).not.toHaveProperty('maskedKey');
    expect(set).not.toHaveProperty('last4');
    expect(set).not.toHaveProperty('adminToolsEnabled');
  });

  it('defaults admin tools off and ignores a client flag on upsert', () => {
    expect(resolveAdminToolsEnabled(null)).toBe(false);
    expect(resolveAdminToolsEnabled(undefined)).toBe(false);
    expect(resolveAdminToolsEnabled({})).toBe(false);
    expect(resolveAdminToolsEnabled({ admin_tools_enabled: null })).toBe(false);
    expect(resolveAdminToolsEnabled({ admin_tools_enabled: false })).toBe(false);
    expect(resolveAdminToolsEnabled({ admin_tools_enabled: true })).toBe(true);

    const payload = buildAiSettingsUpsert(
      'company-1',
      {
        model: 'claude-haiku-4-5',
        admin_tools_enabled: true,
        adminToolsEnabled: true,
      },
      '2026-10-19T00:00:00.000Z',
    );
    expect(payload).toEqual({
      company_id: 'company-1',
      updated_at: '2026-10-19T00:00:00.000Z',
      model: 'claude-haiku-4-5',
    });
    expect(payload).not.toHaveProperty('admin_tools_enabled');
    expect(payload).not.toHaveProperty('adminToolsEnabled');
  });

  it('mutant: restore ?? true and this test fails', () => {
    expect(resolveAdminToolsEnabled(null)).toBe(false);
    expect(resolveAdminToolsEnabled({ admin_tools_enabled: null })).toBe(false);
    const helper = src('supabase/functions/ai-settings/aiSettingsPublic.ts');
    const consoleHelper = src('supabase/functions/ai-console/aiConsoleAdmin.ts');
    expect(helper).toContain('row?.admin_tools_enabled ?? false');
    expect(helper).not.toContain('?? true');
    expect(consoleHelper).toContain('data?.admin_tools_enabled ?? false');
    expect(consoleHelper).not.toContain('?? true');
    const sneaky = buildAiSettingsUpsert(
      'company-1',
      { admin_tools_enabled: undefined, adminToolsEnabled: undefined },
      '2026-10-19T00:00:00.000Z',
    );
    expect(sneaky).not.toHaveProperty('admin_tools_enabled');
  });

  it('does not pass Anthropic error text through', () => {
    const fn = src('supabase/functions/ai-settings/index.ts');
    expect(fn).toContain('ANTHROPIC_KEY_TEST_FAILED');
    expect(fn).toContain('buildAiSettingsUpsert');
    expect(fn).toContain('publicAiSettings');
    expect(fn).not.toContain('error: errBody');
    expect(fn).not.toContain('slice(-4)');
    expect(fn).not.toContain('adminToolsEnabled');
    expect(fn).not.toContain('admin_tools_enabled');
    expect(ANTHROPIC_KEY_TEST_FAILED).not.toMatch(/anthropic|invalid_api_key|sk-ant/i);
  });
});
