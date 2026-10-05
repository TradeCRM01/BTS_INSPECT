import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { portalClientQuotes } from './portalClientQuotes';

describe('portalClientQuotes', () => {
  it('excludes a draft quote from the portal list and still shows a sent quote', () => {
    const listed = portalClientQuotes([
      { id: 'q-draft', quote_number: '0005', status: 'draft' },
      { id: 'q-sent', quote_number: '0006', status: 'sent' },
    ]);
    expect(listed).toEqual([
      { id: 'q-sent', quote_number: '0006', status: 'sent' },
    ]);

    const edge = readFileSync(resolve(process.cwd(), 'supabase/functions/client-portal/index.ts'), 'utf8');
    const listSelect = '.select("id, quote_number, status, job_id, total, validity_date, updated_at")';
    const start = edge.indexOf(listSelect);
    expect(start).toBeGreaterThan(-1);
    const query = edge.slice(start, edge.indexOf('.limit(50)', start));
    expect(query).toContain('.neq("status", "draft")');
  });
});
