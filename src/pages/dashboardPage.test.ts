import { existsSync, readFileSync } from 'node:fs';
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

describe('signed-in dashboard cream paper look', () => {
  it('paints today\'s work as cream paper rows, not poster cards', () => {
    const page = src('src/pages/DashboardPage.tsx');
    const css = src('src/index.css');
    const homeStart = css.indexOf('/* Signed-in home / only.');
    const homeEnd = css.indexOf('/* Accounting settings only.', homeStart);
    const homeCss = css.slice(homeStart, homeEnd);

    expect(page).toContain('dashboard-home');
    expect(page).toContain('dashboard-home-sheet');
    expect(page).toContain('dashboard-home-row');
    expect(page).toContain('dashboard-home-pill');
    expect(page).toContain('dashboard-home-next');
    expect(page).toContain('dashboardJobPlace(job)');
    expect(page).toContain('Time');
    expect(page).toContain('Client');
    expect(page).toContain('Suburb');
    expect(page).toContain('Crew');
    expect(page).toContain('Status');
    expect(page).not.toContain('hub-jobs');
    expect(page).not.toContain('hub-quotes');
    expect(page).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(page).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(homeCss).toContain('.dashboard-home.ops-page');
    expect(homeCss).toContain('--dashboard-home-page: #F5F0E6');
    expect(homeCss).toContain('--dashboard-home-sheet: #FFFDF8');
    expect(homeCss).toContain('--dashboard-home-ink: #0A2540');
    expect(homeCss).toContain('--dashboard-home-muted: #5B6B7C');
    expect(homeCss).toContain('--dashboard-home-line: #E2D9CC');
    expect(homeCss).toContain('#2E75B6');
    expect(homeCss).toContain("font-family: Rajdhani, sans-serif");
    expect(homeCss).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(homeCss).toContain('letter-spacing: 0.12em');
    expect(homeCss).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(homeCss).not.toMatch(/font-family:\s*ui-monospace|JetBrains Mono/);
  });

  it('does not restyle Take 5, JHA, inspections, jobs, schedule, login, or AppShell', () => {
    const page = src('src/pages/DashboardPage.tsx');
    expect(page).toContain('to="/schedule"');
    expect(page).toContain('Nothing on today');
    expect(page).not.toContain('Take5ListPage');
    expect(page).not.toContain('JhaDocumentsPage');
    expect(page).not.toContain('InspectionsPage');
    expect(page).not.toContain('JobsPage');
    expect(page).not.toContain('JobDetailPage');
    expect(page).not.toContain('hub-jobs-sheet');
    expect(page).not.toContain('take5-doc-theme');

    const jobs = src('src/pages/JobsPage.tsx');
    expect(jobs).toContain('hub-jobs');
    expect(jobs).not.toContain('dashboard-home');

    const take5 = src('src/pages/Take5ListPage.tsx');
    expect(take5).not.toContain('dashboard-home');

    const jha = src('src/pages/JhaDocumentsPage.tsx');
    expect(jha).not.toContain('dashboard-home');

    const inspections = src('src/pages/InspectionsPage.tsx');
    expect(inspections).not.toContain('dashboard-home');

    const schedule = src('src/pages/SchedulePage.tsx');
    expect(schedule).not.toContain('dashboard-home');

    const login = src('src/pages/LoginPage.tsx');
    expect(login).not.toContain('dashboard-home');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).not.toContain('dashboard-home');
    expect(shell).toContain('resolveAppShellColors');
  });

  it('LOOK frames cover today\'s work desktop and phone only', () => {
    for (const rel of [
      'docs/look/dashboard-today-desktop.png',
      'docs/look/dashboard-today-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
