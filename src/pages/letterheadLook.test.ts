import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function letterheadMarkCss(): string {
  const css = src('src/index.css');
  const start = css.indexOf('/* Shared quote + invoice letterhead mark.');
  const end = css.indexOf('.hub-invoice-from-name,');
  return css.slice(start, end);
}

describe('quote + invoice letterhead mark LOOK', () => {
  it('grows one shared letterhead mark token on quote and invoice paper', () => {
    const css = letterheadMarkCss();
    const quotes = src('src/pages/QuotesPage.tsx');
    const invoices = src('src/pages/InvoicesPage.tsx');
    const quoteEditor = quotes.split('function QuoteEditorModal')[1] ?? '';
    const invoiceEditor = invoices.split('function InvoiceEditorModal')[1] ?? '';

    expect(quoteEditor).toContain('CompanyLetterheadMark');
    expect(invoiceEditor).toContain('CompanyLetterheadMark');
    expect(quoteEditor).toContain('hub-quote-masthead');
    expect(invoiceEditor).toContain('hub-invoice-masthead');
    expect(quoteEditor.indexOf('hub-quote-masthead')).toBeLessThan(quoteEditor.indexOf('hub-quote-letterhead'));
    expect(invoiceEditor.indexOf('hub-invoice-masthead')).toBeLessThan(invoiceEditor.indexOf('hub-invoice-letterhead'));
    expect(src('src/lib/CompanyLetterheadMark.tsx')).toContain('className="hub-letterhead-mark"');
    expect(src('src/lib/CompanyLogoStripCrop.tsx')).toContain('CompanyLogoQuotePreview');
    expect(src('src/lib/CompanyLogoQuotePreview.tsx')).toContain('company-logo-strip-preview');
    expect(src('src/lib/CompanyLogoQuotePreview.tsx')).toContain('Quote #2002');
    expect(quoteEditor).toContain('companyWithLetterheadLookMark');
    expect(invoiceEditor).toContain('companyWithLetterheadLookMark');
    expect(quotes).toContain("look') === LETTERHEAD_LOOK");
    expect(invoices).toContain("look') === LETTERHEAD_LOOK");
    expect(quotes).toContain('fieldAuditConvertQuote');
    expect(invoices).toContain('getAuditInvoiceEditorRow');
    expect(invoices).toContain('getAuditClients');

    expect(css).toContain('--hub-letterhead-mark-height: 96px');
    expect(css).toContain('--hub-letterhead-mark-max: 100%');
    expect(css).toContain(':is(.hub-quote-letterhead, .hub-invoice-letterhead, .hub-quote-masthead, .hub-invoice-masthead) > *');
    expect(src('src/index.css')).toContain('.hub-quote-masthead');
    expect(src('src/index.css')).toContain('.hub-invoice-masthead');
    expect(src('src/index.css')).toContain('.company-logo-strip-preview-sheet');
    expect(css).toContain('overflow: hidden');
    expect(css).toContain(':is(.hub-quote-editor, .hub-invoice-editor, .company-logo-strip-preview) .hub-letterhead-mark');
    expect(css).toContain('width: 100%');
    expect(css).toContain('max-height: var(--hub-letterhead-mark-height)');
    expect(css).toContain('max-width: var(--hub-letterhead-mark-max)');
    expect(src('src/index.css')).toContain('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)');
    expect(src('src/index.css')).toContain('.hub-quote-letterhead {\n      grid-template-columns: minmax(0, 1fr);');
    expect(css).not.toContain('--hub-letterhead-mark-max: 480px');
    expect(css).not.toContain('height: 32px');
    expect(css).not.toContain('max-width: 140px');
    expect(src('src/index.css')).not.toContain('.hub-quote-letterhead-mark');
    expect(src('src/index.css')).not.toContain('.hub-invoice-letterhead-mark');

    expect(quotes).not.toMatch(/BtsMark|BrandLockup|grafterMark/);
    expect(invoices).not.toMatch(/BtsMark|BrandLockup|grafterMark/);
    expect(quotes).not.toMatch(/\bute\b/i);
    expect(invoices).not.toMatch(/\bute\b/i);
    expect(css).not.toMatch(/radial-gradient|Relovi|#16A34A/);
  });

  it('grows the matching quote/invoice PDF letterhead mark and leaves purchase orders', () => {
    const commercial = src('src/reports/commercial/CommercialDocumentPdf.tsx');
    expect(commercial).toContain('width: 300, height: 80');
    expect(commercial).toContain("width: 56, height: 32");
    expect(commercial).toContain("kind === 'quote' || kind === 'invoice'");
    expect(commercial).toContain('companyDocumentLogoUrl');
    expect(commercial).not.toContain('BtsMark');
    expect(commercial).not.toContain('grafterMark');
  });

  it('seeds a padded wordmark fixture Playwright can load without a live tenant', () => {
    const mark = src('public/look/wordmark-padded-field-audit.svg');
    expect(mark).toContain('FIELD AUDIT');
    expect(mark).toContain('CO');
    expect(mark).toContain('1600');
    expect(mark).toContain('1000');
    expect(mark).toContain('width="516" height="120"');
    expect(mark).not.toContain('width="720"');
    expect(src('src/lib/companyLogo.ts')).toContain('516 / 1600');
    expect(src('src/lib/companyLogo.ts')).not.toContain('w: 0.45');
    expect(src('src/lib/companyLogo.ts')).toContain("LETTERHEAD_LOOK_PADDED_MARK = '/look/wordmark-padded-field-audit.png'");
    expect(src('src/lib/companyLogo.ts')).toContain('LETTERHEAD_LOOK_CROP');
    expect(src('src/lib/companyLogo.ts')).toContain('letterheadLookPaddedMarkSrc');
    expect(src('src/pages/CompanySettingsPage.tsx')).toContain('companyWithLetterheadLookMark');
    expect(src('src/lib/devFieldAuditAuth.ts')).toContain('LETTERHEAD_LOOK');
    expect(existsSync(resolve(process.cwd(), 'public/look/wordmark-padded-field-audit.png'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'public/look/wordmark-padded-field-audit.svg'))).toBe(true);
    expect(existsSync(resolve(process.cwd(), 'public/look/wordmark-field-audit.png'))).toBe(true);
  });
});

describe('letterhead LOOK frames', () => {
  it('covers the logo strip crop plus laptop quote and invoice letterhead', () => {
    for (const rel of [
      'docs/look/logo-strip-laptop-1280.png',
      'docs/look/letterhead-quote-laptop-1280.png',
      'docs/look/letterhead-invoice-laptop-1280.png',
      'docs/look/letterhead-quote-print.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
