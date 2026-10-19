export const ANTHROPIC_KEY_TEST_FAILED =
  "The API key could not be verified. Check it and try again.";

export type AiSettingsClientBody = {
  anthropic_api_key?: string;
  model?: string;
  test_only?: boolean;
  admin_tools_enabled?: unknown;
  adminToolsEnabled?: unknown;
};

export function publicAiSettings(
  row: { anthropic_api_key?: string | null; model?: string | null } | null | undefined,
): { keySet: boolean; model: string } {
  return {
    keySet: Boolean(row?.anthropic_api_key),
    model: row?.model ?? "claude-opus-4-7",
  };
}

/** Default off when the column is missing or null. */
export function resolveAdminToolsEnabled(
  row: { admin_tools_enabled?: boolean | null } | null | undefined,
): boolean {
  return row?.admin_tools_enabled ?? false;
}

/** Persist key and model only. Client tools flags are ignored for every caller. */
export function buildAiSettingsUpsert(
  companyId: string,
  body: AiSettingsClientBody,
  updatedAt: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    company_id: companyId,
    updated_at: updatedAt,
  };
  if (body.anthropic_api_key !== undefined) payload.anthropic_api_key = body.anthropic_api_key;
  if (body.model !== undefined) payload.model = body.model;
  return payload;
}
