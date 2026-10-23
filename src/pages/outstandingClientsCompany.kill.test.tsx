/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui';

type Call = { table: string; filters: Array<{ kind: string; col: string; val: unknown }> };

const h = vi.hoisted(() => ({
  calls: [] as Call[],
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
  function builder(table: string) {
    const call: Call = { table, filters: [] };
    h.calls.push(call);
    const q: Record<string, unknown> = {};
    const result = () => {
      if (table === 'invoices') {
        return Promise.resolve({
          data: [{
            id: 'inv-1',
            invoice_number: 108,
            status: 'overdue',
            total: 462,
            amount_paid: 0,
            due_date: '2026-10-09',
            client_id: 'cl-1',
            created_at: '2026-09-01',
          }],
          error: null,
        });
      }
      if (table === 'clients') {
        return Promise.resolve({ data: [{ id: 'cl-1', name: 'Stafford Bowls Club', company_id: 'co' }], error: null });
      }
      if (table === 'profiles') return Promise.resolve({ data: { id: 'u-1', dashboard_widgets_seeded: true }, error: null });
      return Promise.resolve({ data: [], error: null });
    };
    q.select = () => q;
    q.eq = (col: string, val: unknown) => { call.filters.push({ kind: 'eq', col, val }); return q; };
    q.neq = (col: string, val: unknown) => { call.filters.push({ kind: 'neq', col, val }); return q; };
    q.in = (col: string, val: unknown) => { call.filters.push({ kind: 'in', col, val }); return q; };
    q.gte = () => q;
    q.lte = () => q;
    q.gt = () => q;
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

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  h.calls.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('outstanding-clients company_id', () => {
  it('kills an outstanding-clients lookup that drops company_id', async () => {
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
    let clientCalls: Call[] = [];
    const isScoped = (call: Call) => (
      call.table === 'clients'
      && call.filters.some(filter => filter.kind === 'eq' && filter.col === 'company_id' && filter.val === 'co')
      && call.filters.some(filter => filter.kind === 'in' && filter.col === 'id' && Array.isArray(filter.val) && filter.val.map(String).includes('cl-1'))
    );
    while (Date.now() - started < 4000) {
      clientCalls = h.calls.filter(isScoped);
      if (clientCalls.length) break;
      await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    }
    expect(clientCalls.some(call => (
      call.filters.some(filter => filter.kind === 'eq' && filter.col === 'company_id' && filter.val === 'co')
      && call.filters.some(filter => filter.kind === 'in' && filter.col === 'id' && Array.isArray(filter.val) && filter.val.map(String).includes('cl-1'))
    )), `outstanding-clients company_id: ${JSON.stringify(h.calls.filter(c => c.table === 'clients'))}`).toBe(true);
  });
});
