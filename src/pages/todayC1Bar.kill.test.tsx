/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui';
import { NAV_WORDS } from '../lib/brand';

vi.mock('../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'u-1', company_id: 'co', name: 'QA', role: 'admin', email: 'qa@example.com' },
    company: { id: 'co', name: 'QA Co' },
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
const reminder = {
  id: 'r1',
  ownerId: 'u-1',
  title: 'Call Mia',
  details: '',
  dueAt: new Date(2026, 9, 19, 9, 0).toISOString(),
  jobId: null,
  relatedHref: null,
  completed: false,
  completedAt: null,
  visibility: 'private' as const,
  taggedUserIds: [],
  createdAt: new Date(2026, 9, 19).toISOString(),
};

vi.mock('../lib/reminders', async () => {
  const actual = await vi.importActual<typeof import('../lib/reminders')>('../lib/reminders');
  return {
    ...actual,
    listReminders: async () => [],
    listReminderJobs: async () => [],
    listReminderCrew: async () => [],
    listReminderJobsById: async () => [],
    getReminder: async () => reminder,
  };
});

import { DashboardPage } from './DashboardPage';
import { RemindersPage } from './RemindersPage';
import { ReminderEditPage } from './ReminderEditPage';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function mount(node: React.ReactNode, ready: () => boolean, path = '/') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            {node}
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
  });
  const started = Date.now();
  while (Date.now() - started < 4000) {
    if (ready()) return;
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
  }
  throw new Error('page did not mount');
}

describe('C1 Today black bar', () => {
  it('kills a mutant that leaves the black bar on / or drops it from Reminders', async () => {
    await mount(<DashboardPage />, () => !!document.querySelector('[data-dashboard-home="1"]'));
    expect(document.querySelector('.dashboard-home-sheet-bar')).toBeNull();
    expect((document.querySelector('h1.today-title, h1.dashboard-home-hero')?.textContent || '').trim()).toBe(NAV_WORDS.today);

    act(() => root.unmount());
    root = createRoot(container);
    await mount(<RemindersPage />, () => !!document.querySelector('[data-reminders-page="1"]'));
    expect(document.querySelector('.dashboard-home-sheet-bar')?.textContent).toContain('Reminders');

    act(() => root.unmount());
    root = createRoot(container);
    await mount(
      <Routes>
        <Route path="/reminders/:id" element={<ReminderEditPage />} />
      </Routes>,
      () => !!document.querySelector('[data-reminder-edit]'),
      '/reminders/r1',
    );
    expect(document.querySelector('.dashboard-home-sheet-bar')?.textContent).toContain('Reminders');
  });
});
