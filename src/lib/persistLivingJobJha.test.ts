import { beforeEach, describe, expect, it, vi } from 'vitest';

type Filter = { op: string; col: string; val: unknown };

const harness = vi.hoisted(() => ({
  updates: [] as Array<{ table: string; body: Record<string, unknown>; filters: Filter[] }>,
  selects: [] as Array<{ table: string; cols: string; filters: Filter[] }>,
  job: {
    id: 'job-1',
    title: 'New job',
    address: 'New St',
    assigned_team: [],
    company_id: 'co-1',
    client_id: 'client-new',
    inspection_id: null as string | null,
  },
  inspections: [] as Array<{
    id: string;
    meta: Record<string, string>;
    client_id: string | null;
    status: string;
    archived: boolean;
  }>,
}));

function matchesFilters(
  row: { id: string; status: string; archived: boolean; crm?: boolean },
  filters: Filter[],
  table: string,
): boolean {
  if (table !== 'inspections') return true;
  for (const filter of filters) {
    if (filter.op === 'eq' && filter.col === 'id' && row.id !== filter.val) return false;
    if (filter.op === 'eq' && filter.col === 'crm_job_id' && !row.crm) return false;
    if (filter.op === 'eq' && filter.col === 'archived' && row.archived !== filter.val) return false;
    if (filter.op === 'not' && filter.col === 'status') {
      const listed = String(filter.val).replace(/[()]/g, '').split(',');
      if (listed.includes(row.status)) return false;
    }
  }
  return true;
}

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      const filters: Filter[] = [];
      let cols = '';
      let pendingUpdate: Record<string, unknown> | null = null;
      const recordSelect = () => {
        if (table === 'inspections' && cols) {
          harness.selects.push({ table, cols, filters: [...filters] });
        }
      };
      const q: {
        select: (nextCols: string) => typeof q;
        eq: (col: string, val: unknown) => typeof q;
        not: (col: string, op: string, val: unknown) => typeof q;
        update: (body: Record<string, unknown>) => typeof q;
        maybeSingle: () => Promise<{ data: unknown; error: null }>;
        then: Promise<{ data: unknown; error: null }>['then'];
      } = {
        select(nextCols: string) {
          cols = nextCols;
          return q;
        },
        eq(col: string, val: unknown) {
          filters.push({ op: 'eq', col, val });
          return q;
        },
        not(col: string, op: string, val: unknown) {
          filters.push({ op: 'not', col, val: op === 'in' ? val : `${op}:${val}` });
          return q;
        },
        update(body: Record<string, unknown>) {
          pendingUpdate = body;
          return q;
        },
        maybeSingle() {
          if (pendingUpdate) {
            harness.updates.push({ table, body: pendingUpdate, filters: [...filters] });
          }
          recordSelect();
          if (table === 'jobs') return Promise.resolve({ data: harness.job, error: null });
          if (table === 'clients') return Promise.resolve({ data: { id: 'client-new', name: 'New Client' }, error: null });
          if (table === 'inspections') {
            const row = harness.inspections.find(item => matchesFilters({ ...item, crm: true }, filters, table));
            return Promise.resolve({ data: row ?? null, error: null });
          }
          return Promise.resolve({ data: null, error: null });
        },
        then(onFulfilled, onRejected) {
          if (pendingUpdate) {
            harness.updates.push({ table, body: pendingUpdate, filters: [...filters] });
          }
          recordSelect();
          let data: unknown = [];
          if (table === 'jha_documents') data = [];
          if (table === 'inspections') {
            data = harness.inspections.filter(item => matchesFilters({ ...item, crm: true }, filters, table));
          }
          return Promise.resolve({ data, error: null }).then(onFulfilled, onRejected);
        },
      };
      return q;
    },
    rpc: async () => ({ data: [], error: null }),
  },
}));

describe('persistLivingJobOnBoundJhas inspection sync', () => {
  beforeEach(() => {
    harness.updates = [];
    harness.selects = [];
    harness.job.inspection_id = null;
    harness.inspections = [];
  });

  it('does not update an issued linked inspection', async () => {
    harness.inspections = [{
      id: 'iss-1',
      meta: { siteName: 'Old St', siteAddress: 'Old St', clientName: 'Old Client' },
      client_id: 'client-old',
      status: 'issued',
      archived: false,
    }];
    const { persistLivingJobOnBoundJhas } = await import('./persistLivingJobJha');
    const result = await persistLivingJobOnBoundJhas('job-1');
    const inspUpdates = harness.updates.filter(row => row.table === 'inspections');
    expect(result.updated).toBe(0);
    expect(inspUpdates).toEqual([]);
    expect(harness.selects.some(row => (
      row.filters.some(filter => filter.op === 'not' && filter.col === 'status')
      && row.filters.some(filter => filter.op === 'eq' && filter.col === 'archived' && filter.val === false)
    ))).toBe(true);
  });

  it('updates a draft and keeps the finalised filter on the update', async () => {
    harness.inspections = [
      {
        id: 'draft-1',
        meta: { siteName: 'Old St', siteAddress: 'Old St' },
        client_id: 'client-old',
        status: 'draft',
        archived: false,
      },
      {
        id: 'iss-1',
        meta: { siteName: 'Old St', siteAddress: 'Old St' },
        client_id: 'client-old',
        status: 'issued',
        archived: false,
      },
    ];
    const { persistLivingJobOnBoundJhas } = await import('./persistLivingJobJha');
    await persistLivingJobOnBoundJhas('job-1');
    const inspUpdates = harness.updates.filter(row => row.table === 'inspections');
    expect(inspUpdates).toHaveLength(1);
    expect(inspUpdates[0].filters.some(filter => filter.op === 'eq' && filter.col === 'id' && filter.val === 'draft-1')).toBe(true);
    expect(inspUpdates[0].filters.some(filter => filter.op === 'eq' && filter.col === 'id' && filter.val === 'iss-1')).toBe(false);
    expect(inspUpdates[0].filters.some(filter => filter.op === 'not' && filter.col === 'status')).toBe(true);
    expect(inspUpdates[0].filters.some(filter => filter.op === 'eq' && filter.col === 'archived' && filter.val === false)).toBe(true);
  });

});
