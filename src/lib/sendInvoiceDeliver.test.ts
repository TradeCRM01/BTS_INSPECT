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
    const edge = readFileSync(resolve(process.cwd(), 'supabase/functions/job-reminder/index.ts'), 'utf8');

    expect(deliver).toContain("invoke('job-reminder'");
    expect(deliver).toContain('invoiceId');
    expect(deliver).not.toContain('send-quote');
    expect(deliver).not.toContain('sendQuote');
    expect(deliver).not.toContain("invoke('send-invoice'");
    expect(dialog).not.toContain('QuoteSend');
    expect(dialog).not.toContain('send-quote');
    expect(page).toContain('InvoiceSendDialog');
    expect(page).not.toContain('QuoteSendDialog');
    expect(page).not.toContain('send-quote');
    expect(edge).toContain('invoiceId');
    expect(edge).toContain('from("invoices")');
    expect(edge).toContain('api.resend.com/emails');
    expect(edge).toContain('email_settings');
    expect(edge).toContain('status: "sent"');
    expect(edge).not.toContain('from("quotes")');
    expect(edge).not.toContain('send-quote');
    expect(INVOICE_SEND_PIPE.join(' ')).toMatch(/job-reminder/);
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
