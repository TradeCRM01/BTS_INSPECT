import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('job hub open sheet LOOK', () => {
  it('paints the open job as the document sheet, not admin rows or a week-chip hero', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const list = src('src/pages/JobsPage.tsx');
    const css = src('src/index.css');
    const lookStart = css.indexOf('/* Job list + open job sheet only.');
    const lookEnd = css.indexOf('/* Signed-in home / only.');
    const lookCss = css.slice(lookStart, lookEnd);

    expect(page).toContain('is-record-open');
    expect(page).toContain('hub-jobs-document');
    expect(page).toContain('hub-jobs-sheet-bar');
    expect(page).toContain('hub-jobs-sheet-body');
    expect(page).toContain('hub-jobs-hero');
    expect(page).toContain('hub-jobs-label');
    expect(page).toContain('hub-jobs-ledger');
    expect(page).toContain('hub-jobs-identity');
    expect(page).toContain('hub-jobs-tools');
    expect(page).toContain('className="btn-primary ops-next-control-block"');
    expect(page).toContain('hub-job-more');
    expect(page).toContain('OpsSiteRow');
    expect(page).toContain('Add to calendar');
    expect(page).toContain('buildJobCalendar');
    expect(page).not.toContain('hub-jobs-jobline');
    expect(page).not.toContain('JobCalendarOverflow');
    expect(page).toContain('Job status');
    expect(page).toContain('jobOpenNext');
    expect(page).not.toContain('hub-job-kicker');
    expect(page).not.toContain('hub-job-banner');
    expect(page).not.toContain('hub-job-letterhead');
    expect(page).not.toContain('ActionButton recommended');
    expect(page).not.toContain('This week');
    expect(page).not.toContain('hub-timesheets-days');
    expect(page).not.toContain('<table');
    expect(page).not.toContain('<thead');
    expect(page).not.toContain('ViewToggle');
    expect(page).not.toContain('#16A34A');
    expect(page).not.toMatch(/>JOBS</);
    expect(page).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(page).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(list).toContain('hub-jobs-sheet');
    expect(list).toContain('jobOpenNext');
    expect(list).toContain('hub-jobs-list-more');
    expect(list).toContain('ARRIVING_NEXT_LABEL');
    expect(list).toContain('CLOCK_IN_NEXT_LABEL');
    expect(list).not.toContain('hub-jobs-document');
    expect(list).not.toContain('is-record-open');

    expect(lookCss).toContain('.hub-jobs-document');
    expect(lookCss).toContain('.hub-jobs-sheet-bar');
    expect(lookCss).toContain('.hub-jobs-sheet-body');
    expect(lookCss).toContain('.hub-jobs-hero');
    expect(lookCss).toContain('.hub-jobs-identity');
    expect(lookCss).toContain('.hub-jobs-label');
    expect(lookCss).toContain('.hub-jobs.is-record-open');
    expect(lookCss).toContain('overflow: visible');
    expect(lookCss).toContain('.hub-job-more.is-flip');
    expect(lookCss).toContain('.hub-job-more.is-shift');
    expect(lookCss).toContain('.hub-jobs-document .job-swms-more');
    expect(lookCss).toContain('display: none');
    expect(lookCss).toContain('--job-look-page: #F5F0E6');
    expect(lookCss).toContain('--job-look-sheet: #FFFDF8');
    expect(lookCss).toContain('--job-look-ink: #0A2540');
    expect(lookCss).toContain('--job-look-muted: #5B6B7C');
    expect(lookCss).toContain('--job-look-line: #E2D9CC');
    expect(lookCss).toContain('#2E75B6');
    expect(lookCss).toContain('.hub-jobs-row-next .btn-primary');
    expect(lookCss).toContain('.hub-jobs-row-next .ops-next-control-block');
    expect(lookCss).toContain('.hub-jobs-document .hub-jobs-tools .btn-primary');
    expect(lookCss).toContain('.hub-jobs-document .hub-jobs-tools .ops-next-control-block');
    expect(lookCss).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(lookCss).toContain('inset 0 1px 0 #fff');
    const hero = lookCss.slice(lookCss.indexOf('  .hub-jobs-hero {'), lookCss.indexOf('  .hub-jobs-tools {'));
    expect(hero).toContain('font-size: 22px !important');
    expect(hero).toContain('letter-spacing: 0');
    expect(hero).toContain('line-height: 1.2');
    expect(hero).not.toContain('56px');
    expect(hero).not.toContain('32px');
    expect(lookCss).toContain('.hub-jobs-hero {\n      font-size: 20px !important');
    expect(lookCss).toContain('.hub-jobs-document .hub-jobs-identity .hub-jobs-hours {\n    font-size: 14px;');
    expect(lookCss).toContain('.hub-jobs-document .hub-jobs-identity .hub-jobs-hours {\n      font-size: 12px;');
    expect(lookCss).toContain("font-family: Rajdhani, sans-serif");
    expect(lookCss).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(lookCss).toContain('font-variant-numeric: tabular-nums');
    expect(lookCss).not.toContain('.hub-jobs-jobline');
    expect(lookCss).not.toContain('.hub-job-kicker');
    expect(lookCss).not.toContain('--job-look-pass');
    expect(lookCss).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(lookCss).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(lookCss).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(lookCss).not.toMatch(/\.hub-jobs[\s\S]{0,80}#111|#000\b/);
  });

  it('keeps persist, schedule, reminder, and send writes on the existing path', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    expect(page).toContain('updateStatus.mutate');
    expect(page).toContain('id="job-schedule"');
    expect(page).toContain('JobDispatchPanel');
    expect(page).toContain('JobClientReminder');
    expect(page).toContain('sendJobDraftInvoice');
    expect(page).toContain('createInvoiceFromJobBill');
    expect(page).toContain('id="job-insp"');
    expect(page).toContain('id="job-swms"');
    expect(page).toContain('id="job-hours"');
    expect(page).toContain('id="job-bill"');
    expect(page).not.toContain('sendQuoteDeliver');
    expect(page).not.toContain('InvoiceSendDialog');
  });

  it('reads existing ledger trays in job-conduct order after the header', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const header = page.slice(page.indexOf('hub-jobs-document'), page.indexOf('hub-trays hub-jobs-more-trays'));
    const trays = page.slice(page.indexOf('hub-trays hub-jobs-more-trays'), page.indexOf('id="job-schedule"'));

    expect(header).toContain('hub-jobs-hero');
    expect(header).toContain('hub-jobs-status-whisper');
    expect(header).toContain('className="btn-primary ops-next-control-block"');
    expect(header).toContain('sheetNext.label');
    expect(header).toContain('hub-jobs-identity');
    expect(header).toContain('job.description');
    expect(header.indexOf('hub-jobs-hero')).toBeLessThan(header.indexOf('hub-jobs-status-whisper'));
    expect(header.indexOf('hub-jobs-status-whisper')).toBeLessThan(header.indexOf('hub-jobs-tools'));
    expect(header.indexOf('hub-jobs-tools')).toBeLessThan(header.indexOf('hub-jobs-identity'));
    expect(header.indexOf('hub-jobs-identity')).toBeLessThan(header.indexOf('job.description'));

    const markers = [
      'title="Quotes"',
      'ops-section-title">Job bill',
      'title="JHA / SWMS"',
      'title="Take 5"',
      'title="Time on this job"',
      'title="Inspections"',
      'JOB_TESTING_DUE_TITLE',
      'title="Invoices"',
    ];
    const at = markers.map(m => trays.indexOf(m));
    expect(at.every(i => i >= 0)).toBe(true);
    for (let i = 1; i < at.length; i++) {
      expect(at[i]).toBeGreaterThan(at[i - 1]);
    }

    expect(trays).not.toContain('title="Reports"');
    expect(trays).not.toContain('<table');
    expect(trays).toContain('No report yet');
    expect(trays).toContain('setSendingReportId');
    expect(page).toContain('ReportSendDialog');
    expect(page.indexOf('hub-trays hub-jobs-more-trays')).toBeLessThan(page.indexOf('id="job-schedule"'));
    expect(page).toContain('JobDispatchPanel');
    expect(page).toContain('JobClientReminder');
    expect(page.indexOf('id="job-schedule"')).toBeLessThan(page.indexOf('</article>'));
    expect(page).not.toMatch(/electrician|electrical/i);
    expect(page).not.toContain('path="/reports');
  });

  it('does not restyle stay-off floors, AppShell, or the schedule plot', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    expect(page).not.toContain('hub-timesheets');
    expect(page).not.toContain('hub-compliance');
    expect(page).not.toContain('hub-team');
    expect(page).not.toContain('hub-reports');
    expect(page).not.toContain('hub-inspections-document');
    expect(page).not.toContain('TimesheetsPage');
    expect(page).not.toContain('CompliancePage');
    expect(page).not.toContain('SchedulePage');
    expect(src('src/pages/TimesheetsPage.tsx')).not.toContain('hub-jobs-document');
    expect(src('src/pages/CompliancePage.tsx')).not.toContain('hub-jobs-document');
    expect(src('src/pages/TeamSettingsPage.tsx')).not.toContain('hub-jobs-document');
    expect(src('src/pages/ReportsListPage.tsx')).not.toContain('hub-jobs-document');
    expect(src('src/pages/InspectionsPage.tsx')).not.toContain('hub-jobs-document');
    expect(src('src/pages/InspectionFillPage.tsx')).not.toContain('hub-jobs-document');
    expect(src('src/pages/ClientDetailPage.tsx')).not.toContain('hub-jobs-document');
    expect(src('src/pages/SchedulePage.tsx')).not.toContain('hub-jobs-document');
    expect(src('src/pages/DashboardPage.tsx')).not.toContain('hub-jobs-document');
    expect(src('src/components/layout/AppShell.tsx')).not.toContain('hub-jobs-document');
    expect(src('src/components/jobs/JobDispatchPanel.tsx')).not.toContain('hub-jobs-document');
  });
});

describe('job hub open sheet LOOK frames', () => {
  it('covers the open job as the document sheet on desktop and phone only', () => {
    for (const rel of [
      'docs/look/job-hub-sheet-desktop.png',
      'docs/look/job-hub-sheet-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });

  it('covers one site address and one overflow on the open sheet', () => {
    for (const rel of [
      'docs/look/job-sheet-address-desktop.png',
      'docs/look/job-sheet-address-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });

  it('covers scheduled-today Arriving shortly on the card and the open sheet', () => {
    for (const rel of [
      'docs/look/jobs-card-arriving-desktop.png',
      'docs/look/job-sheet-arriving-desktop.png',
      'docs/look/job-sheet-arriving-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
