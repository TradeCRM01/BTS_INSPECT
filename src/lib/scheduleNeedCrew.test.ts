import { describe, expect, it } from 'vitest';
import { isNeedCrewJob } from './scheduleNeedCrew';

describe('isNeedCrewJob', () => {
  it('counts only open no-crew scheduled or in-progress jobs', () => {
    expect(isNeedCrewJob({ status: 'scheduled', assigned_team: [] })).toBe(true);
    expect(isNeedCrewJob({ status: 'in_progress', assigned_team: null })).toBe(true);
    expect(isNeedCrewJob({ status: 'scheduled', assigned_team: ['crew-1'] })).toBe(false);
    expect(isNeedCrewJob({ status: 'completed', assigned_team: [] })).toBe(false);
    expect(isNeedCrewJob({ status: 'cancelled', assigned_team: [] })).toBe(false);
  });
});
