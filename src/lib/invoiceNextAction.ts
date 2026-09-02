import type { InvoiceStatus } from '../types/fsm';
import { effectiveInvoiceStatus } from './invoiceStatus';
import { clientEmailForSend, COMPANY_EMAIL_SETTINGS_HREF, invoiceHasChargeableLines } from './sendInvoice';

export type InvoiceActionKey = 'send' | 'setup_email' | 'add_email' | 'mark_paid' | 'none';

export type InvoiceListBucket = 'overdue' | 'draft' | 'awaiting' | 'paid';

export type InvoiceActionContext = {
  status: InvoiceStatus | string;
  due_date?: string | null;
  hasClient?: boolean;
  hasClientEmail?: boolean;
  smtpReady?: boolean | null;
  /** False only when the shared Grafter send is also known to be absent. */
  sharedSendReady?: boolean | null;
  clientId?: string | null;
  hasLines?: boolean;
};

export type RecommendedInvoiceAction = {
  key: InvoiceActionKey;
  label: string;
  detail: string;
  status: InvoiceStatus;
  href?: string;
};

export function invoiceListBucket(inv: InvoiceActionContext, now = new Date()): InvoiceListBucket {
  const status = effectiveInvoiceStatus(inv, now);
  if (status === 'paid') return 'paid';
  if (status === 'overdue') return 'overdue';
  if (status === 'draft') return 'draft';
  return 'awaiting';
}

export function invoiceActionContext(
  inv: {
    status: InvoiceStatus | string;
    due_date?: string | null;
    client_id?: string | null;
    client_email?: string | null;
    line_items?: { description?: string | null; quantity?: number | string | null }[] | null;
  },
  extras?: { smtpReady?: boolean | null; sharedSendReady?: boolean | null },
): InvoiceActionContext {
  const hasClient = !!inv.client_id;
  const emailKnown = inv.client_email !== undefined;
  return {
    status: inv.status,
    due_date: inv.due_date,
    hasClient,
    hasClientEmail: !hasClient ? false : (emailKnown ? !!clientEmailForSend(inv.client_email) : true),
    smtpReady: extras?.smtpReady ?? null,
    sharedSendReady: extras?.sharedSendReady ?? null,
    clientId: inv.client_id ?? null,
    hasLines: inv.line_items === undefined ? true : invoiceHasChargeableLines(inv.line_items),
  };
}

function invoiceSendBlocker(
  inv: InvoiceActionContext,
  status: InvoiceStatus,
): RecommendedInvoiceAction | null {
  if (inv.hasClient === false) {
    return { key: 'none', label: 'Add a client', detail: 'Pick a client before you can send this invoice.', status };
  }
  if (inv.hasLines === false) {
    return { key: 'none', label: 'Add line items', detail: 'Add at least one line item before you send.', status };
  }
  if (inv.smtpReady === false && inv.sharedSendReady === false) {
    return {
      key: 'setup_email',
      label: 'Set up email',
      detail: 'Email is not set up. Add SMTP in Company settings — there is a test send there.',
      status,
      href: COMPANY_EMAIL_SETTINGS_HREF,
    };
  }
  if (inv.hasClientEmail === false) {
    return {
      key: 'add_email',
      label: 'Add client email',
      detail: 'This client has no email. Add one before you can send the invoice.',
      status,
      href: inv.clientId ? `/clients/${inv.clientId}` : undefined,
    };
  }
  return null;
}

export function recommendInvoiceAction(inv: InvoiceActionContext, now = new Date()): RecommendedInvoiceAction {
  const status = effectiveInvoiceStatus(inv, now);
  if (status === 'paid') {
    return { key: 'none', label: 'Paid', detail: 'This invoice is paid.', status };
  }
  if (status === 'draft') {
    const blocked = invoiceSendBlocker(inv, status);
    if (blocked) return blocked;
    return {
      key: 'send',
      label: 'Send',
      detail: 'Email this invoice to the client. Status becomes sent only if it delivers.',
      status,
    };
  }
  if (status === 'overdue') {
    const blocked = invoiceSendBlocker(inv, status);
    if (blocked) return blocked;
    return {
      key: 'send',
      label: 'Send again',
      detail: 'This invoice is overdue. Send it again to chase the client. Status stays honest if it misses.',
      status,
    };
  }
  return { key: 'mark_paid', label: 'Mark paid', detail: 'Invoice was sent. Waiting on payment.', status };
}

/** Mark paid stays available on overdue, but it is never the next action. */
export function invoiceOverflowPaidAction(
  inv: InvoiceActionContext,
  now = new Date(),
): RecommendedInvoiceAction | null {
  const status = effectiveInvoiceStatus(inv, now);
  if (status !== 'overdue') return null;
  return { key: 'mark_paid', label: 'Mark paid', detail: 'This invoice is overdue.', status };
}

export function invoiceCardHint(inv: InvoiceActionContext, now = new Date()): string {
  return recommendInvoiceAction(inv, now).label;
}
