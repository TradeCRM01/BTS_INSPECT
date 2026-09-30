import { describe, expect, it } from 'vitest';
import { bookingIntervalIssue } from './booking';

describe('bookingIntervalIssue', () => {
  it('allows empty clocks and a real interval', () => {
    expect(bookingIntervalIssue(null, null)).toBeNull();
    expect(bookingIntervalIssue('08:00', '09:00')).toBeNull();
  });

  it('rejects one clock or overnight', () => {
    expect(bookingIntervalIssue('08:00', null)).toMatch(/both start and end/);
    expect(bookingIntervalIssue('16:00', '08:00')).toMatch(/Overnight/);
  });
});
