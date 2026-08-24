import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  blankCompanyPaymentMethod,
  companyPaymentMethodsForDocument,
  companyPaymentMethodsSaveError,
  companyPaymentMethodsSavePayload,
  formatCompanyPaymentMethodLines,
  parseCompanyPaymentMethods,
  printableCompanyPaymentMethods,
} from './companyPaymentMethods';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const bank = {
  id: 'pm-bank',
  kind: 'bank_transfer' as const,
  label: 'Bank transfer',
  account_name: 'Acme Electrical Pty Ltd',
  bsb: '066-000',
  account_number: '12345678',
  payid: '',
  notes: 'Use the invoice number as the reference.',
};

describe('company payment methods', () => {
  it('ignores blank rows and formats bank / PayID for the invoice', () => {
    expect(parseCompanyPaymentMethods(null)).toEqual([]);
    expect(parseCompanyPaymentMethods('nope')).toEqual([]);
    expect(printableCompanyPaymentMethods([blankCompanyPaymentMethod('bank_transfer')])).toEqual([]);

    const printed = companyPaymentMethodsForDocument([
      bank,
      {
        id: 'pm-payid',
        kind: 'payid',
        label: 'PayID',
        account_name: 'Acme Electrical',
        bsb: '',
        account_number: '',
        payid: 'invoices@acme.test',
        notes: '',
      },
      { id: 'empty', kind: 'other', label: 'Other', account_name: '', bsb: '', account_number: '', payid: '', notes: '' },
    ]);
    expect(printed).toEqual([
      {
        label: 'Bank transfer',
        lines: [
          'Account name: Acme Electrical Pty Ltd',
          'BSB: 066-000',
          'Account number: 12345678',
          'Use the invoice number as the reference.',
        ],
      },
      {
        label: 'PayID',
        lines: ['PayID: invoices@acme.test', 'Account name: Acme Electrical'],
      },
    ]);
    expect(formatCompanyPaymentMethodLines(bank)[1]).toBe('BSB: 066-000');
    expect(companyPaymentMethodsSavePayload([bank])[0].bsb).toBe('066-000');
    expect(
      companyPaymentMethodsSaveError("Could not find the 'payment_methods' column of 'companies' in the schema cache"),
    ).toMatch(/Run 066/);
    expect(companyPaymentMethodsSaveError('permission denied')).toBe('permission denied');
  });

  it('lives on companies, in company settings, and on invoices — not quotes or Xero', () => {
    const migration = src('supabase/migrations/20260823140000_066_company_payment_methods.sql');
    const settings = src('src/pages/CompanySettingsPage.tsx');
    const invoices = src('src/pages/InvoicesPage.tsx');
    const pdf = src('src/reports/commercial/CommercialDocumentPdf.tsx');
    const send = src('src/lib/sendInvoice.ts');
    const quotes = src('src/pages/QuotesPage.tsx');
    const xero = src('src/lib/xeroAccounting.ts');
    const edge = src('supabase/functions/job-reminder/index.ts');

    expect(migration).toContain('ADD COLUMN IF NOT EXISTS payment_methods jsonb');
    expect(settings).toContain('payment_methods');
    expect(settings).toContain('How clients pay');
    expect(invoices).toContain('companyPaymentMethodsForDocument');
    expect(invoices).toContain('How to pay');
    expect(pdf).toContain('How to pay');
    expect(pdf).toContain('data.kind === \'invoice\'');
    expect(send).toContain('payment_methods');
    expect(send).toContain('How to pay');
    expect(quotes).not.toContain('payment_methods');
    expect(xero).not.toContain('payment_methods');
    expect(edge).toContain('payment_methods');
    expect(edge).toContain('How to pay');
    const receiptStart = edge.indexOf('function invoiceReceiptHtml');
    const receiptFn = edge.slice(receiptStart, edge.indexOf('function invoiceReceiptSmsBody'));
    expect(receiptFn).not.toContain('How to pay');
    expect(receiptFn).not.toContain('payment_methods');
  });
});
