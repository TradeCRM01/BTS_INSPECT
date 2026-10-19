/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { FIELD_AU_PHONE, FIELD_EMAIL, FIELD_SAVE_MISS } from '../lib/fieldValidation';
import { JobDetailPage } from './JobDetailPage';

const harness = vi.hoisted(() => {
  const writes: Array<{ table: string; payload: unknown }> = [];
  const savePhoneCalls: unknown[] = [];
  const saveEmailCalls: unknown[] = [];
  const toasts: string[] = [];
  const updateResult = { data: [{ id: 'cl-junk' }] as unknown, error: null as unknown };
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
            return Promise.resolve(harness.updateResult).then(onFulfilled, onRejected);
          },
        };
        return row;
      },
    };
    return api;
  }
  return { writes, savePhoneCalls, saveEmailCalls, toasts, updateResult, chain, job, client };
});

vi.mock('../lib/saveJobClientPhone', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/saveJobClientPhone')>();
  return {
    ...actual,
    saveJobClientPhone: async (input: Parameters<typeof actual.saveJobClientPhone>[0]) => {
      harness.savePhoneCalls.push(input);
      return actual.saveJobClientPhone(input);
    },
  };
});

vi.mock('../lib/saveJobClientEmail', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/saveJobClientEmail')>();
  return {
    ...actual,
    saveJobClientEmail: async (input: Parameters<typeof actual.saveJobClientEmail>[0]) => {
      harness.saveEmailCalls.push(input);
      return actual.saveJobClientEmail(input);
    },
  };
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

vi.mock('../components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/ui')>();
  return {
    ...actual,
    useToast: () => ({ showToast: (message: string) => { harness.toasts.push(message); } }),
  };
});

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
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: 1, retryDelay: 0 },
    },
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
  harness.savePhoneCalls.length = 0;
  harness.saveEmailCalls.length = 0;
  harness.toasts.length = 0;
  harness.updateResult = { data: [{ id: 'cl-junk' }], error: null };
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
    expect(harness.savePhoneCalls).toEqual([]);
    const phoneError = container.querySelector('#job-client-phone-error');
    expect(phoneError?.textContent).toBe(FIELD_AU_PHONE);
    expect(phone!.getAttribute('aria-invalid')).toBe('true');
    expect(phone!.getAttribute('aria-describedby')).toBe('job-client-phone-error');
    expect(phoneError?.closest('form.job-client-phone')).toBeTruthy();
  });

  it('shows the inline email error for a@b..c instead of a native email popup', async () => {
    await renderPage();
    const email = container.querySelector('input[aria-label="Client email"]') as HTMLInputElement | null;
    expect(email).toBeTruthy();
    const form = email!.closest('form.job-client-email') as HTMLFormElement | null;
    expect(form).toBeTruthy();
    expect(form!.noValidate || email!.getAttribute('type') === 'text').toBe(true);
    if (email!.getAttribute('type') === 'text') {
      expect(email!.getAttribute('inputMode')).toBe('email');
    }
    await act(async () => {
      setInput(email!, 'a@b..c');
    });
    await act(async () => {
      container.querySelector('.job-client-email-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes).toEqual([]);
    expect(harness.saveEmailCalls).toEqual([]);
    const emailError = container.querySelector('#job-client-email-error');
    expect(emailError?.textContent).toBe(FIELD_EMAIL);
    expect(email!.getAttribute('aria-invalid')).toBe('true');
    expect(email!.getAttribute('aria-describedby')).toBe('job-client-email-error');
    expect(emailError?.closest('form.job-client-email')).toBeTruthy();
  });

  it('shows the job email inline error and describedby for junk email', async () => {
    await renderPage();
    const email = container.querySelector('input[aria-label="Client email"]') as HTMLInputElement | null;
    expect(email).toBeTruthy();
    await act(async () => {
      setInput(email!, 'not-an-email');
    });
    await act(async () => {
      container.querySelector('.job-client-email-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes).toEqual([]);
    expect(harness.saveEmailCalls).toEqual([]);
    const emailError = container.querySelector('#job-client-email-error');
    expect(emailError?.tagName).toBe('P');
    expect(emailError?.textContent).toBe(FIELD_EMAIL);
    expect(email!.getAttribute('aria-invalid')).toBe('true');
    expect(email!.getAttribute('aria-describedby')).toBe('job-client-email-error');
    expect(emailError?.closest('form.job-client-email')).toBe(email!.closest('form'));
  });

  it('shows the job phone miss copy inline on a server error and does not toast it', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    harness.updateResult = { data: null, error: { message: 'permission denied' } };
    await renderPage();
    const phone = container.querySelector('input[aria-label="Client phone"]') as HTMLInputElement | null;
    expect(phone).toBeTruthy();
    await act(async () => {
      setInput(phone!, '0400 000 000');
    });
    await act(async () => {
      container.querySelector('.job-client-phone-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(harness.writes).toHaveLength(1);
    expect(harness.writes).toEqual([{ table: 'clients', payload: { phone: '0400 000 000' } }]);
    const phoneError = container.querySelector('#job-client-phone-error');
    expect(phoneError?.textContent).toBe(FIELD_SAVE_MISS);
    expect(container.textContent).not.toContain('permission denied');
    expect(harness.toasts).not.toContain(FIELD_SAVE_MISS);
    expect(harness.toasts).not.toContain('permission denied');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not retry a permission-denied job email save and keeps the miss copy inline', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    harness.updateResult = { data: null, error: { message: 'permission denied' } };
    await renderPage();
    const email = container.querySelector('input[aria-label="Client email"]') as HTMLInputElement | null;
    expect(email).toBeTruthy();
    await act(async () => {
      setInput(email!, 'jane@acme.com.au');
    });
    await act(async () => {
      container.querySelector('.job-client-email-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(harness.writes).toHaveLength(1);
    expect(harness.writes).toEqual([{ table: 'clients', payload: { email: 'jane@acme.com.au' } }]);
    const emailError = container.querySelector('#job-client-email-error');
    expect(emailError?.textContent).toBe(FIELD_SAVE_MISS);
    expect(container.textContent).not.toContain('permission denied');
    expect(harness.toasts).not.toContain(FIELD_SAVE_MISS);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
