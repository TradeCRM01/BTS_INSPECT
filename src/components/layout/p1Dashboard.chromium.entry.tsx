import { createRoot } from 'react-dom/client';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../ui/Toast';
import { DashboardPage } from '../../pages/DashboardPage';

type Cfg = { path?: string };
const cfg = ((globalThis as unknown as { __P1__?: Cfg }).__P1__) ?? {};

function PathProbe() {
  const loc = useLocation();
  return <div data-p1-path={loc.pathname} data-p1-search={loc.search} />;
}

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('p1 dashboard harness missing #root');

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(rootEl).render(
  <QueryClientProvider client={client}>
    <ToastProvider>
      <MemoryRouter initialEntries={[cfg.path || '/?look=dashboard']}>
        <PathProbe />
        <div className="dashboard-home" data-p1-probe="1" hidden>
          <span className="dashboard-home-pill dashboard-home-pill-ok">OK</span>
        </div>
        <DashboardPage />
      </MemoryRouter>
    </ToastProvider>
  </QueryClientProvider>,
);
