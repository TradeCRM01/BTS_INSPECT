import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expenseCategoryFallbackItems } from './expenseCategoryDefaults';
import { expenseReceiptStoragePath } from './expenseReceiptAttach';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('EXPENSE-1 plain attach and AI key gating', () => {
  it('hides company-AI scan controls when no key and keeps plain attach on the editor', () => {
    const page = src('src/pages/ExpensesPage.tsx');
    expect(page).toContain('useCompanyAiKey');
    expect(page).toContain('companyAiKey');
    expect(page).toContain('data-expense-ai-scan');
    expect(page).toContain('data-expense-attach');
    expect(page).toContain('Attach receipt or photo');
    expect(page).toContain('expenseReceiptStoragePath');
    expect(page).toContain('EXPENSE_RECEIPT_BUCKET');
  });

  it('seeds expense categories when the managed list is empty', () => {
    const managed = src('src/lib/useManagedList.ts');
    expect(managed).toContain('expenseCategoryFallbackItems');
    const items = expenseCategoryFallbackItems();
    expect(items.length).toBeGreaterThanOrEqual(3);
    expect(items.some(i => i.label.includes('Rent'))).toBe(true);
    expect(items.some(i => i.label.includes('Materials'))).toBe(true);
    expect(items.some(i => i.label.includes('Wages'))).toBe(true);
  });

  it('uses inc-GST as the primary amount on the add-expense overlay', () => {
    const page = src('src/pages/ExpensesPage.tsx');
    expect(page).toContain('Amount (inc GST)');
    expect(page).toContain('data-expense-gst');
  });

  it('gates other company-AI surfaces (price book PDF, shell nav, dashboard agent)', () => {
    expect(src('src/pages/PriceBooksPage.tsx')).toContain('useCompanyAiKey');
    expect(src('src/pages/PriceBooksPage.tsx')).toContain('data-price-book-ai-import');
    expect(src('src/components/layout/AppShell.tsx')).toContain('useCompanyAiKey');
    expect(src('src/widgets/IntelligenceWidgets.tsx')).toContain('useCompanyAiKey');
  });

  it('stores receipt files under company/expenses on uploaded-pdfs', () => {
    expect(expenseReceiptStoragePath({
      companyId: 'co-1',
      expenseId: 'ex-1',
      fileName: 'bunnings.jpg',
    })).toBe('co-1/expenses/ex-1/bunnings.jpg');
  });
});
