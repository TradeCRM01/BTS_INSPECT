import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultPdfColors } from '../reports/shared/styles';
import { commercialDocumentColors } from '../reports/commercial/CommercialDocumentPdf';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const savedTheme = {
  navy: '#1B3A4B',
  accent: '#C45C26',
  accentLight: '#F4D4C4',
  navyLight: '#2A5366',
};

describe('quote editor overlay report_theme colours', () => {
  it('paints the editor banner from the saved companies.report_theme palette', () => {
    expect(commercialDocumentColors(savedTheme)).toMatchObject(savedTheme);

    const quotes = src('src/pages/QuotesPage.tsx');
    const editor = quotes.split('function QuoteEditorModal')[1] ?? '';
    expect(editor).toContain('commercialDocumentColors');
    expect(editor).toContain('report_theme');
    expect(editor).toContain('quote-doc-theme');
    expect(editor).toContain("'--quote-navy': docColors.navy");
    expect(editor).toContain("'--quote-accent': docColors.accent");
    expect(editor).toContain('overlay-panel-xl ops-doc-panel');
    expect(editor).not.toContain('CompanySettingsPage');
    expect(editor).not.toContain('setReportTheme');
    expect(editor).not.toMatch(/Grafter|Relovi|Littleloop/);
  });

  it('keeps the existing editor banner colours when the theme is blank', () => {
    expect(commercialDocumentColors(null).navy).toBe('#0A2540');
    expect(commercialDocumentColors(null).accent).toBe('#2E75B6');
    expect(commercialDocumentColors({})).toEqual(defaultPdfColors);
  });

  it('does not add a settings page, recast Send, or edit shared PDF chrome', () => {
    const app = src('src/App.tsx');
    expect(app).toContain('CompanySettingsPage');
    expect(app).not.toContain('QuoteTheme');
    expect(existsSync(resolve(process.cwd(), 'src/pages/ReportThemePage.tsx'))).toBe(false);

    const css = src('src/index.css');
    expect(css).toContain('.quote-doc-theme .ops-doc-head');
    expect(css).not.toMatch(/\.quote-doc-theme \.btn-primary/);
    expect(css).not.toMatch(/\.quote-doc-theme \.ops-next-control/);

    const shared = src('src/reports/shared/components.tsx');
    expect(shared).not.toContain('colors?:');
  });

  it('does not disturb quote list cards, invoice PDFs, JHA, Take 5, AppShell, or the Grafter mark', () => {
    const quotes = src('src/pages/QuotesPage.tsx');
    expect(quotes).toContain('commercialPdfCompanyFrom');
    expect(quotes.split('function QuoteCard')[1]?.split('function QuoteRow')[0]).toContain('quote-doc-theme');

    const invoices = src('src/pages/InvoicesPage.tsx');
    expect(invoices).toContain('commercialPdfCompanyFrom');
    expect(invoices).not.toContain('quote-doc-theme');

    const jhaList = src('src/pages/JhaDocumentsPage.tsx');
    expect(jhaList).toContain('jha-doc-theme');

    const take5Fill = src('src/pages/Take5Page.tsx');
    expect(take5Fill).toContain('take5-doc-theme');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).toContain('resolveAppShellColors');

    const mark = src('src/components/brand/grafterMark.ts');
    expect(mark).toContain('GRAFTER_NAVY');
  });

  it('LOOK frames cover blank and saved quote editor chrome only', () => {
    for (const rel of [
      'docs/look/quotes-editor-theme-blank-desktop.png',
      'docs/look/quotes-editor-theme-blank-ute.png',
      'docs/look/quotes-editor-theme-saved-desktop.png',
      'docs/look/quotes-editor-theme-saved-ute.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
