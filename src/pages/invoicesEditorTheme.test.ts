import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('invoice editor cream document look', () => {
  it('paints the editor as a cream paper sheet with one 44px primary', () => {
    const invoices = src('src/pages/InvoicesPage.tsx');
    const editor = invoices.split('function InvoiceEditorModal')[1] ?? '';
    const css = src('src/index.css');

    expect(editor).toContain('hub-invoice-editor');
    expect(editor).toContain('hub-invoice-sheet');
    expect(editor).toContain('hub-invoice-letterhead');
    expect(editor).toContain('hub-invoice-kicker">To');
    expect(editor).toContain('hub-invoice-totalbar');
    expect(editor).toContain('hub-invoice-display-total');
    expect(editor).toContain('hub-invoice-more');
    expect(editor).toContain("next.key === 'send'");
    expect(editor).toContain('className="btn-primary"');
    expect(editor).toContain('Preview PDF');
    expect(editor).toContain('Edit invoice');
    expect(editor).not.toContain('ActionButton recommended');
    expect(editor).not.toContain('ops-doc-panel');
    expect(editor).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(css).toContain('.hub-invoice-sheet');
    expect(css).toContain('.hub-invoice-totalbar');
    expect(css).toContain('.hub-invoice-display-total');
    expect(css).toContain('border-radius: 16px');
    expect(css).not.toMatch(/\.hub-invoice-editor \.btn-primary[\s\S]{0,120}#111|#000\b/);
  });

  it('keeps Send and paid writes on the existing persist path', () => {
    const invoices = src('src/pages/InvoicesPage.tsx');
    const editor = invoices.split('function InvoiceEditorModal')[1] ?? '';
    expect(editor).toContain('startSend');
    expect(editor).toContain("persist('paid'");
    expect(editor).not.toContain('sendQuoteDeliver');
  });

  it('LOOK frames cover invoice editor desktop and phone only', () => {
    for (const rel of [
      'docs/look/invoice-editor-desktop.png',
      'docs/look/invoice-editor-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
