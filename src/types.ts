export type DateKey = string; // YYYY-MM-DD in the paper's timezone

export type SourceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type CalendarEvent = {
  id: string;
  title: string;
  start: string; // ISO
  end: string | null; // ISO
  allDay: boolean;
  location: string | null;
};

export type WaitingThread = {
  id: string;
  subject: string;
  from: string;
  lastMessageAt: string; // ISO
  url: string;
};

export type GrafterYesterday = {
  signups: string[]; // company names that signed up yesterday
  companiesTotal: number;
  activeCompanies: number; // companies that created a quote or job yesterday
  quotesCreated: number;
  jobsCreated: number;
  paying: number;
  trial: number;
  pastDue: number;
};

export type Signals = {
  calendar: SourceResult<CalendarEvent[]>;
  mail: SourceResult<WaitingThread[]>;
  grafter: SourceResult<GrafterYesterday>;
};

export type Answer = 'done' | 'missed';

export type State = {
  /** One sentence per day. */
  oneThing: Record<DateKey, string>;
  /** Evening answer per day. Missing means not answered. */
  record: Record<DateKey, Answer>;
  /** First morning an item appeared, so it can age. Keyed by source id. */
  carry: Record<string, DateKey>;
};

export type EditionKind = 'morning' | 'evening';

export type Line = {
  text: string;
  detail?: string;
  ageDays?: number;
  href?: string;
};

export type Section = {
  key: 'today' | 'waiting' | 'grafter' | 'reckoning' | 'question';
  title: string;
  lines: Line[];
};

export type RecordSummary = {
  window: number;
  done: number;
  answered: number;
  marks: Array<'done' | 'missed' | 'blank'>; // oldest first
};

export type Edition = {
  kind: EditionKind;
  dateKey: DateKey;
  heading: string; // Thursday 11 September
  oneThing: string | null;
  sections: Section[];
  record: RecordSummary;
};
