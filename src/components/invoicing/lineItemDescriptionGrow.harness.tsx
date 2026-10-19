import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { emptyLineItem, LineItemEditor } from './LineItemEditor';
import { ToastProvider } from '../ui/Toast';
import { QuoteEditorModal } from '../../pages/QuotesPage';
import { InvoiceEditorModal } from '../../pages/InvoicesPage';

let root: Root | null = null;

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
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ToastProvider>{node}</ToastProvider>
      </QueryClientProvider>
    </MemoryRouter>
  );
}

export function mountLineEditor(mode: 'edit' | 'view', text: string): void {
  host();
  root?.render(
    wrap(
      <LineItemEditor
        lines={[{ ...emptyLineItem(), description: text, quantity: '1', unit_price: '87.35' }]}
        stockItems={[]}
        defaultMarkup={0}
        onChange={() => {}}
        readOnly={mode === 'view'}
      />,
    ),
  );
}

const LONG_LINE = { description: '', quantity: 1.5, unit_price: 87.35 };

export function mountQuoteEditor(text: string): void {
  host();
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
          line_items: [{ ...LONG_LINE, description: text }],
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

export function mountInvoiceEditor(text: string): void {
  host();
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
          line_items: [{ ...LONG_LINE, description: text }],
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

const api = window as unknown as {
  mountLineEditor: typeof mountLineEditor;
  mountQuoteEditor: typeof mountQuoteEditor;
  mountInvoiceEditor: typeof mountInvoiceEditor;
};
api.mountLineEditor = mountLineEditor;
api.mountQuoteEditor = mountQuoteEditor;
api.mountInvoiceEditor = mountInvoiceEditor;
