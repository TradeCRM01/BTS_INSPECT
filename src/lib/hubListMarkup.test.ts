import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('list markup stays on named areas', () => {
  it('maps jobs, quotes and invoices cells by class, not sibling index', () => {
    const css = src('src/index.css');
    expect(css).toContain('.hub-jobs-cell-identity { grid-area: identity; }');
    expect(css).toContain('.hub-quotes-cell-total { grid-area: total;');
    expect(css).toContain('.hub-invoices-cell-status { grid-area: status; }');
    expect(css).not.toContain('.hub-jobs-row > :nth-child(1) { grid-area: ref; }');
    expect(css).not.toContain('.hub-quotes-row > :nth-child(5) { grid-area: total;');
    expect(css).not.toContain('.hub-invoices-row > :nth-child(6) { grid-area: next; }');

    const jobs = src('src/pages/JobsPage.tsx');
    expect(jobs).toContain('hub-jobs-cell-identity');
    expect(jobs).toContain('hub-jobs-cell-when');
    expect(jobs).toContain('hub-jobs-cell-status');
    expect(jobs).not.toContain("crew === 'Crew' ? 'Unassigned'");

    const quotes = src('src/pages/QuotesPage.tsx');
    expect(quotes).toContain('hub-quotes-cell-total');
    expect(quotes).toContain('<AppDialog');
    expect(quotes).toContain('labelledBy="hub-quote-editor-title"');

    const invoices = src('src/pages/InvoicesPage.tsx');
    expect(invoices).toContain('hub-invoices-cell-total');
    expect(invoices).toContain('<AppDialog');
    expect(invoices).toContain('labelledBy="hub-invoice-editor-title"');

    const schedule = src('src/pages/SchedulePage.tsx');
    expect(schedule).toContain('rescheduleJob.mutate(placementWriteFromDraft(next))');
    expect(schedule).toContain('SCHEDULE_PLACEMENT_INVALIDATE_KEYS');
    expect(schedule).not.toContain('void supabase.from(\'jobs\').update');
  });
});
