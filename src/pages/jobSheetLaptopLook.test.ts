import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function lookCss(): string {
  const css = src('src/index.css');
  const lookStart = css.indexOf('/* Job list + open job sheet only.');
  const lookEnd = css.indexOf('/* Signed-in home / only.');
  return css.slice(lookStart, lookEnd);
}

describe('job sheet laptop LOOK — quote paper, one overflow, compact header', () => {
  it('paints the open job as one Looplet paper, not nested cards or a tall admin stack', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    const css = lookCss();

    expect(page).toContain('hub-jobs-document');
    expect(page).toContain('hub-jobs-identity');
    expect(page).toContain('hub-jobs-identity-col');
    expect(page).toContain('hub-jobs-contact');
    expect(page).toContain('hub-jobs-contact-row');
    expect(page).toContain('OpsSiteRow');
    expect(page).toContain('hub-job-more');
    expect(page).toContain('placeMoreMenu');
    expect(page).toContain('is-flip');
    expect(page).toContain('is-shift');
    expect(page).toContain('--hub-job-more-shift');
    expect(page).toContain('Add to calendar');
    expect(page).toContain('className="btn-primary ops-next-control-block"');
    expect(page).toContain('hub-jobs-status-whisper');
    expect(page).toContain('AUDIT_DOC_JOB_ID');
    expect(page).toContain('lookVanTodayYmd');
    expect(page).not.toContain('hub-jobs-pill');
    expect(page).not.toContain('hub-job-letterhead');
    expect(page).not.toContain('hub-job-kicker');
    expect(page).not.toContain('JobCalendarOverflow');
    expect(page).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(page).not.toMatch(/Grafter|Relovi|Littleloop/);
    expect(page).not.toMatch(/\bute\b/i);

    expect((page.match(/<OpsSiteRow/g) ?? []).length).toBe(1);
    expect((page.match(/className="hub-job-more"/g) ?? []).length).toBe(1);
    expect((page.match(/MoreHorizontal/g) ?? []).length).toBeGreaterThanOrEqual(1);

    expect(css).toContain('.hub-jobs-identity');
    expect(css).toContain('.hub-jobs-contact-row');
    expect(css).toContain('display: contents');
    expect(css).toContain('flex-wrap: wrap');
    expect(css).toContain('overflow: hidden');
    expect(css).not.toContain('--hub-list-sheet-max');
    expect(css).toMatch(/\.hub-jobs-document \{[\s\S]{0,220}max-width: 1100px/);
    expect(css).toContain('.hub-jobs-sheet-bar .hub-job-more > summary');
    expect(css).toContain('.hub-jobs-document .hub-jobs-tools .ops-next-control-done');
    expect(css).toContain('.hub-jobs-document .hub-jobs-status-whisper');
    expect(css).toContain('.hub-jobs-document .hub-jobs-tools .btn-primary');
    expect(css).toContain('background: #2E75B6');
    expect(css).toContain('overflow: visible');
    expect(css).toContain('.hub-job-more.is-flip');
    expect(css).toContain('.hub-job-more.is-shift');
    expect(css).toContain('.hub-jobs-document .job-swms-more');
    expect(css).toContain('.hub-jobs-document :is(#job-swms, #job-insp) .ops-tray');
    expect(css).toContain('.ops-tray:has(.ops-tray-empty)');
    expect(css).toContain('text-transform: none');
    expect(css).toContain("letter-spacing: 0");
    expect(css).not.toMatch(/\.hub-jobs-document \.ops-tray \.ops-section-title[\s\S]{0,220}text-transform:\s*uppercase/);
    expect(css).toContain('.hub-jobs-document .ops-tray .ops-link');
    expect(css).toContain('color: var(--job-look-muted)');
    expect(css).toContain('.hub-jobs-document #job-schedule');
    expect(css).toContain('.hub-jobs-document #job-schedule .form-input');
    expect(css).toContain('.hub-jobs-document .hub-jobs-more-trays > div:not(#job-schedule)');
    expect(css).toContain('background: #FFFDF8');
    expect(css).toContain('font-size: 12px !important');
    const paper = page.slice(page.indexOf('hub-jobs-document'), page.indexOf('</article>'));
    expect(paper).toContain('id="job-schedule"');
    expect(paper).toContain('JobDispatchPanel');
    expect(page.indexOf('</article>')).toBeGreaterThan(page.indexOf('id="job-schedule"'));
    expect(page).toMatch(/id="job-bill"[\s\S]*?<\/div>\s*<\/div>\s*<div id="job-schedule">/);
    expect(css).not.toMatch(/\.hub-jobs-document[\s\S]{0,80}\.ops-tray \.btn-primary[\s\S]{0,160}#2E75B6/);
    expect(css).toContain('--job-look-page: #F5F0E6');
    expect(css).toContain('--job-look-sheet: #FFFDF8');
    expect(css).toContain('--job-look-ink: #0A2540');
    expect(css).toContain('--job-look-muted: #5B6B7C');
    expect(css).toContain('--job-look-line: #E2D9CC');
    expect(css).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(css).toContain('inset 0 1px 0 #fff');
    const hero = css.slice(css.indexOf('  .hub-jobs-hero {'), css.indexOf('  .hub-jobs-tools {'));
    expect(hero).toContain('font-size: 22px !important');
    expect(hero).toContain('letter-spacing: 0');
    expect(hero).toContain('line-height: 1.2');
    expect(hero).not.toContain('56px');
    expect(hero).not.toContain('32px');
    expect(css).toContain('.hub-jobs-hero {\n      font-size: 20px !important');
    expect(css).toContain('.hub-jobs-document .hub-jobs-identity .hub-jobs-hours {\n    font-size: 14px;');
    expect(css).toContain('.hub-jobs-document .hub-jobs-identity .hub-jobs-hours {\n      font-size: 12px;');
    expect(css).toContain("font-family: Rajdhani, sans-serif");
    expect(css).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(css).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(css).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(css).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(css).not.toMatch(/\bute\b/i);
  });

  it('does not rewrite persist, dispatch, costing, reminder, or convert writes', () => {
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
    expect(page).not.toContain('CONVERT_QUOTE_NEED_DATE_CREW');
    expect(page).not.toContain('InvoiceSendDialog');
  });

  it('stays off landing, quotes editor, invoice-as-next, lists, and AppShell', () => {
    const page = src('src/pages/JobDetailPage.tsx');
    expect(page).not.toContain('MarketingPage');
    expect(page).not.toContain('hub-quote-editor');
    expect(page).not.toContain('hub-quote-sheet');
    expect(page).not.toContain('hub-timesheets');
    expect(src('src/pages/MarketingPage.tsx')).not.toContain('hub-jobs-identity');
    expect(src('src/pages/QuotesPage.tsx')).not.toContain('hub-jobs-identity');
    expect(src('src/pages/InvoicesPage.tsx')).not.toContain('hub-jobs-identity');
    expect(src('src/pages/JobsPage.tsx')).not.toContain('hub-jobs-identity');
    expect(src('src/pages/DashboardPage.tsx')).not.toContain('hub-jobs-identity');
    expect(src('src/pages/SchedulePage.tsx')).not.toContain('hub-jobs-identity');
    expect(src('src/components/layout/AppShell.tsx')).not.toContain('hub-jobs-identity');
    expect(src('src/components/jobs/JobDispatchPanel.tsx')).not.toContain('hub-jobs-identity');
  });
});

describe('job sheet laptop LOOK frames', () => {
  it('covers 1280 document, overflow, phone, and quote-paper reference', () => {
    for (const rel of [
      'docs/look/job-sheet-laptop-1280-document.png',
      'docs/look/job-sheet-laptop-1280-overflow.png',
      'docs/look/job-sheet-phone-390.png',
      'docs/look/quote-paper-reference.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
