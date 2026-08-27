import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('Timesheets list cream paper look', () => {
  it('paints the see-and-open floor as cream paper rows, not poster cards', () => {
    const list = src('src/pages/TimesheetsPage.tsx');
    const css = src('src/index.css');
    const helper = src('src/lib/timesheetsList.ts');

    expect(list).toContain('hub-timesheets');
    expect(list).toContain('hub-timesheets-days');
    expect(list).toContain('hub-timesheets-tile');
    expect(list).toContain('hub-timesheets-pill');
    expect(list).toContain('hub-timesheets-hours');
    expect(list).toContain('hub-timesheets-entries');
    expect(list).toContain('TIMESHEET_LIST_FILTERS');
    expect(list).toContain('timesheetListOpenHref');
    expect(list).toContain('>Open</span>');
    expect(list).not.toContain('>Date</span>');
    expect(list).not.toContain('hub-timesheets-thead');
    expect(list).not.toContain('hub-timesheets-row');
    expect(list).not.toContain('function TimesheetCard');
    expect(list).not.toContain('ViewToggle');
    expect(list).not.toMatch(/Grafter|Relovi|Littleloop/);
    expect(helper).toContain("TIMESHEET_LIST_DEFAULT_FILTER: TimesheetListFilter = 'all'");
    expect(helper).toContain('return `/timesheets?${params.toString()}`');

    expect(css).toContain('.hub-timesheets.ops-page');
    expect(css).toContain('--ts-look-page: #F5F0E6');
    expect(css).toContain('--ts-look-sheet: #FFFDF8');
    expect(css).toContain('--ts-look-ink: #0A2540');
    expect(css).toContain('--ts-look-muted: #5B6B7C');
    expect(css).toContain('--ts-look-line: #E2D9CC');
    expect(css).toContain('#2E75B6');
    expect(css).toContain("font-family: Rajdhani, sans-serif");
    expect(css).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(css).toContain('font-variant-numeric: tabular-nums');
    expect(css).not.toMatch(/\.hub-timesheets \.ops-page-title[\s\S]{0,160}Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(css).toContain('letter-spacing: 0.12em');
    expect(css).not.toContain('indigo-500');
    expect(css).not.toMatch(/\.hub-timesheets[\s\S]{0,80}#111|#000\b/);
    expect(css).toContain('.hub-timesheets-next');
    expect(css).toContain('.hub-timesheets-sub');
    expect(css.slice(css.indexOf('/* Timesheets list only'))).not.toMatch(/#16A34A|#15803D|btn-danger/);
    expect(css).not.toMatch(/\.hub-timesheets \.btn-primary/);
    expect(css).not.toMatch(/\.hub-timesheets \.btn-danger/);
  });

  it('makes Clock In the one primary and recedes Add Entry; leaves TimeEntryForm, jobs, reports, and AppShell alone', () => {
    const list = src('src/pages/TimesheetsPage.tsx');
    expect(list).toContain('hub-timesheets-next');
    expect(list).toContain('hub-timesheets-sub');
    expect(list).toContain('Clock In');
    expect(list).toContain('Add Entry');
    expect(list).not.toContain('btn-danger');
    expect(list).not.toContain('#16A34A');
    expect(list).not.toContain('className="btn-primary"');
    expect(list).toContain('TimeEntryForm');
    expect(list).not.toContain('hub-jobs');
    expect(list).not.toContain('hub-reports');
    expect(list).not.toContain('hub-take5');
    expect(list).not.toContain('hub-jha');
    expect(list).not.toContain('hub-inspections');
    expect(list).not.toContain('hub-clients');
    expect(list).not.toContain('timesheetJob');
    expect(list).not.toContain('JobDetailPage');
    expect(list).not.toContain('report_theme');

    const form = src('src/components/timesheets/TimeEntryForm.tsx');
    expect(form).not.toContain('hub-timesheets');

    const job = src('src/lib/timesheetJob.ts');
    expect(job).not.toContain('hub-timesheets');

    const jobs = src('src/pages/JobsPage.tsx');
    expect(jobs).not.toContain('hub-timesheets');

    const reports = src('src/pages/ReportsListPage.tsx');
    expect(reports).not.toContain('hub-timesheets');

    const take5 = src('src/pages/Take5ListPage.tsx');
    expect(take5).not.toContain('hub-timesheets');

    const login = src('src/pages/LoginPage.tsx');
    expect(login).not.toContain('hub-timesheets');

    const landing = src('src/pages/RootPage.tsx');
    expect(landing).not.toContain('hub-timesheets');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).not.toContain('hub-timesheets');
    expect(shell).toContain('resolveAppShellColors');
  });

  it('LOOK frames cover this week’s timesheets list desktop and phone only', () => {
    for (const rel of [
      'docs/look/timesheets-list-desktop.png',
      'docs/look/timesheets-list-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
