import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('Expenses scan-receipt cream paper look', () => {
  it('paints /expenses as cream paper with Scan receipt on the sheet and no eyebrow', () => {
    const page = src('src/pages/ExpensesPage.tsx');
    const css = src('src/index.css');
    const app = src('src/App.tsx');
    const extract = src('src/lib/expenseReceiptExtract.ts');
    const fn = src('supabase/functions/extract-expense-receipt/index.ts');

    expect(page).toContain('EXPENSES_LOOK_CSS');
    expect(page).toContain('hub-expenses');
    expect(page).toContain('hub-expenses-hero');
    expect(page).toContain('hub-expenses-sheet');
    expect(page).toContain('hub-expenses-scan');
    expect(page).toContain('hub-expenses-save');
    expect(page).toContain('hub-expenses-preview');
    expect(page).toContain('layout="sheet"');
    expect(page).toContain('Scan receipt');
    expect(page).toContain('MoreHorizontal');
    expect(page).toContain('--ex-look-page: #F5F0E6');
    expect(page).toContain('--ex-look-sheet: #FFFDF8');
    expect(page).toContain('--ex-look-ink: #0A2540');
    expect(page).toContain('--ex-look-line: #E2D9CC');
    expect(page).toContain('#2E75B6');
    expect(page).toContain("font-family: Rajdhani, sans-serif");
    expect(page).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(page).toContain('box-shadow: inset 0 1px 0 #fff');
    expect(page).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(page).toContain('>Expenses</h1>');
    expect(page).not.toContain('hub-expenses-kicker');
    expect(page).not.toContain('>EXPENSES<');
    expect(page).not.toMatch(/Grafter|Relovi|Littleloop/);
    expect(page).not.toMatch(/\bute\b/i);
    expect(page).not.toContain('#16A34A');
    expect(page).not.toContain('#15803D');
    expect(page).not.toContain('text-green-700');
    expect(page).not.toContain('btn-primary');
    expect(page).not.toContain('Documents');
    expect(page).not.toContain('/settings/onboard');

    const lookCss = page.slice(page.indexOf('EXPENSES_LOOK_CSS'));
    expect(lookCss).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);

    expect(css).not.toContain('hub-expenses');
    expect(app).not.toContain('path="/expenses/');
    expect(extract).toContain('export async function receiptFileToEditorPrefill');
    expect(fn).toContain('https://api.anthropic.com/v1/messages');
  });

  it('leaves extract, AppShell, and other floors untouched', () => {
    const page = src('src/pages/ExpensesPage.tsx');
    expect(page).toContain('receiptFileToEditorPrefill');
    expect(page).toContain("from('expenses').insert");
    expect(page).toContain('auditExpenseReceiptSeed');
    expect(page).not.toContain('hub-timesheets');
    expect(page).not.toContain('hub-jobs');
    expect(page).not.toContain('hub-reports');
    expect(page).not.toContain('hub-take5');
    expect(page).not.toContain('hub-jha');
    expect(page).not.toContain('hub-inspections');
    expect(page).not.toContain('hub-clients');
    expect(page).not.toContain('JobDetailPage');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).not.toContain('hub-expenses');
    expect(shell).toContain('resolveAppShellColors');

    const extract = src('src/lib/expenseReceiptExtract.ts');
    expect(extract).not.toContain('hub-expenses');
    expect(extract).toContain('vendor_name: \'Bunnings\'');
  });

  it('LOOK frames cover the review-scanned-expense sheet desktop and phone', () => {
    for (const rel of [
      'docs/look/expenses-scan-receipt-desktop.png',
      'docs/look/expenses-scan-receipt-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
