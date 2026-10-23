import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/ui/Toast';
import { JobsPage } from './JobsPage';
import { JobDetailPage } from './JobDetailPage';

type Cfg = { path?: string; empty?: boolean };
const cfg = ((globalThis as unknown as { __P3__?: Cfg }).__P3__) ?? {};

function PathProbe() {
  const loc = useLocation();
  return <div data-p3-path={loc.pathname} data-p3-search={loc.search} />;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('p3 jobs harness missing #root');

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(rootEl).render(
  <QueryClientProvider client={client}>
    <ToastProvider>
      <MemoryRouter initialEntries={[cfg.path || '/jobs']}>
        <PathProbe />
        <Routes>
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>
  </QueryClientProvider>,
);
