import { describe, expect, it } from 'vitest';
import { selectedHoursMemberId } from './StaffHoursPanel';

describe('selectedHoursMemberId', () => {
  const jack = { id: 'jack' };
  const member = { id: 'm6' };

  it('uses the first member when the panel mounted before the team loaded', () => {
    expect(selectedHoursMemberId([], '')).toBe('');
    expect(selectedHoursMemberId([jack, member], '')).toBe('jack');
  });

  it('keeps an explicit selection that is still on the team', () => {
    expect(selectedHoursMemberId([jack, member], 'm6')).toBe('m6');
  });

  it('falls back if the selected person is no longer listed', () => {
    expect(selectedHoursMemberId([jack], 'gone')).toBe('jack');
  });
});
