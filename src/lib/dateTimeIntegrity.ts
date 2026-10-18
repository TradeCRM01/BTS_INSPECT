export const AU_DATE_PLACEHOLDER = 'dd/mm/yyyy';
export const DATE_REQUIRED_MESSAGE = 'Set a date before saving.';
export const END_BEFORE_START_MESSAGE = 'End time must be after start.';
export const REVERSED_TIME_ENTRY_MESSAGE = 'End time must be after start. This would bill overnight hours.';
export const TIME_ENTRY_OVERLAP_MESSAGE = 'This overlaps another time entry for this person.';

const ISO_YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const AU_SLASH = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const CLOCK = /^(\d{1,2}):(\d{2})/;

function isRealYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function isoDateKey(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const iso = ISO_YMD.exec(raw.slice(0, 10));
  if (!iso) return null;
  const year = Number(iso[1]);
  const month = Number(iso[2]);
  const day = Number(iso[3]);
  if (!isRealYmd(year, month, day)) return null;
  return `${iso[1]}-${iso[2]}-${iso[3]}`;
}

export function parseAuDate(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  const iso = isoDateKey(value);
  if (iso) return iso;
  const au = AU_SLASH.exec(value);
  if (!au) return null;
  const day = Number(au[1]);
  const month = Number(au[2]);
  const year = Number(au[3]);
  if (!isRealYmd(year, month, day)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function formatAuDate(iso: string | null | undefined): string {
  const key = isoDateKey(iso);
  if (!key) return '';
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year}`;
}

export function clockMinutes(value: string | null | undefined): number | null {
  const match = CLOCK.exec((value ?? '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

export function jobClockOrderError(start: string | null | undefined, end: string | null | undefined): string | null {
  const startM = clockMinutes(start);
  const endM = clockMinutes(end);
  if (startM == null && endM == null) return null;
  if (startM == null || endM == null) return null;
  if (endM <= startM) return END_BEFORE_START_MESSAGE;
  return null;
}

export function timeEntryOrderError(start: string | null | undefined, end: string | null | undefined): string | null {
  const startM = clockMinutes(start);
  const endM = clockMinutes(end);
  if (startM == null || endM == null) return null;
  if (endM <= startM) return REVERSED_TIME_ENTRY_MESSAGE;
  return null;
}

export function scheduleSheetDateSeed(input: {
  prefillDate?: string | null;
  scheduledDate?: string | null;
}): string {
  return isoDateKey(input.prefillDate) || isoDateKey(input.scheduledDate) || '';
}

export function scheduleSheetDateError(date: string | null | undefined): string | null {
  return isoDateKey(date) ? null : DATE_REQUIRED_MESSAGE;
}

export function scheduleSheetSaveError(input: {
  date: string;
  startTime: string;
  endTime: string;
}): string | null {
  return scheduleSheetDateError(input.date) ?? jobClockOrderError(input.startTime, input.endTime);
}

export type TimeEntrySibling = {
  id?: string;
  start_time: string;
  end_time: string | null;
};

function instantMs(value: string): number | null {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : null;
}

function candidateInstant(date: string, clock: string): number | null {
  const day = isoDateKey(date);
  const hm = (clock ?? '').trim().slice(0, 5);
  if (!day || !CLOCK.test(hm)) return null;
  return instantMs(`${day}T${hm}`);
}

export function timeEntryOverlapError(args: {
  date: string;
  start: string;
  end: string;
  excludeId?: string;
  existing?: TimeEntrySibling[];
}): string | null {
  const startMs = candidateInstant(args.date, args.start);
  const endMs = candidateInstant(args.date, args.end);
  if (startMs == null || endMs == null || endMs <= startMs) return null;
  for (const row of args.existing ?? []) {
    if (args.excludeId && row.id && row.id === args.excludeId) continue;
    if (!row.end_time) continue;
    const otherStart = instantMs(row.start_time);
    const otherEnd = instantMs(row.end_time);
    if (otherStart == null || otherEnd == null) continue;
    if (startMs < otherEnd && otherStart < endMs) return TIME_ENTRY_OVERLAP_MESSAGE;
  }
  return null;
}

export function timeEntrySaveError(args: {
  date: string;
  start: string;
  end: string;
  excludeId?: string;
  existing?: TimeEntrySibling[];
}): string | null {
  if (!isoDateKey(args.date)) return DATE_REQUIRED_MESSAGE;
  return timeEntryOrderError(args.start, args.end)
    ?? timeEntryOverlapError(args);
}
