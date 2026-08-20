import type { QuoteStatus } from '../types/fsm';

export type QuoteActionKey =
  | 'send'
  | 'add_email'
  | 'setup_email'
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
  hasClientEmail: boolean;
  smtpReady: boolean | null;
  jobId: string | null | undefined;
  invoiceId: string | null | undefined;
  clientId?: string | null;
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

function hasUsableClientEmail(email: string | null | undefined): boolean {
  const raw = (email ?? '').trim();
  return raw.includes('@') && !raw.includes(' ');
}

export function quoteActionContext(
  quote: {
    status: QuoteStatus;
    client_id?: string | null;
    client_email?: string | null;
    line_items?: { description?: string | null; quantity?: number | string | null }[] | null;
    job_id?: string | null;
    invoice_id?: string | null;
  },
  extras?: { smtpReady?: boolean | null },
): QuoteActionContext {
  const hasClient = !!quote.client_id;
  const emailKnown = quote.client_email !== undefined;
  return {
    status: quote.status,
    hasClient,
    hasLines: quoteHasChargeableLines(quote.line_items),
    hasClientEmail: !hasClient ? false : (emailKnown ? hasUsableClientEmail(quote.client_email) : true),
    smtpReady: extras?.smtpReady ?? null,
    jobId: quote.job_id ?? null,
    invoiceId: quote.invoice_id ?? null,
    clientId: quote.client_id ?? null,
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
    if (ctx.smtpReady === false) {
      return {
        key: 'setup_email',
        label: 'Set up email',
        detail: 'Email is not set up. Add SMTP in Company settings — there is a test send there.',
      };
    }
    if (ctx.hasClientEmail === false) {
      return {
        key: 'add_email',
        label: 'Add client email',
        detail: 'This client has no email. Add one before you can send the quote.',
      };
    }
    return {
      key: 'send',
      label: 'Send',
      detail: 'Email this quote to the client. Status becomes sent only if it delivers.',
    };
  }
  if (ctx.status === 'sent') {
    return {
      key: 'accept',
      label: 'Mark accepted',
      detail: 'The quote was sent. When the client says yes, accept it so you can turn it into a job.',
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
