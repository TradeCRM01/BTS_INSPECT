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
    expect(page).toContain('onJobClick={handlePickJob}');
    expect(page).toContain('placePickedOnCell');
    expect(page).toContain('onJobDrop={placeExisting}');
    expect(page).toContain('data-schedule-search="1"');
    expect(board).toContain('data-schedule-job={job.id}');
    expect(board).toContain('data-schedule-rail-job={job.id}');
    expect(board).toContain('weekBoardRows');
    expect(board).toContain('onClick={() => onJobClick(job)}');
    expect(search).toContain('href={scheduleJobHref(job.id)}');
    expect(search).toContain('data-schedule-open-job={job.id}');
  });

  it('wires phone day crew drop zones the same way as the desktop day board', () => {
    const page = src('src/pages/SchedulePage.tsx');
    const board = src('src/components/crm/BoardViews.tsx');
    const phoneDay = board.slice(
      board.indexOf('export const PhoneDayList'),
      board.indexOf('export const PhoneWeekList'),
    );
    const dayBoard = board.slice(
      board.indexOf('export const DayBoardView'),
      board.indexOf('function CurrentTimeVerticalIndicator'),
    );
    const phoneDayMount = page.slice(
      page.indexOf('<PhoneDayList'),
      page.indexOf('</PhoneDayList>'),
    );
    expect(phoneDay).toContain('onJobDrop?: (drop: JobDropPayload) => void');
    expect(phoneDay).toContain('onJobDrop={onJobDrop}');
    expect(phoneDay).toContain('DayBoardView');
    expect(dayBoard).toContain('data-crew-drop={row.id}');
    expect(dayBoard).toContain('data-crew-lane={painted.row.id}');
    expect(dayBoard).toContain('handleDrop(e, row.id)');
    expect(board).toContain('hub-day-chip-pin');
    expect(board).toContain('translateX');
    expect(board).toContain('dayChipPinInset');
    expect(src('src/lib/dispatch.ts')).toContain('width - remain');
    expect(src('src/index.css')).toContain('-webkit-line-clamp: 2');
    expect(src('src/index.css')).toContain('calc(var(--shell-bottom-nav-h, 0px) + 10px)');
    expect(page).toContain('286 prove 2 — delete ok');
    expect(page).toContain('286 prove 3 — delete ok');
    expect(page).toContain('asTeamIds');
    expect(dayBoard).toContain('hub-day-drop-hint');
    expect(dayBoard).toContain('data-unassigned-lock');
    expect(dayBoard).toContain('Drop here — date stays');
    expect(src('src/index.css')).toContain('.hub-day-chip-pin');
    expect(src('src/index.css')).toContain('position: sticky');
    expect(src('src/index.css')).toContain('.hub-day-drop-hint');
    expect(src('src/index.css')).toMatch(/\.hub-day-drop-hint[\s\S]{0,40}display: none/);
    expect(src('src/index.css')).toContain('.hub-day-crew-lock .ops-crew-mark');
    expect(page).toContain("get('early') === '1'");
    expect(page).toContain('weekBoardLookEarlyJobs');
    expect(page).toContain('05:30');
    expect(page).toContain('07:00');
    expect(page).toContain('handlePhoneDayClick');
    expect(phoneDayMount).toContain('onDayClick={handlePhoneDayClick}');
    expect(phoneDayMount).toContain('onJobDrop={placeExisting}');
    expect(dayBoard).toContain('data-day-empty="1"');
    expect(dayBoard).toContain('dayBoardStartHour');
    expect(dayBoard).toContain('dayBoardOpenScrollLeft');
    expect(board).toContain('phone');
    expect(page).toContain('placePickedHint');
    expect(page).toContain('placePickedOnCell');
    expect(page).not.toContain('today at 8:00');
    expect(board).toContain('TIME_NOT_SET_LABEL');
    expect(board).toContain('data-untimed-chip');
    expect(src('src/lib/dispatch.ts')).not.toContain('DEFAULT_SLOT_START');
    expect(page).toContain('scheduleSearchFromState');
    expect(page).toContain('scheduleLocationStep');
    expect(page).not.toContain("next.delete('date')");
  });

  it('puts booked jobs before a collapsed unscheduled chip on phone only', () => {
    const page = src('src/pages/SchedulePage.tsx');
    const board = src('src/components/crm/BoardViews.tsx');
    expect(page).toContain('PhoneUnscheduledTray');
    expect(page).toContain('data-schedule-phone-section="booked"');
    expect(page).toContain('agendaFooter');
    expect(page).toContain('unscheduledCount={needsDate.length}');
    expect(page).toContain('data-schedule-unscheduled-after-week="1"');
    expect(page).toContain('hidden lg:block');
    expect(page).toContain('fix3aScheduleLookSeed');
    expect(board).toContain('export const PhoneUnscheduledTray');
    expect(board).toContain('PHONE_UNSCHEDULED_EXPANDED_DEFAULT');
    expect(board).toContain('phoneUnscheduledChipLabel');
    expect(board).toContain('data-schedule-unscheduled-chip="1"');
    expect(board).toContain('data-schedule-set-date={job.id}');
    expect(board).toContain('hub-schedule-set-date');
    expect(board).toMatch(
      /data-schedule-set-date=\{job\.id\}[\s\S]{0,400}onKeyDown=\{e => \{[\s\S]{0,200}stopPropagation\(\)/,
    );
    expect(board).toContain('hub-phone-week-list');
    expect(page).toContain('onSetScheduleDate={job => openScheduleSheet(job)}');
    expect(board).toContain('aria-expanded={expanded}');
    expect(board).toContain('setExpanded(open => !open)');
    const phoneWeek = board.slice(
      board.indexOf('export const PhoneWeekList'),
      board.indexOf('// ── Day Board View'),
    );
    const lastDayAt = phoneWeek.lastIndexOf('data-agenda-day=');
    const agendaClose = phoneWeek.indexOf('</div>', phoneWeek.indexOf('data-week-agenda="1"'));
    const footerAt = phoneWeek.indexOf('data-schedule-unscheduled-after-week="1"');
    expect(lastDayAt).toBeGreaterThan(-1);
    expect(footerAt).toBeGreaterThan(agendaClose);
    expect(src('src/lib/fix3aScheduleLookSeed.ts')).toContain('FIX3A_UNSCHEDULED_SEED');
  });

  it('groups the phone week from existing scheduled_date fields', () => {
    const board = src('src/components/crm/BoardViews.tsx');
    expect(board).toContain('export const PhoneWeekList');
    expect(board).toContain('scheduleWeekAgenda(jobs, currentDate)');
    expect(board).toContain('data-week-agenda="1"');
    expect(board).toContain('Nothing booked');
    expect(src('src/index.css')).toContain('padding-bottom: max(16px, calc(var(--shell-bottom-nav-h, 0px) + 10px))');
    const phoneWeek = board.slice(
      board.indexOf('export const PhoneWeekList'),
      board.indexOf('export const DayBoardView'),
    );
    expect(phoneWeek).toContain('hub-week-agenda-title');
    expect(phoneWeek).toContain('hub-week-agenda-meta');
    expect(phoneWeek).toContain('hub-week-agenda-crew');
    expect(phoneWeek).toContain('hub-jobs-phone-status');
    expect(phoneWeek).toContain('scheduleAgendaClock');
    expect(phoneWeek).not.toContain('OpsStatus');
    expect(phoneWeek).not.toContain('onDragStart');
    expect(phoneWeek).not.toContain('onSelectDay');
    expect(phoneWeek).not.toContain('onDayClick');
    expect(phoneWeek).not.toContain('onJobDrop');
    expect(phoneWeek).not.toContain("'—'");
    expect(board).toContain('weekBoardRows(jobs, teamMembers, currentDate, filteredEmployeeIds)');
    expect(board).toContain('data-schedule-week="1"');
    expect(board).toContain('data-week-board="1"');
    expect(board).toContain('onSelectDay');
    expect(board).toContain('jobsOnScheduleDay');
    expect(board).toContain('data-schedule-track="day"');
    expect(board).not.toContain('data-schedule-track="week"');
    expect(board).not.toContain('ScheduleWeekHourPlot');
    expect(board).not.toContain('No jobs on this day');
    expect(board).not.toContain('No jobs this day');
    expect(board).not.toContain('hub-schedule-empty');
  });

  it('opens a Schedule this job sheet from phone search and saves the Schedule-tab fields', () => {
    const page = src('src/pages/SchedulePage.tsx');
    const search = src('src/components/crm/ScheduleJobSearch.tsx');
    const sheet = src('src/components/crm/ScheduleJobSheet.tsx');
    expect(search).toContain('onScheduleJob');
    expect(search).toContain('hub-schedule-search-title');
    expect(search).not.toContain('hub-schedule-ref truncate');
    expect(src('src/index.css')).toContain('.hub-schedule-search-title');
    expect(src('src/index.css')).not.toMatch(/\.hub-schedule-search-title[\s\S]{0,80}-webkit-line-clamp/);
    expect(search).toContain("max-width: 639px");
    expect(search).toContain('tap to schedule');
    expect(sheet).toContain('Schedule this job');
    expect(sheet).toContain('Unassigned');
    expect(sheet).toContain('EditorStickyFooter');
    expect(sheet).toContain('saveLabel="Save"');
    expect(sheet).toContain('onCancel={onClose}');
    expect(sheet).toContain('swipeDownClose');
    expect(sheet).toContain('hub-schedule-job-sheet-meta');
    expect(sheet).toContain('jobsListSuburbFromSite');
    expect(src('src/components/ui/AppDialog.tsx')).toContain('swipeDownClose');
    expect(src('src/index.css')).toContain('.hub-schedule-job-sheet .btn-primary.hub-editor-sticky-save');
    expect(src('src/index.css')).toMatch(/\.hub-schedule-job-sheet \.btn-primary\.hub-editor-sticky-save[\s\S]{0,80}#0A2540/);
    expect(src('src/index.css')).toMatch(/\.hub-schedule-job-sheet \.btn-primary\.hub-editor-sticky-save[\s\S]{0,120}#FFFDF8/);
    expect(src('src/index.css')).toContain('.hub-week-agenda .hub-jobs-phone-status');
    expect(page).toContain('scheduleSheetSavePayload');
    expect(page).toContain('scheduleFromSheet.mutate');
    expect(page).toContain('<ScheduleJobSheet');
    expect(page).toContain('ScheduleBookByVoice');
    expect(page).toContain('resolveQuickBook');
    expect(page).toContain('prefill={sheetPrefill}');
    expect(sheet).toContain('prefill');
    expect(sheet).toContain('matchHints');
    expect(src('src/components/crm/ScheduleBookByVoice.tsx')).toContain('Quick book');
    expect(src('src/components/crm/ScheduleBookByVoice.tsx')).toContain('Type a booking');
    expect(src('src/components/crm/ScheduleBookByVoice.tsx')).toContain('Speak a booking');
    expect(src('src/components/crm/ScheduleBookByVoice.tsx')).toContain('speechRecognitionErrorHint');
    expect(page.lastIndexOf('<ScheduleBookByVoice')).toBeGreaterThan(page.indexOf('data-schedule-search="1"'));
    expect(sheet).toContain('FromBooking');
    expect(src('src/components/crm/FromBooking.tsx')).toContain('From your booking');
    expect(page).toContain('withScheduleJobPatches(weekBoardLookJobs())');
    expect(page).toContain('jobMatchesSearch');
    expect(src('src/components/jobs/JobDispatchPanel.tsx')).toContain("save.mutate({ scheduled_date:");
    const dispatch = src('src/components/jobs/JobDispatchPanel.tsx');
    expect(dispatch).toContain('commitJobTime');
    expect(dispatch).toContain("onBlurCommit={v => commitJobTime('start_time', v)}");
    expect(dispatch).toContain("onBlurCommit={v => commitJobTime('end_time', v)}");
    expect(dispatch).toContain('assigned_team:');
  });
});

describe('schedule board cream paper look', () => {
  it('paints week and day as cream paper, not a poster', () => {
    const page = src('src/pages/SchedulePage.tsx');
    const css = src('src/index.css');

    expect(page).toContain('hub-board-cal');
    expect(page).not.toContain('hub-schedule-kicker');
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
    expect(css).toContain('.hub-week-board');
    expect(css).toContain('.hub-week-chip');
    expect(css).toContain('.hub-week-sheet');
    expect(css).toContain('.hub-week-head-short');
    expect(css).toContain('.hub-week-head-dow');
    expect(css).toContain('repeat(7, minmax(104px, 1fr))');
    expect(page).toContain('hub-week-range-short');
    expect(css).toContain('.hub-week-seg');
    expect(css).toContain('.hub-week-quiet');
    expect(css).toContain('inset 0 1px 0 #fff');
    expect(css).not.toContain('.hub-schedule-track.is-week');
  });

  it('paints the week board on one cream sheet and leaves the day hour plot', () => {
    const page = src('src/pages/SchedulePage.tsx');
    const board = src('src/components/crm/BoardViews.tsx');
    const css = src('src/index.css');
    const weekCss = css.slice(css.indexOf('.hub-week-sheet'), css.indexOf('.hub-schedule-place'));

    expect(page).toContain('hub-week-sheet');
    expect(page).toContain('WeekBoardChrome');
    expect(page).toContain('All crews');
    expect(page).toContain('lookParam === WEEK_BOARD_LOOK');
    expect(page).toContain('FIX3A_SCHEDULE_LOOK');
    expect(page).toContain("name: 'Dave Hale'");
    expect(page).toContain("name: 'Jack Wieland'");
    expect(page).toContain("name: 'Sam Ortiz'");
    expect(page).toContain('#0A2540');
    expect(page).toContain('#F7931A');
    expect(page).toContain('#7C3AED');
    expect(page).not.toMatch(/#C45C38|#C05838/);
    expect(page).toContain('Warehouse lights');
    expect(page).toContain('EEE d MMM');
    expect(page).toContain('data-week-seg="1"');
    expect(page).not.toContain('hub-schedule-kicker');
    expect(weekCss).toContain('overflow: visible');
    expect(weekCss).toContain('position: sticky');
    expect(css).toContain('repeat(7, 156px)');
    expect(board).toContain('data-schedule-track="day"');
    expect(board).not.toContain('data-schedule-track="week"');
    expect(weekCss).toContain('inset 0 1px 0 #fff');
    expect(weekCss).not.toMatch(/#1B7F3A|#059669|#166534|green/i);
    expect(weekCss).not.toMatch(/#C45C38|#C05838/);
    expect(weekCss).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
  });

  it('does not restyle jobs, quotes, invoices, login, landing, operator, or AppShell', () => {
    const jobs = src('src/pages/JobsPage.tsx');
    expect(jobs).not.toContain('hub-board-cal');
    expect(jobs).not.toContain('hub-week-sheet');

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
      'docs/look/schedule-empty-day-desktop.png',
      'docs/look/schedule-empty-day-phone.png',
      'docs/look/schedule-week-board-desktop.png',
      'docs/look/schedule-week-board-phone.png',
      'docs/look/schedule-week-laptop-1280.png',
      'docs/look/schedule-day-laptop-1280.png',
      'docs/look/schedule-week-phone-390.png',
      'docs/look/schedule-week-phone-375.png',
      'docs/look/schedule-day-phone-390.png',
      'docs/look/schedule-day-phone-sheet-390.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
