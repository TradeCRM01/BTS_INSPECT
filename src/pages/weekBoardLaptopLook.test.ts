import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function lookCss(): string {
  const css = src('src/index.css');
  const lookStart = css.indexOf('/* Week-board document only.');
  const lookEnd = css.indexOf('.hub-schedule-place {', lookStart);
  return css.slice(lookStart, lookEnd);
}

describe('week-board laptop LOOK — quote paper, one overflow, plotted tracker', () => {
  it('paints the week board as one Looplet paper, not stacked admin cards', () => {
    const page = src('src/pages/SchedulePage.tsx');
    const css = lookCss();

    expect(page).toContain('hub-week-document');
    expect(page).toContain('hub-week-hero');
    expect(page).toContain('hub-week-status-whisper');
    expect(page).toContain('hub-week-identity');
    expect(page).toContain('hub-week-sheet-bar');
    expect(page).toContain('WeekBoardChrome');
    expect(page).toContain('WeekBoardView');
    expect(page).toContain('placeMoreMenu');
    expect(page).toContain('is-flip');
    expect(page).toContain('is-shift');
    expect(page).toContain('--hub-week-more-shift');
    expect(page).toContain('All crews');
    expect(page).toContain('className="btn-primary"');
    expect(page).toContain("look') === WEEK_BOARD_LOOK");
    expect(page).toContain("name: 'Dave'");
    expect(page).toContain("name: 'Jack'");
    expect(page).toContain("name: 'Sam'");
    expect(page).toContain('Warehouse lights');
    expect(page).toContain('>Week<');
    expect(page).toContain('>Crew<');
    expect(page).not.toMatch(/#C45C38|#C05838/);
    expect(page).not.toContain('hub-jobs-identity');
    expect(page).not.toContain('hub-quote-editor');
    expect(page).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(page).not.toMatch(/Grafter|Relovi|Littleloop/);
    expect(page).not.toMatch(/\bute\b/i);

    expect((page.match(/hub-week-more/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((page.match(/MoreHorizontal/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((page.match(/hub-week-status-whisper/g) ?? []).length).toBeGreaterThanOrEqual(1);

    expect(css).toContain('.hub-week-document');
    expect(css).toContain('.hub-week-hero');
    expect(css).toContain('.hub-week-status-whisper');
    expect(css).toContain('.hub-week-identity');
    expect(css).toContain('.hub-week-sheet-bar');
    expect(css).toContain('background: #F5F0E6');
    expect(css).toContain('background: #FFFDF8');
    expect(css).toContain('color: #0A2540');
    expect(css).toContain('color: #5B6B7C');
    expect(css).toContain('#E2D9CC');
    expect(css).toContain('background: #2E75B6');
    expect(css).toContain('overflow: visible');
    expect(css).toContain('.hub-week-more.is-flip');
    expect(css).toContain('.hub-week-more.is-shift');
    expect(css).toContain('font-size: 12px');
    expect(css).toContain('font-size: 56px !important');
    expect(css).toContain("font-family: Rajdhani, sans-serif");
    expect(css).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(css).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(css).toContain('inset 0 1px 0 #fff');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('text-transform: none');
    expect(css).toContain('letter-spacing: 0');
    expect(css).toContain('.hub-week-document .hub-week-chip');
    expect(css).toContain('background: #FFFDF8 !important');
    expect(css).toContain('color: #0A2540 !important');
    expect(css).toContain('.form-input::placeholder');
    expect(css).not.toMatch(/letter-spacing:\s*0\.12em/);
    expect(css).not.toMatch(/text-transform:\s*uppercase/);
    expect(css).not.toMatch(/#C45C38|#C05838|#C45C26/);
    expect(css).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(css).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(css).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(css).not.toMatch(/\bute\b/i);
    expect(css).not.toContain('#FFFFFF');
  });

  it('keeps the plotted day/week tracker and empty days on the track', () => {
    const page = src('src/pages/SchedulePage.tsx');
    const board = src('src/components/crm/BoardViews.tsx');
    const css = src('src/index.css');

    expect(page).toContain('WeekBoardView');
    expect(page).toContain('data-week-sheet="1"');
    expect(board).toContain('data-week-board="1"');
    expect(board).toContain('data-week-cell');
    expect(board).toContain('is-empty');
    expect(board).toContain('weekBoardRows');
    expect(board).toContain('data-schedule-track="day"');
    expect(board).not.toContain('No jobs on this day');
    expect(board).not.toContain('No jobs this day');
    expect(board).not.toContain('hub-schedule-empty');
    expect(css).toContain('.hub-week-cell.is-empty');
    expect(css).toContain('.hub-week-chip');
    expect(css).toContain('repeat(7, 156px)');
  });

  it('does not rewrite persist, dispatch, or convert writes', () => {
    const page = src('src/pages/SchedulePage.tsx');
    expect(page).toContain('rescheduleJob.mutate');
    expect(page).toContain('resizeJob.mutate');
    expect(page).toContain('scheduleJobHref');
    expect(page).toContain('JobFormModal');
    expect(page).not.toContain('sendQuoteDeliver');
    expect(page).not.toContain('CONVERT_QUOTE_NEED_DATE_CREW');
    expect(page).not.toContain('InvoiceSendDialog');
    expect(page).not.toContain('createInvoiceFromJobBill');
  });

  it('stays off landing, quotes, job sheet, invoice-as-next, lists, Relovi, and AppShell', () => {
    const page = src('src/pages/SchedulePage.tsx');
    expect(page).not.toContain('MarketingPage');
    expect(page).not.toContain('hub-quote-sheet');
    expect(page).not.toContain('hub-jobs-document');
    expect(src('src/pages/MarketingPage.tsx')).not.toContain('hub-week-document');
    expect(src('src/pages/QuotesPage.tsx')).not.toContain('hub-week-document');
    expect(src('src/pages/JobDetailPage.tsx')).not.toContain('hub-week-document');
    expect(src('src/pages/InvoicesPage.tsx')).not.toContain('hub-week-document');
    expect(src('src/pages/JobsPage.tsx')).not.toContain('hub-week-document');
    expect(src('src/pages/DashboardPage.tsx')).not.toContain('hub-week-document');
    expect(src('src/pages/LoginPage.tsx')).not.toContain('hub-week-document');
    expect(src('src/components/layout/AppShell.tsx')).not.toContain('hub-week-document');
    expect(src('src/components/jobs/JobDispatchPanel.tsx')).not.toContain('hub-week-document');
  });
});

describe('week-board laptop LOOK frames', () => {
  it('covers 1280 document, overflow, and quote-paper reference', () => {
    for (const rel of [
      'docs/look/week-board-laptop-1280-document.png',
      'docs/look/week-board-laptop-1280-overflow.png',
      'docs/look/quote-paper-reference.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
