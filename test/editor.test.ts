import { describe, expect, it } from 'vitest';
import { compose, longestClearRun, signupLine, summariseRecord } from '../src/editor';
import { demoSignals } from '../src/sources/demo';
import { emptyState } from '../src/state';
import type { Signals, State } from '../src/types';

const TZ = 'Australia/Perth';
const MORNING = new Date('2026-09-10T21:30:00Z'); // 05:30 Fri 11 Sep, Perth
const EVENING = new Date('2026-09-11T10:00:00Z'); // 18:00 Fri 11 Sep, Perth
const TODAY = '2026-09-11';

function quiet(): Signals {
  return {
    calendar: { ok: true, data: [] },
    mail: { ok: true, data: [] },
    grafter: { ok: true, data: { signups: [], companiesTotal: 3, activeCompanies: 0, quotesCreated: 0, jobsCreated: 0, paying: 1, trial: 2, pastDue: 0 } },
  };
}

function section(out: ReturnType<typeof compose>, key: string) {
  return out.edition.sections.find(s => s.key === key);
}

describe('morning edition', () => {
  it('leads with the one thing and dates itself locally', () => {
    const state: State = { ...emptyState(), oneThing: { [TODAY]: 'Ship the invoice PDF' } };
    const out = compose({ kind: 'morning', now: MORNING, tz: TZ, signals: quiet(), state });
    expect(out.edition.dateKey).toBe(TODAY);
    expect(out.edition.heading).toBe('Friday 11 September');
    expect(out.edition.oneThing).toBe('Ship the invoice PDF');
  });

  it('prints the day from the calendar with the longest clear run', () => {
    const out = compose({ kind: 'morning', now: MORNING, tz: TZ, signals: demoSignals(TODAY, TZ), state: emptyState() });
    const today = section(out, 'today')!;
    expect(today.lines.map(l => l.text)).toEqual([
      'All day · Invoice run',
      '7:30am · Site walk, Bassendean',
      '2:00pm · Call: Xero sync',
      'Clear from 9:00am to 2:00pm (5h).',
    ]);
  });

  it('says so when there is nothing booked', () => {
    const out = compose({ kind: 'morning', now: MORNING, tz: TZ, signals: quiet(), state: emptyState() });
    expect(section(out, 'today')!.lines[0]!.text).toBe('Nothing booked. The day is yours.');
  });

  it('ages waiting threads from the first morning they appear', () => {
    const signals = demoSignals(TODAY, TZ);
    const seen: State = { ...emptyState(), carry: { 'mail:m1': '2026-09-06', 'mail:gone': '2026-09-01' } };
    const out = compose({ kind: 'morning', now: MORNING, tz: TZ, signals, state: seen });
    const waiting = section(out, 'waiting')!;
    expect(waiting.lines[0]).toMatchObject({ text: 'Quote for the Morley job', ageDays: 6 });
    expect(waiting.lines[1]!.ageDays).toBe(1);
    // new threads start today, resolved ones are forgotten so they restart at day 1 if they return
    expect(out.state.carry['mail:m2']).toBe(TODAY);
    expect(out.state.carry['mail:gone']).toBeUndefined();
  });

  it('caps the waiting list and counts the rest', () => {
    const signals = quiet();
    signals.mail = {
      ok: true,
      data: Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, subject: `Thread ${i}`, from: 'X', lastMessageAt: '2026-09-01T00:00:00Z', url: '' })),
    };
    const waiting = section(compose({ kind: 'morning', now: MORNING, tz: TZ, signals, state: emptyState() }), 'waiting')!;
    expect(waiting.lines).toHaveLength(7);
    expect(waiting.lines.at(-1)!.text).toBe('And 3 more waiting.');
  });

  it('writes the Grafter verdict as sentences', () => {
    const out = compose({ kind: 'morning', now: MORNING, tz: TZ, signals: demoSignals(TODAY, TZ), state: emptyState() });
    expect(section(out, 'grafter')!.lines.map(l => l.text)).toEqual([
      '1 signed up: Northside Plumbing.',
      '3 of 14 companies did something: 5 quotes, 2 jobs.',
      'Paying 4 · Trial 8',
      '1 company past due. That is a phone call.',
    ]);
  });

  it('is blunt when nobody used it and skips the past due line at zero', () => {
    const out = compose({ kind: 'morning', now: MORNING, tz: TZ, signals: quiet(), state: emptyState() });
    const lines = section(out, 'grafter')!.lines.map(l => l.text);
    expect(lines).toContain('Nobody used it. 3 companies, no quotes, no jobs.');
    expect(lines.some(l => l.includes('past due'))).toBe(false);
  });

  it('prints one line when a source fails instead of falling over', () => {
    const signals = quiet();
    signals.calendar = { ok: false, error: 'Google token refresh failed (401).' };
    const out = compose({ kind: 'morning', now: MORNING, tz: TZ, signals, state: emptyState() });
    expect(section(out, 'today')!.lines).toEqual([{ text: 'Calendar did not answer.', detail: 'Google token refresh failed (401).' }]);
  });

  it('reckons yesterday honestly', () => {
    const y = '2026-09-10';
    const done = compose({ kind: 'morning', now: MORNING, tz: TZ, signals: quiet(), state: { ...emptyState(), oneThing: { [y]: 'Call Dave' }, record: { [y]: 'done' } } });
    expect(section(done, 'reckoning')!.lines[0]).toEqual({ text: '“Call Dave”', detail: 'Done.' });
    const silent = compose({ kind: 'morning', now: MORNING, tz: TZ, signals: quiet(), state: { ...emptyState(), oneThing: { [y]: 'Call Dave' } } });
    expect(section(silent, 'reckoning')!.lines[0]!.detail).toBe('No answer.');
    const none = compose({ kind: 'morning', now: MORNING, tz: TZ, signals: quiet(), state: emptyState() });
    expect(section(none, 'reckoning')!.lines[0]!.text).toBe('Yesterday had no one thing.');
  });
});

describe('evening edition', () => {
  it('asks the one question and points at tomorrow', () => {
    const state: State = { ...emptyState(), oneThing: { [TODAY]: 'Ship the invoice PDF' } };
    const out = compose({ kind: 'evening', now: EVENING, tz: TZ, signals: quiet(), state });
    const q = section(out, 'question')!;
    expect(q.lines.map(l => l.text)).toEqual(['“Ship the invoice PDF”', 'Done', 'Not done', 'Name tomorrow’s one thing.']);
    expect(q.lines[1]!.href).toBe(`/answer?d=done&date=${TODAY}`);
    expect(q.lines[3]!.href).toBe('/one-thing?date=2026-09-12');
    expect(out.edition.sections.map(s => s.key)).not.toContain('today');
  });

  it('stops asking once answered', () => {
    const state: State = { ...emptyState(), oneThing: { [TODAY]: 'Ship it', '2026-09-12': 'Chase Dave' }, record: { [TODAY]: 'missed' } };
    const q = section(compose({ kind: 'evening', now: EVENING, tz: TZ, signals: quiet(), state }), 'question')!;
    expect(q.lines.map(l => l.text)).toEqual(['“Ship it”', 'Tomorrow: “Chase Dave”']);
    expect(q.lines[0]!.detail).toBe('Not done.');
  });
});

describe('the record', () => {
  it('counts done against answered over the window, oldest first', () => {
    const state: State = { ...emptyState(), record: { '2026-09-10': 'done', '2026-09-09': 'missed', '2026-09-01': 'done' } };
    const r = summariseRecord(state, '2026-09-10');
    expect(r).toMatchObject({ window: 14, done: 2, answered: 3 });
    expect(r.marks.at(-1)).toBe('done');
    expect(r.marks.at(-2)).toBe('missed');
    expect(r.marks.filter(m => m === 'blank')).toHaveLength(11);
  });
});

describe('helpers', () => {
  it('names up to four signups', () => {
    expect(signupLine([])).toBe('No signups.');
    expect(signupLine(['A'])).toBe('1 signed up: A.');
    expect(signupLine(['A', 'B', 'C', 'D', 'E', 'F'])).toBe('6 signed up: A, B, C, D and 2 more.');
  });

  it('finds the longest clear run inside working hours only', () => {
    // Perth is UTC+8: local hour h on 11 Sep is UTC hour h-8 on 11 Sep
    const at = (h: number) => `2026-09-11T${String(h - 8).padStart(2, '0')}:00:00Z`;
    // 09:00-10:00 and 15:00-16:00 local
    const run = longestClearRun(
      [
        { id: 'a', title: 'a', start: at(9), end: at(10), allDay: false, location: null },
        { id: 'b', title: 'b', start: at(15), end: at(16), allDay: false, location: null },
      ],
      TZ,
    );
    expect(run).toEqual({ start: 10 * 60, end: 15 * 60 });
  });
});
