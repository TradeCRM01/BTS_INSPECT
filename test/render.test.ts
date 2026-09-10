import { describe, expect, it } from 'vitest';
import { compose } from '../src/editor';
import { renderHtml, renderText, resolveHref, subject } from '../src/render';
import { demoSignals } from '../src/sources/demo';
import { emptyState } from '../src/state';

const TZ = 'Australia/Perth';
const MORNING = new Date('2026-09-10T21:30:00Z');
const EVENING = new Date('2026-09-11T10:00:00Z');
const TODAY = '2026-09-11';
const links = { baseUrl: 'https://paper.example.com', token: 'secret' };

describe('render', () => {
  it('resolves in-paper links with the token and leaves the web alone', () => {
    expect(resolveHref('/answer?d=done&date=2026-09-11', links)).toBe('https://paper.example.com/answer?d=done&date=2026-09-11&t=secret');
    expect(resolveHref('https://mail.google.com/x', links)).toBe('https://mail.google.com/x');
  });

  it('writes a subject a person would open', () => {
    const state = { ...emptyState(), oneThing: { [TODAY]: 'Ship the invoice PDF' } };
    const m = compose({ kind: 'morning', now: MORNING, tz: TZ, signals: demoSignals(TODAY, TZ), state }).edition;
    expect(subject(m)).toBe('Friday 11 September — One thing: Ship the invoice PDF');
    const e = compose({ kind: 'evening', now: EVENING, tz: TZ, signals: demoSignals(TODAY, TZ), state }).edition;
    expect(subject(e)).toBe('Friday 11 September — Did it get done?');
  });

  it('renders the plain text edition in newspaper order', () => {
    const state = { ...emptyState(), oneThing: { [TODAY]: 'Ship the invoice PDF' }, carry: { 'mail:m1': '2026-09-06' } };
    const text = renderText(compose({ kind: 'morning', now: MORNING, tz: TZ, signals: demoSignals(TODAY, TZ), state }).edition, links);
    const order = ['THE MORNING PAPER', 'ONE THING: Ship the invoice PDF', 'TODAY', 'WAITING ON YOU', '[Day 6] Quote for the Morley job — Dave Turner', 'GRAFTER, YESTERDAY', 'YESTERDAY', 'THE RECORD'];
    let cursor = -1;
    for (const needle of order) {
      const idx = text.indexOf(needle);
      expect(idx, needle).toBeGreaterThan(cursor);
      cursor = idx;
    }
  });

  it('renders the evening buttons and escapes what people type', () => {
    const state = { ...emptyState(), oneThing: { [TODAY]: 'Fix <script>alert(1)</script> & ship' } };
    const html = renderHtml(compose({ kind: 'evening', now: EVENING, tz: TZ, signals: demoSignals(TODAY, TZ), state }).edition, links);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('class="btn" href="https://paper.example.com/answer?d=done&amp;date=2026-09-11&amp;t=secret"');
    expect(html).toContain('class="btn quiet"');
  });
});
