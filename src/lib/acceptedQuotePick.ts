import type { QuoteLineItem } from '../types/fsm';
import { invoiceLinesFromQuote } from './invoiceFromQuote';

/** Accepted quote with at least one line where qty > 0 — shared client + server predicate. */
export function isJobBillQuoted(quoteLineItems: QuoteLineItem[] | null | undefined): boolean {
  return invoiceLinesFromQuote(quoteLineItems).length > 0;
}

export function pickMostRecentlyAcceptedQuote<
  T extends { id: string; created_at?: string | null },
>(rows: T[] | null | undefined): T | null {
  if (!rows?.length) return null;
  const sorted = [...rows].sort((a, b) => {
    const aAt = a.created_at ?? '';
    const bAt = b.created_at ?? '';
    const byTime = bAt.localeCompare(aAt);
    if (byTime !== 0) return byTime;
    return b.id.localeCompare(a.id);
  });
  return sorted[0] ?? null;
}
