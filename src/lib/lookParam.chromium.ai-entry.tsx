import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/ui/Toast';
import { ExpensesPage } from '../pages/ExpensesPage';

type Cfg = { path?: string };
const cfg = ((globalThis as unknown as { __LOOK__?: Cfg }).__LOOK__) ?? {};

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('lookParam AI harness missing #root');

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(rootEl).render(
  <QueryClientProvider client={client}>
    <ToastProvider>
      <MemoryRouter initialEntries={[cfg.path || '/expenses?look=expense1-empty&expenseNoAi=1']}>
        <ExpensesPage />
      </MemoryRouter>
    </ToastProvider>
  </QueryClientProvider>,
);
