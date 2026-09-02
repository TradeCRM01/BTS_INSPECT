import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('quote / invoice Send Next look', () => {
  it('list Next Send is the one 44px primary when send can ride', () => {
    const quotes = src('src/pages/QuotesPage.tsx');
    const invoices = src('src/pages/InvoicesPage.tsx');
    const quoteNext = quotes.slice(quotes.indexOf('function QuoteNextControl'), quotes.indexOf('interface EditorState'));
    const invoiceNext = invoices.slice(invoices.indexOf('function InvoiceNextControl'), invoices.indexOf('interface EditorState'));
    const css = src('src/index.css');
    const quoteCss = css.slice(css.indexOf('/* Quote surfaces only.'), css.indexOf('/* Job list + open job sheet only.'));
    const invoiceCss = css.slice(css.indexOf('/* Invoice surfaces only:'), css.indexOf('/* Job-hub JHA/SWMS') > -1 ? css.indexOf('/* Job-hub JHA/SWMS') : css.length);

    expect(quoteNext).toContain("next.key === 'send' ? 'btn-primary' : 'hub-next'");
    expect(quoteNext).toContain('onSend(quote.id)');
    expect(invoiceNext).toContain("chasePrimary ? 'btn-primary' : 'hub-next'");
    expect(invoiceNext).toContain("next.key === 'send' ? ' is-send' : ''");
    expect(invoiceCss).toContain('.hub-invoices-row-next .hub-next.is-send');
    expect(invoiceCss).toMatch(/\.hub-invoices-row-next \.hub-next\.is-send[\s\S]*background: #2E75B6/);
    expect(invoiceCss).toMatch(/\.hub-invoices-row-next \.hub-next\.is-send[\s\S]*min-height: 44px/);
    expect(quoteCss).toContain('.hub-quotes-row-next .btn-primary');
    expect(quoteCss).toMatch(/\.hub-quotes-row-next \.btn-primary[\s\S]*background: #2E75B6/);
    expect(quoteCss).toMatch(/\.hub-quotes-row-next \.btn-primary[\s\S]*min-height: 44px/);
    expect(quoteCss).not.toMatch(/#16A34A|#15803D/);
    expect(invoiceCss).not.toMatch(/#16A34A|#15803D/);
    expect(quoteCss + invoiceCss).not.toMatch(/radial-gradient|filter:\s*drop-shadow|box-shadow:\s*0 0 \d+px/);
  });

  it('Set up email is quiet miss chrome — not a second hero or new mail page', () => {
    const invoices = src('src/pages/InvoicesPage.tsx');
    const invoiceNext = invoices.slice(invoices.indexOf('function InvoiceNextControl'), invoices.indexOf('interface EditorState'));
    const editor = invoices.slice(invoices.indexOf('function InvoiceEditorModal'));
    const css = src('src/index.css');
    const invoiceCss = css.slice(css.indexOf('/* Invoice surfaces only:'));

    expect(invoiceNext).toContain("next.key === 'setup_email'");
    expect(invoiceNext).toContain('className="hub-next"');
    expect(editor).toContain("next.key === 'setup_email'");
    expect(editor).toContain('Set up email');
    const sheetMiss = editor.slice(editor.indexOf("next.key === 'setup_email'"), editor.indexOf("next.key === 'add_email'"));
    expect(sheetMiss).toContain('className="hub-next"');
    expect(sheetMiss).not.toContain('btn-primary');
    expect(invoiceCss).toContain('.hub-invoices-row-next a.hub-next');
    expect(invoiceCss).toContain('.hub-invoice-editor .hub-next');
    expect(invoiceCss).toMatch(/\.hub-invoice-editor \.hub-next[\s\S]*color: #5B6B7C/);
    expect(invoices).not.toContain('hub-mail-settings');
    expect(invoices).not.toMatch(/Grafter|Relovi|Littleloop/);
  });

  it('does not restyle the quote or invoice document body', () => {
    const css = src('src/index.css');
    const quoteSheet = css.slice(css.indexOf('  .hub-quote-sheet {'), css.indexOf('  .hub-quote-banner {'));
    const invoiceSheet = css.slice(css.indexOf('  .hub-invoice-sheet {'), css.indexOf('  .hub-invoice-banner {'));
    expect(quoteSheet).toContain('box-shadow: none');
    expect(invoiceSheet).toContain('box-shadow: none');
    expect(src('src/lib/sendQuote.ts')).toContain('export function decideQuoteSend');
    expect(src('src/lib/sendInvoice.ts')).toContain('export function decideInvoiceSend');
  });

  it('LOOK frames cover Send Next and the honest miss', () => {
    for (const rel of [
      'docs/look/quote-send-next-desktop.png',
      'docs/look/invoice-send-next-desktop.png',
      'docs/look/send-setup-email-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel)), rel).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
