import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('job list cream paper look', () => {
  it('paints the list as cream paper rows, not poster cards', () => {
    const list = src('src/pages/JobsPage.tsx');
    const css = src('src/index.css');

    expect(list).toContain('hub-jobs');
    expect(list).toContain('hub-jobs-sheet');
    expect(list).toContain('hub-jobs-row');
    expect(list).toContain('hub-jobs-pill');
    expect(list).toContain('Customer');
    expect(list).toContain('Suburb');
    expect(list).not.toContain('function JobCard');
    expect(list).not.toContain('ViewToggle');
    expect(list).not.toMatch(/Grafter|Relovi|Littleloop/);

    expect(css).toContain('.hub-jobs.ops-page');
    expect(css).toContain('--job-look-page: #F5F0E6');
    expect(css).toContain('--job-look-sheet: #FFFDF8');
    expect(css).toContain('--job-look-ink: #0A2540');
    expect(css).toContain('--job-look-muted: #5B6B7C');
    expect(css).toContain('--job-look-line: #E2D9CC');
    expect(css).toContain('#2E75B6');
    expect(css).toContain("font-family: Rajdhani, sans-serif");
    expect(css).toContain("font-family: 'Source Sans 3', system-ui, sans-serif");
    expect(css).not.toMatch(/\.hub-jobs \.ops-page-title[\s\S]{0,160}Newsreader|Syne|Space Grotesk|IBM Plex/);
    expect(css).toContain('letter-spacing: 0.12em');
    expect(css).not.toContain('indigo-500');
    expect(css).not.toMatch(/\.hub-jobs[\s\S]{0,80}#111|#000\b/);
  });

  it('does not restyle quotes, invoices, ITR, login, landing, operator, or AppShell', () => {
    const jobs = src('src/pages/JobsPage.tsx');
    expect(jobs).toContain('pageQueryBlocked');
    expect(jobs).not.toContain('hub-quotes');
    expect(jobs).not.toContain('hub-invoices');

    const quotes = src('src/pages/QuotesPage.tsx');
    expect(quotes).toContain('hub-quotes');
    expect(quotes).not.toContain('hub-jobs');

    const invoices = src('src/pages/InvoicesPage.tsx');
    expect(invoices).toContain('hub-invoices');
    expect(invoices).not.toContain('hub-jobs');

    const login = src('src/pages/LoginPage.tsx');
    expect(login).not.toContain('hub-jobs');

    const landing = src('src/pages/RootPage.tsx');
    expect(landing).not.toContain('hub-jobs');

    const shell = src('src/components/layout/AppShell.tsx');
    expect(shell).not.toContain('hub-jobs');
    expect(shell).toContain('resolveAppShellColors');
  });

  it('LOOK frames cover job list desktop and phone only', () => {
    for (const rel of [
      'docs/look/job-list-desktop.png',
      'docs/look/job-list-phone.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
    }
  });
});
