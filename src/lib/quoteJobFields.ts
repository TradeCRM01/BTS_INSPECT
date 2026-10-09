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

export const QUOTE_CONVERT_DEFAULT_START = '08:00';
export const QUOTE_CONVERT_DEFAULT_END = '16:00';

/** HH:MM for jobs.start_time / jobs.end_time. Empty or junk → null. */
export function normalizeJobTime(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function jobTimesFromQuote(
  start?: string | null,
  end?: string | null,
  opts?: { fallbackDefault?: boolean },
): { start_time: string | null; end_time: string | null } {
  const start_time = normalizeJobTime(start);
  const end_time = normalizeJobTime(end);
  if (start_time && end_time) return { start_time, end_time };
  if (opts?.fallbackDefault) {
    return {
      start_time: start_time ?? QUOTE_CONVERT_DEFAULT_START,
      end_time: end_time ?? QUOTE_CONVERT_DEFAULT_END,
    };
  }
  return { start_time, end_time };
}

export type QuoteConvertMissing = 'date' | 'crew' | 'start' | 'end' | 'end_before_start';

export const CONVERT_QUOTE_END_BEFORE_START = 'End time must be after start.';

function jobTimeMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

/** First missing or invalid convert field (date → crew → start → end → order). */
export function quoteConvertMissing(quote: {
  scheduled_date?: string | null;
  assigned_team?: unknown;
  start_time?: string | null;
  end_time?: string | null;
}): QuoteConvertMissing | null {
  const noDate = !scheduledDateFromQuote(quote.scheduled_date);
  const noCrew = assignedTeamFromQuote(quote.assigned_team).length === 0;
  const times = jobTimesFromQuote(quote.start_time, quote.end_time);
  if (noDate) return 'date';
  if (noCrew) return 'crew';
  if (!times.start_time) return 'start';
  if (!times.end_time) return 'end';
  if (jobTimeMinutes(times.end_time) <= jobTimeMinutes(times.start_time)) return 'end_before_start';
  return null;
}

export const CONVERT_QUOTE_NEED_DATE = 'Set a job date before converting.';
export const CONVERT_QUOTE_NEED_CREW = 'Pick a crew before converting.';
export const CONVERT_QUOTE_NEED_TIME = 'Set start and end times before converting.';
export const CONVERT_QUOTE_NEED_DATE_CREW = 'Set a date and crew on this tap before converting.';

export function convertQuoteNeedMessage(missing: QuoteConvertMissing, quote?: {
  scheduled_date?: string | null;
  assigned_team?: unknown;
}): string {
  if (missing === 'date' && quote) {
    const noCrew = assignedTeamFromQuote(quote.assigned_team).length === 0;
    if (noCrew) return CONVERT_QUOTE_NEED_DATE_CREW;
  }
  if (missing === 'date') return CONVERT_QUOTE_NEED_DATE;
  if (missing === 'crew') return CONVERT_QUOTE_NEED_CREW;
  if (missing === 'end_before_start') return CONVERT_QUOTE_END_BEFORE_START;
  return CONVERT_QUOTE_NEED_TIME;
}

export function quoteConvertFocusField(missing: QuoteConvertMissing): QuoteConvertMissing {
  if (missing === 'end_before_start') return 'end';
  return missing;
}

/** Convert must have date, crew, and times on the same tap. Accept may create the job without them. */
export function convertQuoteHasDateAndCrew(quote: {
  scheduled_date?: string | null;
  assigned_team?: unknown;
  start_time?: string | null;
  end_time?: string | null;
}): boolean {
  return quoteConvertMissing(quote) === null;
}

export type QuoteConvertEntry = 'convert' | 'focus_convert';

export function quoteConvertEntry(quote: {
  scheduled_date?: string | null;
  assigned_team?: unknown;
  start_time?: string | null;
  end_time?: string | null;
}): QuoteConvertEntry {
  return convertQuoteHasDateAndCrew(quote) ? 'convert' : 'focus_convert';
}

export const CONVERT_QUOTE_BLOCKED = 'Could not convert this quote.';
export const CONVERT_QUOTE_JOB_SAVED = 'Job booked from quote.';

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
  start_time?: string | null;
  end_time?: string | null;
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
  return focusQuoteConvertField(root, 'date') as HTMLInputElement | null;
}

export function focusQuoteConvertField(
  root: ParentNode,
  field: QuoteConvertMissing,
): HTMLElement | null {
  const section = root instanceof Element && root.classList.contains('hub-quote-convert')
    ? root
    : root.querySelector('.hub-quote-convert');
  if (!(section instanceof HTMLElement)) return null;
  scrollQuoteConvertIntoView(section);
  const focus = quoteConvertFocusField(field);
  const selector = focus === 'date'
    ? '#quote-convert-date, input[type="date"]'
    : focus === 'crew'
      ? '#quote-convert-crew'
      : focus === 'end'
        ? '#quote-convert-end'
        : '#quote-convert-start';
  const el = section.querySelector<HTMLElement>(selector);
  if (!el) return null;
  if (field === 'date' && el instanceof HTMLInputElement) {
    el.classList.add(QUOTE_CONVERT_DATE_FOCUS);
    const clear = () => {
      el.classList.remove(QUOTE_CONVERT_DATE_FOCUS);
      el.removeEventListener('blur', clear);
    };
    el.addEventListener('blur', clear);
  }
  el.focus();
  return el;
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
    start_time?: string | null;
    end_time?: string | null;
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
  start_time: string | null;
  end_time: string | null;
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
    ...jobTimesFromQuote(quote.start_time, quote.end_time),
  };
}
