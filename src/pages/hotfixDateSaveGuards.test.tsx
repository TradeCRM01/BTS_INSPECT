/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../components/ui';
import { PageErrorBoundary } from '../components/layout/PageErrorBoundary';
import { CompliancePage } from './CompliancePage';
import { ClientDetailPage } from './ClientDetailPage';
import { ContractsPage } from './ContractsPage';
import { AssetsPage } from './AssetsPage';
import { ComplianceDeadlinesWidget } from '../widgets/IntelligenceWidgets';

const harness = vi.hoisted(() => ({
  writes: [] as Array<{ table: string; row: unknown }>,
  compliance: [{
    id: 'hotfix-date-bad',
    company_id: '00000000-0000-4000-8000-0000000000bb',
    client_id: 'client-1',
    title: 'Backflow test delete ok',
    description: null,
    standard_or_regulation: null,
    recurrence_interval: 1,
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
  contracts: [{
    id: 'contract-bad', company_id: '00000000-0000-4000-8000-0000000000bb', client_id: 'client-1',
    title: 'Bad year contract', description: null, contract_number: 'SC-1', status: 'active',
    contract_value: 0, billing_cycle: 'monthly', service_frequency: 'monthly',
    start_date: '212026-01-01', end_date: '212026-12-31', next_service_date: '212026-02-11', last_service_date: null,
    auto_generate_jobs: false, service_reminder_sent_at: null, service_reminder_sent_for_date: null, notes: null,
    created_at: '2026-10-19T00:00:00.000Z', updated_at: '2026-10-19T00:00:00.000Z',
  }] as Array<Record<string, unknown>>,
  assets: [{
    id: 'asset-bad', company_id: '00000000-0000-4000-8000-0000000000bb', client_id: 'client-1', name: 'Bad year asset',
    asset_tag: null, serial_number: null, manufacturer: null, model: null, category: null, location_description: null,
    install_date: '212026-01-01', warranty_expiry: '212026-02-11', status: 'active', notes: null,
    created_at: '2026-10-19T00:00:00.000Z', updated_at: '2026-10-19T00:00:00.000Z',
  }] as Array<Record<string, unknown>>,
  clients: [{
    id: 'client-1',
    company_id: '00000000-0000-4000-8000-0000000000bb',
    name: 'Tom Nguyen — delete ok',
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
    if (table === 'service_contracts') return { data: harness.contracts, error: null };
    if (table === 'assets') return { data: harness.assets, error: null };
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


const BAD = '212026-02-11';
function wrap(node: React.ReactNode, path: string, route?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <AuthProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[path]}>
            <PageErrorBoundary>
              {route ? <Routes><Route path={route} element={node} /></Routes> : node}
            </PageErrorBoundary>
          </MemoryRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
function noCrash() {
  const t = document.body.textContent ?? '';
  expect(t).not.toContain('Invalid time value');
  expect(t).not.toContain('This page ran into a problem');
}
function btn(label: string) {
  return [...container.querySelectorAll('button')].find(b => (b.textContent ?? '').trim().includes(label)) as HTMLButtonElement | undefined;
}
async function submitForm(input: HTMLElement) {
  const form = input.closest('form')!;
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await flush();
}
const RANGE = 'Enter a date with a year between 1900 and 2100';

describe('P375 probe: real pages with year-212026 rows', () => {
  it('compliance list (live query path, prod-like row): Due — and no crash', async () => {
    await act(async () => { root.render(wrap(<CompliancePage />, '/compliance')); });
    await waitForText('Backflow test delete ok');
    expect(document.body.textContent).toContain('Due —');
    expect(document.body.textContent).not.toContain('212026');
    noCrash();
  });
  it('compliance opened record sheet (?id=) for the bad row: Due — and no crash', async () => {
    await act(async () => { root.render(wrap(<CompliancePage />, '/compliance?id=hotfix-date-bad')); });
    await waitForText('Backflow test delete ok');
    await flush();
    expect(document.body.textContent).toContain('Due —');
    noCrash();
  });
  it('client page for Tom Nguyen: compliance row Due — and no crash', async () => {
    await act(async () => { root.render(wrap(<ClientDetailPage />, '/clients/client-1', '/clients/:id')); });
    await waitForText('Backflow test delete ok');
    expect(document.body.textContent).toContain('Due —');
    noCrash();
  });
  it('dashboard compliance widget: bad row neither crashes nor shows a date', async () => {
    await act(async () => { root.render(wrap(<ComplianceDeadlinesWidget config={{}} />, '/')); });
    await flush(); await flush();
    expect(document.body.textContent).toContain('Compliance');
    expect(document.body.textContent).not.toContain('212026');
    noCrash();
  });
  it('contracts list: next service 212026 renders Next: — and no crash', async () => {
    await act(async () => { root.render(wrap(<ContractsPage />, '/contracts')); });
    await waitForText('Bad year contract');
    expect(document.body.textContent).toContain('Monthly—$0.00');
    expect(document.body.textContent).not.toContain('212026');
    noCrash();
  });
  it('assets list: warranty 212026 renders — and no crash', async () => {
    await act(async () => { root.render(wrap(<AssetsPage />, '/assets')); });
    await waitForText('Bad year asset');
    expect(document.body.textContent).not.toContain('212026');
    noCrash();
  });
});

describe('P375 probe: save guards block and write nothing', () => {
  async function openCompliance() {
    await act(async () => { root.render(wrap(<CompliancePage />, '/compliance')); });
    await waitForText('New item');
    await act(async () => { btn('New item')!.click(); });
    await waitForText('First Due Date'); await flush();
    setInputValue(container.querySelector('input[placeholder="e.g. Annual Fire Extinguisher Service"]') as HTMLInputElement, 'Probe');
    setInputValue(container.querySelector('select') as HTMLSelectElement, 'client-1');
  }
  for (const [label, first, last, blocked] of [
    ['first due 212026', BAD, '', true], ['first due 1899-12-31', '1899-12-31', '', true], ['first due 1900-01-01', '1900-01-01', '', false],
    ['first due 2100-12-31', '2100-12-31', '', false], ['first due 2101-01-01', '2101-01-01', '', true],
    ['last completed 212026', '2026-10-19', BAD, true], ['last completed 2101-01-01', '2026-10-19', '2101-01-01', true],
  ] as Array<[string, string, string, boolean]>) {
    it(`compliance create: ${label} -> ${blocked ? 'blocked' : 'saved'}`, async () => {
      await openCompliance();
      const fd = container.querySelector('#compliance-first-due-date') as HTMLInputElement;
      await act(async () => {
        setInputValue(fd, first);
        if (last) setInputValue(container.querySelector('#compliance-last-completed-date') as HTMLInputElement, last);
      });
      await submitForm(fd);
      const writes = harness.writes.filter(w => w.table === 'compliance_items');
      if (blocked) { expect(document.body.textContent).toContain(RANGE); expect(writes).toEqual([]); }
      else { expect(document.body.textContent).not.toContain(RANGE); expect(writes.length).toBe(1); }
    });
  }
  async function openContract() {
    await act(async () => { root.render(wrap(<ContractsPage />, '/contracts')); });
    await waitForText('New Contract');
    await act(async () => { btn('New Contract')!.click(); });
    await waitForText('New Service Contract'); await flush();
    setInputValue(container.querySelector('input[placeholder="e.g. Annual Maintenance Agreement"]') as HTMLInputElement, 'Probe contract');
    const sel = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'client-1')) as HTMLSelectElement;
    setInputValue(sel, 'client-1');
  }
  for (const [label, field, value, blocked] of [
    ['start 212026', '#contract-start-date', BAD, true], ['end 212026', '#contract-end-date', BAD, true],
    ['next service 212026', '#contract-next-service-date', BAD, true], ['next service 2101-01-01', '#contract-next-service-date', '2101-01-01', true],
    ['next service 1899-12-31', '#contract-next-service-date', '1899-12-31', true], ['next service 2100-12-31', '#contract-next-service-date', '2100-12-31', false],
  ] as Array<[string, string, string, boolean]>) {
    it(`contract create: ${label} -> ${blocked ? 'blocked' : 'saved'}`, async () => {
      await openContract();
      await act(async () => {
        if (field !== '#contract-next-service-date') setInputValue(container.querySelector('#contract-next-service-date') as HTMLInputElement, '2026-11-01');
        setInputValue(container.querySelector(field) as HTMLInputElement, value);
      });
      await submitForm(container.querySelector(field) as HTMLElement);
      const writes = harness.writes.filter(w => w.table === 'service_contracts');
      if (blocked) { expect(document.body.textContent).toContain(RANGE); expect(writes).toEqual([]); }
      else { expect(document.body.textContent).not.toContain(RANGE); expect(writes.length).toBe(1); }
    });
  }
  async function openAsset() {
    await act(async () => { root.render(wrap(<AssetsPage />, '/assets')); });
    await waitForText('New asset');
    await act(async () => { btn('New asset')!.click(); });
    await flush();
    setInputValue(document.querySelector('input[placeholder="e.g. Main Switchboard"]') as HTMLInputElement, 'Probe asset');
  }
  for (const [label, idx, value, blocked] of [
    ['install 212026', 0, BAD, true], ['warranty 212026', 1, BAD, true], ['warranty 2100-12-31', 1, '2100-12-31', false], ['warranty 2101-01-01', 1, '2101-01-01', true],
  ] as Array<[string, number, string, boolean]>) {
    it(`asset create: ${label} -> ${blocked ? 'blocked' : 'saved'}`, async () => {
      await openAsset();
      const dates = [...document.querySelectorAll('input[type="date"]')] as HTMLInputElement[];
      await act(async () => { setInputValue(dates[idx], value); });
      await submitForm(dates[idx]);
      const writes = harness.writes.filter(w => w.table === 'assets');
      if (blocked) { expect(document.body.textContent).toContain(RANGE); expect(writes).toEqual([]); }
      else { expect(writes.length).toBe(1); }
    });
  }
});
