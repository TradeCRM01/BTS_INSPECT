/**
 * HF-403-768 FROZEN kill (CoS) — do not edit.
 * Browser entry for the hf406 frozen store harness: the real DashboardPage over the
 * store-backed mocks in hf406.frozen.mocks.ts. The QueryClient is exposed so the kill can
 * read the look seed; the store itself lives on window.__HF406_STORE__.
 */
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../components/ui/Toast';
import { DashboardPage } from '../pages/DashboardPage';

type Hf406Cfg = { path?: string };
const g = globalThis as unknown as { __HF406_CFG__?: Hf406Cfg; __HF406_CLIENT__?: QueryClient };
const cfg = g.__HF406_CFG__ ?? {};

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('hf406 harness missing #root');

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
g.__HF406_CLIENT__ = client;

createRoot(rootEl).render(
  <QueryClientProvider client={client}>
    <ToastProvider>
      <MemoryRouter initialEntries={[cfg.path || '/']}>
        <DashboardPage />
      </MemoryRouter>
    </ToastProvider>
  </QueryClientProvider>,
);
