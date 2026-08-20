export function padQuoteNumber(n: number | null | undefined): string {
  return String(n ?? 0).padStart(4, '0');
}

/** YYYY-MM-DD from a quote/convert date. Empty or missing → null (do not invent). */
export function scheduledDateFromQuote(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const day = raw.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

export function jobFieldsFromQuote(
  quote: {
    quote_number: number | null;
    client_id: string | null;
    description: string | null;
    scope_of_works: string | null;
    total: number | null;
    scheduled_date?: string | null;
  },
  clientAddress: string | null,
): {
  client_id: string | null;
  title: string;
  description: string | null;
  address: string | null;
  budget: number | null;
  status: 'scheduled';
  priority: 'medium';
  scheduled_date: string | null;
} {
  const title = quote.description?.trim() || `Job from Quote #${padQuoteNumber(quote.quote_number)}`;
  const description = quote.scope_of_works?.trim() || null;
  const budget = quote.total != null && Number.isFinite(Number(quote.total))
    ? Number(quote.total)
    : null;
  return {
    client_id: quote.client_id,
    title,
    description,
    address: clientAddress?.trim() || null,
    budget,
    status: 'scheduled',
    priority: 'medium',
    scheduled_date: scheduledDateFromQuote(quote.scheduled_date),
  };
}
