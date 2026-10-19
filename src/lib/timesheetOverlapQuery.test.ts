import { beforeEach, describe, expect, it, vi } from 'vitest';

const queries: Array<Record<string, string>> = [];

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, string> = { table };
      const chain: {
        select: () => typeof chain;
        eq: (key: string, value: string) => typeof chain;
        gte: (key: string, value: string) => typeof chain;
        lte: (key: string, value: string) => Promise<{ data: unknown; error: null }>;
        in: (key: string, ids: string[]) => typeof chain;
        is: (key: string, value: unknown) => Promise<{ data: unknown; error: null }>;
        then: Promise<{ data: unknown; error: null }>['then'];
      } = {
        select: () => chain,
        eq: (key, value) => {
          q[key] = value;
          return chain;
        },
        gte: (key, value) => {
          q[`${key}>=`] = value;
          return chain;
        },
        lte: (key, value) => {
          q[`${key}<=`] = value;
          queries.push({ ...q });
          return Promise.resolve({ data: [{ id: 'ts-1' }], error: null });
        },
        in: () => chain,
        is: async () => {
          queries.push({ table, open: '1' });
          return { data: [], error: null };
        },
        then: (resolve, reject) => {
          queries.push({ ...q, awaited: '1' });
          return Promise.resolve({ data: [{ id: 'ts-1' }], error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  },
}));

describe('loadPersonTimeEntries', () => {
  beforeEach(() => {
    queries.length = 0;
  });

  it('filters timesheets by the person, not the company', async () => {
    const { loadPersonTimeEntries } = await import('./timesheetOverlapQuery');
    await loadPersonTimeEntries({
      employeeId: 'emp-1',
      date: '2026-10-19',
    });
    const person = queries.find(row => row.employee_id === 'emp-1');
    expect(person).toBeTruthy();
    expect(person?.company_id).toBeUndefined();
    expect(queries.some(row => row['date>='] === '2026-10-18')).toBe(true);
  });
});

describe('loadPersonTimeEntries audit', () => {
  it('keeps another person\'s audit entries out of the overlap set', async () => {
    vi.resetModules();
    vi.doMock('./devFieldAuditAuth', () => ({
      isDevFieldAuditAuth: () => true,
    }));
    vi.doMock('./timesheetsList', () => ({
      getAuditTimesheets: () => ([
        { id: 'mine', employee_id: 'emp-1' },
        { id: 'other', employee_id: 'emp-2' },
      ]),
      getAuditTimesheetEntries: () => ([
        { id: 'a', timesheet_id: 'mine', start_time: '2026-10-19T09:00:00', end_time: '2026-10-19T10:00:00' },
        { id: 'b', timesheet_id: 'other', start_time: '2026-10-19T09:00:00', end_time: '2026-10-19T10:00:00' },
        { id: 'open-y', timesheet_id: 'mine', start_time: '2026-10-18T22:00:00', end_time: null },
      ]),
    }));
    const { loadPersonTimeEntries } = await import('./timesheetOverlapQuery');
    const rows = await loadPersonTimeEntries({
      employeeId: 'emp-1',
      date: '2026-10-19',
    });
    expect(rows.map(r => r.id).sort()).toEqual(['a', 'open-y']);
  });
});
