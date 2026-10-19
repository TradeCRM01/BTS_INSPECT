export const ANTHROPIC_KEY_TEST_FAILED =
  "The API key could not be verified. Check it and try again.";

export function publicAiSettings(
  row: { anthropic_api_key?: string | null; model?: string | null } | null | undefined,
): { keySet: boolean; model: string } {
  return {
    keySet: Boolean(row?.anthropic_api_key),
    model: row?.model ?? "claude-opus-4-7",
  };
}
