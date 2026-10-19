import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { emptyLineItem, LineItemEditor } from './LineItemEditor';
import { ToastProvider } from '../ui/Toast';
import { QuoteEditorModal } from '../../pages/QuotesPage';
import { InvoiceEditorModal } from '../../pages/InvoicesPage';

let root: Root | null = null;

const LONG_COST_NAME = 'Replace damaged GPO double (HPM Excel) and run a new circuit back to the switchboard with labelled breakers and a written test sheet for the client.';

const COST_MODEL = {
  id: 'cm-long',
  company_id: 'co-1',
  name: LONG_COST_NAME,
  notes: null,
  billing_period: 'monthly',
  time_unit: 'hourly',
  standard_hours: 1,
  lines: [{
    employee_cost_type: 'wages',
    category: 'Labour',
    description: 'Wages',
    amount: 80,
    amount_mode: 'fixed',
    time_unit: 'hourly',
    tax_rate: 10,
  }],
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
};

function host(): HTMLElement {
  const el = document.getElementById('root');
  if (!el) throw new Error('missing #root');
  if (!root) root = createRoot(el);
  return el;
}

function wrap(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  client.setQueryData(['expense-cost-models'], [COST_MODEL]);
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ToastProvider>{node}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

function asTexts(text: string | string[]): string[] {
  return Array.isArray(text) ? text : [text];
}

export function mountLineEditor(mode: 'edit' | 'view', text: string | string[]): void {
  host();
  const texts = asTexts(text);
  root?.render(
    wrap(
      <LineItemEditor
        lines={texts.map(description => ({ ...emptyLineItem(), description, quantity: '1', unit_price: '87.35' }))}
        stockItems={[]}
        defaultMarkup={0}
        onChange={() => {}}
        readOnly={mode === 'view'}
      />,
    ),
  );
}

const LONG_LINE = { description: '', quantity: 1.5, unit_price: 87.35 };

export function mountQuoteEditor(text: string | string[]): void {
  host();
  const texts = asTexts(text);
  root?.render(
    wrap(
      <QuoteEditorModal
        quote={{
          id: 'q-grow',
          company_id: 'co-1',
          quote_number: 11,
          client_id: 'cl-1',
          job_id: null,
          status: 'draft',
          description: 'Switchboard',
          scope_of_works: '',
          line_items: texts.map(description => ({ ...LONG_LINE, description })),
          subtotal: 131.03,
          tax_rate: 10,
          tax_amount: 13.1,
          total: 144.13,
          validity_date: null,
          notes: null,
          inclusions: [],
          exclusions: [],
          scheduled_date: null,
          assigned_team: [],
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
    ),
  );
}

export function mountInvoiceEditor(text: string | string[]): void {
  host();
  const texts = asTexts(text);
  root?.render(
    wrap(
      <InvoiceEditorModal
        invoice={{
          id: 'inv-grow',
          company_id: 'co-1',
          invoice_number: 11,
          client_id: 'cl-1',
          job_id: null,
          quote_id: null,
          status: 'draft',
          line_items: texts.map(description => ({ ...LONG_LINE, description })),
          subtotal: 131.03,
          tax_rate: 10,
          tax_amount: 13.1,
          total: 144.13,
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
    ),
  );
}

export function unmountEditor(): void {
  root?.render(null);
}

const api = window as unknown as {
  mountLineEditor: typeof mountLineEditor;
  mountQuoteEditor: typeof mountQuoteEditor;
  mountInvoiceEditor: typeof mountInvoiceEditor;
  unmountEditor: typeof unmountEditor;
};
api.mountLineEditor = mountLineEditor;
api.mountQuoteEditor = mountQuoteEditor;
api.mountInvoiceEditor = mountInvoiceEditor;
api.unmountEditor = unmountEditor;
