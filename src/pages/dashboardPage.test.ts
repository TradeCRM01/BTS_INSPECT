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

describe('signed-in dashboard document sheet look', () => {
  it('paints today\'s work as the document sheet, not cards, admin rows, or a widget wall', () => {
    const page = src('src/pages/DashboardPage.tsx');
    const css = src('src/index.css');
    const homeStart = css.indexOf('/* Signed-in home / only.');
    const homeEnd = css.indexOf('/* Field Work inspections list only.', homeStart);
    const homeCss = css.slice(homeStart, homeEnd);

    expect(page).toContain('dashboard-home');
    expect(page).toContain('is-day-open');
    expect(page).toContain('dashboard-home-sheet');
    expect(page).toContain('dashboard-home-sheet-bar');
    expect(page).toContain('dashboard-home-sheet-body');
    expect(page).toContain('dashboard-home-hero');
    expect(page).toContain('dashboard-home-label');
    expect(page).toContain('dashboard-home-ledger');
    expect(page).toContain('dashboard-home-row');
    expect(page).toContain('dashboard-home-pill');
    expect(page).toContain('dashboard-home-next');
    expect(page).toContain('dashboard-home-primary');
    expect(page).toContain('dashboardJobPlace(job)');
    expect(page).toContain('dashboardJobMetaLine(job)');
    expect(page).toContain('Week board');
    expect(page).toContain('Open schedule');
    expect(page).not.toContain('dashboard-home-kicker');
    expect(page).not.toContain('dashboard-home-thead');
    expect(page).not.toContain('<table');
    expect(page).not.toContain('<thead');
    expect(page).not.toMatch(/>TODAY</);
    expect(page).not.toContain('hub-jobs');
    expect(page).not.toContain('hub-quotes');
    expect(page).not.toContain('className="btn-primary"');
    expect(page).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(page).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(homeCss).toContain('.dashboard-home.ops-page');
    expect(homeCss).toContain('.dashboard-home-sheet');
    expect(homeCss).toContain('.dashboard-home-sheet-bar');
    expect(homeCss).toContain('.dashboard-home-sheet-body');
    expect(homeCss).toContain('.dashboard-home-hero');
    expect(homeCss).toContain('.dashboard-home-label');
    expect(homeCss).toContain('.dashboard-home.is-day-open');
    expect(homeCss).toContain('--dashboard-home-page: #F5F0E6');
    expect(homeCss).toContain('--dashboard-home-sheet: #FFFDF8');
    expect(homeCss).toContain('--dashboard-home-ink: #0A2540');
    expect(homeCss).toContain('--dashboard-home-muted: #5B6B7C');
    expect(homeCss).toContain('--dashboard-home-line: #E2D9CC');
    expect(homeCss).toContain('#2E75B6');
    expect(homeCss).toContain('box-shadow: 0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(homeCss).toContain('box-shadow: inset 0 1px 0 #fff');
    expect(homeCss).toContain('font-size: 56px !important');
    expect(homeCss).toContain("font-family: Rajdhani, sans-serif");
    expect(homeCss).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(homeCss).toContain('letter-spacing: 0.12em');
    expect(homeCss).toContain('font-variant-numeric: tabular-nums');
    expect(homeCss).not.toContain('.dashboard-home-kicker');
    expect(homeCss).not.toContain('--dashboard-home-pass');
    expect(homeCss).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(homeCss).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(homeCss).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(homeCss).not.toMatch(/font-family:\s*ui-monospace|JetBrains Mono/);
    expect(homeCss).not.toMatch(/\.dashboard-home[\s\S]{0,80}#111|#000\b/);
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
    expect(page).not.toContain('TimesheetsPage');
    expect(page).not.toContain('hub-jobs-sheet');
    expect(page).not.toContain('hub-timesheets');
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

    const timesheets = src('src/pages/TimesheetsPage.tsx');
    expect(timesheets).not.toContain('dashboard-home-sheet');

    const login = src('src/pages/LoginPage.tsx');
    expect(login).not.toContain('dashboard-home');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).not.toContain('dashboard-home');
    expect(shell).toContain('resolveAppShellColors');
  });

  it('LOOK frames cover today\'s work as the document sheet on desktop and phone only', () => {
    for (const rel of [
      'docs/look/dashboard-sheet-desktop.png',
      'docs/look/dashboard-sheet-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
