/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FIELD_ABN, FIELD_ACCOUNT, FIELD_AU_PHONE, FIELD_BSB, FIELD_EMAIL, FIELD_PERCENT, FIELD_PORT, FIELD_RATE, FIELD_SAVE_MISS } from '../lib/fieldValidation';
import { CompanySettingsPage } from './CompanySettingsPage';

const harness = vi.hoisted(() => ({
  writes: [] as Array<{ table: string; op: string; payload: unknown }>,
  selectCols: [] as unknown[],
  emailSelectCols: [] as unknown[],
  updateData: [{ id: 'co1' }] as unknown,
  updateError: null as unknown,
  labourColumnMissing: false,
  refreshed: false,
  emailSettings: { smtp_port: 587, from_email: '', from_name: '' } as {
    smtp_port: number;
    from_email: string;
    from_name: string;
  },
  emailUpsertError: null as unknown,
  smtpReady: true,
  setPassError: null as unknown,
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

function query(
  result: { data: unknown; error: unknown } = { data: null, error: null },
  requireSelect = false,
) {
  const row: Record<string, unknown> = {
    selected: requireSelect ? undefined : true,
    select(cols?: string) {
      row.selected = cols ?? true;
      if (requireSelect) harness.selectCols.push(cols);
      return row;
    },
    eq() { return row; },
    order() { return row; },
    limit() { return row; },
    maybeSingle: async () => result,
    single: async () => result,
    then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
      if (requireSelect && row.selected === undefined) {
        return Promise.resolve({ data: null, error: null }).then(onFulfilled, onRejected);
      }
      return Promise.resolve(result).then(onFulfilled, onRejected);
    },
  };
  return row;
}

vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table: string) {
      return {
        select(cols?: string) {
          if (table === 'email_settings') harness.emailSelectCols.push(cols);
          return query({ data: table === 'email_settings' ? harness.emailSettings : [], error: null });
        },
        update(payload: unknown) {
          harness.writes.push({ table, op: 'update', payload });
          if (
            harness.labourColumnMissing
            && payload
            && typeof payload === 'object'
            && 'default_labour_rate' in payload
          ) {
            return query({
              data: null,
              error: { message: 'Could not find the default_labour_rate column of companies in the schema cache' },
            }, true);
          }
          return query({ data: harness.updateData, error: harness.updateError }, true);
        },
        upsert(payload: unknown) {
          harness.writes.push({ table, op: 'upsert', payload });
          return query({ data: harness.emailUpsertError ? null : { id: 'co1' }, error: harness.emailUpsertError });
        },
        insert(payload: unknown) {
          harness.writes.push({ table, op: 'insert', payload });
          return query({ data: { id: 'new' }, error: null });
        },
      };
    },
    rpc: async (fn: string, args?: unknown) => {
      if (fn === 'email_smtp_ready') return { data: harness.smtpReady, error: null };
      if (fn === 'email_smtp_set_pass') {
        harness.writes.push({ table: 'email_smtp_set_pass', op: 'rpc', payload: args });
        return { data: null, error: harness.setPassError };
      }
      return { data: [], error: null };
    },
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: harness.profile,
    company: harness.company,
    refreshProfile: async () => { harness.refreshed = true; },
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
  HTMLElement.prototype.scrollIntoView = vi.fn();
  harness.writes = [];
  harness.selectCols = [];
  harness.emailSelectCols = [];
  harness.updateData = [{ id: 'co1' }];
  harness.updateError = null;
  harness.labourColumnMissing = false;
  harness.refreshed = false;
  harness.emailSettings = { smtp_port: 587, from_email: '', from_name: '' };
  harness.emailUpsertError = null;
  harness.smtpReady = true;
  harness.setPassError = null;
  harness.company.abn = '';
  harness.company.phone = '';
  harness.company.email = 'jack@example.com';
  harness.company.payment_methods = [{
    id: 'pm1',
    kind: 'bank_transfer',
    label: 'Bank transfer',
    account_name: 'CoS',
    bsb: '',
    account_number: '',
    payid: '',
    notes: '',
  }];
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
    expect(container.textContent).not.toContain('Add ABN');
    const save = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save Changes'));
    const writesBefore = harness.writes.length;
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes.length).toBe(writesBefore);
    expect(container.querySelector('#company-abn-error')?.textContent).toBe(FIELD_ABN);
    expect(container.querySelector('#company-phone-error')?.textContent).toBe(FIELD_AU_PHONE);
    expect(container.querySelector('#company-tax-error')?.textContent).toBe(FIELD_PERCENT);
    expect(container.textContent).not.toContain('Add ABN');
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

  it('focuses the first invalid field when Save Changes is blocked', async () => {
    await renderPage();
    const tax = container.querySelector('#company-tax') as HTMLInputElement;
    expect(tax).toBeTruthy();
    await act(async () => {
      setInput(tax, '-5');
    });
    const save = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save Changes'));
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(document.activeElement).toBe(tax);
    expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalled();
    expect(container.querySelector('#company-tax-error')?.textContent).toBe(FIELD_PERCENT);
  });

  it('writes the exact company details payload on a valid save', async () => {
    await renderPage();
    await act(async () => {
      setInput(container.querySelector('#company-abn') as HTMLInputElement, '  51 824 753 556  ');
      setInput(container.querySelector('#company-phone') as HTMLInputElement, '0400 000 000');
      setInput(container.querySelector('#company-email') as HTMLInputElement, 'ops@co.com.au');
      setInput(container.querySelector('#company-tax') as HTMLInputElement, '55');
      setInput(container.querySelector('#company-markup') as HTMLInputElement, '12.5');
      setInput(container.querySelector('#company-labour') as HTMLInputElement, '95.50');
    });
    const save = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save Changes'));
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    const write = harness.writes.find(row => row.table === 'companies' && row.op === 'update');
    expect(write).toBeTruthy();
    expect(write?.payload).toMatchObject({
      name: 'CoS Test',
      abn: '51 824 753 556',
      phone: '0400 000 000',
      email: 'ops@co.com.au',
      default_tax_rate: 55,
      default_material_markup: 12.5,
      default_labour_rate: 95.5,
    });
  });

  it('writes payment methods for a valid bank row and for a blank bank row', async () => {
    await renderPage();
    const savePay = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save payment methods'));
    await act(async () => {
      savePay!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    const blankWrite = harness.writes.find(row => row.table === 'companies' && row.op === 'update');
    expect(blankWrite).toBeTruthy();
    expect((blankWrite?.payload as { payment_methods: Array<{ bsb: string; account_number: string }> }).payment_methods[0]).toMatchObject({
      bsb: '',
      account_number: '',
    });

    harness.writes = [];
    await act(async () => {
      setInput(container.querySelector('input[aria-label="BSB"]') as HTMLInputElement, '064-000');
      setInput(container.querySelector('input[aria-label="Account number"]') as HTMLInputElement, '12345678');
    });
    await act(async () => {
      savePay!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    const filled = harness.writes.find(row => row.table === 'companies' && row.op === 'update');
    expect((filled?.payload as { payment_methods: Array<{ bsb: string; account_number: string }> }).payment_methods[0]).toMatchObject({
      bsb: '064-000',
      account_number: '12345678',
    });
  });

  it('writes smtp_port 587 when the port is left blank', async () => {
    await renderPage();
    const port = container.querySelector('#smtp-port') as HTMLInputElement;
    expect(port).toBeTruthy();
    await act(async () => {
      setInput(port, '');
    });
    const saveEmail = Array.from(container.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('Save Email Settings'),
    );
    await act(async () => {
      saveEmail!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    const write = harness.writes.find(row => row.table === 'email_settings');
    expect(write).toBeTruthy();
    expect((write?.payload as { smtp_port: number }).smtp_port).toBe(587);
  });

  it('upserts smtp_port as the number 587 with the rest of the email settings', async () => {
    await renderPage();
    const port = container.querySelector('#smtp-port') as HTMLInputElement;
    const fromName = container.querySelector('input[placeholder="Grafter"]') as HTMLInputElement;
    const fromEmail = container.querySelector('#smtp-from') as HTMLInputElement;
    const host = container.querySelector('input[placeholder="smtp.resend.com"]') as HTMLInputElement;
    expect(port).toBeTruthy();
    await act(async () => {
      setInput(fromName, 'Co');
      setInput(fromEmail, 'quotes@co.com.au');
      setInput(host, 'smtp.resend.com');
      setInput(port, '587');
    });
    const saveEmail = Array.from(container.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('Save Email Settings'),
    );
    await act(async () => {
      saveEmail!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    const write = harness.writes.find(row => row.table === 'email_settings' && row.op === 'upsert');
    expect(write?.payload).toEqual({
      smtp_host: 'smtp.resend.com',
      smtp_port: 587,
      smtp_secure: false,
      smtp_user: '',
      from_name: 'Co',
      from_email: 'quotes@co.com.au',
      company_id: 'co1',
    });
    expect(write?.payload).not.toHaveProperty('smtp_pass');
    expect(typeof (write?.payload as { smtp_port: unknown }).smtp_port).toBe('number');
  });

  it('writes a typed SMTP password through the setter RPC, not the upsert payload', async () => {
    await renderPage();
    const secret = container.querySelector('input[autocomplete="new-password"]') as HTMLInputElement;
    await act(async () => {
      setInput(secret, 'sec-smtp-typed-first-5a106e2d');
    });
    const saveEmail = Array.from(container.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('Save Email Settings'),
    );
    await act(async () => {
      saveEmail!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const write = harness.writes.find(row => row.table === 'email_settings' && row.op === 'upsert');
    expect(write?.payload).not.toHaveProperty('smtp_pass');
    expect(harness.writes.find(row => row.table === 'email_smtp_set_pass' && row.op === 'rpc')?.payload).toEqual({
      p_pass: 'sec-smtp-typed-first-5a106e2d',
    });
  });

  it('blocks company email junk, 1.5abc tax, lettered BSB, and a 7-digit BSB', async () => {
    await renderPage();
    await act(async () => {
      setInput(container.querySelector('#company-email') as HTMLInputElement, 'not-an-email');
      setInput(container.querySelector('#company-tax') as HTMLInputElement, '1.5abc');
    });
    const saveCompany = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save Changes'));
    const writesBefore = harness.writes.length;
    await act(async () => {
      saveCompany!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes.length).toBe(writesBefore);
    expect(container.querySelector('#company-email-error')?.textContent).toBe(FIELD_EMAIL);
    expect(container.querySelector('#company-tax-error')?.textContent).toBe(FIELD_PERCENT);

    await act(async () => {
      setInput(container.querySelector('input[aria-label="BSB"]') as HTMLInputElement, 'abc123def456');
      setInput(container.querySelector('input[aria-label="Account number"]') as HTMLInputElement, '12345678');
    });
    const savePay = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save payment methods'));
    await act(async () => {
      savePay!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain(FIELD_BSB);

    await act(async () => {
      setInput(container.querySelector('input[aria-label="BSB"]') as HTMLInputElement, '1234567');
    });
    await act(async () => {
      savePay!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.textContent).toContain(FIELD_BSB);
  });

  it('lets a stored bad-checksum ABN stay, and does not say Add ABN', async () => {
    harness.company.abn = '12 345 678 901';
    await renderPage();
    expect(container.textContent).not.toContain('Add ABN');
    const save = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save Changes'));
    await act(async () => {
      setInput(container.querySelector('#company-tax') as HTMLInputElement, '55');
    });
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    const write = harness.writes.find(row => row.table === 'companies' && row.op === 'update');
    expect(write).toBeTruthy();
    expect((write?.payload as { abn: string; default_tax_rate: number }).abn).toBe('12 345 678 901');
    expect((write?.payload as { default_tax_rate: number }).default_tax_rate).toBe(55);
    expect(container.querySelector('#company-abn-error')).toBeNull();
    expect(container.textContent).not.toContain('Add ABN');
  });

  it('shows an inline miss when company save writes 0 rows and does not say Saved', async () => {
    harness.updateData = [];
    await renderPage();
    const save = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save Changes'));
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(harness.writes.some(row => row.table === 'companies' && row.op === 'update')).toBe(true);
    expect(container.textContent).toContain(FIELD_SAVE_MISS);
    expect(container.textContent).not.toContain('Saved');
    expect(harness.refreshed).toBe(false);
  });

  it('shows an inline miss when payment save writes 0 rows and does not say Saved', async () => {
    harness.updateData = [];
    await renderPage();
    const savePay = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save payment methods'));
    await act(async () => {
      savePay!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(harness.writes.some(row => row.table === 'companies' && row.op === 'update')).toBe(true);
    expect(harness.selectCols).toEqual(['id']);
    expect(container.textContent).toContain(FIELD_SAVE_MISS);
    expect(container.textContent).not.toContain('Saved');
    expect(harness.refreshed).toBe(false);
  });

  it('shows Saved on a valid company update after selecting id', async () => {
    await renderPage();
    const save = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save Changes'));
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(harness.selectCols).toEqual(['id']);
    expect(container.textContent).toContain('Saved');
    expect(harness.refreshed).toBe(true);
  });

  it('shows Saved on a valid payment update after selecting id', async () => {
    await renderPage();
    const savePay = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save payment methods'));
    await act(async () => {
      savePay!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(harness.selectCols).toEqual(['id']);
    expect(container.textContent).toContain('Saved');
  });

  it('retries company save without default_labour_rate when that column is missing', async () => {
    harness.labourColumnMissing = true;
    await renderPage();
    await act(async () => {
      setInput(container.querySelector('#company-labour') as HTMLInputElement, '95');
    });
    const save = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save Changes'));
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const labourWrites = harness.writes.filter(row => row.table === 'companies' && row.op === 'update');
    expect(labourWrites.length).toBe(2);
    expect(labourWrites[0].payload).toMatchObject({ default_labour_rate: 95 });
    expect(labourWrites[1].payload).not.toHaveProperty('default_labour_rate');
    expect(harness.selectCols).toEqual(['id', 'id']);
    expect(container.textContent).toContain('Saved');
  });

  it('shows the miss copy on a permission-denied company save and does not leak the raw error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    harness.updateData = null;
    harness.updateError = { message: 'permission denied' };
    await renderPage();
    const save = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save Changes'));
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Couldn't save. Check your connection and try again.");
    expect(container.textContent).not.toContain('permission denied');
    expect(container.textContent).not.toContain('Saved');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('shows the miss copy on a permission-denied payment save and does not leak the raw error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    harness.updateData = null;
    harness.updateError = { message: 'permission denied' };
    await renderPage();
    const savePay = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save payment methods'));
    await act(async () => {
      savePay!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Couldn't save. Check your connection and try again.");
    expect(container.textContent).not.toContain('permission denied');
    expect(container.textContent).not.toContain('Saved');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('saves an unrelated tax edit when the stored phone is invalid', async () => {
    harness.company.phone = 'not-a-phone';
    await renderPage();
    await act(async () => {
      setInput(container.querySelector('#company-tax') as HTMLInputElement, '15');
    });
    const save = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save Changes'));
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    const write = harness.writes.find(row => row.table === 'companies' && row.op === 'update');
    expect(write).toBeTruthy();
    expect((write?.payload as { phone: string; default_tax_rate: number }).phone).toBe('not-a-phone');
    expect((write?.payload as { default_tax_rate: number }).default_tax_rate).toBe(15);
    expect(container.querySelector('#company-phone-error')).toBeNull();
  });

  it('blocks a changed invalid company phone', async () => {
    harness.company.phone = 'not-a-phone';
    await renderPage();
    await act(async () => {
      setInput(container.querySelector('#company-phone') as HTMLInputElement, 'abc');
    });
    const save = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save Changes'));
    const writesBefore = harness.writes.length;
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes.length).toBe(writesBefore);
    expect(container.querySelector('#company-phone-error')?.textContent).toBe(FIELD_AU_PHONE);
  });

  it.each([
    '(07) 3123 4567',
    '07 3123 4567',
    '+61 7 3123 4567',
    '0412 345 678',
    '+61412345678',
    '1300 123 456',
    '13 12 34',
  ])('writes typed AU phone %s on company save', async (phone) => {
    await renderPage();
    await act(async () => {
      setInput(container.querySelector('#company-phone') as HTMLInputElement, phone);
    });
    const save = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save Changes'));
    await act(async () => {
      save!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    const write = harness.writes.find(row => row.table === 'companies' && row.op === 'update');
    expect((write?.payload as { phone: string }).phone).toBe(phone);
  });

  it('saves a From Name edit when the stored From email is invalid', async () => {
    harness.emailSettings = { smtp_port: 587, from_email: 'not-an-email', from_name: 'Office' };
    await renderPage();
    const fromName = Array.from(container.querySelectorAll('input')).find(el =>
      el.getAttribute('placeholder') === 'Grafter',
    ) as HTMLInputElement;
    expect(fromName).toBeTruthy();
    await act(async () => {
      setInput(fromName, 'Shop');
    });
    const saveEmail = Array.from(container.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('Save Email Settings'),
    );
    await act(async () => {
      saveEmail!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const write = harness.writes.find(row => row.table === 'email_settings' && row.op === 'upsert');
    expect(write).toBeTruthy();
    expect((write?.payload as { from_name: string; from_email: string }).from_name).toBe('Shop');
    expect((write?.payload as { from_email: string }).from_email).toBe('not-an-email');
    expect(container.querySelector('#smtp-from-error')).toBeNull();
  });

  it('blocks a changed invalid From email', async () => {
    harness.emailSettings = { smtp_port: 587, from_email: 'not-an-email', from_name: 'Office' };
    await renderPage();
    const from = container.querySelector('#smtp-from') as HTMLInputElement;
    await act(async () => {
      setInput(from, 'still-bad');
    });
    const saveEmail = Array.from(container.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('Save Email Settings'),
    );
    const writesBefore = harness.writes.length;
    await act(async () => {
      saveEmail!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes.length).toBe(writesBefore);
    expect(container.querySelector('#smtp-from-error')?.textContent).toBe(FIELD_EMAIL);
  });

  it('saves a payment label edit when the stored BSB and account are invalid', async () => {
    harness.company.payment_methods = [{
      id: 'pm1',
      kind: 'bank_transfer',
      label: 'Bank transfer',
      account_name: 'CoS',
      bsb: 'abc12',
      account_number: '12ab',
      payid: '',
      notes: '',
    }];
    await renderPage();
    await act(async () => {
      setInput(container.querySelector('input[aria-label="Payment method label"]') as HTMLInputElement, 'Westpac');
    });
    const savePay = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save payment methods'));
    await act(async () => {
      savePay!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    const write = harness.writes.find(row => row.table === 'companies' && row.op === 'update');
    expect(write).toBeTruthy();
    expect((write?.payload as { payment_methods: Array<{ label: string; bsb: string; account_number: string }> }).payment_methods[0]).toMatchObject({
      label: 'Westpac',
      bsb: 'abc12',
      account_number: '12ab',
    });
    expect(container.textContent).not.toContain(FIELD_BSB);
    expect(container.textContent).not.toContain(FIELD_ACCOUNT);
  });

  it('blocks a changed invalid BSB', async () => {
    harness.company.payment_methods = [{
      id: 'pm1',
      kind: 'bank_transfer',
      label: 'Bank transfer',
      account_name: 'CoS',
      bsb: 'abc12',
      account_number: '12345678',
      payid: '',
      notes: '',
    }];
    await renderPage();
    await act(async () => {
      setInput(container.querySelector('input[aria-label="BSB"]') as HTMLInputElement, 'abc');
    });
    const savePay = Array.from(container.querySelectorAll('button')).find(btn => btn.textContent?.includes('Save payment methods'));
    const writesBefore = harness.writes.length;
    await act(async () => {
      savePay!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(harness.writes.length).toBe(writesBefore);
    expect(container.textContent).toContain(FIELD_BSB);
  });

  it('loads email settings on public columns and shows a set indicator instead of the secret', async () => {
    harness.emailSettings = {
      smtp_port: 587,
      from_email: 'quotes@co.com.au',
      from_name: 'Office',
      smtp_host: 'smtp.resend.com',
      smtp_user: 'resend',
    } as typeof harness.emailSettings;
    await renderPage();
    expect(harness.emailSelectCols).toContain(
      'id, company_id, smtp_host, smtp_port, smtp_secure, smtp_user, from_name, from_email, created_at, updated_at',
    );
    expect(String(harness.emailSelectCols.join(' '))).not.toContain('smtp_pass');
    const state = container.querySelector('[data-smtp-secret-state]');
    expect(state?.textContent).toBe('set');
    expect(state?.getAttribute('data-smtp-secret-state')).toBe('set');
    const secretInput = container.querySelector('input[autocomplete="new-password"]') as HTMLInputElement;
    expect(secretInput?.value).toBe('');
  });

  it('shows not-set when a settings row exists and the ready RPC is false', async () => {
    harness.smtpReady = false;
    harness.emailSettings = {
      smtp_port: 587,
      from_email: 'quotes@co.com.au',
      from_name: 'Office',
      smtp_host: 'smtp.resend.com',
      smtp_user: 'resend',
    } as typeof harness.emailSettings;
    await renderPage();
    const state = container.querySelector('[data-smtp-secret-state]');
    expect(state?.textContent).toBe('not set');
    expect(state?.getAttribute('data-smtp-secret-state')).toBe('unset');
  });

  it('shows the miss copy on a permission-denied SMTP save and does not leak the raw error', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    harness.emailUpsertError = { message: 'permission denied' };
    await renderPage();
    const saveEmail = Array.from(container.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('Save Email Settings'),
    );
    await act(async () => {
      saveEmail!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain("Couldn't save. Check your connection and try again.");
    expect(container.textContent).not.toContain('permission denied');
    expect(container.textContent).not.toContain('Saved');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
