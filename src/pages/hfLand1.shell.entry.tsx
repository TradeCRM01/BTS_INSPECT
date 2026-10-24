import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/ui/Toast';
import { AppShell } from '../components/layout/AppShell';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('hf-land-1 shell harness missing #root');

createRoot(rootEl).render(
  <QueryClientProvider client={client}>
    <ToastProvider>
      <MemoryRouter initialEntries={['/jobs']}>
        <AppShell>
          <div>child</div>
        </AppShell>
      </MemoryRouter>
    </ToastProvider>
  </QueryClientProvider>,
);
