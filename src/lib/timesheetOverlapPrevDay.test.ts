import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: unknown[] = [];
const sheets = [{ id: 'ts-y', date: '2026-10-20', employee_id: 'emp-1' }];
const entries = [
  { id: 'e-over', timesheet_id: 'ts-y', start_time: '2026-10-20T23:00:00+10:00', end_time: '2026-10-21T01:00:00+10:00' },
  { id: 'e-open', timesheet_id: 'ts-y', start_time: '2026-10-20T22:00:00+10:00', end_time: null },
];

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => {
      const f: Record<string, unknown> = {};
      const q: {
        select: () => typeof q;
        eq: (k: string, v: unknown) => typeof q;
        gte: (k: string, v: string) => typeof q;
        lte: (k: string, v: string) => Promise<{ data: unknown; error: null }>;
        in: (k: string, ids: string[]) => typeof q;
        is: (k: string, v: unknown) => Promise<{ data: unknown; error: null }>;
        then: Promise<{ data: unknown; error: null }>['then'];
      } = {
        select: () => q,
        eq: (k, v) => {
          f[k] = v;
          return q;
        },
        gte: (k, v) => {
          f[`${k}>=`] = v;
          return q;
        },
        lte: (k, v) => {
          f[`${k}<=`] = v;
          calls.push({ table, ...f });
          const rows = sheets.filter(s =>
            s.employee_id === f.employee_id
            && s.date >= (f['date>='] as string)
            && s.date <= v
          );
          return Promise.resolve({ data: rows, error: null });
        },
        in: (_k, ids) => {
          f.ids = ids;
          return q;
        },
        is: (_k, v) => {
          calls.push({ table, open: true, ...f });
          const rows = entries.filter(e => (f.ids as string[] | undefined)?.includes(e.timesheet_id) && e.end_time === v);
          return Promise.resolve({ data: rows, error: null });
        },
        then: (resolve, reject) => {
          if (table === 'timesheets' && !('date>=' in f)) {
            const rows = sheets.filter(s => s.employee_id === f.employee_id);
            calls.push({ table, all: true, ...f });
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          }
          if (table === 'timesheet_entries') {
            const rows = entries.filter(e => (f.ids as string[] | undefined)?.includes(e.timesheet_id));
            calls.push({ table, ranged: true, ...f });
            return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return q;
    },
  },
}));

vi.mock('./devFieldAuditAuth', () => ({
  isDevFieldAuditAuth: () => false,
}));

import { jobClockOffBlocked, jobClockOnBlocked, loadPersonTimeEntries } from './timesheetOverlapQuery';
import { clockOnSaveError, timeEntrySaveError, TIME_ENTRY_OVERLAP_MESSAGE, TIME_ENTRY_ZERO_LENGTH_MESSAGE } from './dateTimeIntegrity';

describe('overlap previous day and open clock-ons', () => {
  beforeEach(() => {
    process.env.TZ = 'Australia/Brisbane';
    calls.length = 0;
  });

  it('loads yesterday\'s overnight wrap and open clock-on for today\'s save', async () => {
    const sib = await loadPersonTimeEntries({ employeeId: 'emp-1', date: '2026-10-21' });
    expect(sib.map(r => r.id).sort()).toEqual(['e-open', 'e-over']);
    expect(timeEntrySaveError({
      date: '2026-10-21',
      start: '00:30',
      end: '02:00',
      existing: sib,
      now: '2026-10-21T09:00:00+10:00',
    })).toBe(TIME_ENTRY_OVERLAP_MESSAGE);
    expect(clockOnSaveError({
      now: '2026-10-21T09:00:00+10:00',
      existing: sib,
    })).toBe(TIME_ENTRY_OVERLAP_MESSAGE);
  });

  it('includes the next calendar day when endsNextDay is on', async () => {
    await loadPersonTimeEntries({ employeeId: 'emp-1', date: '2026-10-21', endsNextDay: true });
    const ranged = calls.find(c => typeof c === 'object' && c && 'date>=' in (c as object) && 'date<=' in (c as object)) as { 'date>=': string; 'date<=': string };
    expect(ranged['date>=']).toBe('2026-10-20');
    expect(ranged['date<=']).toBe('2026-10-22');
  });

  it('blocks clock-on and clock-off through the page guards', async () => {
    const onErr = await jobClockOnBlocked({
      employeeId: 'emp-1',
      now: '2026-10-21T09:00:00+10:00',
    });
    expect(onErr).toBe(TIME_ENTRY_OVERLAP_MESSAGE);
    const offErr = await jobClockOffBlocked({
      employeeId: 'emp-1',
      startIso: '2026-10-21T07:45:10+10:00',
      endIso: '2026-10-21T07:45:40+10:00',
    });
    expect(offErr).toBe(TIME_ENTRY_ZERO_LENGTH_MESSAGE);
  });
});
