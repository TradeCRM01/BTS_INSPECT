import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function lookCss(): string {
  const css = src('src/index.css');
  const lookStart = css.indexOf('/* JHA list document only.');
  const lookEnd = css.indexOf('/* End JHA list document', lookStart);
  return css.slice(lookStart, lookEnd);
}

describe('JHA list laptop LOOK — quote paper, overflow on the sheet', () => {
  it('paints the JHA list as one Looplet paper, not a stacked admin list', () => {
    const page = src('src/pages/JhaDocumentsPage.tsx');
    const css = lookCss();

    expect(page).toContain('hub-jha-list-doc');
    expect(page).toContain('hub-jha-list-bar');
    expect(page).toContain('hub-jha-list-mark');
    expect(page).toContain('hub-jha-list-body');
    expect(page).toContain('hub-jha-list-whisper');
    expect(page).toContain('hub-jha-list-tools');
    expect(page).toContain('hub-jha-sheet');
    expect(page).toContain('hub-jha-row');
    expect(page).toContain('Site');
    expect(page).toContain('hub-jha-list-find');
    expect(page).toContain('hub-jha-list-mark">List');
    expect(page).toContain('ops-page-title">JHA');
    expect(page).toContain('aria-label="Open"');
    expect(page).toContain('className="btn-primary hub-jha-start"');
    expect(page).toContain('+ Start JHA');
    expect(page).toContain('placeJhaListMore');
    expect(page).toContain('inkFloor');
    expect(page).not.toContain('hub-jha-pill');
    expect(page).not.toContain('>Open<');
    expect(page).not.toContain('hub-jha-list-mark">JHA');
    expect(page).not.toContain('hub-look-eyebrow');
    expect(page).not.toContain('ops-page-title">JHA documents');
    expect(page).not.toContain('ops-page-title">Book');
    expect(page).not.toMatch(/>Book<|>Ledger<|>Register</);
    expect(page).toContain('placeMoreMenu');
    expect(page).toContain('is-flip');
    expect(page).toContain('is-shift');
    expect(page).toContain('--hub-jha-list-more-shift');
    expect(page).toContain("look') === JHA_LIST_LOOK");
    expect(page).toContain('Northside Electrical');
    expect(page).toContain('Harbour Lights');
    expect(page).toContain('Midland Workshops');
    expect(page).toContain('hub-jha-list-take5');
    expect(page).toContain('data-take5-list');
    const take5 = page.slice(page.indexOf('function JhaTake5ListRow'), page.indexOf('function JhaGroup'));
    expect(take5).not.toContain('hub-jha-row');
    expect(take5).not.toContain('hub-jha-site');
    expect(take5).not.toContain('hub-jha-status');
    expect(take5).not.toContain('hub-jha-thead');
    expect(page).not.toContain('hub-jha-document');
    expect(page).not.toContain('is-record-open');
    expect(page).not.toContain('hub-jobs-list-doc');
    expect(page).not.toContain('hub-inspections-list-doc');
    expect(page).not.toContain('hub-reports-list-doc');
    expect(page).not.toContain('hub-clients-list-doc');
    expect(page).not.toContain('hub-week-document');
    expect(page).not.toContain('hub-quote-editor');
    expect(page).not.toContain('dashboard-home-mark');
    expect(page).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(page).not.toMatch(/Grafter|Relovi|Littleloop/);
    expect(page).not.toMatch(/\bute\b/i);

    expect((page.match(/hub-jha-list-more/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((page.match(/MoreHorizontal/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((page.match(/className="btn-primary hub-jha-start"/g) ?? []).length).toBe(1);

    expect(css).toContain('.hub-jha-list-doc');
    expect(css).toContain('.hub-jha-list-bar');
    expect(css).toContain('.hub-jha-list-whisper');
    expect(css).toContain('.hub-jha-list-take5');
    expect(css).toContain('.hub-jha-list-take5-link');
    expect(css).toContain('.hub-jha-list-tools');
    expect(css).toContain('background: #F5F0E6');
    expect(css).toContain('background: #FFFDF8');
    expect(css).toContain('color: #0A2540');
    expect(css).toContain('color: #5B6B7C');
    expect(css).toContain('#E2D9CC');
    expect(css).toContain('background: #2E75B6');
    expect(css).toContain('overflow: visible');
    expect(css).toContain('.hub-jha-list-more.is-flip');
    expect(css).toContain('.hub-jha-list-more.is-shift');
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
    const page = src('src/pages/JhaDocumentsPage.tsx');
    expect(page).toContain('filterJhaListFloor');
    expect(page).toContain('jhaDocumentHref');
    expect(page).toContain('decorateJhaList');
    expect(page).toContain('duplicateJhaDocument');
    expect(page).toContain('Search job, site, permit, supervisor, #0042');
    expect(page).not.toContain('sendQuoteDeliver');
    expect(page).not.toContain('CONVERT_QUOTE_NEED_DATE_CREW');
    expect(page).not.toContain('InvoiceSendDialog');
    expect(page).not.toContain('createInvoiceFromJobBill');
  });

  it('stays off landing, quotes, week-board, job sheet, inspections list, Relovi, and AppShell', () => {
    const page = src('src/pages/JhaDocumentsPage.tsx');
    expect(page).not.toContain('MarketingPage');
    expect(page).not.toContain('hub-quote-sheet');
    expect(page).not.toContain('hub-jobs-document');
    expect(page).not.toContain('hub-week-document');
    expect(src('src/pages/MarketingPage.tsx')).not.toContain('hub-jha-list-doc');
    expect(src('src/pages/QuotesPage.tsx')).not.toContain('hub-jha-list-doc');
    expect(src('src/pages/JobDetailPage.tsx')).not.toContain('hub-jha-list-doc');
    expect(src('src/pages/JobsPage.tsx')).not.toContain('hub-jha-list-doc');
    expect(src('src/pages/ClientsPage.tsx')).not.toContain('hub-jha-list-doc');
    expect(src('src/pages/ReportsListPage.tsx')).not.toContain('hub-jha-list-doc');
    expect(src('src/pages/InspectionsPage.tsx')).not.toContain('hub-jha-list-doc');
    expect(src('src/pages/SchedulePage.tsx')).not.toContain('hub-jha-list-doc');
    expect(src('src/pages/InvoicesPage.tsx')).not.toContain('hub-jha-list-doc');
    expect(src('src/pages/DashboardPage.tsx')).not.toContain('hub-jha-list-doc');
    expect(src('src/pages/LoginPage.tsx')).not.toContain('hub-jha-list-doc');
    expect(src('src/pages/JhaFillPage.tsx')).not.toContain('hub-jha-list-doc');
    expect(src('src/components/layout/AppShell.tsx')).not.toContain('hub-jha-list-doc');
  });
});

describe('JHA list laptop LOOK frames', () => {
  it('covers 1280 document, overflow, and quote-paper reference', () => {
    for (const rel of [
      'docs/look/jha-list-laptop-1280-document.png',
      'docs/look/jha-list-laptop-1280-overflow.png',
      'docs/look/quote-paper-reference.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
