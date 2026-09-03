import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const ELEVATION = [
  'inset 0 1px 0 #fff',
  '0 10px 28px rgba(10, 37, 64, 0.08)',
] as const;

function sheetChunk(css: string, start: string, end: string): string {
  const from = css.indexOf(start);
  const to = css.indexOf(end, from + start.length);
  return from >= 0 && to > from ? css.slice(from, to) : css.slice(from);
}

describe('remaining list quiet elevation', () => {
  it('applies the week-board / #145 elevation to remaining list sheets only', () => {
    const css = src('src/index.css');
    const team = src('src/pages/TeamSettingsPage.tsx');
    const stock = src('src/pages/StockPage.tsx');
    const pos = src('src/pages/PurchaseOrdersPage.tsx');
    const suppliers = src('src/pages/SuppliersPage.tsx');
    const expenses = src('src/pages/ExpensesPage.tsx');
    const compliance = src('src/pages/CompliancePage.tsx');
    const reports = src('src/pages/ReportsListPage.tsx');

    expect(team).toContain('hub-team-list-sheet');
    expect(team).toContain('hub-team-list-doc');
    expect(stock).toContain('hub-stock-sheet');
    expect(pos).toContain('hub-po-sheet');
    expect(suppliers).toContain('hub-suppliers-sheet');
    expect(expenses).toContain('hub-expenses-sheet');
    expect(compliance).toContain('hub-compliance-sheet is-list');
    expect(reports).toContain('hub-reports-sheet');

    const teamList = sheetChunk(css, '.hub-team-list-doc .hub-team-list-sheet {', '.hub-team-list-bar {');
    const stockSheet = sheetChunk(stock, '.hub-stock-sheet {', '`;');
    const poSheet = sheetChunk(pos, '.hub-po-sheet {', '`;');
    const suppliersSheet = sheetChunk(suppliers, '.hub-suppliers-sheet {', '`;');
    const expensesSheet = sheetChunk(expenses, '.hub-expenses-sheet {', '.hub-expenses-sheet-body {');
    const complianceList = sheetChunk(css, '.hub-compliance-sheet.is-list {', '.hub-compliance-sheet-bar {');
    const reportsSheet = sheetChunk(css, '  .hub-reports-sheet {', '  .hub-reports-backup {');

    for (const sheet of [teamList, stockSheet, poSheet, suppliersSheet, expensesSheet, complianceList, reportsSheet]) {
      expect(sheet).toContain(ELEVATION[0]);
      expect(sheet).toContain(ELEVATION[1]);
      expect(sheet).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow|lacquer|gloss|glow/);
    }

    expect(team).toContain('--team-look-page: #F5F0E6');
    expect(team).toContain('--team-look-sheet: #FFFDF8');
    expect(stock).toContain('--stock-look-page: #F5F0E6');
    expect(stock).toContain('--stock-look-sheet: #FFFDF8');
    expect(pos).toContain('--po-look-page: #F5F0E6');
    expect(pos).toContain('--po-look-sheet: #FFFDF8');
    expect(suppliers).toContain('--suppliers-look-page: #F5F0E6');
    expect(suppliers).toContain('--suppliers-look-sheet: #FFFDF8');
  });

  it('does not restyle jobs/clients lists, open documents, AppShell, schedule, quotes, or invoices', () => {
    const team = src('src/pages/TeamSettingsPage.tsx');
    const stock = src('src/pages/StockPage.tsx');
    const pos = src('src/pages/PurchaseOrdersPage.tsx');
    const suppliers = src('src/pages/SuppliersPage.tsx');
    const expenses = src('src/pages/ExpensesPage.tsx');
    const compliance = src('src/pages/CompliancePage.tsx');
    const reports = src('src/pages/ReportsListPage.tsx');
    const jobs = src('src/pages/JobsPage.tsx');
    const clients = src('src/pages/ClientsPage.tsx');
    const jobOpen = src('src/pages/JobDetailPage.tsx');
    const clientOpen = src('src/pages/ClientDetailPage.tsx');
    const schedule = src('src/pages/SchedulePage.tsx');
    const quotes = src('src/pages/QuotesPage.tsx');
    const invoices = src('src/pages/InvoicesPage.tsx');
    const shell = src('src/components/layout/AppShell.tsx');
    const company = src('src/pages/CompanySettingsPage.tsx');

    expect(jobs).toContain('hub-jobs-sheet');
    expect(clients).toContain('hub-clients-sheet');
    expect(jobs).not.toContain('hub-team-list-sheet');
    expect(clients).not.toContain('hub-stock-sheet');
    expect(jobOpen).toContain('hub-jobs-document');
    expect(jobOpen).not.toContain('hub-team-list-sheet');
    expect(clientOpen).toContain('hub-clients-document');
    expect(schedule).toContain('hub-week-sheet');
    expect(schedule).not.toContain('hub-stock-sheet');
    expect(quotes).not.toContain('hub-stock-sheet');
    expect(invoices).not.toContain('hub-po-sheet');
    expect(shell).not.toContain('hub-stock-sheet');
    expect(shell).not.toContain('hub-team-list-sheet');
    expect(company).not.toContain('hub-team-list-sheet');
    expect(team).toContain('hub-team-sheet');
    expect(team).toContain('is-person-open');
    expect(expenses).toContain('layout="sheet"');
    expect(expenses).toContain('hub-expenses-overlay');
    expect(compliance).toContain('is-record-open');
    expect(reports).toContain('hub-reports-document');
    expect(stock).not.toContain('hub-jobs-sheet');
    expect(pos).not.toContain('hub-clients-sheet');
    expect(suppliers).not.toContain('hub-jobs-document');
    for (const page of [team, stock, pos, suppliers, expenses, compliance, reports]) {
      expect(page).not.toMatch(/Relovi|Littleloop/);
      expect(page).not.toMatch(/\bute\b/i);
    }
  });

  it('LOOK frames cover remaining list elevation', () => {
    for (const rel of [
      'docs/look/list-elevation-team-desktop.png',
      'docs/look/list-elevation-team-phone.png',
      'docs/look/list-elevation-expenses-desktop.png',
      'docs/look/list-elevation-reports-desktop.png',
      'docs/look/list-elevation-stock-desktop.png',
      'docs/look/list-elevation-pos-desktop.png',
      'docs/look/list-elevation-suppliers-desktop.png',
      'docs/look/list-elevation-compliance-desktop.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
