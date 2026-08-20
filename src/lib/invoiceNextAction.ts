import type { InvoiceStatus } from '../types/fsm';
import { effectiveInvoiceStatus } from './invoiceStatus';

export type InvoiceActionKey = 'send' | 'mark_paid' | 'none';

export type InvoiceListBucket = 'overdue' | 'draft' | 'awaiting' | 'paid';

export type InvoiceActionContext = {
  status: InvoiceStatus | string;
  due_date?: string | null;
};

export type RecommendedInvoiceAction = {
  key: InvoiceActionKey;
  label: string;
  detail: string;
  status: InvoiceStatus;
};

export function invoiceListBucket(inv: InvoiceActionContext, now = new Date()): InvoiceListBucket {
  const status = effectiveInvoiceStatus(inv, now);
  if (status === 'paid') return 'paid';
  if (status === 'overdue') return 'overdue';
  if (status === 'draft') return 'draft';
  return 'awaiting';
}

export function recommendInvoiceAction(inv: InvoiceActionContext, now = new Date()): RecommendedInvoiceAction {
  const status = effectiveInvoiceStatus(inv, now);
  if (status === 'paid') {
    return { key: 'none', label: 'Paid', detail: 'This invoice is paid.', status };
  }
  if (status === 'draft') {
    return {
      key: 'send',
      label: 'Send',
      detail: 'Mark as sent when you give this to the client. Preview the PDF if you need a copy.',
      status,
    };
  }
  if (status === 'overdue') {
    return { key: 'mark_paid', label: 'Mark paid', detail: 'This invoice is overdue.', status };
  }
  return { key: 'mark_paid', label: 'Mark paid', detail: 'Waiting on payment.', status };
}

export function invoiceCardHint(inv: InvoiceActionContext, now = new Date()): string {
  return recommendInvoiceAction(inv, now).label;
}
