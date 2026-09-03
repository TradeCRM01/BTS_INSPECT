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

/** Profile ids already on the quote. Empty or junk → [] (do not invent crew). */
export function assignedTeamFromQuote(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
}

/** Convert must have both on the same tap. Accept may create the job without either. */
export function convertQuoteHasDateAndCrew(quote: {
  scheduled_date?: string | null;
  assigned_team?: unknown;
}): boolean {
  return !!scheduledDateFromQuote(quote.scheduled_date) && assignedTeamFromQuote(quote.assigned_team).length > 0;
}

export const CONVERT_QUOTE_NEED_DATE_CREW = 'Set a date and crew on this tap before converting.';

export function jobFieldsFromQuote(
  quote: {
    quote_number: number | null;
    client_id: string | null;
    description: string | null;
    scope_of_works: string | null;
    total: number | null;
    scheduled_date?: string | null;
    assigned_team?: unknown;
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
  assigned_team: string[];
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
    assigned_team: assignedTeamFromQuote(quote.assigned_team),
  };
}
