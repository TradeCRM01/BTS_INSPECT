import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildExpenseSaveAmounts,
  expenseAmountTypingFromEx,
  expenseGstBlurStep,
  expenseGstInputStep,
  expenseIncGstBlurStep,
  expenseIncGstInputStep,
  expenseTaxRateStep,
  initialExpenseAmountFieldDrafts,
  moneyTax,
  round2,
  sanitizeExpenseDecimalDraft,
  typeExpenseIncGstKeystrokes,
} from './ExpensesPage';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function typeKeystrokes(
  start: ReturnType<typeof expenseAmountTypingFromEx>,
  text: string,
  field: 'inc' | 'gst',
) {
  let state = start;
  for (let i = 1; i <= text.length; i += 1) {
    const chunk = text.slice(0, i);
    state = field === 'inc'
      ? expenseIncGstInputStep(state, chunk)
      : expenseGstInputStep(state, chunk);
  }
  return state;
}

describe('EXPENSE-AMT inc-GST / GST typing', () => {
  const empty = expenseAmountTypingFromEx('', '10');

  it('keystroke-by-keystroke inc-GST matches typed text at each step', () => {
    for (const text of ['5', '55', '55.5', '1234.56']) {
      const end = typeExpenseIncGstKeystrokes(empty, text);
      expect(end.incDraft).toBe(text);
    }
  });

  it('derives ex-GST and GST at 10% while typing inc-GST', () => {
    const at55 = typeExpenseIncGstKeystrokes(empty, '55');
    expect(at55.exAmount).toBe('50');
    expect(at55.gstDraft).toBe('5');
    const at555 = typeExpenseIncGstKeystrokes(empty, '55.5');
    expect(at555.incDraft).toBe('55.5');
    expect(at555.exAmount).toBe('50.45');
    expect(at555.gstDraft).toBe('5.05');
  });

  it('formats inc-GST to 2dp on blur and supports paste', () => {
    const pasted = expenseIncGstInputStep(empty, sanitizeExpenseDecimalDraft('$55.00')!);
    expect(pasted.incDraft).toBe('55.00');
    const blurred = expenseIncGstBlurStep(pasted);
    expect(blurred.incDraft).toBe('55.00');
    expect(blurred.exAmount).toBe('50');
    expect(blurred.gstDraft).toBe('5.00');
  });

  it('allows backspace to empty on inc-GST', () => {
    const typed = typeExpenseIncGstKeystrokes(empty, '55');
    const cleared = expenseIncGstInputStep(typed, '');
    expect(cleared.incDraft).toBe('');
    expect(cleared.exAmount).toBe('');
    expect(cleared.gstDraft).toBe('');
  });

  it('keystroke-by-keystroke GST field matches typed text', () => {
    const withEx = expenseAmountTypingFromEx('50', '10');
    for (const text of ['5', '55', '0.05']) {
      const end = typeKeystrokes(withEx, text, 'gst');
      expect(end.gstDraft).toBe(text);
    }
  });

  it('GST blur formats to 2dp and sets tax rate from ex', () => {
    const withEx = expenseAmountTypingFromEx('50', '10');
    const typed = expenseGstInputStep(withEx, '5');
    const blurred = expenseGstBlurStep(typed);
    expect(blurred.gstDraft).toBe('5.00');
    expect(blurred.taxRate).toBe('10');
  });

  it('tax rate change recomputes ex and GST from inc-GST (55 inc → 50 ex / 5 GST)', () => {
    const typed = typeExpenseIncGstKeystrokes(empty, '55');
    const blurred = expenseIncGstBlurStep(typed);
    expect(blurred.incDraft).toBe('55.00');
    expect(blurred.exAmount).toBe('50');
    expect(blurred.gstDraft).toBe('5.00');
    const gstFree = expenseTaxRateStep(blurred, '0');
    expect(gstFree.exAmount).toBe('55');
    expect(gstFree.incDraft).toBe('55.00');
    const { tax_amount, total } = moneyTax(55, 0);
    expect(tax_amount).toBe(0);
    expect(total).toBe(55);
  });

  it('editing an existing expense opens on saved total', () => {
    const drafts = initialExpenseAmountFieldDrafts({
      exAmount: '50',
      taxRate: '10',
      savedTotal: 55,
    });
    expect(drafts.incDraft).toBe('55.00');
    expect(drafts.gstDraft).toBe('5.00');
  });

  it('GST edit sets inc to ex + gst (55 inc then GST 4.50 → 54.50 save)', () => {
    const at55 = expenseIncGstBlurStep(typeExpenseIncGstKeystrokes(empty, '55'));
    const gstTyped = expenseGstInputStep(at55, '4.50');
    expect(gstTyped.incDraft).toBe('54.5');
    const gstBlurred = expenseGstBlurStep(gstTyped);
    expect(gstBlurred.incDraft).toBe('54.50');
    const saved = buildExpenseSaveAmounts({
      amountSource: gstBlurred.amountSource,
      incDraft: gstBlurred.incDraft,
      exAmount: gstBlurred.exAmount,
      taxRate: gstBlurred.taxRate,
    });
    expect(saved.total).toBe(54.5);
    expect(saved.amount).toBe(50);
    expect(saved.tax_amount).toBe(4.5);
  });
});

function sweepIncSaveCents(taxRate: string, fromCents = 1, toCents = 200_000): { checked: number; mismatches: number } {
  let mismatches = 0;
  for (let cents = fromCents; cents <= toCents; cents += 1) {
    const inc = cents / 100;
    const incText = inc.toFixed(2);
    let state = expenseAmountTypingFromEx('', taxRate);
    state = typeExpenseIncGstKeystrokes(state, incText);
    state = expenseIncGstBlurStep(state);
    const saved = buildExpenseSaveAmounts({
      amountSource: state.amountSource,
      incDraft: state.incDraft,
      exAmount: state.exAmount,
      taxRate: state.taxRate,
    });
    const totalCents = Math.round(saved.total * 100);
    const sumCents = Math.round((saved.amount + saved.tax_amount) * 100);
    if (totalCents !== cents || sumCents !== totalCents) mismatches += 1;
  }
  return { checked: toCents - fromCents + 1, mismatches };
}

describe('EXPENSE-AMT money-truth save payload', () => {
  it('sweep 0.01–2000.00 inc at 10%: saved total matches typed inc (cents)', () => {
    const { checked, mismatches } = sweepIncSaveCents('10');
    expect(mismatches).toBe(0);
    expect(checked).toBe(200_000);
  });

  it('sweep 0.01–2000.00 inc at 0% (GST-free)', () => {
    const { checked, mismatches } = sweepIncSaveCents('0');
    expect(mismatches).toBe(0);
    expect(checked).toBe(200_000);
  });

  it('sweep 0.01–2000.00 inc at 15%', () => {
    const { checked, mismatches } = sweepIncSaveCents('15');
    expect(mismatches).toBe(0);
    expect(checked).toBe(200_000);
  });

  it('known 10% inc totals do not drift by 1c (50.00, 70.35, 52.96, 74.42)', () => {
    for (const inc of [50, 70.35, 52.96, 74.42]) {
      const state = expenseIncGstBlurStep(typeExpenseIncGstKeystrokes(expenseAmountTypingFromEx('', '10'), inc.toFixed(2)));
      const saved = buildExpenseSaveAmounts({
        amountSource: 'inc',
        incDraft: state.incDraft,
        exAmount: state.exAmount,
        taxRate: '10',
      });
      expect(saved.total).toBe(inc);
      expect(round2(saved.amount + saved.tax_amount)).toBe(saved.total);
      expect(saved.total).not.toBe(moneyTax(saved.amount, 10).total);
    }
  });

  it('ex-sourced path still uses moneyTax when inc draft is empty', () => {
    const saved = buildExpenseSaveAmounts({
      amountSource: 'ex',
      incDraft: '',
      exAmount: '100',
      taxRate: '10',
    });
    expect(saved).toEqual({ amount: 100, tax_rate: 10, tax_amount: 10, total: 110 });
  });
});

describe('EXPENSE-AMT ExpensesPage wiring', () => {
  const page = src('src/pages/ExpensesPage.tsx');

  it('uses draft strings for receipt and form inc-GST / GST inputs (no toFixed while typing)', () => {
    expect(page).toContain('incGstDraft');
    expect(page).toContain('gstDraft');
    expect(page).toContain('handleIncGstInput');
    expect(page).toContain('handleGstInput');
    expect(page).toContain('handleIncGstBlur');
    expect(page).toContain('buildExpenseSaveAmounts');
    expect(page).not.toMatch(/value=\{form\.amount === '' \? '' : total\.toFixed\(2\)\}/);
    expect(page).not.toMatch(/value=\{form\.amount === '' \? '' : tax_amount\.toFixed\(2\)\}/);
    const incInputs = page.match(/Amount \(inc GST\)[\s\S]{0,400}inputMode="decimal"/g) ?? [];
    expect(incInputs.length).toBeGreaterThanOrEqual(2);
    expect(page).toContain('type="text"\n                  inputMode="decimal"\n                  value={incGstDraft}');
  });
});

describe('Expenses scan-receipt wiring', () => {
  const page = src('src/pages/ExpensesPage.tsx');
  const helper = src('src/lib/expenseReceiptExtract.ts');
  const fn = src('supabase/functions/extract-expense-receipt/index.ts');
  const priceBook = src('supabase/functions/import-price-book-pdf/index.ts');
  const app = src('src/App.tsx');

  it('puts Scan receipt and Upload on the expenses sheet action row when a company AI key exists', () => {
    expect(page).toContain('useCompanyAiKey');
    expect(page).toContain('companyAiKey');
    const actionsStart = page.indexOf('data-expense-actions="1"');
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
    expect(actions).toContain('aria-label="Upload receipt file for AI scan"');
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
    expect(fsm).toContain("overhead: 'Overheads'");
    expect(fsm).toContain("cogs: 'Cost of sales'");
    expect(fsm).toContain("employee: 'Employee'");
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
    expect((sheet.match(/ExpenseCostClassCards/g) || []).length).toBeGreaterThanOrEqual(1);
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
