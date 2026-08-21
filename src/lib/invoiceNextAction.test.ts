import { describe, expect, it } from 'vitest';
import {
  invoiceActionContext,
  invoiceCardHint,
  invoiceListBucket,
  recommendInvoiceAction,
} from './invoiceNextAction';

const now = new Date(2026, 7, 20); // 20 Aug 2026 local

const readyDraft = {
  status: 'draft',
  due_date: '2026-08-01',
  hasClient: true,
  hasClientEmail: true,
  smtpReady: true,
  clientId: 'c1',
  hasLines: true,
};

describe('invoiceListBucket', () => {
  it('puts overdue ahead of sent, and keeps drafts and paid distinct', () => {
    expect(invoiceListBucket({ status: 'sent', due_date: '2026-08-19' }, now)).toBe('overdue');
    expect(invoiceListBucket({ status: 'sent', due_date: '2026-08-21' }, now)).toBe('awaiting');
    expect(invoiceListBucket({ status: 'draft', due_date: '2026-08-01' }, now)).toBe('draft');
    expect(invoiceListBucket({ status: 'paid', due_date: '2026-08-01' }, now)).toBe('paid');
  });
});

describe('recommendInvoiceAction', () => {
  it('sends a ready draft — status sent is not implied', () => {
    expect(recommendInvoiceAction(readyDraft, now)).toMatchObject({
      key: 'send',
      label: 'Send',
      detail: 'Email this invoice to the client. Status becomes sent only if it delivers.',
    });
  });

  it('is honest when email is not set up', () => {
    expect(recommendInvoiceAction({ ...readyDraft, smtpReady: false }, now)).toMatchObject({
      key: 'setup_email',
      label: 'Set up email',
      href: '/settings/company',
    });
    expect(recommendInvoiceAction({ ...readyDraft, smtpReady: false }, now).detail).toMatch(/Company settings/i);
  });

  it('is honest when the client has no email', () => {
    expect(recommendInvoiceAction({ ...readyDraft, hasClientEmail: false }, now)).toMatchObject({
      key: 'add_email',
      label: 'Add client email',
      href: '/clients/c1',
    });
  });

  it('asks for a client and lines before send', () => {
    expect(recommendInvoiceAction({ ...readyDraft, hasClient: false }, now).label).toBe('Add a client');
    expect(recommendInvoiceAction({ ...readyDraft, hasLines: false }, now).label).toBe('Add line items');
  });

  it('marks paid after send — overdue is still mark paid', () => {
    expect(recommendInvoiceAction({ status: 'sent', due_date: '2026-08-21' }, now)).toMatchObject({
      key: 'mark_paid',
      detail: 'Invoice was sent. Waiting on payment.',
    });
    expect(recommendInvoiceAction({ status: 'sent', due_date: '2026-08-19' }, now)).toMatchObject({
      key: 'mark_paid',
      status: 'overdue',
      detail: 'This invoice is overdue.',
    });
    expect(recommendInvoiceAction({ status: 'paid', due_date: '2026-08-01' }, now).key).toBe('none');
  });

  it('does not treat unknown SMTP / email as a miss while they are still loading', () => {
    expect(recommendInvoiceAction({
      status: 'draft',
      hasClient: true,
      hasLines: true,
    }, now).key).toBe('send');
  });
});

describe('invoiceActionContext / invoiceCardHint', () => {
  it('reads client email and SMTP onto the next action', () => {
    const ready = invoiceActionContext(
      {
        status: 'draft',
        client_id: 'c1',
        client_email: 'jane@acme.com.au',
        line_items: [{ description: 'Board', quantity: 1 }],
      },
      { smtpReady: true },
    );
    expect(ready).toMatchObject({ hasClient: true, hasClientEmail: true, smtpReady: true, hasLines: true });
    expect(invoiceCardHint(ready, now)).toBe('Send');

    const noEmail = invoiceActionContext(
      { status: 'draft', client_id: 'c1', client_email: null, line_items: [{ description: 'Board', quantity: 1 }] },
      { smtpReady: true },
    );
    expect(invoiceCardHint(noEmail, now)).toBe('Add client email');

    const noSmtp = invoiceActionContext(
      { status: 'draft', client_id: 'c1', client_email: 'jane@acme.com.au', line_items: [{ description: 'Board', quantity: 1 }] },
      { smtpReady: false },
    );
    expect(invoiceCardHint(noSmtp, now)).toBe('Set up email');
  });

  it('uses the next action label, not a spreadsheet status', () => {
    expect(invoiceCardHint({ status: 'sent', due_date: '2026-08-21' }, now)).toBe('Mark paid');
    expect(invoiceCardHint({ status: 'paid' }, now)).toBe('Paid');
  });
});
