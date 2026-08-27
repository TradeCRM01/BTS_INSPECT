import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('invoice list cream document look', () => {
  it('paints the list as cream paper rows with Newsreader titles', () => {
    const list = src('src/pages/InvoicesPage.tsx');
    const css = src('src/index.css');

    expect(list).toContain('hub-invoices');
    expect(list).toContain('hub-invoices-sheet');
    expect(list).toContain('hub-invoices-row');
    expect(list).toContain('hub-invoices-pill');
    expect(list).toContain('hub-invoice-kicker');
    expect(list).toContain('Customer');
    expect(list).toContain('Suburb');
    expect(list).toContain('Total inc GST');
    expect(list).not.toContain('function InvoiceCard');
    expect(list).not.toContain('ViewToggle');
    expect(list).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(css).toContain('.hub-invoices.ops-page');
    expect(css).toContain('--invoice-page: #F5F0E6');
    expect(css).toContain('--invoice-sheet: #FFFDF8');
    expect(css).toContain('--invoice-ink: #0A2540');
    expect(css).toContain('--invoice-muted: #5B6B7C');
    expect(css).toContain('--invoice-line: #E2D9CC');
    expect(css).toContain('#2E75B6');
    expect(css).toContain('Newsreader');
    expect(css).not.toMatch(/\.hub-invoices \.ops-page-title[\s\S]{0,160}Syne|Space Grotesk/);
    expect(css).toContain('letter-spacing: 0.12em');
    expect(css).not.toContain('indigo-500');
    expect(css).not.toMatch(/\.hub-invoices[\s\S]{0,80}#111|#000\b/);
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
});
