import type { QuoteStatus } from '../types/fsm';
import { clientEmailForSend } from './sendInvoice';

export type QuoteActionKey =
  | 'send'
  | 'add_email'
  | 'accept'
  | 'convert_job'
  | 'invoice'
  | 'open_job'
  | 'open_invoice'
  | 'none';

export type QuoteListBucket = 'draft' | 'sent' | 'accepted' | 'closed';

export type QuoteActionContext = {
  status: QuoteStatus;
  hasClient: boolean;
  hasClientEmail?: boolean;
  hasLines: boolean;
  jobId: string | null | undefined;
  invoiceId: string | null | undefined;
};

export type RecommendedQuoteAction = {
  key: QuoteActionKey;
  label: string;
  detail: string;
};

export function quoteHasChargeableLines(
  lineItems: { description?: string | null; quantity?: number | string | null }[] | null | undefined,
): boolean {
  return (lineItems ?? []).some(li => (li.description ?? '').trim() && Number(li.quantity) > 0);
}

export function quoteActionContext(quote: {
  status: QuoteStatus;
  client_id?: string | null;
  client_email?: string | null;
  line_items?: { description?: string | null; quantity?: number | string | null }[] | null;
  job_id?: string | null;
  invoice_id?: string | null;
}): QuoteActionContext {
  const hasClient = !!quote.client_id;
  const emailKnown = quote.client_email !== undefined;
  return {
    status: quote.status,
    hasClient,
    hasClientEmail: !hasClient ? false : (emailKnown ? !!clientEmailForSend(quote.client_email) : true),
    hasLines: quoteHasChargeableLines(quote.line_items),
    jobId: quote.job_id ?? null,
    invoiceId: quote.invoice_id ?? null,
  };
}

export function quoteListBucket(status: QuoteStatus): QuoteListBucket {
  if (status === 'declined' || status === 'expired') return 'closed';
  if (status === 'accepted') return 'accepted';
  if (status === 'sent') return 'sent';
  return 'draft';
}

export function recommendQuoteAction(ctx: QuoteActionContext): RecommendedQuoteAction {
  if (ctx.status === 'declined') {
    return { key: 'none', label: 'Declined', detail: 'This quote was declined.' };
  }
  if (ctx.status === 'expired') {
    return { key: 'none', label: 'Expired', detail: 'This quote has expired.' };
  }
  if (ctx.status === 'draft') {
    if (!ctx.hasClient) {
      return { key: 'none', label: 'Add a client', detail: 'Pick a client before you can send this quote.' };
    }
    if (!ctx.hasLines) {
      return { key: 'none', label: 'Add line items', detail: 'Add the work and materials so the quote has a price.' };
    }
    return {
      key: 'send',
      label: 'Send',
      detail: 'Download the PDF, copy the portal link, or open a mail draft. No Grafter SMTP.',
    };
  }
  if (ctx.status === 'sent') {
    return {
      key: 'accept',
      label: 'Mark accepted',
      detail: 'When the client says yes, accept it so you can turn it into a job.',
    };
  }
  if (!ctx.jobId) {
    return {
      key: 'convert_job',
      label: 'Convert to job',
      detail: 'Create the job from this quote. You can invoice it next.',
    };
  }
  if (!ctx.invoiceId) {
    return {
      key: 'invoice',
      label: 'Create invoice',
      detail: 'Invoice this accepted quote. It will not create a duplicate.',
    };
  }
  return {
    key: 'open_job',
    label: 'Open job',
    detail: 'This quote already has a job and an invoice.',
  };
}

export function quoteCardHint(ctx: QuoteActionContext): string {
  return recommendQuoteAction(ctx).label;
}

export function quoteMarkAcceptedWrite() {
  return { status: 'accepted' as const, close: false as const, message: 'Quote accepted' };
}

export function quoteAfterMarkAccepted(ctx: QuoteActionContext): RecommendedQuoteAction {
  return recommendQuoteAction({ ...ctx, status: 'accepted' });
}

/** Quotes list query on QuotesPage. */
export const QUOTES_LIST_QUERY_KEY = ['quotes'] as const;

/**
 * Same-page list write after editor save — #0016 at $57.00 replaces $24.00
 * without a reload. Existing id keeps its place; a new id goes to the front.
 */
export function quotesAfterSave<T extends { id: string }>(
  prev: T[] | null | undefined,
  saved: T,
): T[] {
  const list = [...(prev ?? [])];
  const index = list.findIndex(row => row.id === saved.id);
  if (index < 0) return [saved, ...list];
  list[index] = { ...list[index], ...saved };
  return list;
}
