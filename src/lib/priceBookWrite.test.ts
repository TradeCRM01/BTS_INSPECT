import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { priceBookWritePayload } from './priceBookWrite';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('priceBookWritePayload', () => {
  it('keeps the full price book name, including an em dash', () => {
    const payload = priceBookWritePayload({
      companyId: 'co1',
      name: 'Prove book — delete ok',
      description: '',
      isDefault: false,
      now: new Date('2026-10-05T00:00:00.000Z'),
    });
    expect(payload.name).toBe('Prove book — delete ok');
    expect(payload.name).not.toBe('Pr');
    expect(payload.name.length).toBe(22);
    expect(payload.description).toBeNull();
    expect(payload.company_id).toBe('co1');
  });
});

describe('price book name field', () => {
  it('saves through priceBookWritePayload and can open Edit on the existing page', () => {
    const page = src('src/pages/PriceBooksPage.tsx');
    expect(page).toContain('priceBookWritePayload');
    expect(page).toContain('setEditingBook(pb)');
    expect(page).toContain('Edit price book');
    const form = page.slice(page.indexOf('function PriceBookForm'));
    expect(form).toContain('value={form.name}');
    expect(form).not.toMatch(/maxLength/);
    expect(form).not.toMatch(/slice\(0/);
  });
});
