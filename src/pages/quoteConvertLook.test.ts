import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function convertLookCss(): string {
  const css = src('src/index.css');
  const start = css.indexOf('  .hub-quote-convert {');
  const end = css.indexOf('  .hub-quote-edit {');
  return css.slice(start, end);
}

describe('quote editor Convert LOOK — Job date + Crew on paper', () => {
  it('sits Job date, Crew, and Convert on the signed paper kit', () => {
    const quotes = src('src/pages/QuotesPage.tsx');
    const editor = quotes.split('function QuoteEditorModal')[1] ?? '';
    const css = convertLookCss();

    expect(editor).toContain('hub-quote-convert');
    expect(editor).toContain('hub-quote-convert-label');
    expect(editor).toContain('Field label="Job date"');
    expect(editor).toContain('Field label="Crew"');
    expect(editor).toContain('No crew yet');
    expect(editor).toContain('Date and crew on this tap.');
    expect(editor).toContain('CONVERT_QUOTE_NEED_DATE_CREW');
    expect(editor).toContain('hub-quote-convert-miss');
    expect(editor).toContain("next.key === 'convert_job'");
    expect(editor).toContain('Convert to job');
    expect(editor).toContain('className="btn-primary"');
    expect(editor).not.toContain('ActionButton recommended');
    expect(editor).not.toMatch(/Relovi|Littleloop|Simpro/i);
    expect(editor).not.toMatch(/\bute\b/i);

    expect(src('src/index.css')).toContain('--quote-page: #F5F0E6');
    expect(src('src/index.css')).toContain('--quote-sheet: #FFFDF8');
    expect(css).toContain('#FFFDF8');
    expect(css).toContain('#0A2540');
    expect(css).toContain('#5B6B7C');
    expect(css).toContain('#E2D9CC');
    expect(css).toContain('#2E75B6');
    expect(css).toContain("font-family: Rajdhani, sans-serif");
    expect(css).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(css).toContain('font-size: 12px');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('border-radius: 12px');
    expect(css).toContain('.hub-quote-convert .form-input');
    expect(css).toContain('background: #FFFDF8');
    expect(css).toContain('.hub-quote-convert .btn-primary');
    expect(css).toContain('background: #2E75B6');
    expect(css).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(css).not.toMatch(/gloss|lacquer|shine|glow/i);
    expect(css).not.toMatch(/\bute\b/i);

    const fieldBlock = css.slice(css.indexOf('.hub-quote-convert .form-input {'), css.indexOf('.hub-quote-convert .form-input:focus'));
    expect(fieldBlock).toContain('background: #FFFDF8');
    expect(fieldBlock).not.toContain('#2E75B6');
  });

  it('keeps the Convert gate and does not rewrite accept, portal, or job sheet', () => {
    const editor = src('src/pages/QuotesPage.tsx').split('function QuoteEditorModal')[1] ?? '';
    expect(editor).toContain('convertQuoteHasDateAndCrew');
    expect(editor).toContain('CONVERT_QUOTE_NEED_DATE_CREW');
    expect(editor.indexOf('if (!convertQuoteHasDateAndCrew')).toBeLessThan(editor.indexOf('await convertQuoteToJob'));
    expect(editor).toContain('err !== CONVERT_QUOTE_NEED_DATE_CREW');
    expect(src('src/lib/quoteJobFields.ts')).toContain("CONVERT_QUOTE_NEED_DATE_CREW = 'Set a date and crew on this tap before converting.'");
    expect(src('src/pages/ClientPortalPublicPage.tsx')).not.toContain('hub-quote-convert');
    expect(src('src/pages/JobDetailPage.tsx')).not.toContain('hub-quote-convert');
    expect(src('src/pages/MarketingPage.tsx')).not.toContain('hub-quote-convert');
    expect(src('src/lib/convertQuoteToInvoice.ts')).not.toContain('hub-quote-convert');
    expect(src('src/lib/convertQuoteToJob.ts')).not.toContain('hub-quote-convert');
  });
});

describe('quote editor Convert LOOK frames', () => {
  it('covers filled date/crew on desktop and phone, plus the empty miss', () => {
    for (const rel of [
      'docs/look/quote-convert-date-crew-desktop.png',
      'docs/look/quote-convert-date-crew-phone.png',
      'docs/look/quote-convert-empty-miss-desktop.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
