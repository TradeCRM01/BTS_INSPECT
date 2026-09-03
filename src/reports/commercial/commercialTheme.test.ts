import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commercialPdfCompanyFrom, companyReportTheme } from '../../lib/companyLogo';
import {
  commercialPdfDataForInvoice,
  invoiceSendCompanyFrom,
  type InvoiceSendBundle,
  type InvoiceSendInvoice,
} from '../../lib/sendInvoice';
import { defaultPdfColors } from '../shared/styles';
import { commercialDocumentColors } from './CommercialDocumentPdf';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const SAVED_THEME = {
  navy: '#1B3A4B',
  accent: '#C45C26',
  accentLight: '#F4D4C4',
  navyLight: '#2A5366',
};

const invoice: InvoiceSendInvoice = {
  id: 'inv-1',
  company_id: 'co1',
  invoice_number: 18,
  client_id: 'c1',
  job_id: 'job-1',
  status: 'draft',
  line_items: [{ description: 'Switchboard test', quantity: 2, unit_price: 220 }],
  subtotal: 440,
  tax_rate: 10,
  tax_amount: 44,
  total: 484,
  payment_terms: 'Net 30',
  due_date: '2026-09-19',
  notes: null,
  inclusions: [],
  exclusions: [],
};

function invoiceBundle(report_theme?: Record<string, unknown> | null): InvoiceSendBundle {
  return {
    invoice,
    client: { id: 'c1', name: 'Acme Plumbing', email: 'jane@acme.test', phone: '0412 345 678', address: '12 Smith St' },
    jobAddress: 'Warehouse B',
    smtp: {
      smtp_host: 'smtp.resend.com',
      smtp_pass: 're_test',
      from_name: 'Acme Electrical',
      from_email: 'invoices@acme.test',
    },
    company: { name: 'Acme Electrical', report_theme },
  };
}

describe('commercial invoice / quote report_theme', () => {
  it('uses the saved companies.report_theme palette on invoice and quote documents', () => {
    const invoicePdf = commercialPdfDataForInvoice(invoiceBundle(SAVED_THEME));
    expect(invoicePdf?.company.report_theme).toEqual(SAVED_THEME);
    expect(commercialDocumentColors(invoicePdf?.company.report_theme)).toMatchObject(SAVED_THEME);

    const quoteCompany = commercialPdfCompanyFrom({ name: 'Acme Electrical', report_theme: SAVED_THEME });
    expect(quoteCompany.report_theme).toEqual(SAVED_THEME);
    expect(commercialDocumentColors(quoteCompany.report_theme)).toMatchObject({
      navy: '#1B3A4B',
      accent: '#C45C26',
      accentLight: '#F4D4C4',
      navyLight: '#2A5366',
    });

    const sendCompany = invoiceSendCompanyFrom({
      id: 'co1',
      name: 'Acme Electrical',
      report_theme: SAVED_THEME,
    });
    expect(sendCompany?.report_theme).toEqual(SAVED_THEME);
    expect(commercialDocumentColors(sendCompany?.report_theme).navy).toBe('#1B3A4B');
    expect(commercialDocumentColors(sendCompany?.report_theme).accent).toBe('#C45C26');
  });

  it('keeps the existing commercial document colours when theme is blank', () => {
    expect(commercialDocumentColors(null)).toMatchObject({
      navy: '#0A2540',
      accent: '#2E75B6',
      navyLight: '#153558',
      accentLight: '#D6E8F7',
    });
    expect(commercialDocumentColors(undefined)).toEqual(defaultPdfColors);
    expect(commercialDocumentColors({})).toMatchObject({ navy: '#0A2540', accent: '#2E75B6' });
    expect(commercialDocumentColors('')).toMatchObject({ navy: '#0A2540', accent: '#2E75B6' });

    expect(companyReportTheme(null)).toBeNull();
    expect(companyReportTheme({})).toBeNull();
    expect(companyReportTheme({ report_theme: null })).toBeNull();
    expect(companyReportTheme({ report_theme: {} })).toEqual({});

    expect(commercialPdfDataForInvoice(invoiceBundle(null))?.company.report_theme).toBeNull();
    expect(commercialPdfDataForInvoice(invoiceBundle(undefined))?.company.report_theme).toBeNull();
    expect(commercialPdfCompanyFrom({ name: 'Acme Electrical' }).report_theme).toBeNull();
    expect(invoiceSendCompanyFrom({ id: 'co1', name: 'Acme Electrical' })?.report_theme).toBeNull();

    const blankInvoice = commercialPdfDataForInvoice(invoiceBundle({}));
    expect(commercialDocumentColors(blankInvoice?.company.report_theme)).toMatchObject({
      navy: '#0A2540',
      accent: '#2E75B6',
    });
  });

  it('does not invent new theme keys or fall back to Grafter / Relovi cream', () => {
    const blank = commercialDocumentColors(null);
    expect(blank.navy).toBe('#0A2540');
    expect(blank.accent).toBe('#2E75B6');
    expect(JSON.stringify(blank)).not.toMatch(/cream|grafter|relovi|littleloop/i);
    expect(blank.navy).not.toMatch(/F5F0|FAF6|EDE4|F7F3/i);

    const commercial = src('src/reports/commercial/CommercialDocumentPdf.tsx');
    const send = src('src/lib/sendInvoice.ts');
    for (const body of [commercial, send]) {
      expect(body).not.toContain('Relovi');
      expect(body).not.toContain('Littleloop');
      expect(body).not.toContain('BtsMark');
      expect(body).not.toContain('BrandLockup');
      expect(body).not.toContain('primaryCream');
      expect(body).not.toContain('report_theme_v2');
    }
    expect(commercial).not.toMatch(/grafter/i);
    expect(commercial).toContain('parseReportTheme');
    expect(commercial).toContain('resolvePdfColors');
    expect(commercial).toContain('commercialDocumentColors');
    expect(commercial).toContain('company.report_theme');
  });

  it('wires the saved palette through existing invoice / quote PDF data — no new settings page', () => {
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const invoicesPage = src('src/pages/InvoicesPage.tsx');
    const preview = src('src/components/invoicing/CommercialPdfPreviewModal.tsx');
    const companyLogo = src('src/lib/companyLogo.ts');
    const send = src('src/lib/sendInvoice.ts');

    expect(quotesPage).toContain('commercialPdfCompanyFrom');
    expect(invoicesPage).toContain('commercialPdfCompanyFrom');
    expect(invoicesPage).toContain('report_theme');
    expect(companyLogo).toContain('companyReportTheme');
    expect(companyLogo).toContain('report_theme: companyReportTheme(company)');
    expect(send).toContain('report_theme: companyReportTheme(bundle.company)');
    expect(preview).toContain('generateCommercialPdf');
    expect(preview).not.toContain('CompanySettingsPage');
    expect(quotesPage).not.toContain('CompanySettingsPage');
    expect(invoicesPage).not.toContain('setReportTheme');
    expect(src('src/reports/commercial/generateCommercialPdf.ts')).not.toContain('CompanySettingsPage');
  });
});
