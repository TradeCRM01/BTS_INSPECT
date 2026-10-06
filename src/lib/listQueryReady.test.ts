import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LIST_LOADING_LABEL, listCountWhisper, listQueryBusy, listShowEmpty } from './listQueryReady';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('listQueryBusy', () => {
  it('stays busy while pending or loading so 0 / empty UI stays hidden', () => {
    expect(listQueryBusy({ isPending: true, data: undefined })).toBe(true);
    expect(listQueryBusy({ isLoading: true, data: undefined })).toBe(true);
    expect(listQueryBusy({ isPending: false, isLoading: false, data: undefined })).toBe(true);
    expect(listQueryBusy({ isPending: false, isLoading: false, data: [] })).toBe(false);
    expect(listQueryBusy({ isPending: false, isLoading: false, data: [{ id: '1' }] })).toBe(false);
    expect(listQueryBusy({ isPending: true, data: undefined, seeded: true })).toBe(false);
    expect(listShowEmpty(true, 0)).toBe(false);
    expect(listShowEmpty(false, 0)).toBe(true);
  });
});

describe('listCountWhisper', () => {
  it('does not print All · 0 jobs while the query is busy', () => {
    expect(listCountWhisper({
      busy: true,
      filterLabel: 'All',
      count: 0,
      singular: 'job',
      plural: 'jobs',
    })).toBe(LIST_LOADING_LABEL);
    expect(listCountWhisper({
      busy: false,
      filterLabel: 'All',
      count: 0,
      singular: 'job',
      plural: 'jobs',
    })).toBe('All · 0 jobs');
    expect(listCountWhisper({
      busy: false,
      filterLabel: 'All',
      count: 3,
      singular: 'job',
      plural: 'jobs',
    })).toBe('All · 3 jobs');
  });
});

describe('list pages suppress count and empty while busy', () => {
  it('gates Jobs, Quotes, Invoices, Clients, and Price Books on listQueryBusy', () => {
    for (const rel of [
      'src/pages/JobsPage.tsx',
      'src/pages/QuotesPage.tsx',
      'src/pages/InvoicesPage.tsx',
      'src/pages/ClientsPage.tsx',
      'src/pages/PriceBooksPage.tsx',
    ]) {
      const page = src(rel);
      expect(page, rel).toContain('listQueryBusy');
      expect(page, rel).toContain('isPending');
      expect(page, rel).toContain('busy ?');
      expect(page, rel).toContain('LoadingSpinner');
      expect(page, rel).not.toMatch(/Relovi|Littleloop/);
    }
    const jobs = src('src/pages/JobsPage.tsx');
    const clients = src('src/pages/ClientsPage.tsx');
    expect(jobs).toContain('listCountWhisper');
    expect(jobs).toContain("singular: 'job'");
    expect(clients).toContain('listCountWhisper');
    expect(clients).toContain("singular: 'client'");
  });

  it('keeps Price Books empty and 0 items hidden while listQueryBusy', () => {
    const page = src('src/pages/PriceBooksPage.tsx');
    expect(page).toContain("listQueryBusy({ isPending, isLoading, data: priceBooks })");
    expect(page).toContain('LIST_LOADING_LABEL');
    expect(page).toContain('{busy || itemsBusy ? LIST_LOADING_LABEL : `${filteredItems.length} items`}');
    expect(page).toContain('{busy ? (');
    expect(page).toContain('{!busy && (priceBooks ?? []).length === 0 && (');
    expect(page).toContain('No price books yet');
    expect(page).toContain('{busy || itemsBusy ? (');
    expect(page).not.toMatch(/Relovi|Littleloop/);
  });
});
