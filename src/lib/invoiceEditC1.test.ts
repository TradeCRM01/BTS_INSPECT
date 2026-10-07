import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { customerFacingLineDescription } from './customerFacingLineDescription';
import { linesFromQuoteItems } from '../reports/commercial/CommercialDocumentPdf';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('INVOICE-EDIT C1', () => {
  const editor = src('src/pages/InvoicesPage.tsx').split('function InvoiceEditorModal')[1] ?? '';

  it('uses a view-mode footer with Close and next action only (no Save when not editing)', () => {
    expect(editor).toContain('data-invoice-view-footer="1"');
    expect(editor).toContain('showSaveFooter');
    expect(editor).toContain('paidReadPath');
    expect(editor).toContain('cancelLabel="Close"');
    expect(editor).toContain('data-editor-sticky-cancel="1"');
    expect(editor).toContain('Close');
    expect(editor).toContain('hub-editor-sticky-save');
  });

  it('hides quote-only variation packages on invoices', () => {
    expect(editor).toContain('documentMode="invoice"');
    const variations = src('src/components/invoicing/DocumentVariationsEditor.tsx');
    expect(variations).toContain("documentMode?: 'quote' | 'invoice'");
    expect(variations).toContain('{!isInvoice && (');
    expect(editor).not.toContain('validity_date');
    expect(editor).not.toContain('Mark accepted');
    expect(editor).not.toContain('Decline');
  });

  it('strips price-book codes from invoice PDF lines only', () => {
    const lines = linesFromQuoteItems([
      { description: 'PB-9 — LED batten', quantity: 1, unit_price: 42 },
    ], 'invoice');
    expect(lines[0]?.description).toBe('LED batten');
    expect(customerFacingLineDescription('PB-9 — LED batten')).toBe('LED batten');
    const quoteLines = linesFromQuoteItems([
      { description: 'PB-9 — LED batten', quantity: 1, unit_price: 42 },
    ], 'quote');
    expect(quoteLines[0]?.description).toBe('PB-9 — LED batten');
  });

  it('spaces To-contact phone and email on laptop invoice sheet', () => {
    expect(editor).toContain('hub-invoice-to-contact');
    expect(editor).toContain('data-invoice-to-contact="1"');
    const css = src('src/index.css');
    expect(css).toContain('.hub-invoice-editor .hub-invoice-to-contact');
    expect(css).toContain('@media (min-width: 1280px)');
  });
});
