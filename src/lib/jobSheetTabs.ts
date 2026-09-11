export const JOB_SHEET_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'quotes', label: 'Quotes' },
  { id: 'bill', label: 'Bill' },
  { id: 'safety', label: 'Safety' },
  { id: 'time', label: 'Time' },
  { id: 'notes', label: 'Notes & photos' },
  { id: 'inspections', label: 'Inspections' },
  { id: 'gallery', label: 'Gallery' },
] as const;

export type JobSheetTab = (typeof JOB_SHEET_TABS)[number]['id'];

export const JOB_SHEET_DEFAULT_TAB: JobSheetTab = 'overview';
export const JOB_SHEET_TAB_PARAM = 'tab';

/** Section id (the DOM id or pane key) -> the tab that shows it. One table, no scattered conditionals. */
export const JOB_SHEET_SECTION_TAB = {
  'job-cover': 'overview',
  'job-ledger': 'overview',
  'job-stages': 'overview',
  'job-schedule': 'overview',
  'job-quotes': 'quotes',
  'job-bill': 'bill',
  'job-invoices': 'bill',
  'job-swms': 'safety',
  'job-take5': 'safety',
  'job-hours': 'time',
  'job-visit-notes': 'notes',
  'job-insp': 'inspections',
  'job-testing-due': 'inspections',
  'job-gallery': 'gallery',
} as const satisfies Record<string, JobSheetTab>;

export type JobSheetSection = keyof typeof JOB_SHEET_SECTION_TAB;

export function isJobSheetTab(value: unknown): value is JobSheetTab {
  return JOB_SHEET_TABS.some(t => t.id === value);
}

export function jobSheetTabFor(section: string): JobSheetTab {
  return Object.prototype.hasOwnProperty.call(JOB_SHEET_SECTION_TAB, section)
    ? JOB_SHEET_SECTION_TAB[section as JobSheetSection]
    : JOB_SHEET_DEFAULT_TAB;
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
