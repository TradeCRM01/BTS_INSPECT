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
    expect(page).toContain('hub-jobs-tools');
    expect(page).toContain('className="btn-primary ops-next-control-block"');
    expect(page).toContain('hub-job-more');
    expect(page).toContain('Job status');
    expect(page).toContain('recommendJobAction');
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
    expect(list).not.toContain('hub-jobs-document');
    expect(list).not.toContain('is-record-open');

    expect(lookCss).toContain('.hub-jobs-document');
    expect(lookCss).toContain('.hub-jobs-sheet-bar');
    expect(lookCss).toContain('.hub-jobs-sheet-body');
    expect(lookCss).toContain('.hub-jobs-hero');
    expect(lookCss).toContain('.hub-jobs-label');
    expect(lookCss).toContain('.hub-jobs.is-record-open');
    expect(lookCss).toContain('--job-look-page: #F5F0E6');
    expect(lookCss).toContain('--job-look-sheet: #FFFDF8');
    expect(lookCss).toContain('--job-look-ink: #0A2540');
    expect(lookCss).toContain('--job-look-muted: #5B6B7C');
    expect(lookCss).toContain('--job-look-line: #E2D9CC');
    expect(lookCss).toContain('#2E75B6');
    expect(lookCss).toContain('box-shadow: 0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(lookCss).toContain('box-shadow: inset 0 1px 0 #fff');
    expect(lookCss).toContain('font-size: 56px !important');
    expect(lookCss).toContain("font-family: Rajdhani, sans-serif");
    expect(lookCss).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(lookCss).toContain('font-variant-numeric: tabular-nums');
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
});
