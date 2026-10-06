import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMPANY_INVOICE_SHARE_SETUP_NUDGE,
  COMPANY_SETTINGS_HREF,
  companyInvoiceShareSetupIncomplete,
  companyHasPrintablePaymentMethod,
} from './companyPaymentMethods';
import { commercialPdfDataForInvoice } from './sendInvoice';

function src(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

describe('MONEY-1 company share setup nudge', () => {
  const bank = [{
    id: 'pm-bank',
    kind: 'bank_transfer' as const,
    label: 'Bank transfer',
    account_name: 'Acme Trade Co',
    bsb: '066-000',
    account_number: '12345678',
    payid: '',
    notes: '',
  }];

  it('flags missing ABN or bank/PayID without blocking share', () => {
    expect(companyInvoiceShareSetupIncomplete(null, bank)).toBe(true);
    expect(companyInvoiceShareSetupIncomplete('12 345 678 901', bank)).toBe(false);
    expect(companyInvoiceShareSetupIncomplete('12 345 678 901', [])).toBe(true);
    expect(companyInvoiceShareSetupIncomplete('', bank)).toBe(true);
  });

  it('surfaces nudge copy on invoice Send / Copy link', () => {
    const invoiceSend = src('src/components/invoicing/InvoiceSendDialog.tsx');
    const nudge = src('src/components/invoicing/DocumentShareCompanySetupNudge.tsx');
    expect(COMPANY_INVOICE_SHARE_SETUP_NUDGE).toBe(
      'Add your ABN and bank details in Company Settings first',
    );
    expect(nudge).toContain('COMPANY_INVOICE_SHARE_SETUP_NUDGE');
    expect(nudge).toContain('COMPANY_SETTINGS_HREF');
    expect(COMPANY_SETTINGS_HREF).toBe('/settings/company');
    expect(invoiceSend).toContain('DocumentShareCompanySetupNudge');
    expect(invoiceSend).toContain('companyInvoiceShareSetupIncomplete');
    expect(invoiceSend).toContain('showShare && companySetupNudge');
  });
});

describe('MONEY-1 portal invoice due date', () => {
  it('renders due date on each portal invoice row', () => {
    const portal = src('src/pages/ClientPortalPublicPage.tsx');
    expect(portal).toContain('inv.due_date');
    expect(portal).toContain("Due {format(parseISO(inv.due_date), 'd MMM yyyy')}");
  });
});

describe('MONEY-1 invoice PDF how-to-pay', () => {
  it('includes printable payment methods and due in PDF data / renderer', () => {
    const pdf = src('src/reports/commercial/CommercialDocumentPdf.tsx');
    expect(pdf).toContain('How to pay');
    expect(pdf).toContain('Due {data.secondaryValue}');

    const otherOnly = [{
      id: 'pm-other',
      kind: 'other' as const,
      label: 'Cash',
      account_name: '',
      bsb: '',
      account_number: '',
      payid: '',
      notes: 'Pay on site before we leave.',
    }];
    expect(companyHasPrintablePaymentMethod(otherOnly)).toBe(true);

    const data = commercialPdfDataForInvoice({
      invoice: {
        id: 'inv-1',
        company_id: 'co1',
        invoice_number: 3,
        client_id: 'c1',
        job_id: null,
        status: 'sent',
        line_items: [{ description: 'Labour', quantity: 1, unit_price: 100 }],
        subtotal: 100,
        tax_rate: 10,
        tax_amount: 10,
        total: 110,
        payment_terms: null,
        due_date: '2026-11-01',
        notes: null,
        inclusions: null,
        exclusions: null,
      },
      client: { id: 'c1', name: 'Client', email: null, phone: null, address: null },
      jobAddress: null,
      smtp: null,
      company: {
        name: 'Trade Co',
        abn: '12 345 678 901',
        payment_methods: otherOnly,
      },
    });
    expect(data?.paymentMethods).toHaveLength(1);
    expect(data?.secondaryValue).toBe('1 Nov 2026');
  });
});
