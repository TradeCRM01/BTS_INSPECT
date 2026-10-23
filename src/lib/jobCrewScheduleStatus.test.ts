import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
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
});

describe('three surfaces use shared crew schedule copy', () => {
  it('wires overview, jobs list phone status, and dashboard today meta', () => {
    const tabs = readFileSync(resolve(process.cwd(), 'src/lib/jobSheetTabs.ts'), 'utf8');
    const jobsRow = readFileSync(resolve(process.cwd(), 'src/lib/jobsListRow.ts'), 'utf8');
    const jobsPage = readFileSync(resolve(process.cwd(), 'src/pages/JobsPage.tsx'), 'utf8');
    const dash = readFileSync(resolve(process.cwd(), 'src/pages/DashboardPage.tsx'), 'utf8');
    expect(tabs).toContain('jobCrewScheduleStatus');
    expect(jobsRow).toContain('jobCrewScheduleStatus');
    expect(jobsPage).toContain('row.statusClass');
    expect(dash).toContain('jobCrewScheduleStatus');
    expect(tabs).toContain('jobCrewScheduleOverviewTone');
  });
});
