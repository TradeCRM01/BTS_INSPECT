import { format } from 'date-fns';

export const DATE_YEAR_MIN = 1900;
export const DATE_YEAR_MAX = 2100;
export const SAFE_DATE_FALLBACK = '—';
export const DATE_YEAR_RANGE_MESSAGE = 'Enter a date with a year between 1900 and 2100';
export const AU_DATE_PLACEHOLDER = 'dd/mm/yyyy';
export const AU_DATE_FORMAT_MESSAGE = 'Enter a date as dd/mm/yyyy';
export const HOTFIX_BAD_DATE_ISO = '212026-02-11';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

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

export function isYearInRange(year: number): boolean {
  return Number.isInteger(year) && year >= DATE_YEAR_MIN && year <= DATE_YEAR_MAX;
}

export function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime()) && isYearInRange(value.getFullYear());
}

function ymdFromParts(year: number, month: number, day: number): string | null {
  if (!isYearInRange(year) || !isRealYmd(year, month, day)) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
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
    if (!isYearInRange(iso.year) || !isRealYmd(iso.year, iso.month, iso.day)) return null;
    if (/[T\s]/.test(trimmed)) {
      const fromStamp = new Date(trimmed);
      return isValidDate(fromStamp) ? fromStamp : null;
    }
    return new Date(iso.year, iso.month - 1, iso.day);
  }
  const parsed = new Date(trimmed);
  return isValidDate(parsed) ? parsed : null;
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

function ymdResult(year: number, month: number, day: number): { ok: true; iso: string } | { ok: false; error: string } {
  if (!Number.isInteger(year) || !isYearInRange(year)) {
    return { ok: false, error: DATE_YEAR_RANGE_MESSAGE };
  }
  const iso = ymdFromParts(year, month, day);
  if (!iso) return { ok: false, error: AU_DATE_FORMAT_MESSAGE };
  return { ok: true, iso };
}

/** AU dd/mm/yyyy first. Native yyyy-mm-dd still accepted. Never silent US mm/dd. */
export function parseAuDateInput(raw: string): { ok: true; iso: string } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: AU_DATE_FORMAT_MESSAGE };

  const iso = parseIsoDay(trimmed);
  if (iso) return ymdResult(iso.year, iso.month, iso.day);

  const au = trimmed.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d+)$/);
  if (au) return ymdResult(Number(au[3]), Number(au[2]), Number(au[1]));

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 8) {
    return ymdResult(Number(digits.slice(4, 8)), Number(digits.slice(2, 4)), Number(digits.slice(0, 2)));
  }
  if (digits.length >= 5) return { ok: false, error: DATE_YEAR_RANGE_MESSAGE };
  return { ok: false, error: AU_DATE_FORMAT_MESSAGE };
}

export function isoToAuInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const parsed = parseAuDateInput(trimmed);
  if (!parsed.ok) return trimmed;
  const [year, month, day] = parsed.iso.split('-');
  return `${Number(day)}/${Number(month)}/${year}`;
}

export function dateSaveError(raw: string, required = false): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return required ? AU_DATE_FORMAT_MESSAGE : null;
  const parsed = parseAuDateInput(trimmed);
  return parsed.ok ? null : parsed.error;
}

export function dateSaveIso(raw: string, required = false): { ok: true; iso: string | null } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) {
    if (required) return { ok: false, error: AU_DATE_FORMAT_MESSAGE };
    return { ok: true, iso: null };
  }
  const parsed = parseAuDateInput(trimmed);
  if (!parsed.ok) return parsed;
  return parsed;
}
