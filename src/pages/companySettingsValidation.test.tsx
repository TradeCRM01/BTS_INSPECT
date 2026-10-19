/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIELD_ABN, FIELD_ACCOUNT, FIELD_AU_PHONE, FIELD_BSB, FIELD_EMAIL, FIELD_PERCENT, FIELD_PORT, FIELD_RATE } from '../lib/fieldValidation';
import { CompanySettingsPage } from './CompanySettingsPage';

const harness = vi.hoisted(() => ({
  writes: [] as Array<{ table: string; op: string; payload: unknown }>,
  profile: { id: 'u1', company_id: 'co1', role: 'admin' },
  company: {
    id: 'co1',
    name: 'CoS Test',
    abn: '',
    phone: '',
    email: 'jack@example.com',
    default_tax_rate: 10,
    default_material_markup: 0,
    payment_methods: [{
      id: 'pm1',
      kind: 'bank_transfer',
      label: 'Bank transfer',
      account_name: 'CoS',
      bsb: '',
      account_number: '',
      payid: '',
      notes: '',
    }],
  },
}));

function query(result: { data: unknown; error: unknown } = { data: null, error: null }) {
  const row: Record<string, unknown> = {
    select() { return row; },
    eq() { return row; },
    order() { return row; },
    limit() { return row; },
    maybeSingle: async () => result,
    single: async () => result,
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return row;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table: string) {
      return {
        select() { return query({ data: table === 'email_settings' ? { smtp_port: 587, from_email: '' } : [], error: null }); },
        update(payload: unknown) {
          harness.writes.push({ table, op: 'update', payload });
          return query({ data: { id: 'co1' }, error: null });
        },
        upsert(payload: unknown) {
          harness.writes.push({ table, op: 'upsert', payload });
          return query({ data: { id: 'co1' }, error: null });
        },
        insert(payload: unknown) {
          harness.writes.push({ table, op: 'insert', payload });
          return query({ data: { id: 'new' }, error: null });
        },
      };
    },
    rpc: async () => ({ data: [], error: null }),
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: harness.profile,
    company: harness.company,
    refreshProfile: async () => {},
  }),
}));

vi.mock('../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: unknown }) => <div>{children as never}</div>,
}));

vi.mock('../lib/companySettingsNav', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/companySettingsNav')>();
  return {
    ...actual,
    observeCompanySettingsSections: () => () => {},
  };
});

let container: HTMLDivElement;
let root: Root;

function setInput(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/settings/company']}>
          <CompanySettingsPage />
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
  class FakeIO {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { IntersectionObserver?: unknown }).IntersectionObserver = FakeIO;
  harness.writes = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('Company Settings field validation', () => {
  it('blocks Save Changes for a junk ABN, phone, and negative tax', async () => {
    await renderPage();
    const abn = container.querySelector('#company-abn') as HTMLInputElement;
    const phone = container.querySelector('input[placeholder="0400 000 000"]') as HTMLInputElement;
    const tax = container.querySelector('[aria-describedby="company-tax-error"], input[inputmode="decimal"]') as HTMLInputElement | null;
    expect(abn).toBeTruthy();
    expect(phone).toBeTruthy();
    await act(async () => {
      setInput(abn, '123');
      setInput(phone, 'abc');
      const taxInput = Array.from(container.querySelectorAll('input')).find(el => (
        el.parentElement?.textContent?.includes('%') && el.value === '10'
      )) as HTMLInputElement | undefined;
      if (taxInput) setInput(taxInput, '-5');
      void tax;
    });
    expect(container.textContent).toContain('Add ABN');
    const save = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save Changes'));
    const writesBefore = harness.writes.length;
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes.length).toBe(writesBefore);
    expect(container.querySelector('#company-abn-error')?.textContent).toBe(FIELD_ABN);
    expect(container.querySelector('#company-phone-error')?.textContent).toBe(FIELD_AU_PHONE);
    expect(container.querySelector('#company-tax-error')?.textContent).toBe(FIELD_PERCENT);
    expect(container.textContent).toContain('Add ABN');
  });

  it('does not turn 1,5 into 15 and blocks garbage BSB', async () => {
    await renderPage();
    const markup = Array.from(container.querySelectorAll('input')).find(el => el.value === '0') as HTMLInputElement | undefined;
    const bsb = container.querySelector('input[aria-label="BSB"]') as HTMLInputElement;
    const account = container.querySelector('input[aria-label="Account number"]') as HTMLInputElement;
    expect(bsb).toBeTruthy();
    await act(async () => {
      if (markup) setInput(markup, '1,5');
      setInput(bsb, 'abc12');
      setInput(account, '12ab');
    });
    const saveCompany = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save Changes'));
    const savePay = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save payment methods'));
    const writesBefore = harness.writes.length;
    await act(async () => {
      saveCompany!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      savePay!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes.length).toBe(writesBefore);
    expect(container.querySelector('#company-markup-error')?.textContent).toBe(FIELD_PERCENT);
    expect(container.textContent).toContain(FIELD_BSB);
    expect(container.textContent).toContain(FIELD_ACCOUNT);
  });

  it('blocks junk SMTP from-email and port, and a comma labour rate', async () => {
    await renderPage();
    const from = Array.from(container.querySelectorAll('input')).find(el =>
      el.getAttribute('placeholder') === 'noreply@yourcompany.com',
    ) as HTMLInputElement;
    const port = Array.from(container.querySelectorAll('input')).find(el =>
      el.getAttribute('placeholder') === '587',
    ) as HTMLInputElement;
    const labour = container.querySelector('input[aria-label="Default labour rate ex GST"]') as HTMLInputElement;
    expect(from).toBeTruthy();
    expect(port).toBeTruthy();
    expect(labour).toBeTruthy();
    await act(async () => {
      setInput(from, 'nope');
      setInput(port, '-5');
      setInput(labour, '1,5');
    });
    const saveEmail = Array.from(container.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('Save Email Settings'),
    );
    const saveCompany = Array.from(container.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('Save Changes'),
    );
    const writesBefore = harness.writes.length;
    await act(async () => {
      saveEmail!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      saveCompany!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes.length).toBe(writesBefore);
    expect(container.querySelector('#smtp-from-error')?.textContent).toBe(FIELD_EMAIL);
    expect(container.querySelector('#smtp-port-error')?.textContent).toBe(FIELD_PORT);
    expect(container.querySelector('#company-labour-error')?.textContent).toBe(FIELD_RATE);
  });
});
