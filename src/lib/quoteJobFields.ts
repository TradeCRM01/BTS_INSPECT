export function padQuoteNumber(n: number | null | undefined): string {
  return String(n ?? 0).padStart(4, '0');
}

/** Portal quote/invoice ref. `10` and `0010` both become `#0010`. */
export function portalDocumentRef(value: string | number | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const digits = raw.replace(/^#/, '');
  const n = Number(digits);
  if (!Number.isFinite(n)) return raw.startsWith('#') ? raw : `#${raw}`;
  return `#${padQuoteNumber(n)}`;
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

export type QuoteConvertEntry = 'convert' | 'focus_convert';

export function quoteConvertEntry(quote: {
  scheduled_date?: string | null;
  assigned_team?: unknown;
}): QuoteConvertEntry {
  return convertQuoteHasDateAndCrew(quote) ? 'convert' : 'focus_convert';
}

export const CONVERT_QUOTE_BLOCKED = 'Could not convert this quote.';

export type QuoteConvertTap =
  | { action: 'focus_convert' }
  | { action: 'convert' }
  | { action: 'blocked'; message: string };

export function quoteConvertTap(input: {
  id?: string | null;
  status?: string | null;
  profileId?: string | null;
  scheduled_date?: string | null;
  assigned_team?: unknown;
}): QuoteConvertTap {
  if (quoteConvertEntry(input) === 'focus_convert') return { action: 'focus_convert' };
  if (!input.id || input.status !== 'accepted' || !input.profileId) {
    return { action: 'blocked', message: CONVERT_QUOTE_BLOCKED };
  }
  return { action: 'convert' };
}

export function quoteConvertTapShowsBusy(tap: QuoteConvertTap): boolean {
  return tap.action === 'convert' || tap.action === 'blocked';
}

export function quoteConvertScrollContainer(section: HTMLElement): HTMLElement | null {
  return section.closest('.hub-quote-editor') ?? section.closest('[role="dialog"]');
}

export function scrollQuoteConvertIntoView(section: HTMLElement): number {
  const container = quoteConvertScrollContainer(section);
  if (container) {
    const top = (container.scrollTop || 0)
      + (section.getBoundingClientRect().top - container.getBoundingClientRect().top);
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({ top, behavior: 'auto' });
    } else {
      container.scrollTop = top;
    }
    return top;
  }
  if (typeof section.scrollIntoView === 'function') {
    section.scrollIntoView({ block: 'start' });
  }
  return 0;
}

export const QUOTE_CONVERT_DATE_FOCUS = 'is-quote-convert-focus';

export function focusQuoteConvertDate(root: ParentNode): HTMLInputElement | null {
  const section = root instanceof Element && root.classList.contains('hub-quote-convert')
    ? root
    : root.querySelector('.hub-quote-convert');
  if (!(section instanceof HTMLElement)) return null;
  scrollQuoteConvertIntoView(section);
  const date = section.querySelector<HTMLInputElement>('#quote-convert-date, input[type="date"]');
  if (!date) return null;
  date.classList.add(QUOTE_CONVERT_DATE_FOCUS);
  const clear = () => {
    date.classList.remove(QUOTE_CONVERT_DATE_FOCUS);
    date.removeEventListener('blur', clear);
  };
  date.addEventListener('blur', clear);
  date.focus();
  return date;
}

export function takeQuoteConvertLock(lock: { current: boolean }): boolean {
  if (lock.current) return false;
  lock.current = true;
  return true;
}

export function releaseQuoteConvertLock(lock: { current: boolean }): void {
  lock.current = false;
}

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
