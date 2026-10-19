/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DECIMAL_EMPTY, DECIMAL_INVALID, DECIMAL_NEGATIVE, MONEY_COMMA_HINT, commitDocumentLine, numberDraftAllowed } from '../lib/parseDecimal';
import { commercialLinesForPreview, commitCommercialLines } from '../lib/commitCommercialLines';
import { calcSubtotal, emptyLineItem, LineItemEditor } from '../components/invoicing/LineItemEditor';
import { ToastProvider } from '../components/ui/Toast';

const harness = vi.hoisted(() => ({
  inserts: [] as { table: string; payload: Record<string, unknown> }[],
  updates: [] as { table: string; payload: Record<string, unknown> }[],
  profile: { company_id: 'co-1', id: 'user-1', name: 'QA', role: 'admin' },
  company: { id: 'co-1', name: 'QA Co', default_tax_rate: 10, default_material_markup: 20 },
  models: [{
    id: 'm1',
    company_id: 'co-1',
    name: 'Wages',
    notes: null,
    billing_period: 'monthly',
    lines: [{
      employee_cost_type: 'wages',
      category: 'Wages & Salaries',
      description: 'Base wages',
      amount: 45,
      amount_mode: 'hours_x_rate',
      time_unit: 'hourly',
      tax_rate: 0,
    }],
  }],
  employees: [{ id: 'e1', name: 'Sam' }],
}));

function thenable<T>(data: T, table: string) {
  const result = { data, error: null };
  const query: Record<string, unknown> = {};
  const self = () => query;
  for (const key of ['select', 'eq', 'neq', 'is', 'or', 'order', 'limit', 'maybeSingle', 'single']) {
    query[key] = self;
  }
  query.insert = (payload: Record<string, unknown> | Record<string, unknown>[]) => {
    const rows = Array.isArray(payload) ? payload : [payload];
    rows.forEach(row => harness.inserts.push({ table, payload: row }));
    return thenable({ id: `${table}-new`, ...(rows[0] ?? {}) }, table);
  };
  query.update = (payload: Record<string, unknown>) => {
    harness.updates.push({ table, payload });
    return query;
  };
  query.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(onFulfilled, onRejected);
  return query;
}

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: harness.profile,
    company: harness.company,
    session: { access_token: 'tok' },
  }),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from(table: string) {
      return thenable(
        table === 'expense_cost_models' ? harness.models
          : table === 'profiles' ? harness.employees
            : table === 'clients' ? [{ id: 'cl-1', name: 'Northside' }]
              : table === 'suppliers' ? [{ id: 'sup-1', name: 'Sparky Supplies', archived: false }]
                : table === 'jobs' ? []
                  : table === 'stock_items' ? {
                    id: 'st-1',
                    company_id: 'co-1',
                    name: 'Conduit',
                    sku: 'PVC-20',
                    description: null,
                    category: 'conduit',
                    unit_of_measure: 'each',
                    quantity_on_hand: 24,
                    reorder_level: 0,
                    reorder_quantity: 0,
                    storage_location: null,
                    unit_cost: 4.8,
                    supplier_id: null,
                    archived: false,
                    created_at: '2026-10-01T00:00:00.000Z',
                    updated_at: '2026-10-01T00:00:00.000Z',
                  }
                    : [],
        table,
      );
    },
    rpc() { return Promise.resolve({ data: [], error: null }); },
    storage: { from() { return { upload: () => Promise.resolve({ error: null }) }; } },
  },
}));

import { useState } from 'react';
import { ExpenseEditorModal, sanitizeExpenseDecimalDraft } from './ExpensesPage';
import { PriceBookItemForm, commitPriceBookPrices } from './PriceBooksPage';
import { StockItemForm, commitStockQtyOnHand } from './StockPage';
import { StockAdjustmentForm, StockDetailPage, commitStockAdjustment } from './StockDetailPage';
import { POEditorModal, commitPOLine } from './PurchaseOrdersPage';
import { InvoiceEditorModal, InvoiceRecordPaymentSheet } from './InvoicesPage';
import { QuoteEditorModal, quotePreviewLines } from './QuotesPage';
import { formatCommercialPdfLineAmount } from '../reports/commercial/CommercialDocumentPdf';
import { expenseIncGstBlurStep, expenseAmountTypingFromEx, expenseIncGstInputStep } from './ExpensesPage';
import { JobFormModal, commitJobBudget } from '../components/crm/JobFormModal';
import { PriceBookPdfImportModal } from '../components/pricebooks/PriceBookPdfImportModal';
import { ApplyEmployeeCostModelModal, ManageCostModelsModal, commitModelLine, commitModelLines } from '../components/expenses/ExpenseModelsModals';
import { JobCostingPanel, commitJobBillCharge } from '../components/jobs/JobCostingPanel';
import userEvent from '@testing-library/user-event';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.inserts = [];
  harness.updates = [];
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function pageRoot() {
  return document.body;
}

function setNativeValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  const desc = Object.getOwnPropertyDescriptor(proto, 'value');
  desc?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function waitFor(selector: string) {
  for (let i = 0; i < 60; i++) {
    const el = pageRoot().querySelector(selector);
    if (el) return el;
    await flush();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
    });
  }
  return pageRoot().querySelector(selector);
}

async function typeKeys(el: HTMLInputElement, text: string) {
  await act(async () => {
    el.focus();
    setNativeValue(el, '');
  });
  for (const ch of text) {
    await act(async () => {
      setNativeValue(el, `${el.value}${ch}`);
    });
  }
}

function LineEditorHarness({
  initial,
  onLines,
}: {
  initial: ReturnType<typeof emptyLineItem>[];
  onLines?: (lines: ReturnType<typeof emptyLineItem>[]) => void;
}) {
  const [lines, setLines] = useState(initial);
  return (
    <LineItemEditor
      lines={lines}
      stockItems={[]}
      defaultMarkup={0}
      onChange={next => {
        setLines(next);
        onLines?.(next);
      }}
    />
  );
}

function wrap(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ToastProvider>{node}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

async function renderNode(node: ReactNode) {
  await act(async () => {
    root.render(wrap(node));
  });
  await flush();
}

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('commit helpers reject 1,5 on every money form', () => {
  it('blocks quote/invoice lines, budget, price book, PO, stock, job bill, wage, and model line', () => {
    expect(commitCommercialLines([{
      ...emptyLineItem(),
      description: 'Labour',
      quantity: '1',
      unit_price: '1,5',
    }])).toEqual({ ok: false, message: `Line 1: ${MONEY_COMMA_HINT}` });
    expect(commitCommercialLines([{
      ...emptyLineItem(),
      description: 'Labour',
      quantity: '1,5',
      unit_price: '10',
    }])).toEqual({
      ok: true,
      lines: [expect.objectContaining({ quantity: 1.5, unit_price: 10 })],
    });
    expect(commitJobBudget('1,5')).toEqual({ ok: false, message: MONEY_COMMA_HINT });
    expect(commitJobBudget('1,250')).toEqual({ ok: true, value: 1250 });
    expect(commitPriceBookPrices('1,5', '')).toEqual({ ok: false, message: MONEY_COMMA_HINT });
    expect(commitPriceBookPrices('1,250', '1,5')).toEqual({ ok: false, message: MONEY_COMMA_HINT });
    expect(commitDocumentLine({ quantity: '1', unit_price: '10', unit_cost: '1,5' })).toEqual({
      ok: false,
      message: MONEY_COMMA_HINT,
    });
    expect(commitDocumentLine({ quantity: '1', unit_price: '10', unit_cost: '1,5' })).not.toEqual({
      ok: true,
      quantity: 1,
      unit_price: 10,
      unit_cost: 1,
    });
    expect(commitPOLine({ description: 'Conduit', quantity: '1', unit_cost: '1,5', received_quantity: 0 })).toEqual({
      ok: false,
      message: MONEY_COMMA_HINT,
    });
    expect(commitPOLine({ description: 'Conduit', quantity: '1,5', unit_cost: '10', received_quantity: 0 })).toMatchObject({
      ok: true,
      line: { quantity: 1.5, unit_cost: 10 },
    });
    expect(commitPOLine({ description: 'Conduit', quantity: '1,250', unit_cost: '10', received_quantity: 0 })).toMatchObject({
      ok: true,
      line: { quantity: 1250, unit_cost: 10 },
    });
    expect(commitPOLine({ description: 'Conduit', quantity: '1,250', unit_cost: '10', received_quantity: 0 })).not.toMatchObject({
      ok: true,
      line: { quantity: 1.25 },
    });
    expect(commitJobBillCharge('1', '10', '1,5')).toEqual({ ok: false, message: MONEY_COMMA_HINT });
    expect(commitJobBillCharge('1,5', '10', '20')).toEqual({
      ok: true,
      quantity: 1.5,
      unit_cost: 10,
      unit_price: 20,
    });
    expect(commitModelLine({
      employee_cost_type: 'wages',
      category: 'Wages',
      description: 'Base',
      amount: '1,5',
      amount_mode: 'fixed',
      hours: '',
      time_unit: 'hourly',
      tax_rate: '',
    })).toEqual({ ok: false, message: MONEY_COMMA_HINT });
    expect(commitModelLine({
      employee_cost_type: 'wages',
      category: 'Wages',
      description: 'Base',
      amount: '45',
      amount_mode: 'fixed',
      hours: '',
      time_unit: 'hourly',
      tax_rate: '1,5',
    })).toMatchObject({ ok: true, line: { amount: 45, tax_rate: 1.5 } });
    expect(commitModelLine({
      employee_cost_type: 'wages',
      category: 'Wages',
      description: 'Base',
      amount: '45',
      amount_mode: 'fixed',
      hours: '',
      time_unit: 'hourly',
      tax_rate: '1,5',
    })).not.toMatchObject({ ok: true, line: { tax_rate: 1 } });
    expect(commitModelLines([{
      employee_cost_type: 'wages',
      category: 'Wages',
      description: 'Base',
      amount: '1,5',
      amount_mode: 'fixed',
      hours: '',
      time_unit: 'hourly',
      tax_rate: '',
    }])).toEqual({ ok: false, message: MONEY_COMMA_HINT });
    expect(commercialLinesForPreview([{
      ...emptyLineItem(),
      description: 'Labour',
      quantity: '1',
      unit_price: '1,5',
    }])).toEqual([]);
    expect(commercialLinesForPreview([{
      ...emptyLineItem(),
      description: 'Labour',
      quantity: '1',
      unit_price: '1,250',
    }])).toMatchObject([{ quantity: 1, unit_price: 1250 }]);
    expect(quotePreviewLines({ line_items: [{
      ...emptyLineItem(),
      description: 'Labour',
      quantity: '1',
      unit_price: '1,5',
    }] })).toEqual([]);
    expect(quotePreviewLines({ line_items: [{
      ...emptyLineItem(),
      description: 'Labour',
      quantity: '1',
      unit_price: '1,250',
    }] })).toMatchObject([{ quantity: 1, unit_price: 1250 }]);
    expect(numberDraftAllowed('abc')).toBe(false);
    expect(numberDraftAllowed('1,5')).toBe(true);
    expect(sanitizeExpenseDecimalDraft('nope')).toBeNull();
    expect(sanitizeExpenseDecimalDraft('1,5')).toBe('1,5');
    expect(commitStockQtyOnHand('1,5')).toEqual({ ok: true, value: 1.5 });
    expect(commitStockQtyOnHand('1,250')).toEqual({ ok: true, value: 1250 });
    expect(commitStockQtyOnHand('1,')).toEqual({ ok: false, message: DECIMAL_INVALID });
    expect(commitStockAdjustment('1,5')).toEqual({ ok: true, value: 1.5 });
    expect(commitStockAdjustment('1,250')).toEqual({ ok: true, value: 1250 });
    expect(commitStockAdjustment('1,')).toEqual({ ok: false, message: DECIMAL_INVALID });
    expect(commitStockAdjustment('-1,5')).toEqual({ ok: true, value: -1.5 });
    expect(commitStockAdjustment('0')).toEqual({ ok: false, message: DECIMAL_INVALID });
  });
});

describe('LineItemEditor unit price, qty, line total', () => {
  it('types 1,5 into unit price, shows the hint, and keeps line total off $15', async () => {
    let lines = [{ ...emptyLineItem(), description: 'Labour', quantity: '1', unit_price: '' }];
    await renderNode(
      <LineEditorHarness
        initial={lines}
        onLines={next => { lines = next; }}
      />,
    );
    const price = pageRoot().querySelector('[aria-label="Unit price"]') as HTMLInputElement;
    await typeKeys(price, '1,5');
    expect(price.value).toBe('1,5');
    expect(pageRoot().textContent).toContain(MONEY_COMMA_HINT);
    expect(pageRoot().textContent).not.toContain('$15.00');
    expect(pageRoot().textContent).not.toContain('$1.00');
    expect(pageRoot().querySelector('[aria-label="Line total"]')?.textContent).toBe('—');
    expect(calcSubtotal(lines)).toBe(0);
  });

  it('types qty 1,5 as 1.5 and 1,250 unit price as 1250', async () => {
    let lines = [{ ...emptyLineItem(), description: 'Labour', quantity: '', unit_price: '' }];
    await renderNode(
      <LineEditorHarness
        initial={lines}
        onLines={next => { lines = next; }}
      />,
    );
    await typeKeys(pageRoot().querySelector('[aria-label="Quantity"]') as HTMLInputElement, '1,5');
    await typeKeys(pageRoot().querySelector('[aria-label="Unit price"]') as HTMLInputElement, '1,250');
    const qty = pageRoot().querySelector('[aria-label="Quantity"]') as HTMLInputElement;
    const price = pageRoot().querySelector('[aria-label="Unit price"]') as HTMLInputElement;
    expect(qty.value).toBe('1,5');
    expect(price.value).toBe('1,250');
    expect(commitCommercialLines(lines)).toMatchObject({
      ok: true,
      lines: [{ quantity: 1.5, unit_price: 1250 }],
    });
    expect(calcSubtotal(lines)).toBe(1875);
  });
});

describe('Quotes and invoices persist wiring', () => {
  async function fillLine(description: string, priceRaw: string) {
    const lineDesc = pageRoot().querySelector('[aria-label="Description"]') as HTMLInputElement;
    const price = pageRoot().querySelector('[aria-label="Unit price"]') as HTMLInputElement;
    await act(async () => { setNativeValue(lineDesc, description); });
    await typeKeys(price, priceRaw);
    return { lineDesc, price };
  }

  function saveButton() {
    return Array.from(pageRoot().querySelectorAll('button')).find(b => /Save draft|^Save$/i.test(b.textContent || '')) as HTMLButtonElement;
  }

  it('rendered quote save writes committed 1,250 and refuses 1,5', async () => {
    await renderNode(
      <QuoteEditorModal
        quote={null}
        presetClientId="cl-1"
        defaultTaxRate={10}
        onClose={() => {}}
        onSaved={() => {}}
        onRequestSend={() => {}}
      />,
    );
    await fillLine('Labour', '1,5');
    expect(pageRoot().textContent).toContain(MONEY_COMMA_HINT);
    await act(async () => { saveButton().click(); });
    await flush();
    expect(harness.inserts.filter(row => row.table === 'quotes')).toEqual([]);

    await fillLine('Labour', '1,250');
    await act(async () => { saveButton().click(); });
    await flush();
    const quotes = harness.inserts.filter(row => row.table === 'quotes');
    expect(quotes).toHaveLength(1);
    expect((quotes[0]?.payload.line_items as { unit_price: number }[])[0]?.unit_price).toBe(1250);
    expect((quotes[0]?.payload.line_items as { unit_price: number }[])[0]?.unit_price).not.toBe(1);
  });

  it('rendered invoice save writes committed 1,250 and refuses 1,5', async () => {
    await renderNode(
      <InvoiceEditorModal
        invoice={null}
        presetClientId="cl-1"
        defaultTaxRate={10}
        smtpReady={false}
        onClose={() => {}}
        onSaved={() => {}}
        onRequestSend={() => {}}
      />,
    );
    await fillLine('Labour', '1,5');
    expect(pageRoot().textContent).toContain(MONEY_COMMA_HINT);
    await act(async () => { saveButton().click(); });
    await flush();
    expect(harness.inserts.filter(row => row.table === 'invoices')).toEqual([]);

    await fillLine('Labour', '1,250');
    await act(async () => { saveButton().click(); });
    await flush();
    const invoices = harness.inserts.filter(row => row.table === 'invoices');
    expect(invoices).toHaveLength(1);
    expect((invoices[0]?.payload.line_items as { unit_price: number }[])[0]?.unit_price).toBe(1250);
  });
});

describe('Expense inc GST keystrokes', () => {
  it('types 1,5 key by key and keeps 1,5 — never 15 or $15', async () => {
    await renderNode(
      <ExpenseEditorModal
        expense={null}
        defaultTaxRate={10}
        formLookSeed={{ description: 'Fuel', category: 'Fuel' }}
        onClose={() => {}}
        onSaved={() => {}}
        onDeleted={() => {}}
      />,
    );
    const inc = pageRoot().querySelector('[aria-label="Amount (inc GST)"]') as HTMLInputElement;
    await typeKeys(inc, '1,5');
    expect(inc.value).toBe('1,5');
    expect(inc.value).not.toBe('15');
    expect(pageRoot().textContent).toContain(MONEY_COMMA_HINT);
    const save = Array.from(pageRoot().querySelectorAll('button')).find(b => b.textContent === 'Save') as HTMLButtonElement;
    await act(async () => { save.click(); });
    await flush();
    expect(harness.inserts.filter(row => row.table === 'expenses')).toEqual([]);
    expect(pageRoot().textContent).toContain(MONEY_COMMA_HINT);
  });

  it('types 12,50 key by key and does not become 1250', async () => {
    await renderNode(
      <ExpenseEditorModal
        expense={null}
        defaultTaxRate={10}
        formLookSeed={{ description: 'Fuel', category: 'Fuel' }}
        onClose={() => {}}
        onSaved={() => {}}
        onDeleted={() => {}}
      />,
    );
    const inc = pageRoot().querySelector('[aria-label="Amount (inc GST)"]') as HTMLInputElement;
    await typeKeys(inc, '12,50');
    expect(inc.value).toBe('12,50');
    expect(inc.value).not.toBe('1250');
    expect(pageRoot().textContent).toContain(MONEY_COMMA_HINT);
  });
});

describe('Budget, price book, stock, PO, PDF import', () => {
  it('budget 1,5 shows the hint and does not save', async () => {
    await renderNode(
      <JobFormModal
        presetDate={null}
        presetClientId={null}
        job={{
          id: 'j1',
          company_id: 'co-1',
          title: 'Switchboard',
          client_id: 'cl-1',
          description: null,
          status: 'scheduled',
          priority: 'medium',
          scheduled_date: '2026-10-20',
          start_time: '07:00',
          end_time: '15:00',
          address: null,
          assigned_team: [],
          budget: null,
          parent_job_id: null,
          cost_code: null,
          color: null,
        } as never}
        fields="details"
        onClose={() => {}}
        onSaved={() => {}}
      />,
    );
    const budget = pageRoot().querySelector('[aria-label="Job Budget (AUD)"]') as HTMLInputElement;
    await typeKeys(budget, '1,5');
    expect(budget.value).toBe('1,5');
    expect(pageRoot().textContent).toContain(MONEY_COMMA_HINT);
    const save = Array.from(pageRoot().querySelectorAll('button')).find(b => /Save Changes/i.test(b.textContent || '')) as HTMLButtonElement;
    await act(async () => { save.click(); });
    await flush();
    expect(harness.updates.filter(row => row.table === 'jobs')).toEqual([]);
  });

  it('price book unit price 1,5 blocks Save', async () => {
    await renderNode(
      <PriceBookItemForm item={null} priceBookId="pb-1" onClose={() => {}} onSaved={() => {}} />,
    );
    const desc = container.querySelector('input[placeholder="e.g. Install double power point"]') as HTMLInputElement;
    const unit = container.querySelector('[aria-label="Unit Price"]') as HTMLInputElement;
    await act(async () => { setNativeValue(desc, 'Power point'); });
    await typeKeys(unit, '1,5');
    expect(container.textContent).toContain(MONEY_COMMA_HINT);
    await act(async () => {
      container.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flush();
    expect(harness.inserts.filter(row => row.table === 'price_book_items')).toEqual([]);
  });

  it('stock unit cost 1,5 blocks Save', async () => {
    await renderNode(
      <StockItemForm item={null} onClose={() => {}} onSaved={() => {}} />,
    );
    const name = container.querySelector('input[placeholder="e.g. 20mm PVC Conduit"]') as HTMLInputElement;
    const cost = container.querySelector('[aria-label="Unit Cost (AUD)"]') as HTMLInputElement;
    await act(async () => { setNativeValue(name, 'Conduit'); });
    await typeKeys(cost, '1,5');
    expect(container.textContent).toContain(MONEY_COMMA_HINT);
    const add = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Add Item') as HTMLButtonElement;
    await act(async () => { add.click(); });
    await flush();
    expect(harness.inserts.filter(row => row.table === 'stock_items')).toEqual([]);
  });

  it('PO unit cost 1,5 blocks Save', async () => {
    await renderNode(
      <POEditorModal
        po={{
          id: 'po-1',
          company_id: 'co-1',
          po_number: 1,
          supplier_id: 'sup-1',
          job_id: null,
          status: 'draft',
          line_items: [{ description: 'Conduit', quantity: 1, unit_cost: 10, received_quantity: 0 }],
          subtotal: 10,
          tax_rate: 10,
          tax_amount: 1,
          total: 11,
          expected_delivery_date: null,
          notes: null,
          created_by: 'user-1',
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-01T00:00:00.000Z',
        } as never}
        onClose={() => {}}
        onSaved={() => {}}
        onRequestSend={() => {}}
      />,
    );
    const cost = container.querySelector('[aria-label="Unit cost"]') as HTMLInputElement;
    await typeKeys(cost, '1,5');
    expect(container.textContent).toContain(MONEY_COMMA_HINT);
    const save = Array.from(container.querySelectorAll('button')).find(b => /Save Changes|Create PO/i.test(b.textContent || '')) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await act(async () => { save.click(); });
    await flush();
    expect(harness.updates.filter(row => row.table === 'purchase_orders')).toEqual([]);
    expect(harness.inserts.filter(row => row.table === 'purchase_orders')).toEqual([]);
    expect(harness.updates.some(row => row.payload.line_items && (row.payload.line_items as { unit_cost: number }[])[0]?.unit_cost === 1)).toBe(false);
  });

  it('PDF import sell 1,5 shows the hint and does not insert', async () => {
    await renderNode(
      <PriceBookPdfImportModal
        priceBookId="pb-1"
        existingItems={[]}
        defaultMarkup={20}
        onClose={() => {}}
        onImported={() => {}}
        seedRows={[{
          key: 'r1',
          selected: true,
          action: 'insert',
          matchId: null,
          code: 'PVC-20',
          description: '20mm PVC',
          unit: 'each',
          category: 'conduit',
          cost_price: '4.80',
          unit_price: '',
          existingCost: null,
          existingSell: null,
        }]}
      />,
    );
    const sell = container.querySelector('[aria-label="PDF import sell"]') as HTMLInputElement;
    await typeKeys(sell, '1,5');
    expect(sell.value).toBe('1,5');
    expect(container.textContent).toContain(MONEY_COMMA_HINT);
    const apply = Array.from(container.querySelectorAll('button')).find(b => /Import|Apply/i.test(b.textContent || '')) as HTMLButtonElement;
    await act(async () => { apply?.click(); });
    await flush();
    expect(harness.inserts.filter(row => row.table === 'price_book_items')).toEqual([]);
  });

  it('PDF import cost 1,5 on a later row validates all first and inserts none', async () => {
    await renderNode(
      <PriceBookPdfImportModal
        priceBookId="pb-1"
        existingItems={[]}
        defaultMarkup={20}
        onClose={() => {}}
        onImported={() => {}}
        seedRows={[
          {
            key: 'r1',
            selected: true,
            action: 'insert',
            matchId: null,
            code: 'PVC-20',
            description: '20mm PVC',
            unit: 'each',
            category: 'conduit',
            cost_price: '4.80',
            unit_price: '10',
            existingCost: null,
            existingSell: null,
          },
          {
            key: 'r2',
            selected: true,
            action: 'insert',
            matchId: null,
            code: 'PVC-25',
            description: '25mm PVC',
            unit: 'each',
            category: 'conduit',
            cost_price: '1,5',
            unit_price: '12',
            existingCost: null,
            existingSell: null,
          },
        ]}
      />,
    );
    expect(container.textContent).toContain(MONEY_COMMA_HINT);
    const apply = Array.from(container.querySelectorAll('button')).find(b => /Import|Apply/i.test(b.textContent || '')) as HTMLButtonElement;
    await act(async () => { apply?.click(); });
    await flush();
    expect(harness.inserts.filter(row => row.table === 'price_book_items')).toEqual([]);
  });
});

describe('Record payment reason and overpay label', () => {
  it('shows why Confirm is disabled for 1,5, 12,50 and empty, and honours overpay', async () => {
    await renderNode(
      <InvoiceRecordPaymentSheet
        total={836}
        amountPaid={0}
        busy={false}
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    const amount = pageRoot().querySelector('[aria-label="Payment amount"]') as HTMLInputElement;
    expect(amount).toBeTruthy();
    const confirm = () => Array.from(pageRoot().querySelectorAll('button')).find(b => /Confirm payment/i.test(b.textContent || '')) as HTMLButtonElement;

    await act(async () => { setNativeValue(amount, ''); });
    expect(pageRoot().textContent).toContain(DECIMAL_EMPTY);
    expect(confirm().disabled).toBe(true);

    await act(async () => { setNativeValue(amount, '0'); });
    expect(pageRoot().textContent).toContain(DECIMAL_EMPTY);
    expect(confirm().disabled).toBe(true);

    await typeKeys(amount, '1,5');
    expect(pageRoot().textContent).toContain(MONEY_COMMA_HINT);
    expect(confirm().disabled).toBe(true);

    await act(async () => { setNativeValue(amount, ''); });
    await typeKeys(amount, '12,50');
    expect(pageRoot().textContent).toContain(MONEY_COMMA_HINT);
    expect(confirm().disabled).toBe(true);

    await act(async () => { setNativeValue(amount, '900'); });
    expect(pageRoot().textContent).toContain('That\'s more than the $836.00 balance owing');
    expect(pageRoot().textContent).toContain('Not recorded');
    expect(confirm().disabled).toBe(true);
  });
});

describe('Stock New Item qty and Manual Adjustment qty', () => {
  it('wires both qty fields through commitNumberField, not parseFloat or Number', () => {
    const stock = src('src/pages/StockPage.tsx');
    const detail = src('src/pages/StockDetailPage.tsx');
    expect(stock).toContain('commitStockQtyOnHand(form.quantity_on_hand)');
    expect(stock).toContain('commitNumberField(raw, \'zero\')');
    expect(stock).not.toMatch(/quantity_on_hand:\s*(Number|parseFloat)\(form\.quantity_on_hand/);
    expect(detail).toContain('commitStockAdjustment(adjQty)');
    expect(detail).toContain('commitNumberField(raw, \'reject\', { allowNegative: true })');
    expect(detail).not.toMatch(/Number\(adjQty\)/);
    expect(detail).not.toMatch(/parseFloat\(adjQty\)/);
    expect(detail).not.toContain('type="number"');
    const books = src('src/pages/PriceBooksPage.tsx');
    expect(books).toContain('if (!moneyDraftAllowed(e.target.value)) return;');
    const models = src('src/components/expenses/ExpenseModelsModals.tsx');
    expect(models).toContain('function acceptDecimalDraft(raw: string): boolean {\n  return moneyDraftAllowed(raw);\n}');
    const contracts = src('src/pages/ContractsPage.tsx');
    expect(contracts).toContain('return parseMoneyCommitted(raw);');
    expect(contracts).not.toMatch(/contract_value:\s*(Number|parseFloat)/);
  });

  it('New Item qty types 1,5 and saves 1.5, not 15', async () => {
    await renderNode(
      <StockItemForm item={null} onClose={() => {}} onSaved={() => {}} />,
    );
    const name = container.querySelector('input[placeholder="e.g. 20mm PVC Conduit"]') as HTMLInputElement;
    const qty = container.querySelector('[aria-label="Qty On Hand"]') as HTMLInputElement;
    await act(async () => { setNativeValue(name, 'Conduit'); });
    await typeKeys(qty, '1,5');
    expect(qty.value).toBe('1,5');
    expect(qty.value).not.toBe('15');
    const add = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Add Item') as HTMLButtonElement;
    await act(async () => { add.click(); });
    await flush();
    const rows = harness.inserts.filter(row => row.table === 'stock_items');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload.quantity_on_hand).toBe(1.5);
    expect(rows[0]?.payload.quantity_on_hand).not.toBe(15);
    expect(rows[0]?.payload.quantity_on_hand).not.toBe(1);
  });

  it('New Item qty types 1,250 and saves 1250, not parseFloat 1', async () => {
    await renderNode(
      <StockItemForm item={null} onClose={() => {}} onSaved={() => {}} />,
    );
    const name = container.querySelector('input[placeholder="e.g. 20mm PVC Conduit"]') as HTMLInputElement;
    const qty = container.querySelector('[aria-label="Qty On Hand"]') as HTMLInputElement;
    await act(async () => { setNativeValue(name, 'Conduit'); });
    await typeKeys(qty, '1,250');
    expect(qty.value).toBe('1,250');
    const add = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Add Item') as HTMLButtonElement;
    await act(async () => { add.click(); });
    await flush();
    const rows = harness.inserts.filter(row => row.table === 'stock_items');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload.quantity_on_hand).toBe(1250);
    expect(rows[0]?.payload.quantity_on_hand).not.toBe(1);
  });

  it('New Item qty incomplete 1, shows the hint and blocks Save', async () => {
    await renderNode(
      <StockItemForm item={null} onClose={() => {}} onSaved={() => {}} />,
    );
    const name = container.querySelector('input[placeholder="e.g. 20mm PVC Conduit"]') as HTMLInputElement;
    const qty = container.querySelector('[aria-label="Qty On Hand"]') as HTMLInputElement;
    await act(async () => { setNativeValue(name, 'Conduit'); });
    await typeKeys(qty, '1,');
    expect(qty.value).toBe('1,');
    expect(container.textContent).toContain(DECIMAL_INVALID);
    const add = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Add Item') as HTMLButtonElement;
    await act(async () => { add.click(); });
    await flush();
    expect(harness.inserts.filter(row => row.table === 'stock_items')).toEqual([]);
  });

  it('Manual Adjustment qty types 1,5 and submits 1.5, not 15', async () => {
    const seen: { quantity: number; reason: string }[] = [];
    function Harness() {
      const [qty, setQty] = useState('');
      const [reason, setReason] = useState('');
      return (
        <StockAdjustmentForm
          qty={qty}
          reason={reason}
          onQtyChange={setQty}
          onReasonChange={setReason}
          onSubmit={() => {
            const committed = commitStockAdjustment(qty);
            if (!committed.ok) return;
            seen.push({ quantity: committed.value, reason });
          }}
        />
      );
    }
    await renderNode(<Harness />);
    const qty = pageRoot().querySelector('[aria-label="Adjustment quantity"]') as HTMLInputElement;
    await typeKeys(qty, '1,5');
    expect(qty.value).toBe('1,5');
    expect(qty.value).not.toBe('15');
    const adjust = Array.from(pageRoot().querySelectorAll('button')).find(b => b.textContent?.includes('Adjust')) as HTMLButtonElement;
    expect(adjust.disabled).toBe(false);
    await act(async () => { adjust.click(); });
    await flush();
    expect(seen).toEqual([{ quantity: 1.5, reason: '' }]);
  });

  it('Manual Adjustment qty types 1,250 and submits 1250, not parseFloat 1', async () => {
    const seen: number[] = [];
    function Harness() {
      const [qty, setQty] = useState('');
      return (
        <StockAdjustmentForm
          qty={qty}
          reason=""
          onQtyChange={setQty}
          onReasonChange={() => {}}
          onSubmit={() => {
            const committed = commitStockAdjustment(qty);
            if (!committed.ok) return;
            seen.push(committed.value);
          }}
        />
      );
    }
    await renderNode(<Harness />);
    const qty = pageRoot().querySelector('[aria-label="Adjustment quantity"]') as HTMLInputElement;
    await typeKeys(qty, '1,250');
    expect(qty.value).toBe('1,250');
    const adjust = Array.from(pageRoot().querySelectorAll('button')).find(b => b.textContent?.includes('Adjust')) as HTMLButtonElement;
    await act(async () => { adjust.click(); });
    await flush();
    expect(seen).toEqual([1250]);
  });

  it('Manual Adjustment incomplete 1, shows the hint and blocks Save', async () => {
    const seen: number[] = [];
    function Harness() {
      const [qty, setQty] = useState('');
      return (
        <StockAdjustmentForm
          qty={qty}
          reason=""
          onQtyChange={setQty}
          onReasonChange={() => {}}
          onSubmit={() => {
            const committed = commitStockAdjustment(qty);
            if (!committed.ok) return;
            seen.push(committed.value);
          }}
        />
      );
    }
    await renderNode(<Harness />);
    const qty = pageRoot().querySelector('[aria-label="Adjustment quantity"]') as HTMLInputElement;
    await typeKeys(qty, '1,');
    expect(qty.value).toBe('1,');
    expect(pageRoot().textContent).toContain(DECIMAL_INVALID);
    const adjust = Array.from(pageRoot().querySelectorAll('button')).find(b => b.textContent?.includes('Adjust')) as HTMLButtonElement;
    expect(adjust.disabled).toBe(true);
    await act(async () => { adjust.click(); });
    await flush();
    expect(seen).toEqual([]);
  });
});

describe('Cost-model wage override', () => {
  it('types 1,5 on the wage override and shows the hint', async () => {
    await renderNode(
      <ApplyEmployeeCostModelModal onClose={() => {}} onApplied={() => {}} />,
    );
    const wage = await waitFor('[aria-label="Wage override"]') as HTMLInputElement;
    expect(wage).toBeTruthy();
    await typeKeys(wage, '1,5');
    expect(wage.value).toBe('1,5');
    expect(pageRoot().textContent).toContain(MONEY_COMMA_HINT);
    expect(pageRoot().textContent).toMatch(/\$\/hr/);
  });

  it('types 1,5 on the package multiplier and keeps 1,5', async () => {
    await renderNode(
      <ApplyEmployeeCostModelModal onClose={() => {}} onApplied={() => {}} />,
    );
    const mult = await waitFor('[aria-label="Package multiplier"]') as HTMLInputElement;
    expect(mult).toBeTruthy();
    await typeKeys(mult, '1,5');
    expect(mult.value).toBe('1,5');
    expect(mult.value).not.toBe('15');
  });

  it('types 1,250 on the wage override and uses 1250, not parseFloat 1', async () => {
    await renderNode(
      <ApplyEmployeeCostModelModal onClose={() => {}} onApplied={() => {}} />,
    );
    const wage = await waitFor('[aria-label="Wage override"]') as HTMLInputElement;
    expect(wage).toBeTruthy();
    await typeKeys(wage, '1,250');
    expect(wage.value).toBe('1,250');
    const estimate = pageRoot().querySelector('[aria-label="Wage package estimate"]');
    expect(estimate?.textContent).toContain('$190,000.00');
    expect(estimate?.textContent).not.toContain('$152.00');
  });
});

describe('Stock qty userEvent keystrokes', () => {
  it('New Item qty userEvent.type 1,5 saves 1.5', async () => {
    const user = userEvent.setup();
    await renderNode(
      <StockItemForm item={null} onClose={() => {}} onSaved={() => {}} />,
    );
    const name = container.querySelector('input[placeholder="e.g. 20mm PVC Conduit"]') as HTMLInputElement;
    const qty = container.querySelector('[aria-label="Qty On Hand"]') as HTMLInputElement;
    await act(async () => { setNativeValue(name, 'Conduit'); });
    await user.clear(qty);
    await user.type(qty, '1,5');
    expect(qty.value).toBe('1,5');
    const add = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Add Item') as HTMLButtonElement;
    await act(async () => { add.click(); });
    await flush();
    expect(harness.inserts.filter(row => row.table === 'stock_items')[0]?.payload.quantity_on_hand).toBe(1.5);
  });

  it('Manual Adjustment qty userEvent.type 1,5 and -1,5', async () => {
    const user = userEvent.setup();
    const seen: number[] = [];
    function Harness() {
      const [qty, setQty] = useState('');
      return (
        <StockAdjustmentForm
          qty={qty}
          reason=""
          onQtyChange={setQty}
          onReasonChange={() => {}}
          onSubmit={() => {
            const committed = commitStockAdjustment(qty);
            if (!committed.ok) return;
            seen.push(committed.value);
          }}
        />
      );
    }
    await renderNode(<Harness />);
    const qty = pageRoot().querySelector('[aria-label="Adjustment quantity"]') as HTMLInputElement;
    await user.clear(qty);
    await user.type(qty, '1,5');
    expect(qty.value).toBe('1,5');
    const adjust = Array.from(pageRoot().querySelectorAll('button')).find(b => b.textContent?.includes('Adjust')) as HTMLButtonElement;
    await act(async () => { adjust.click(); });
    await flush();
    expect(seen).toEqual([1.5]);
    await user.clear(qty);
    await user.type(qty, '-1,5');
    expect(qty.value).toBe('-1,5');
    await act(async () => { adjust.click(); });
    await flush();
    expect(seen).toEqual([1.5, -1.5]);
  });
});

describe('Convert to job refuses invalid lines', () => {
  it('names the bad line and does not create a job when line 2 is 1,5', async () => {
    await renderNode(
      <QuoteEditorModal
        quote={{
          id: 'q-1',
          company_id: 'co-1',
          quote_number: 10,
          client_id: 'cl-1',
          job_id: null,
          status: 'accepted',
          description: 'Switchboard',
          scope_of_works: '',
          line_items: [
            { description: 'Labour', quantity: 1, unit_price: 100 },
            { description: 'Fitting', quantity: 1, unit_price: '1,5' as unknown as number },
          ],
          subtotal: 100,
          tax_rate: 10,
          tax_amount: 10,
          total: 110,
          validity_date: null,
          notes: null,
          inclusions: [],
          exclusions: [],
          scheduled_date: '2026-10-20',
          assigned_team: ['user-1'],
          created_by: 'user-1',
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-01T00:00:00.000Z',
          invoice_id: null,
        } as never}
        defaultTaxRate={10}
        onClose={() => {}}
        onSaved={() => {}}
        onRequestSend={() => {}}
      />,
    );
    const convert = Array.from(pageRoot().querySelectorAll('button')).find(b => /Convert to job/i.test(b.textContent || '')) as HTMLButtonElement;
    expect(convert).toBeTruthy();
    await act(async () => { convert.click(); });
    await flush();
    expect(pageRoot().textContent).toContain(`Line 2: ${MONEY_COMMA_HINT}`);
    expect(harness.inserts.filter(row => row.table === 'jobs')).toEqual([]);
  });
});

describe('Job bill rendered panel uses commitJobBillCharge', () => {
  it('types charge 1,5, shows the hint, and does not insert', async () => {
    await renderNode(
      <JobCostingPanel jobId="job-1" clientId="cl-1" />,
    );
    const charge = pageRoot().querySelector('[aria-label="Charge customer (each)"]') as HTMLInputElement;
    const qty = pageRoot().querySelector('[aria-label="Qty"]') as HTMLInputElement;
    await typeKeys(qty, '1');
    await typeKeys(charge, '1,5');
    expect(pageRoot().textContent).toContain(MONEY_COMMA_HINT);
    const add = Array.from(pageRoot().querySelectorAll('button')).find(b => /Add to bill/i.test(b.textContent || '')) as HTMLButtonElement;
    await act(async () => { add.click(); });
    await flush();
    expect(harness.inserts.filter(row => row.table === 'job_costs')).toEqual([]);
  });

  it('types qty 1,5 and charge 20 and inserts qty 1.5', async () => {
    await renderNode(
      <JobCostingPanel jobId="job-1" clientId="cl-1" />,
    );
    const charge = pageRoot().querySelector('[aria-label="Charge customer (each)"]') as HTMLInputElement;
    const qty = pageRoot().querySelector('[aria-label="Qty"]') as HTMLInputElement;
    await typeKeys(qty, '1,5');
    await typeKeys(charge, '20');
    const add = Array.from(pageRoot().querySelectorAll('button')).find(b => /Add to bill/i.test(b.textContent || '')) as HTMLButtonElement;
    await act(async () => { add.click(); });
    await flush();
    const rows = harness.inserts.filter(row => row.table === 'job_costs');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload.quantity).toBe(1.5);
    expect(rows[0]?.payload.unit_price).toBe(20);
  });
});

describe('Issued invoice locks lines and shows stored totals', () => {
  const storedInvoice = {
    id: '37e27b33',
    company_id: 'co-1',
    invoice_number: 37,
    client_id: 'cl-1',
    job_id: null,
    quote_id: null,
    status: 'sent',
    line_items: [
      { description: 'Labour', quantity: 1.5, unit_price: 87.35, stored_token: 'keep-me' },
      { description: 'Fitting', quantity: 3, unit_price: 33.33, stored_token: 'keep-me' },
      { description: 'Consumables', quantity: 7, unit_price: 11.5, stored_token: 'keep-me' },
    ],
    subtotal: 311.51,
    tax_rate: 10,
    tax_amount: 31.15,
    total: 342.66,
    amount_paid: 0,
    payment_terms: null,
    due_date: null,
    notes: null,
    inclusions: [],
    exclusions: [],
    created_by: 'user-1',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  };

  it('shows stored $342.66 and locks unit price on a sent invoice', async () => {
    await renderNode(
      <InvoiceEditorModal
        invoice={storedInvoice as never}
        defaultTaxRate={10}
        smtpReady={false}
        onClose={() => {}}
        onSaved={() => {}}
        onRequestSend={() => {}}
      />,
    );
    expect(pageRoot().textContent).toContain('$342.66');
    expect(pageRoot().textContent).not.toContain('$342.67');
    const edit = Array.from(pageRoot().querySelectorAll('button')).find(b => /Edit invoice/i.test(b.textContent || '')) as HTMLButtonElement;
    expect(edit).toBeTruthy();
    await act(async () => { edit.click(); });
    await flush();
    expect(pageRoot().textContent).toContain('Issued document — lines are locked');
    expect(pageRoot().textContent).toContain('$342.66');
    expect(pageRoot().textContent).not.toContain('$342.67');
    const price = pageRoot().querySelector('[aria-label="Unit price"]') as HTMLInputElement;
    expect(price.disabled).toBe(true);
    const save = Array.from(pageRoot().querySelectorAll('button')).find(b => /^Save$/i.test(b.textContent || '')) as HTMLButtonElement;
    expect(save).toBeTruthy();
    await act(async () => { save.click(); });
    await flush();
    const updates = harness.updates.filter(row => row.table === 'invoices');
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]?.payload.total).toBe(342.66);
    expect(updates[0]?.payload.line_items).toEqual(storedInvoice.line_items);
    expect((updates[0]?.payload.line_items as { stored_token?: string }[])[0]?.stored_token).toBe('keep-me');
  });
});

describe('Issued quote save keeps stored lines', () => {
  it('accepted quote Save writes persistIssuedLines, not live cleanLines', async () => {
    const storedLines = [
      { description: 'Labour', quantity: 1, unit_price: 100, stored_token: 'keep-me' },
    ];
    await renderNode(
      <QuoteEditorModal
        quote={{
          id: 'q-accepted',
          company_id: 'co-1',
          quote_number: 11,
          client_id: 'cl-1',
          job_id: null,
          status: 'accepted',
          description: 'Switchboard',
          scope_of_works: '',
          line_items: storedLines,
          subtotal: 100,
          tax_rate: 10,
          tax_amount: 10,
          total: 110,
          validity_date: null,
          notes: null,
          inclusions: [],
          exclusions: [],
          scheduled_date: '2026-10-20',
          assigned_team: ['user-1'],
          created_by: 'user-1',
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-01T00:00:00.000Z',
          invoice_id: null,
        } as never}
        defaultTaxRate={10}
        onClose={() => {}}
        onSaved={() => {}}
        onRequestSend={() => {}}
      />,
    );
    const edit = Array.from(pageRoot().querySelectorAll('button')).find(b => /Edit quote/i.test(b.textContent || '')) as HTMLButtonElement;
    expect(edit).toBeTruthy();
    await act(async () => { edit.click(); });
    await flush();
    const save = Array.from(pageRoot().querySelectorAll('button')).find(b => /^Save$/i.test(b.textContent || '')) as HTMLButtonElement;
    expect(save).toBeTruthy();
    await act(async () => { save.click(); });
    await flush();
    const updates = harness.updates.filter(row => row.table === 'quotes');
    expect(updates.length).toBeGreaterThan(0);
    expect(updates[0]?.payload.line_items).toEqual(storedLines);
    expect(updates[0]?.payload.total).toBe(110);
    expect((updates[0]?.payload.line_items as { stored_token?: string }[])[0]?.stored_token).toBe('keep-me');
  });
});

describe('Cost model save uses commitModelLines', () => {
  it('types amount 1,5 and does not insert a model', async () => {
    await renderNode(
      <ManageCostModelsModal onClose={() => {}} onChanged={() => {}} />,
    );
    const create = Array.from(pageRoot().querySelectorAll('button')).find(b => /New model/i.test(b.textContent || '')) as HTMLButtonElement;
    expect(create).toBeTruthy();
    await act(async () => { create.click(); });
    await flush();
    const name = pageRoot().querySelector('input[placeholder="e.g. Standard field tech"]') as HTMLInputElement;
    await act(async () => { setNativeValue(name, 'Field tech'); });
    const amount = pageRoot().querySelector('[aria-label="Amount ($)"]') as HTMLInputElement;
    expect(amount).toBeTruthy();
    await typeKeys(amount, '1,5');
    expect(amount.value).toBe('1,5');
    expect(pageRoot().textContent).toContain(MONEY_COMMA_HINT);
    const save = Array.from(pageRoot().querySelectorAll('button')).find(b => /Save model/i.test(b.textContent || '')) as HTMLButtonElement;
    await act(async () => { save.click(); });
    await flush();
    expect(harness.inserts.filter(row => row.table === 'expense_cost_models')).toEqual([]);
    expect(pageRoot().textContent).toContain(MONEY_COMMA_HINT);
  });
});

describe('Negative unit price can be typed and saved', () => {
  it('types -5 on unit price and keeps it', async () => {
    let lines = [{ ...emptyLineItem(), description: 'Credit', quantity: '1', unit_price: '' }];
    await renderNode(
      <LineEditorHarness
        initial={lines}
        onLines={next => { lines = next; }}
      />,
    );
    const price = pageRoot().querySelector('[aria-label="Unit price"]') as HTMLInputElement;
    await typeKeys(price, '-5');
    expect(price.value).toBe('-5');
    expect(commitCommercialLines(lines)).toMatchObject({
      ok: true,
      lines: [{ quantity: 1, unit_price: -5 }],
    });
  });
});

const SWEEP_STORED_LINES = [
  { description: 'Labour', quantity: 1.5, unit_price: 87.35, stored_token: 'keep-me' },
  { description: 'Fitting', quantity: 3, unit_price: 33.33, stored_token: 'keep-me' },
  { description: 'Consumables', quantity: 7, unit_price: 11.5, stored_token: 'keep-me' },
];

function issuedQuote(status: 'sent' | 'accepted') {
  return {
    id: `q-${status}`,
    company_id: 'co-1',
    quote_number: 11,
    client_id: 'cl-1',
    job_id: null,
    status,
    description: 'Switchboard',
    scope_of_works: '',
    line_items: SWEEP_STORED_LINES,
    subtotal: 311.51,
    tax_rate: 10,
    tax_amount: 31.15,
    total: 342.66,
    validity_date: null,
    notes: null,
    inclusions: [],
    exclusions: [],
    scheduled_date: '2026-10-20',
    assigned_team: ['user-1'],
    created_by: 'user-1',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    invoice_id: null,
  };
}

describe('Issued GST rate and client stay stored', () => {
  it('disables GST and client on a sent invoice and Save keeps tax_rate 10', async () => {
    await renderNode(
      <InvoiceEditorModal
        invoice={{
          id: '37e27b33',
          company_id: 'co-1',
          invoice_number: 37,
          client_id: 'cl-1',
          job_id: null,
          quote_id: null,
          status: 'sent',
          line_items: SWEEP_STORED_LINES,
          subtotal: 311.51,
          tax_rate: 10,
          tax_amount: 31.15,
          total: 342.66,
          amount_paid: 0,
          payment_terms: null,
          due_date: null,
          notes: null,
          inclusions: [],
          exclusions: [],
          created_by: 'user-1',
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-01T00:00:00.000Z',
        } as never}
        defaultTaxRate={10}
        smtpReady={false}
        onClose={() => {}}
        onSaved={() => {}}
        onRequestSend={() => {}}
      />,
    );
    const edit = Array.from(pageRoot().querySelectorAll('button')).find(b => /Edit invoice/i.test(b.textContent || '')) as HTMLButtonElement;
    await act(async () => { edit.click(); });
    await flush();
    const gst = pageRoot().querySelector('[aria-label="GST rate (%)"]') as HTMLInputElement;
    const client = pageRoot().querySelector('[aria-label="Client"]') as HTMLSelectElement;
    expect(gst.disabled).toBe(true);
    expect(client.disabled).toBe(true);
    await act(async () => { setNativeValue(gst, '0'); });
    expect(pageRoot().textContent).not.toContain('GST (0%)');
    expect(pageRoot().textContent).toContain('$31.15');
    expect(pageRoot().textContent).toContain('Line amounts sum to $311.52. This document kept $311.51 at issue.');
    const save = Array.from(pageRoot().querySelectorAll('button')).find(b => /^Save$/i.test(b.textContent || '')) as HTMLButtonElement;
    await act(async () => { save.click(); });
    await flush();
    const updates = harness.updates.filter(row => row.table === 'invoices');
    expect(updates[0]?.payload.tax_rate).toBe(10);
    expect(updates[0]?.payload.tax_amount).toBe(31.15);
    expect(updates[0]?.payload.total).toBe(342.66);
    expect(updates[0]?.payload.client_id).toBe('cl-1');
  });

  it('disables GST and client on a sent quote and Save keeps tax_rate 10', async () => {
    await renderNode(
      <QuoteEditorModal
        quote={issuedQuote('sent') as never}
        defaultTaxRate={10}
        onClose={() => {}}
        onSaved={() => {}}
        onRequestSend={() => {}}
      />,
    );
    const edit = Array.from(pageRoot().querySelectorAll('button')).find(b => /Edit quote/i.test(b.textContent || '')) as HTMLButtonElement;
    await act(async () => { edit.click(); });
    await flush();
    const gst = pageRoot().querySelector('[aria-label="GST rate (%)"]') as HTMLInputElement;
    const client = pageRoot().querySelector('[aria-label="Client"]') as HTMLSelectElement;
    expect(gst.disabled).toBe(true);
    expect(client.disabled).toBe(true);
    await act(async () => { setNativeValue(gst, '0'); });
    const save = Array.from(pageRoot().querySelectorAll('button')).find(b => /^Save$/i.test(b.textContent || '')) as HTMLButtonElement;
    await act(async () => { save.click(); });
    await flush();
    const updates = harness.updates.filter(row => row.table === 'quotes');
    expect(updates[0]?.payload.tax_rate).toBe(10);
    expect(updates[0]?.payload.total).toBe(342.66);
    expect(updates[0]?.payload.client_id).toBe('cl-1');
  });
});

describe('Issued quote shows stored totals and locks lines', () => {
  async function assertIssuedQuote(status: 'sent' | 'accepted') {
    await renderNode(
      <QuoteEditorModal
        quote={issuedQuote(status) as never}
        defaultTaxRate={10}
        onClose={() => {}}
        onSaved={() => {}}
        onRequestSend={() => {}}
      />,
    );
    expect(pageRoot().textContent).toContain('$342.66');
    expect(pageRoot().textContent).not.toContain('$342.67');
    const edit = Array.from(pageRoot().querySelectorAll('button')).find(b => /Edit quote/i.test(b.textContent || '')) as HTMLButtonElement;
    await act(async () => { edit.click(); });
    await flush();
    expect(pageRoot().textContent).toContain('$342.66');
    expect(pageRoot().textContent).not.toContain('$342.67');
    const price = pageRoot().querySelector('[aria-label="Unit price"]') as HTMLInputElement;
    expect(price.disabled).toBe(true);
    const remove = pageRoot().querySelector('[aria-label="Remove line"]') as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
    const description = pageRoot().querySelector('[aria-label="Description"]');
    expect(description?.tagName).toBe('P');
    const save = Array.from(pageRoot().querySelectorAll('button')).find(b => /^Save$/i.test(b.textContent || '')) as HTMLButtonElement;
    await act(async () => { save.click(); });
    await flush();
    const updates = harness.updates.filter(row => row.table === 'quotes');
    expect(updates[0]?.payload.subtotal).toBe(311.51);
    expect(updates[0]?.payload.tax_amount).toBe(31.15);
    expect(updates[0]?.payload.total).toBe(342.66);
    expect(updates[0]?.payload.line_items).toEqual(SWEEP_STORED_LINES);
  }

  it('shows stored $342.66 and locks unit price on a sent quote', async () => {
    await assertIssuedQuote('sent');
  });

  it('shows stored $342.66 and locks unit price on an accepted quote', async () => {
    await assertIssuedQuote('accepted');
  });
});

describe('Quote sheet and PDF pin 1.5 × 87.35 at $131.03', () => {
  it('renders $131.03 on a draft quote sheet, not $131.02', async () => {
    await renderNode(
      <QuoteEditorModal
        quote={{
          ...issuedQuote('sent'),
          status: 'draft',
          line_items: [{ description: 'Labour', quantity: 1.5, unit_price: 87.35 }],
          subtotal: 131.03,
          tax_amount: 13.1,
          total: 144.13,
        } as never}
        defaultTaxRate={10}
        onClose={() => {}}
        onSaved={() => {}}
        onRequestSend={() => {}}
      />,
    );
    expect(pageRoot().textContent).toContain('$131.03');
    expect(pageRoot().textContent).not.toContain('$131.02');
    expect(formatCommercialPdfLineAmount({ quantity: 1.5, unit_price: 87.35 })).toBe('$131.03');
    expect(formatCommercialPdfLineAmount({ quantity: 1.5, unit_price: 87.35 })).not.toBe('$131.02');
  });
});

describe('Stock adjustment page writes -1.5', () => {
  it('types -1,5 on Manual Adjustment and writes -1.5, not NaN or 0', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/stock/st-1']}>
          <QueryClientProvider client={client}>
            <ToastProvider>
              <Routes>
                <Route path="/stock/:id" element={<StockDetailPage />} />
              </Routes>
            </ToastProvider>
          </QueryClientProvider>
        </MemoryRouter>,
      );
    });
    await flush();
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    const qty = pageRoot().querySelector('[aria-label="Adjustment quantity"]') as HTMLInputElement;
    expect(qty).toBeTruthy();
    await typeKeys(qty, '-1,5');
    expect(qty.value).toBe('-1,5');
    const adjust = Array.from(pageRoot().querySelectorAll('button')).find(b => b.textContent?.includes('Adjust')) as HTMLButtonElement;
    await act(async () => { adjust.click(); });
    await flush();
    const rows = harness.inserts.filter(row => row.table === 'stock_movements');
    expect(rows[0]?.payload.quantity).toBe(-1.5);
    expect(Number.isNaN(rows[0]?.payload.quantity as number)).toBe(false);
    expect(rows[0]?.payload.quantity).not.toBe(0);
  });
});

describe('Silent minus is refused with Cannot be negative', () => {
  it('types -3 on Qty On Hand, shows the hint, and does not save 3', async () => {
    await renderNode(
      <StockItemForm item={null} onClose={() => {}} onSaved={() => {}} />,
    );
    const name = container.querySelector('input[placeholder="e.g. 20mm PVC Conduit"]') as HTMLInputElement;
    const qty = container.querySelector('[aria-label="Qty On Hand"]') as HTMLInputElement;
    await act(async () => { setNativeValue(name, 'Conduit'); });
    await typeKeys(qty, '-3');
    expect(qty.value).toBe('-3');
    expect(pageRoot().textContent).toContain(DECIMAL_NEGATIVE);
    const add = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Add Item') as HTMLButtonElement;
    await act(async () => { add.click(); });
    await flush();
    expect(harness.inserts.filter(row => row.table === 'stock_items')).toEqual([]);
  });

  it('types -5 on job bill charge, shows the hint, and does not insert +5', async () => {
    await renderNode(
      <JobCostingPanel jobId="job-1" clientId="cl-1" />,
    );
    const charge = pageRoot().querySelector('[aria-label="Charge customer (each)"]') as HTMLInputElement;
    const qty = pageRoot().querySelector('[aria-label="Qty"]') as HTMLInputElement;
    await typeKeys(qty, '1');
    await typeKeys(charge, '-5');
    expect(charge.value).toBe('-5');
    expect(pageRoot().textContent).toContain(DECIMAL_NEGATIVE);
    const add = Array.from(pageRoot().querySelectorAll('button')).find(b => /Add to bill/i.test(b.textContent || '')) as HTMLButtonElement;
    await act(async () => { add.click(); });
    await flush();
    expect(harness.inserts.filter(row => row.table === 'job_costs')).toEqual([]);
  });
});

describe('Job bill submit copy and unit cost', () => {
  it('shows the comma hint after Add, not Enter a quantity', async () => {
    await renderNode(
      <JobCostingPanel jobId="job-1" clientId="cl-1" />,
    );
    const charge = pageRoot().querySelector('[aria-label="Charge customer (each)"]') as HTMLInputElement;
    const qty = pageRoot().querySelector('[aria-label="Qty"]') as HTMLInputElement;
    await typeKeys(qty, '1');
    await typeKeys(charge, '1,5');
    const add = Array.from(pageRoot().querySelectorAll('button')).find(b => /Add to bill/i.test(b.textContent || '')) as HTMLButtonElement;
    await act(async () => { add.click(); });
    await flush();
    expect(pageRoot().textContent).toContain(MONEY_COMMA_HINT);
    expect(pageRoot().textContent).not.toContain('Enter a quantity');
    expect(harness.inserts.filter(row => row.table === 'job_costs')).toEqual([]);
  });

  it('types unit cost 1,5 and does not write 1', async () => {
    await renderNode(
      <JobCostingPanel jobId="job-1" clientId="cl-1" />,
    );
    const cost = pageRoot().querySelector('[aria-label="Your cost (each)"]') as HTMLInputElement;
    const qty = pageRoot().querySelector('[aria-label="Qty"]') as HTMLInputElement;
    await typeKeys(qty, '1');
    await typeKeys(cost, '1,5');
    const add = Array.from(pageRoot().querySelectorAll('button')).find(b => /Add to bill/i.test(b.textContent || '')) as HTMLButtonElement;
    await act(async () => { add.click(); });
    await flush();
    const rows = harness.inserts.filter(row => row.table === 'job_costs');
    expect(rows).toEqual([]);
    expect(pageRoot().textContent).toContain(MONEY_COMMA_HINT);
  });
});

describe('Wage override and multiplier write the committed value', () => {
  it('types 1,5 on the wage override and Apply does not insert 15 or 1', async () => {
    await renderNode(
      <ApplyEmployeeCostModelModal onClose={() => {}} onApplied={() => {}} />,
    );
    const wage = await waitFor('[aria-label="Wage override"]') as HTMLInputElement;
    await typeKeys(wage, '1,5');
    const apply = Array.from(pageRoot().querySelectorAll('button')).find(b => /^Apply$/i.test(b.textContent || '')) as HTMLButtonElement;
    await act(async () => { apply?.click(); });
    await flush();
    expect(harness.inserts.filter(row => row.table === 'expenses')).toEqual([]);
    expect(pageRoot().textContent).toContain(MONEY_COMMA_HINT);
  });

  it('types 1,5 on the package multiplier and keeps 1.5, not 1', async () => {
    await renderNode(
      <ApplyEmployeeCostModelModal onClose={() => {}} onApplied={() => {}} />,
    );
    const mult = await waitFor('[aria-label="Package multiplier"]') as HTMLInputElement;
    await typeKeys(mult, '1,5');
    expect(mult.value).toBe('1,5');
    expect(Number(mult.value.replace(',', '.'))).toBe(1.5);
    expect(Number.parseFloat(mult.value)).toBe(1);
  });
});

describe('Expense inc GST blur refuses 1,5', () => {
  it('does not fold 1,5 to 1 on blur', () => {
    const empty = expenseAmountTypingFromEx('', '10');
    const typed = expenseIncGstInputStep(empty, '1,5');
    const blurred = expenseIncGstBlurStep(typed);
    expect(blurred.incDraft).toBe('1,5');
    expect(blurred.incDraft).not.toBe('1');
    expect(blurred.exAmount).not.toBe('1');
  });
});

describe('Convert names the visible row when a blank line sits above', () => {
  it('reports Line 2 when the first row is blank and the second is 1,5', () => {
    expect(commitCommercialLines([
      { ...emptyLineItem(), description: '', quantity: '1', unit_price: '10' },
      { ...emptyLineItem(), description: 'Fitting', quantity: '1', unit_price: '1,5' },
    ])).toEqual({ ok: false, message: `Line 2: ${MONEY_COMMA_HINT}` });
  });
});
