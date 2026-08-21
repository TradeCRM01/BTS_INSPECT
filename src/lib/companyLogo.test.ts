import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commercialPdfDataForInvoice, type InvoiceSendBundle, type InvoiceSendInvoice } from './sendInvoice';
import { composeElectricalReport } from '../reports/electrical_3000/compose';
import { composeGenericReport } from '../reports/generic_inspection/compose';
import type { TemplateSchema } from '../types/template';
import {
  COMPANY_LOGO_INVALID_FILE,
  COMPANY_LOGO_NO_COMPANY,
  COMPANY_LOGOS_BUCKET,
  commercialPdfCompanyFrom,
  companyDocumentLogoUrl,
  companyLogoClientFromSupabase,
  companyLogoOnDocuments,
  companyLogoStoragePath,
  decideCompanyLogoUpload,
  persistCompanyLogo,
  removeCompanyLogo,
  type CompanyLogoClient,
  type CompanyLogoFileIn,
} from './companyLogo';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const LOGO = 'https://cdn.example.com/co1/logo.png';

const emptySchema: TemplateSchema = {
  meta: {
    requiresSiteName: false,
    requiresSiteAddress: false,
    requiresClientName: false,
    requiresJobNumber: false,
  },
  sections: [],
};

function reportInput(logo_url: string | null | undefined) {
  return {
    inspection: {
      id: 'insp-1',
      meta: { siteName: 'Yard', clientName: 'Acme' },
      responses: {},
    },
    template: { name: 'Switchboard', schema: emptySchema },
    profile: { name: 'Pat', licence_number: 'EL-1' },
    company: {
      name: 'Acme Electrical',
      abn: '11 111 111 111',
      licence_number: 'EL-1',
      phone: '0400 000 000',
      email: 'office@acme.test',
      website: 'acme.test',
      logo_url,
    },
    photos: [],
    reportNumber: 'R-1',
  };
}

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

function invoiceBundle(logo_url: string | null | undefined): InvoiceSendBundle {
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
    company: { name: 'Acme Electrical', logo_url },
  };
}

function fakeLogoFile(type: string, size: number, name: string): Blob & CompanyLogoFileIn {
  const blob = new Blob([new Uint8Array(Math.max(size, 1))], { type });
  return Object.assign(blob, { name });
}

function memoryLogoClient(seed: Record<string, string | null> = {}): CompanyLogoClient & {
  companies: Record<string, string | null>;
  objects: Record<string, { contentType: string }>;
} {
  const companies = { ...seed };
  const objects: Record<string, { contentType: string }> = {};
  return {
    companies,
    objects,
    async upload(path, _body, opts) {
      objects[path] = { contentType: opts.contentType };
      return { error: null };
    },
    publicUrl(path) {
      return `https://cdn.example.com/${path}`;
    },
    async removeObject(path) {
      delete objects[path];
      return { error: null };
    },
    async saveLogoUrl(companyId, logoUrl) {
      if (!(companyId in companies) && logoUrl === null && !(companyId in seed)) {
        companies[companyId] = logoUrl;
        return { error: null };
      }
      companies[companyId] = logoUrl;
      return { error: null };
    },
  };
}

describe('decideCompanyLogoUpload', () => {
  it('accepts a PNG on this company and stores it on the existing logos path', () => {
    expect(decideCompanyLogoUpload({
      companyId: 'co1',
      file: { type: 'image/png', size: 1200, name: 'mark.png' },
    })).toEqual({
      ok: true,
      companyId: 'co1',
      path: 'co1/logo.png',
      contentType: 'image/png',
    });
    expect(companyLogoStoragePath('co1')).toBe('co1/logo.png');
    expect(COMPANY_LOGOS_BUCKET).toBe('logos');
  });

  it('names an honest miss for an invalid file — blank stays empty', () => {
    expect(decideCompanyLogoUpload({
      companyId: 'co1',
      file: { type: 'application/pdf', size: 1200, name: 'invoice.pdf' },
    })).toEqual({
      ok: false,
      reason: 'invalid_file',
      message: COMPANY_LOGO_INVALID_FILE,
    });
    expect(decideCompanyLogoUpload({
      companyId: 'co1',
      file: { type: 'image/png', size: 0, name: 'empty.png' },
    }).ok).toBe(false);
    expect(decideCompanyLogoUpload({
      companyId: 'co1',
      file: null,
    })).toMatchObject({ ok: false, reason: 'no_file' });
    expect(decideCompanyLogoUpload({
      companyId: '',
      file: { type: 'image/png', size: 10, name: 'a.png' },
    })).toEqual({
      ok: false,
      reason: 'no_company',
      message: COMPANY_LOGO_NO_COMPANY,
    });
  });
});

describe('persistCompanyLogo', () => {
  it('upload persists logo_url on this company only', async () => {
    const client = memoryLogoClient({ co1: null, co2: null });
    const file = fakeLogoFile('image/png', 12, 'mark.png');
    const result = await persistCompanyLogo(client, { companyId: 'co1', file });
    expect(result).toEqual({
      ok: true,
      companyId: 'co1',
      logo_url: 'https://cdn.example.com/co1/logo.png',
    });
    expect(client.companies.co1).toBe('https://cdn.example.com/co1/logo.png');
    expect(client.companies.co2).toBeNull();
    expect(client.objects['co1/logo.png']?.contentType).toBe('image/png');
  });

  it('does not persist an invalid file — this company stays blank', async () => {
    const client = memoryLogoClient({ co1: null });
    const file = fakeLogoFile('application/pdf', 20, 'not-a-logo.pdf');
    const result = await persistCompanyLogo(client, { companyId: 'co1', file });
    expect(result).toMatchObject({ ok: false, reason: 'invalid_file', message: COMPANY_LOGO_INVALID_FILE });
    expect(client.companies.co1).toBeNull();
    expect(client.objects).toEqual({});
  });

  it('remove / replace clears then writes this company logo_url', async () => {
    const client = memoryLogoClient({ co1: LOGO });
    const cleared = await removeCompanyLogo(client, 'co1');
    expect(cleared).toEqual({ ok: true, companyId: 'co1', logo_url: null });
    expect(client.companies.co1).toBeNull();

    const file = fakeLogoFile('image/png', 12, 'new.png');
    const replaced = await persistCompanyLogo(client, { companyId: 'co1', file });
    expect(replaced.ok).toBe(true);
    if (replaced.ok) expect(replaced.logo_url).toBe('https://cdn.example.com/co1/logo.png');
    expect(client.companies.co1).toBe('https://cdn.example.com/co1/logo.png');
  });
});

describe('company logo on documents', () => {
  it('includes the company logo URL on invoice, quote, and report when set', () => {
    const stamped = companyLogoOnDocuments({ logo_url: LOGO });
    expect(stamped).toEqual({ invoice: LOGO, quote: LOGO, report: LOGO });

    const invoicePdf = commercialPdfDataForInvoice(invoiceBundle(LOGO), new Date('2026-08-20T10:00:00'));
    expect(invoicePdf?.company.logo_url).toBe(LOGO);

    const quoteCompany = commercialPdfCompanyFrom({ name: 'Acme Electrical', logo_url: LOGO });
    expect(quoteCompany.logo_url).toBe(LOGO);

    const generic = composeGenericReport(reportInput(LOGO));
    expect(generic.companyLogoUrl).toBe(LOGO);
    const electrical = composeElectricalReport(reportInput(LOGO));
    expect(electrical.company.logoUrl).toBe(LOGO);
  });

  it('omits the mark on invoice, quote, and report when blank', () => {
    expect(companyDocumentLogoUrl(null)).toBeNull();
    expect(companyDocumentLogoUrl({ logo_url: '' })).toBeNull();
    expect(companyDocumentLogoUrl({ logo_url: '   ' })).toBeNull();
    expect(companyDocumentLogoUrl({ logo_url: null })).toBeNull();
    expect(companyLogoOnDocuments({})).toEqual({ invoice: null, quote: null, report: null });

    expect(commercialPdfDataForInvoice(invoiceBundle(null))?.company.logo_url).toBeNull();
    expect(commercialPdfDataForInvoice(invoiceBundle(''))?.company.logo_url).toBeNull();
    expect(commercialPdfCompanyFrom({ name: 'Acme Electrical', logo_url: null }).logo_url).toBeNull();
    expect(composeGenericReport(reportInput(null)).companyLogoUrl).toBeUndefined();
    expect(composeElectricalReport(reportInput(undefined)).company.logoUrl).toBeUndefined();
  });

  it('does not use the Grafter / BTS mark as a document fallback', () => {
    expect(companyDocumentLogoUrl({})).toBeNull();
    expect(companyLogoOnDocuments(null)).toEqual({ invoice: null, quote: null, report: null });

    const commercial = src('src/reports/commercial/CommercialDocumentPdf.tsx');
    const shared = src('src/reports/shared/components.tsx');
    const electricalCompose = src('src/reports/electrical_3000/compose.ts');
    const genericCompose = src('src/reports/generic_inspection/compose.ts');
    const invoiceSend = src('src/lib/sendInvoice.ts');
    const settings = src('src/pages/CompanySettingsPage.tsx');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const invoicesPage = src('src/pages/InvoicesPage.tsx');

    for (const body of [commercial, shared, electricalCompose, genericCompose, invoiceSend]) {
      expect(body).not.toContain('BtsMark');
      expect(body).not.toContain('BrandLockup');
      expect(body).not.toMatch(/grafter/i);
      expect(body).not.toContain('/icon.svg');
    }
    expect(commercial).toContain('companyDocumentLogoUrl');
    expect(electricalCompose).toContain('companyDocumentLogoUrl');
    expect(genericCompose).toContain('companyDocumentLogoUrl');
    expect(invoiceSend).toContain('companyDocumentLogoUrl');
    expect(quotesPage).toContain('commercialPdfCompanyFrom');
    expect(invoicesPage).toContain('commercialPdfCompanyFrom');
    expect(settings).toContain('persistCompanyLogo');
    expect(settings).toContain('removeCompanyLogo');
    expect(settings).toContain('decideCompanyLogoUpload');
    expect(settings).not.toContain('BtsMark');
    expect(settings).not.toContain('BrandLockup');
  });
});

describe('companyLogoClientFromSupabase', () => {
  it('writes companies.logo_url on this company through the existing logos bucket', async () => {
    const writes: Array<{ table: string; row: { logo_url: string | null }; id: string }> = [];
    const uploads: Array<{ bucket: string; path: string }> = [];
    const client = companyLogoClientFromSupabase({
      storage: {
        from(bucket: string) {
          return {
            async upload(path: string) {
              uploads.push({ bucket, path });
              return { error: null };
            },
            getPublicUrl(path: string) {
              return { data: { publicUrl: `https://files.test/${path}` } };
            },
            async remove() {
              return { error: null };
            },
          };
        },
      },
      from(table: string) {
        return {
          update(row: { logo_url: string | null }) {
            return {
              async eq(_column: string, id: string) {
                writes.push({ table, row, id });
                return { error: null };
              },
            };
          },
        };
      },
    });
    const file = fakeLogoFile('image/png', 12, 'mark.png');
    const result = await persistCompanyLogo(client, { companyId: 'co1', file });
    expect(result).toMatchObject({ ok: true, logo_url: 'https://files.test/co1/logo.png' });
    expect(uploads).toEqual([{ bucket: 'logos', path: 'co1/logo.png' }]);
    expect(writes).toEqual([{ table: 'companies', row: { logo_url: 'https://files.test/co1/logo.png' }, id: 'co1' }]);
  });
});
