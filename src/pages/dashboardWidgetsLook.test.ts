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

describe('dashboard widgets LOOK — ink on the signed paper', () => {
  it('keeps the default trade widgets on the existing dashboard sheet', () => {
    const page = src('src/pages/DashboardPage.tsx');
    const css = lookCss();
    const auth = src('src/lib/devFieldAuditAuth.ts');

    expect(page).toContain("look') === DASHBOARD_LOOK");
    expect(page).toContain('dashboardLookWidgets');
    expect(page).toContain('look-widget-upcoming-jobs');
    expect(page).toContain('look-widget-outstanding-invoices');
    expect(page).toContain('look-widget-compliance');
    expect(page).toContain('lookJobs');
    expect(page).toContain('lookInvoices');
    expect(page).toContain('lookCompliance');
    expect(page).toContain('data-dashboard-widgets="1"');
    expect(page).toContain('dashboard-home-widget-ink');
    expect(page).toContain('dashboard-home-widget-stack');
    expect(page).toContain('dashboard-home-canvas');
    expect(page).toContain('overflow-x-auto');
    expect(page.indexOf('data-dashboard-widgets="1"')).toBeGreaterThan(page.indexOf('dashboard-home-sheet-body'));
    expect(page.indexOf('data-dashboard-widgets="1"')).toBeLessThan(page.lastIndexOf('</article>'));
    expect(page).not.toContain('path="/widgets"');
    expect(page).not.toContain('WidgetsPage');
    expect(page).not.toMatch(/Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(page).not.toMatch(/Relovi|Littleloop/);
    expect(page).not.toMatch(/\bute\b/i);

    expect(auth).toContain("params.get('look') === 'dashboard'");

    expect(css).toContain('.dashboard-home-widgets');
    expect(css).toContain('.dashboard-home-widget-ink');
    expect(css).toContain('.dashboard-home-widget-stack');
    expect(css).toContain('overflow-x: auto');
    expect(css).toContain('background: #F5F0E6');
    expect(css).toContain('background: #FFFDF8');
    expect(css).toContain('color: #0A2540');
    expect(css).toContain('#2E75B6');
    expect(css).toContain("font-family: Rajdhani, sans-serif");
    expect(css).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(css).not.toContain('max-width: 1100px');
    expect(css).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow/);
    expect(css).not.toMatch(/#16A34A|#15803D|#1B7F3A/);
    expect(css).not.toMatch(/\bute\b/i);
    expect(css).not.toContain('#FFFFFF');
  });

  it('does not rewrite persist, convert, SMTP, inspections, or Stripe', () => {
    const page = src('src/pages/DashboardPage.tsx');
    expect(page).toContain('persistWidget');
    expect(page).toContain('resolveDashboardWidgets');
    expect(page).toContain('defaultDashboardWidgetInserts');
    expect(page).not.toContain('sendQuoteDeliver');
    expect(page).not.toContain('CONVERT_QUOTE_NEED_DATE_CREW');
    expect(page).not.toContain('InvoiceSendDialog');
    expect(page).not.toContain('createInvoiceFromJobBill');
    expect(src('src/pages/InspectionsPage.tsx')).not.toContain('dashboard-home-mark');
    expect(src('src/pages/QuotesPage.tsx')).not.toContain('dashboardLookWidgets');
  });
});

describe('dashboard widgets LOOK frames', () => {
  it('covers laptop 1280 and phone 390 next to quote paper', () => {
    for (const rel of [
      'docs/look/dashboard-widgets-laptop-1280.png',
      'docs/look/dashboard-widgets-phone-390.png',
      'docs/look/quote-paper-reference.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
      expect(rel).not.toMatch(/relovi/i);
    }
  });
});
