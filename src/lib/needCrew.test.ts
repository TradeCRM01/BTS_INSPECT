import { describe, expect, it } from 'vitest';
import { countJobsNeedCrew, jobNeedsCrew, jobsNeedCrewWhisper, withNeedCrewWhisper } from './needCrew';

describe('jobNeedsCrew', () => {
  it('needs a date, no crew, and a status that is not Done or cancelled', () => {
    expect(jobNeedsCrew({ status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(true);
    expect(jobNeedsCrew({ status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: ['a'] })).toBe(false);
    expect(jobNeedsCrew({ status: 'in_progress', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(true);
    expect(jobNeedsCrew({ status: 'in_progress', scheduled_date: '2026-10-19', assigned_team: ['a'] })).toBe(false);
    expect(jobNeedsCrew({ status: 'completed', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(false);
    expect(jobNeedsCrew({ status: 'done', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(false);
    expect(jobNeedsCrew({ status: 'cancelled', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(false);
    expect(jobNeedsCrew({ status: 'scheduled', assigned_team: ['', '  '], scheduled_date: '2026-10-19' })).toBe(true);
    expect(jobNeedsCrew({ status: 'unknown', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(true);
  });

  it('never throws and treats a malformed assigned_team as no crew', () => {
    const dated = { status: 'scheduled', scheduled_date: '2026-10-19' };
    const malformed = [
      { foo: 1 },
      'dean',
      12,
      [1, { id: 'x' }],
      { 0: 'p3-dean' },
    ];
    for (const assigned_team of malformed) {
      expect(() => jobNeedsCrew({ ...dated, assigned_team })).not.toThrow();
      expect(jobNeedsCrew({ ...dated, assigned_team })).toBe(true);
    }
    expect(jobNeedsCrew({ ...dated, assigned_team: null })).toBe(true);
    expect(jobNeedsCrew({ status: 'scheduled', assigned_team: { foo: 1 } })).toBe(false);
  });

  it('never counts an undated job, even when crewless', () => {
    expect(jobNeedsCrew({ status: 'scheduled', scheduled_date: null, assigned_team: [] })).toBe(false);
    expect(jobNeedsCrew({ status: 'scheduled', scheduled_date: '', assigned_team: [] })).toBe(false);
    expect(jobNeedsCrew({ status: 'in_progress', assigned_team: [] })).toBe(false);
    expect(countJobsNeedCrew([
      { status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: [] },
      { status: 'scheduled', scheduled_date: null, assigned_team: [] },
      { status: 'scheduled', assigned_team: ['a'] },
      { status: 'completed', scheduled_date: '2026-10-19', assigned_team: [] },
    ])).toBe(1);
  });

  it('counts need-crew rows and builds the whisper', () => {
    const jobs = [
      { status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: [] },
      { status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: ['a'] },
      { status: 'in_progress', scheduled_date: '2026-10-19', assigned_team: [] },
      { status: 'completed', scheduled_date: '2026-10-19', assigned_team: [] },
    ];
    expect(countJobsNeedCrew(jobs)).toBe(2);
    expect(jobsNeedCrewWhisper(0)).toBe('');
    expect(jobsNeedCrewWhisper(1)).toBe('1 need crew');
    expect(withNeedCrewWhisper('All · 12 jobs', 1)).toBe('All · 12 jobs · 1 need crew');
    expect(withNeedCrewWhisper('All · 4 jobs', 0)).toBe('All · 4 jobs');
  });
});
