import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { jobsListPhoneRow } from './jobsListRow';
import { JOB_CREW_SCHEDULE_NO_DATE, jobCrewScheduleStatus } from './jobCrewScheduleStatus';
import { assignedTeamIds, countNeedsCrew, needsCrew } from './needCrew';

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

  it('treats a missing job as not needing crew and skips it in counts', () => {
    expect(needsCrew(null)).toBe(false);
    expect(needsCrew(undefined)).toBe(false);
    expect(() => needsCrew(null)).not.toThrow();
    expect(() => needsCrew(undefined)).not.toThrow();
    expect(() => countNeedsCrew([null])).not.toThrow();
    expect(countNeedsCrew([null])).toBe(0);
    expect(countNeedsCrew([undefined])).toBe(0);
    expect(countNeedsCrew([
      null,
      undefined,
      { status: 'scheduled', scheduled_date: '2026-10-19', assigned_team: [] },
    ])).toBe(1);
  });

  it('returns 0 for a missing jobs array and kills a mutant that drops the guard', async () => {
    expect(countNeedsCrew(null)).toBe(0);
    expect(countNeedsCrew(undefined)).toBe(0);
    expect(() => countNeedsCrew(null)).not.toThrow();
    expect(() => countNeedsCrew(undefined)).not.toThrow();
    const srcPath = join(process.cwd(), 'src/lib/needCrew.ts');
    const orig = readFileSync(srcPath, 'utf8');
    const guard = 'if (!jobs) return 0;';
    expect(orig).toContain(guard);
    const dir = mkdtempSync(join(tmpdir(), 'need-crew-null-'));
    const mutantPath = join(dir, 'needCrew.ts');
    writeFileSync(mutantPath, orig.replace(guard, ''));
    const outPath = join(dir, 'needCrew.js');
    execSync(`npx esbuild ${mutantPath} --bundle --format=esm --platform=neutral --outfile=${outPath}`, {
      cwd: process.cwd(),
      stdio: 'pipe',
    });
    const mutant = await import(pathToFileURL(outPath).href) as {
      countNeedsCrew: (jobs: unknown) => number;
    };
    expect(() => mutant.countNeedsCrew(null)).toThrow();
    expect(() => mutant.countNeedsCrew(undefined)).toThrow();
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

  it('treats a non-string scheduled_date as no date and never throws', () => {
    expect(needsCrew({ status: 'scheduled', scheduled_date: 20261019, assigned_team: [] })).toBe(false);
    expect(needsCrew({ status: 'scheduled', scheduled_date: { d: '2026-10-19' }, assigned_team: [] })).toBe(false);
    expect(() => needsCrew({ status: 'scheduled', scheduled_date: 20261019, assigned_team: [] })).not.toThrow();
  });
});
