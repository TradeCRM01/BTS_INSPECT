import { format } from 'date-fns';

export const DATE_YEAR_MIN = 1900;
export const DATE_YEAR_MAX = 2100;
export const SAFE_DATE_FALLBACK = '—';
export const DATE_YEAR_RANGE_MESSAGE = 'Enter a date with a year between 1900 and 2100';
export const DATE_REQUIRED_MESSAGE = 'This date is required';
export const HOTFIX_BAD_DATE_ISO = '212026-02-11';

function isRealYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(year, month - 1, day);
  return (
    probe.getFullYear() === year
    && probe.getMonth() === month - 1
    && probe.getDate() === day
  );
}

/** Same 1900–2100 window as dateTimeIntegrity.isSupportedDateYear (#372). */
export function isSupportedDateYear(year: number): boolean {
  return Number.isFinite(year) && year >= DATE_YEAR_MIN && year <= DATE_YEAR_MAX;
}

export const isYearInRange = isSupportedDateYear;

/** Year-only save guard for native date fields. AU text entry is #372. */
export function dateFieldYearError(raw: string, required = false): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return required ? DATE_REQUIRED_MESSAGE : null;
  const year = Number(/^(\d+)/.exec(trimmed)?.[1]);
  if (!isSupportedDateYear(year)) return DATE_YEAR_RANGE_MESSAGE;
  return null;
}

export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime()) && isSupportedDateYear(value.getFullYear());
}

function parseIsoDay(raw: string): { year: number; month: number; day: number } | null {
  const match = raw.trim().match(/^(\d+)-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

export function parseToDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isValidDate(value) ? value : null;
  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    return isValidDate(fromNumber) ? fromNumber : null;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const iso = parseIsoDay(trimmed);
  if (iso) {
    if (!isSupportedDateYear(iso.year) || !isRealYmd(iso.year, iso.month, iso.day)) return null;
    if (/[T\s]/.test(trimmed)) {
      const fromStamp = new Date(trimmed);
      return isValidDate(fromStamp) ? fromStamp : null;
    }
    return new Date(iso.year, iso.month - 1, iso.day);
  }
  return null;
}

export function safeFormatDate(value: unknown, pattern = 'd MMM yyyy'): string {
  const date = parseToDate(value);
  if (!date) return SAFE_DATE_FALLBACK;
  try {
    return format(date, pattern);
  } catch {
    return SAFE_DATE_FALLBACK;
  }
}

export function safeLocaleDateString(
  value: unknown,
  locales?: string | string[],
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = parseToDate(value);
  if (!date) return SAFE_DATE_FALLBACK;
  try {
    const label = date.toLocaleDateString(locales, options);
    return !label || label === 'Invalid Date' ? SAFE_DATE_FALLBACK : label;
  } catch {
    return SAFE_DATE_FALLBACK;
  }
}

export function safeToIsoString(value: unknown): string | null {
  const date = parseToDate(value);
  if (!date) return null;
  try {
    return date.toISOString();
  } catch {
    return null;
  }
}
