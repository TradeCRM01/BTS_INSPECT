import { describe, expect, it } from 'vitest';
import {
  ANTHROPIC_KEY_TEST_FAILED,
  buildAiSettingsUpsert,
  publicAiSettings,
  resolveAdminToolsEnabled,
} from '../../supabase/functions/ai-settings/aiSettingsPublic.ts';

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
    const sneaky = buildAiSettingsUpsert(
      'company-1',
      { admin_tools_enabled: true, adminToolsEnabled: true },
      '2026-10-19T00:00:00.000Z',
    );
    expect(sneaky).not.toHaveProperty('admin_tools_enabled');
    expect(ANTHROPIC_KEY_TEST_FAILED).not.toMatch(/anthropic|invalid_api_key|sk-ant/i);
  });
});
