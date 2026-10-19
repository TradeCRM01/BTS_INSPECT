/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContractForm } from '../pages/ContractsPage';
import { DATE_RANGE_ORDER_MESSAGE } from './dateTimeIntegrity';
import { ToastProvider } from '../components/ui/Toast';

const insertContract = vi.fn();

vi.mock('./supabase', () => ({
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

describe('ContractForm date range', () => {
  it('does not save when the end date is before the start date', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <ContractForm
          contract={null}
          creating={false}
          onClose={() => {}}
          onSaved={onSaved}
        />,
      ));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const title = document.querySelector<HTMLInputElement>('input[placeholder="e.g. Annual Maintenance Agreement"]');
    const client = document.querySelector<HTMLSelectElement>('select');
    await act(async () => {
      if (title) setInput(title, 'Annual service');
      if (client) {
        client.value = 'cl-1';
        client.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    const dates = document.querySelectorAll<HTMLInputElement>('[data-date-field="au"]');
    await act(async () => {
      setInput(dates[0], '21/10/2026');
      setInput(dates[1], '20/10/2026');
    });

    await act(async () => {
      document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    });

    expect(insertContract).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(DATE_RANGE_ORDER_MESSAGE);
  });
});
