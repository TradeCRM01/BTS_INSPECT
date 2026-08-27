import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('quote list Looplet document look', () => {
  it('paints the list as cream paper rows, not poster cards', () => {
    const list = src('src/pages/QuotesPage.tsx');
    const css = src('src/index.css');

    expect(list).toContain('hub-quotes');
    expect(list).toContain('hub-quotes-sheet');
    expect(list).toContain('hub-quotes-row');
    expect(list).toContain('hub-quotes-pill');
    expect(list).toContain('Customer');
    expect(list).toContain('Suburb');
    expect(list).toContain('Total inc GST');
    expect(list).not.toContain('function QuoteCard');
    expect(list).not.toContain('ViewToggle');
    expect(list).not.toContain('Amount pending');
    expect(list).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(css).toContain('.hub-quotes.ops-page');
    expect(css).toContain('--quote-page: #F5F0E6');
    expect(css).toContain('--quote-sheet: #FFFDF8');
    expect(css).toContain('--quote-ink: #0A2540');
    expect(css).toContain('--quote-muted: #5B6B7C');
    expect(css).toContain('--quote-line: #E2D9CC');
    expect(css).toContain('#2E75B6');
    expect(css).toContain('Newsreader');
    expect(css).toContain('letter-spacing: 0.12em');
    expect(css).not.toContain('indigo-500');
    expect(css).not.toMatch(/\.hub-quotes[\s\S]{0,80}#111|#000\b/);
  });

  it('does not restyle invoices, jobs, ITR, login, landing, operator, or AppShell', () => {
    const quotes = src('src/pages/QuotesPage.tsx');
    expect(quotes).toContain('commercialPdfCompanyFrom');

    const invoices = src('src/pages/InvoicesPage.tsx');
    expect(invoices).toContain('hub-invoices');
    expect(invoices).not.toContain('hub-quotes');

    const jobs = src('src/pages/JobsPage.tsx');
    expect(jobs).not.toContain('hub-quotes');

    const login = src('src/pages/LoginPage.tsx');
    expect(login).not.toContain('hub-quotes');

    const landing = src('src/pages/RootPage.tsx');
    expect(landing).not.toContain('hub-quotes');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).not.toContain('hub-quotes');
    expect(shell).toContain('resolveAppShellColors');
  });

  it('LOOK frames cover quote list desktop and phone only', () => {
    for (const rel of [
      'docs/look/quote-list-desktop.png',
      'docs/look/quote-list-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
