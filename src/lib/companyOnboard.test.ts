import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ONBOARD_NO_KEY,
  alreadyHaveName,
  classifyOnboardFile,
  companyUpdateFromPatch,
  emptyOnboardExtract,
  expenseInsertFromExtract,
  mergeOnboardExtracts,
  nameKeySet,
  normalizeOnboardExtract,
  onboardExtractCounts,
} from './companyOnboard';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('onboard file kinds', () => {
  it('accepts PDF, photos, CSV, and spreadsheets', () => {
    expect(classifyOnboardFile('overheads.xlsx', '')).toBe('spreadsheet');
    expect(classifyOnboardFile('clients.csv', 'text/csv')).toBe('text');
    expect(classifyOnboardFile('letterhead.pdf', 'application/pdf')).toBe('pdf');
    expect(classifyOnboardFile('card.jpg', 'image/jpeg')).toBe('image');
    expect(classifyOnboardFile('notes.docx', '')).toBeNull();
  });
});

describe('onboard extract', () => {
  it('drops blank rows and defaults overhead cost class', () => {
    const extract = normalizeOnboardExtract({
      company: { name: '  Field Co  ', extra: 'ignore' },
      clients: [{ name: 'Acme' }, { name: '  ' }, {}],
      expenses: [
        { description: 'Rent', amount: '2200', cost_class: 'Rent' },
        { description: 'Skip me', amount: 0 },
      ],
    });
    expect(extract.company.name).toBe('Field Co');
    expect(extract.clients.map(c => c.name)).toEqual(['Acme']);
    expect(extract.expenses).toHaveLength(1);
    expect(extract.expenses[0].cost_class).toBe('overhead');
    expect(extract.expenses[0].amount).toBe(2200);
    expect(extract.expenses[0].recurrence).toBe('one_off');
  });

  it('merges files without duplicating the same client', () => {
    const a = normalizeOnboardExtract({
      company: { abn: '11' },
      clients: [{ name: 'Acme', phone: '1' }],
      expenses: [{ description: 'Rent', amount: 100, recurrence: 'monthly' }],
    });
    const b = normalizeOnboardExtract({
      company: { name: 'Field Co', abn: '22' },
      clients: [{ name: 'acme', phone: '2' }, { name: 'Beta' }],
      expenses: [{ description: 'Rent', amount: 100, recurrence: 'monthly' }],
    });
    const merged = mergeOnboardExtracts([a, b]);
    expect(merged.company.name).toBe('Field Co');
    expect(merged.company.abn).toBe('11');
    expect(merged.clients.map(c => c.name)).toEqual(['Acme', 'Beta']);
    expect(merged.expenses).toHaveLength(1);
    expect(onboardExtractCounts(emptyOnboardExtract()).total).toBe(0);
    expect(onboardExtractCounts(merged).clients).toBe(2);
  });

  it('skips names the company already has and builds expense rows', () => {
    const have = nameKeySet(['Acme Electrical']);
    expect(alreadyHaveName('acme electrical', have)).toBe(true);
    expect(alreadyHaveName('New Co', have)).toBe(false);
    const patch = companyUpdateFromPatch({
      name: 'Field Co',
      abn: null,
      licence_number: null,
      phone: null,
      email: null,
      website: null,
      default_tax_rate: 10,
      default_material_markup: null,
    });
    expect(patch).toEqual({ name: 'Field Co', default_tax_rate: 10 });
    const row = expenseInsertFromExtract(
      {
        description: 'Workshop rent',
        amount: 2200,
        category: 'Rent',
        cost_class: 'overhead',
        vendor_name: 'Harbour',
        recurrence: 'monthly',
        notes: null,
      },
      'co-1',
      'user-1',
      '2026-08-26',
      10,
    );
    expect(row.company_id).toBe('co-1');
    expect(row.cost_class).toBe('overhead');
    expect(row.status).toBe('recorded');
    expect(row.recurrence).toBe('monthly');
    expect(row.tax_amount).toBe(220);
    expect(row.total).toBe(2420);
  });
});

describe('onboard wiring', () => {
  it('uses the company Anthropic key through an edge function and reviews before write', () => {
    const fn = src('supabase/functions/onboard-company-docs/index.ts');
    expect(fn).toContain('ai_settings');
    expect(fn).toContain('anthropic_api_key');
    expect(fn).toContain(ONBOARD_NO_KEY);
    expect(fn).toContain('api.anthropic.com');
    expect(fn).not.toContain('VITE_ANTHROPIC');
    expect(fn).not.toContain("from('clients').insert");
    expect(fn).not.toContain("from('expenses').insert");
    expect(src('src/pages/CompanyOnboardPage.tsx')).toContain('review');
    expect(src('src/pages/CompanyOnboardPage.tsx')).toContain('onboard-company-docs');
    expect(src('src/App.tsx')).toContain('/settings/onboard');
    expect(src('src/components/layout/AppShell.tsx')).toContain('/settings/onboard');
  });
});
