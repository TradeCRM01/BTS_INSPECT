import { SAFE_DATE_FALLBACK, safeFormatDate } from './safeDate';

export const JOB_SHEET_NO_DATE_YET = 'No date yet';

function clock(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  return trimmed.slice(0, 5);
}

export function jobSheetClockRange(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const from = clock(start);
  const to = clock(end);
  if (from && to) return `${from}–${to}`;
  return from || to;
}

export function jobSheetWhenLine(input: {
  scheduled_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}): { text: string; undated: boolean } {
  const dated = !!(input.scheduled_date ?? '').trim();
  if (!dated) return { text: JOB_SHEET_NO_DATE_YET, undated: true };
  const day = safeFormatDate(input.scheduled_date, 'EEE d MMM');
  if (day === SAFE_DATE_FALLBACK) return { text: JOB_SHEET_NO_DATE_YET, undated: true };
  const range = jobSheetClockRange(input.start_time, input.end_time);
  return { text: range ? `${day} · ${range}` : day, undated: false };
}
