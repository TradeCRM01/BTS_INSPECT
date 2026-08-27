import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('Expenses scan-receipt wiring', () => {
  const page = src('src/pages/ExpensesPage.tsx');
  const helper = src('src/lib/expenseReceiptExtract.ts');
  const fn = src('supabase/functions/extract-expense-receipt/index.ts');
  const priceBook = src('supabase/functions/import-price-book-pdf/index.ts');
  const app = src('src/App.tsx');

  it('puts Scan receipt on the expenses sheet with camera + file still available', () => {
    expect(page).toContain('Scan receipt');
    expect(page).toContain('hub-expenses-scan');
    expect(page).toContain('Take photo');
    expect(page).toContain('Choose file');
    expect(page).toContain('capture="environment"');
    expect(page).toContain('accept="image/*"');
    expect(page).toContain('accept="image/*,application/pdf,.pdf"');
    expect(page).toContain('aria-label="Scan receipt with camera"');
    expect(page).toContain('aria-label="Upload receipt file"');
  });

  it('extracts then prefills the existing expense editor and Save writes expenses', () => {
    expect(page).toContain('receiptFileToEditorPrefill');
    expect(page).toContain('auditExpenseReceiptSeed');
    expect(page).toContain('prefill={editing ? undefined : receiptPrefill}');
    expect(page).toContain('from(\'expenses\').insert');
    expect(page).toContain('form.vendor_name');
    expect(page).toContain('form.reference');
    expect(page).toContain('cost_class');
    expect(helper).toContain('export async function receiptFileToEditorPrefill');
    expect(helper).toContain('mapExpenseReceiptExtract');
    expect(helper).toContain("functions/v1/extract-expense-receipt");
  });

  it('uses a thin expenses extract that reads the company Anthropic key, not price-book line items', () => {
    expect(fn).toContain('anthropic_api_key, model');
    expect(fn).toContain('from("ai_settings")');
    expect(fn).toContain('vendor_name');
    expect(fn).toContain('tax_amount');
    expect(fn).toContain('cost_class');
    expect(fn).toContain('https://api.anthropic.com/v1/messages');
    expect(fn).not.toContain('price_book');
    expect(fn).not.toContain('unit_cost');
    expect(priceBook).toContain('Skip freight, GST-only lines');
    expect(helper).not.toContain('import-price-book-pdf');
    expect(page).not.toContain('import-price-book-pdf');
    expect(page).not.toContain('PriceBookPdfImportModal');
  });

  it('stays on /expenses and does not add onboard, documents, or other floors', () => {
    expect(app).toContain('<Route path="/expenses"');
    expect(app).not.toContain('path="/settings/onboard"');
    expect(app).not.toContain('path="/expenses/');
    expect(page).not.toContain('/settings/onboard');
    expect(page).not.toContain('Documents');
    expect(page).not.toContain('Xero');
    expect(page).not.toContain('barcode');
    expect(existsSync(resolve(process.cwd(), 'src/pages/OnboardFromDocsPage.tsx'))).toBe(false);
  });
});
