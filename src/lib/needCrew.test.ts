import { describe, expect, it } from 'vitest';
import { countJobsNeedCrew, jobNeedsCrew, jobsNeedCrewWhisper, withNeedCrewWhisper } from './needCrew';

describe('jobNeedsCrew', () => {
  it('flags scheduled or in-progress jobs with no crew, and never Done or cancelled', () => {
    expect(jobNeedsCrew({ status: 'scheduled', assigned_team: [] })).toBe(true);
    expect(jobNeedsCrew({ status: 'scheduled', assigned_team: ['a'] })).toBe(false);
    expect(jobNeedsCrew({ status: 'in_progress', assigned_team: [] })).toBe(true);
    expect(jobNeedsCrew({ status: 'in_progress', assigned_team: ['a'] })).toBe(false);
    expect(jobNeedsCrew({ status: 'completed', assigned_team: [] })).toBe(false);
    expect(jobNeedsCrew({ status: 'cancelled', assigned_team: [] })).toBe(false);
    expect(jobNeedsCrew({ status: 'scheduled', assigned_team: ['', '  '] })).toBe(true);
  });

  it('counts need-crew rows and builds the whisper', () => {
    const jobs = [
      { status: 'scheduled', assigned_team: [] },
      { status: 'scheduled', assigned_team: ['a'] },
      { status: 'in_progress', assigned_team: [] },
      { status: 'completed', assigned_team: [] },
    ];
    expect(countJobsNeedCrew(jobs)).toBe(2);
    expect(jobsNeedCrewWhisper(0)).toBe('');
    expect(jobsNeedCrewWhisper(1)).toBe('1 need crew');
    expect(withNeedCrewWhisper('All · 4 jobs', 1)).toBe('All · 4 jobs · 1 need crew');
    expect(withNeedCrewWhisper('All · 4 jobs', 0)).toBe('All · 4 jobs');
  });
});
