import { profileExpenseCostModelUpdatePayload } from './teamMemberCostModel';

export const MEMBER_SETTINGS_RPC = 'update_member_settings';
export const MEMBER_SETTINGS_NO_ROW =
  'Could not save member settings. The change was not stored.';

export type MemberTemplateAccess = 'view' | 'edit' | 'none';
export type MemberRole = 'admin' | 'member';

export type MemberSettingsPatch = {
  expense_cost_model_id?: string | null;
  template_access?: MemberTemplateAccess;
  role?: MemberRole;
};

export type MemberSettingsSaved = {
  id: string;
  expense_cost_model_id: string | null;
  template_access: string;
  role: string;
};

export type MemberSettingsWriteResult = {
  data: MemberSettingsSaved | null;
  error: { message: string } | null;
};

type MemberSettingsRpcResult = {
  data: unknown;
  error: { message: string } | null;
};

export type MemberSettingsRpcClient = {
  rpc: (fn: string, args: { member_id: string; patch: MemberSettingsPatch }) => unknown;
};

function parseSavedRow(data: unknown): MemberSettingsSaved | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (typeof row.id !== 'string') return null;
  return {
    id: row.id,
    expense_cost_model_id: typeof row.expense_cost_model_id === 'string' ? row.expense_cost_model_id : null,
    template_access: typeof row.template_access === 'string' ? row.template_access : '',
    role: typeof row.role === 'string' ? row.role : '',
  };
}

/** Throws on a PostgREST error or a silent 0-row write (204 with no payload). */
export function throwIfMemberSettingsWriteFailed(
  result: MemberSettingsWriteResult,
): asserts result is MemberSettingsWriteResult & { data: MemberSettingsSaved } {
  if (result.error) {
    throw new Error(result.error.message || MEMBER_SETTINGS_NO_ROW);
  }
  if (result.data == null) {
    throw new Error(MEMBER_SETTINGS_NO_ROW);
  }
}

export function memberSettingsCostModelPatch(selectedModelId: string): MemberSettingsPatch {
  return profileExpenseCostModelUpdatePayload(selectedModelId);
}

export async function updateMemberSettings(
  client: MemberSettingsRpcClient,
  memberId: string,
  patch: MemberSettingsPatch,
): Promise<MemberSettingsSaved> {
  const raw = await (client.rpc(MEMBER_SETTINGS_RPC, {
    member_id: memberId,
    patch,
  }) as PromiseLike<MemberSettingsRpcResult>);
  const result: MemberSettingsWriteResult = {
    data: parseSavedRow(raw.data),
    error: raw.error,
  };
  throwIfMemberSettingsWriteFailed(result);
  return result.data;
}
