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
  commercialPdfLogoBox,
  companyDocumentLogoUrl,
  companyLogoClientFromSupabase,
  companyLogoLetterheadSaveRow,
  companyLogoLetterheadSizePx,
  companyLogoOnDocuments,
  companyLogoStoragePath,
  companyWithLetterheadLookMark,
  decideCompanyLogoUpload,
  LETTERHEAD_LOOK,
  LETTERHEAD_LOOK_CROP,
  LETTERHEAD_LOOK_MARK,
  LETTERHEAD_LOOK_PADDED_MARK,
  LETTERHEAD_LOOK_SIZE,
  LETTERHEAD_MARK_DEFAULT_PX,
  LETTERHEAD_MARK_MAX_PX,
  LETTERHEAD_PDF_DEFAULT,
  letterheadMarkCoversTo,
  letterheadMarkCssVars,
  letterheadMarkIsFull,
  parseCompanyLogoCrop,
  persistCompanyLogo,
  persistCompanyLogoLetterhead,
  removeCompanyLogo,
  type CompanyLogoClient,
  type CompanyLogoFileIn,
  type CompanyLogoLetterheadClient,
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
    const generatePdf = src('src/reports/generatePdf.ts');
    const generateJhaPdf = src('src/reports/generateJhaPdf.ts');
    const generateTake5Pdf = src('src/reports/generateTake5Pdf.ts');
    const settings = src('src/pages/CompanySettingsPage.tsx');
    const quotesPage = src('src/pages/QuotesPage.tsx');
    const invoicesPage = src('src/pages/InvoicesPage.tsx');

    for (const body of [commercial, shared, electricalCompose, genericCompose, invoiceSend, generatePdf, generateJhaPdf, generateTake5Pdf]) {
      expect(body).not.toContain('BtsMark');
      expect(body).not.toContain('BrandLockup');
      expect(body).not.toContain('grafterMark');
      expect(body).not.toContain('/icon.svg');
    }
    for (const body of [commercial, shared, electricalCompose, genericCompose, generatePdf, generateJhaPdf, generateTake5Pdf]) {
      expect(body).not.toMatch(/grafter/i);
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

  it('LOOK letterhead overlays the padded wordmark, crop, and letterhead size', () => {
    const seeded = companyWithLetterheadLookMark({ name: 'Field Audit Co', logo_url: null }, LETTERHEAD_LOOK);
    expect(seeded?.logo_url).toBe(LETTERHEAD_LOOK_PADDED_MARK);
    expect(seeded?.logo_crop).toEqual(LETTERHEAD_LOOK_CROP);
    expect(seeded?.logo_letterhead_size).toBe(LETTERHEAD_LOOK_SIZE);
    expect(companyWithLetterheadLookMark({ name: 'Field Audit Co', logo_url: LOGO }, 'other')?.logo_url)
      .toBe(LOGO);
    expect(companyWithLetterheadLookMark(null, LETTERHEAD_LOOK)).toBeNull();
    expect(LETTERHEAD_LOOK_PADDED_MARK).toContain('wordmark-padded-field-audit.png');
    expect(LETTERHEAD_LOOK_PADDED_MARK).not.toMatch(/ute/i);
    expect(LETTERHEAD_LOOK_MARK).not.toMatch(/ute/i);
    expect(LETTERHEAD_LOOK_CROP).toEqual({
      x: 542 / 1600,
      y: 440 / 1000,
      w: 516 / 1600,
      h: 120 / 1000,
      aspect: 1600 / 1000,
    });
    expect(LETTERHEAD_LOOK_CROP.w).toBeLessThan(0.33);
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

describe('company logo crop + letterhead size', () => {
  const crop = { x: 0.12, y: 0.4, w: 0.7, h: 0.2, aspect: 2.5 };

  it('persists crop and size on companies — not a new table', async () => {
    const writes: Array<{ table: string; row: unknown; id: string }> = [];
    const client: CompanyLogoLetterheadClient = {
      async saveLetterhead(companyId, row) {
        writes.push({ table: 'companies', row, id: companyId });
        return { error: null };
      },
    };
    const result = await persistCompanyLogoLetterhead(client, {
      companyId: 'co1',
      crop,
      sizePx: 72,
    });
    expect(result).toEqual({
      ok: true,
      companyId: 'co1',
      logo_crop: crop,
      logo_letterhead_size: 72,
    });
    expect(writes).toEqual([{ table: 'companies', row: { logo_crop: crop, logo_letterhead_size: 72 }, id: 'co1' }]);
    expect(companyLogoLetterheadSaveRow(crop, LETTERHEAD_MARK_DEFAULT_PX)).toEqual({
      logo_crop: crop,
      logo_letterhead_size: null,
    });
  });

  it('letterhead uses the cropped scaled mark and keeps TO clear at the default size', () => {
    const stamped = commercialPdfCompanyFrom({
      name: 'Acme Electrical',
      logo_url: LOGO,
      logo_crop: crop,
      logo_letterhead_size: 72,
    });
    expect(stamped.logo_crop).toEqual(crop);
    expect(stamped.logo_letterhead_size).toBe(72);
    expect(letterheadMarkIsFull(stamped)).toBe(false);
    expect(letterheadMarkCssVars(stamped)['--hub-letterhead-mark-height']).toBe('72px');
    expect(letterheadMarkCssVars(stamped)['--logo-crop-x']).toBe('0.12');
    expect(letterheadMarkCssVars(stamped)['--logo-crop-w']).toBe('0.7');

    const box = commercialPdfLogoBox(stamped);
    expect(box.crop).toEqual(crop);
    expect(box.height).toBe(Math.round(80 * (72 / 96)));
    expect(box.width).toBeLessThanOrEqual(LETTERHEAD_PDF_DEFAULT.width);

    expect(letterheadMarkCoversTo(LETTERHEAD_MARK_DEFAULT_PX)).toBe(false);
    expect(letterheadMarkCoversTo(LETTERHEAD_MARK_MAX_PX)).toBe(false);
    expect(companyLogoLetterheadSizePx({})).toBe(LETTERHEAD_MARK_DEFAULT_PX);

    const quotes = src('src/pages/QuotesPage.tsx');
    const invoices = src('src/pages/InvoicesPage.tsx');
    const css = src('src/index.css');
    expect(quotes).toContain('CompanyLetterheadMark');
    expect(invoices).toContain('CompanyLetterheadMark');
    expect(src('src/lib/CompanyLetterheadMark.tsx')).toContain('hub-letterhead-mark-crop');
    expect(css).toContain('never paint over TO');
    expect(css).toContain('max-width: var(--hub-letterhead-mark-max)');
    expect(css).toContain(':is(.hub-quote-letterhead, .hub-invoice-letterhead) > *');
    expect(css).toContain('overflow: hidden');
  });

  it('unset crop falls back to the full image and current letterhead size', () => {
    expect(parseCompanyLogoCrop(null)).toBeNull();
    expect(parseCompanyLogoCrop(undefined)).toBeNull();
    expect(parseCompanyLogoCrop({ x: 0, y: 0, w: 1, h: 1 })).toBeNull();
    expect(parseCompanyLogoCrop('nope')).toBeNull();
    expect(parseCompanyLogoCrop({ x: 0.2 })).toBeNull();
    expect(letterheadMarkIsFull({ logo_url: LOGO })).toBe(true);
    expect(companyLogoLetterheadSizePx({ logo_letterhead_size: null })).toBe(96);
    expect(commercialPdfLogoBox({ logo_url: LOGO })).toEqual({ ...LETTERHEAD_PDF_DEFAULT, crop: null });
    expect(commercialPdfCompanyFrom({ name: 'Acme Electrical', logo_url: LOGO }).logo_crop).toBeNull();
    expect(commercialPdfCompanyFrom({ name: 'Acme Electrical', logo_url: LOGO }).logo_letterhead_size).toBeNull();
    expect(commercialPdfDataForInvoice(invoiceBundle(LOGO))?.company.logo_crop ?? null).toBeNull();
  });

  it('stays on the existing company logo setting — no Logos module, no 072/073 collision', () => {
    const migration = src('supabase/migrations/20260903220000_074_company_logo_crop.sql');
    const settings = src('src/pages/CompanySettingsPage.tsx');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS logo_crop jsonb');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS logo_letterhead_size integer');
    expect(migration).not.toContain('CREATE TABLE');
    expect(migration).not.toContain('072_member_tickets');
    expect(migration).not.toContain('072_company_owner_admin_lock');
    expect(migration).not.toContain('073_dashboard_widgets_seeded');
    expect(settings).toContain('company-logo-strip');
    expect(settings).toContain('CompanyLogoStripCrop');
    expect(settings).toContain('persistCompanyLogoLetterhead');
    expect(settings).toContain('persistCompanyLogo');
    expect(src('src/App.tsx')).not.toMatch(/path="\/settings\/logos"/);
    expect(src('src/lib/sendQuote.ts')).toContain('logo_crop: bundle.company.logo_crop');
    expect(src('src/lib/sendInvoice.ts')).toContain('logo_crop: bundle.company.logo_crop');
    expect(src('src/reports/commercial/CommercialDocumentPdf.tsx')).toContain('commercialPdfLogoBox');
    expect(src('src/reports/commercial/generateCommercialPdf.ts')).toContain('companyLogoCroppedSrc');
  });
});
