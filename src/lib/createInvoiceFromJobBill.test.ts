import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JOB_BILL_INVOICE_NO_CLIENT, JOB_BILL_INVOICE_NO_LINES } from './invoiceFromJobBill';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('createInvoiceFromJobBill — job sheet Invoice next', () => {
  it('inserts a draft from the job bill and refreshes the job invoice list', () => {
    const create = src('src/lib/createInvoiceFromJobBill.ts');
    const builder = src('src/lib/invoiceFromJobBill.ts');
    const page = src('src/pages/JobDetailPage.tsx');
    const panel = src('src/components/jobs/JobCostingPanel.tsx');

    expect(create).toContain('from(\'jobs\')');
    expect(create).toContain('from(\'job_costs\')');
    expect(create).toContain('from(\'invoices\')');
    expect(create).toContain('insert({');
    expect(create).toContain('decideJobBillInvoice');
    expect(create).toContain('buildInvoiceFromJobBill');
    expect(create).toContain('reuseAfterUniqueConflict');
    expect(create).toContain('23505');
    expect(builder).toContain('status: \'draft\'');
    expect(builder).toContain('INVOICE_SOURCE_JOB_BILL');
    expect(builder).toContain('due_date: null');

    expect(page).toContain('createInvoiceFromJobBill');
    expect(page).toContain('invoiceFromJobBill');
    expect(page).toContain('queryKey: [\'job-invoices\', id]');
    expect(page).toContain('invalidateQueries({ queryKey: [\'job-invoices\', id] })');
    expect(page).toContain('JOB_BILL_INVOICE_CREATED');
    expect(page).toContain('JOB_BILL_INVOICE_EXISTS');
    expect(page).toContain('JOB_BILL_INVOICE_NO_LINES');

    expect(panel).toContain('createInvoiceFromJobBill');
  });

  it('handleInvoice raises from the job bill — quote convert stays off this control', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const handleStart = page.indexOf('const handleInvoice');
    const handleEnd = page.indexOf('const next = recommendJobAction');
    expect(handleStart).toBeGreaterThan(-1);
    expect(handleEnd).toBeGreaterThan(handleStart);
    const handle = page.slice(handleStart, handleEnd);
    expect(handle).toContain('invoiceFromJobBill.mutate()');
    expect(handle).not.toContain('invoiceFromQuote');
    expect(handle).not.toContain('convertQuoteToInvoice');
    expect(handle).not.toContain('acceptedQuote');
  });

  it('does not send, stamp overdue, chase, or push Xero', () => {
    const create = src('src/lib/createInvoiceFromJobBill.ts');
    const builder = src('src/lib/invoiceFromJobBill.ts');
    const page = src('src/pages/JobDetailPage.tsx');
    const handleStart = page.indexOf('const handleInvoice');
    const handle = page.slice(handleStart, page.indexOf('const next = recommendJobAction'));

    for (const body of [create, builder]) {
      expect(body).not.toContain('chased_at');
      expect(body).not.toContain('status: \'overdue\'');
      expect(body).not.toContain('status: \'sent\'');
      expect(body).not.toContain('status: \'paid\'');
      expect(body).not.toContain('job-reminder');
      expect(body).not.toContain('sendInvoice');
      expect(body).not.toContain('sendQuote');
      expect(body).not.toContain('Twilio');
      expect(body).not.toContain('xero');
      expect(body).not.toContain('Xero');
      expect(body).not.toContain('functions.invoke');
    }
    expect(handle).not.toContain('job-reminder');
    expect(handle).not.toContain('sendInvoice');
    expect(handle).not.toContain('chased_at');
  });

  it('does not add a table, column, route, dialog, or second 44px primary', () => {
    const create = src('src/lib/createInvoiceFromJobBill.ts');
    const page = src('src/pages/JobDetailPage.tsx');
    expect(create).not.toContain('CREATE TABLE');
    expect(create).not.toContain('ALTER TABLE');
    expect(page).not.toContain('InvoiceSendDialog');
    expect(page).not.toContain('QuoteSendDialog');
    expect(page).not.toContain('Mark paid');
    expect(page).toContain('ops-next-control-block');
    expect(page).toContain('next.key === \'invoice\'');
  });

  it('names the honest misses used on the job sheet', () => {
    expect(JOB_BILL_INVOICE_NO_CLIENT).toBe('Assign a client before invoicing this job');
    expect(JOB_BILL_INVOICE_NO_LINES).toBe('Add bill lines before invoicing this job');
  });

  it('leaves the quote convert path off this slice', () => {
    const quoteConvert = src('src/lib/convertQuoteToInvoice.ts');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const quoteNext = src('src/lib/quoteNextAction.ts');
    expect(quoteConvert).not.toContain('createInvoiceFromJobBill');
    expect(quotesPage).not.toContain('createInvoiceFromJobBill');
    expect(quoteNext).not.toContain('createInvoiceFromJobBill');
    expect(quoteConvert).toContain('buildInvoiceFromQuote');
  });
});
