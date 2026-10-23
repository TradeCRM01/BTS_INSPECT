import { createRoot } from 'react-dom/client';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/ui/Toast';
import { InspectionFillPage } from '../pages/InspectionFillPage';
import { JhaFillPage } from '../pages/JhaFillPage';

type Cfg = { path?: string };
const cfg = ((globalThis as unknown as { __LOOK__?: Cfg }).__LOOK__) ?? {};

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('lookParam fill harness missing #root');

const router = createMemoryRouter([
  { path: '/inspections/:id', element: <InspectionFillPage /> },
  { path: '/jha/new', element: <JhaFillPage /> },
], { initialEntries: [cfg.path || '/jha/new'] });

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(rootEl).render(
  <QueryClientProvider client={client}>
    <ToastProvider>
      <RouterProvider router={router} />
    </ToastProvider>
  </QueryClientProvider>,
);
