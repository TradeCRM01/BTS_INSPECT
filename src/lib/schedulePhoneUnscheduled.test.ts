import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PHONE_SCHEDULE_SECTION_ORDER,
  PHONE_UNSCHEDULED_EXPANDED_DEFAULT,
  phoneUnscheduledChipLabel,
} from './schedulePhoneUnscheduled';

describe('schedule phone unscheduled chip', () => {
  it('keeps the chip outside the scrolling week agenda', () => {
    const board = readFileSync(resolve(process.cwd(), 'src/components/crm/BoardViews.tsx'), 'utf8');
    const phoneWeek = board.slice(
      board.indexOf('export const PhoneWeekList'),
      board.indexOf('// ── Day Board View'),
    );
    expect(phoneWeek).toContain('hub-phone-week-list');
    expect(phoneWeek).toContain('data-week-agenda="1"');
    expect(phoneWeek.indexOf('hub-phone-unscheduled-footer')).toBeGreaterThan(
      phoneWeek.indexOf('data-week-agenda="1"'),
    );
  });

  it('labels the chip with count', () => {
    expect(phoneUnscheduledChipLabel(17)).toBe('Unscheduled · 17');
    expect(phoneUnscheduledChipLabel(0)).toBe('Unscheduled · 0');
  });

  it('starts collapsed on phone', () => {
    expect(PHONE_UNSCHEDULED_EXPANDED_DEFAULT).toBe(false);
  });

  it('lists booked before unscheduled on phone', () => {
    expect(PHONE_SCHEDULE_SECTION_ORDER).toEqual(['booked', 'unscheduled']);
  });
});
