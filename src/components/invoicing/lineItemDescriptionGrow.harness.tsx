import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { emptyLineItem, LineItemEditor } from './LineItemEditor';

let root: Root | null = null;

export function mountLineEditor(mode: 'edit' | 'view', text: string): void {
  const host = document.getElementById('root');
  if (!host) throw new Error('missing #root');
  if (!root) root = createRoot(host);
  const client = new QueryClient({
    defaultOptions: { queries: { enabled: false, retry: false } },
  });
  root.render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <LineItemEditor
          lines={[{ ...emptyLineItem(), description: text, quantity: '1', unit_price: '87.35' }]}
          stockItems={[]}
          defaultMarkup={0}
          onChange={() => {}}
          readOnly={mode === 'view'}
        />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

(window as unknown as { mountLineEditor: typeof mountLineEditor }).mountLineEditor = mountLineEditor;
