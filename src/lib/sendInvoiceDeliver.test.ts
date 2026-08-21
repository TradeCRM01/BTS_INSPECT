import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  INVOICE_SEND_PIPE,
  invoiceByIdQuery,
  invoiceSendQueries,
  wouldScanLedgerToSendInvoice,
} from './sendInvoice';

describe('invoice send deliver path', () => {
  it('invokes job-reminder, not send-quote or a new send-invoice function', () => {
    const deliver = readFileSync(resolve(process.cwd(), 'src/lib/sendInvoiceDeliver.ts'), 'utf8');
    const dialog = readFileSync(resolve(process.cwd(), 'src/components/invoicing/InvoiceSendDialog.tsx'), 'utf8');
    const page = readFileSync(resolve(process.cwd(), 'src/pages/InvoicesPage.tsx'), 'utf8');
    const nextAction = readFileSync(resolve(process.cwd(), 'src/lib/invoiceNextAction.ts'), 'utf8');
    const edge = readFileSync(resolve(process.cwd(), 'supabase/functions/job-reminder/index.ts'), 'utf8');
    const cron = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260821190000_061_invoice_chased_at.sql'), 'utf8');

    expect(deliver).toContain("invoke('job-reminder'");
    expect(deliver).toContain('invoiceId');
    expect(deliver).not.toContain('send-quote');
    expect(deliver).not.toContain('sendQuote');
    expect(deliver).not.toContain("invoke('send-invoice'");
    expect(dialog).not.toContain('QuoteSend');
    expect(dialog).not.toContain('send-quote');
    expect(page).toContain('InvoiceSendDialog');
    expect(page).toContain('invoiceOverflowPaidAction');
    expect(page).toContain('Send again');
    expect(nextAction).toContain("label: 'Send again'");
    expect(nextAction).toContain('invoiceOverflowPaidAction');
    expect(page).not.toContain('QuoteSendDialog');
    expect(page).not.toContain('send-quote');
    expect(page).not.toContain('InvoiceChase');
    expect(page).not.toContain('ChaseDialog');
    expect(edge).toContain('invoiceId');
    expect(edge).toContain('due === "overdue"');
    expect(edge).toContain('from("invoices")');
    expect(edge).toContain('api.resend.com/emails');
    expect(edge).toContain('email_settings');
    expect(edge).toContain('status: "sent"');
    expect(edge).toContain('chased_at');
    expect(edge).toContain('alreadyChasedToday');
    expect(edge).toContain('is chasing overdue invoice');
    expect(edge).toContain('has sent you invoice');
    expect(cron).toContain('ADD COLUMN IF NOT EXISTS chased_at timestamptz');
    expect(cron).toContain('{"due":"overdue","source":"cron"}');
    expect(cron).toContain('invoke_job_client_reminders');
    expect(cron).toContain('job-client-reminder-perth-morning');
    expect(cron).toContain('job-client-reminder-perth-afternoon');
    expect(cron).not.toContain('overdue-invoice-chase-perth');
    expect(cron).not.toContain('CREATE TABLE');
    expect(edge).toContain('api.twilio.com');
    expect(edge).toContain('TWILIO_ACCOUNT_SID');
    expect(edge).toContain('client?.phone');
    expect(edge).not.toContain('sms_settings');
    expect(edge).not.toContain('from("quotes")');
    expect(edge).not.toContain('send-quote');
    expect(INVOICE_SEND_PIPE.join(' ')).toMatch(/job-reminder/);
  });

  it('SMS miss does not flip invoice status or chased_at — sent follows email 2xx only', () => {
    const edge = readFileSync(resolve(process.cwd(), 'supabase/functions/job-reminder/index.ts'), 'utf8');
    expect(edge).toMatch(/status: "sent"/);
    expect(edge).toMatch(/sendTwilioSms/);
    const invoiceStart = edge.indexOf('if (invoiceId)');
    const invoiceBlock = edge.slice(invoiceStart, edge.indexOf('if (reportId)'));
    const emailFail = invoiceBlock.indexOf('if (!res.ok)');
    const statusWrite = invoiceBlock.indexOf('if (invoice.status === "draft"');
    const chasedWrite = invoiceBlock.indexOf('invoicePatch.chased_at = sentAt');
    expect(emailFail).toBeGreaterThan(-1);
    expect(statusWrite).toBeGreaterThan(emailFail);
    expect(chasedWrite).toBeGreaterThan(emailFail);
    const statusBlock = invoiceBlock.slice(statusWrite, statusWrite + 420);
    expect(statusBlock).toContain('status: "sent"');
    expect(statusBlock).toContain('chased_at');
    expect(statusBlock).not.toContain('sms.sent');
    expect(statusBlock).not.toContain('status: "paid"');
  });

  it('loads the invoice by id + company before send', () => {
    const scope = invoiceByIdQuery({ companyId: 'co1', invoiceId: 'inv-1' });
    expect(scope).not.toBeNull();
    expect(wouldScanLedgerToSendInvoice(scope)).toBe(false);
    expect(invoiceSendQueries({ companyId: 'co1', invoiceId: 'inv-1' }).invoice.eq).toEqual({
      id: 'inv-1',
      company_id: 'co1',
    });
  });
});
