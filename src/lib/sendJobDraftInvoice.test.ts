import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  NO_EMAIL_MESSAGE,
  NO_PDF_MESSAGE,
  NO_SMTP_MESSAGE,
} from './sendInvoice';
import { jobDraftSendToast, sendJobDraftInvoice } from './sendJobDraftInvoice';
import type { DeliverInvoiceResult } from './sendInvoiceDeliver';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const company = { id: 'co-1', name: 'BTS Electrical' };
const draft = { id: 'inv-draft', status: 'draft' as const, due_date: null };

function sentOk(over?: Partial<Extract<DeliverInvoiceResult, { ok: true }>>): DeliverInvoiceResult {
  return {
    ok: true,
    to: 'jane@acme.com.au',
    markedSent: true,
    message: 'Invoice sent to jane@acme.com.au',
    sms: null,
    xero: { ok: true, message: 'Pushed 1 invoice to Xero.' },
    ...over,
  };
}

describe('sendJobDraftInvoice', () => {
  it('delivers the existing draft through deliverInvoice — same invoiceId pipe', async () => {
    const deliver = vi.fn(async (args: { invoiceId: string }) => sentOk());
    const result = await sendJobDraftInvoice({
      invoices: [draft],
      company,
      deliver,
    });
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0][0].invoiceId).toBe('inv-draft');
    expect(deliver.mock.calls[0][0].company.id).toBe('co-1');
    expect(result).toEqual(sentOk());
  });

  it('does not invent an email, insert a draft, or send when a sent invoice already exists', async () => {
    const deliver = vi.fn(async () => sentOk());
    const none = await sendJobDraftInvoice({ invoices: [], company, deliver });
    const issued = await sendJobDraftInvoice({
      invoices: [
        { id: 'inv-sent', status: 'sent', due_date: '2026-09-01' },
        draft,
      ],
      company,
      deliver,
    });
    const paid = await sendJobDraftInvoice({
      invoices: [{ id: 'inv-paid', status: 'paid', due_date: null }],
      company,
      deliver,
    });
    const overdue = await sendJobDraftInvoice({
      invoices: [{ id: 'inv-over', status: 'overdue', due_date: '2026-08-01' }],
      company,
      deliver,
    });
    expect(none).toEqual({ ok: false, message: 'Invoice not found.', markedSent: false });
    expect(issued.message).toBe('Invoice not found.');
    expect(paid.ok).toBe(false);
    expect(overdue.ok).toBe(false);
    expect(deliver).not.toHaveBeenCalled();
  });

  it('passes through honest send misses — no invented To', async () => {
    const noEmail = await sendJobDraftInvoice({
      invoices: [draft],
      company,
      deliver: async () => ({ ok: false, message: NO_EMAIL_MESSAGE, markedSent: false }),
    });
    const noSmtp = await sendJobDraftInvoice({
      invoices: [draft],
      company,
      deliver: async () => ({ ok: false, message: NO_SMTP_MESSAGE, markedSent: false }),
    });
    const noPdf = await sendJobDraftInvoice({
      invoices: [draft],
      company,
      deliver: async () => ({ ok: false, message: NO_PDF_MESSAGE, markedSent: false }),
    });
    expect(noEmail).toEqual({ ok: false, message: NO_EMAIL_MESSAGE, markedSent: false });
    expect(noSmtp.message).toBe(NO_SMTP_MESSAGE);
    expect(noPdf.message).toBe(NO_PDF_MESSAGE);
  });

  it('names Xero-on-send miss with the signed line — send still succeeded', () => {
    expect(jobDraftSendToast(sentOk())).toEqual({
      message: 'Invoice sent to jane@acme.com.au',
      kind: 'success',
    });
    expect(jobDraftSendToast({
      ok: false,
      message: NO_EMAIL_MESSAGE,
      markedSent: false,
    })).toEqual({ message: NO_EMAIL_MESSAGE, kind: 'info' });
    expect(jobDraftSendToast(sentOk({
      xero: { ok: false, message: 'Xero is not connected.' },
    })).message).toBe('Invoice sent. Xero is not connected.');
  });
});

describe('job-sheet Send next — wiring', () => {
  it('Next Send presses sendJobDraftInvoice / deliverInvoice, not a dialog or a second draft', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const send = src('src/lib/sendJobDraftInvoice.ts');
    const next = src('src/lib/jobNextAction.ts');
    const handleStart = page.indexOf('const handleSend');
    const handleEnd = page.indexOf('const next = recommendJobAction');
    expect(handleStart).toBeGreaterThan(-1);
    expect(handleEnd).toBeGreaterThan(handleStart);
    const handle = page.slice(handleStart, handleEnd);

    expect(next).toContain("key: 'send'");
    expect(next).toContain("label: 'Send'");
    expect(next).toContain('pickJobDraftToSend');
    expect(next).toContain('jobInvoiceActionFlags');
    expect(next).not.toContain("label: 'Send again'");

    expect(send).toContain('deliverInvoice');
    expect(send).toContain('defaultInvoicePdfBuilder');
    expect(send).toContain('pickJobDraftToSend');
    expect(send).toContain('invoiceSendCompanyFrom');
    expect(send).not.toContain('createInvoiceFromJobBill');
    expect(send).not.toContain('convertQuoteToInvoice');
    expect(send).not.toContain('InvoiceSendDialog');
    expect(send).not.toContain('insert({');
    expect(send).not.toContain('CREATE TABLE');
    expect(send).not.toContain('ALTER TABLE');
    expect(send).not.toContain('cron.schedule');

    expect(page).toContain('sendJobDraftInvoice');
    expect(page).toContain('jobDraftSendToast');
    expect(page).toContain('jobInvoiceActionFlags');
    expect(page).toContain("next.key === 'send'");
    expect(page).toContain('sendJobDraft.mutate()');
    expect(page).toContain("invalidateQueries({ queryKey: ['job-invoices', id] })");
    expect(page).toContain("invalidateQueries({ queryKey: ['invoices'] })");
    expect(page).toContain('ops-next-control-block');
    expect(page).not.toContain('InvoiceSendDialog');
    expect(page).not.toContain('QuoteSendDialog');
    expect(page).not.toContain('Send again');
    expect(page).not.toContain('ChaseDialog');
    expect(handle).toContain('sendJobDraft.mutate()');
    expect(handle).not.toContain('createInvoiceFromJobBill');
    expect(handle).not.toContain('convertQuoteToInvoice');
    expect(handle).not.toContain('invoiceFromJobBill');
    expect(handle).not.toContain('navigate(');
  });

  it('leaves Invoice next and invoice-sheet Send / chase as signed', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const invoicesPage = src('src/pages/InvoicesPage.tsx');
    const dialog = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const invoiceNext = src('src/lib/invoiceNextAction.ts');
    const handleInvoice = page.slice(
      page.indexOf('const handleInvoice'),
      page.indexOf('const handleSend'),
    );

    expect(handleInvoice).toContain('invoiceFromJobBill.mutate()');
    expect(handleInvoice).not.toContain('sendJobDraftInvoice');
    expect(handleInvoice).not.toContain('deliverInvoice');
    expect(page).toContain("next.key === 'invoice'");
    expect(invoicesPage).toContain('InvoiceSendDialog');
    expect(invoicesPage).toContain('Send again');
    expect(dialog).toContain('deliverInvoice');
    expect(invoiceNext).toContain("label: 'Send again'");
    expect(invoiceNext).toContain('invoiceOverflowPaidAction');
  });

  it('leaves quote convert / PR #17 off this control', () => {
    const send = src('src/lib/sendJobDraftInvoice.ts');
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    expect(send).not.toContain('convertQuoteToInvoice');
    expect(send).not.toContain('buildInvoiceFromQuote');
    expect(quoteConvert).not.toContain('sendJobDraftInvoice');
    expect(quotesPage).not.toContain('sendJobDraftInvoice');
  });
});
