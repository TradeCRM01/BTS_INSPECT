import { describe, expect, it } from 'vitest';
import {
  DATE_REQUIRED_MESSAGE,
  DATE_YEAR_RANGE_MESSAGE,
  HOTFIX_BAD_DATE_ISO,
  SAFE_DATE_FALLBACK,
  dateFieldYearError,
  isSupportedDateYear,
  isValidDate,
  parseToDate,
  safeFormatDate,
  safeLocaleDateString,
  safeToIsoString,
} from './safeDate';

describe('safeDate year and validity', () => {
  it('accepts years 1900-2100 and rejects 212026', () => {
    expect(isSupportedDateYear(1900)).toBe(true);
    expect(isSupportedDateYear(2100)).toBe(true);
    expect(isSupportedDateYear(2026)).toBe(true);
    expect(isSupportedDateYear(1899)).toBe(false);
    expect(isSupportedDateYear(2101)).toBe(false);
    expect(isSupportedDateYear(212026)).toBe(false);
  });

  it('treats parseISO-invalid 212026-02-11 as not a date', () => {
    expect(parseToDate(HOTFIX_BAD_DATE_ISO)).toBeNull();
    expect(isValidDate(new Date(HOTFIX_BAD_DATE_ISO))).toBe(false);
    expect(isValidDate(new Date('nope'))).toBe(false);
    expect(isValidDate(new Date(2026, 9, 21))).toBe(true);
  });
});

describe('safeFormatDate never throws', () => {
  it('formats a real day and renders an em dash for invalid or out-of-range values', () => {
    expect(safeFormatDate('2026-10-21')).toBe('21 Oct 2026');
    expect(safeFormatDate(HOTFIX_BAD_DATE_ISO)).toBe(SAFE_DATE_FALLBACK);
    expect(safeFormatDate('not a date')).toBe(SAFE_DATE_FALLBACK);
    expect(safeFormatDate(null)).toBe(SAFE_DATE_FALLBACK);
    expect(safeFormatDate(undefined)).toBe(SAFE_DATE_FALLBACK);
    expect(safeFormatDate(new Date(NaN))).toBe(SAFE_DATE_FALLBACK);
    expect(safeFormatDate(new Date(212026, 1, 11))).toBe(SAFE_DATE_FALLBACK);
    expect(safeFormatDate('2026-10-21', 'dd/MM/yyyy')).toBe('21/10/2026');
    expect(safeFormatDate('2026-09-08T09:15:30.000Z', 'd MMM yyyy · HH:mm')).toMatch(/Sep 2026 · /);
    expect(safeLocaleDateString(HOTFIX_BAD_DATE_ISO, 'en-AU')).toBe(SAFE_DATE_FALLBACK);
    expect(safeToIsoString(HOTFIX_BAD_DATE_ISO)).toBeNull();
    expect(safeToIsoString('2026-10-21')).toMatch(/^2026-10-2[01]T/);
  });

  it('does not read non-ISO strings in US order', () => {
    expect(safeFormatDate('03/04/2026')).toBe(SAFE_DATE_FALLBACK);
    expect(parseToDate('03/04/2026')).toBeNull();
    expect(safeFormatDate('04-03-2026')).toBe(SAFE_DATE_FALLBACK);
    expect(safeFormatDate('10/21/2026')).toBe(SAFE_DATE_FALLBACK);
  });
});

describe('year guard at save', () => {
  it('rejects year 212026 before save and uses a required message when empty', () => {
    expect(dateFieldYearError(HOTFIX_BAD_DATE_ISO, true)).toBe(DATE_YEAR_RANGE_MESSAGE);
    expect(dateFieldYearError('212026-10-21')).toBe(DATE_YEAR_RANGE_MESSAGE);
    expect(dateFieldYearError('2026-10-21')).toBeNull();
    expect(dateFieldYearError('', true)).toBe(DATE_REQUIRED_MESSAGE);
    expect(dateFieldYearError('', false)).toBeNull();
    expect(dateFieldYearError('1899-12-31')).toBe(DATE_YEAR_RANGE_MESSAGE);
    expect(dateFieldYearError('1900-01-01')).toBeNull();
    expect(dateFieldYearError('2100-12-31')).toBeNull();
    expect(dateFieldYearError('2101-01-01')).toBe(DATE_YEAR_RANGE_MESSAGE);
  });
});
