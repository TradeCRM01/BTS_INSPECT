import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('P-301 phone line editor', () => {
  it('labels every phone field and puts Description first', () => {
    const editor = src('src/components/invoicing/LineItemEditor.tsx');
    const css = src('src/index.css');

    expect(editor).toContain('hub-line-editor-lab">Description');
    expect(editor).toContain('hub-line-editor-lab">Qty');
    expect(editor).toContain('hub-line-editor-lab">Unit price');
    expect(editor).toContain('hub-line-editor-lab">Unit cost');
    expect(editor).toContain('hub-line-editor-lab">Markup %');
    expect(editor).toContain('hub-line-editor-lab">Line total');
    expect(editor).toContain('hub-line-editor-lab">Cost code');
    expect(editor).toContain('hub-line-editor-lab">Nature');
    expect(editor).toContain('checkPriceAfterUnitPrice');
    expect(editor).toContain('hub-quote-check-price');

    expect(css).toContain('"desc desc"');
    expect(css).toContain('"qty price"');
    expect(css).toContain('"ucost markup"');
    expect(css).toContain('"total del"');
    expect(css).toContain('"cost cost"');
    expect(css).toContain('"nature nature"');
    expect(css).toContain('.hub-line-editor-lab {\n      display: none;');
    expect(css).toContain('min-width: 44px');
    expect(css).toContain('@container line-editor (min-width: 560px)');
    expect(css).toContain('"desc desc desc desc desc desc desc desc"');
  });
});
