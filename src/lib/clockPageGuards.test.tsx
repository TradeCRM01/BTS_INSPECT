/**
 * @vitest-environment jsdom
 */
process.env.TZ = 'Australia/Brisbane';

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { JobDetailPage } from '../pages/JobDetailPage';
import { TimesheetsPage } from '../pages/TimesheetsPage';
import { format, startOfWeek } from 'date-fns';
import {
  TIME_ENTRY_OVERLAP_MESSAGE,
  TIME_ENTRY_ZERO_LENGTH_MESSAGE,
  formatClockFinishLabel,
} from './dateTimeIntegrity';

const { writes, clockOnBlocked, clockOffBlocked, state, chain, weekStart, timesheets, entriesFor } = vi.hoisted(() => {
  process.env.TZ = 'Australia/Brisbane';
  const writes: unknown[] = [];
  const clockOnBlocked = vi.fn(async (..._args: unknown[]) => 'This overlaps another time entry for this person.');
  const clockOffBlocked = vi.fn(async (..._args: unknown[]) => 'End time must be after start.');
  function ymd(d: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Australia/Brisbane',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d);
  }
  const now = new Date();
  const today = ymd(now);
  const monday = new Date(now);
  const dow = now.getDay();
  monday.setDate(now.getDate() + (dow === 0 ? -6 : 1 - dow));
  const weekStart = ymd(monday);
  const next = new Date(monday);
  next.setDate(monday.getDate() + 1);
  const nextDay = ymd(next);
  const state = { running: false };
  const job = {
    id: 'job-1',
    company_id: 'co-1',
    client_id: 'cl-1',
    title: 'Site works',
    description: 'Labour',
    status: 'scheduled',
    priority: 'medium',
    scheduled_date: today,
    start_time: '08:00',
    end_time: '16:00',
    address: '1 Test St',
    assigned_team: ['emp-1'],
    inspection_id: null,
    created_by: 'emp-1',
    created_at: `${today}T00:00:00.000Z`,
    updated_at: `${today}T00:00:00.000Z`,
    job_number: 9,
    color: null,
    budget: null,
    parent_job_id: null,
    cost_code: null,
  };
  const timesheets = [{
    id: 'ts-1',
    company_id: 'co-1',
    employee_id: 'emp-1',
    date: today,
    clock_in: `${today}T07:45:10+10:00`,
    clock_out: null,
    status: 'open',
    total_minutes: 0,
    created_at: `${today}T00:00:00.000Z`,
    updated_at: `${today}T00:00:00.000Z`,
  }];
  const overnight = {
    id: 'e-over',
    timesheet_id: 'ts-1',
    company_id: 'co-1',
    job_id: 'job-1',
    start_time: `${weekStart}T23:00:00+10:00`,
    end_time: `${nextDay}T01:00:00+10:00`,
    work_type: 'Labour',
    billable: true,
    notes: null,
    created_at: `${weekStart}T00:00:00.000Z`,
  };
  function rowsFor(table: string) {
    if (table === 'jobs') return [job];
    if (table === 'clients') return [{ id: 'cl-1', name: 'Northside', email: 'a@example.com', phone: '0400000000', address: '1 Test St', archived: false }];
    if (table === 'profiles') return [{ id: 'emp-1', name: 'Sam', company_id: 'co-1' }];
    if (table === 'timesheets') return timesheets;
    if (table === 'timesheet_entries') {
      const open = {
        id: 'e-open',
        timesheet_id: 'ts-1',
        company_id: 'co-1',
        job_id: 'job-1',
        start_time: `${today}T07:45:10+10:00`,
        end_time: state.running ? null : `${today}T16:00:00+10:00`,
        work_type: 'Labour',
        billable: true,
        notes: null,
        created_at: `${today}T00:00:00.000Z`,
      };
      return [open, overnight];
    }
    return [];
  }
  function chain(table: string) {
    const result = Promise.resolve({ data: rowsFor(table), error: null });
    const q: Record<string, unknown> = {};
    const api = {
      select: () => api,
      eq: () => api,
      neq: () => api,
      gte: () => api,
      lte: () => api,
      in: () => api,
      is: () => api,
      order: () => Object.assign(Promise.resolve({ data: rowsFor(table), error: null }), api),
      limit: () => Object.assign(Promise.resolve({ data: rowsFor(table), error: null }), api),
      insert: (row: unknown) => {
        writes.push({ table, op: 'insert', row });
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { id: 'new-1' }, error: null }),
          }),
        };
      },
      update: (row: unknown) => {
        writes.push({ table, op: 'update', row });
        return {
          eq: () => Promise.resolve({ error: null }),
        };
      },
      maybeSingle: () => Promise.resolve({ data: rowsFor(table)[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: rowsFor(table)[0] ?? { id: 'row-1' }, error: null }),
      then: result.then.bind(result),
    };
    Object.assign(q, api);
    return api;
  }
  return {
    writes,
    clockOnBlocked,
    clockOffBlocked,
    state,
    chain,
    weekStart,
    timesheets,
    entriesFor: () => rowsFor('timesheet_entries'),
  };
});

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => chain(table),
    rpc: () => Promise.resolve({
      data: [{ id: 'emp-1', name: 'Sam', email: 'sam@example.com', role: 'admin' }],
      error: null,
    }),
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    storage: { from: () => ({ upload: () => Promise.resolve({ error: null }) }) },
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'emp-1', company_id: 'co-1', name: 'Sam' },
    company: { name: 'Grafter', default_tax_rate: 10 },
  }),
}));

vi.mock('./devFieldAuditAuth', () => ({
  isDevFieldAuditAuth: () => false,
  pageQueryBlocked: () => false,
}));

vi.mock('./timesheetOverlapQuery', async () => {
  const actual = await vi.importActual<typeof import('./timesheetOverlapQuery')>('./timesheetOverlapQuery');
  return {
    ...actual,
    jobClockOnBlocked: (...args: unknown[]) => clockOnBlocked(...args),
    jobClockOffBlocked: (...args: unknown[]) => clockOffBlocked(...args),
  };
});

vi.mock('../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../components/ui/OverlayPortal', () => ({
  OverlayPortal: ({ children }: { children: ReactNode }) => children,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  process.env.TZ = 'Australia/Brisbane';
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  writes.length = 0;
  state.running = false;
  clockOnBlocked.mockClear();
  clockOffBlocked.mockClear();
  clockOnBlocked.mockResolvedValue(TIME_ENTRY_OVERLAP_MESSAGE);
  clockOffBlocked.mockResolvedValue(TIME_ENTRY_ZERO_LENGTH_MESSAGE);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function providers(node: ReactNode, path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: path.startsWith('/timesheets') ? Infinity : 0 } },
  });
  if (path.startsWith('/timesheets')) {
    const team = [{ id: 'emp-1', name: 'Sam', email: 'sam@example.com', role: 'admin' }];
    client.setQueryData(['team-members'], team);
    client.setQueryData(['timesheets', weekStart, null], timesheets);
    client.setQueryData(['timesheets', weekStart, 'emp-1'], timesheets);
    client.setQueryData(['timesheet-entries', 'emp-1', weekStart], entriesFor());
    client.setQueryData(['jobs-for-timesheets'], [{ id: 'job-1', title: 'Site works', job_number: 9 }]);
    client.setQueryData(['billed-timesheet-entry-ids', 'job-1'], { billingCheckOk: true, ids: new Set() });
  }
  const routed = path.startsWith('/jobs')
    ? (
      <Routes>
        <Route path="/jobs/:id" element={node} />
      </Routes>
    )
    : node;
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[path]}>
          {routed}
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}

function clickLabel(label: string) {
  const btn = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === label);
  if (!btn) throw new Error(`missing ${label}`);
  btn.click();
}

describe('JobDetail clock guards', () => {
  it('Clock on stays blocked and writes nothing', async () => {
    await act(async () => {
      root.render(providers(<JobDetailPage />, '/jobs/job-1'));
    });
    await flush();
    await act(async () => { clickLabel('Clock on'); });
    await flush();
    expect(clockOnBlocked).toHaveBeenCalled();
    expect(writes.filter(w => (w as { table?: string }).table === 'timesheet_entries')).toEqual([]);
    expect(document.body.textContent).toContain(TIME_ENTRY_OVERLAP_MESSAGE);
  });

  it('Clock off stays blocked and writes nothing', async () => {
    state.running = true;
    await act(async () => {
      root.render(providers(<JobDetailPage />, '/jobs/job-1'));
    });
    await flush();
    await act(async () => { clickLabel('Clock off'); });
    await flush();
    expect(clockOffBlocked).toHaveBeenCalled();
    expect(writes.filter(w => (w as { op?: string }).op === 'update')).toEqual([]);
    expect(document.body.textContent).toContain(TIME_ENTRY_ZERO_LENGTH_MESSAGE);
  });
});

describe('Timesheets clock guards', () => {
  it('Clock Out stays blocked and writes nothing', async () => {
    state.running = true;
    await act(async () => {
      root.render(providers(<TimesheetsPage />, '/timesheets'));
    });
    await flush();
    if (!document.body.textContent?.includes('Timesheets')) {
      throw new Error(`timesheets missing html=${container.innerHTML.slice(0, 400)} body=${(document.body.textContent ?? '').slice(0, 200)}`);
    }
    const out = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes('Clock Out'));
    if (!out) {
      throw new Error(`no Clock Out in ${[...document.querySelectorAll('button')].map(b => b.textContent).join('|')}`);
    }
    await act(async () => { out.click(); });
    await flush();
    expect(clockOffBlocked).toHaveBeenCalled();
    expect(writes.filter(w => (w as { op?: string }).op === 'update')).toEqual([]);
  });

  it('ledger finish keeps the next-day (+1) label', async () => {
    const start = `${format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd')}T23:00:00+10:00`;
    const next = format(new Date(startOfWeek(new Date(), { weekStartsOn: 1 }).getTime() + 86400000), 'yyyy-MM-dd');
    const end = `${next}T01:00:00+10:00`;
    expect(formatClockFinishLabel(start, end)).toBe('01:00 (+1)');
    await act(async () => {
      root.render(providers(<TimesheetsPage />, '/timesheets?id=ts-1'));
    });
    await flush();
    const finishes = [...document.querySelectorAll('.hub-timesheets-ledger-finish')];
    expect(finishes.some(el => (el.textContent ?? '').includes('(+1)'))).toBe(true);
  });
});
