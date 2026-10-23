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
}));

vi.mock('../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'u-1', company_id: 'co', name: 'QA', role: h.role, email: 'qa@example.com' },
    company: { id: 'co', name: 'Northside Plumbing & Gas' },
  }),
}));
vi.mock('../lib/supabase', () => {
  function builder() {
    const result = () => Promise.resolve({ data: [], error: null });
    const q: Record<string, unknown> = {};
    q.select = () => q;
    q.eq = () => q;
    q.neq = () => q;
    q.in = () => q;
    q.gte = () => q;
    q.lte = () => q;
    q.gt = () => q;
    q.order = () => q;
    q.limit = () => q;
    q.update = () => q;
    q.insert = () => q;
    q.maybeSingle = () => Promise.resolve({ data: { dashboard_widgets_seeded: true }, error: null });
    q.single = result;
    q.then = (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => result().then(a, b);
    return q;
  }
  return {
    supabase: {
      from: () => builder(),
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
  h.role = 'admin';
  h.widgets = [{
    id: 'w-jobs',
    widget_type: 'upcoming_jobs',
    grid_x: 20,
    grid_y: 20,
    grid_w: 390,
    grid_h: 270,
    config: {},
  }];
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
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
    if (document.querySelector('[data-today-section="s10"]')) return;
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  }
  throw new Error('today board did not mount');
}

describe('P1b Today board layout', () => {
  it('kills a mutant that swaps Today\'s jobs and Needs you: section tops stay monotone', async () => {
    await mountPage();
    const ids = [...document.querySelectorAll('[data-today-section]')]
      .map(node => node.getAttribute('data-today-section'));
    expect(ids).toEqual(['s1', 's2', 's3', 's4', 's6', 's10', 's11', 's13', 's14', 's15', 's12']);
    expect(container.textContent).toContain("Today's jobs");
    expect(container.textContent).toContain('Needs you');
    expect(container.textContent).toContain('Coming up');
    expect(container.textContent).toContain('Cash flow');
    expect(container.textContent).not.toMatch(/booking/i);
    expect(ids.indexOf('s10')).toBeLessThan(ids.indexOf('s11'));
  });
});
