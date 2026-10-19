import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MEMBER_SETTINGS_NO_ROW,
  MEMBER_SETTINGS_RPC,
  throwIfMemberSettingsWriteFailed,
  updateMemberSettings,
  type MemberSettingsPatch,
} from './updateMemberSettings';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function throwIfMemberSettingsWriteFailedKilled(
  result: { data: unknown; error: { message: string } | null },
): void {
  if (result.error) {
    throw new Error(result.error.message || MEMBER_SETTINGS_NO_ROW);
  }
}

describe('throwIfMemberSettingsWriteFailed', () => {
  it('treats a silent 0-row write as failure', () => {
    expect(() => throwIfMemberSettingsWriteFailed({ data: null, error: null }))
      .toThrow(MEMBER_SETTINGS_NO_ROW);
  });

  it('surfaces the RPC error message', () => {
    expect(() => throwIfMemberSettingsWriteFailed({
      data: null,
      error: { message: 'Not allowed' },
    })).toThrow('Not allowed');
  });

  it('passes through a saved row', () => {
    const saved = {
      id: 'm1',
      expense_cost_model_id: 'c1',
      template_access: 'none',
      role: 'member',
    };
    expect(() => throwIfMemberSettingsWriteFailed({ data: saved, error: null })).not.toThrow();
  });

  it('mutation kill: dropping the 0-row check lets a silent 204 pass', () => {
    expect(() => throwIfMemberSettingsWriteFailed({ data: null, error: null }))
      .toThrow(MEMBER_SETTINGS_NO_ROW);
    expect(() => throwIfMemberSettingsWriteFailedKilled({ data: null, error: null }))
      .not.toThrow();
    expect(src('src/lib/updateMemberSettings.ts')).toContain('result.data == null');
  });
});

describe('updateMemberSettings', () => {
  it('calls the RPC and returns the saved row', async () => {
    const saved = {
      id: 'm1',
      expense_cost_model_id: 'c1',
      template_access: 'none',
      role: 'member',
    };
    const client = {
      rpc: async (fn: string, args: { member_id: string; patch: MemberSettingsPatch }) => {
        expect(fn).toBe(MEMBER_SETTINGS_RPC);
        expect(args.member_id).toBe('m1');
        expect(args.patch.template_access).toBe('none');
        return { data: saved, error: null };
      },
    };
    await expect(updateMemberSettings(client, 'm1', { template_access: 'none' }))
      .resolves.toEqual(saved);
  });

  it('throws when the RPC returns no row', async () => {
    const client = {
      rpc: async () => ({ data: null, error: null }),
    };
    await expect(updateMemberSettings(client, 'm1', { template_access: 'none' }))
      .rejects.toThrow(MEMBER_SETTINGS_NO_ROW);
  });
});

describe('update_member_settings migration', () => {
  it('defines a SECURITY DEFINER RPC with a whitelist, grants, and a rollback', () => {
    const sql = src('supabase/migrations/20261019010000_088_update_member_settings.sql');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.update_member_settings');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public, pg_temp');
    expect(sql).toContain("v_key NOT IN ('expense_cost_model_id', 'template_access', 'role')");
    expect(sql).toContain('You cannot change your own role');
    expect(sql).toContain('Only the company owner can change roles');
    expect(sql).toContain('GET DIAGNOSTICS v_updated = ROW_COUNT');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.update_member_settings(uuid, jsonb) FROM PUBLIC, anon');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.update_member_settings(uuid, jsonb) TO authenticated');
    expect(sql).toContain('expense_cost_model_id uuid');
    expect(sql).not.toContain('CREATE POLICY');
    const rollback = src('docs/operations/rollback-20261019010000_088_update_member_settings.sql');
    expect(rollback).toContain('DROP FUNCTION IF EXISTS public.update_member_settings(uuid, jsonb)');
  });
});

describe('TeamSettingsPage member settings writer', () => {
  it('saves cost model and template access through the RPC, not a bare profiles update', () => {
    const page = src('src/pages/TeamSettingsPage.tsx');
    expect(page).toContain('updateMemberSettings');
    expect(page).toContain('MEMBER_SETTINGS_NO_ROW');
    expect(page).not.toContain(".from('profiles')");
    expect(page).not.toContain('profileExpenseCostModelUpdatePayload');
    expect(page).toContain('costModelsQuery.isSuccess');
    expect(page).toContain('Add a cost model in Expenses');
    expect(page).toContain('Loading cost models');
    expect(page).toContain('role="alert"');
  });
});
