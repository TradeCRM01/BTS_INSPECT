import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/ui/Toast';
import { TemplateAccessRoute } from '../components/layout/TemplateAccessRoute';
import { ClientsPage } from '../pages/ClientsPage';
import { TemplatesPage } from '../pages/TemplatesPage';

type Cfg = { path?: string };
const cfg = ((globalThis as unknown as { __LOOK__?: Cfg }).__LOOK__) ?? {};

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('look dist harness missing #root');

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(rootEl).render(
  <QueryClientProvider client={client}>
    <ToastProvider>
      <MemoryRouter initialEntries={[cfg.path || '/clients']}>
        <Routes>
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/templates" element={<TemplateAccessRoute><TemplatesPage /></TemplateAccessRoute>} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  </QueryClientProvider>,
);
