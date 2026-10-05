/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { focusQuoteConvertDate, quoteConvertEntry } from './quoteJobFields';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('quoteConvertEntry', () => {
  it('sends More and list Convert to the convert date when date or crew is missing', () => {
    expect(quoteConvertEntry({ scheduled_date: null, assigned_team: [] })).toBe('focus_convert');
    expect(quoteConvertEntry({ scheduled_date: '2026-10-05', assigned_team: [] })).toBe('focus_convert');
    expect(quoteConvertEntry({ scheduled_date: '2026-10-05', assigned_team: ['crew-1'] })).toBe('convert');

    const root = document.createElement('div');
    root.innerHTML = '<div class="hub-quote-convert"><input type="date" /></div>';
    document.body.appendChild(root);
    const date = focusQuoteConvertDate(root);
    expect(date?.type).toBe('date');
    expect(document.activeElement).toBe(date);

    const quotes = src('src/pages/QuotesPage.tsx');
    const editor = quotes.split('function QuoteEditorModal')[1] ?? '';
    const more = editor.slice(editor.indexOf('hub-quote-more-menu'), editor.indexOf('</details>'));
    const moreConvert = more.slice(more.indexOf("next.key === 'convert_job'"), more.indexOf("next.key === 'open_job'"));
    expect(moreConvert).toContain('handleConvert');
    expect(moreConvert).not.toContain('convertQuoteToJob');

    const handleConvert = editor.slice(editor.indexOf('const handleConvert'), editor.indexOf('const editorMoney'));
    expect(handleConvert).toContain("=== 'focus_convert'");
    expect(handleConvert).toContain('focusQuoteConvertDate(document)');
    expect(handleConvert.indexOf("=== 'focus_convert'")).toBeLessThan(handleConvert.indexOf('await convertQuoteToJob'));

    const listNext = quotes.slice(quotes.indexOf('function QuoteNextControl'), quotes.indexOf('interface EditorState'));
    const listConvert = listNext.slice(listNext.indexOf("next.key === 'convert_job'"), listNext.indexOf("next.key === 'invoice'"));
    expect(listConvert).toContain('quoteConvertEntry');
    expect(listConvert).toContain('onOpen({ focusConvert: true })');
    expect(listConvert.indexOf("=== 'focus_convert'")).toBeLessThan(listConvert.indexOf('await convertQuoteToJob'));

    expect(editor).toContain('focusQuoteConvertDate(document)');
    expect(editor).toContain("next.key !== 'convert_job'");
    expect(editor).toContain('id="quote-convert-date"');
  });
});
