import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  decideInvoiceReceipt,
  decideInvoiceReceiptOnMarkPaid,
  decideInvoiceSend,
  INVOICE_RECEIPT_ON_MARK_PAID_PATH,
  INVOICE_SEND_PIPE,
  invoiceChasedAtPatchAfterSend,
  invoiceReceiptOnMarkPaidBody,
  invoiceSendCopyKind,
  invoiceStatusAfterSend,
  missInvoiceReceiptMessage,
  NO_RECEIPT_EMAIL_MESSAGE,
  NO_RECEIPT_PDF_MESSAGE,
  NO_RECEIPT_SMTP_MESSAGE,
  shouldRecordInvoiceSent,
  shouldWriteInvoiceChasedAt,
  type InvoiceSendBundle,
  type InvoiceSendInvoice,
} from './sendInvoice';
import {
  deliverInvoiceReceiptAfterMarkPaid,
  invoiceMarkPaidReceiptToast,
  invoiceMarkPaidSheetMissLine,
} from './sendInvoiceDeliver';
import { INVOICE_MARKED_PAID_MESSAGE } from './xeroAccounting';

const smtp = {
  smtp_host: 'smtp.resend.com',
  smtp_pass: 're_test',
  from_name: 'BTS Electrical',
  from_email: 'invoices@btselectrical.com.au',
};

const company = { id: 'co1', name: 'BTS Electrical', email: 'office@btselectrical.com.au' };

const paidInvoice: InvoiceSendInvoice = {
  id: 'inv-1',
  company_id: 'co1',
  invoice_number: 18,
  client_id: 'c1',
  job_id: 'job-1',
  status: 'paid',
  line_items: [{ description: 'Switchboard test', quantity: 2, unit_price: 220 }],
  subtotal: 440,
  tax_rate: 10,
  tax_amount: 44,
  total: 484,
  payment_terms: 'Net 30',
  due_date: '2026-08-01',
  notes: null,
  inclusions: [],
  exclusions: [],
  chased_at: null,
};

const client = {
  id: 'c1',
  name: 'Acme Plumbing',
  email: 'jane@acme.com.au',
  phone: '0412 345 678',
  address: '12 Smith St',
};

function bundle(over: Partial<InvoiceSendBundle> = {}): InvoiceSendBundle {
  return {
    invoice: paidInvoice,
    client,
    jobAddress: 'Warehouse B',
    smtp,
    company,
    ...over,
  };
}

describe('decideInvoiceReceiptOnMarkPaid', () => {
  it('starts only after Mark paid succeeded on a paid invoice id', () => {
    expect(decideInvoiceReceiptOnMarkPaid({ paidSucceeded: false, invoiceId: 'inv-1', status: 'paid' }))
      .toEqual({ ok: false, reason: 'not_paid' });
    expect(decideInvoiceReceiptOnMarkPaid({ paidSucceeded: true, invoiceId: '  ', status: 'paid' }))
      .toEqual({ ok: false, reason: 'not_found' });
    expect(decideInvoiceReceiptOnMarkPaid({ paidSucceeded: true, invoiceId: 'inv-1', status: 'sent' }))
      .toEqual({ ok: false, reason: 'not_paid' });
    expect(decideInvoiceReceiptOnMarkPaid({ paidSucceeded: true, invoiceId: 'inv-1', status: 'overdue' }))
      .toEqual({ ok: false, reason: 'not_paid' });
    expect(decideInvoiceReceiptOnMarkPaid({ paidSucceeded: true, invoiceId: 'inv-1', status: 'draft' }))
      .toEqual({ ok: false, reason: 'not_paid' });
    expect(decideInvoiceReceiptOnMarkPaid({ paidSucceeded: true, invoiceId: 'inv-1', status: 'paid' }))
      .toEqual({ ok: true, invoiceId: 'inv-1' });
    expect(invoiceReceiptOnMarkPaidBody('inv-1')).toEqual({ invoiceId: 'inv-1', purpose: 'receipt' });
  });
});

describe('decideInvoiceReceipt', () => {
  it('prefills To from the paid-invoice client with receipt subject', () => {
    const decision = decideInvoiceReceipt(bundle());
    expect(decision).toEqual({
      ok: true,
      to: 'jane@acme.com.au',
      toName: 'Acme Plumbing',
      subject: 'Receipt for invoice #0018 from BTS Electrical',
      filename: 'invoice-0018.pdf',
      smsTo: '+61412345678',
      smsMessage: null,
    });
    expect(decision.ok && decision.subject).not.toMatch(/overdue/i);
    expect(decideInvoiceSend(bundle()).ok).toBe(false);
  });

  it('names honest misses — no email, no SMTP, no client, no lines, not paid, no invoice', () => {
    const noEmail = decideInvoiceReceipt(bundle({ client: { ...client, email: null } }));
    expect(noEmail.ok).toBe(false);
    if (!noEmail.ok) {
      expect(noEmail.blocker).toBe('no_email');
      expect(noEmail.message).toBe(NO_RECEIPT_EMAIL_MESSAGE);
      expect(noEmail.href).toBe('/clients/c1');
    }

    const noSmtp = decideInvoiceReceipt(bundle({ smtp: null }));
    expect(noSmtp.ok).toBe(false);
    if (!noSmtp.ok) {
      expect(noSmtp.blocker).toBe('no_smtp');
      expect(noSmtp.message).toBe(NO_RECEIPT_SMTP_MESSAGE);
      expect(noSmtp.href).toBe('/settings/company');
    }

    const noClient = decideInvoiceReceipt(bundle({ invoice: { ...paidInvoice, client_id: null } }));
    expect(noClient.ok).toBe(false);
    if (!noClient.ok) expect(noClient.blocker).toBe('no_client');

    const noLines = decideInvoiceReceipt(bundle({
      invoice: { ...paidInvoice, line_items: [{ description: 'Labour', quantity: 0, unit_price: 10 }] },
    }));
    expect(noLines.ok).toBe(false);
    if (!noLines.ok) expect(noLines.blocker).toBe('no_lines');

    const unpaid = decideInvoiceReceipt(bundle({ invoice: { ...paidInvoice, status: 'overdue' } }));
    expect(unpaid.ok).toBe(false);
    if (!unpaid.ok) {
      expect(unpaid.blocker).toBe('not_paid');
      expect(unpaid.message).toMatch(/paid invoices/i);
    }

    const missing = decideInvoiceReceipt(bundle({ invoice: null }));
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.blocker).toBe('not_found');

    expect(missInvoiceReceiptMessage('no_pdf')).toBe(NO_RECEIPT_PDF_MESSAGE);
    expect(missInvoiceReceiptMessage('no_phone')).toMatch(/no phone/i);
    expect(missInvoiceReceiptMessage('no_sms_credentials')).toMatch(/not set up/i);
  });

  it('still emails when the client has no phone — SMS is an honest miss, not a blocker', () => {
    const decision = decideInvoiceReceipt(bundle({ client: { ...client, phone: null } }));
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.to).toBe('jane@acme.com.au');
    expect(decision.smsTo).toBeNull();
    expect(decision.smsMessage).toMatch(/no phone/i);
  });
});

describe('receipt is not a chase and does not unmark paid', () => {
  it('does not write chased_at or flip paid → sent', () => {
    expect(invoiceSendCopyKind({ status: 'paid' })).toBe('receipt');
    expect(invoiceChasedAtPatchAfterSend(true, 'receipt')).toBeNull();
    expect(shouldWriteInvoiceChasedAt(true, 'receipt')).toBe(false);
    expect(invoiceStatusAfterSend(true, 'paid')).toBe('paid');
    expect(invoiceStatusAfterSend(false, 'paid')).toBe('paid');
    expect(shouldRecordInvoiceSent(true, 'paid')).toBe(false);
  });
});

describe('deliverInvoiceReceiptAfterMarkPaid', () => {
  const pdf = { filename: 'invoice-0018.pdf', content: 'JVBERi0=', contentType: 'application/pdf' };

  it('does not invoke job-reminder when Mark paid missed or the invoice is not paid', async () => {
    const calls: unknown[] = [];
    const invoke = async (name: string, opts: { body: Record<string, unknown> }) => {
      calls.push({ name, opts });
      return { data: null, error: null };
    };
    const missed = await deliverInvoiceReceiptAfterMarkPaid(invoke, {
      paidSucceeded: false,
      invoiceId: 'inv-1',
      status: 'paid',
      company,
    });
    expect(missed.ok).toBe(false);
    expect(missed.markedPaid).toBe(false);
    if (!missed.ok) expect(missed.reason).toBe('not_paid');
    expect(calls).toEqual([]);

    const unpaid = await deliverInvoiceReceiptAfterMarkPaid(invoke, {
      paidSucceeded: true,
      invoiceId: 'inv-1',
      status: 'overdue',
      company,
    });
    expect(unpaid.ok).toBe(false);
    expect(unpaid.markedPaid).toBe(false);
    expect(calls).toEqual([]);
  });

  it('invokes the existing job-reminder invoiceId pipe with receipt purpose — not xero-accounting', async () => {
    const calls: Array<{ name: string; body: Record<string, unknown> }> = [];
    const result = await deliverInvoiceReceiptAfterMarkPaid(async (name, opts) => {
      calls.push({ name, body: opts.body });
      return {
        data: { sent: true, to: 'jane@acme.com.au', message: 'Receipt sent to jane@acme.com.au', sms: { sent: true, to: '+61412345678', message: 'SMS sent to +61412345678' } },
        error: null,
      };
    }, {
      paidSucceeded: true,
      invoiceId: 'inv-1',
      status: 'paid',
      company,
      loadBundle: async () => bundle({ existingPdf: pdf }),
    });
    expect(result).toMatchObject({
      ok: true,
      to: 'jane@acme.com.au',
      markedPaid: true,
    });
    if (result.ok) expect(result.message).toMatch(/receipt sent to jane@acme.com.au/i);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.name).toBe('job-reminder');
    expect(calls[0]?.body.invoiceId).toBe('inv-1');
    expect(calls[0]?.body.purpose).toBe('receipt');
    expect(calls[0]?.body.attachment).toEqual(pdf);
    expect(calls.some(call => call.name === 'xero-accounting')).toBe(false);
  });

  it('names a send miss and keeps markedPaid — no invent, no unmark', async () => {
    const noEmail = await deliverInvoiceReceiptAfterMarkPaid(async () => {
      throw new Error('should not invoke');
    }, {
      paidSucceeded: true,
      invoiceId: 'inv-1',
      status: 'paid',
      company,
      loadBundle: async () => bundle({ client: { ...client, email: null } }),
    });
    expect(noEmail).toMatchObject({
      ok: false,
      reason: 'no_email',
      markedPaid: true,
      message: NO_RECEIPT_EMAIL_MESSAGE,
    });

    const noPdf = await deliverInvoiceReceiptAfterMarkPaid(async () => {
      throw new Error('should not invoke');
    }, {
      paidSucceeded: true,
      invoiceId: 'inv-1',
      status: 'paid',
      company,
      loadBundle: async () => bundle({ existingPdf: null }),
      buildPdf: async () => { throw new Error('no pdf'); },
    });
    expect(noPdf).toMatchObject({ ok: false, reason: 'no_pdf', markedPaid: true, message: NO_RECEIPT_PDF_MESSAGE });

    const resendMiss = await deliverInvoiceReceiptAfterMarkPaid(async () => ({
      data: { sent: false, reason: 'no_smtp', message: NO_RECEIPT_SMTP_MESSAGE },
      error: null,
    }), {
      paidSucceeded: true,
      invoiceId: 'inv-1',
      status: 'paid',
      company,
      loadBundle: async () => bundle({ existingPdf: pdf }),
    });
    expect(resendMiss).toMatchObject({
      ok: false,
      reason: 'no_smtp',
      markedPaid: true,
      message: NO_RECEIPT_SMTP_MESSAGE,
    });
  });

  it('treats SMS miss as beside email — receipt success follows sent true only', async () => {
    const smsMiss = await deliverInvoiceReceiptAfterMarkPaid(async () => ({
      data: {
        sent: true,
        to: 'jane@acme.com.au',
        message: 'Receipt sent to jane@acme.com.au This client has no phone — SMS was not sent.',
        sms: { sent: false, to: null, reason: 'no_phone', message: 'This client has no phone — SMS was not sent.' },
      },
      error: null,
    }), {
      paidSucceeded: true,
      invoiceId: 'inv-1',
      status: 'paid',
      company,
      loadBundle: async () => bundle({ existingPdf: pdf, client: { ...client, phone: null } }),
    });
    expect(smsMiss.ok).toBe(true);
    expect(smsMiss.markedPaid).toBe(true);
    if (smsMiss.ok) {
      expect(smsMiss.sms?.sent).toBe(false);
      expect(smsMiss.message).toMatch(/no phone/i);
    }
  });
});

describe('mark paid toast names receipt and Xero misses without unmarking', () => {
  it('keeps paid first, then receipt, then the existing Xero miss', () => {
    expect(invoiceMarkPaidReceiptToast({
      xeroToast: INVOICE_MARKED_PAID_MESSAGE,
      receipt: { ok: true, message: 'Receipt sent to jane@acme.com.au' },
    })).toBe('Invoice marked as paid. Receipt sent to jane@acme.com.au.');

    expect(invoiceMarkPaidReceiptToast({
      xeroToast: 'Invoice marked as paid. Xero is not connected.',
      receipt: { ok: false, message: NO_RECEIPT_EMAIL_MESSAGE },
    })).toBe('Invoice marked as paid. Xero is not connected. This client has no email — receipt was not sent.');

    expect(invoiceMarkPaidSheetMissLine({
      xeroLine: null,
      receipt: { ok: true, message: 'Receipt sent to jane@acme.com.au' },
    })).toBeNull();
    expect(invoiceMarkPaidSheetMissLine({
      xeroLine: 'Invoice marked as paid. Xero is not connected.',
      receipt: { ok: true, message: 'Receipt sent to jane@acme.com.au' },
    })).toBe('Invoice marked as paid. Xero is not connected.');
    expect(invoiceMarkPaidSheetMissLine({
      xeroLine: null,
      receipt: { ok: false, message: NO_RECEIPT_PDF_MESSAGE },
    })).toBe('Invoice marked as paid. The invoice PDF could not be attached — receipt was not sent.');
  });
});

describe('INVOICE_RECEIPT_ON_MARK_PAID_PATH', () => {
  it('reuses job-reminder invoiceId / deliverInvoiceSend — not a new cron, dialog, or PDF type', () => {
    const path = INVOICE_RECEIPT_ON_MARK_PAID_PATH.join(' ');
    expect(path).toMatch(/job-reminder/);
    expect(path).toMatch(/invoiceId/);
    expect(path).toMatch(/deliverInvoiceSend/);
    expect(path).toMatch(/purpose=receipt/);
    expect(path).toMatch(/api\.resend\.com/);
    expect(path).toMatch(/Twilio/);
    expect(path).toMatch(/chased_at/);
    expect(path).toMatch(/paid stays paid/);
    expect(path).toMatch(/attachXeroPaymentAfterMarkPaid/);
    expect(path).not.toMatch(/send-quote/);
    expect(path).not.toMatch(/due=overdue/);
    expect(INVOICE_SEND_PIPE.join(' ')).toMatch(/purpose=receipt/);
  });
});

describe('receipt source lock — Mark paid sheet, existing pipe, quotes off', () => {
  const page = readFileSync(resolve(process.cwd(), 'src/pages/InvoicesPage.tsx'), 'utf8');
  const deliver = readFileSync(resolve(process.cwd(), 'src/lib/sendInvoiceDeliver.ts'), 'utf8');
  const send = readFileSync(resolve(process.cwd(), 'src/lib/sendInvoice.ts'), 'utf8');
  const dialog = readFileSync(resolve(process.cwd(), 'src/components/invoicing/InvoiceSendDialog.tsx'), 'utf8');
  const nextAction = readFileSync(resolve(process.cwd(), 'src/lib/invoiceNextAction.ts'), 'utf8');
  const edge = readFileSync(resolve(process.cwd(), 'supabase/functions/job-reminder/index.ts'), 'utf8');
  const xero = readFileSync(resolve(process.cwd(), 'src/lib/xeroAccounting.ts'), 'utf8');
  const quotesPage = readFileSync(resolve(process.cwd(), 'src/pages/QuotesPage.tsx'), 'utf8');
  const quoteNext = readFileSync(resolve(process.cwd(), 'src/lib/quoteNextAction.ts'), 'utf8');
  const hop = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20260821210000_063_overdue_invoice_chase_autofire.sql'),
    'utf8',
  );

  it('fires after local paid on the existing sheet — beside Xero, no new surface', () => {
    expect(page).toContain('attachXeroPaymentAfterMarkPaid');
    expect(page).toContain('deliverInvoiceReceiptAfterMarkPaid');
    expect(page).toContain('invoiceMarkPaidToast');
    expect(page).toContain('invoiceMarkPaidReceiptToast');
    expect(page).toContain('invoiceMarkPaidXeroMissLine');
    expect(page).toContain('invoiceMarkPaidSheetMissLine');
    expect(page).toContain('markPaid: true');
    expect(page).toContain("chasePrimary ? 'btn-primary' : 'hub-next'");
    expect(page).toContain('Send again');
    expect(page).toContain('hub-invoice-more');
    expect(page).not.toContain('Send receipt');
    expect(page).not.toContain('ReceiptDialog');
    expect(page).not.toContain('InvoiceReceiptDialog');
    expect(page).not.toContain('MarkPaidDialog');
    expect(page).not.toContain('chased_at');
    expect(nextAction).toContain("label: 'Send again'");
    expect(nextAction).toContain('invoiceOverflowPaidAction');
    expect(nextAction).not.toContain('Send receipt');
    expect(nextAction).not.toContain('receipt');

    const listFn = page.indexOf('const patchPaid');
    const listPaid = page.indexOf("persistableInvoiceStatus('paid')", listFn);
    const listAttach = page.indexOf('attachXeroPaymentAfterMarkPaid', listFn);
    const listReceipt = page.indexOf('deliverInvoiceReceiptAfterMarkPaid', listFn);
    expect(listPaid).toBeGreaterThan(listFn);
    expect(listAttach).toBeGreaterThan(listPaid);
    expect(listReceipt).toBeGreaterThan(listAttach);
    const listAfterPaid = page.slice(listPaid, page.indexOf('const persist'));
    expect(listAfterPaid).not.toMatch(/status:\s*'sent'/);
    expect(listAfterPaid).not.toContain("persistableInvoiceStatus('sent')");

    const finishPaid = page.indexOf('const finishPaid');
    const finishAttach = page.indexOf('attachXeroPaymentAfterMarkPaid', finishPaid);
    const finishReceipt = page.indexOf('deliverInvoiceReceiptAfterMarkPaid', finishPaid);
    expect(finishAttach).toBeGreaterThan(finishPaid);
    expect(finishReceipt).toBeGreaterThan(finishAttach);
  });

  it('reuses deliverInvoiceSend / invoiceId — receipt copy, no chased_at, paid stays paid', () => {
    expect(deliver).toContain("invoke('job-reminder'");
    expect(deliver).toContain('invoiceReceiptOnMarkPaidBody');
    expect(send).toContain("purpose: 'receipt'");
    expect(deliver).toContain('deliverInvoiceReceiptAfterMarkPaid');
    expect(deliver).toContain('decideInvoiceReceipt');
    expect(deliver).not.toContain('attachXeroPaymentAfterMarkPaid');
    expect(deliver).toContain('pushInvoiceToXeroAfterSend');
    expect(deliver).not.toContain('chased_at');
    expect(deliver).not.toContain('send-quote');
    expect(deliver).not.toContain("invoke('send-invoice'");
    expect(send).toContain('invoiceReceiptSubject');
    expect(send).toContain('invoiceReceiptHtml');
    expect(send).toContain('invoiceReceiptSmsBody');
    expect(send).toContain("kind !== 'chase'");
    expect(dialog).toContain('decideInvoiceSend');
    expect(dialog).not.toContain('decideInvoiceReceipt');
    expect(dialog).not.toContain('purpose: \'receipt\'');
    expect(dialog).not.toContain('deliverInvoiceReceiptAfterMarkPaid');
    expect(xero).toContain('attachXeroPaymentAfterMarkPaid');
    expect(xero).toContain('decideXeroPaymentOnMarkPaid');

    expect(edge).toContain('has received payment');
    expect(edge).toContain('Receipt for invoice');
    expect(edge).toContain('received payment for invoice');
    const deliverStart = edge.indexOf('async function deliverInvoiceSend');
    const deliverFn = edge.slice(deliverStart, edge.indexOf('function reportSiteName'));
    expect(deliverFn).toContain('purpose === "receipt"');
    expect(deliverFn).toContain('invoiceReceiptHtml');
    expect(deliverFn).toContain('invoiceReceiptSmsBody');
    expect(deliverFn).toContain('copyKind === "receipt"');
    expect(deliverFn).toContain('copyKind !== "receipt"');
    expect(deliverFn).toContain('invoicePatch.chased_at = sentAt');
    expect(deliverFn).toContain('copyKind === "chase"');
    expect(deliverFn).toContain('mode === "auto"');
    expect(deliverFn.indexOf('if (!res.ok)')).toBeLessThan(deliverFn.indexOf('invoicePatch.chased_at = sentAt'));
    expect(deliverFn).not.toContain('from("quotes")');
    expect(deliverFn).not.toContain('send-quote');

    const invoiceStart = edge.indexOf('if (invoiceId)');
    const invoiceBlock = edge.slice(invoiceStart, edge.indexOf('if (reportId)'));
    expect(invoiceBlock).toContain('deliverInvoiceSend');
    expect(invoiceBlock).toContain('purpose');
    expect(invoiceBlock).toContain('mode: "manual"');

    const overdueStart = edge.indexOf('if (due === "overdue")');
    const overdue = edge.slice(overdueStart, edge.indexOf('if (invoiceId)'));
    expect(overdue).toContain('mode: "auto"');
    expect(overdue).toContain('stampSentPastDueOverdue');
    expect(overdue.indexOf('stampSentPastDueOverdue')).toBeLessThan(overdue.indexOf('deliverInvoiceSend'));
    expect(overdue).not.toContain('purpose: "receipt"');
    expect(overdue).not.toContain('invoiceReceiptHtml');
  });

  it('does not touch quotes, chase autofire cron, or add a table / route / dialog', () => {
    expect(quotesPage).not.toContain('deliverInvoiceReceiptAfterMarkPaid');
    expect(quotesPage).not.toContain('purpose: \'receipt\'');
    expect(quotesPage).not.toContain('chased_at');
    expect(quoteNext).not.toContain('receipt');
    expect(quoteNext).not.toContain('deliverInvoiceReceiptAfterMarkPaid');
    expect(hop).toContain('{"due":"overdue","source":"cron"}');
    expect(hop).not.toContain('purpose');
    expect(hop).not.toContain('receipt');
    expect(page).not.toContain('create table');
    expect(page).not.toContain('cron.schedule');
    expect(dialog).not.toContain('Receipt for invoice');
    expect(nextAction).not.toContain("label: 'Send receipt'");
  });
});
