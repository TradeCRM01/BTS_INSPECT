/** Client PDF / portal line text — name only, no price-book code prefix. */
export function customerFacingLineDescription(description: string): string {
  const trimmed = (description ?? '').trim();
  if (!trimmed) return trimmed;
  const match = /^[\w.-]{2,}\s*[—–-]\s*(.+)$/.exec(trimmed);
  if (match?.[1]) return match[1].trim();
  return trimmed;
}
