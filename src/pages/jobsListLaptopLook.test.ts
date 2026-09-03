import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function lookCss(): string {
  const css = src('src/index.css');
  const lookStart = css.indexOf('/* Jobs list document only.');
  const lookEnd = css.indexOf('/* End jobs list document', lookStart);
  return css.slice(lookStart, lookEnd);
}

describe('jobs list laptop LOOK — quote paper, overflow on the sheet', () => {
  it('paints the jobs list as one Looplet paper, not a stacked admin list', () => {
    const page = src('src/pages/JobsPage.tsx');
    const css = lookCss();

    expect(page).toContain('hub-jobs-list-doc');
    expect(page).toContain('hub-jobs-list-bar');
    expect(page).toContain('hub-jobs-list-mark');
    expect(page).toContain('hub-jobs-list-body');
    expect(page).toContain('hub-jobs-list-whisper');
    expect(page).toContain('hub-jobs-list-tools');
    expect(page).toContain('hub-jobs-sheet');
    expect(page).toContain('hub-jobs-row');
    expect(page).toContain('Customer');
    expect(page).toContain('Suburb');
    expect(page).toContain('hub-jobs-list-find');
    expect(page).toContain('hub-jobs-list-mark">List');
    expect(page).toContain('ops-page-title">Jobs');
    expect(page).toContain('aria-label="Open"');
    expect(page).toContain('className="btn-primary"');
    expect(page).toContain('New job');
    expect(page).toContain('placeJobsListMore');
    expect(page).toContain('inkFloor');
    expect(page).not.toContain('hub-jobs-pill');
    expect(page).not.toContain('>Open<');
    expect(page).not.toContain('hub-jobs-list-mark">Jobs');
    expect(page).not.toContain('hub-look-eyebrow');
    expect(page).not.toContain('ops-page-title">Book');
    expect(page).not.toMatch(/>Book<|>Ledger<|>Register</);
    expect(page).toContain('placeMoreMenu');
    expect(page).toContain('is-flip');
    expect(page).toContain('is-shift');
    expect(page).toContain('--hub-jobs-list-more-shift');
    expect(page).toContain("look') === JOBS_LIST_LOOK");
    expect(page).toContain('Northside Electrical');
    expect(page).toContain('Harbour Lights');
    expect(page).toContain('Midland Workshops');
    expect(page).toContain('Site labour');
    expect(page).not.toContain('hub-jobs-document');
    expect(page).not.toContain('is-record-open');
    expect(page).not.toContain('hub-jobs-identity');
    expect(page).not.toContain('hub-week-document');
    expect(page).not.toContain('hub-quote-editor');
    expect(page).not.toContain('hub-clients-list-doc');
    expect(page).not.toContain('dashboard-home-mark');
    expect(page).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(page).not.toMatch(/Grafter|Relovi|Littleloop/);
    expect(page).not.toMatch(/\bute\b/i);

    expect((page.match(/hub-jobs-list-more/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((page.match(/MoreHorizontal/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((page.match(/className="btn-primary"/g) ?? []).length).toBe(1);

    expect(css).toContain('.hub-jobs-list-doc');
    expect(css).toContain('.hub-jobs-list-bar');
    expect(css).toContain('.hub-jobs-list-whisper');
    expect(css).toContain('.hub-jobs-list-tools');
    expect(css).toContain('background: #F5F0E6');
    expect(css).toContain('background: #FFFDF8');
    expect(css).toContain('color: #0A2540');
    expect(css).toContain('color: #5B6B7C');
    expect(css).toContain('#E2D9CC');
    expect(css).toContain('background: #2E75B6');
    expect(css).toContain('overflow: visible');
    expect(css).toContain('.hub-jobs-list-more.is-flip');
    expect(css).toContain('.hub-jobs-list-more.is-shift');
    expect(css).toContain('font-size: 12px');
    expect(css).toContain('font-size: 56px !important');
    expect(css).toContain("font-family: Rajdhani, sans-serif");
    expect(css).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(css).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(css).toContain('inset 0 1px 0 #fff');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('min-height: 620px');
    expect(css).toContain('text-transform: none');
    expect(css).toContain('letter-spacing: 0');
    expect(css).toContain('.form-input::placeholder');
    expect(css).not.toMatch(/letter-spacing:\s*0\.12em/);
    expect(css).not.toMatch(/text-transform:\s*uppercase/);
    expect(css).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(css).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(css).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(css).not.toMatch(/\bute\b/i);
    expect(css).not.toContain('#FFFFFF');
  });

  it('does not rewrite persist, search, or convert writes', () => {
    const page = src('src/pages/JobsPage.tsx');
    expect(page).toContain('jobOpenNext');
    expect(page).toContain('formatJobRef');
    expect(page).toContain('loadJobCardExtras');
    expect(page).toContain('JobFormModal');
    expect(page).toContain('Search jobs or clients');
    expect(page).not.toContain('sendQuoteDeliver');
    expect(page).not.toContain('CONVERT_QUOTE_NEED_DATE_CREW');
    expect(page).not.toContain('InvoiceSendDialog');
    expect(page).not.toContain('createInvoiceFromJobBill');
  });

  it('stays off landing, quotes, week-board, job sheet, clients list, Relovi, and AppShell', () => {
    const page = src('src/pages/JobsPage.tsx');
    expect(page).not.toContain('MarketingPage');
    expect(page).not.toContain('hub-quote-sheet');
    expect(page).not.toContain('hub-jobs-document');
    expect(page).not.toContain('hub-week-document');
    expect(src('src/pages/MarketingPage.tsx')).not.toContain('hub-jobs-list-doc');
    expect(src('src/pages/QuotesPage.tsx')).not.toContain('hub-jobs-list-doc');
    expect(src('src/pages/JobDetailPage.tsx')).not.toContain('hub-jobs-list-doc');
    expect(src('src/pages/ClientsPage.tsx')).not.toContain('hub-jobs-list-doc');
    expect(src('src/pages/SchedulePage.tsx')).not.toContain('hub-jobs-list-doc');
    expect(src('src/pages/InvoicesPage.tsx')).not.toContain('hub-jobs-list-doc');
    expect(src('src/pages/DashboardPage.tsx')).not.toContain('hub-jobs-list-doc');
    expect(src('src/pages/LoginPage.tsx')).not.toContain('hub-jobs-list-doc');
    expect(src('src/components/layout/AppShell.tsx')).not.toContain('hub-jobs-list-doc');
  });
});

describe('jobs list laptop LOOK frames', () => {
  it('covers 1280 document, overflow, and quote-paper reference', () => {
    for (const rel of [
      'docs/look/jobs-list-laptop-1280-document.png',
      'docs/look/jobs-list-laptop-1280-overflow.png',
      'docs/look/quote-paper-reference.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
