import { existsSync, readFileSync } from 'node:fs';
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
    expect(board).toContain('data-schedule-track="day"');
    expect(board).toContain('data-schedule-track="week"');
    expect(board).not.toContain('No jobs on this day');
    expect(board).not.toContain('No jobs this day');
    expect(board).not.toContain('hub-schedule-empty');
  });
});

describe('schedule board cream paper look', () => {
  it('paints week and day as cream paper, not a poster', () => {
    const page = src('src/pages/SchedulePage.tsx');
    const css = src('src/index.css');

    expect(page).toContain('hub-board-cal');
    expect(page).toContain('hub-schedule-kicker');
    expect(page).toContain('hub-schedule-chrome');
    expect(page).toContain('hub-schedule-filters');
    expect(page).toContain('New job');
    expect(page).not.toContain('New Job');
    expect(page).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(page).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(css).toContain('.hub-board-cal.ops-page');
    expect(css).toContain('--schedule-page: #F5F0E6');
    expect(css).toContain('--schedule-sheet: #FFFDF8');
    expect(css).toContain('--schedule-ink: #0A2540');
    expect(css).toContain('--schedule-muted: #5B6B7C');
    expect(css).toContain('--schedule-line: #E2D9CC');
    expect(css).toContain('#2E75B6');
    expect(css).toContain("font-family: Rajdhani, sans-serif");
    expect(css).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(css).not.toMatch(/\.hub-board-cal \.ops-page-title[\s\S]{0,160}Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(css).toContain('letter-spacing: 0.12em');
  });

  it('does not restyle jobs, quotes, invoices, login, landing, operator, or AppShell', () => {
    const jobs = src('src/pages/JobsPage.tsx');
    expect(jobs).not.toContain('hub-board-cal');
    expect(jobs).not.toContain('hub-schedule-kicker');

    const quotes = src('src/pages/QuotesPage.tsx');
    expect(quotes).not.toContain('hub-board-cal');

    const invoices = src('src/pages/InvoicesPage.tsx');
    expect(invoices).not.toContain('hub-board-cal');

    const login = src('src/pages/LoginPage.tsx');
    expect(login).not.toContain('hub-board-cal');

    const landing = src('src/pages/RootPage.tsx');
    expect(landing).not.toContain('hub-board-cal');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).not.toContain('hub-board-cal');
    expect(shell).toContain('resolveAppShellColors');
  });

  it('LOOK frames cover week and day boards on desktop and phone', () => {
    for (const rel of [
      'docs/look/schedule-week-desktop.png',
      'docs/look/schedule-week-phone.png',
      'docs/look/schedule-day-desktop.png',
      'docs/look/schedule-day-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
