import { describe, expect, it } from 'vitest';
import { jobsListPhoneRow } from './jobsListRow';
import { JOB_CREW_SCHEDULE_NO_DATE, jobCrewScheduleStatus } from './jobCrewScheduleStatus';
import { assignedTeamIds, countNeedsCrew, isFinishedCrewStatus, needsCrew } from './needCrew';

describe('needsCrew', () => {
  it('requires crew only for unfinished scheduled or in-progress jobs with no assigned member', () => {
    expect(needsCrew({ status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(true);
    expect(needsCrew({ status: 'in_progress', scheduled_date: '2026-10-19', assigned_team: [''] })).toBe(true);
    expect(needsCrew({ status: 'scheduled', scheduled_date: null, assigned_team: [] })).toBe(false);
    expect(needsCrew({ status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: ['crew-1'] })).toBe(false);
    expect(needsCrew({ status: 'in_progress', scheduled_date: '2026-10-19', assigned_team: ['crew-1'] })).toBe(false);
    expect(needsCrew({ status: 'completed', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(false);
    expect(needsCrew({ status: 'cancelled', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(false);
  });

  it('kills an undated crewless job from needsCrew and the dashboard/jobs need-crew count', () => {
    const undatedScheduled = { status: 'scheduled' as const, scheduled_date: null, assigned_team: [] as string[] };
    const undatedProgress = { status: 'in_progress' as const, scheduled_date: '', assigned_team: [] as string[] };
    expect(needsCrew(undatedScheduled)).toBe(false);
    expect(needsCrew(undatedProgress)).toBe(false);
    expect(jobCrewScheduleStatus(undatedScheduled.status, undatedScheduled.scheduled_date, undatedScheduled.assigned_team)).toEqual({
      label: JOB_CREW_SCHEDULE_NO_DATE,
      kind: 'no_date',
    });
    expect(jobCrewScheduleStatus(undatedProgress.status, undatedProgress.scheduled_date, undatedProgress.assigned_team)).toEqual({
      label: JOB_CREW_SCHEDULE_NO_DATE,
      kind: 'no_date',
    });
    expect(jobsListPhoneRow({
      title: 'Undated switchboard',
      job_number: 40,
      status: 'scheduled',
      scheduled_date: null,
      assigned_team: [],
    }).status).toBe(JOB_CREW_SCHEDULE_NO_DATE);
    expect(jobsListPhoneRow({
      title: 'Undated on site',
      job_number: 41,
      status: 'in_progress',
      scheduled_date: '',
      assigned_team: [],
    }).status).toBe(JOB_CREW_SCHEDULE_NO_DATE);
  });

  it('counts only dated crewless jobs', () => {
    const undatedScheduled = { status: 'scheduled' as const, scheduled_date: null, assigned_team: [] as string[] };
    const undatedProgress = { status: 'in_progress' as const, scheduled_date: '', assigned_team: [] as string[] };
    const datedOpen = { status: 'scheduled' as const, scheduled_date: '2026-10-19', assigned_team: [] as string[] };
    expect(countNeedsCrew([undatedScheduled, undatedProgress, datedOpen])).toBe(1);
  });

  it('treats null, a non-array, a non-string entry, and whitespace-only as no crew', () => {
    const dated = { status: 'scheduled' as const, scheduled_date: '2026-10-19' };
    expect(assignedTeamIds(null)).toEqual([]);
    expect(assignedTeamIds('dave')).toEqual([]);
    expect(assignedTeamIds([1])).toEqual([]);
    expect(assignedTeamIds(['   '])).toEqual([]);
    expect(needsCrew({ ...dated, assigned_team: null })).toBe(true);
    expect(needsCrew({ ...dated, assigned_team: 'dave' })).toBe(true);
    expect(needsCrew({ ...dated, assigned_team: [1] })).toBe(true);
    expect(needsCrew({ ...dated, assigned_team: ['   '] })).toBe(true);
    expect(countNeedsCrew([
      { ...dated, assigned_team: null },
      { ...dated, assigned_team: 'dave' },
      { ...dated, assigned_team: [1] },
      { ...dated, assigned_team: ['   '] },
    ])).toBe(4);
  });

  it('mutant: restoring the assigned_team throw throws on a non-array', () => {
    function needsCrewThrowing(job: { status?: string | null; scheduled_date?: string | null; assigned_team?: unknown }): boolean {
      if (!(job.scheduled_date ?? '').trim()) return false;
      if (isFinishedCrewStatus(job.status)) return false;
      return (job.assigned_team ?? []).every((id: { trim?: () => string }) => !id?.trim());
    }
    expect(() => needsCrewThrowing({
      status: 'scheduled',
      scheduled_date: '2026-10-19',
      assigned_team: 'dave',
    })).toThrow();
    expect(() => needsCrew({
      status: 'scheduled',
      scheduled_date: '2026-10-19',
      assigned_team: 'dave',
    })).not.toThrow();
  });
});
