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

describe('invoice editor overlay report_theme colours', () => {
  it('paints the editor banner from the saved companies.report_theme palette', () => {
    expect(commercialDocumentColors(savedTheme)).toMatchObject(savedTheme);

    const invoices = src('src/pages/InvoicesPage.tsx');
    const editor = invoices.split('function InvoiceEditorModal')[1] ?? '';
    expect(editor).toContain('commercialDocumentColors');
    expect(editor).toContain('report_theme');
    expect(editor).toContain('invoice-doc-theme');
    expect(editor).toContain("'--invoice-navy': docColors.navy");
    expect(editor).toContain("'--invoice-accent': docColors.accent");
    expect(editor).toContain('overlay-panel-xl hub-invoice-editor');
    expect(editor).not.toContain('ops-doc-panel');
    expect(editor).not.toContain('OpsDocHead');
    expect(editor).not.toContain('CompanySettingsPage');
    expect(editor).not.toContain('setReportTheme');
    expect(editor).not.toMatch(/Grafter|Relovi|Littleloop|Manrope/);
  });

  it('keeps the existing editor banner colours when the theme is blank', () => {
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

  it('does not add a settings page, recast Send, or edit shared PDF chrome', () => {
    const app = src('src/App.tsx');
    expect(app).toContain('CompanySettingsPage');
    expect(app).not.toContain('InvoiceTheme');
    expect(app).not.toContain('ReportThemePage');
    expect(existsSync(resolve(process.cwd(), 'src/pages/ReportThemePage.tsx'))).toBe(false);

    const css = src('src/index.css');
    expect(css).toContain('.invoice-doc-theme .hub-invoice-banner');
    expect(css).not.toMatch(/\.invoice-doc-theme \.btn-primary/);
    expect(css).not.toMatch(/\.invoice-doc-theme \.ops-next-control/);
    expect(css).not.toMatch(/\.invoice-doc-theme \.ops-doc-head/);

    const send = src('src/components/invoicing/InvoiceSendDialog.tsx');
    expect(send).toContain('hub-invoice-send');
    expect(send).not.toContain('invoice-doc-theme');

    const shared = src('src/reports/shared/components.tsx');
    expect(shared).not.toContain('colors?:');
  });

  it('does not disturb invoice list, quote editor, JHA, Take 5, AppShell, or the Grafter mark', () => {
    const invoices = src('src/pages/InvoicesPage.tsx');
    const list = invoices.split('function InvoiceEditorModal')[0] ?? '';
    expect(list).toContain('commercialPdfCompanyFrom');
    expect(list).not.toContain('invoice-doc-theme');
    expect(list).not.toContain('quote-doc-theme');
    expect(list.split('function InvoiceHit')[1] ?? '').not.toContain('invoice-doc-theme');

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
