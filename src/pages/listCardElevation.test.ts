import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('list card quiet elevation', () => {
  it('applies the week-board elevation to jobs and clients list sheets only', () => {
    const css = src('src/index.css');
    const jobs = src('src/pages/JobsPage.tsx');
    const clients = src('src/pages/ClientsPage.tsx');
    const jobsSheet = css.slice(css.indexOf('  .hub-jobs-sheet {'), css.indexOf('  .hub-jobs-thead,'));
    const clientsSheet = css.slice(css.indexOf('  .hub-clients-sheet {'), css.indexOf('  .hub-clients-contact-sheet {'));

    expect(jobs).toContain('hub-jobs-sheet');
    expect(jobs).toContain('EmptyState');
    expect(clients).toContain('hub-clients-sheet');
    expect(clients).toContain('EmptyState');

    for (const sheet of [jobsSheet, clientsSheet]) {
      expect(sheet).toContain('inset 0 1px 0 #fff');
      expect(sheet).toContain('0 10px 28px rgba(10, 37, 64, 0.08)');
      expect(sheet).not.toMatch(/radial-gradient|backdrop-filter|filter:\s*drop-shadow|lacquer|gloss|glow/);
    }
  });

  it('does not restyle open documents, schedule, quotes, invoices, or AppShell', () => {
    const jobsList = src('src/pages/JobsPage.tsx');
    const clientsList = src('src/pages/ClientsPage.tsx');
    const jobOpen = src('src/pages/JobDetailPage.tsx');
    const clientOpen = src('src/pages/ClientDetailPage.tsx');
    const schedule = src('src/pages/SchedulePage.tsx');
    const quotes = src('src/pages/QuotesPage.tsx');
    const invoices = src('src/pages/InvoicesPage.tsx');
    const shell = src('src/components/layout/AppShell.tsx');

    expect(jobsList).not.toContain('hub-jobs-document');
    expect(jobsList).not.toContain('is-record-open');
    expect(clientsList).not.toContain('hub-clients-document');
    expect(clientsList).not.toContain('is-record-open');
    expect(jobOpen).toContain('hub-jobs-document');
    expect(jobOpen).not.toContain('hub-week-sheet');
    expect(clientOpen).toContain('hub-clients-document');
    expect(clientOpen).not.toContain('className="hub-clients-sheet"');
    expect(schedule).toContain('hub-week-sheet');
    expect(schedule).not.toContain('hub-jobs-sheet');
    expect(schedule).not.toContain('hub-clients-sheet');
    expect(quotes).not.toContain('hub-jobs-sheet');
    expect(quotes).not.toContain('hub-clients-sheet');
    expect(invoices).not.toContain('hub-jobs-sheet');
    expect(invoices).not.toContain('hub-clients-sheet');
    expect(shell).not.toContain('hub-jobs-sheet');
    expect(shell).not.toContain('hub-clients-sheet');
    expect(jobsList).not.toMatch(/Relovi|Littleloop/);
    expect(clientsList).not.toMatch(/Relovi|Littleloop/);
  });

  it('LOOK frames cover jobs and clients list elevation', () => {
    for (const rel of [
      'docs/look/list-card-elevation-jobs-desktop.png',
      'docs/look/list-card-elevation-jobs-phone.png',
      'docs/look/list-card-elevation-clients-desktop.png',
    ]) {
      expect(existsSync(resolve(process.cwd(), rel))).toBe(true);
      expect(rel).not.toMatch(/ute/i);
    }
  });
});
