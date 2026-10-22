import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from './AppShell';

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('s2 shell harness missing #root');

createRoot(rootEl).render(
  <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={['/jobs']}>
      <AppShell>
        <div>child</div>
      </AppShell>
    </MemoryRouter>
  </QueryClientProvider>,
);
