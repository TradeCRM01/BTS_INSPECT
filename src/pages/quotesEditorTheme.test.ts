import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('quote editor Looplet document look', () => {
  it('paints the editor as a cream paper sheet with one 44px primary', () => {
    const quotes = src('src/pages/QuotesPage.tsx');
    const editor = quotes.split('function QuoteEditorModal')[1] ?? '';
    const css = src('src/index.css');

    expect(editor).toContain('hub-quote-editor');
    expect(editor).toContain('hub-quote-sheet');
    expect(editor).toContain('hub-quote-letterhead');
    expect(editor).toContain('hub-quote-kicker">To');
    expect(editor).toContain('hub-quote-totalbar');
    expect(editor).toContain('hub-quote-more');
    expect(editor).toContain("next.key === 'send'");
    expect(editor).toContain('className="btn-primary"');
    expect(editor).toContain('Mark accepted');
    expect(editor).toContain('Preview PDF');
    expect(editor).toContain('Edit quote');
    expect(editor).not.toContain('ActionButton recommended');
    expect(editor).not.toContain('ops-doc-panel');
    expect(editor).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(css).toContain('.hub-quote-sheet');
    expect(css).toContain('.hub-quote-totalbar');
    expect(css).toContain('border-radius: 16px');
    expect(css).toContain('.hub-quote-display-total');
    expect(css).not.toMatch(/\.hub-quote-editor \.btn-primary[\s\S]{0,120}#111|#000\b/);
  });

  it('keeps Send and Accept writes on the existing persist path', () => {
    const quotes = src('src/pages/QuotesPage.tsx');
    const editor = quotes.split('function QuoteEditorModal')[1] ?? '';
    expect(editor).toContain('startSend');
    expect(editor).toContain("persist('draft'");
    expect(editor).toContain("persist('accepted'");
    expect(editor).not.toContain('sendQuoteDeliver');
    expect(editor).not.toContain('Quote marked as sent');
  });

  it('LOOK frames cover quote editor desktop and phone only', () => {
    for (const rel of [
      'docs/look/quote-editor-desktop.png',
      'docs/look/quote-editor-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
