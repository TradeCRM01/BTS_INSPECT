/** Normalize JSONB text[] / string[] fields from Supabase */
export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(v => (typeof v === 'string' ? v.trim() : String(v ?? '').trim()))
    .filter(Boolean);
}
