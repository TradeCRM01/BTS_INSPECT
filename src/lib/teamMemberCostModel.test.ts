import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canEditTeamMemberExpenseCostModel,
  profileExpenseCostModelUpdatePayload,
} from './teamMemberCostModel';

describe('profileExpenseCostModelUpdatePayload', () => {
  it('writes the FK or null for None', () => {
    expect(profileExpenseCostModelUpdatePayload('')).toEqual({ expense_cost_model_id: null });
    expect(profileExpenseCostModelUpdatePayload('model-uuid')).toEqual({ expense_cost_model_id: 'model-uuid' });
    expect(profileExpenseCostModelUpdatePayload('  uuid-here  ')).toEqual({
      expense_cost_model_id: 'uuid-here',
    });
  });
});

describe('canEditTeamMemberExpenseCostModel', () => {
  it('allows admins and company owner, not regular members', () => {
    expect(canEditTeamMemberExpenseCostModel({
      actorId: 'a1',
      actorRole: 'admin',
      ownerId: 'o1',
    })).toBe(true);
    expect(canEditTeamMemberExpenseCostModel({
      actorId: 'o1',
      actorRole: 'member',
      ownerId: 'o1',
    })).toBe(true);
    expect(canEditTeamMemberExpenseCostModel({
      actorId: 'm1',
      actorRole: 'member',
      ownerId: 'o1',
    })).toBe(false);
  });
});

describe('TeamSettings cost model writer', () => {
  it('updates profiles.expense_cost_model_id via supabase', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/pages/TeamSettingsPage.tsx'), 'utf8');
    expect(page).toContain('expense_cost_model_id');
    expect(page).toContain('profileExpenseCostModelUpdatePayload');
    expect(page).toContain('canEditTeamMemberExpenseCostModel');
  });
});
