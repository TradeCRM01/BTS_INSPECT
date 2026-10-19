/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIELD_AU_PHONE, FIELD_EMAIL, FIELD_SAVE_MISS } from '../lib/fieldValidation';
import { JOB_CLIENT_EMAIL_SAVED } from '../lib/saveJobClientEmail';
import { JOB_CLIENT_PHONE_SAVED } from '../lib/saveJobClientPhone';
import { ClientDetailPage } from './ClientDetailPage';

const harness = vi.hoisted(() => ({
  writes: [] as Array<{ table: string; payload: unknown }>,
  savePhoneCalls: [] as unknown[],
  saveEmailCalls: [] as unknown[],
  selectCols: [] as unknown[],
  toasts: [] as string[],
  updateResult: { data: [{ id: 'c-card' }] as unknown, error: null as unknown },
  client: {
    id: 'c-card',
    company_id: 'co1',
    name: 'Card Client',
    contact_person: null,
    phone: '',
    email: '',
    address: null,
    notes: null,
    archived: false,
    created_at: '2026-08-24T00:00:00.000Z',
  },
}));

vi.mock('../lib/devFieldAuditDocs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/devFieldAuditDocs')>();
  return {
    ...actual,
    getAuditClient: (id: string) => (id === 'c-card' ? harness.client : actual.getAuditClient(id)),
    getAuditJobs: () => [],
    getAuditClientQuotes: () => [],
    getAuditClientInvoices: () => [],
    getAuditEmptyList: () => [],
  };
});

function thenable(result: { data: unknown; error: unknown }) {
  const row: Record<string, unknown> = {
    selected: undefined,
    eq() { return row; },
    select(cols?: string) {
      row.selected = cols;
      harness.selectCols.push(cols);
      return row;
    },
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      if (row.selected === undefined) {
        return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
      }
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return row;
}

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
    from(table: string) {
      return {
        update(payload: unknown) {
          harness.writes.push({ table, payload });
          return thenable(harness.updateResult);
        },
      };
    },
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'u1', company_id: 'co1', role: 'admin' },
    company: { id: 'co1', name: 'Co', time_zone: 'Australia/Brisbane' },
  }),
}));

vi.mock('../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: unknown }) => <div>{children as never}</div>,
}));

vi.mock('../components/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/ui')>();
  return {
    ...actual,
    useToast: () => ({ showToast: (message: string) => { harness.toasts.push(message); } }),
    ContextMenu: () => null,
  };
});

vi.mock('../components/crm/EnquiryConversation', () => ({
  EnquiryConversation: () => null,
  useEnquiryConversation: () => [],
}));

let container: HTMLDivElement;
let root: Root;

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: 1, retryDelay: 0 } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/clients/c-card']}>
          <Routes>
            <Route path="/clients/:id" element={<ClientDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.writes = [];
  harness.savePhoneCalls = [];
  harness.saveEmailCalls = [];
  harness.selectCols = [];
  harness.toasts = [];
  harness.updateResult = { data: [{ id: 'c-card' }], error: null };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Client detail card phone and email', () => {
  it('blocks junk card phone and email next to the field and writes a valid number', async () => {
    await renderPage();
    const phone = container.querySelector('input[aria-label="Client phone"]') as HTMLInputElement;
    const email = container.querySelector('input[aria-label="Client email"]') as HTMLInputElement;
    expect(phone).toBeTruthy();
    expect(email).toBeTruthy();
    await act(async () => {
      setInput(phone, 'abc');
      setInput(email, 'not-an-email');
    });
    await act(async () => {
      container.querySelector('.job-client-phone-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      container.querySelector('.job-client-email-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes).toEqual([]);
    expect(harness.savePhoneCalls).toEqual([]);
    expect(harness.saveEmailCalls).toEqual([]);
    const phoneError = container.querySelector('#client-card-phone-error');
    const emailError = container.querySelector('#client-card-email-error');
    expect(phoneError?.textContent).toBe(FIELD_AU_PHONE);
    expect(emailError?.textContent).toBe(FIELD_EMAIL);
    expect(phone.getAttribute('aria-invalid')).toBe('true');
    expect(phone.getAttribute('aria-describedby')).toBe('client-card-phone-error');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    expect(email.getAttribute('aria-describedby')).toBe('client-card-email-error');
    expect(phoneError?.closest('form.job-client-phone')).toBeTruthy();
    expect(emailError?.closest('form.job-client-email')).toBeTruthy();

    await act(async () => {
      setInput(phone, '0400 000 000');
    });
    await act(async () => {
      container.querySelector('.job-client-phone-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(harness.writes).toEqual([{ table: 'clients', payload: { phone: '0400 000 000' } }]);
  });

  it('shows an inline miss when card phone save writes 0 rows and does not say Saved', async () => {
    harness.updateResult = { data: [], error: null };
    await renderPage();
    const phone = container.querySelector('input[aria-label="Client phone"]') as HTMLInputElement;
    await act(async () => {
      setInput(phone, '0400 000 000');
    });
    await act(async () => {
      container.querySelector('.job-client-phone-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(harness.writes).toEqual([{ table: 'clients', payload: { phone: '0400 000 000' } }]);
    expect(container.querySelector('#client-card-phone-error')?.textContent).toBe(FIELD_SAVE_MISS);
    expect(container.textContent).not.toContain('Saved');
    expect(harness.toasts).not.toContain(JOB_CLIENT_PHONE_SAVED);
    expect(harness.client.phone).toBe('');
  });

  it('shows an inline miss when card email save writes 0 rows and does not say Saved', async () => {
    harness.updateResult = { data: [], error: null };
    await renderPage();
    const email = container.querySelector('input[aria-label="Client email"]') as HTMLInputElement;
    await act(async () => {
      setInput(email, 'jane@acme.com.au');
    });
    await act(async () => {
      container.querySelector('.job-client-email-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(harness.writes).toEqual([{ table: 'clients', payload: { email: 'jane@acme.com.au' } }]);
    expect(container.querySelector('#client-card-email-error')?.textContent).toBe(FIELD_SAVE_MISS);
    expect(container.textContent).not.toContain('Saved');
    expect(harness.toasts).not.toContain(JOB_CLIENT_EMAIL_SAVED);
    expect(harness.client.email).toBe('');
    expect(harness.selectCols).toEqual(['id']);
  });

  it('blocks junk card phone without calling update', async () => {
    await renderPage();
    const phone = container.querySelector('input[aria-label="Client phone"]') as HTMLInputElement;
    await act(async () => {
      setInput(phone, 'abc123def456');
    });
    await act(async () => {
      container.querySelector('.job-client-phone-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes).toEqual([]);
    expect(harness.savePhoneCalls).toEqual([]);
    expect(container.querySelector('#client-card-phone-error')?.textContent).toBe(FIELD_AU_PHONE);
  });

  it('blocks junk card email without calling update', async () => {
    await renderPage();
    const email = container.querySelector('input[aria-label="Client email"]') as HTMLInputElement;
    await act(async () => {
      setInput(email, 'a@b');
    });
    await act(async () => {
      container.querySelector('.job-client-email-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes).toEqual([]);
    expect(harness.saveEmailCalls).toEqual([]);
    expect(container.querySelector('#client-card-email-error')?.textContent).toBe(FIELD_EMAIL);
  });

  it('writes a valid card phone after selecting id and does not retry a 0-row save', async () => {
    await renderPage();
    const phone = container.querySelector('input[aria-label="Client phone"]') as HTMLInputElement;
    await act(async () => {
      setInput(phone, '0400 000 000');
    });
    await act(async () => {
      container.querySelector('.job-client-phone-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(harness.selectCols).toEqual(['id']);
    expect(harness.writes).toEqual([{ table: 'clients', payload: { phone: '0400 000 000' } }]);
    expect(harness.toasts).toContain(JOB_CLIENT_PHONE_SAVED);

    harness.writes = [];
    harness.selectCols = [];
    harness.updateResult = { data: [], error: null };
    await act(async () => {
      setInput(phone, '0412 345 678');
    });
    await act(async () => {
      container.querySelector('.job-client-phone-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(harness.writes).toHaveLength(1);
    expect(harness.selectCols).toEqual(['id']);
    expect(container.querySelector('#client-card-phone-error')?.textContent).toBe(FIELD_SAVE_MISS);
  });

  it('shows the miss copy on a permission-denied card phone save and does not leak the raw error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    harness.updateResult = { data: null, error: { message: 'permission denied' } };
    await renderPage();
    const phone = container.querySelector('input[aria-label="Client phone"]') as HTMLInputElement;
    await act(async () => {
      setInput(phone, '0400 000 000');
    });
    await act(async () => {
      container.querySelector('.job-client-phone-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('#client-card-phone-error')?.textContent).toBe("Couldn't save. Check your connection and try again.");
    expect(container.textContent).not.toContain('permission denied');
    expect(harness.toasts).not.toContain(JOB_CLIENT_PHONE_SAVED);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('does not retry a permission-denied card email save and keeps the miss copy inline', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    harness.updateResult = { data: null, error: { message: 'permission denied' } };
    await renderPage();
    const email = container.querySelector('input[aria-label="Client email"]') as HTMLInputElement;
    await act(async () => {
      setInput(email, 'jane@acme.com.au');
    });
    await act(async () => {
      container.querySelector('.job-client-email-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 50));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(harness.writes).toHaveLength(1);
    expect(harness.writes).toEqual([{ table: 'clients', payload: { email: 'jane@acme.com.au' } }]);
    expect(container.querySelector('#client-card-email-error')?.textContent).toBe("Couldn't save. Check your connection and try again.");
    expect(container.textContent).not.toContain('permission denied');
    expect(harness.toasts).not.toContain(JOB_CLIENT_EMAIL_SAVED);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('shows the miss copy on a permission-denied card email save and does not leak the raw error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    harness.updateResult = { data: null, error: { message: 'permission denied' } };
    await renderPage();
    const email = container.querySelector('input[aria-label="Client email"]') as HTMLInputElement;
    await act(async () => {
      setInput(email, 'jane@acme.com.au');
    });
    await act(async () => {
      container.querySelector('.job-client-email-save')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelector('#client-card-email-error')?.textContent).toBe("Couldn't save. Check your connection and try again.");
    expect(container.textContent).not.toContain('permission denied');
    expect(harness.toasts).not.toContain(JOB_CLIENT_EMAIL_SAVED);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
