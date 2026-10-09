/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONVERT_QUOTE_END_BEFORE_START,
  CONVERT_QUOTE_NEED_CREW,
  convertQuoteNeedMessage,
  focusQuoteConvertField,
  jobFieldsFromQuote,
  mergeQuoteConvertTimes,
  quoteConvertMissing,
} from './quoteJobFields';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('FIX-4 — quote convert times and crew truth', () => {
  it('jobFieldsFromQuote copies start and end onto the job', () => {
    const fields = jobFieldsFromQuote({
      quote_number: 3,
      client_id: 'c1',
      description: 'Patch roof — delete ok',
      scope_of_works: null,
      total: 200,
      scheduled_date: '2026-10-08',
      assigned_team: ['crew-1'],
      start_time: '07:30',
      end_time: '11:45',
    }, null);
    expect(fields.start_time).toBe('07:30');
    expect(fields.end_time).toBe('11:45');
  });

  it('surfaces crew missing with a plain message and focuses the crew picker', () => {
    expect(quoteConvertMissing({
      scheduled_date: '2026-10-08',
      assigned_team: [],
      start_time: '08:00',
      end_time: '16:00',
    })).toBe('crew');
    expect(convertQuoteNeedMessage('crew')).toBe(CONVERT_QUOTE_NEED_CREW);

    const section = document.createElement('div');
    section.className = 'hub-quote-convert';
    const crew = document.createElement('select');
    crew.id = 'quote-convert-crew';
    section.appendChild(crew);
    document.body.appendChild(section);
    const focused = focusQuoteConvertField(section, 'crew');
    expect(focused).toBe(crew);
    expect(document.activeElement).toBe(crew);
  });

  it('Quotes editor shows convert times, toast, and miss copy', () => {
    const editor = src('src/pages/QuotesPage.tsx');
    expect(editor).toContain('id="quote-convert-start"');
    expect(editor).toContain('id="quote-convert-end"');
    expect(editor).toContain('id="quote-convert-crew"');
    expect(editor).toContain('CONVERT_QUOTE_NEED_CREW');
    expect(editor).toContain('focusQuoteConvertField');
    expect(editor).toContain('showToast(CONVERT_QUOTE_JOB_SAVED)');
  });

  it('blocks end before start with a plain message and focuses End', () => {
    expect(quoteConvertMissing({
      scheduled_date: '2026-10-08',
      assigned_team: ['crew-1'],
      start_time: '10:30',
      end_time: '08:00',
    })).toBe('end_before_start');
    expect(convertQuoteNeedMessage('end_before_start')).toBe(CONVERT_QUOTE_END_BEFORE_START);

    const section = document.createElement('div');
    section.className = 'hub-quote-convert';
    const end = document.createElement('input');
    end.id = 'quote-convert-end';
    const start = document.createElement('input');
    start.id = 'quote-convert-start';
    section.append(start, end);
    document.body.append(section);
    const focused = focusQuoteConvertField(section, 'end_before_start');
    expect(focused).toBe(end);
    expect(document.activeElement).toBe(end);
  });

  it('focuses End when only end time is missing', () => {
    const section = document.createElement('div');
    section.className = 'hub-quote-convert';
    const end = document.createElement('input');
    end.id = 'quote-convert-end';
    section.appendChild(end);
    document.body.append(section);
    expect(quoteConvertMissing({
      scheduled_date: '2026-10-08',
      assigned_team: ['crew-1'],
      start_time: '09:00',
      end_time: '',
    })).toBe('end');
    focusQuoteConvertField(section, 'end');
    expect(document.activeElement).toBe(end);
  });

  it('list Convert opens the convert sheet and never invents times', () => {
    const page = src('src/pages/QuotesPage.tsx');
    const control = page.slice(
      page.indexOf('function QuoteNextControl'),
      page.indexOf('function QuoteEditorModal'),
    );
    expect(control).toContain('onOpen({ focusConvert: true })');
    expect(control).not.toMatch(/start_time:\s*['"]08:00['"]/);
    expect(control).not.toContain('convertQuoteToJob');
  });

  it('mergeQuoteConvertTimes uses live ref when form state is still on defaults', () => {
    expect(mergeQuoteConvertTimes(
      { start_time: '08:00', end_time: '16:00' },
      { start_time: '09:30' },
    )).toEqual({ start_time: '09:30', end_time: '16:00' });

    const editor = src('src/pages/QuotesPage.tsx');
    const handleConvert = editor.slice(editor.indexOf('const handleConvert'), editor.indexOf('const editorMoney'));
    expect(handleConvert).toContain('mergeQuoteConvertTimes');
    expect(handleConvert).toContain('convertTimesLive');
    const field = src('src/components/ui/TimeFieldInput.tsx');
    expect(field).not.toContain('digitBufferRef');
    expect(field).not.toContain('tryInferTimeFromDigitBuffer');
  });

  it('jobFieldsFromQuote does not invent 08:00–16:00 when quote times are absent', () => {
    const fields = jobFieldsFromQuote({
      quote_number: 9,
      client_id: null,
      description: '— delete ok',
      scope_of_works: null,
      total: 100,
      scheduled_date: '2026-10-08',
      assigned_team: ['crew-1'],
    }, null);
    expect(fields.start_time).toBeNull();
    expect(fields.end_time).toBeNull();
  });
});
