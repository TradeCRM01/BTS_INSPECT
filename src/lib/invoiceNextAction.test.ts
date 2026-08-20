import { describe, expect, it } from 'vitest';
import { invoiceCardHint, invoiceListBucket, recommendInvoiceAction } from './invoiceNextAction';

const now = new Date(2026, 7, 20); // 20 Aug 2026 local

describe('invoiceListBucket', () => {
  it('puts overdue ahead of sent, and keeps drafts and paid distinct', () => {
    expect(invoiceListBucket({ status: 'sent', due_date: '2026-08-19' }, now)).toBe('overdue');
    expect(invoiceListBucket({ status: 'sent', due_date: '2026-08-21' }, now)).toBe('awaiting');
    expect(invoiceListBucket({ status: 'draft', due_date: '2026-08-01' }, now)).toBe('draft');
    expect(invoiceListBucket({ status: 'paid', due_date: '2026-08-01' }, now)).toBe('paid');
  });
});

describe('recommendInvoiceAction', () => {
  it('sends drafts, then mark paid — overdue is still mark paid', () => {
    expect(recommendInvoiceAction({ status: 'draft', due_date: '2026-08-01' }, now).key).toBe('send');
    expect(recommendInvoiceAction({ status: 'sent', due_date: '2026-08-21' }, now).key).toBe('mark_paid');
    expect(recommendInvoiceAction({ status: 'sent', due_date: '2026-08-19' }, now)).toMatchObject({
      key: 'mark_paid',
      status: 'overdue',
      detail: 'This invoice is overdue.',
    });
    expect(recommendInvoiceAction({ status: 'paid', due_date: '2026-08-01' }, now).key).toBe('none');
  });
});

describe('invoiceCardHint', () => {
  it('uses the next action label, not a spreadsheet status', () => {
    expect(invoiceCardHint({ status: 'draft' }, now)).toBe('Send');
    expect(invoiceCardHint({ status: 'sent', due_date: '2026-08-21' }, now)).toBe('Mark paid');
    expect(invoiceCardHint({ status: 'paid' }, now)).toBe('Paid');
  });
});
