import type { QuoteStatus } from '../types/fsm';

export type QuoteActionKey =
  | 'send'
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
  line_items?: { description?: string | null; quantity?: number | string | null }[] | null;
  job_id?: string | null;
  invoice_id?: string | null;
}): QuoteActionContext {
  return {
    status: quote.status,
    hasClient: !!quote.client_id,
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
      detail: 'Mark as sent when you give this to the client. Preview the PDF if you need a copy.',
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
