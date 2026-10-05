import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('price book CSV import look', () => {
  it('sits on the existing price book page with cream, sheet, navy, and accent', () => {
    const page = src('src/pages/PriceBooksPage.tsx');
    const modal = src('src/components/pricebooks/PriceBookCsvImportModal.tsx');
    const picker = src('src/components/invoicing/LineItemEditor.tsx');

    expect(page).toContain('PriceBookCsvImportModal');
    expect(page).toContain('Import CSV');
    expect(page).not.toMatch(/Relovi|Littleloop/);
    expect(modal).not.toMatch(/Relovi|Littleloop/);

    expect(modal).toContain('bg-cream');
    expect(modal).toContain('#FFFDF8');
    expect(modal).toContain('text-navy');
    expect(modal).toContain('bg-accent');
    expect(modal).toContain('min-h-[44px]');
    expect(modal).toContain('grid-cols-1');

    expect(picker).toContain('quoteLineFromPriceBookItem');
    expect(picker).toContain('gst_label');
    expect(picker).toContain('gst_rate: pick.gst_rate');
    expect(src('src/pages/QuotesPage.tsx')).toContain('calcLineDocumentTotals');
    expect(src('src/lib/invoiceFromQuote.ts')).toContain('calcDocumentTotals(rawSubtotal, taxRate)');
  });
});
