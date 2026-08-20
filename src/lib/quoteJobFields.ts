export function padQuoteNumber(n: number | null | undefined): string {
  return String(n ?? 0).padStart(4, '0');
}

export function jobFieldsFromQuote(
  quote: {
    quote_number: number | null;
    client_id: string | null;
    description: string | null;
    scope_of_works: string | null;
    total: number | null;
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
  };
}
