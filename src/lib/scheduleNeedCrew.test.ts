import { describe, expect, it } from 'vitest';
import { isNeedCrewJob } from './scheduleNeedCrew';

describe('isNeedCrewJob', () => {
  it('counts only dated crewless jobs that are not Done, completed, or cancelled', () => {
    expect(isNeedCrewJob({ status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(true);
    expect(isNeedCrewJob({ status: 'in_progress', scheduled_date: '2026-10-19', assigned_team: null })).toBe(true);
    expect(isNeedCrewJob({ status: 'unknown', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(true);
    expect(isNeedCrewJob({ status: 'scheduled', scheduled_date: null, assigned_team: [] })).toBe(false);
    expect(isNeedCrewJob({ status: 'in_progress', scheduled_date: '', assigned_team: [] })).toBe(false);
    expect(isNeedCrewJob({ status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: ['crew-1'] })).toBe(false);
    expect(isNeedCrewJob({ status: 'completed', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(false);
    expect(isNeedCrewJob({ status: 'Done', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(false);
    expect(isNeedCrewJob({ status: 'cancelled', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(false);
    expect(isNeedCrewJob({ status: 'quoted', scheduled_date: '2026-10-22', assigned_team: [] })).toBe(true);
    expect(isNeedCrewJob({ status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: [' '] })).toBe(true);
    expect(() => isNeedCrewJob({ status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: 'crew-1' })).not.toThrow();
    expect(isNeedCrewJob({ status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: 'crew-1' })).toBe(true);
    expect(() => isNeedCrewJob({ status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: { id: 'x' } })).not.toThrow();
    expect(isNeedCrewJob({ status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: { id: 'x' } })).toBe(true);
  });

  it('drops an undated in_progress crewless job from a one-plus-one pair', () => {
    const undatedProgress = { status: 'in_progress', scheduled_date: null, assigned_team: [] };
    const datedOpen = { status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: [] };
    expect([undatedProgress, datedOpen].filter(isNeedCrewJob)).toEqual([datedOpen]);
  });
});
