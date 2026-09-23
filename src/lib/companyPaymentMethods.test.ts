import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  blankCompanyPaymentMethod,
  companyHasInvoicePaymentMethod,
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
    expect(companyHasInvoicePaymentMethod([bank])).toBe(true);
    expect(companyHasInvoicePaymentMethod([blankCompanyPaymentMethod('bank_transfer')])).toBe(false);
    expect(companyHasInvoicePaymentMethod([{
      ...bank,
      kind: 'other',
      account_name: '',
      bsb: '',
      account_number: '',
      notes: 'Pay in person',
    }])).toBe(false);
    expect(
      companyPaymentMethodsSaveError("Could not find the 'payment_methods' column of 'companies' in the schema cache"),
    ).toMatch(/Run 066/);
    expect(companyPaymentMethodsSaveError('permission denied')).toBe('permission denied');
  });

  it('lives on companies, in company settings, and on invoices — not quotes, POs, Relovi, or #17', () => {
    const migration = src('supabase/migrations/20260823140000_066_company_payment_methods.sql');
    const settings = src('src/pages/CompanySettingsPage.tsx');
    const invoices = src('src/pages/InvoicesPage.tsx');
    const pdf = src('src/reports/commercial/CommercialDocumentPdf.tsx');
    const send = src('src/lib/sendInvoice.ts');
    const quotes = src('src/pages/QuotesPage.tsx');
    const quoteSend = src('src/lib/sendQuote.ts');
    const quoteSendDialog = src('src/components/invoicing/QuoteSendDialog.tsx');
    const pos = src('src/pages/PurchaseOrdersPage.tsx');
    const poSend = src('src/lib/sendPurchaseOrder.ts');
    const poSendDialog = src('src/components/invoicing/PurchaseOrderSendDialog.tsx');
    const xero = src('src/lib/xeroAccounting.ts');
    const edge = src('supabase/functions/job-reminder/index.ts');
    const portal = src('src/pages/ClientPortalPublicPage.tsx');
    const portalEdge = src('supabase/functions/client-portal/index.ts');

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
    expect(quoteSend).not.toContain('payment_methods');
    expect(quoteSend).not.toContain('How to pay');
    expect(quoteSendDialog).not.toContain('payment_methods');
    expect(quoteSendDialog).not.toContain('How to pay');
    expect(pos).not.toContain('payment_methods');
    expect(poSend).not.toContain('payment_methods');
    expect(poSend).not.toContain('How to pay');
    expect(poSendDialog).not.toContain('payment_methods');
    expect(xero).not.toContain('payment_methods');
    expect(settings).not.toContain('Relovi');
    expect(invoices).not.toContain('Relovi');
    expect(send).not.toContain('Relovi');
    expect(edge).toContain('payment_methods');
    expect(edge).toContain('How to pay');
    expect(edge).toContain('companyAbn');
    expect(portal).toContain('companyPaymentMethodsForDocument(data.company?.paymentMethods)');
    expect(portal).toContain('ABN {data.company.abn}');
    expect(portal).toContain('How to pay');
    expect(portalEdge).toContain('abn, logo_url, phone, email, website, payment_methods');
    expect(portalEdge).toContain('paymentMethods: company.payment_methods');
    expect(settings).toContain('companyHasInvoicePaymentMethod(paymentMethods)');
    expect(settings).toContain('Finish your invoice details');
    expect(settings).toContain('Add your ABN so customer invoices identify your business.');
    expect(settings).toContain('Add a bank transfer or PayID so customers know how to pay.');
    expect(settings).toContain('href="#company-abn"');
    expect(settings).toContain('href="#company-payment-methods"');
    expect(settings).toContain('background: var(--co-look-page)');
    expect(settings).toContain('color: var(--co-look-ink)');
    expect(invoices).not.toContain('hub-invoice-pay-empty');
    expect(invoices).not.toContain('Bank or PayID details are not set.');
    const receiptStart = edge.indexOf('function invoiceReceiptHtml');
    const receiptFn = edge.slice(receiptStart, edge.indexOf('function invoiceReceiptSmsBody'));
    expect(receiptFn).not.toContain('How to pay');
    expect(receiptFn).not.toContain('payment_methods');
    expect(src('src/lib/convertQuoteToInvoice.ts')).not.toContain('payment_methods');
  });
});
