/** Single home for year bounds, AU/year messages, save guards, and display. */

import { format } from 'date-fns';

export const DATE_YEAR_MIN = 1900;
export const DATE_YEAR_MAX = 2100;
export const AU_DATE_PLACEHOLDER = 'dd/mm/yyyy';
export const DATE_INVALID_MESSAGE = 'Enter the date as dd/mm/yyyy';
export const DATE_YEAR_RANGE_MESSAGE = 'Enter a date with a year between 1900 and 2100';
export const DATE_REQUIRED_MESSAGE = 'This date is required';
export const SAFE_DATE_FALLBACK = '—';
export const HOTFIX_BAD_DATE_ISO = '212026-02-11';

const ISO_YMD = /^(\d{4})-(\d{2})-(\d{2})$/;
const AU_YMD = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;

export function isSupportedDateYear(year: number): boolean {
  return Number.isFinite(year) && year >= DATE_YEAR_MIN && year <= DATE_YEAR_MAX;
}

export const isYearInRange = isSupportedDateYear;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isRealYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(year, month - 1, day));
  return dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day;
}

function asIso(year: number, month: number, day: number): string | null {
  if (!isRealYmd(year, month, day)) return null;
  if (!isSupportedDateYear(year)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function parseIsoDay(raw: string): { year: number; month: number; day: number } | null {
  const match = raw.trim().match(/^(\d+)-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/** Parse a native yyyy-mm-dd or AU dd/mm/yyyy value. Date must be real before the year is accepted. */
export function parseFieldDate(raw: string): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const iso = parseIsoDay(trimmed) ?? (() => {
    const m = ISO_YMD.exec(trimmed);
    return m ? { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) } : null;
  })();
  if (iso) return asIso(iso.year, iso.month, iso.day);
  const au = AU_YMD.exec(trimmed.replace(/\s+/g, ''));
  if (!au) return null;
  const year = Number(au[3]) < 100 ? 2000 + Number(au[3]) : Number(au[3]);
  return asIso(year, Number(au[2]), Number(au[1]));
}

/** Save guard for native date fields (Assets, Contracts Next Service) and AU text. */
export function dateFieldYearError(raw: string, required = false): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return required ? DATE_REQUIRED_MESSAGE : null;
  const iso = parseIsoDay(trimmed);
  if (iso) {
    if (!isSupportedDateYear(iso.year)) return DATE_YEAR_RANGE_MESSAGE;
    if (!isRealYmd(iso.year, iso.month, iso.day)) return DATE_INVALID_MESSAGE;
    return null;
  }
  const au = AU_YMD.exec(trimmed.replace(/\s+/g, ''));
  if (au) {
    const year = Number(au[3]) < 100 ? 2000 + Number(au[3]) : Number(au[3]);
    if (!isSupportedDateYear(year)) return DATE_YEAR_RANGE_MESSAGE;
    if (!isRealYmd(year, Number(au[2]), Number(au[1]))) return DATE_INVALID_MESSAGE;
    return null;
  }
  if (/[/.-]/.test(trimmed)) return DATE_INVALID_MESSAGE;
  const year = Number(/^(\d+)/.exec(trimmed)?.[1]);
  if (!isSupportedDateYear(year)) return DATE_YEAR_RANGE_MESSAGE;
  return DATE_INVALID_MESSAGE;
}

export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime()) && isSupportedDateYear(value.getFullYear());
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
