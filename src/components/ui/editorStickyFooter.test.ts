import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('EditorStickyFooter', () => {
  it('is Cancel | Save draft at 44px on the shared quote and invoice AppDialog shell', () => {
    const footer = src('src/components/ui/EditorStickyFooter.tsx');
    const dialog = src('src/components/ui/AppDialog.tsx');
    const quotes = src('src/pages/QuotesPage.tsx');
    const invoices = src('src/pages/InvoicesPage.tsx');
    const job = src('src/components/crm/JobFormModal.tsx');
    const clients = src('src/pages/ClientsPage.tsx');
    const css = src('src/index.css');
    const quoteEditor = quotes.split('function QuoteEditorModal')[1] ?? '';
    const invoiceEditor = invoices.split('function InvoiceEditorModal')[1] ?? '';

    expect(footer).toContain('Cancel');
    expect(footer).toContain('Save draft');
    expect(footer).toContain('data-editor-sticky-footer');
    expect(footer).toContain('data-editor-sticky-cancel');
    expect(footer).toContain('data-editor-sticky-save');
    expect(footer).not.toMatch(/Relovi|Littleloop/);

    expect(dialog).toContain('footer');
    expect(dialog).toContain('hub-editor-dialog-scroll');

    expect(quoteEditor).toContain('EditorStickyFooter');
    expect(quoteEditor).toContain("persist(form.status, { close: true })");
    expect(quoteEditor).toContain("quote || savedId ? 'Save' : 'Save draft'");
    expect(invoiceEditor).toContain('EditorStickyFooter');
    expect(invoiceEditor).toContain("persist(form.status, { close: true })");
    expect(invoiceEditor).toContain("invoice || savedId ? 'Save' : 'Save draft'");

    expect(job).not.toContain('EditorStickyFooter');
    expect(job).not.toContain('AppDialog');
    expect(clients).not.toContain('EditorStickyFooter');
    expect(clients).not.toContain('AppDialog');

    expect(css).toContain('.hub-editor-sticky-footer');
    expect(css).toContain('.hub-editor-sticky-cancel');
    expect(css).toContain('.hub-editor-sticky-save');
    expect(css).toContain('min-height: 44px');
    const saveRule = css.slice(css.indexOf('.hub-editor-sticky-save'));
    expect(saveRule).toContain('justify-content: center');
    expect(saveRule).toContain('border-radius: 12px');
    expect(saveRule).toContain('background: #0A2540');
    expect(saveRule).toContain('color: #FFFDF8');
    expect(css).toContain('--hub-editor-footer-h: 64px');
    expect(css).toContain('padding-bottom: var(--hub-editor-footer-h)');
    expect(css).toContain('body:has(.hub-editor-sticky-footer) .shell-bottom-nav');
    expect(css).toContain('.overlay-backdrop:has(.hub-editor-sticky-footer)');
    expect(css).toContain('.overlay-panel-xl.hub-quote-editor:has(.hub-editor-sticky-footer)');
    expect(css).toContain('.overlay-panel-xl.hub-invoice-editor:has(.hub-editor-sticky-footer)');
  });
});
