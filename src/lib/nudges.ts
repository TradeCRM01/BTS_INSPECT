import { addDays, differenceInCalendarDays, format } from 'date-fns';
import { formatMoney } from '../types/fsm';
import { dashboardJobPlace } from './dashboardHome';
import { formatJobRef } from './jobRef';
import { padQuoteNumber } from './quoteJobFields';
import { scheduleDateKey, scheduleDayKey } from './scheduleBoard';

export type NudgeKind = 'leave_soon' | 'jobs_tomorrow' | 'quote_chase' | 'invoice_unpaid';

export type Nudge = { key: string; kind: NudgeKind; label: string; detail: string; href: string };

export type NudgeJob = {
  id: string;
  job_number: number | null;
  title: string;
  status: string;
  scheduled_date: string | null;
  start_time: string | null;
  end_time?: string | null;
  assigned_team?: string[] | null;
  address?: string | null;
  client_name?: string | null;
  client_address?: string | null;
};

export type NudgeQuote = {
  id: string;
  quote_number: number | null;
  status: string;
  updated_at: string;
  sent_at?: string | null;
  chased_at?: string | null;
  validity_date?: string | null;
  total: number;
  client_name?: string | null;
};

export type NudgeInvoice = {
  id: string;
  invoice_number: number | null;
  status: string;
  due_date: string | null;
  updated_at: string;
  total: number;
  chased_at?: string | null;
  client_name?: string | null;
};

export type NudgeInput = {
  jobs: NudgeJob[];
  quotes: NudgeQuote[];
  invoices: NudgeInvoice[];
  userId: string | null;
  now: Date;
};

export const LEAVE_SOON_MINUTES = 60;
export const QUOTE_CHASE_AFTER_DAYS = 3;
export const INVOICE_CHASE_AFTER_DAYS = 5;
export const NUDGE_LIMIT = 6;
export const NUDGE_ROLLUP_AFTER = 3;

export type QuoteChase =
  | { state: 'quiet'; days: number }
  | { state: 'lapsed'; days: number; daysPast: number };

export type QuoteChaseInput = {
  status: string;
  updated_at?: string | null;
  sent_at?: string | null;
  chased_at?: string | null;
  validity_date?: string | null;
};

export const QUOTE_CHASE_FILTER = 'chase';
export const QUOTE_CHASE_COPY_DISABLED = 'Add a client to copy a chase';
export const QUOTE_CHASE_PORTAL_FAILED = "Couldn't make the portal link. Close and try again.";

function quoteSentClock(quote: QuoteChaseInput): Date | null {
  const raw = (quote.sent_at ?? '').trim();
  if (!raw) return null;
  const sent = new Date(raw);
  return Number.isNaN(sent.getTime()) ? null : sent;
}

function quoteAlreadyChased(quote: { chased_at?: string | null }): boolean {
  return String(quote.chased_at ?? '').trim() !== '';
}

export type InvoiceChase =
  | { state: 'quiet'; days: number }
  | { state: 'overdue'; days: number; daysPast: number };

export type InvoiceChaseInput = {
  status: string;
  due_date?: string | null;
  updated_at?: string | null;
  chased_at?: string | null;
};

type NudgeRule = (input: NudgeInput) => Nudge[];

/** Mirrors padInvoiceNumber in sendInvoice.ts, which drags the PDF renderer into any chunk that imports it. */
function invoiceRef(n: number | null): string {
  return `#${String(n ?? 0).padStart(4, '0')}`;
}

function quoteRef(n: number | null): string {
  return `#${padQuoteNumber(n)}`;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

/** A yyyy-MM-dd key as local midnight, so a date-only column lands on the device's calendar day. */
function localDay(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Age clock is sent_at only. updated_at (edits) must not reset it. */
export function quoteChaseDays(quote: QuoteChaseInput, now: Date): number | null {
  const sent = quoteSentClock(quote);
  if (!sent) return null;
  return differenceInCalendarDays(now, sent);
}

/** Chase list / count / dialog: sent, unchased, old enough, and still valid. Lapsed stays out. */
export function quoteOnChaseList(quote: QuoteChaseInput, now: Date): boolean {
  return quoteChase(quote, now)?.state === 'quiet';
}

/** Filter chip. Busy hides the count so it never flashes 0. */
export function quoteChaseFilterLabel(busy: boolean, count: number): string {
  return busy ? 'Chase' : `Chase · ${count}`;
}

export function quoteChaseHref(quoteId: string): string {
  return `/quotes?id=${quoteId}&chase=1`;
}

/** Lapsed chip and lapsed dashboard nudge open the editor so office re-dates first. */
export function quoteLapsedHref(quoteId: string): string {
  return `/quotes?id=${quoteId}`;
}

/** Patch for Mark chased. Does not touch updated_at or status. */
export function quoteChaseMarkPatch(
  quote: { status: string; chased_at?: string | null },
  now: Date,
): { chased_at: string } | null {
  if (quote.status !== 'sent' || quoteAlreadyChased(quote)) return null;
  return { chased_at: now.toISOString() };
}

export function quoteChaseCopyDisabledReason(args: {
  clientId?: string | null;
  portalUrl?: string | null;
  portalFailed?: boolean;
}): string | null {
  const hasClient = !!(args.clientId ?? '').trim();
  if (!hasClient) return QUOTE_CHASE_COPY_DISABLED;
  if (args.portalFailed) return QUOTE_CHASE_PORTAL_FAILED;
  return null;
}

/** null when the quote is not sent, already chased, or sent and fresh. Lapsed wins over quiet. */
export function quoteChase(quote: QuoteChaseInput, now: Date): QuoteChase | null {
  if (quote.status !== 'sent' || quoteAlreadyChased(quote)) return null;
  const days = quoteChaseDays(quote, now);
  if (days === null) return null;
  const validKey = scheduleDayKey(quote.validity_date);
  if (validKey && validKey < scheduleDateKey(now)) {
    return { state: 'lapsed', days, daysPast: differenceInCalendarDays(now, localDay(validKey)) };
  }
  return days >= QUOTE_CHASE_AFTER_DAYS ? { state: 'quiet', days } : null;
}

export function quoteChaseChipLabel(chase: QuoteChase): string {
  return chase.state === 'lapsed'
    ? `Lapsed · ${plural(chase.daysPast, 'day')}`
    : `Chase · ${plural(chase.days, 'day')}`;
}

/** Patch to write after the plumber re-shares an already-sent quote. null unless status is sent. */
export function quoteChasePatch(quote: { status: string }, now: Date): { updated_at: string } | null {
  return quote.status === 'sent' ? { updated_at: now.toISOString() } : null;
}

export function invoiceChase(invoice: InvoiceChaseInput, now: Date): InvoiceChase | null {
  if (invoice.status !== 'sent' && invoice.status !== 'overdue' && invoice.status !== 'part_paid') return null;
  const updatedAt = new Date(invoice.updated_at ?? '').getTime();
  const chasedAt = new Date(invoice.chased_at ?? '').getTime();
  const touchedAt = Math.max(
    Number.isNaN(updatedAt) ? 0 : updatedAt,
    Number.isNaN(chasedAt) ? 0 : chasedAt,
  );
  if (!touchedAt) return null;
  const days = differenceInCalendarDays(now, new Date(touchedAt));
  if (days < INVOICE_CHASE_AFTER_DAYS) return null;
  const dueKey = scheduleDayKey(invoice.due_date);
  const pastDue = !!dueKey && dueKey < scheduleDateKey(now);
  if (invoice.status === 'overdue' || pastDue || (invoice.status === 'part_paid' && pastDue)) {
    const daysPast = dueKey ? differenceInCalendarDays(now, localDay(dueKey)) : 0;
    return { state: 'overdue', days, daysPast };
  }
  return { state: 'quiet', days };
}

export function invoiceChaseChipLabel(
  chase: InvoiceChase,
  invoice?: { status?: string },
): string {
  const partPaid = invoice?.status === 'part_paid';
  if (chase.state === 'overdue') {
    const tail = plural(chase.daysPast, 'day');
    return partPaid ? `Part paid · Overdue · ${tail}` : `Overdue · ${tail}`;
  }
  return partPaid ? `Part paid · Chase · ${plural(chase.days, 'day')}` : `Chase · ${plural(chase.days, 'day')}`;
}

export function invoiceChasePatch(invoice: { status: string }, now: Date): { updated_at: string } | null {
  return invoice.status === 'sent' || invoice.status === 'overdue' || invoice.status === 'part_paid'
    ? { updated_at: now.toISOString() }
    : null;
}

function quoteValidTo(validityDate: string | null | undefined): string {
  const key = scheduleDayKey(validityDate);
  return key ? `Valid to ${format(localDay(key), 'd MMM')}` : '';
}

/** Job start as a local instant on its scheduled day, or null when the job has no clock. */
export function nudgeJobStart(job: Pick<NudgeJob, 'scheduled_date' | 'start_time'>): Date | null {
  const day = scheduleDayKey(job.scheduled_date);
  const clock = /^(\d{2}):(\d{2})/.exec(job.start_time ?? '');
  if (!day || !clock) return null;
  const start = localDay(day);
  start.setHours(Number(clock[1]), Number(clock[2]), 0, 0);
  return start;
}

export function nudgeClockLabel(job: Pick<NudgeJob, 'scheduled_date' | 'start_time'>): string {
  const start = nudgeJobStart(job);
  return start ? format(start, 'h:mm aaa') : 'All day';
}

export function nudgeJobDetail(job: NudgeJob): string {
  return [formatJobRef(job), job.title.trim(), dashboardJobPlace(job)].filter(Boolean).join(' · ');
}

function onCrew(job: NudgeJob, userId: string | null): boolean {
  const crew = job.assigned_team ?? [];
  return crew.length === 0 || (!!userId && crew.includes(userId));
}

function byStart(a: NudgeJob, b: NudgeJob): number {
  const sa = nudgeJobStart(a)?.getTime() ?? Number.POSITIVE_INFINITY;
  const sb = nudgeJobStart(b)?.getTime() ?? Number.POSITIVE_INFINITY;
  return sa - sb;
}

function scheduledOn(input: NudgeInput, dayKey: string): NudgeJob[] {
  return input.jobs
    .filter(job => job.status === 'scheduled' && scheduleDayKey(job.scheduled_date) === dayKey && onCrew(job, input.userId))
    .sort(byStart);
}

const NUDGE_RULES: Record<NudgeKind, NudgeRule> = {
  leave_soon: input => {
    const from = input.now.getTime();
    const to = from + LEAVE_SOON_MINUTES * 60_000;
    return scheduledOn(input, scheduleDateKey(input.now))
      .filter(job => {
        const start = nudgeJobStart(job)?.getTime();
        return start !== undefined && start >= from && start <= to;
      })
      .map(job => ({
        key: `leave_soon:${job.id}`,
        kind: 'leave_soon' as const,
        label: `Leave soon · ${nudgeClockLabel(job)}`,
        detail: nudgeJobDetail(job),
        href: `/jobs/${job.id}`,
      }));
  },

  jobs_tomorrow: input => {
    const tomorrow = scheduledOn(input, scheduleDateKey(addDays(input.now, 1)));
    if (tomorrow.length === 0) return [];
    if (tomorrow.length > NUDGE_ROLLUP_AFTER) {
      return [{
        key: 'jobs_tomorrow:all',
        kind: 'jobs_tomorrow',
        label: `${tomorrow.length} jobs tomorrow`,
        detail: tomorrow.slice(0, NUDGE_ROLLUP_AFTER).map(formatJobRef).join(' · '),
        href: '/schedule',
      }];
    }
    return tomorrow.map(job => ({
      key: `jobs_tomorrow:${job.id}`,
      kind: 'jobs_tomorrow' as const,
      label: `Tomorrow · ${nudgeClockLabel(job)}`,
      detail: nudgeJobDetail(job),
      href: `/jobs/${job.id}`,
    }));
  },

  quote_chase: input => {
    const quiet = input.quotes
      .flatMap(quote => {
        const chase = quoteChase(quote, input.now);
        return chase?.state === 'quiet' ? [{ quote, chase }] : [];
      })
      .sort((a, b) => b.chase.days - a.chase.days);
    const lapsed = input.quotes
      .flatMap(quote => {
        const chase = quoteChase(quote, input.now);
        return chase?.state === 'lapsed' ? [{ quote, chase }] : [];
      })
      .sort((a, b) => b.chase.days - a.chase.days);
    const quietNudges = quiet.length > NUDGE_ROLLUP_AFTER
      ? [{
          key: 'quote_chase:all',
          kind: 'quote_chase' as const,
          label: `${quiet.length} quotes to chase`,
          detail: quiet.slice(0, NUDGE_ROLLUP_AFTER).map(({ quote }) => quoteRef(quote.quote_number)).join(' · '),
          href: `/quotes?status=${QUOTE_CHASE_FILTER}`,
        }]
      : quiet.map(({ quote, chase }) => {
          const ref = quoteRef(quote.quote_number);
          const total = Number(quote.total ?? 0);
          return {
            key: `quote_chase:${quote.id}`,
            kind: 'quote_chase' as const,
            label: `Chase quote ${ref}`,
            detail: [`Quiet ${plural(chase.days, 'day')}`, total > 0 ? formatMoney(total) : '', quote.client_name?.trim()]
              .filter(Boolean)
              .join(' · '),
            href: quoteChaseHref(quote.id),
          };
        });
    const lapsedNudges = lapsed.map(({ quote }) => {
      const ref = quoteRef(quote.quote_number);
      const total = Number(quote.total ?? 0);
      return {
        key: `quote_chase:${quote.id}`,
        kind: 'quote_chase' as const,
        label: `Quote ${ref} lapsed`,
        detail: [quoteValidTo(quote.validity_date), total > 0 ? formatMoney(total) : '', quote.client_name?.trim()]
          .filter(Boolean)
          .join(' · '),
        href: quoteLapsedHref(quote.id),
      };
    });
    return [...lapsedNudges, ...quietNudges];
  },

  invoice_unpaid: input => {
    const due = input.invoices
      .flatMap(invoice => {
        const chase = invoiceChase(invoice, input.now);
        return chase ? [{ invoice, chase }] : [];
      })
      .sort((a, b) => {
        if (a.chase.state !== b.chase.state) return a.chase.state === 'overdue' ? -1 : 1;
        const aDays = a.chase.state === 'overdue' ? a.chase.daysPast : a.chase.days;
        const bDays = b.chase.state === 'overdue' ? b.chase.daysPast : b.chase.days;
        return bDays - aDays;
      });
    if (due.length > NUDGE_ROLLUP_AFTER) {
      return [{
        key: 'invoice_unpaid:all',
        kind: 'invoice_unpaid',
        label: `${due.length} invoices to chase`,
        detail: due.slice(0, NUDGE_ROLLUP_AFTER).map(({ invoice }) => invoiceRef(invoice.invoice_number)).join(' · '),
        href: '/invoices?status=all',
      }];
    }
    return due.map(({ invoice, chase }) => {
      const overdue = chase.state === 'overdue';
      return {
        key: `invoice_unpaid:${invoice.id}`,
        kind: 'invoice_unpaid' as const,
        label: `${overdue ? 'Overdue' : 'Chase'} invoice ${invoiceRef(invoice.invoice_number)}`,
        detail: [
          overdue
            ? chase.daysPast > 0 ? `${plural(chase.daysPast, 'day')} overdue` : 'Overdue'
            : `Quiet ${plural(chase.days, 'day')}`,
          invoice.client_name?.trim(),
          formatMoney(Number(invoice.total ?? 0)),
        ].filter(Boolean).join(' · '),
        href: `/invoices?id=${invoice.id}&send=1`,
      };
    });
  },
};

const NUDGE_ORDER: readonly NudgeKind[] = ['leave_soon', 'jobs_tomorrow', 'quote_chase', 'invoice_unpaid'];

export function deriveNudges(input: NudgeInput): Nudge[] {
  return NUDGE_ORDER.flatMap(kind => NUDGE_RULES[kind](input)).slice(0, NUDGE_LIMIT);
}
