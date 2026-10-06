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
  crewTokens: string[];
  date: string | null;
  startTime: string | null;
};

export type QuickBookHints = {
  job: string | null;
  client: string | null;
  crew: string | null;
};

export type SpokenSheetFields = {
  date?: string;
  startTime?: string;
  crewId?: string;
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
  prefill: SpokenSheetFields;
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

export const QUICK_BOOK_TZ = 'Australia/Brisbane';

export type BrisbaneClock = {
  date: string;
  weekday: number;
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  minutes: number;
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

const WEEKDAY_NAMES = [
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
];

const WEEKDAY_TYPOS: Record<string, string> = {
  thurday: 'thursday',
  thursay: 'thursday',
  wensday: 'wednesday',
  wedensday: 'wednesday',
  tuseday: 'tuesday',
  tusday: 'tuesday',
  fridat: 'friday',
  mondy: 'monday',
  saterday: 'saturday',
  satuday: 'saturday',
};

const WEEKDAY_ALT = 'sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat';
const WEEKDAY_RE = new RegExp(`\\b(${WEEKDAY_ALT})\\b`, 'i');
const NEXT_WEEKDAY_RE = new RegExp(`\\bnext\\s+(${WEEKDAY_ALT})\\b`, 'i');
const THIS_WEEKDAY_RE = new RegExp(`\\bthis\\s+(${WEEKDAY_ALT})\\b`, 'i');
const MONTH_DAY_RE = /\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/i;
const FILLER_WORD = /^(the|a|an|on|at|for|to|job|jobs|book|booking|schedule|this|please)$/i;

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

const NUMBER_WORD_ALT = Object.keys(NUMBER_WORDS).join('|');

export function instantInBrisbane(
  year: number,
  month: number,
  day: number,
  hour = 12,
  minute = 0,
): Date {
  return new Date(Date.UTC(year, month - 1, day, hour - 10, minute, 0));
}

export function brisbaneNow(now: Date = new Date()): BrisbaneClock {
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: QUICK_BOOK_TZ,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const read = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  const weekdayName = read('weekday').slice(0, 3);
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekdayName);
  const year = Number(read('year'));
  const month = Number(read('month'));
  const day = Number(read('day'));
  const hour = Number(read('hour'));
  const minute = Number(read('minute'));
  return {
    date: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    weekday: weekday < 0 ? 0 : weekday,
    year,
    month,
    day,
    hour,
    minute,
    minutes: hour * 60 + minute,
  };
}

export function addBrisbaneDays(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 1) return 2;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) grid[i][0] = i;
  for (let j = 0; j < cols; j += 1) grid[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      grid[i][j] = Math.min(
        grid[i - 1][j] + 1,
        grid[i][j - 1] + 1,
        grid[i - 1][j - 1] + cost,
      );
    }
  }
  return grid[a.length][b.length];
}

function repairWeekdays(phrase: string): string {
  return phrase.replace(/\b[a-z]{3,9}\b/gi, word => {
    const key = word.toLowerCase();
    if (WEEKDAY_INDEX[key] != null) return word;
    if (WEEKDAY_TYPOS[key]) return WEEKDAY_TYPOS[key];
    for (const name of WEEKDAY_NAMES) {
      if (editDistance(key, name) === 1) return name;
    }
    return word;
  });
}

export function normalizeQuickBookPhrase(value: string): string {
  return repairWeekdays(
    value
      .replace(/a\.m\.?/gi, 'am')
      .replace(/p\.m\.?/gi, 'pm')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

function hourFromWordOrNumber(raw: string): number | null {
  const key = raw.toLowerCase();
  if (key in NUMBER_WORDS) return NUMBER_WORDS[key];
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 23) return null;
  return n;
}

function formatHm(hour: number, minute: number): string | null {
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function meridiemHour(hour: number, mer: string | undefined): number {
  const pm = (mer ?? '').toLowerCase() === 'pm';
  const am = (mer ?? '').toLowerCase() === 'am';
  if (pm && hour < 12) return hour + 12;
  if (am && hour === 12) return 0;
  return hour;
}

type TimeHit = { time: string; index: number; length: number };

function collectTimeHits(phrase: string): TimeHit[] {
  const hits: TimeHit[] = [];
  const push = (match: RegExpExecArray, time: string | null) => {
    if (!time || match.index == null) return;
    hits.push({ time, index: match.index, length: match[0].length });
  };

  const half = new RegExp(
    `\\bhalf\\s+past\\s+(${NUMBER_WORD_ALT}|\\d{1,2})\\s*(am|pm)?\\b`,
    'gi',
  );
  for (let m = half.exec(phrase); m; m = half.exec(phrase)) {
    const hour = hourFromWordOrNumber(m[1]);
    if (hour == null || hour < 1 || hour > 12) continue;
    push(m, formatHm(meridiemHour(hour, m[2]), 30));
  }

  const namedMer = new RegExp(`\\b(${NUMBER_WORD_ALT})\\s*(am|pm)\\b`, 'gi');
  for (let m = namedMer.exec(phrase); m; m = namedMer.exec(phrase)) {
    push(m, formatHm(meridiemHour(NUMBER_WORDS[m[1].toLowerCase()], m[2]), 0));
  }

  const special = /\b(midday|noon|midnight)\b/gi;
  for (let m = special.exec(phrase); m; m = special.exec(phrase)) {
    const key = m[1].toLowerCase();
    push(m, key === 'midnight' ? '00:00' : '12:00');
  }

  const clockWords = new RegExp(
    `\\b(${NUMBER_WORD_ALT}|\\d{1,2})\\s+o['’]?clock\\s*(am|pm)?\\b`,
    'gi',
  );
  for (let m = clockWords.exec(phrase); m; m = clockWords.exec(phrase)) {
    const hour = hourFromWordOrNumber(m[1]);
    if (hour == null || hour < 1 || hour > 12) continue;
    push(m, formatHm(meridiemHour(hour, m[2]), 0));
  }

  const dotted = /\b(\d{1,2})[.:](\d{2})\s*(am|pm)\b/gi;
  for (let m = dotted.exec(phrase); m; m = dotted.exec(phrase)) {
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour < 1 || hour > 12) continue;
    push(m, formatHm(meridiemHour(hour, m[3]), minute));
  }

  const mer = /\b(\d{1,2})\s*(am|pm)\b/gi;
  for (let m = mer.exec(phrase); m; m = mer.exec(phrase)) {
    const hour = Number(m[1]);
    if (hour < 1 || hour > 12) continue;
    push(m, formatHm(meridiemHour(hour, m[2]), 0));
  }

  const atHour = new RegExp(`\\bat\\s+(${NUMBER_WORD_ALT}|\\d{1,2})\\b`, 'gi');
  for (let m = atHour.exec(phrase); m; m = atHour.exec(phrase)) {
    const hour = hourFromWordOrNumber(m[1]);
    if (hour == null || hour < 1 || hour > 12) continue;
    push(m, formatHm(hour === 12 ? 12 : hour, 0));
  }

  const clock = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
  for (let m = clock.exec(phrase); m; m = clock.exec(phrase)) {
    push(m, formatHm(Number(m[1]), Number(m[2])));
  }

  return hits.sort((a, b) => a.index - b.index);
}

export function parseQuickBookTime(raw: string): string | null {
  const phrase = normalizeQuickBookPhrase(raw);
  return collectTimeHits(phrase)[0]?.time ?? null;
}

function timeAlreadyPassed(clock: BrisbaneClock, startTime: string | null): boolean {
  if (!startTime) return false;
  const [hour, minute] = startTime.split(':').map(Number);
  return clock.minutes > hour * 60 + minute;
}

function ymdForMonthDay(clock: BrisbaneClock, day: number, startTime: string | null): string {
  let year = clock.year;
  let month = clock.month;
  const passed = day < clock.day || (day === clock.day && timeAlreadyPassed(clock, startTime));
  if (passed) {
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const useDay = Math.min(day, last);
  return `${year}-${String(month).padStart(2, '0')}-${String(useDay).padStart(2, '0')}`;
}

function weekdayDate(
  clock: BrisbaneClock,
  dow: number,
  forceNext: boolean,
  startTime: string | null,
): string {
  let delta = (dow - clock.weekday + 7) % 7;
  if (forceNext) {
    delta = delta === 0 ? 7 : delta;
  } else if (delta === 0 && timeAlreadyPassed(clock, startTime)) {
    delta = 7;
  }
  return addBrisbaneDays(clock.date, delta);
}

export function parseQuickBookDate(raw: string, now: Date = new Date(), startTime: string | null = null): string | null {
  const clock = brisbaneNow(now);
  const phrase = normalizeQuickBookPhrase(raw).toLowerCase();
  if (/\btoday\b/.test(phrase)) return clock.date;
  if (/\btomorrow\b/.test(phrase)) return addBrisbaneDays(clock.date, 1);
  const next = phrase.match(NEXT_WEEKDAY_RE);
  if (next) return weekdayDate(clock, WEEKDAY_INDEX[next[1].toLowerCase()], true, startTime);
  const self = phrase.match(THIS_WEEKDAY_RE);
  if (self) return weekdayDate(clock, WEEKDAY_INDEX[self[1].toLowerCase()], false, startTime);
  const monthDay = phrase.match(MONTH_DAY_RE);
  if (monthDay) return ymdForMonthDay(clock, Number(monthDay[1]), startTime);
  const weekday = phrase.match(WEEKDAY_RE);
  if (!weekday) return null;
  return weekdayDate(clock, WEEKDAY_INDEX[weekday[1].toLowerCase()], false, startTime);
}

function leftoverSubject(rest: string): string | null {
  const token = rest
    .replace(/['’]s\b/gi, '')
    .split(/\s+/)
    .filter(word => word && !FILLER_WORD.test(word))
    .join(' ')
    .trim();
  return token || null;
}

function splitCrewTokens(raw: string): string[] {
  return raw
    .split(/\s*(?:,|&|\band\b)\s+/i)
    .map(part => leftoverSubject(part))
    .filter((part): part is string => !!part);
}

function stripHits(phrase: string, hits: { index: number; length: number }[]): string {
  if (hits.length === 0) return phrase;
  const sorted = [...hits].sort((a, b) => b.index - a.index);
  let next = phrase;
  for (const hit of sorted) {
    next = `${next.slice(0, hit.index)} ${next.slice(hit.index + hit.length)}`;
  }
  return next.replace(/\s+/g, ' ').trim();
}

export function parseQuickBook(phrase: string, now: Date = new Date()): QuickBookParse {
  const raw = phrase.trim();
  let work = normalizeQuickBookPhrase(raw);

  const timeHits = collectTimeHits(work);
  const startTime = timeHits[0]?.time ?? null;
  work = stripHits(work, timeHits);

  const dateHits: { index: number; length: number }[] = [];
  const pushDate = (match: RegExpMatchArray | null) => {
    if (!match || match.index == null) return;
    dateHits.push({ index: match.index, length: match[0].length });
  };
  pushDate(work.match(/\btoday\b/i));
  pushDate(work.match(/\btomorrow\b/i));
  pushDate(work.match(NEXT_WEEKDAY_RE));
  pushDate(work.match(THIS_WEEKDAY_RE));
  pushDate(work.match(MONTH_DAY_RE));
  if (dateHits.length === 0) pushDate(work.match(WEEKDAY_RE));
  const date = parseQuickBookDate(work, now, startTime);
  work = stripHits(work, dateHits);

  let crewTokens: string[] = [];
  const lastWith = work.toLowerCase().lastIndexOf(' with ');
  const withAtStart = work.toLowerCase().startsWith('with ') ? 0 : -1;
  const withAt = lastWith >= 0 ? lastWith + 1 : withAtStart;
  if (withAt >= 0) {
    const named = work.slice(withAt).replace(/^with\s+/i, '');
    crewTokens = splitCrewTokens(named);
    work = work.slice(0, withAt).trim();
  }

  return {
    raw,
    subjectToken: leftoverSubject(work),
    crewToken: crewTokens.length ? crewTokens.join(' and ') : null,
    crewTokens,
    date,
    startTime,
  };
}

export function normalizeMatchToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export type NameMatchStrength = 'strong' | 'weak' | null;

export function nameMatchStrength(name: string | null | undefined, token: string): NameMatchStrength {
  const hay = normalizeMatchToken(name ?? '');
  const needle = normalizeMatchToken(token);
  if (!hay || needle.length < 2) return null;
  if (hay === needle) return 'strong';
  const words = hay.split(' ');
  if (words.some(word => word === needle)) return 'strong';
  if (needle.length >= 3 && words.some(word => word.startsWith(needle))) return 'weak';
  if (needle.length >= 4 && words.some(word => editDistance(word, needle) === 1)) return 'weak';
  return null;
}

export function namedTokenMatches(name: string | null | undefined, token: string): boolean {
  return nameMatchStrength(name, token) != null;
}

function classifyHits<T>(
  token: string,
  scored: { item: T; strength: Exclude<NameMatchStrength, null> }[],
): NamedMatch<T> {
  const strong = scored.filter(row => row.strength === 'strong').map(row => row.item);
  const weak = scored.filter(row => row.strength === 'weak').map(row => row.item);
  if (strong.length === 1) return { token, kind: 'one', items: strong };
  if (strong.length > 1) return { token, kind: 'many', items: strong };
  if (weak.length > 0) return { token, kind: 'many', items: weak };
  return { token, kind: 'none', items: [] };
}

export function matchNamed<T extends QuickBookNamed>(
  token: string | null | undefined,
  items: T[],
): NamedMatch<T> {
  const trimmed = (token ?? '').trim();
  if (!trimmed) return { token: '', kind: 'none', items: [] };
  const scored = items.flatMap(item => {
    const strength = nameMatchStrength(item.name, trimmed);
    return strength ? [{ item, strength }] : [];
  });
  return classifyHits(trimmed, scored);
}

export function matchQuickBookJobs<T extends QuickBookJob>(
  token: string | null | undefined,
  jobs: T[],
): NamedMatch<T> {
  const trimmed = (token ?? '').trim();
  if (!trimmed) return { token: '', kind: 'none', items: [] };
  const needle = normalizeMatchToken(trimmed);
  const scored = jobs.flatMap(job => {
    const number = job.job_number != null ? String(job.job_number) : '';
    const padded = number ? number.padStart(4, '0') : '';
    const numberHit = number && (
      number === trimmed || padded === trimmed || `#${padded}` === trimmed || needle === number
    );
    const title = nameMatchStrength(job.title, trimmed);
    const client = nameMatchStrength(job.client_name, trimmed);
    const strength: NameMatchStrength = numberHit ? 'strong' : title ?? client;
    return strength ? [{ item: job, strength }] : [];
  });
  return classifyHits(trimmed, scored);
}

export function matchQuickBookCrew<T extends QuickBookNamed>(
  tokens: string[] | string | null | undefined,
  crew: T[],
): NamedMatch<T> {
  const list = Array.isArray(tokens)
    ? tokens.map(token => token.trim()).filter(Boolean)
    : (tokens ?? '').trim()
      ? [(tokens ?? '').trim()]
      : [];
  if (list.length === 0) return { token: '', kind: 'none', items: [] };
  if (list.length > 1) {
    const items: T[] = [];
    const seen = new Set<string>();
    for (const token of list) {
      for (const item of matchNamed(token, crew).items) {
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        items.push(item);
      }
    }
    const token = list.join(' and ');
    return items.length === 0
      ? { token, kind: 'none', items: [] }
      : { token, kind: 'many', items };
  }
  return matchNamed(list[0], crew);
}

export function unmatchedHint(
  kind: 'job' | 'client' | 'crew',
  token: string,
): string {
  if (kind === 'job') return `No job matches “${token}”. Search above or start a New job.`;
  if (kind === 'client') return `No client matches “${token}”. Search above or start a New job.`;
  return `No crew matches “${token}”. Pick one below.`;
}

export function manyHint(kind: 'job' | 'client' | 'crew', token: string): string {
  return `A few ${kind === 'crew' ? 'crew' : `${kind}s`} match “${token}”. Pick one.`;
}

export function spokenSheetFields<
  TJob extends QuickBookJob,
  TCrew extends QuickBookNamed,
  TClient extends QuickBookNamed,
>(resolved: QuickBookResolved<TJob, TCrew, TClient>): SpokenSheetFields {
  const out: SpokenSheetFields = {};
  if (resolved.parse.date) out.date = resolved.parse.date;
  if (resolved.parse.startTime) out.startTime = resolved.parse.startTime;
  if (resolved.crew.kind === 'one' && resolved.parse.crewTokens.length <= 1 && resolved.crew.items[0]) {
    out.crewId = resolved.crew.items[0].id;
  }
  return out;
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
  const crew = matchQuickBookCrew(parsed.crewTokens, lists.crew);
  const resolved = {
    parse: parsed,
    jobs,
    clients,
    crew,
    prefill: {} as SpokenSheetFields,
    hints: {
      job: parsed.subjectToken
        ? jobs.kind === 'none'
          ? unmatchedHint('job', parsed.subjectToken)
          : jobs.kind === 'many'
            ? manyHint('job', parsed.subjectToken)
            : null
        : null,
      client: parsed.subjectToken && jobs.kind === 'none'
        ? null
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
  resolved.prefill = spokenSheetFields(resolved);
  return resolved;
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
