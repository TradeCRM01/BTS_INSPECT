import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ANTHROPIC_KEY_TEST_FAILED,
  publicAiSettings,
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
    expect(set).not.toHaveProperty('adminToolsEnabled');
  });

  it('does not pass Anthropic error text through', () => {
    const fn = src('supabase/functions/ai-settings/index.ts');
    expect(fn).toContain('ANTHROPIC_KEY_TEST_FAILED');
    expect(fn).not.toContain('error: errBody');
    expect(fn).not.toContain('slice(-4)');
    expect(fn).not.toContain('adminToolsEnabled');
    expect(fn).not.toContain('admin_tools_enabled');
    expect(ANTHROPIC_KEY_TEST_FAILED).not.toMatch(/anthropic|invalid_api_key|sk-ant/i);
  });
});
