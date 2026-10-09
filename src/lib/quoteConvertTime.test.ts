/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONVERT_QUOTE_NEED_CREW,
  convertQuoteNeedMessage,
  focusQuoteConvertField,
  jobFieldsFromQuote,
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
});
