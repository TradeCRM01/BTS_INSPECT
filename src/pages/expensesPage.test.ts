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

  it('puts Scan receipt and Upload on the expenses sheet action row', () => {
    const actionsStart = page.indexOf('<div className="hub-expenses-actions relative">');
    const menuStart = page.indexOf('className="hub-expenses-menu"');
    const actions = page.slice(actionsStart, menuStart);
    const uploadCss = page.slice(page.indexOf('.hub-expenses-upload {'), page.indexOf('.hub-expenses-more {'));

    expect(actions).toContain('Scan receipt');
    expect(actions).toContain('hub-expenses-scan');
    expect(actions).toContain("startReceiptScan('camera')");
    expect(actions).toContain('aria-label="Scan receipt with camera"');
    expect(actions).toContain('Upload');
    expect(actions).toContain('hub-expenses-upload');
    expect(actions).toContain("startReceiptScan('file')");
    expect(actions).toContain('aria-label="Upload receipt file"');
    expect(uploadCss).toContain('height: 44px');
    expect(uploadCss).toContain('min-height: 44px');
    expect(page).toContain('hub-expenses-scan');
    expect(page).toContain('Take photo');
    expect(page).toContain('Choose file');
    expect(page).toContain('capture="environment"');
    expect(page).toContain('accept="image/*"');
    expect(page).toContain('accept="image/*,application/pdf,.pdf"');
    expect(page).toContain('handleReceiptFile');
    expect(page).toContain('receiptFileToEditorPrefill');
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

  it('classifies Bunnings / materials extract as cogs so the Cost of sales card prefills', () => {
    expect(helper).toContain('export function resolveScanCostClass');
    expect(helper).toContain("return 'cogs'");
    expect(helper).toContain('MATERIALS_MERCHANTS');
    expect(helper).toContain('bunnings');
    expect(fn).toContain('function classifyExpenseCostClass');
    expect(fn).toContain('return "cogs"');
    expect(fn).toContain('Do not class Bunnings or job materials as overhead');
    expect(fn).not.toContain('general');
  });

  it('shows the three cost_class cards above category on the scan review sheet', () => {
    const fsm = src('src/types/fsm.ts');
    const sheetStart = page.indexOf('<div className="hub-expenses-review">');
    const overlayStart = page.indexOf('<div className="overlay-backdrop">');
    const sheet = page.slice(sheetStart, overlayStart);

    expect(fsm).toContain("export type ExpenseCostClass = 'overhead' | 'cogs' | 'employee'");
    expect(fsm).toContain("overhead: 'Overhead'");
    expect(fsm).toContain("cogs: 'Cost of sales'");
    expect(fsm).toContain("employee: 'Employee cost'");
    expect(fsm).not.toMatch(/general|tax[_ ]class/i);

    expect(page).toContain('function ExpenseCostClassCards');
    expect(page).toContain('const selectCostClass');
    expect(page).toContain('cost_class: key');
    expect(page).toContain('suggestCategory(key)');
    expect(page).toContain('(Object.keys(EXPENSE_COST_CLASS_LABELS) as ExpenseCostClass[])');
    expect(page).not.toContain('general');
    expect(page).not.toMatch(/tax class/i);

    expect(sheet).toContain('ExpenseCostClassCards');
    expect(sheet).toContain('onSelect={selectCostClass}');
    expect(sheet).toContain('form.cost_class');
    expect(sheet.indexOf('ExpenseCostClassCards')).toBeLessThan(sheet.indexOf('Category'));
    expect(sheet).not.toMatch(/general|tax class/i);
    expect((sheet.match(/ExpenseCostClassCards/g) || []).length).toBe(1);
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
