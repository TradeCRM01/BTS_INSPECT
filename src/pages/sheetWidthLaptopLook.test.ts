import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function sheetChunk(css: string, start: string, end: string): string {
  const from = css.indexOf(start);
  const to = css.indexOf(end, from + start.length);
  return from >= 0 && to > from ? css.slice(from, to) : css.slice(from);
}

const LIST_SHEETS = [
  ['  .dashboard-home-sheet {', '  .dashboard-home-sheet-bar {'],
  ['  .hub-jobs-list-doc .hub-jobs-sheet {', '  .hub-jobs-list-bar {'],
  ['  .hub-clients-list-doc .hub-clients-sheet {', '  .hub-clients-list-bar {'],
  ['  .hub-reports-list-doc .hub-reports-sheet {', '  .hub-reports-list-bar {'],
  ['  .hub-inspections-list-doc .hub-inspections-sheet {', '  .hub-inspections-list-bar {'],
  ['  .hub-jha-list-doc .hub-jha-sheet {', '  .hub-jha-list-bar {'],
  ['  .hub-take5-list-doc .hub-take5-sheet {', '  .hub-take5-list-bar {'],
  ['  .hub-team-list-doc .hub-team-list-sheet {', '  .hub-team-list-bar {'],
  ['  .hub-compliance-list-doc .hub-compliance-list-sheet {', '  .hub-compliance-list-bar {'],
] as const;

describe('list/dashboard sheet width — one shared paper, not nine 1100 islands', () => {
  it('uses one token/rule so existing list and dashboard papers share width', () => {
    const css = src('src/index.css');
    const shared = css.slice(
      css.indexOf('/* Shared list/dashboard paper width.'),
      css.indexOf('.ops-page-fill'),
    );

    expect(css).toContain('--hub-list-sheet-max: none;');
    expect(shared).toContain('.dashboard-home-sheet');
    expect(shared).toContain('.hub-jobs-list-doc .hub-jobs-sheet');
    expect(shared).toContain('.hub-clients-list-doc .hub-clients-sheet');
    expect(shared).toContain('.hub-reports-list-doc .hub-reports-sheet');
    expect(shared).toContain('.hub-inspections-list-doc .hub-inspections-sheet');
    expect(shared).toContain('.hub-jha-list-doc .hub-jha-sheet');
    expect(shared).toContain('.hub-take5-list-doc .hub-take5-sheet');
    expect(shared).toContain('.hub-team-list-doc .hub-team-list-sheet');
    expect(shared).toContain('.hub-compliance-list-doc .hub-compliance-list-sheet');
    expect(shared).toContain('max-width: var(--hub-list-sheet-max)');
    expect(shared).toContain('width: 100%');
    expect(shared).not.toContain('1100px');
    expect(shared).not.toMatch(/\bute\b/i);

    for (const [start, end] of LIST_SHEETS) {
      const chunk = sheetChunk(css, start, end);
      expect(chunk).toContain('background: #FFFDF8');
      expect(chunk).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
      expect(chunk).not.toContain('1100px');
    }
  });

  it('does not widen quote, invoice, week-board, job sheet, or person sheet', () => {
    const css = src('src/index.css');
    const shared = css.slice(
      css.indexOf('/* Shared list/dashboard paper width.'),
      css.indexOf('.ops-page-fill'),
    );

    expect(shared).not.toContain('.hub-quote-sheet');
    expect(shared).not.toContain('.hub-invoice-sheet');
    expect(shared).not.toContain('.hub-week-document');
    expect(shared).not.toContain('.hub-week-sheet');
    expect(shared).not.toContain('.hub-jobs-document');
    expect(shared).not.toContain('.hub-clients-document');
    expect(shared).not.toContain('.hub-team-sheet');

    const quote = sheetChunk(css, '  .hub-quote-sheet {', '  .hub-quote-banner {');
    const invoice = sheetChunk(css, '  .hub-invoice-sheet {', '  .hub-invoice-banner {');
    const week = sheetChunk(css, '  .hub-week-sheet,\n  .hub-week-document {', '  .hub-week-sheet .hub-week-board');
    const jobDoc = sheetChunk(css, '  .hub-jobs-document {', '  .hub-jobs-sheet-bar {');
    const person = sheetChunk(src('src/pages/TeamSettingsPage.tsx'), '.hub-team-sheet {', '.hub-team-sheet-bar');

    expect(quote).not.toContain('var(--hub-list-sheet-max)');
    expect(invoice).not.toContain('var(--hub-list-sheet-max)');
    expect(week).toContain('max-width: 1100px');
    expect(jobDoc).toContain('max-width: 1100px');
    expect(person).toContain('max-width: 1100px');
  });

  it('stays off landing, leftovers, Relovi, persist, search, and convert', () => {
    const css = src('src/index.css');
    expect(src('src/pages/MarketingPage.tsx')).not.toContain('--hub-list-sheet-max');
    expect(src('src/pages/QuotesPage.tsx')).not.toContain('--hub-list-sheet-max');
    expect(src('src/pages/JobDetailPage.tsx')).not.toContain('--hub-list-sheet-max');
    expect(src('src/pages/SchedulePage.tsx')).not.toContain('--hub-list-sheet-max');
    expect(src('src/components/layout/AppShell.tsx')).not.toContain('--hub-list-sheet-max');
    expect(src('src/pages/LoginPage.tsx')).not.toContain('--hub-list-sheet-max');
    expect(css).not.toMatch(/Grafter|Relovi|Littleloop/);
    expect(src('src/pages/JobsPage.tsx')).toContain('jobOpenNext');
    expect(src('src/pages/ClientsPage.tsx')).toContain('filterClientsForSearch');
    expect(src('src/pages/DashboardPage.tsx')).toContain('persistWidget');
    expect(src('src/pages/QuotesPage.tsx')).not.toContain('sendQuoteDeliver');
    expect(src('src/pages/JobsPage.tsx')).not.toContain('CONVERT_QUOTE_NEED_DATE_CREW');
  });
});
