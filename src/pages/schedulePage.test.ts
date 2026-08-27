import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('schedule page week/day board', () => {
  it('defaults to the week, keeps day as a toggle, and stays on /schedule', () => {
    const page = src('src/pages/SchedulePage.tsx');
    expect(page).toContain("parseScheduleView(searchParams.get('view'))");
    expect(page).toContain('PhoneWeekList');
    expect(page).toContain('PhoneDayList');
    expect(page).toContain('data-schedule-view={viewMode}');
    expect(page).toContain("setView('day')");
    expect(page).not.toContain('hidden lg:flex ops-seg');
    expect(page).not.toContain("useState<ViewMode>('day')");
    expect(page).toContain('hydrateJobParentNumbers(attachJobClients(jobs, [...clientMap.values()]))');
  });

  it('opens the existing job page from the board, tray, and search', () => {
    const page = src('src/pages/SchedulePage.tsx');
    const board = src('src/components/crm/BoardViews.tsx');
    const search = src('src/components/crm/ScheduleJobSearch.tsx');
    expect(page).toContain('scheduleJobHref');
    expect(page).toContain('onOpenJob={job => openJob(job.id)}');
    expect(page).toContain('onJobClick={job => openJob(job.id)}');
    expect(board).toContain('data-schedule-job={job.id}');
    expect(board).toContain('scheduleWeekColumns');
    expect(board).toContain('onClick={() => onJobClick(job)}');
    expect(search).toContain('href={scheduleJobHref(job.id)}');
    expect(search).toContain('data-schedule-open-job={job.id}');
  });

  it('groups the phone week from existing scheduled_date fields', () => {
    const board = src('src/components/crm/BoardViews.tsx');
    expect(board).toContain('export const PhoneWeekList');
    expect(board).toContain('scheduleWeekColumns(jobs, currentDate)');
    expect(board).toContain('data-schedule-week="1"');
    expect(board).toContain('onSelectDay');
    expect(board).toContain('jobsOnScheduleDay');
    expect(board).toContain('filterJobsByCrew');
  });
});
