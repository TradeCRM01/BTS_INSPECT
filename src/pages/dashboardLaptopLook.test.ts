import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function lookCss(): string {
  const css = src('src/index.css');
  const lookStart = css.indexOf('/* Signed-in home / only.');
  const lookEnd = css.indexOf('/* Field Work inspections list only.', lookStart);
  return css.slice(lookStart, lookEnd);
}

describe('dashboard laptop LOOK — quote paper, overflow on the sheet', () => {
  it('paints the dashboard as one Looplet paper, not a stacked admin dashboard', () => {
    const page = src('src/pages/DashboardPage.tsx');
    const css = lookCss();

    expect(page).toContain('dashboard-home');
    expect(page).toContain('dashboard-home-sheet');
    expect(page).toContain('dashboard-home-sheet-bar');
    expect(page).toContain('dashboard-home-mark">Today');
    expect(page).toContain('dashboard-home-sheet-body');
    expect(page).toContain('dashboard-home-whisper');
    expect(page).toContain('dashboard-home-tools');
    expect(page).toContain('dashboard-home-row');
    expect(page).toContain('Time');
    expect(page).toContain('Place');
    expect(page).toContain('ops-page-title dashboard-home-hero">Dashboard');
    expect(page).toContain('aria-label="Open"');
    expect(page).toContain('className="btn-primary dashboard-home-primary"');
    expect(page).toContain('Week board');
    expect(page).toContain('placeDashboardMore');
    expect(page).toContain('inkFloor');
    expect(page).not.toContain('dashboard-home-kicker');
    expect(page).not.toContain('dashboard-home-next');
    expect(page).not.toContain('>Open<');
    expect(page).not.toContain('dashboard-home-mark">Dashboard');
    expect(page).not.toContain('ops-page-title">Today');
    expect(page).not.toMatch(/>Book<|>Ledger<|>Register</);
    expect(page).toContain('placeMoreMenu');
    expect(page).toContain('is-flip');
    expect(page).toContain('is-shift');
    expect(page).toContain('--dashboard-home-more-shift');
    expect(page).toContain("look') === DASHBOARD_LOOK");
    expect(page).toContain('Northside Electrical');
    expect(page).toContain('Harbour Lights');
    expect(page).toContain('Site labour');
    expect(page).not.toContain('hub-clients-list-doc');
    expect(page).not.toContain('hub-week-document');
    expect(page).not.toContain('hub-jobs-identity');
    expect(page).not.toContain('hub-quote-editor');
    expect(page).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(page).not.toMatch(/Grafter|Relovi|Littleloop/);
    expect(page).not.toMatch(/\bute\b/i);

    expect((page.match(/dashboard-home-more/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((page.match(/MoreHorizontal/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((page.match(/className="btn-primary dashboard-home-primary"/g) ?? []).length).toBe(3);

    expect(css).toContain('.dashboard-home.ops-page');
    expect(css).toContain('.dashboard-home-sheet');
    expect(css).toContain('.dashboard-home-sheet-bar');
    expect(css).toContain('.dashboard-home-whisper');
    expect(css).toContain('.dashboard-home-tools');
    expect(css).toContain('background: #F5F0E6');
    expect(css).toContain('background: #FFFDF8');
    expect(css).toContain('color: #0A2540');
    expect(css).toContain('color: #5B6B7C');
    expect(css).toContain('#E2D9CC');
    expect(css).toContain('background: #2E75B6');
    expect(css).toContain('overflow: visible');
    expect(css).toContain('.dashboard-home-more.is-flip');
    expect(css).toContain('.dashboard-home-more.is-shift');
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
    expect(css).not.toMatch(/letter-spacing:\s*0\.12em/);
    expect(css).not.toMatch(/text-transform:\s*uppercase/);
    expect(css).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(css).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(css).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(css).not.toMatch(/\bute\b/i);
    expect(css).not.toContain('#FFFFFF');
  });

  it('does not rewrite persist, widget, or convert writes', () => {
    const page = src('src/pages/DashboardPage.tsx');
    expect(page).toContain('todaysDashboardJobs');
    expect(page).toContain('dashboardJobHref');
    expect(page).toContain('persistWidget');
    expect(page).toContain('addWidget');
    expect(page).toContain('removeWidget');
    expect(page).toContain('updateWidgetConfig');
    expect(page).not.toContain('sendQuoteDeliver');
    expect(page).not.toContain('CONVERT_QUOTE_NEED_DATE_CREW');
    expect(page).not.toContain('InvoiceSendDialog');
    expect(page).not.toContain('createInvoiceFromJobBill');
  });

  it('stays off landing, quotes, week-board, job sheet, clients list, Relovi, and AppShell', () => {
    const page = src('src/pages/DashboardPage.tsx');
    expect(page).not.toContain('MarketingPage');
    expect(page).not.toContain('hub-quote-sheet');
    expect(page).not.toContain('hub-jobs-document');
    expect(page).not.toContain('hub-week-document');
    expect(page).not.toContain('hub-clients-list-doc');
    expect(src('src/pages/MarketingPage.tsx')).not.toContain('dashboard-home-mark');
    expect(src('src/pages/QuotesPage.tsx')).not.toContain('dashboard-home-mark');
    expect(src('src/pages/JobDetailPage.tsx')).not.toContain('dashboard-home-mark');
    expect(src('src/pages/JobsPage.tsx')).not.toContain('dashboard-home-mark');
    expect(src('src/pages/SchedulePage.tsx')).not.toContain('dashboard-home-mark');
    expect(src('src/pages/ClientsPage.tsx')).not.toContain('dashboard-home-mark');
    expect(src('src/pages/InvoicesPage.tsx')).not.toContain('dashboard-home-mark');
    expect(src('src/pages/LoginPage.tsx')).not.toContain('dashboard-home-mark');
    expect(src('src/components/layout/AppShell.tsx')).not.toContain('dashboard-home-mark');
  });
});

describe('dashboard laptop LOOK frames', () => {
  it('covers 1280 document, overflow, and quote-paper reference', () => {
    for (const rel of [
      'docs/look/dashboard-laptop-1280-document.png',
      'docs/look/dashboard-laptop-1280-overflow.png',
      'docs/look/quote-paper-reference.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
