import { describe, expect, it } from 'vitest';
import { clock, dateKey, daysBetween, endOfDay, headingDate, shiftKey, startOfDay } from '../src/time';

const TZ = 'Australia/Perth'; // UTC+8, no daylight saving

describe('time', () => {
  it('keys the local calendar day, not the UTC one', () => {
    // 21:30 UTC on the 10th is 05:30 on the 11th in Perth
    expect(dateKey(new Date('2026-09-10T21:30:00Z'), TZ)).toBe('2026-09-11');
    expect(dateKey(new Date('2026-09-10T21:30:00Z'), 'UTC')).toBe('2026-09-10');
  });

  it('shifts and measures keys', () => {
    expect(shiftKey('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftKey('2026-12-31', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-09-05', '2026-09-11')).toBe(6);
  });

  it('bounds the local day as instants', () => {
    expect(startOfDay('2026-09-11', TZ).toISOString()).toBe('2026-09-10T16:00:00.000Z');
    expect(endOfDay('2026-09-11', TZ).toISOString()).toBe('2026-09-11T16:00:00.000Z');
  });

  it('writes the heading and the clock the way a person would', () => {
    expect(headingDate('2026-09-11', TZ)).toBe('Friday 11 September');
    expect(clock('2026-09-10T23:30:00Z', TZ)).toBe('7:30am');
    expect(clock('2026-09-11T06:00:00Z', TZ)).toBe('2:00pm');
  });

  it('handles daylight saving zones', () => {
    // Sydney is UTC+10 in September (AEST)
    expect(dateKey(new Date('2026-09-10T14:30:00Z'), 'Australia/Sydney')).toBe('2026-09-11');
    expect(startOfDay('2026-09-11', 'Australia/Sydney').toISOString()).toBe('2026-09-10T14:00:00.000Z');
  });
});
