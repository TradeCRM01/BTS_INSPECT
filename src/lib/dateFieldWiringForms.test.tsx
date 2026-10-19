/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui/Toast';
import { ExpenseEditorModal } from '../pages/ExpensesPage';
import { InvoiceEditorModal, InvoiceRecordPaymentSheet } from '../pages/InvoicesPage';
import { QuoteEditorModal } from '../pages/QuotesPage';
import { ApplyEmployeeCostModelModal, ApplyExpenseTemplateModal } from '../components/expenses/ExpenseModelsModals';
import { DATE_INVALID_MESSAGE, DATE_REQUIRED_MESSAGE } from './dateTimeIntegrity';

const { writes, uploads, chain } = vi.hoisted(() => {
  const writes: unknown[] = [];
  const uploads: unknown[] = [];
  function rowsFor(table: string) {
    if (table === 'profiles') return [{ id: 'emp-1', name: 'Sam' }];
    if (table === 'clients') return [{ id: 'cl-1', name: 'Northside', email: 'a@example.com', phone: '0400000000', address: '1 Test St' }];
    if (table === 'jobs') return [];
    if (table === 'stock_items' || table === 'price_book_items' || table === 'quotes' || table === 'invoices') return [];
    if (table === 'expense_cost_models') {
      return [{ id: 'm1', name: 'Crew', billing_period: 'monthly', lines: [{ employee_cost_type: 'wages', category: 'Wages', description: 'Wages', amount: 10, tax_rate: 0, amount_mode: 'fixed', time_unit: 'monthly' }] }];
    }
    if (table === 'expense_templates') {
      return [{ id: 't1', name: 'Rent', lines: [{ cost_class: 'overhead', category: 'Rent', description: 'Rent', amount: 10, tax_rate: 0 }] }];
    }
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
  return { writes, uploads, chain };
});

vi.mock('./supabase', () => ({
  supabase: {
    from: (table: string) => chain(table),
    storage: {
      from: () => ({
        upload: (path: string) => {
          uploads.push(path);
          return Promise.resolve({ error: null });
        },
      }),
    },
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
  uploads.length = 0;
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
  expect(input.getAttribute('type')).toBe('text');
  await act(async () => {
    setInput(input, value);
  });
}

function clickSave() {
  document.querySelectorAll('button').forEach(btn => {
    const label = (btn.textContent ?? '').trim();
    if (label === 'Save' || label === 'Save draft' || label === 'Apply' || label === 'Post') {
      btn.click();
    }
  });
}

function clickNamed(label: string) {
  const btn = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').includes(label));
  if (!btn) throw new Error(`missing ${label}`);
  btn.click();
}

async function flushActs() {
  await act(async () => {
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
  });
}

const acceptedQuote = {
  id: 'q-1',
  company_id: 'co-1',
  quote_number: 12,
  client_id: 'cl-1',
  job_id: null,
  status: 'accepted' as const,
  description: 'Site works',
  scope_of_works: 'Labour',
  line_items: [{ description: 'Labour', quantity: 1, unit_price: 100 }],
  subtotal: 100,
  tax_rate: 10,
  tax_amount: 10,
  total: 110,
  validity_date: '2026-11-19',
  notes: null,
  inclusions: [] as string[],
  exclusions: [] as string[],
  scheduled_date: '2026-10-21',
  assigned_team: ['emp-1'] as string[],
  created_by: 'emp-1',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  client_name: 'Northside',
  client_email: 'a@example.com',
  invoice_id: null,
};

describe('expense / invoice payment date wiring', () => {
  it('blocks the expenses sheet date field', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <ExpenseEditorModal
          expense={null}
          layout="sheet"
          formLookSeed={{
            cost_class: 'cogs',
            category: 'Materials (job)',
            description: 'Tape',
            amount: '10',
            expense_date: '2026-10-19',
          }}
          defaultTaxRate={10}
          receiptFile={new File(['x'], 'receipt.pdf', { type: 'application/pdf' })}
          onClose={() => {}}
          onSaved={onSaved}
          onDeleted={() => {}}
        />,
      ));
    });
    await setNamedDate('expense-date', '31/02/2026');
    await act(async () => { clickSave(); });
    expect(writes).toEqual([]);
    expect(uploads).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);
  });

  it('blocks ExpenseEditorModal save and receipt upload on 31/02/2026', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <ExpenseEditorModal
          expense={null}
          formLookSeed={{
            cost_class: 'cogs',
            category: 'Materials (job)',
            description: 'Tape',
            amount: '10',
            expense_date: '2026-10-19',
          }}
          defaultTaxRate={10}
          receiptFile={new File(['x'], 'receipt.pdf', { type: 'application/pdf' })}
          onClose={() => {}}
          onSaved={onSaved}
          onDeleted={() => {}}
        />,
      ));
    });
    await act(async () => { await Promise.resolve(); });
    await setNamedDate('expense-date', '31/02/2026');
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.hub-expenses-save, button.btn-primary')?.click();
      document.querySelectorAll('button').forEach(btn => {
        if (btn.textContent?.includes('Save')) btn.click();
      });
    });
    expect(writes).toEqual([]);
    expect(uploads).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);
  });

  it('blocks ExpenseEditorModal when the date is blank', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <ExpenseEditorModal
          expense={null}
          formLookSeed={{
            cost_class: 'cogs',
            category: 'Materials (job)',
            description: 'Tape',
            amount: '10',
            expense_date: '2026-10-19',
          }}
          defaultTaxRate={10}
          onClose={() => {}}
          onSaved={onSaved}
          onDeleted={() => {}}
        />,
      ));
    });
    await act(async () => { await Promise.resolve(); });
    await setNamedDate('expense-date', '');
    await act(async () => { clickSave(); });
    expect(writes).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(DATE_REQUIRED_MESSAGE);
  });

  it('blocks model and template expense dates', async () => {
    await act(async () => {
      root.render(providers(
        <ApplyEmployeeCostModelModal onClose={() => {}} onApplied={() => {}} />,
      ));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    const selectAll = [...document.querySelectorAll('button')].find(btn => btn.textContent?.includes('Select all'));
    await act(async () => { selectAll?.click(); });
    for (const id of ['model-expense-date', 'model-period-start', 'model-period-end']) {
      expect(document.getElementById(id)?.getAttribute('data-date-field')).toBe('au');
    }
    await setNamedDate('model-expense-date', '31/02/2026');
    await act(async () => { clickNamed('Post employee costs'); });
    await flushActs();
    expect(writes).toEqual([]);
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);

    writes.length = 0;
    await act(async () => {
      root.render(providers(
        <ApplyExpenseTemplateModal onClose={() => {}} onApplied={() => {}} />,
      ));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await setNamedDate('template-expense-date', '31/02/2026');
    await act(async () => { clickNamed('Post template'); });
    await flushActs();
    expect(writes).toEqual([]);
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);
  });

  it('blocks an invalid cost-model expense date and does not post', async () => {
    await act(async () => {
      root.render(providers(
        <ApplyEmployeeCostModelModal onClose={() => {}} onApplied={() => {}} />,
      ));
    });
    await flushActs();
    const selectAll = [...document.querySelectorAll('button')].find(btn => btn.textContent?.includes('Select all'));
    await act(async () => { selectAll?.click(); });
    await setNamedDate('model-expense-date', '31/02/2026');
    await act(async () => { clickNamed('Post employee costs'); });
    await flushActs();
    expect(writes).toEqual([]);
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);
  });

  it('blocks an invalid template expense date and does not post', async () => {
    await act(async () => {
      root.render(providers(
        <ApplyExpenseTemplateModal onClose={() => {}} onApplied={() => {}} />,
      ));
    });
    await flushActs();
    await setNamedDate('template-expense-date', '31/02/2026');
    await act(async () => { clickNamed('Post template'); });
    await flushActs();
    expect(writes).toEqual([]);
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);
  });

  it('blocks a blank cost-model expense date', async () => {
    await act(async () => {
      root.render(providers(
        <ApplyEmployeeCostModelModal onClose={() => {}} onApplied={() => {}} />,
      ));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
    const selectAll = [...document.querySelectorAll('button')].find(btn => btn.textContent?.includes('Select all'));
    await act(async () => { selectAll?.click(); });
    await setNamedDate('model-expense-date', '');
    await act(async () => { clickNamed('Post employee costs'); });
    await flushActs();
    expect(writes).toEqual([]);
    expect(document.body.textContent).toContain(DATE_REQUIRED_MESSAGE);
  });

  it('blocks a blank template expense date', async () => {
    await act(async () => {
      root.render(providers(
        <ApplyExpenseTemplateModal onClose={() => {}} onApplied={() => {}} />,
      ));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await setNamedDate('template-expense-date', '');
    await act(async () => { clickNamed('Post template'); });
    await flushActs();
    expect(writes).toEqual([]);
    expect(document.body.textContent).toContain(DATE_REQUIRED_MESSAGE);
  });

  it('blocks pay-period dates on an employee expense before upload', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <ExpenseEditorModal
          expense={null}
          formLookSeed={{
            cost_class: 'employee',
            category: 'Wages',
            description: 'Wages',
            amount: '10',
            expense_date: '2026-10-19',
            employee_id: 'emp-1',
            employee_cost_type: 'wages',
          }}
          defaultTaxRate={10}
          receiptFile={new File(['x'], 'receipt.pdf', { type: 'application/pdf' })}
          onClose={() => {}}
          onSaved={onSaved}
          onDeleted={() => {}}
        />,
      ));
    });
    await act(async () => { await Promise.resolve(); });
    await setNamedDate('expense-period-start', '31/02/2026');
    await act(async () => { clickSave(); });
    expect(writes).toEqual([]);
    expect(uploads).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);

    writes.length = 0;
    uploads.length = 0;
    await setNamedDate('expense-period-end', '31/02/2026');
    await act(async () => { clickSave(); });
    expect(writes).toEqual([]);
    expect(uploads).toEqual([]);
  });

  it('blocks an invalid invoice payment date', async () => {
    const onConfirm = vi.fn();
    await act(async () => {
      root.render(providers(
        <InvoiceRecordPaymentSheet
          total={100}
          amountPaid={0}
          busy={false}
          onCancel={() => {}}
          onConfirm={onConfirm}
        />,
      ));
    });
    await setNamedDate('invoice-payment-date', '31/02/2026');
    await act(async () => {
      document.querySelector<HTMLFormElement>('form')?.requestSubmit();
    });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);
    await act(async () => {
      document.querySelector<HTMLButtonElement>('.hub-invoice-payment-confirm')?.click();
    });
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('blocks QuoteEditorModal Valid until when a line item is present', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <QuoteEditorModal
          key="new-quote-valid-until"
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
    await act(async () => { clickSave(); });
    expect(writes.filter(w => (w as { table?: string }).table === 'quotes')).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);
  });

  it('blocks QuoteEditorModal Valid until and Convert dates', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <QuoteEditorModal
          key="new-quote"
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
    await setNamedDate('quote-valid-until', '31/02/2026');
    await act(async () => { clickSave(); });
    expect(writes).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);

    writes.length = 0;
    await act(async () => {
      root.render(providers(
        <QuoteEditorModal
          key="accepted-quote"
          quote={acceptedQuote}
          defaultTaxRate={10}
          onClose={() => {}}
          onSaved={onSaved}
          onRequestSend={() => {}}
        />,
      ));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await setNamedDate('quote-convert-date', '31/02/2026');
    const convert = [...document.querySelectorAll('button')].find(btn => (btn.textContent ?? '').trim() === 'Convert to job');
    await act(async () => { convert?.click(); });
    expect(writes.filter(w => (w as { table?: string }).table === 'quotes' || (w as { table?: string }).table === 'jobs')).toEqual([]);
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);
  });

  it('blocks InvoiceEditorModal due date', async () => {
    const onSaved = vi.fn();
    await act(async () => {
      root.render(providers(
        <InvoiceEditorModal
          invoice={null}
          presetClientId="cl-1"
          defaultTaxRate={10}
          smtpReady={false}
          onClose={() => {}}
          onSaved={onSaved}
          onRequestSend={() => {}}
        />,
      ));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const desc = document.querySelector<HTMLInputElement>('input[placeholder="Description"]');
    if (desc) {
      await act(async () => { setInput(desc, 'Labour'); });
    }
    const qty = document.querySelector<HTMLInputElement>('input[placeholder="0"]');
    if (qty && !qty.value) {
      await act(async () => { setInput(qty, '1'); });
    }
    const price = document.querySelector<HTMLInputElement>('input[placeholder="0.00"]');
    if (price && !price.value) {
      await act(async () => { setInput(price, '100'); });
    }
    await setNamedDate('invoice-due-date', '31/02/2026');
    await act(async () => { clickSave(); });
    expect(writes).toEqual([]);
    expect(onSaved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(DATE_INVALID_MESSAGE);
  });
});
