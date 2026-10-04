import { describe, expect, it } from 'vitest';
import {
  scheduleLocationStep,
  scheduleSearchFromState,
  scheduleStateFromSearch,
} from './scheduleLocation';

describe('schedule date/view location', () => {
  it('lets paging, Today, and the day toggle write once without a follow-up write effect', () => {
    const week = new URLSearchParams('date=2026-09-30');
    const day = scheduleSearchFromState(week, 'day', new Date('2026-09-30T00:00:00'));
    expect(day.get('view')).toBe('day');
    expect(day.get('date')).toBe('2026-09-30');

    const today = scheduleSearchFromState(day, 'day', new Date('2026-10-01T00:00:00'));
    expect(today.get('date')).toBe('2026-10-01');
    expect(today.get('view')).toBe('day');

    const backToWeek = scheduleSearchFromState(today, 'week', new Date('2026-10-01T00:00:00'));
    expect(backToWeek.get('view')).toBeNull();
    expect(backToWeek.get('date')).toBe('2026-10-01');

    const user = scheduleLocationStep({
      kind: 'user',
      currentSearch: week.toString(),
      mode: 'day',
      date: new Date('2026-09-30T00:00:00'),
      urlDate: '2026-09-30',
      missingDate: false,
    });
    expect(user.write).toBe(true);
    expect(user.readDate).toBe(false);
  });

  it('hydrates a missing date once and treats Back/Forward as read-only', () => {
    const hydrate = scheduleLocationStep({
      kind: 'hydrate',
      currentSearch: 'view=day',
      mode: 'day',
      date: new Date('2026-09-30T00:00:00'),
      urlDate: null,
      missingDate: true,
    });
    expect(hydrate.write).toBe(true);
    expect(hydrate.replace).toBe(true);

    const pop = scheduleLocationStep({
      kind: 'popstate',
      currentSearch: 'date=2026-09-21&view=day',
      mode: 'week',
      date: new Date('2026-09-30T00:00:00'),
      urlDate: '2026-09-21',
      missingDate: false,
    });
    expect(pop.write).toBe(false);
    expect(pop.readDate).toBe(true);

    const fromLink = scheduleStateFromSearch(new URLSearchParams('date=2026-09-21&view=day'));
    expect(fromLink.view).toBe('day');
    expect(fromLink.date && fromLink.date.getDate()).toBe(21);
    expect(fromLink.date && fromLink.date.getMonth()).toBe(8);
  });
});
