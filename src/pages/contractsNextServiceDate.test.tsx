/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContractForm } from './ContractsPage';
import { ComplianceForm } from './CompliancePage';
import { DATE_INVALID_MESSAGE, DATE_REQUIRED_MESSAGE } from '../lib/dateTimeIntegrity';
import { DATE_YEAR_RANGE_MESSAGE } from '../lib/safeDate';
import { ToastProvider } from '../components/ui/Toast';

const insertContract = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            order: () => Promise.resolve({
              data: table === 'clients' ? [{ id: 'cl-1', name: 'Client' }] : [],
              error: null,
            }),
          }),
        }),
      }),
      insert: (row: unknown) => {
        insertContract(row);
        return Promise.resolve({ error: null });
      },
      update: () => ({
        eq: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      }),
    }),
  },
}));

const auth = {
  profile: { id: 'emp-1', company_id: 'co-1' },
  company: { name: 'Grafter' },
};

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => auth,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  insertContract.mockReset();
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

function setInput(el: HTMLInputElement, value: string) {
  const proto = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  proto?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
const submit = async () => { await act(async () => { document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click(); }); };
async function mountContract(fillTitle = true) {
  const onSaved = vi.fn();
  await act(async () => { root.render(providers(<ContractForm contract={null} creating={false} onClose={() => {}} onSaved={onSaved} />)); });
  await act(async () => { await Promise.resolve(); });
  const title = document.querySelector<HTMLInputElement>('input[placeholder="e.g. Annual Maintenance Agreement"]');
  const client = document.querySelector<HTMLSelectElement>('select');
  await act(async () => {
    if (title && fillTitle) setInput(title, 'Annual service');
    if (client) { client.value = 'cl-1'; client.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  return onSaved;
}
async function mountCompliance() {
  await act(async () => { root.render(providers(<ComplianceForm item={null} onClose={() => {}} onSaved={() => {}} />)); });
  await act(async () => { await Promise.resolve(); });
  const title = document.querySelector<HTMLInputElement>('input[placeholder="e.g. Annual Fire Extinguisher Service"]');
  const client = document.querySelector<HTMLSelectElement>('select');
  await act(async () => {
    if (title) setInput(title, 'Extinguishers');
    if (client) { client.value = 'cl-1'; client.dispatchEvent(new Event('change', { bubbles: true })); }
  });
}
const el = (id: string) => document.getElementById(id) as HTMLInputElement;
const blur = async (e: HTMLInputElement) => { await act(async () => { e.focus(); }); await act(async () => { e.blur(); e.dispatchEvent(new FocusEvent('focusout', { bubbles: true })); }); };
function expectLinked(id: string, errId: string) {
  const input = el(id);
  expect(input.getAttribute('aria-invalid')).toBe('true');
  expect(input.getAttribute('aria-describedby')).toBe(errId);
  expect(document.getElementById(errId)).toBeTruthy();
  expect(input.closest('label')!.querySelectorAll('[role=alert]').length).toBe(1);
}
describe('ContractForm next service date', () => {
  it('NS2: partial next service is flagged on the field even when the title is also blank', async () => {
    await mountContract(false);
    await act(async () => { setInput(el('contract-next-service-date'), '21/10/20'); });
    await submit();
    expect(insertContract).not.toHaveBeenCalled();
    expect(document.getElementById('contract-next-service-date-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
  });
  it('P1 bypass: 21/10/20, blur, Save (blocked), refocus+blur, Save must still not write 2020', async () => {
    await mountContract();
    const next = el('contract-next-service-date');
    await act(async () => { next.focus(); setInput(next, '21/10/20'); });
    await blur(next); await submit();
    expect(insertContract).not.toHaveBeenCalled();
    expect(next.value).toBe('21/10/20');
    expect(document.getElementById('contract-next-service-date-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
    await blur(next); await submit();
    expect(insertContract).not.toHaveBeenCalled();
    expect(next.value).toBe('21/10/20');
    expect(document.getElementById('contract-next-service-date-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
  });
  it('stale ref: 21/10/20 blur, then retype 21/10/2027 and submit without blur saves 2027', async () => {
    await mountContract();
    const next = el('contract-next-service-date');
    await act(async () => { next.focus(); setInput(next, '21/10/20'); });
    await blur(next);
    await act(async () => { next.focus(); setInput(next, '21/10/2027'); });
    await submit();
    expect(insertContract).toHaveBeenCalledTimes(1);
    expect((insertContract.mock.calls[0][0] as { next_service_date: string }).next_service_date).toBe('2027-10-21');
  });
  it('aria: next 2101 linked, one alert', async () => {
    await mountContract();
    await act(async () => { setInput(el('contract-next-service-date'), '21/10/2101'); });
    await submit();
    expectLinked('contract-next-service-date', 'contract-next-service-date-error');
    expect(document.getElementById('contract-next-service-date-error')?.textContent).toBe(DATE_YEAR_RANGE_MESSAGE);
  });
  it('aria: start 2101 and end 2101 linked, one alert', async () => {
    await mountContract();
    await act(async () => { setInput(el('contract-next-service-date'), '21/10/2026'); setInput(el('contract-start-date'), '21/10/2101'); });
    await submit();
    expectLinked('contract-start-date', 'contract-start-date-error');
    expect(document.getElementById('contract-start-date-error')?.textContent).toBe(DATE_YEAR_RANGE_MESSAGE);
    await act(async () => { setInput(el('contract-start-date'), '01/07/2026'); setInput(el('contract-end-date'), '21/10/2101'); });
    await submit();
    expectLinked('contract-end-date', 'contract-end-date-error');
    expect(document.getElementById('contract-end-date-error')?.textContent).toBe(DATE_YEAR_RANGE_MESSAGE);
  });
  it('aria: compliance first blank / last 2101 linked, one alert', async () => {
    await mountCompliance();
    await act(async () => { setInput(el('compliance-first-due-date'), ''); });
    await submit();
    expectLinked('compliance-first-due-date', 'compliance-first-due-date-error');
    expect(document.getElementById('compliance-first-due-date-error')?.textContent).toBe(DATE_REQUIRED_MESSAGE);
    await act(async () => { setInput(el('compliance-first-due-date'), '21/10/2026'); setInput(el('compliance-last-completed-date'), '21/10/2101'); });
    await submit();
    expectLinked('compliance-last-completed-date', 'compliance-last-completed-date-error');
    expect(document.getElementById('compliance-last-completed-date-error')?.textContent).toBe(DATE_YEAR_RANGE_MESSAGE);
  });
  it('typing state: invalid text sets aria-invalid with exactly one alert', async () => {
    await mountContract();
    await act(async () => { setInput(el('contract-next-service-date'), '21/10/20'); });
    const input = el('contract-next-service-date');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('contract-next-service-date-field-error');
    expect(document.getElementById('contract-next-service-date-field-error')?.textContent).toBe(DATE_INVALID_MESSAGE);
    expect(input.closest('label')!.querySelectorAll('[role=alert]').length).toBe(1);
  });
});
