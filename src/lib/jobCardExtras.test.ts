import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { JOB_ID_BATCH } from './jobIdBatch';
import {
  JOB_EXTRAS_INVOICE_COLUMNS,
  JOB_EXTRAS_INVOICE_SELECT,
  JOB_EXTRAS_QUOTE_COLUMNS,
  JOB_EXTRAS_QUOTE_SELECT,
  loadJobCardExtras,
  type JobExtrasClient,
} from './jobCardExtras';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

type Call = { table: string; columns: string; column: string; ids: string[] };

function extrasClient(opts?: {
  errorOn?: string;
  invoices?: Array<Record<string, unknown>>;
}): { client: JobExtrasClient; calls: Call[] } {
  const calls: Call[] = [];
  const client: JobExtrasClient = {
    from(table) {
      return {
        select(columns) {
          return {
            async in(column, ids) {
              calls.push({ table, columns, column, ids: [...ids] });
              if (opts?.errorOn === table) {
                return { data: null, error: { message: `${table} failed` } };
              }
              if (table === 'invoices') {
                return { data: opts?.invoices ?? [], error: null };
              }
              return { data: [], error: null };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

describe('loadJobCardExtras', () => {
  it('throws when an extras read errors so Ready to invoice cannot go false-green', async () => {
    const { client } = extrasClient({ errorOn: 'invoices' });
    await expect(loadJobCardExtras([{ id: 'j1' }], client)).rejects.toThrow('invoices failed');
  });

  it('chunks extras lookups at 100 ids and never sends 101 in one in()', async () => {
    const ids = Array.from({ length: 101 }, (_, i) => `j${i}`);
    const { client, calls } = extrasClient();
    await loadJobCardExtras(ids.map((id) => ({ id })), client);
    expect(calls.every((call) => call.ids.length <= JOB_ID_BATCH)).toBe(true);
    expect(calls.some((call) => call.ids.length === 101)).toBe(false);
    const invoiceCalls = calls.filter((call) => call.table === 'invoices');
    expect(invoiceCalls).toHaveLength(2);
    expect(invoiceCalls[0].ids).toHaveLength(100);
    expect(invoiceCalls[1].ids).toHaveLength(1);
  });

  it('keeps the extras select columns inside the P3 schema snapshot', async () => {
    const { client, calls } = extrasClient({
      invoices: [{ id: 'inv1', job_id: 'j1', invoice_number: 36, status: 'draft', total: 10, due_date: null }],
    });
    const extras = await loadJobCardExtras([{ id: 'j1' }], client);
    expect(extras.docsByJob.get('j1')?.[0]?.status).toBe('draft');
    expect(calls[0].columns).toBe(JOB_EXTRAS_QUOTE_SELECT);
    expect(calls.find((call) => call.table === 'invoices')?.columns).toBe(JOB_EXTRAS_INVOICE_SELECT);
    expect([...JOB_EXTRAS_QUOTE_COLUMNS]).toEqual(['id', 'job_id', 'quote_number', 'status', 'total']);
    expect([...JOB_EXTRAS_INVOICE_COLUMNS]).toEqual(['id', 'job_id', 'invoice_number', 'status', 'total', 'due_date']);
  });
});

describe('cover-photo signing drop', () => {
  it('drops unused extras cover signing after a search that found no list render', () => {
    const extras = src('src/lib/jobCardExtras.ts');
    const page = src('src/pages/JobsPage.tsx');
    expect(extras).not.toContain('createSignedUrl');
    expect(extras).not.toContain("from('photos')");
    expect(extras).not.toContain('photoByJob');
    expect(page).not.toMatch(/src=\{[^}]*cover_photo_url/);
    expect(page).not.toMatch(/cover_photo_url\s*\?/);
    expect(page).not.toContain('photoByJob.get');
  });
});
