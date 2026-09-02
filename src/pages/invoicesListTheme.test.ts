import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('invoice list cream document look', () => {
  it('paints the list as cream paper rows with Rajdhani titles', () => {
    const page = src('src/pages/InvoicesPage.tsx');
    const list = page.split('function InvoiceEditorModal')[0] ?? page;
    const css = src('src/index.css');
    const sheet = css.slice(css.indexOf('  .hub-invoices-sheet {'), css.indexOf('  .hub-invoices-thead,'));
    const tabs = css.slice(css.indexOf('  .hub-invoices-chrome .hub-chrome-filter {'), css.indexOf('  .hub-invoices-sheet {'));

    expect(list).toContain('hub-invoices');
    expect(list).toContain('hub-invoices-sheet');
    expect(list).toContain('hub-invoices-row');
    expect(list).toContain('hub-invoices-pill');
    expect(list).toContain('<div className="hub-invoices-sheet">');
    expect(list).toContain('EmptyState');
    expect(list).toContain('invoiceListEmptyTitle');
    expect(list).toContain('INVOICE_LIST_DEFAULT_FILTER');
    expect(list).toContain('Customer');
    expect(list).toContain('Suburb');
    expect(list).toContain('Total inc GST');
    expect(list).not.toContain('hub-invoice-kicker');
    expect(list).not.toContain('function InvoiceCard');
    expect(list).not.toContain('ViewToggle');
    expect(list).not.toMatch(/Grafter|Relovi|Littleloop/);
    expect(list).not.toMatch(/\bute\b/i);

    expect(css).toContain('.hub-invoices.ops-page');
    expect(css).toContain('--invoice-page: #F5F0E6');
    expect(css).toContain('--invoice-sheet: #FFFDF8');
    expect(css).toContain('--invoice-ink: #0A2540');
    expect(css).toContain('--invoice-muted: #5B6B7C');
    expect(css).toContain('--invoice-line: #E2D9CC');
    expect(css).toContain('#2E75B6');
    expect(css).toContain("font-family: Rajdhani, sans-serif");
    expect(css).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(css).not.toMatch(/\.hub-invoices \.ops-page-title[\s\S]{0,160}Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(css).toContain('letter-spacing: 0.12em');
    expect(css).not.toContain('indigo-500');
    expect(css).not.toMatch(/\.hub-invoices[\s\S]{0,80}#111|#000\b/);

    expect(sheet).toContain('border-radius: 16px');
    expect(sheet).toContain('inset 0 1px 0 #fff');
    expect(sheet).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
    expect(sheet).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow|lacquer|gloss|glow|shine/);
    expect(tabs).toContain('font-family: Rajdhani, sans-serif');
    expect(tabs).toContain('font-weight: 700');
    expect(tabs).toContain('#2E75B6');
  });

  it('does not ship a look screenshot harness and keeps the signed default', () => {
    const list = src('src/pages/InvoicesPage.tsx').split('function InvoiceEditorModal')[0] ?? '';
    expect(list).toContain("useState<StatusFilter>(INVOICE_LIST_DEFAULT_FILTER)");
    expect(list).toContain('invoiceListEmptyTitle');
    expect(list).not.toContain('invoicesLookSeed');
    expect(list).not.toContain('INVOICES_LOOK');
    expect(list).not.toContain("searchParams.get('look')");
    expect(list).not.toContain('/overdue-invoices');
  });

  it('does not restyle jobs, ITR, login, landing, operator, or AppShell', () => {
    const invoices = src('src/pages/InvoicesPage.tsx');
    expect(invoices).toContain('commercialPdfCompanyFrom');
    expect(invoices).not.toContain('hub-quotes');

    const jobs = src('src/pages/JobsPage.tsx');
    expect(jobs).not.toContain('hub-invoices');

    const login = src('src/pages/LoginPage.tsx');
    expect(login).not.toContain('hub-invoices');

    const landing = src('src/pages/RootPage.tsx');
    expect(landing).not.toContain('hub-invoices');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).not.toContain('hub-invoices');
    expect(shell).toContain('resolveAppShellColors');
  });

  it('LOOK frames cover invoice list desktop and phone only', () => {
    for (const rel of [
      'docs/look/invoice-list-desktop.png',
      'docs/look/invoice-list-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });

  it('LOOK frames cover Overdue tabs and honest empty on desktop and phone', () => {
    for (const rel of [
      'docs/look/invoices-overdue-tabs-desktop.png',
      'docs/look/invoices-overdue-empty-desktop.png',
      'docs/look/invoices-overdue-tabs-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
