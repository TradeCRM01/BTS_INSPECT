/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { todayIsoDate } from '../lib/invoiceStatus';

type Row = Record<string, unknown>;
const h = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'u-1', company_id: 'co', name: 'QA', role: 'admin' },
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
  function builder(table: string) {
    const filters: Array<{ kind: string; col: string; val: unknown }> = [];
    const result = () => {
      let rows = [...(h.tables[table] ?? [])];
      for (const filter of filters) rows = rows.filter(row => match(row, filter.kind, filter.col, filter.val));
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
    q.then = (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => result().then(a, b);
    return q;
  }
  return { supabase: { from: (table: string) => builder(table) } };
});

import { CashFlowWidget } from './IntelligenceWidgets';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  h.tables = {
    invoice_payments: [
      { company_id: 'co', amount: 4214.30, paid_at: todayIsoDate(), invoice_id: 'inv-1' },
    ],
    expenses: [
      { company_id: 'co', total: 1862.75, expense_date: todayIsoDate(), status: 'recorded', cost_class: 'cogs' },
    ],
    invoices: [],
    purchase_orders: [{ total: 99, status: 'sent', created_at: new Date().toISOString() }],
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mountWidget() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <CashFlowWidget />
      </QueryClientProvider>,
    );
  });
  const started = Date.now();
  while (Date.now() - started < 4000) {
    if (container.textContent?.includes('$4,214.30')) return;
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  }
}

describe('CashFlowWidget F1', () => {
  it('kills In > 0 on a seeded invoice_payments row', async () => {
    await mountWidget();
    expect(container.textContent).toContain('$4,214.30');
    expect(container.textContent).toContain('$1,862.75');
    expect(container.textContent).not.toContain('$99.00');
  });
});
