/**
 * @vitest-environment jsdom
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui';

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
          order: async () => ({ data: [], error: null }),
        }),
        order: async () => ({ data: [], error: null }),
        in: async () => ({ data: [], error: null }),
      }),
    }),
    auth: { getSession: async () => ({ data: { session: null } }) },
    storage: { from: () => ({ download: async () => ({ data: null, error: null }) }) },
  },
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: {
      id: '00000000-0000-0000-0000-000000000002',
      role: 'admin',
      company_id: '00000000-0000-0000-0000-000000000001',
      name: 'Field Audit',
      licence_number: 'EL-12345',
    },
    company: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Field Audit Co',
    },
    session: { access_token: 'dev' },
  }),
}));

vi.mock('../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: unknown }) => children,
}));

import { TemplatesPage } from './TemplatesPage';
import { JhaDocumentsPage } from './JhaDocumentsPage';
import { JhaFillPage } from './JhaFillPage';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
});

async function flush(times = 12) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function waitForText(text: string) {
  const started = Date.now();
  while (Date.now() - started < 4000) {
    if (document.body.textContent?.includes(text)) return;
    await flush(2);
  }
  throw new Error(`timed out waiting for ${text}: ${document.body.textContent?.slice(0, 500)}`);
}

describe('creator snapshot names stay on the page after a member delete', () => {
  it('lists Created by Pat Snapshot on inspection templates when created_by is null', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/templates?look=templates-snapshot']}>
              <TemplatesPage />
            </MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>,
      );
    });
    await waitForText('Created by Pat Snapshot');
    expect(document.body.textContent).toContain('Switchboard');
  });

  it('lists Created by Pat Snapshot on JHA templates when created_by is null', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/templates?tab=jha&look=templates-snapshot']}>
              <TemplatesPage />
            </MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>,
      );
    });
    await waitForText('Created by Pat Snapshot');
    expect(document.body.textContent).toContain('Site JHA');
  });

  it('lists Created by Pat Snapshot on a JHA document row when created_by is null', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/jha?look=jha-list']}>
              <JhaDocumentsPage />
            </MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>,
      );
    });
    await waitForText('Created by Pat Snapshot');
    expect(document.body.textContent).toContain('Northside Electrical');
  });

  it('shows Created by Pat Snapshot on the JHA fill ledger when created_by is null', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter(
      [{ path: '/jha/new', element: <JhaFillPage /> }],
      { initialEntries: ['/jha/new?docId=look-jha-pat&look=jha-creator-snapshot'] },
    );
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <ToastProvider>
            <RouterProvider router={router} />
          </ToastProvider>
        </QueryClientProvider>,
      );
    });
    await waitForText('Created by Pat Snapshot');
    expect(document.querySelector('[data-creator-line="1"]')?.textContent).toContain('Pat Snapshot');
  });
});
