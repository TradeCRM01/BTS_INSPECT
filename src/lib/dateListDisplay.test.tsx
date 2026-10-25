/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { AssetsPage } from '../pages/AssetsPage';
import { ContractsPage } from '../pages/ContractsPage';
import { ExpensesPage } from '../pages/ExpensesPage';
import { SAFE_DATE_FALLBACK } from './safeDate';

const { chain } = vi.hoisted(() => {
  const BAD_YEAR = '212026-02-11';
  const expenses = [{
    id: 'exp-bad',
    company_id: 'co-1',
    expense_number: 12,
    cost_class: 'cogs',
    category: 'Materials (job)',
    employee_cost_type: null,
    description: 'Bad year tape',
    amount: 10,
    tax_rate: 10,
    tax_amount: 1,
    total: 11,
    expense_date: BAD_YEAR,
    period_start: null,
    period_end: null,
    vendor_name: null,
    supplier_id: null,
    employee_id: null,
    job_id: null,
    payment_method: null,
    reference: null,
    is_reimbursable: false,
    reimbursed: false,
    recurrence: 'one_off',
    status: 'recorded',
    notes: null,
    created_by: 'emp-1',
    created_at: '2026-10-19T00:00:00.000Z',
    updated_at: '2026-10-19T00:00:00.000Z',
  }, {
    id: 'exp-ok',
    company_id: 'co-1',
    expense_number: 13,
    cost_class: 'overhead',
    category: 'Rent',
    employee_cost_type: null,
    description: 'October rent',
    amount: 20,
    tax_rate: 10,
    tax_amount: 2,
    total: 22,
    expense_date: '2026-10-21',
    period_start: null,
    period_end: null,
    vendor_name: null,
    supplier_id: null,
    employee_id: null,
    job_id: null,
    payment_method: null,
    reference: null,
    is_reimbursable: false,
    reimbursed: false,
    recurrence: 'one_off',
    status: 'recorded',
    notes: null,
    created_by: 'emp-1',
    created_at: '2026-10-19T00:00:00.000Z',
    updated_at: '2026-10-19T00:00:00.000Z',
  }];
  const contracts = [{
    id: 'con-bad',
    company_id: 'co-1',
    client_id: 'cl-1',
    title: 'Bad year contract',
    description: null,
    contract_number: 'SC-1',
    status: 'active',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    billing_cycle: 'monthly',
    contract_value: 0,
    service_frequency: 'monthly',
    next_service_date: BAD_YEAR,
    last_service_date: null,
    auto_generate_jobs: false,
    notes: null,
    created_at: '2026-10-19T00:00:00.000Z',
    updated_at: '2026-10-19T00:00:00.000Z',
    client_name: 'Northside',
  }, {
    id: 'con-ok',
    company_id: 'co-1',
    client_id: 'cl-1',
    title: 'October contract',
    description: null,
    contract_number: 'SC-2',
    status: 'active',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    billing_cycle: 'monthly',
    contract_value: 100,
    service_frequency: 'monthly',
    next_service_date: '2026-10-21',
    last_service_date: null,
    auto_generate_jobs: false,
    notes: null,
    created_at: '2026-10-19T00:00:00.000Z',
    updated_at: '2026-10-19T00:00:00.000Z',
    client_name: 'Northside',
  }];
  const assets = [{
    id: 'asset-bad',
    company_id: 'co-1',
    client_id: 'cl-1',
    name: 'Bad year asset',
    asset_tag: null,
    serial_number: null,
    manufacturer: null,
    model: null,
    category: null,
    location_description: null,
    install_date: '2026-01-01',
    warranty_expiry: BAD_YEAR,
    status: 'active',
    notes: null,
    created_at: '2026-10-19T00:00:00.000Z',
    updated_at: '2026-10-19T00:00:00.000Z',
  }];
  function rowsFor(table: string) {
    if (table === 'clients') return [{ id: 'cl-1', name: 'Northside', archived: false }];
    if (table === 'expenses') return expenses;
    if (table === 'service_contracts') return contracts;
    if (table === 'assets') return assets;
    if (table === 'invoices' || table === 'job_costs' || table === 'profiles' || table === 'jobs' || table === 'suppliers') return [];
    return [];
  }
  function chain(table: string) {
    const result = () => Promise.resolve({ data: rowsFor(table), error: null });
    const q = {
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () => q,
      in: () => q,
      insert: () => Promise.resolve({ error: null }),
      update: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      }),
      maybeSingle: () => result(),
      single: () => Promise.resolve({ data: rowsFor(table)[0] ?? { id: 'row-1' }, error: null }),
      then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => result().then(resolve, reject),
    };
    return q;
  }
  return { chain };
});

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => chain(table),
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'emp-1', company_id: 'co-1', name: 'QA' },
    company: { name: 'Grafter' },
  }),
}));

vi.mock('./devFieldAuditAuth', () => ({
  isDevFieldAuditAuth: () => false,
  pageQueryBlocked: () => false,
}));

vi.mock('../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('../components/ui/OverlayPortal', () => ({
  OverlayPortal: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('../components/ui/ManagedSelect', () => ({
  ManagedSelect: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (v: string) => void;
  }) => (
    <input data-testid="managed-select" value={value} onChange={e => onChange(e.target.value)} />
  ),
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function providers(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>{node}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>
  );
}

async function waitForText(text: string) {
  await act(async () => {
    for (let i = 0; i < 40 && !document.body.textContent?.includes(text); i += 1) {
      await Promise.resolve();
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  });
  if (!document.body.textContent?.includes(text)) {
    throw new Error(`missing "${text}" in: ${(document.body.textContent ?? '').slice(0, 400)}`);
  }
}

describe('list dates stay readable', () => {
  it('Expenses list shows an em dash for a bad year and formats a real day', async () => {
    await act(async () => {
      root.render(providers(<ExpensesPage />));
    });
    await waitForText('Bad year tape');
    expect(document.body.textContent).toContain('October rent');
    expect(document.body.textContent).not.toContain('212026');
    expect(document.body.textContent).not.toContain('2026-10-21');
    expect(document.body.textContent).toContain(SAFE_DATE_FALLBACK);
    expect(document.body.textContent).toContain('21 Oct 2026');
  });

  it('Contracts list shows an em dash for a bad next service and formats a real day', async () => {
    await act(async () => {
      root.render(providers(<ContractsPage />));
    });
    await waitForText('Bad year contract');
    expect(document.body.textContent).toContain('October contract');
    expect(document.body.textContent).not.toContain('212026');
    expect(document.body.textContent).not.toContain('2026-10-21');
    expect(document.body.textContent).toContain(SAFE_DATE_FALLBACK);
    expect(document.body.textContent).toContain('21 Oct 2026');
    const grid = document.querySelector<HTMLButtonElement>('button[title="Thumbnail grid view"]');
    if (!grid) throw new Error('missing grid view toggle');
    await act(async () => { grid.click(); });
    expect(document.body.textContent).toContain(`Next: ${SAFE_DATE_FALLBACK}`);
    expect(document.body.textContent).toContain('Next: 21 Oct 2026');
    expect(document.body.textContent).not.toContain('212026');
    expect(document.body.textContent).not.toContain('2026-10-21');
  });

  it('Assets list shows an em dash for a bad warranty year', async () => {
    await act(async () => {
      root.render(providers(<AssetsPage />));
    });
    await waitForText('Bad year asset');
    expect(document.body.textContent).not.toContain('212026');
    expect(document.body.textContent).toContain(SAFE_DATE_FALLBACK);
  });

});
