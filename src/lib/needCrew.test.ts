import { describe, expect, it } from 'vitest';
import { needsCrew } from './needCrew';

describe('needsCrew', () => {
  it('requires crew only for unfinished scheduled or in-progress jobs with no assigned member', () => {
    expect(needsCrew({ status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(true);
    expect(needsCrew({ status: 'in_progress', scheduled_date: '2026-10-19', assigned_team: [''] })).toBe(true);
    expect(needsCrew({ status: 'scheduled', scheduled_date: null, assigned_team: [] })).toBe(true);
    expect(needsCrew({ status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: ['crew-1'] })).toBe(false);
    expect(needsCrew({ status: 'in_progress', scheduled_date: '2026-10-19', assigned_team: ['crew-1'] })).toBe(false);
    expect(needsCrew({ status: 'completed', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(false);
    expect(needsCrew({ status: 'cancelled', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(false);
  });
});
