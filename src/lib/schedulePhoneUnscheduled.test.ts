import { describe, expect, it } from 'vitest';
import {
  PHONE_SCHEDULE_SECTION_ORDER,
  PHONE_UNSCHEDULED_EXPANDED_DEFAULT,
  phoneUnscheduledChipLabel,
} from './schedulePhoneUnscheduled';

describe('schedule phone unscheduled chip', () => {
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
