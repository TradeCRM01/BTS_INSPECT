import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function sheetChunk(css: string, start: string, end: string): string {
  const from = css.indexOf(start);
  const to = css.indexOf(end, from + start.length);
  return from === -1 || to === -1 ? '' : css.slice(from, to);
}

describe('quote and invoice modal totals stay reachable', () => {
  it('keeps the paper sheet from shrinking inside the scrolling editor panel', () => {
    const css = src('src/index.css');
    const quoteSheet = sheetChunk(css, '  .hub-quote-sheet {', '  .hub-quote-masthead {');
    const invoiceSheet = sheetChunk(css, '  .hub-invoice-sheet {', '  .hub-invoice-masthead {');
    const quotePanel = sheetChunk(css, '  .overlay-panel-xl.hub-quote-editor {', '  .overlay-panel-md:has(.hub-invoice-send) {');
    const invoicePanel = sheetChunk(css, '  .overlay-panel-xl.hub-invoice-editor {', '  .overlay-panel-xl.hub-quote-editor {');
    const displayTotal = css.slice(css.lastIndexOf('  .hub-quote-display-total {'), css.lastIndexOf('  .hub-quote-convert {'));

    expect(quoteSheet).toContain('flex-shrink: 0');
    expect(invoiceSheet).toContain('flex-shrink: 0');
    expect(quotePanel).toContain('overflow-y: auto');
    expect(invoicePanel).toContain('overflow-y: auto');
    expect(displayTotal).toContain('font-size: 56px');
    expect(displayTotal).toContain('line-height: 1.1');
    expect(displayTotal).not.toContain('line-height: 0.96');
    expect(css).not.toMatch(/Relovi|Littleloop/);
  });

  it('LOOK frames cover quote and invoice totals at 390 and 1280', () => {
    for (const rel of [
      'docs/look/quote-modal-totals-390.png',
      'docs/look/quote-modal-totals-1280.png',
      'docs/look/invoice-modal-totals-390.png',
      'docs/look/invoice-modal-totals-1280.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel)), rel).toBe(true);
    }
  });
});
