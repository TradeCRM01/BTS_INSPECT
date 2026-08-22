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

describe('invoice list sheet report_theme colours', () => {
  it('paints the list thead from the saved companies.report_theme palette', () => {
    expect(commercialDocumentColors(savedTheme)).toMatchObject(savedTheme);
    expect(commercialDocumentColors(savedTheme).navy).toBe('#1B3A4B');
    expect(commercialDocumentColors(savedTheme).accent).toBe('#C45C26');

    const invoices = src('src/pages/InvoicesPage.tsx');
    const page = invoices.split('function InvoiceHit')[0] ?? '';
    expect(page).toContain('commercialDocumentColors');
    expect(page).toContain('report_theme');
    expect(page).toContain('invoice-doc-theme');
    expect(page).toContain("'--invoice-navy': listColors.navy");
    expect(page).toContain("'--invoice-accent': listColors.accent");
    expect(page).not.toContain('CompanySettingsPage');
    expect(page).not.toContain('setReportTheme');
    expect(page).not.toMatch(/Grafter|Relovi|Littleloop|Manrope/);
    expect(page).not.toContain('ops-card');
    expect(page).not.toContain('OpsDocHead');
  });

  it('keeps the existing list thead colours when the theme is blank', () => {
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

  it('does not add a settings page, recast Send, or turn the sheet into quote cards', () => {
    const app = src('src/App.tsx');
    expect(app).toContain('CompanySettingsPage');
    expect(app).not.toContain('InvoiceTheme');
    expect(app).not.toContain('ReportThemePage');
    expect(existsSync(resolve(process.cwd(), 'src/pages/ReportThemePage.tsx'))).toBe(false);

    const css = src('src/index.css');
    expect(css).toContain('.invoice-doc-theme .hub-invoices-thead');
    expect(css).toContain('.invoice-doc-theme .hub-invoices-chrome .hub-chrome-filter-on');
    expect(css).not.toMatch(/\.invoice-doc-theme \.btn-primary/);
    expect(css).not.toMatch(/\.invoice-doc-theme \.ops-next-control/);
    expect(css).not.toMatch(/\.invoice-doc-theme \.ops-doc-head/);

    const invoices = src('src/pages/InvoicesPage.tsx');
    const hit = invoices.split('function InvoiceHit')[1]?.split('function InvoiceEditorModal')[0] ?? '';
    expect(hit).toContain('hub-invoices-row');
    expect(hit).not.toContain('invoice-doc-theme');
    expect(hit).not.toContain('ops-card');
    expect(hit).not.toContain('OpsDocHead');

    const send = src('src/components/invoicing/InvoiceSendDialog.tsx');
    expect(send).toContain('hub-invoice-send');
    expect(send).not.toContain('invoice-doc-theme');

    const shared = src('src/reports/shared/components.tsx');
    expect(shared).not.toContain('colors?:');
  });

  it('does not disturb invoice editor, quote list, JHA, Take 5, AppShell, or the Grafter mark', () => {
    const invoices = src('src/pages/InvoicesPage.tsx');
    const editor = invoices.split('function InvoiceEditorModal')[1] ?? '';
    expect(editor).toContain('invoice-doc-theme');
    expect(editor).toContain('hub-invoice-banner');
    expect(editor).toContain("'--invoice-navy': docColors.navy");

    const quotes = src('src/pages/QuotesPage.tsx');
    expect(quotes).toContain('quote-doc-theme');
    expect(quotes).not.toContain('invoice-doc-theme');

    const jhaList = src('src/pages/JhaDocumentsPage.tsx');
    expect(jhaList).toContain('jha-doc-theme');
    expect(jhaList).not.toContain('invoice-doc-theme');

    const take5Fill = src('src/pages/Take5Page.tsx');
    expect(take5Fill).toContain('take5-doc-theme');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).toContain('resolveAppShellColors');

    const mark = src('src/components/brand/grafterMark.ts');
    expect(mark).toContain('GRAFTER_NAVY');
  });
});
