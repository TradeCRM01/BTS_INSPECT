import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { needsCrew } from './needCrew';
import {
  JOB_CREW_SCHEDULE_BOOKED,
  JOB_CREW_SCHEDULE_DONE,
  JOB_CREW_SCHEDULE_NEEDS_CREW,
  JOB_CREW_SCHEDULE_NO_DATE,
  jobCrewScheduleStatus,
} from './jobCrewScheduleStatus';

describe('jobCrewScheduleStatus', () => {
  it('returns No date without a date', () => {
    expect(jobCrewScheduleStatus('scheduled', null, ['p1'])).toEqual({
      label: JOB_CREW_SCHEDULE_NO_DATE,
      kind: 'no_date',
    });
    expect(jobCrewScheduleStatus('scheduled', '', [])).toMatchObject({ kind: 'no_date' });
  });

  it('returns Booked when dated with crew', () => {
    expect(jobCrewScheduleStatus('scheduled', '2026-09-03', ['a'])).toEqual({
      label: JOB_CREW_SCHEDULE_BOOKED,
      kind: 'booked',
    });
  });

  it('returns Needs crew when dated with no crew', () => {
    expect(jobCrewScheduleStatus('scheduled', '2026-09-03', [])).toEqual({
      label: JOB_CREW_SCHEDULE_NEEDS_CREW,
      kind: 'needs_crew',
    });
    expect(jobCrewScheduleStatus('in_progress', '2026-09-03', null)).toMatchObject({ kind: 'needs_crew' });
  });

  it('returns Done for completed jobs even when they have no crew', () => {
    expect(jobCrewScheduleStatus('completed', '2026-09-03', [])).toEqual({
      label: JOB_CREW_SCHEDULE_DONE,
      kind: 'done',
    });
  });

  it('kills an unknown dated job with no crew falling through to Booked', () => {
    const status = jobCrewScheduleStatus('on_hold', '2026-10-19', []);
    expect(status).toEqual({
      label: JOB_CREW_SCHEDULE_NEEDS_CREW,
      kind: 'needs_crew',
    });
    expect(status.kind).not.toBe('booked');
    expect(status.label).not.toBe('Scheduled');
    expect(needsCrew({ status: 'on_hold', scheduled_date: '2026-10-19', assigned_team: [] })).toBe(true);
  });

  it('kills an unknown dated job with crew falling through to Booked or Scheduled', () => {
    const status = jobCrewScheduleStatus('quoted', '2026-10-19', ['dave']);
    expect(status).toEqual({
      label: 'Quoted',
      kind: 'unknown',
    });
    expect(status.label).not.toBe(JOB_CREW_SCHEDULE_BOOKED);
    expect(status.label).not.toBe('Scheduled');
  });

  it('kills awaiting_parts + crew as Awaiting parts, and awaiting_parts crewless as Needs crew', () => {
    expect(jobCrewScheduleStatus('awaiting_parts', '2026-10-19', ['dave'])).toEqual({
      label: 'Awaiting parts',
      kind: 'unknown',
    });
    expect(jobCrewScheduleStatus('awaiting_parts', '2026-10-19', [])).toEqual({
      label: JOB_CREW_SCHEDULE_NEEDS_CREW,
      kind: 'needs_crew',
    });
  });
});

describe('three surfaces use shared crew schedule copy', () => {
  it('wires overview, jobs list phone status, and dashboard today meta', () => {
    const tabs = readFileSync(resolve(process.cwd(), 'src/lib/jobSheetTabs.ts'), 'utf8');
    const jobsRow = readFileSync(resolve(process.cwd(), 'src/lib/jobsListRow.ts'), 'utf8');
    const jobsPage = readFileSync(resolve(process.cwd(), 'src/pages/JobsPage.tsx'), 'utf8');
    const today = readFileSync(resolve(process.cwd(), 'src/lib/todayLayout.ts'), 'utf8');
    expect(tabs).toContain('jobCrewScheduleStatus');
    expect(jobsRow).toContain('jobCrewScheduleStatus');
    expect(jobsPage).toContain('row.statusClass');
    expect(today).toContain('jobCrewScheduleStatus');
    expect(tabs).toContain('jobCrewScheduleOverviewTone');
  });
});
