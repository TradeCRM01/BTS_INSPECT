/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { afterDialogInitialFocus } from './dialogFocus';
import {
  CONVERT_QUOTE_BLOCKED,
  focusQuoteConvertDate,
  quoteConvertEntry,
  quoteConvertTap,
  quoteConvertTapShowsBusy,
  releaseQuoteConvertLock,
  takeQuoteConvertLock,
} from './quoteJobFields';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function flushAfterDialogInitialFocus(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTimeout(resolve, 0);
      });
    });
  });
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('quoteConvertEntry', () => {
  it('sends More and list Convert to the convert date when date or crew is missing', () => {
    expect(quoteConvertEntry({ scheduled_date: null, assigned_team: [] })).toBe('focus_convert');
    expect(quoteConvertEntry({ scheduled_date: '2026-10-05', assigned_team: [] })).toBe('focus_convert');
    expect(quoteConvertEntry({ scheduled_date: '2026-10-05', assigned_team: ['crew-1'] })).toBe('convert');

    const quotes = src('src/pages/QuotesPage.tsx');
    const editor = quotes.split('function QuoteEditorModal')[1] ?? '';
    const more = editor.slice(editor.indexOf('hub-quote-more-menu'), editor.indexOf('</details>'));
    const moreConvert = more.slice(more.indexOf("next.key === 'convert_job'"), more.indexOf("next.key === 'open_job'"));
    expect(moreConvert).toContain('handleConvert');
    expect(moreConvert).not.toContain('convertQuoteToJob');

    const handleConvert = editor.slice(editor.indexOf('const handleConvert'), editor.indexOf('const editorMoney'));
    expect(handleConvert).toContain("=== 'focus_convert'");
    expect(handleConvert).toContain('focusQuoteConvertDate');
    expect(handleConvert.indexOf("=== 'focus_convert'")).toBeLessThan(handleConvert.indexOf('await convertQuoteToJob'));
    expect(handleConvert).toContain('takeQuoteConvertLock');
    expect(editor).toContain('onPointerDown');

    const listNext = quotes.slice(quotes.indexOf('function QuoteNextControl'), quotes.indexOf('interface EditorState'));
    const listConvert = listNext.slice(listNext.indexOf("next.key === 'convert_job'"), listNext.indexOf("next.key === 'invoice'"));
    expect(listConvert).toContain('quoteConvertTap');
    expect(listConvert).toContain('onOpen({ focusConvert: true })');
    expect(listConvert.indexOf("=== 'focus_convert'")).toBeLessThan(listConvert.indexOf('await convertQuoteToJob'));
    expect(listNext).toContain('takeQuoteConvertLock');
    expect(listNext).toContain('onPointerDown');

    expect(editor).toContain('afterDialogInitialFocus');
    expect(editor).toContain('convertSectionRef');
    expect(editor).toContain('onFocusedConvert');
    expect(editor).toContain('startConvertFocus()');
    expect(editor).toContain('id="quote-convert-date"');
  });

  it('opens from the list with focusConvert and leaves Job date focused after the dialog steal', async () => {
    const panel = document.createElement('div');
    panel.className = 'overlay-panel-xl hub-quote-editor';
    panel.setAttribute('role', 'dialog');
    const more = document.createElement('button');
    more.setAttribute('aria-label', 'More actions');
    more.textContent = 'More';
    const section = document.createElement('div');
    section.className = 'hub-quote-convert';
    const date = document.createElement('input');
    date.type = 'date';
    date.id = 'quote-convert-date';
    section.appendChild(date);
    panel.appendChild(more);
    panel.appendChild(section);
    document.body.appendChild(panel);

    const scrolled: number[] = [];
    panel.scrollTo = ((opts?: ScrollToOptions | number) => {
      scrolled.push(typeof opts === 'number' ? opts : Number(opts?.top ?? 0));
    }) as typeof panel.scrollTo;

    more.focus();
    expect(document.activeElement).toBe(more);

    const steal = () => { more.focus(); };
    steal();
    requestAnimationFrame(() => {
      requestAnimationFrame(steal);
    });
    setTimeout(steal, 0);

    afterDialogInitialFocus(() => {
      const next = focusQuoteConvertDate(panel);
      return next === document.activeElement;
    });

    await flushAfterDialogInitialFocus();

    expect(document.activeElement).toBe(date);
    expect(document.activeElement?.id).toBe('quote-convert-date');
    expect(scrolled.length).toBeGreaterThan(0);
  });

  it('lets the first Convert tap start and drops the second so only one job starts', () => {
    const lock = { current: false };
    let started = 0;
    const tap = () => {
      if (!takeQuoteConvertLock(lock)) return;
      started += 1;
    };
    tap();
    tap();
    tap();
    expect(started).toBe(1);
    releaseQuoteConvertLock(lock);
    tap();
    expect(started).toBe(2);
  });

  it('never drops a convert-intent tap without a busy state', () => {
    const ready = {
      id: 'q-0006',
      status: 'accepted' as const,
      profileId: 'p1',
      scheduled_date: '2026-10-05',
      assigned_team: ['crew-1'],
    };
    const convert = quoteConvertTap(ready);
    expect(convert).toEqual({ action: 'convert' });
    expect(quoteConvertTapShowsBusy(convert)).toBe(true);

    const noProfile = quoteConvertTap({ ...ready, profileId: null });
    expect(noProfile).toEqual({ action: 'blocked', message: CONVERT_QUOTE_BLOCKED });
    expect(quoteConvertTapShowsBusy(noProfile)).toBe(true);

    const noId = quoteConvertTap({ ...ready, id: null });
    expect(quoteConvertTapShowsBusy(noId)).toBe(true);

    const miss = quoteConvertTap({ ...ready, scheduled_date: null, assigned_team: [] });
    expect(miss).toEqual({ action: 'focus_convert' });
    expect(quoteConvertTapShowsBusy(miss)).toBe(false);

    const editor = src('src/pages/QuotesPage.tsx').split('function QuoteEditorModal')[1] ?? '';
    const handleConvert = editor.slice(editor.indexOf('const handleConvert'), editor.indexOf('const editorMoney'));
    expect(handleConvert).toContain('quoteConvertTap');
    expect(handleConvert).toContain('setConverting(true)');
    expect(handleConvert.indexOf('setConverting(true)')).toBeLessThan(handleConvert.indexOf('await convertQuoteToJob'));
    expect(handleConvert.indexOf('tap.action === \'blocked\'')).toBeLessThan(handleConvert.indexOf('await convertQuoteToJob'));
    expect(handleConvert).toContain('setConverting(true)');
  });
});
