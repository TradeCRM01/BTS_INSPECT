import { formatMoney } from '../types/fsm';

import type { JobStatus } from '../types/crm';

export const JOB_SHEET_NO_CREW = 'No crew yet';
export const JOB_SHEET_SET_A_DATE = 'Set a date';
export const JOB_SHEET_ALL_NOTES = 'All notes';
export const JOB_SHEET_ALL_PHOTOS = 'All photos';
export const JOB_SHEET_EDIT_BILL = 'Edit bill';
export const JOB_SHEET_BACK = '‹ Jobs';

export const JOB_SHEET_STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function jobSheetEyebrow(ref: string): string {
  return `JOB ${ref}`;
}

export function jobSheetHoursLogged(minutes: number): string {
  if (!(minutes > 0)) return '';
  const hours = Math.round(minutes / 6) / 10;
  return `${hours} h logged`;
}

export function jobSheetBillLinesLabel(lines: number): string {
  if (lines <= 0) return '';
  return `${lines} bill ${lines === 1 ? 'line' : 'lines'}`;
}

/** Drop any zero part. Empty when both are zero. */
export function jobSheetSubLine(input: { billLines: number; minutes: number }): string {
  return [jobSheetBillLinesLabel(input.billLines), jobSheetHoursLogged(input.minutes)]
    .filter(Boolean)
    .join(' · ');
}

export function jobSheetNoteStamp(author: string, time: string): string {
  return `${author} · ${time}`;
}

export function jobSheetPhotosHeading(count: number): string {
  return `Photos · ${count}`;
}

export function jobSheetCrewLabel(names: readonly string[], busy = false, error = false): string {
  if (error) return "Couldn't load crew.";
  if (busy) return '…';
  return names.length > 0 ? names.join(', ') : JOB_SHEET_NO_CREW;
}

export function jobSheetMapsHref(query: string): string {
  return `https://maps.google.com/?q=${encodeURIComponent(query)}`;
}

export type JobSheetBillPreview = {
  lineCount: number;
  subtotal: number;
  taxAmount: number;
  totalIncGst: number;
};

export function jobSheetBillTotals(preview: JobSheetBillPreview | null | undefined): {
  lines: number;
  subtotal: string;
  gst: string;
  total: string;
} | null {
  if (!preview) return null;
  return {
    lines: preview.lineCount,
    subtotal: formatMoney(preview.subtotal),
    gst: formatMoney(preview.taxAmount),
    total: formatMoney(preview.totalIncGst),
  };
}
