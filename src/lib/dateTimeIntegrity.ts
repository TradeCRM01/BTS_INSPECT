export const AU_DATE_PLACEHOLDER = 'dd/mm/yyyy';
export const DATE_REQUIRED_MESSAGE = 'Set a date before saving.';
export const DATE_INVALID_MESSAGE = 'Enter the date as dd/mm/yyyy';
export const TIME_NEEDS_DATE_MESSAGE = 'Add a date for this time.';
export const END_BEFORE_START_MESSAGE = 'End time must be after start.';
export const REVERSED_TIME_ENTRY_MESSAGE = 'End time must be after start. This would bill overnight hours.';
export const ENDS_NEXT_DAY_HINT = 'Working past midnight? Tick Ends next day.';
export const ENDS_NEXT_DAY_UNCHECK_MESSAGE = 'End is later the same day, so untick Ends next day.';
export const TIME_ENTRY_OVERNIGHT_CAP_MESSAGE = 'Overnight entries cannot exceed 16 hours.';
export const TIME_ENTRY_OVERLAP_MESSAGE = 'This overlaps another time entry for this person.';
export const TIME_ENTRY_ZERO_LENGTH_MESSAGE = 'End time must be after start.';
export const DATE_RANGE_ORDER_MESSAGE = 'End date must be on or after the start date.';
export const DATE_YEAR_MIN = 1900;
export const DATE_YEAR_MAX = 2100;

const ISO_YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const AU_SLASH = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;
const EIGHT_DIGITS = /^(\d{2})(\d{2})(\d{4})$/;
const CLOCK = /^(\d{1,2}):(\d{2})/;
const OVERNIGHT_CAP_MINUTES = 16 * 60;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function isSupportedDateYear(year: number): boolean {
  return Number.isFinite(year) && year >= DATE_YEAR_MIN && year <= DATE_YEAR_MAX;
}

function expandYear(year: number): number | null {
  if (year < 100) return 2000 + year;
  if (!isSupportedDateYear(year)) return null;
  return year;
}

function isRealYmd(year: number, month: number, day: number): boolean {
  if (!isSupportedDateYear(year)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

function ymd(year: number, month: number, day: number): string | null {
  if (!isRealYmd(year, month, day)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function isoDateKey(value: string | null | undefined): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  const head = raw.slice(0, 10);
  if (raw.length > 10 && raw[10] !== 'T') return null;
  const iso = ISO_YMD.exec(head);
  if (!iso) return null;
  const year = Number(iso[1]);
  const month = Number(iso[2]);
  const day = Number(iso[3]);
  if (!isRealYmd(year, month, day)) return null;
  return `${iso[1]}-${iso[2]}-${iso[3]}`;
}

function parseAuText(value: string): string | null {
  const eight = EIGHT_DIGITS.exec(value);
  if (eight) {
    return ymd(Number(eight[3]), Number(eight[2]), Number(eight[1]));
  }
  const normalized = value.replace(/[.\-\s]+/g, '/').replace(/\/+/g, '/');
  const au = AU_SLASH.exec(normalized);
  if (!au) return null;
  const year = expandYear(Number(au[3]));
  if (year == null) return null;
  return ymd(year, Number(au[2]), Number(au[1]));
}

export function parseAuDate(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  if (!value) return null;
  const isoExact = ISO_YMD.exec(value);
  if (isoExact) {
    return ymd(Number(isoExact[1]), Number(isoExact[2]), Number(isoExact[3]));
  }
  if (ISO_YMD.test(value.slice(0, 10)) && value.length > 10) return null;
  return parseAuText(value);
}

export function formatAuDate(iso: string | null | undefined): string {
  const key = isoDateKey(iso);
  if (!key) return '';
  const [year, month, day] = key.split('-');
  return `${day}/${month}/${year}`;
}

export function addLocalDate(iso: string, days: number): string {
  const key = isoDateKey(iso);
  if (!key) return '';
  const [year, month, day] = key.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day + days));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function dateInputError(args: {
  iso: string | null | undefined;
  invalid: boolean;
  required?: boolean;
}): string | null {
  if (args.invalid) return DATE_INVALID_MESSAGE;
  if (args.required && !isoDateKey(args.iso)) return DATE_REQUIRED_MESSAGE;
  return null;
}

export function dateRangeOrderError(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  const startDay = isoDateKey(start);
  const endDay = isoDateKey(end);
  if (!startDay || !endDay) return null;
  if (endDay < startDay) return DATE_RANGE_ORDER_MESSAGE;
  return null;
}

export function reminderSaveError(args: {
  date: string;
  time: string;
  invalid?: boolean;
}): string | null {
  if (args.invalid) return DATE_INVALID_MESSAGE;
  const day = isoDateKey(args.date);
  const hasTime = !!(args.time ?? '').trim();
  if (hasTime && !day) return TIME_NEEDS_DATE_MESSAGE;
  return null;
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

export function timeEntryOrderError(
  start: string | null | undefined,
  end: string | null | undefined,
  opts?: { endsNextDay?: boolean },
): string | null {
  const startM = clockMinutes(start);
  const endM = clockMinutes(end);
  if (startM == null || endM == null) return null;
  const endsNextDay = !!opts?.endsNextDay;
  if (!endsNextDay) {
    if (endM <= startM) return `${REVERSED_TIME_ENTRY_MESSAGE} ${ENDS_NEXT_DAY_HINT}`;
    return null;
  }
  if (endM > startM) return ENDS_NEXT_DAY_UNCHECK_MESSAGE;
  const minutes = endM + 24 * 60 - startM;
  if (minutes > OVERNIGHT_CAP_MINUTES) return TIME_ENTRY_OVERNIGHT_CAP_MESSAGE;
  if (minutes <= 0) return TIME_ENTRY_ZERO_LENGTH_MESSAGE;
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
  invalid?: boolean;
}): string | null {
  if (input.invalid) return DATE_INVALID_MESSAGE;
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

function siblingEndMs(row: TimeEntrySibling, nowMs: number): number | null {
  if (!row.end_time) return nowMs;
  return instantMs(row.end_time);
}

export function timeEntryOverlapError(args: {
  date: string;
  start: string;
  end: string;
  endsNextDay?: boolean;
  existing?: TimeEntrySibling[];
  now?: Date | string;
}): string | null {
  const startMs = candidateInstant(args.date, args.start);
  const endDay = args.endsNextDay ? addLocalDate(args.date, 1) : args.date;
  const endMs = candidateInstant(endDay, args.end);
  if (startMs == null || endMs == null || endMs <= startMs) return null;
  const nowMs = instantMs(typeof args.now === 'string' ? args.now : (args.now ?? new Date()).toISOString());
  if (nowMs == null) return null;
  for (const row of args.existing ?? []) {
    const otherStart = instantMs(row.start_time);
    const otherEnd = siblingEndMs(row, nowMs);
    if (otherStart == null || otherEnd == null) continue;
    if (startMs < otherEnd && otherStart < endMs) return TIME_ENTRY_OVERLAP_MESSAGE;
  }
  return null;
}

export function timeEntrySaveError(args: {
  date: string;
  start: string;
  end: string;
  endsNextDay?: boolean;
  invalid?: boolean;
  existing?: TimeEntrySibling[];
  now?: Date | string;
}): string | null {
  if (args.invalid) return DATE_INVALID_MESSAGE;
  if (!isoDateKey(args.date)) return DATE_REQUIRED_MESSAGE;
  return timeEntryOrderError(args.start, args.end, { endsNextDay: args.endsNextDay })
    ?? timeEntryOverlapError(args);
}

export function clockOnSaveError(args: {
  now: Date | string;
  existing?: TimeEntrySibling[];
}): string | null {
  const nowIso = typeof args.now === 'string' ? args.now : args.now.toISOString();
  const nowMs = instantMs(nowIso);
  if (nowMs == null) return null;
  for (const row of args.existing ?? []) {
    const otherStart = instantMs(row.start_time);
    if (otherStart == null) continue;
    if (!row.end_time) return TIME_ENTRY_OVERLAP_MESSAGE;
    const otherEnd = instantMs(row.end_time);
    if (otherEnd == null) continue;
    if (otherStart < nowMs && nowMs < otherEnd) return TIME_ENTRY_OVERLAP_MESSAGE;
  }
  return null;
}

export function clockOffSaveError(args: {
  startIso: string;
  endIso: string;
  existing?: TimeEntrySibling[];
}): string | null {
  const startMs = instantMs(args.startIso);
  const endMs = instantMs(args.endIso);
  if (startMs == null || endMs == null) return null;
  if (endMs <= startMs) return TIME_ENTRY_ZERO_LENGTH_MESSAGE;
  for (const row of args.existing ?? []) {
    const otherStart = instantMs(row.start_time);
    const otherEnd = row.end_time ? instantMs(row.end_time) : null;
    if (otherStart == null || otherEnd == null) continue;
    if (startMs < otherEnd && otherStart < endMs) return TIME_ENTRY_OVERLAP_MESSAGE;
  }
  return null;
}

export function overlapQueryDates(date: string, endsNextDay?: boolean): { fromDate: string; toDate: string } {
  const day = isoDateKey(date) ?? date;
  return {
    fromDate: day,
    toDate: endsNextDay ? addLocalDate(day, 1) : day,
  };
}

export function shiftEndForNextDay(end: Date | null, endsNextDay: boolean): Date | null {
  if (!end || !endsNextDay) return end;
  const next = new Date(end);
  next.setDate(next.getDate() + 1);
  return next;
}

function localHm(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function localDayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function formatClockHm(iso: string): string {
  return localHm(iso);
}

export function endsNextCalendarDay(startIso: string, endIso: string): boolean {
  return localDayKey(endIso) > localDayKey(startIso);
}

export function formatClockRangeLabel(startIso: string, endIso: string | null | undefined): string {
  const start = localHm(startIso);
  if (!endIso) return `${start} · running`;
  const end = localHm(endIso);
  const plus = endsNextCalendarDay(startIso, endIso) ? ' (+1)' : '';
  return `${start}–${end}${plus}`;
}
