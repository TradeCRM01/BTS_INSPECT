import { addDays, format } from 'date-fns';

/** Caller-supplied rows. Parser never hits the network. */
export type QuickBookNamed = {
  id: string;
  name: string;
};

export type QuickBookJob = {
  id: string;
  title?: string | null;
  client_name?: string | null;
  job_number?: number | null;
};

export type NamedMatchKind = 'none' | 'one' | 'many';

export type NamedMatch<T> = {
  token: string;
  kind: NamedMatchKind;
  items: T[];
};

export type QuickBookParse = {
  raw: string;
  subjectToken: string | null;
  crewToken: string | null;
  date: string | null;
  startTime: string | null;
};

export type QuickBookHints = {
  job: string | null;
  client: string | null;
  crew: string | null;
};

export type QuickBookResolved<
  TJob extends QuickBookJob = QuickBookJob,
  TCrew extends QuickBookNamed = QuickBookNamed,
  TClient extends QuickBookNamed = QuickBookNamed,
> = {
  parse: QuickBookParse;
  jobs: NamedMatch<TJob>;
  clients: NamedMatch<TClient>;
  crew: NamedMatch<TCrew>;
  prefill: {
    date: string | null;
    startTime: string | null;
    crewId: string | null;
  };
  hints: QuickBookHints;
};

export type QuickBookSpeech = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((ev?: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
};

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

const WEEKDAY_RE = /\b(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat)\b/i;
const TIME_MERIDIEM_RE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i;
const TIME_CLOCK_RE = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;
const WITH_CREW_RE = /\bwith\s+(.+)$/i;
const FILLER_WORD = /^(the|a|an|on|at|for|to|job|jobs|book|booking|schedule|this|next|please)$/i;

export function normalizeQuickBookPhrase(value: string): string {
  return value
    .replace(/a\.m\.?/gi, 'am')
    .replace(/p\.m\.?/gi, 'pm')
    .replace(/['’]clock/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseQuickBookTime(raw: string): string | null {
  const phrase = normalizeQuickBookPhrase(raw);
  const mer = phrase.match(TIME_MERIDIEM_RE);
  if (mer) {
    let hour = Number(mer[1]);
    const minute = mer[2] ?? '00';
    if (!Number.isFinite(hour) || hour < 1 || hour > 12 || Number(minute) > 59) return null;
    const pm = mer[3].toLowerCase() === 'pm';
    if (pm && hour < 12) hour += 12;
    if (!pm && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${minute}`;
  }
  const clock = phrase.match(TIME_CLOCK_RE);
  if (!clock) return null;
  return `${clock[1].padStart(2, '0')}:${clock[2]}`;
}

export function parseQuickBookDate(raw: string, now: Date = new Date()): string | null {
  const phrase = normalizeQuickBookPhrase(raw).toLowerCase();
  if (/\btoday\b/.test(phrase)) return format(now, 'yyyy-MM-dd');
  if (/\btomorrow\b/.test(phrase)) return format(addDays(now, 1), 'yyyy-MM-dd');
  const weekday = phrase.match(WEEKDAY_RE);
  if (!weekday) return null;
  const dow = WEEKDAY_INDEX[weekday[1].toLowerCase()];
  if (dow == null) return null;
  const delta = (dow - now.getDay() + 7) % 7;
  return format(addDays(now, delta), 'yyyy-MM-dd');
}

function leftoverSubject(rest: string): string | null {
  const token = rest
    .split(/\s+/)
    .filter(word => word && !FILLER_WORD.test(word))
    .join(' ')
    .trim();
  return token || null;
}

export function parseQuickBook(phrase: string, now: Date = new Date()): QuickBookParse {
  const raw = phrase.trim();
  let work = normalizeQuickBookPhrase(raw);
  let crewToken: string | null = null;
  const withCrew = work.match(WITH_CREW_RE);
  if (withCrew) {
    crewToken = leftoverSubject(withCrew[1]);
    work = work.slice(0, withCrew.index).trim();
  }

  const startTime = parseQuickBookTime(work);
  if (startTime) {
    work = work.replace(TIME_MERIDIEM_RE, ' ').replace(TIME_CLOCK_RE, ' ');
    work = work.replace(/\s+/g, ' ').trim();
  }

  const date = parseQuickBookDate(work, now);
  if (date) {
    work = work
      .replace(/\b(today|tomorrow)\b/gi, ' ')
      .replace(WEEKDAY_RE, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  return {
    raw,
    subjectToken: leftoverSubject(work),
    crewToken,
    date,
    startTime,
  };
}

export function normalizeMatchToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function namedTokenMatches(name: string | null | undefined, token: string): boolean {
  const hay = normalizeMatchToken(name ?? '');
  const needle = normalizeMatchToken(token);
  if (!hay || needle.length < 2) return false;
  if (hay === needle) return true;
  const words = hay.split(' ');
  if (words.some(word => word === needle)) return true;
  if (needle.length >= 3 && words.some(word => word.startsWith(needle))) return true;
  if (needle.length >= 3 && hay.includes(needle)) return true;
  return false;
}

export function matchNamed<T extends QuickBookNamed>(
  token: string | null | undefined,
  items: T[],
): NamedMatch<T> {
  const trimmed = (token ?? '').trim();
  if (!trimmed) return { token: '', kind: 'none', items: [] };
  const hits = items.filter(item => namedTokenMatches(item.name, trimmed));
  if (hits.length === 1) return { token: trimmed, kind: 'one', items: hits };
  if (hits.length > 1) return { token: trimmed, kind: 'many', items: hits };
  return { token: trimmed, kind: 'none', items: [] };
}

export function matchQuickBookJobs<T extends QuickBookJob>(
  token: string | null | undefined,
  jobs: T[],
): NamedMatch<T> {
  const trimmed = (token ?? '').trim();
  if (!trimmed) return { token: '', kind: 'none', items: [] };
  const hits = jobs.filter(job => {
    const number = job.job_number != null ? String(job.job_number) : '';
    const padded = number ? number.padStart(4, '0') : '';
    return namedTokenMatches(job.title, trimmed)
      || namedTokenMatches(job.client_name, trimmed)
      || (number && (number === trimmed || padded === trimmed || `#${padded}` === trimmed));
  });
  if (hits.length === 1) return { token: trimmed, kind: 'one', items: hits };
  if (hits.length > 1) return { token: trimmed, kind: 'many', items: hits };
  return { token: trimmed, kind: 'none', items: [] };
}

export function unmatchedHint(
  kind: 'job' | 'client' | 'crew',
  token: string,
): string {
  return `Couldn't match ${kind} “${token}”. Pick one below.`;
}

export function manyHint(kind: 'job' | 'client' | 'crew', token: string): string {
  return `A few ${kind === 'crew' ? 'crew' : `${kind}s`} match “${token}”. Pick one.`;
}

export function resolveQuickBook<
  TJob extends QuickBookJob,
  TCrew extends QuickBookNamed,
  TClient extends QuickBookNamed,
>(
  phrase: string,
  lists: {
    jobs: TJob[];
    crew: TCrew[];
    clients?: TClient[];
  },
  now: Date = new Date(),
): QuickBookResolved<TJob, TCrew, TClient> {
  const parsed = parseQuickBook(phrase, now);
  const jobs = matchQuickBookJobs(parsed.subjectToken, lists.jobs);
  const clients = matchNamed(parsed.subjectToken, lists.clients ?? []);
  const crew = matchNamed(parsed.crewToken, lists.crew);
  return {
    parse: parsed,
    jobs,
    clients,
    crew,
    prefill: {
      date: parsed.date,
      startTime: parsed.startTime,
      crewId: crew.kind === 'one' ? crew.items[0].id : null,
    },
    hints: {
      job: parsed.subjectToken
        ? jobs.kind === 'none'
          ? unmatchedHint('job', parsed.subjectToken)
          : jobs.kind === 'many'
            ? manyHint('job', parsed.subjectToken)
            : null
        : null,
      client: parsed.subjectToken && clients.token && jobs.kind === 'none' && clients.kind === 'none'
        ? unmatchedHint('client', parsed.subjectToken)
        : clients.kind === 'many'
          ? manyHint('client', parsed.subjectToken ?? clients.token)
          : null,
      crew: parsed.crewToken
        ? crew.kind === 'none'
          ? unmatchedHint('crew', parsed.crewToken)
          : crew.kind === 'many'
            ? manyHint('crew', parsed.crewToken)
            : null
        : null,
    },
  };
}

export function speechRecognitionCtor(global: {
  SpeechRecognition?: new () => QuickBookSpeech;
  webkitSpeechRecognition?: new () => QuickBookSpeech;
}): (new () => QuickBookSpeech) | null {
  return global.SpeechRecognition ?? global.webkitSpeechRecognition ?? null;
}

export function browserSpeechRecognition(): (new () => QuickBookSpeech) | null {
  if (typeof window === 'undefined') return null;
  return speechRecognitionCtor(window as typeof window & {
    SpeechRecognition?: new () => QuickBookSpeech;
    webkitSpeechRecognition?: new () => QuickBookSpeech;
  });
}

export function transcriptFromSpeechEvent(
  ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> },
): string {
  const last = ev.results[ev.results.length - 1];
  return (last?.[0]?.transcript ?? '').trim();
}

export function isSpeechPermissionDenied(error: string | undefined): boolean {
  return error === 'not-allowed' || error === 'service-not-allowed';
}
