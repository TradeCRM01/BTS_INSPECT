import { beforeEach, describe, expect, it, vi } from 'vitest';

const queries: Array<Record<string, string>> = [];

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      const q: Record<string, string> = { table };
      return {
        select: () => ({
          eq: (key: string, value: string) => {
            q[key] = value;
            return {
              gte: () => ({
                lte: async () => {
                  queries.push({ ...q });
                  return { data: [{ id: 'ts-1' }], error: null };
                },
              }),
            };
          },
          in: async () => {
            queries.push({ table, timesheet_id: 'in' });
            return { data: [], error: null };
          },
        }),
      };
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
    expect(queries[0]).toMatchObject({
      table: 'timesheets',
      employee_id: 'emp-1',
    });
    expect(queries[0].company_id).toBeUndefined();
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
      ]),
    }));
    const { loadPersonTimeEntries } = await import('./timesheetOverlapQuery');
    const rows = await loadPersonTimeEntries({
      employeeId: 'emp-1',
      date: '2026-10-19',
    });
    expect(rows.map(r => r.id)).toEqual(['a']);
  });
});
