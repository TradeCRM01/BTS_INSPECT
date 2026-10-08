import type { SupabaseClient } from '@supabase/supabase-js';

export type PriceBookCodeLookup = ReadonlyMap<string, string> | Readonly<Record<string, string>>;

export function priceBookItemIdsFromLines(
  lines: ReadonlyArray<{ price_book_item_id?: string | null }>,
): string[] {
  const ids = new Set<string>();
  for (const li of lines) {
    const id = li.price_book_item_id?.trim();
    if (id) ids.add(id);
  }
  return [...ids];
}

export function priceBookCodeFromLookup(
  lookup: PriceBookCodeLookup | undefined | null,
  priceBookItemId: string | null | undefined,
): string | null {
  if (!lookup || !priceBookItemId) return null;
  if (lookup instanceof Map) return lookup.get(priceBookItemId) ?? null;
  return (lookup as Record<string, string>)[priceBookItemId] ?? null;
}

/** One query per bundle; returns partial map on error (never throws). */
export async function fetchPriceBookItemCodes(
  supabase: SupabaseClient,
  itemIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (itemIds.length === 0) return map;
  try {
    const { data, error } = await supabase
      .from('price_book_items')
      .select('id, code')
      .in('id', itemIds);
    if (error) return map;
    for (const row of data ?? []) {
      const id = String(row.id ?? '');
      const code = (row.code as string | null)?.trim();
      if (id && code) map.set(id, code);
    }
  } catch {
    return map;
  }
  return map;
}
