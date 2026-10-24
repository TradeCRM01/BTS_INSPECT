/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui';
import { dashboardTodayKey } from '../lib/dashboardHome';

type Row = Record<string, unknown>;

const h = vi.hoisted(() => ({
  jobs: [] as Row[],
}));

vi.mock('../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../components/crm/JobFormModal', () => ({
  JobFormModal: () => null,
}));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'u-1', company_id: 'co', name: 'QA', role: 'admin', email: 'qa@example.com' },
    company: { id: 'co', name: 'QA Co' },
  }),
}));
vi.mock('../lib/jobCardExtras', () => ({
  loadJobCardExtras: async () => ({ photoByJob: new Map(), docsByJob: new Map() }),
}));
vi.mock('../lib/supabase', () => {
  function match(row: Row, kind: string, col: string, val: unknown) {
    const raw = row[col];
    if (kind === 'eq') return String(raw) === String(val);
    if (kind === 'neq') return String(raw) !== String(val);
    if (kind === 'in') return (val as unknown[]).map(String).includes(String(raw));
    const date = String(raw ?? '').slice(0, 10);
    const bound = String(val);
    if (kind === 'gte') return date >= bound;
    if (kind === 'lte') return date <= bound;
    if (kind === 'gt') return date > bound;
    return true;
  }
  function rowsFor(table: string) {
    if (table === 'jobs') return h.jobs;
    if (table === 'profiles') return [{ id: 'u-1', dashboard_widgets_seeded: true }];
    return [];
  }
  function builder(table: string) {
    const filters: Array<{ kind: string; col: string; val: unknown }> = [];
    const result = () => {
      let rows = [...rowsFor(table)];
      for (const filter of filters) {
        if (filter.kind === 'limit') continue;
        rows = rows.filter(row => match(row, filter.kind, filter.col, filter.val));
      }
      if (table === 'profiles') return Promise.resolve({ data: rows[0] ?? null, error: null });
      return Promise.resolve({ data: rows, error: null });
    };
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (col: string, val: unknown) => { filters.push({ kind: 'eq', col, val }); return q; };
    q.neq = (col: string, val: unknown) => { filters.push({ kind: 'neq', col, val }); return q; };
    q.in = (col: string, val: unknown) => { filters.push({ kind: 'in', col, val }); return q; };
    q.gte = (col: string, val: unknown) => { filters.push({ kind: 'gte', col, val }); return q; };
    q.lte = (col: string, val: unknown) => { filters.push({ kind: 'lte', col, val }); return q; };
    q.gt = (col: string, val: unknown) => { filters.push({ kind: 'gt', col, val }); return q; };
    q.order = () => q;
    q.limit = (count: number) => { filters.push({ kind: 'limit', col: '', val: count }); return q; };
    q.update = () => q;
    q.insert = () => q;
    q.maybeSingle = result;
    q.single = result;
    q.then = (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => result().then(a, b);
    return q;
  }
  return {
    supabase: {
      from: (table: string) => builder(table),
      rpc: async () => ({ data: [], error: null }),
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel() {},
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
});

import { DashboardPage } from './DashboardPage';
import { JobsPage } from './JobsPage';

function job(over: Row): Row {
  return {
    id: 'j',
    company_id: 'co',
    client_id: null,
    title: 'Job',
    description: null,
    status: 'scheduled',
    priority: 'medium',
    scheduled_date: null,
    start_time: null,
    end_time: null,
    address: null,
    assigned_team: [],
    inspection_id: null,
    created_by: 'u-1',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    job_number: 1,
    color: null,
    budget: null,
    parent_job_id: null,
    cost_code: null,
    ...over,
  };
}

function seedNeedCrewPair() {
  const today = dashboardTodayKey();
  h.jobs = [
    job({
      id: 'undated',
      title: 'Undated switchboard',
      status: 'in_progress',
      scheduled_date: null,
      assigned_team: [],
      job_number: 40,
    }),
    job({
      id: 'dated',
      title: 'Dated switchboard',
      status: 'scheduled',
      scheduled_date: today,
      assigned_team: [],
      job_number: 41,
    }),
  ];
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  seedNeedCrewPair();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mount(page: React.ReactElement, path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            {page}
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
  });
  const started = Date.now();
  while (Date.now() - started < 4000) {
    const nodes = visibleNeedCrew();
    if (nodes.some(node => (node.textContent ?? '').includes('1 need crew'))) return;
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  }
  throw new Error(`need-crew count did not render on ${path}`);
}

function visibleNeedCrew() {
  return [...document.querySelectorAll('[data-need-crew-count]')].filter(node => {
    if (node.closest('.today-sr')) return false;
    const style = window.getComputedStyle(node);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

function assertVisibleCountOne() {
  const nodes = visibleNeedCrew();
  expect(nodes.length).toBeGreaterThan(0);
  expect(nodes.every(node => node.getAttribute('data-need-crew-count') === '1')).toBe(true);
  expect(nodes.some(node => (node.textContent ?? '').includes('1 need crew'))).toBe(true);
  expect(nodes.some(node => (node.textContent ?? '').includes('2 need crew'))).toBe(false);
  expect(document.querySelector('.today-sr [data-need-crew-count]')).toBeNull();
}

describe('need-crew visible count', () => {
  it('kills N2 Dashboard inline filter: 1 undated in-progress + 1 dated crewless → visible 1', async () => {
    await mount(<DashboardPage />, '/');
    assertVisibleCountOne();
  });

  it('kills N3 Jobs inline filter: 1 undated in-progress + 1 dated crewless → visible 1', async () => {
    await mount(<JobsPage />, '/jobs');
    assertVisibleCountOne();
  });

  it('keeps Dashboard and Jobs on countNeedsCrew, not a hidden today-sr figure', () => {
    const dashboard = readFileSync(resolve(process.cwd(), 'src/pages/DashboardPage.tsx'), 'utf8');
    const jobs = readFileSync(resolve(process.cwd(), 'src/pages/JobsPage.tsx'), 'utf8');
    const board = readFileSync(resolve(process.cwd(), 'src/pages/TodayBoardView.tsx'), 'utf8');
    expect(dashboard).toContain('countNeedsCrew(work)');
    expect(jobs).toContain('countNeedsCrew(filtered)');
    expect(dashboard).not.toContain('today-sr');
    expect(board).toContain('data-need-crew-count={needCrewCount}');
    expect(jobs).toContain('data-need-crew-count={needCrewCount}');
  });
});
