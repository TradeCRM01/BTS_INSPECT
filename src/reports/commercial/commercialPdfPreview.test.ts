import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commercialPdfGstLabel, commercialPdfPreviewData } from './CommercialDocumentPdf';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function previewBlock(page: string, endMarker: string): string {
  const start = page.indexOf('const previewData');
  return page.slice(start, page.indexOf(endMarker, start));
}

describe('commercialPdfPreviewData', () => {
  it('labels a mixed-rate preview GST and a single-rate preview GST (10%)', () => {
    const mixed = commercialPdfPreviewData(
      { taxRate: 10 },
      [
        { quantity: 1, unit_price: 9.2, gst_rate: 10 },
        { quantity: 1, unit_price: 0, gst_rate: 0 },
      ],
    );
    expect(mixed.taxLabel).toBe('GST');
    expect(commercialPdfGstLabel(mixed)).toBe('GST');

    const single = commercialPdfPreviewData(
      { taxRate: 10 },
      [{ quantity: 1, unit_price: 100 }],
    );
    expect(single.taxLabel).toBe('GST (10%)');
    expect(commercialPdfGstLabel(single)).toBe('GST (10%)');

    const quotePreview = previewBlock(src('src/pages/QuotesPage.tsx'), 'const buildPayload');
    expect(quotePreview).toContain('commercialPdfPreviewData');
    expect(quotePreview).toContain('cleanLines');

    const invoicePreview = previewBlock(src('src/pages/InvoicesPage.tsx'), 'const handleImportFromJob');
    expect(invoicePreview).toContain('commercialPdfPreviewData');
    expect(invoicePreview).toContain('cleanLines');
  });
});
