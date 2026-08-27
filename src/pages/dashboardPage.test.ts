import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('signed-in dashboard today floor', () => {
  it('lands on today\'s work from existing job/schedule fields', () => {
    const page = src('src/pages/DashboardPage.tsx');
    expect(page).toContain('todaysDashboardJobs');
    expect(page).toContain('dashboardTodayKey');
    expect(page).toContain("queryKey: ['dashboard-today-jobs', todayKey]");
    expect(page).toContain('.gte(\'scheduled_date\', todayKey)');
    expect(page).toContain('.lte(\'scheduled_date\', todayKey)');
    expect(page).toContain(".eq('status', 'in_progress')");
    expect(page).toContain('getAuditJobs()');
    expect(page).toContain('attachJobClients');
    expect(page).toContain('data-dashboard-home="1"');
    expect(page).toContain("Today&apos;s work");
    expect(page).not.toContain('Your dashboard is empty');
  });

  it('opens the existing job page from a today row', () => {
    const page = src('src/pages/DashboardPage.tsx');
    expect(page).toContain('dashboardJobHref');
    expect(page).toContain('to={dashboardJobHref(job.id)}');
    expect(page).toContain('data-dashboard-job={job.id}');
    expect(page).toContain('formatJobRef(job)');
    expect(page).toContain('dashboardClockLabel(job.start_time, job.end_time)');
    expect(page).not.toContain('to="/schedule"\n              className="flex items-center gap-2 px-1.5');
  });

  it('stays on / and does not invent an inbox, feed, or dashboard module', () => {
    const page = src('src/pages/DashboardPage.tsx');
    const root = src('src/pages/RootPage.tsx');
    const app = src('src/App.tsx');
    expect(root).toContain('DashboardPage');
    expect(app).toContain('path="/" element={<RootPage />}');
    expect(app).toContain('path="/jobs/:id"');
    expect(page).not.toMatch(/inbox|notification|activity feed/i);
    expect(page).not.toContain('Take5ListPage');
    expect(page).not.toContain('JhaDocumentsPage');
    expect(page).not.toContain('InspectionsPage');
    expect(page).not.toContain('ClientsPage');
    expect(page).not.toContain('ClientDetailPage');
    expect(page).not.toContain('SchedulePage');
    expect(page).not.toContain('JobsPage');
    expect(page).not.toContain('JobDetailPage');
    expect(page).not.toContain('BoardViews');
    expect(page).not.toContain('ScheduleJobSearch');
  });

  it('still reports a load miss instead of an empty run sheet', () => {
    const page = src('src/pages/DashboardPage.tsx');
    expect(page).toContain('pageQueryBlocked(error)');
    expect(page).toContain('pageQueryBlocked(jobsError)');
    expect(page).toContain('getAuditDashboardWidgets');
  });
});
