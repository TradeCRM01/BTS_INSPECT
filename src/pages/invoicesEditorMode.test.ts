import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function invoiceEditorModalSource(): string {
  return src('src/pages/InvoicesPage.tsx').split('function InvoiceEditorModal')[1] ?? '';
}

function quoteEditorModalSource(): string {
  return src('src/pages/QuotesPage.tsx').split('function QuoteEditorModal')[1] ?? '';
}

describe('invoice editor initial mode', () => {
  it('opens a new invoice in edit mode and an existing invoice in view mode', () => {
    const editor = invoiceEditorModalSource();
    expect(editor).toContain('const [showEdit, setShowEdit] = useState(!invoice);');
    expect(editor).toContain('{showEdit ? (');
    expect(editor).toContain('hub-invoice-edit');
  });

  it('matches the quote editor pattern for new vs existing', () => {
    const invoiceEditor = invoiceEditorModalSource();
    const quoteEditor = quoteEditorModalSource();
    expect(invoiceEditor).toContain('useState(!invoice)');
    expect(quoteEditor).toContain('useState(!quote)');
  });

  it('lands in view mode after the first save draft', () => {
    const editor = invoiceEditorModalSource();
    const insertBlock = editor.split(".from('invoices').insert")[1] ?? '';
    expect(insertBlock).toContain('setSavedId(data.id as string)');
    expect(insertBlock).toContain('setShowEdit(false)');
    expect(insertBlock).toContain('onSaved({ close: false');
  });
});
