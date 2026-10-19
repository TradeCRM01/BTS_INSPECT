/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { QuoteEditorModal } from '../pages/QuotesPage';
import { DATE_INVALID_MESSAGE } from './dateTimeIntegrity';

const { writes, chain } = vi.hoisted(() => {
  const writes: unknown[] = [];
  function rowsFor(table: string) {
    if (table === 'profiles') return [{ id: 'emp-1', name: 'Sam' }];
    if (table === 'clients') return [{ id: 'cl-1', name: 'Northside', email: 'a@example.com', phone: '0400000000', address: '1 Test St' }];
    if (table === 'jobs') return [];
    if (table === 'stock_items' || table === 'price_book_items' || table === 'quotes' || table === 'invoices') return [];
    return [];
  }
  function chain(table: string) {
    const result = Promise.resolve({ data: rowsFor(table), error: null });
    const q = {
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () => q,
      in: () => q,
      is: () => q,
      insert: (row: unknown) => {
        writes.push({ table, row });
        return {
          ...q,
          select: () => ({
            ...q,
            single: () => Promise.resolve({ data: { id: 'new-1' }, error: null }),
          }),
        };
      },
      update: (row: unknown) => {
        writes.push({ table, row });
        return q;
      },
      maybeSingle: () => result,
      single: () => Promise.resolve({ data: rowsFor(table)[0] ?? { id: 'row-1' }, error: null }),
      then: result.then.bind(result),
    };
    return q;
  }
  return { writes, chain };
});

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => chain(table),
    storage: { from: () => ({ upload: () => Promise.resolve({ error: null }) }) },
    functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    rpc: () => Promise.resolve({ data: [], error: null }),
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'emp-1', company_id: 'co-1' },
    company: { name: 'Grafter', default_tax_rate: 10 },
  }),
}));

vi.mock('./devFieldAuditAuth', () => ({
  isDevFieldAuditAuth: () => false,
  pageQueryBlocked: () => false,
}));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  writes.length = 0;
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

async function setNamedDate(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement | null
    ?? document.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`missing ${id}`);
  expect(input.getAttribute('data-date-field')).toBe('au');
  await act(async () => {
    setInput(input, value);
  });
}

describe('probe G4', () => {
  it('PROBE G4 blocks QuoteEditorModal Valid until with a line item', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <QuoteEditorModal
          key="new-quote-g4"
          quote={null}
          presetClientId="cl-1"
          defaultTaxRate={10}
          onClose={() => {}}
          onSaved={onSaved}
          onRequestSend={() => {}}
        />,
      ));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const desc = document.querySelector<HTMLInputElement>('input[placeholder="Description"]');
    const qty = document.querySelector<HTMLInputElement>('input[placeholder="0"]');
    const price = document.querySelector<HTMLInputElement>('input[placeholder="0.00"]');
    if (desc) await act(async () => { setInput(desc, 'Labour'); });
    if (qty && !qty.value) await act(async () => { setInput(qty, '1'); });
    if (price && !price.value) await act(async () => { setInput(price, '100'); });
    await setNamedDate('quote-valid-until', '31/02/2026');
    await act(async () => {
      document.querySelectorAll('button').forEach(btn => {
        const label = (btn.textContent ?? '').trim();
        if (label === 'Save' || label === 'Save draft') btn.click();
      });
    });
    expect(writes.filter(w => (w as { table?: string }).table === 'quotes')).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);
  });
});
