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

describe('quote list cards report_theme colours', () => {
  it('paints list cards from the saved companies.report_theme palette', () => {
    expect(commercialDocumentColors(savedTheme)).toMatchObject(savedTheme);
    expect(commercialDocumentColors(savedTheme).navy).toBe('#1B3A4B');
    expect(commercialDocumentColors(savedTheme).accent).toBe('#C45C26');

    const list = src('src/pages/QuotesPage.tsx');
    expect(list).toContain('commercialDocumentColors');
    expect(list).toContain('report_theme');
    expect(list).toContain('quote-doc-theme');
    expect(list).toContain("'--quote-navy': theme.navy");
    expect(list).toContain("'--quote-accent': theme.accent");
    expect(list).not.toContain('CompanySettingsPage');
    expect(list).not.toContain('setReportTheme');
    expect(list).not.toMatch(/Grafter|Relovi|Littleloop/);
  });

  it('keeps the existing quote card colours when the theme is blank', () => {
    expect(commercialDocumentColors(null).navy).toBe('#0A2540');
    expect(commercialDocumentColors(null).accent).toBe('#2E75B6');
    expect(commercialDocumentColors({})).toEqual(defaultPdfColors);
  });

  it('overlays only the existing report_theme keys and does not invent a cream fallback', () => {
    const colors = commercialDocumentColors({ navy: '#111111', cream: '#F5F0E6' });
    expect(colors.navy).toBe('#111111');
    expect(colors.accent).toBe(defaultPdfColors.accent);
    expect(JSON.stringify(colors)).not.toMatch(/#F5F0E6|#FAF3E0|#FBF6EE/i);
    expect(JSON.stringify(colors)).not.toMatch(/cream|grafter|relovi|littleloop/i);
  });

  it('does not add a settings page, recast Send, or paint the quote editor overlay', () => {
    const app = src('src/App.tsx');
    expect(app).toContain('CompanySettingsPage');
    expect(app).not.toContain('QuoteTheme');
    expect(app).not.toContain('ReportThemePage');
    expect(existsSync(resolve(process.cwd(), 'src/pages/ReportThemePage.tsx'))).toBe(false);

    const css = src('src/index.css');
    expect(css).toContain('.quote-doc-theme .ops-doc-head');
    expect(css).toContain('--quote-navy: #0A2540');
    expect(css).toContain('--quote-accent: #2E75B6');
    expect(css).not.toMatch(/\.quote-doc-theme \.btn-primary/);
    expect(css).not.toMatch(/\.quote-doc-theme \.ops-next-control/);

    const quotes = src('src/pages/QuotesPage.tsx');
    const editor = quotes.split('function QuoteEditorModal')[1] ?? '';
    expect(editor).toContain('overlay-panel-xl ops-doc-panel');
    expect(editor).not.toContain('quote-doc-theme');

    const shared = src('src/reports/shared/components.tsx');
    expect(shared).not.toContain('colors?:');
  });

  it('does not disturb quote/invoice PDFs, JHA list, Take 5 fill, AppShell, or the Grafter mark', () => {
    const quotes = src('src/pages/QuotesPage.tsx');
    expect(quotes).toContain('commercialPdfCompanyFrom');

    const invoices = src('src/pages/InvoicesPage.tsx');
    expect(invoices).toContain('commercialPdfCompanyFrom');
    expect(invoices).not.toContain('quote-doc-theme');

    const commercial = src('src/reports/commercial/CommercialDocumentPdf.tsx');
    expect(commercial).toContain('commercialDocumentColors');

    const jhaList = src('src/pages/JhaDocumentsPage.tsx');
    expect(jhaList).toContain('jha-doc-theme');
    expect(jhaList).not.toContain('quote-doc-theme');

    const take5Fill = src('src/pages/Take5Page.tsx');
    expect(take5Fill).toContain('take5-doc-theme');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).toContain('resolveAppShellColors');

    const mark = src('src/components/brand/grafterMark.ts');
    expect(mark).toContain('GRAFTER_NAVY');
  });
});
