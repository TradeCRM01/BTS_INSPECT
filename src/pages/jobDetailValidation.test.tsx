/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { FIELD_AU_PHONE } from '../lib/fieldValidation';
import { JobDetailPage } from './JobDetailPage';

const harness = vi.hoisted(() => {
  const writes: Array<{ table: string; payload: unknown }> = [];
  const job = {
    id: 'job-junk',
    company_id: 'co-1',
    client_id: 'cl-junk',
    title: 'Site works',
    description: 'Labour',
    status: 'scheduled',
    priority: 'medium',
    scheduled_date: '2026-10-19',
    start_time: '08:00',
    end_time: '16:00',
    address: '1 Test St',
    assigned_team: ['emp-1'],
    inspection_id: null,
    created_by: 'emp-1',
    created_at: '2026-10-19T00:00:00.000Z',
    updated_at: '2026-10-19T00:00:00.000Z',
    job_number: 9,
    color: null,
    budget: null,
    parent_job_id: null,
    cost_code: null,
  };
  const client = {
    id: 'cl-junk',
    name: 'Junk Co',
    email: '',
    phone: '',
    address: '1 Test St',
    archived: false,
  };
  function rowsFor(table: string) {
    if (table === 'jobs') return [job];
    if (table === 'clients') return [client];
    if (table === 'profiles') return [{ id: 'emp-1', name: 'Sam', company_id: 'co-1' }];
    return [];
  }
  function chain(table: string) {
    const result = Promise.resolve({ data: rowsFor(table), error: null });
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      neq: () => api,
      gte: () => api,
      lte: () => api,
      in: () => api,
      is: () => api,
      order: () => Object.assign(Promise.resolve({ data: rowsFor(table), error: null }), api),
      limit: () => Object.assign(Promise.resolve({ data: rowsFor(table), error: null }), api),
      maybeSingle: () => Promise.resolve({ data: rowsFor(table)[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: rowsFor(table)[0] ?? { id: 'row-1' }, error: null }),
      then: result.then.bind(result),
      update: (payload: unknown) => {
        writes.push({ table, payload });
        const row: Record<string, unknown> = {
          eq() { return row; },
          select() { return row; },
          then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
            return Promise.resolve({ data: [{ id: 'cl-junk' }], error: null }).then(onFulfilled, onRejected);
          },
        };
        return row;
      },
    };
    return api;
  }
  return { writes, chain, job, client };
});

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => harness.chain(table),
    rpc: () => Promise.resolve({ data: [], error: null }),
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

vi.mock('../lib/devFieldAuditAuth', () => ({
  isDevFieldAuditAuth: () => false,
  pageQueryBlocked: () => false,
}));

vi.mock('../lib/devFieldAuditDocs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/devFieldAuditDocs')>();
  return {
    ...actual,
    getAuditJob: (id: string) => (id === harness.job.id ? harness.job : actual.getAuditJob(id)),
    getAuditClient: (id: string) => (id === harness.client.id ? harness.client : actual.getAuditClient(id)),
    getAuditEmptyList: () => [],
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

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    for (let i = 0; i < 30; i += 1) await Promise.resolve();
  });
}

async function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(['job', harness.job.id], harness.job);
  client.setQueryData(['job-client', harness.client.id], harness.client);
  client.setQueryData(['job-timesheets', harness.job.id], []);
  client.setQueryData(['timesheets-job-clock', 'emp-1'], []);
  client.setQueryData(['billed-timesheet-entry-ids', harness.job.id], { billingCheckOk: true, ids: new Set() });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <ToastProvider>
          <MemoryRouter initialEntries={['/jobs/job-junk']}>
            <Routes>
              <Route path="/jobs/:id" element={<JobDetailPage />} />
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    );
  });
  await flush();
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = vi.fn();
  harness.writes.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Job detail client phone and email', () => {
  it('blocks junk job client phone next to the field with aria-invalid', async () => {
    await renderPage();
    const phone = container.querySelector('input[aria-label="Client phone"]') as HTMLInputElement | null;
    expect(phone).toBeTruthy();
    await act(async () => {
      setInput(phone!, 'abc');
    });
    await act(async () => {
      container.querySelector('.job-client-phone-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes).toEqual([]);
    const phoneError = container.querySelector('#job-client-phone-error');
    expect(phoneError?.textContent).toBe(FIELD_AU_PHONE);
    expect(phone!.getAttribute('aria-invalid')).toBe('true');
    expect(phone!.getAttribute('aria-describedby')).toBe('job-client-phone-error');
    expect(phoneError?.closest('form.job-client-phone')).toBeTruthy();
  });
});
