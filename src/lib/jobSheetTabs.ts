import { format, parseISO } from 'date-fns';
import { formatMoney } from '../types/fsm';

export const JOB_SHEET_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'schedule', label: 'Schedule & people' },
  { id: 'paperwork', label: 'Paperwork' },
  { id: 'materials', label: 'Materials' },
] as const;

export type JobSheetTab = (typeof JOB_SHEET_TABS)[number]['id'];

export const JOB_SHEET_DEFAULT_TAB: JobSheetTab = 'overview';
export const JOB_SHEET_TAB_PARAM = 'tab';

/** Section id (the DOM id or pane key) -> the tab that shows it. One table, no scattered conditionals. */
export const JOB_SHEET_SECTION_TAB = {
  'job-cover': 'overview',
  'job-ledger': 'overview',
  'job-lanes': 'overview',
  'job-stages': 'overview',
  'job-schedule': 'schedule',
  'job-hours': 'schedule',
  'job-swms': 'paperwork',
  'job-visit-notes': 'paperwork',
  'job-insp': 'paperwork',
  'job-gallery': 'paperwork',
  'job-testing-due': 'paperwork',
  'job-quotes': 'paperwork',
  'job-invoices': 'paperwork',
  'job-bill': 'materials',
} as const satisfies Record<string, JobSheetTab>;

export type JobSheetSection = keyof typeof JOB_SHEET_SECTION_TAB;

/** Paperwork pane in render order. Each label sits before its first section and hides with it. */
export const JOB_SHEET_PAPERWORK_GROUPS = [
  { label: 'Safety', sections: ['job-swms'] },
  { label: 'Field records', sections: ['job-visit-notes', 'job-insp', 'job-gallery', 'job-testing-due'] },
  { label: 'Quotes & invoices', sections: ['job-quotes', 'job-invoices'] },
] as const satisfies readonly { label: string; sections: readonly JobSheetSection[] }[];

export function isJobSheetTab(value: unknown): value is JobSheetTab {
  return JOB_SHEET_TABS.some(t => t.id === value);
}

export function jobSheetTabFor(section: string): JobSheetTab {
  return Object.prototype.hasOwnProperty.call(JOB_SHEET_SECTION_TAB, section)
    ? JOB_SHEET_SECTION_TAB[section as JobSheetSection]
    : JOB_SHEET_DEFAULT_TAB;
}

/** The group label a section opens, or null when it sits inside a group. */
export function jobSheetGroupLabel(section: JobSheetSection): string | null {
  return JOB_SHEET_PAPERWORK_GROUPS.find(g => g.sections[0] === section)?.label ?? null;
}

/** ?tab= wins, then a #section hash, then Overview. */
export function readJobSheetTab(params: URLSearchParams, hash: string): JobSheetTab {
  const asked = params.get(JOB_SHEET_TAB_PARAM);
  if (isJobSheetTab(asked)) return asked;
  return jobSheetTabFor(hash.replace(/^#/, ''));
}

/** Writes the tab into the params. Overview deletes the param so the default URL stays clean. Mutates and returns params. */
export function writeJobSheetTab(params: URLSearchParams, tab: JobSheetTab): URLSearchParams {
  if (tab === JOB_SHEET_DEFAULT_TAB) params.delete(JOB_SHEET_TAB_PARAM);
  else params.set(JOB_SHEET_TAB_PARAM, tab);
  return params;
}

export type JobSheetOverviewTone = 'ok' | 'wait' | 'progress' | 'bad' | 'info';

export interface JobSheetOverviewFacts {
  scheduledDate: string | null;
  startTime: string | null;
  crewNames: string[];
  jhaCount: number;
  take5Count: number;
  inspectionCount: number;
  testingDueCount: number;
  noteCount: number;
  photoCount: number;
  quoteCount: number;
  invoiceCount: number;
  billLines: number;
  billCost: number;
  billCharge: number;
}

export interface JobSheetOverviewRow {
  section: JobSheetSection;
  label: string;
  meta: string;
  status: string;
  tone: JobSheetOverviewTone;
}

function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The Overview hub, one row per lane. `tone` is the `ops-status-<tone>` class the chip wears. */
export function jobSheetOverviewRows(facts: JobSheetOverviewFacts): JobSheetOverviewRow[] {
  const when = facts.scheduledDate
    ? [format(parseISO(facts.scheduledDate), 'EEE d MMM'), facts.startTime?.slice(0, 5)].filter(Boolean).join(' ')
    : null;
  const fieldMeta = [count(facts.inspectionCount, 'inspection'), count(facts.photoCount, 'photo')];
  if (facts.testingDueCount > 0) fieldMeta.push(`${count(facts.testingDueCount, 'test')} due`);
  return [
    {
      section: 'job-schedule',
      label: 'Schedule & people',
      meta: [when, facts.crewNames.length > 0 ? facts.crewNames.join(', ') : 'Unassigned'].filter(Boolean).join(' · '),
      status: facts.scheduledDate ? 'Booked' : 'Not booked',
      tone: facts.scheduledDate ? 'ok' : 'wait',
    },
    {
      section: 'job-swms',
      label: 'Safety',
      meta: `${facts.jhaCount} JHA / SWMS · ${facts.take5Count} Take 5`,
      status: facts.jhaCount > 0 ? 'JHA on file' : 'No JHA',
      tone: facts.jhaCount > 0 ? 'ok' : 'wait',
    },
    {
      section: 'job-visit-notes',
      label: 'Field records',
      meta: fieldMeta.join(' · '),
      status: facts.noteCount > 0 ? count(facts.noteCount, 'note') : 'Nothing posted',
      tone: facts.noteCount > 0 ? 'info' : 'wait',
    },
    {
      section: 'job-quotes',
      label: 'Quotes & invoices',
      meta: '',
      status: facts.quoteCount + facts.invoiceCount > 0
        ? `${count(facts.quoteCount, 'quote')} · ${count(facts.invoiceCount, 'invoice')}`
        : 'None yet',
      tone: facts.quoteCount + facts.invoiceCount > 0 ? 'info' : 'wait',
    },
    {
      section: 'job-bill',
      label: 'Materials',
      meta: `Cost ${formatMoney(facts.billCost)} · Charge ${formatMoney(facts.billCharge)}`,
      status: facts.billLines > 0 ? count(facts.billLines, 'line') : 'No materials',
      tone: facts.billLines > 0 ? 'info' : 'wait',
    },
  ];
}
