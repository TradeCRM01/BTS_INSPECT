/** Client PDF / portal line text — name only, no price-book code prefix. */
const SPACED_DASH_SEPARATORS = [' — ', ' – ', ' - '] as const;

function stripSpacedDashPrefix(trimmed: string, prefix: string): string | null {
  for (const sep of SPACED_DASH_SEPARATORS) {
    const lead = `${prefix}${sep}`;
    if (trimmed.startsWith(lead)) {
      return trimmed.slice(lead.length).trim();
    }
  }
  return null;
}

/** Single code-like token (no spaces), must include a digit. */
const HEURISTIC_CODE_PREFIX = /^[A-Za-z0-9._/-]*\d[A-Za-z0-9._/-]*$/;

function stripHeuristicCodePrefix(trimmed: string): string {
  for (const sep of SPACED_DASH_SEPARATORS) {
    const idx = trimmed.indexOf(sep);
    if (idx <= 0) continue;
    const prefix = trimmed.slice(0, idx);
    if (!HEURISTIC_CODE_PREFIX.test(prefix)) continue;
    return trimmed.slice(idx + sep.length).trim();
  }
  return trimmed;
}

export function customerFacingLineDescription(
  description: string,
  storedPriceBookCode?: string | null,
): string {
  const trimmed = (description ?? '').trim();
  if (!trimmed) return trimmed;

  const code = (storedPriceBookCode ?? '').trim();
  if (code) {
    const stripped = stripSpacedDashPrefix(trimmed, code);
    if (stripped != null) return stripped;
    return trimmed;
  }

  return stripHeuristicCodePrefix(trimmed);
}
