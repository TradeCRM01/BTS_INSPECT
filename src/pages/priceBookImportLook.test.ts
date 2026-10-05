import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PRICE_BOOKS_SUBTITLE, priceBookItemsChrome } from '../lib/priceBookToolbar';

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
    expect(page).toContain('Import PDF');
    expect(page).not.toContain('Import from PDF');
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
    expect(src('src/pages/InvoicesPage.tsx')).toContain('calcLineDocumentTotals');
    expect(src('src/lib/invoiceFromQuote.ts')).toContain('calcLineDocumentTotals(line_items, taxRate)');
  });

  it('uses the AU subtitle and hides toolbar actions on an empty book', () => {
    const page = src('src/pages/PriceBooksPage.tsx');
    expect(page).toContain('PRICE_BOOKS_SUBTITLE');
    expect(PRICE_BOOKS_SUBTITLE).toBe('Your prices for quick, consistent quotes.');
    expect(priceBookItemsChrome(0).showSearch).toBe(false);
    expect(priceBookItemsChrome(0).showToolbarActions).toBe(false);
    expect(priceBookItemsChrome(2).showSearch).toBe(true);
    expect(page).toContain('data-price-book-search');
    expect(page).toContain('data-price-book-toolbar-actions');
    expect(page).toContain('data-price-book-empty-actions');
    expect(page).toContain('No items match your search');
  });
});
