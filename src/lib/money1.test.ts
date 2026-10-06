import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  COMPANY_INVOICE_SHARE_NUDGE_ABN,
  COMPANY_INVOICE_SHARE_NUDGE_BANK,
  COMPANY_INVOICE_SHARE_NUDGE_BOTH,
  COMPANY_SETTINGS_HREF,
  companyInvoiceShareNudgeMessage,
  companyInvoiceShareSetupIncomplete,
  companyInvoiceShareSetupMiss,
  companyHasPrintablePaymentMethod,
} from './companyPaymentMethods';
import { commercialPdfDataForInvoice } from './sendInvoice';

function src(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

const abn = '12 345 678 901';

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
    expect(companyInvoiceShareSetupIncomplete(abn, bank)).toBe(false);
    expect(companyInvoiceShareSetupIncomplete(abn, [])).toBe(true);
    expect(companyInvoiceShareSetupIncomplete('', bank)).toBe(true);
  });

  it('still nudges when bank row is only name, only BSB, or other+notes', () => {
    const nameOnly = [{
      id: 'pm-name',
      kind: 'bank_transfer' as const,
      label: 'Bank transfer',
      account_name: 'Acme Trade Co',
      bsb: '',
      account_number: '',
      payid: '',
      notes: '',
    }];
    const bsbOnly = [{
      id: 'pm-bsb',
      kind: 'bank_transfer' as const,
      label: 'Bank transfer',
      account_name: '',
      bsb: '066-000',
      account_number: '',
      payid: '',
      notes: '',
    }];
    const notesOnly = [{
      id: 'pm-other',
      kind: 'other' as const,
      label: 'Cash',
      account_name: '',
      bsb: '',
      account_number: '',
      payid: '',
      notes: 'Pay on site before we leave.',
    }];
    expect(companyInvoiceShareSetupIncomplete(abn, nameOnly)).toBe(true);
    expect(companyInvoiceShareSetupIncomplete(abn, bsbOnly)).toBe(true);
    expect(companyInvoiceShareSetupIncomplete(abn, notesOnly)).toBe(true);
    expect(companyHasPrintablePaymentMethod(nameOnly)).toBe(true);
    expect(companyHasPrintablePaymentMethod(bsbOnly)).toBe(true);
    expect(companyHasPrintablePaymentMethod(notesOnly)).toBe(true);
  });

  it('uses amber nudge copy for both, ABN-only, and bank-only misses', () => {
    expect(companyInvoiceShareSetupMiss(null, [])).toBe('both');
    expect(companyInvoiceShareNudgeMessage('both')).toBe(COMPANY_INVOICE_SHARE_NUDGE_BOTH);
    expect(companyInvoiceShareSetupMiss(abn, [])).toBe('bank');
    expect(companyInvoiceShareNudgeMessage('bank')).toBe(COMPANY_INVOICE_SHARE_NUDGE_BANK);
    expect(companyInvoiceShareSetupMiss(null, bank)).toBe('abn');
    expect(companyInvoiceShareNudgeMessage('abn')).toBe(COMPANY_INVOICE_SHARE_NUDGE_ABN);
    expect(companyInvoiceShareSetupMiss(abn, bank)).toBeNull();
    expect(companyInvoiceShareNudgeMessage(null)).toBeNull();

    const nudge = src('src/components/invoicing/DocumentShareCompanySetupNudge.tsx');
    expect(nudge).toContain('hub-invoice-send-company-nudge');
    expect(nudge).toContain('hub-invoice-send-company-nudge-action');
    expect(nudge).toContain('Add in Settings');
    expect(nudge).toContain('companyInvoiceShareNudgeMessage');
    expect(COMPANY_SETTINGS_HREF).toBe('/settings/company');

    const invoiceSend = src('src/components/invoicing/InvoiceSendDialog.tsx');
    expect(invoiceSend).toContain('DocumentShareCompanySetupNudge');
    expect(invoiceSend).toContain('hub-invoice-send-portal-url');
  });
});

describe('MONEY-1 portal invoice due date', () => {
  it('renders due date on each portal invoice row except paid', () => {
    const portal = src('src/pages/ClientPortalPublicPage.tsx');
    expect(portal).toContain('inv.due_date');
    expect(portal).toContain("portalStatusKey(inv.status) !== 'paid'");
    expect(portal).toContain("Due {format(parseISO(inv.due_date), 'd MMM yyyy')}");
  });
});

describe('MONEY-1 portal how to pay', () => {
  it('shows How to pay per unpaid invoice and hides on paid', () => {
    const portal = src('src/pages/ClientPortalPublicPage.tsx');
    expect(portal).toContain('companyPaymentMethodsCompleteForDocument');
    expect(portal).toContain('portalInvoiceShowsHowToPay');
    expect(portal).toContain('portal-invoice-pay');
    expect(portal).toContain('as the payment reference');
    expect(portal).toContain("return key !== 'paid'");
  });
});

describe('MONEY-1 invoice PDF how-to-pay', () => {
  it('includes printable payment methods without duplicating Due in How to pay', () => {
    const pdf = src('src/reports/commercial/CommercialDocumentPdf.tsx');
    expect(pdf).toContain('How to pay');
    expect(pdf).not.toContain('Due {data.secondaryValue}');

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
