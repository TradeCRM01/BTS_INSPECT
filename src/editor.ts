import {
  clock,
  clockFromMinutes,
  dateKey,
  daysBetween,
  durationLabel,
  headingDate,
  minutesOfDay,
  shiftKey,
} from './time';
import type {
  CalendarEvent,
  DateKey,
  Edition,
  EditionKind,
  GrafterYesterday,
  Line,
  RecordSummary,
  Section,
  Signals,
  SourceResult,
  State,
  WaitingThread,
} from './types';

export type ComposeInput = {
  kind: EditionKind;
  now: Date;
  tz: string;
  signals: Signals;
  state: State;
};

export type ComposeOutput = { edition: Edition; state: State };

const RECORD_WINDOW = 14;
const WAITING_CAP = 6;
const WORK_START = 8 * 60;
const WORK_END = 17 * 60;
const CLEAR_RUN_MIN = 90;

/**
 * The editor. Pure: same signals and state in, same paper out.
 * Sections with nothing to say do not print. A source that failed says so in one line.
 */
export function compose(input: ComposeInput): ComposeOutput {
  const { kind, now, tz, signals } = input;
  const today = dateKey(now, tz);
  const yesterday = shiftKey(today, -1);
  const tomorrow = shiftKey(today, 1);

  const state = ageWaiting(input.state, signals.mail, today);
  const sections: Section[] = [];

  if (kind === 'morning') {
    sections.push(todaySection(signals.calendar, tz));
    sections.push(waitingSection(signals.mail, state, today));
    sections.push(grafterSection(signals.grafter));
    sections.push(reckoningSection(state, yesterday));
  } else {
    sections.push(questionSection(state, today, tomorrow));
    sections.push(waitingSection(signals.mail, state, today));
  }

  const recordEnd = kind === 'morning' ? yesterday : today;

  return {
    state,
    edition: {
      kind,
      dateKey: today,
      heading: headingDate(today, tz),
      oneThing: state.oneThing[today] ?? null,
      sections: sections.filter(s => s.lines.length > 0),
      record: summariseRecord(state, recordEnd),
    },
  };
}

function ageWaiting(state: State, mail: SourceResult<WaitingThread[]>, today: DateKey): State {
  if (!mail.ok) return state;
  const live = new Set(mail.data.map(t => `mail:${t.id}`));
  const carry: Record<string, DateKey> = {};
  for (const [id, seen] of Object.entries(state.carry)) {
    if (!id.startsWith('mail:') || live.has(id)) carry[id] = seen;
  }
  for (const id of live) carry[id] ??= today;
  return { ...state, carry };
}

function todaySection(calendar: SourceResult<CalendarEvent[]>, tz: string): Section {
  const section: Section = { key: 'today', title: 'Today', lines: [] };
  if (!calendar.ok) {
    section.lines.push({ text: 'Calendar did not answer.', detail: calendar.error });
    return section;
  }
  const events = [...calendar.data].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
    return a.start.localeCompare(b.start);
  });
  if (events.length === 0) {
    section.lines.push({ text: 'Nothing booked. The day is yours.' });
    return section;
  }
  for (const ev of events) {
    const when = ev.allDay ? 'All day' : clock(ev.start, tz);
    section.lines.push({
      text: `${when} · ${ev.title}`,
      detail: ev.location ?? undefined,
    });
  }
  const clear = longestClearRun(events.filter(e => !e.allDay), tz);
  if (clear) {
    section.lines.push({
      text: `Clear from ${clockFromMinutes(clear.start)} to ${clockFromMinutes(clear.end)} (${durationLabel(clear.end - clear.start)}).`,
    });
  }
  return section;
}

export function longestClearRun(
  timed: CalendarEvent[],
  tz: string,
): { start: number; end: number } | null {
  if (timed.length === 0) return null;
  const busy = timed
    .map(e => ({
      start: Math.max(WORK_START, minutesOfDay(e.start, tz)),
      end: Math.min(WORK_END, e.end ? minutesOfDay(e.end, tz) : minutesOfDay(e.start, tz) + 60),
    }))
    .filter(b => b.end > b.start)
    .sort((a, b) => a.start - b.start);
  let cursor = WORK_START;
  let best: { start: number; end: number } | null = null;
  const consider = (start: number, end: number) => {
    if (end - start >= CLEAR_RUN_MIN && (!best || end - start > best.end - best.start)) best = { start, end };
  };
  for (const b of busy) {
    consider(cursor, b.start);
    cursor = Math.max(cursor, b.end);
  }
  consider(cursor, WORK_END);
  return best;
}

function waitingSection(mail: SourceResult<WaitingThread[]>, state: State, today: DateKey): Section {
  const section: Section = { key: 'waiting', title: 'Waiting on you', lines: [] };
  if (!mail.ok) {
    section.lines.push({ text: 'Inbox did not answer.', detail: mail.error });
    return section;
  }
  if (mail.data.length === 0) {
    section.lines.push({ text: 'Nobody is waiting on you.' });
    return section;
  }
  const aged = mail.data
    .map(t => ({ t, age: daysBetween(state.carry[`mail:${t.id}`] ?? today, today) + 1 }))
    .sort((a, b) => b.age - a.age || a.t.lastMessageAt.localeCompare(b.t.lastMessageAt));
  for (const { t, age } of aged.slice(0, WAITING_CAP)) {
    section.lines.push({ text: t.subject || '(no subject)', detail: t.from, ageDays: age, href: t.url });
  }
  const rest = aged.length - WAITING_CAP;
  if (rest > 0) section.lines.push({ text: `And ${rest} more waiting.` });
  return section;
}

function grafterSection(grafter: SourceResult<GrafterYesterday>): Section {
  const section: Section = { key: 'grafter', title: 'Grafter, yesterday', lines: [] };
  if (!grafter.ok) {
    section.lines.push({ text: 'Grafter did not answer.', detail: grafter.error });
    return section;
  }
  const g = grafter.data;
  section.lines.push({ text: signupLine(g.signups) });
  if (g.activeCompanies > 0) {
    section.lines.push({
      text: `${g.activeCompanies} of ${g.companiesTotal} companies did something: ${plural(g.quotesCreated, 'quote')}, ${plural(g.jobsCreated, 'job')}.`,
    });
  } else {
    section.lines.push({ text: `Nobody used it. ${g.companiesTotal} companies, no quotes, no jobs.` });
  }
  section.lines.push({ text: `Paying ${g.paying} · Trial ${g.trial}` });
  if (g.pastDue > 0) {
    section.lines.push({ text: `${plural(g.pastDue, 'company', 'companies')} past due. That is a phone call.` });
  }
  return section;
}

export function signupLine(names: string[]): string {
  if (names.length === 0) return 'No signups.';
  const shown = names.slice(0, 4).join(', ');
  const more = names.length > 4 ? ` and ${names.length - 4} more` : '';
  return `${names.length} signed up: ${shown}${more}.`;
}

function reckoningSection(state: State, yesterday: DateKey): Section {
  const section: Section = { key: 'reckoning', title: 'Yesterday', lines: [] };
  const thing = state.oneThing[yesterday];
  if (!thing) {
    section.lines.push({ text: 'Yesterday had no one thing.' });
    return section;
  }
  const verdict = state.record[yesterday];
  const suffix = verdict === 'done' ? 'Done.' : verdict === 'missed' ? 'Not done.' : 'No answer.';
  section.lines.push({ text: `“${thing}”`, detail: suffix });
  return section;
}

function questionSection(state: State, today: DateKey, tomorrow: DateKey): Section {
  const section: Section = { key: 'question', title: 'Tonight', lines: [] };
  const thing = state.oneThing[today];
  const verdict = state.record[today];
  if (!thing) {
    section.lines.push({ text: 'Nothing was named for today.' });
  } else if (verdict) {
    section.lines.push({ text: `“${thing}”`, detail: verdict === 'done' ? 'Done.' : 'Not done.' });
  } else {
    section.lines.push({ text: `“${thing}”`, detail: 'Did it get done?' });
    section.lines.push({ text: 'Done', href: `/answer?d=done&date=${today}` });
    section.lines.push({ text: 'Not done', href: `/answer?d=missed&date=${today}` });
  }
  const next = state.oneThing[tomorrow];
  section.lines.push(
    next
      ? { text: `Tomorrow: “${next}”`, href: `/one-thing?date=${tomorrow}` }
      : { text: 'Name tomorrow’s one thing.', href: `/one-thing?date=${tomorrow}` },
  );
  return section;
}

export function summariseRecord(state: State, endKey: DateKey, window = RECORD_WINDOW): RecordSummary {
  const marks: RecordSummary['marks'] = [];
  let done = 0;
  let answered = 0;
  for (let i = window - 1; i >= 0; i--) {
    const key = shiftKey(endKey, -i);
    const r = state.record[key];
    if (r === 'done') {
      done++;
      answered++;
      marks.push('done');
    } else if (r === 'missed') {
      answered++;
      marks.push('missed');
    } else {
      marks.push('blank');
    }
  }
  return { window, done, answered, marks };
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function lineAge(line: Line): string {
  return line.ageDays ? `Day ${line.ageDays}` : '';
}
