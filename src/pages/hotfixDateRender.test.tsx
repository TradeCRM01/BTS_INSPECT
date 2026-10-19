/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../components/ui';
import { PageErrorBoundary } from '../components/layout/PageErrorBoundary';
import { CompliancePage } from './CompliancePage';
import { ClientDetailPage } from './ClientDetailPage';
import { DATE_YEAR_RANGE_MESSAGE, SAFE_DATE_FALLBACK } from '../lib/safeDate';

const harness = vi.hoisted(() => ({
  writes: [] as Array<{ table: string; row: unknown }>,
  compliance: [{
    id: 'hotfix-date-bad',
    company_id: '00000000-0000-4000-8000-0000000000bb',
    client_id: 'client-1',
    title: 'Backflow test delete ok',
    description: null,
    standard_or_regulation: null,
    recurrence_interval: 12,
    recurrence_unit: 'months',
    first_due_date: '212026-02-11',
    last_completed_date: null,
    next_due_date: '212026-02-11',
    reminder_days_before: 30,
    reminder_sent_at: null,
    status: 'upcoming',
    linked_job_id: null,
    notes: null,
    created_at: '2026-10-19T00:00:00.000Z',
    updated_at: '2026-10-19T00:00:00.000Z',
  }],
  clients: [{
    id: 'client-1',
    company_id: '00000000-0000-4000-8000-0000000000bb',
    name: 'Tom Nguyen',
    email: 'tom@example.com',
    phone: '0400 000 000',
    archived: false,
  }],
}));

vi.mock('../lib/supabase', () => {
  const userId = '00000000-0000-4000-8000-0000000000aa';
  const companyId = '00000000-0000-4000-8000-0000000000bb';
  const user = {
    id: userId,
    email: 'qa@example.com',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
  };
  const session = {
    access_token: 'qa-token',
    refresh_token: 'qa-refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user,
  };
  const profile = {
    id: userId,
    company_id: companyId,
    name: 'QA',
    role: 'admin',
    email: 'qa@example.com',
  };
  const company = { id: companyId, name: 'QA Co' };

  function resultFor(table: string) {
    if (table === 'profiles') return { data: profile, error: null };
    if (table === 'companies') return { data: company, error: null };
    if (table === 'compliance_items') return { data: harness.compliance, error: null };
    if (table === 'clients') return { data: harness.clients, error: null };
    if (table === 'jobs' || table === 'quotes' || table === 'invoices' || table === 'inspections') {
      return { data: [], error: null };
    }
    return { data: [], error: null };
  }

  function builder(table: string) {
    const promise = Promise.resolve(resultFor(table));
    const query: Record<string, unknown> = {
      select() { return query; },
      order() { return query; },
      eq() { return query; },
      in() { return query; },
      limit() { return query; },
      or() { return query; },
      update() { return query; },
      delete() { return query; },
      insert(row: unknown) {
        harness.writes.push({ table, row });
        return query;
      },
      maybeSingle() { return promise; },
      single() {
        const rows = resultFor(table).data;
        const row = Array.isArray(rows) ? rows[0] ?? { id: 'new' } : rows;
        return Promise.resolve({ data: row, error: null });
      },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return promise.then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null }),
      },
      from: (table: string) => builder(table),
      rpc: async () => ({ data: false, error: null }),
    },
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.writes = [];
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

function setInputValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

async function waitForText(text: string) {
  const started = Date.now();
  while (Date.now() - started < 4000) {
    if (document.body.textContent?.includes(text)) return;
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  }
  throw new Error(`timed out waiting for ${text}: ${document.body.textContent?.slice(0, 400)}`);
}

async function flush() {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 40));
  });
}

describe('HOTFIX-DATE render: 212026 row does not crash', () => {
  it('renders /compliance with a 212026 due date as an em dash', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <AuthProvider>
            <ToastProvider>
              <MemoryRouter initialEntries={['/compliance']}>
                <PageErrorBoundary>
                  <CompliancePage />
                </PageErrorBoundary>
              </MemoryRouter>
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>,
      );
    });
    await waitForText('Backflow test delete ok');
    expect(document.body.textContent).toContain(SAFE_DATE_FALLBACK);
    expect(document.body.textContent).toContain('Due —');
    expect(document.body.textContent).not.toContain('Invalid time value');
    expect(document.body.textContent).not.toContain('This page ran into a problem');
  });

  it('renders the client page with a 212026 compliance row as an em dash', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <AuthProvider>
            <ToastProvider>
              <MemoryRouter initialEntries={['/clients/client-1']}>
                <PageErrorBoundary>
                  <Routes>
                    <Route path="/clients/:id" element={<ClientDetailPage />} />
                  </Routes>
                </PageErrorBoundary>
              </MemoryRouter>
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>,
      );
    });
    await waitForText('Backflow test delete ok');
    expect(document.body.textContent).toContain('Due —');
    expect(document.body.textContent).not.toContain('Invalid time value');
    expect(document.body.textContent).not.toContain('This page ran into a problem');
  });
});

describe('HOTFIX-DATE save: year 212026 is blocked', () => {
  it('blocks Create Item when the first due year is 212026', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <AuthProvider>
            <ToastProvider>
              <MemoryRouter initialEntries={['/compliance']}>
                <PageErrorBoundary>
                  <CompliancePage />
                </PageErrorBoundary>
              </MemoryRouter>
            </ToastProvider>
          </AuthProvider>
        </QueryClientProvider>,
      );
    });
    await waitForText('New item');
    const newItem = [...container.querySelectorAll('button')].find(btn => btn.textContent?.includes('New item'));
    expect(newItem).toBeTruthy();
    await act(async () => { newItem!.click(); });
    await waitForText('First Due Date');
    await flush();

    const title = container.querySelector('input[placeholder="e.g. Annual Fire Extinguisher Service"]') as HTMLInputElement | null;
    const clientSelect = container.querySelector('select') as HTMLSelectElement | null;
    const date = container.querySelector('#compliance-first-due-date') as HTMLInputElement | null;
    expect(title && clientSelect && date).toBeTruthy();
    await act(async () => {
      setInputValue(title!, 'Year guard item');
      setInputValue(clientSelect!, 'client-1');
      setInputValue(date!, '21/10/212026');
    });

    const create = [...container.querySelectorAll('button')].find(btn => btn.textContent?.includes('Create Item'));
    expect(create).toBeTruthy();
    await act(async () => { create!.click(); });
    await flush();

    expect(document.body.textContent).toContain(DATE_YEAR_RANGE_MESSAGE);
    expect(harness.writes.filter(w => w.table === 'compliance_items')).toEqual([]);
    const alert = container.querySelector('#compliance-first-due-date-error');
    expect(alert?.textContent).toBe(DATE_YEAR_RANGE_MESSAGE);
  });
});
