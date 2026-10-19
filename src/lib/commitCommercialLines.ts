import { commitDocumentLine, commitNumberField } from './parseDecimal';

export type CommercialLineDraft = {
  description: string;
  quantity: string;
  unit_price: string;
  unit_cost?: string | null;
  charge_type?: string;
  stock_item_id?: string | null;
  price_book_item_id?: string | null;
  markup_percent?: string | null;
  cost_model_id?: string | null;
  gst_rate?: number | null;
  check_price?: boolean;
};

export type CommercialLineCommitted = {
  description: string;
  quantity: number;
  unit_price: number;
  unit_cost: number | null;
  charge_type: string | null;
  stock_item_id: string | null;
  price_book_item_id: string | null;
  markup_percent: number | null;
  cost_model_id: string | null;
  gst_rate: number | null;
  check_price?: boolean;
};

export function commitCommercialLines(
  items: CommercialLineDraft[],
): { ok: true; lines: CommercialLineCommitted[] } | { ok: false; message: string } {
  const lines: CommercialLineCommitted[] = [];
  for (let i = 0; i < items.length; i += 1) {
    const li = items[i];
    if (!li.description.trim()) continue;
    const committed = commitDocumentLine(li);
    if (!committed.ok) return { ok: false, message: `Line ${i + 1}: ${committed.message}` };
    if (committed.quantity <= 0) continue;
    const markupRaw = li.markup_percent == null ? '' : String(li.markup_percent).trim();
    const markup = markupRaw ? commitNumberField(markupRaw, 'zero') : { ok: true as const, value: null };
    if (!markup.ok) return { ok: false, message: `Line ${i + 1}: ${markup.message}` };
    lines.push({
      description: li.description.trim(),
      quantity: committed.quantity,
      unit_price: committed.unit_price,
      unit_cost: committed.unit_cost,
      charge_type: li.charge_type?.trim() || null,
      stock_item_id: li.stock_item_id ?? null,
      price_book_item_id: li.price_book_item_id ?? null,
      markup_percent: markup.value == null ? null : Number(markup.value) || 0,
      cost_model_id: li.cost_model_id ?? null,
      gst_rate: li.gst_rate ?? null,
      check_price: li.check_price || undefined,
    });
  }
  return { ok: true, lines };
}

export function commercialLinesForPreview(items: CommercialLineDraft[]): CommercialLineCommitted[] {
  const committed = commitCommercialLines(items);
  return committed.ok ? committed.lines : [];
}
