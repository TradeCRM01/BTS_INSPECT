import { describe, expect, it } from 'vitest';
import {
  DATE_YEAR_MAX as appMax,
  DATE_YEAR_MIN as appMin,
  isSupportedDateYear as appYear,
} from './safeDate';
import {
  DATE_YEAR_MAX as edgeMax,
  DATE_YEAR_MIN as edgeMin,
  isAcceptableDueDate,
  isSupportedDateYear as edgeYear,
} from '../../supabase/functions/_shared/safeDate.ts';

describe('shared date year window', () => {
  it('pins the app and edge copies to the same 1900-2100 bounds', () => {
    expect(appMin).toBe(1900);
    expect(appMax).toBe(2100);
    expect(edgeMin).toBe(appMin);
    expect(edgeMax).toBe(appMax);
    expect(appYear(1899)).toBe(false);
    expect(edgeYear(1899)).toBe(false);
    expect(appYear(1900)).toBe(true);
    expect(edgeYear(1900)).toBe(true);
    expect(appYear(2100)).toBe(true);
    expect(edgeYear(2100)).toBe(true);
    expect(appYear(2101)).toBe(false);
    expect(edgeYear(2101)).toBe(false);
    expect(isAcceptableDueDate('2027-01-01')).toBe(true);
    expect(isAcceptableDueDate('212026-02-11')).toBe(false);
    expect(isAcceptableDueDate('0026-02-11')).toBe(false);
    expect(isAcceptableDueDate('1899-12-31')).toBe(false);
    expect(isAcceptableDueDate('2101-01-01')).toBe(false);
    expect(isAcceptableDueDate('2027-02-30')).toBe(false);
    expect(isAcceptableDueDate('2027-13-01')).toBe(false);
    expect(isAcceptableDueDate('1900-01-01')).toBe(true);
    expect(isAcceptableDueDate('2100-12-31')).toBe(true);
  });
});
