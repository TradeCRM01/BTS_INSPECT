/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  role: 'admin' as string,
  widgets: [] as Row[],
  invoices: [] as Row[],
  quotes: [] as Row[],
}));

vi.mock('../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'u-1', company_id: 'co', name: 'QA', role: h.role, email: 'qa@example.com' },
    company: { id: 'co', name: 'QA Co' },
  }),
}));
vi.mock('../lib/supabase', () => {
  function match(row: Row, kind: string, col: string, val: unknown) {
    const raw = row[col];
    if (kind === 'eq') return String(raw) === String(val);
    if (kind === 'in') return (val as unknown[]).map(String).includes(String(raw));
    const date = String(raw ?? '').slice(0, 10);
    const bound = String(val);
    if (kind === 'gte') return date >= bound;
    if (kind === 'lte') return date <= bound;
    return true;
  }
  function rowsFor(table: string) {
    if (table === 'dashboard_widgets') return h.widgets;
    if (table === 'invoices') return h.invoices;
    if (table === 'quotes') return h.quotes;
    if (table === 'profiles') return [{ id: 'u-1', dashboard_widgets_seeded: true }];
    return [];
  }
  function builder(table: string) {
    const filters: Array<{ kind: string; col: string; val: unknown }> = [];
    const result = () => {
      let rows = [...rowsFor(table)];
      for (const filter of filters) rows = rows.filter(row => match(row, filter.kind, filter.col, filter.val));
      if (table === 'profiles') return Promise.resolve({ data: rows[0] ?? null, error: null });
      return Promise.resolve({ data: rows, error: null });
    };
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = (col: string, val: unknown) => { filters.push({ kind: 'eq', col, val }); return q; };
    q.in = (col: string, val: unknown) => { filters.push({ kind: 'in', col, val }); return q; };
    q.gte = (col: string, val: unknown) => { filters.push({ kind: 'gte', col, val }); return q; };
    q.lte = (col: string, val: unknown) => { filters.push({ kind: 'lte', col, val }); return q; };
    q.order = () => q;
    q.limit = () => q;
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

const WIDGETS = [
  { id: 'w-jobs', widget_type: 'upcoming_jobs', grid_x: 20, grid_y: 20, grid_w: 390, grid_h: 270, config: {} },
  { id: 'w-invoices', widget_type: 'outstanding_invoices', grid_x: 420, grid_y: 20, grid_w: 260, grid_h: 180, config: {} },
  { id: 'w-cash', widget_type: 'cash_flow', grid_x: 700, grid_y: 20, grid_w: 260, grid_h: 180, config: {} },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  h.role = 'admin';
  h.widgets = JSON.parse(JSON.stringify(WIDGETS));
  h.invoices = [{
    id: 'pp1',
    invoice_number: 112,
    status: 'part_paid',
    total: 1929.65,
    amount_paid: 0,
    due_date: '2026-10-30',
    updated_at: '2026-10-01T00:00:00.000Z',
    created_at: '2026-10-01T00:00:00.000Z',
    chased_at: null,
    client_id: null,
  }];
  h.quotes = [{
    id: 'q1',
    quote_number: 8,
    status: 'sent',
    updated_at: '2026-10-01T00:00:00.000Z',
    sent_at: '2026-10-01T00:00:00.000Z',
    chased_at: null,
    validity_date: '2026-10-30',
    total: 440,
    client_id: null,
  }];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mountPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/']}>
            <DashboardPage />
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
  });
  const started = Date.now();
  while (Date.now() - started < 4000) {
    if (document.querySelector('[data-dashboard-view-grid="1"] .dashboard-home-widget')) return;
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  }
  throw new Error('dashboard widgets did not mount');
}

function moneyWidgets() {
  return ['w-invoices', 'w-cash'].filter(id => document.querySelector(`[data-dashboard-widget-id="${id}"]`));
}

describe('C2 today money role gate', () => {
  it('kills crew render of / : no currency glyph and no $ widget', async () => {
    h.role = 'member';
    await mountPage();
    expect(moneyWidgets()).toEqual([]);
    expect(document.querySelector('[data-nudge-kind="invoice_unpaid"]')).toBeNull();
    expect(document.querySelector('[data-nudge-kind="quote_chase"]')).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/\$/);
    expect(h.widgets.map(row => row.widget_type)).toContain('outstanding_invoices');
    expect(h.widgets.map(row => row.widget_type)).toContain('cash_flow');
  });

  it('kills owner/admin render of / : money widgets and $ amounts stay visible', async () => {
    h.role = 'admin';
    await mountPage();
    expect(moneyWidgets()).toEqual(['w-invoices', 'w-cash']);
    expect(container.textContent).toMatch(/\$/);
    expect(document.querySelector('[data-nudge-kind="invoice_unpaid"]')).not.toBeNull();
    expect(document.querySelector('[data-nudge-kind="quote_chase"]')).not.toBeNull();
  });
});
