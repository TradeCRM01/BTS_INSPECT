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

import { InspectionsPage } from './InspectionsPage';
import { InspectionFillPage } from './InspectionFillPage';

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

describe('inspection list and detail show the inspector snapshot', () => {
  it('lists Pat Snapshot when inspector_id is null', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/inspections?look=inspections-list']}>
              <InspectionsPage />
            </MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>,
      );
    });
    await waitForText('Pat Snapshot · EC-4411');
    expect(document.body.textContent).toContain('Snapshot Yard');
    expect(document.body.textContent).not.toContain('Unknown');
  });

  it('shows Pat Snapshot on the fill page in edit mode', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter(
      [{ path: '/inspections/:id', element: <InspectionFillPage /> }],
      { initialEntries: ['/inspections/look-insp-pat?look=inspection-snapshot-edit'] },
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
    await waitForText('Pat Snapshot · EC-4411');
    expect(document.querySelector('[data-inspector-line="1"]')?.textContent).toContain('Pat Snapshot');
    expect(document.body.textContent).toContain('No linked job');
    expect(document.body.textContent).not.toContain('Site follows this job.');
  });

  it('shows Pat Snapshot on the fill page in view mode', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter(
      [{ path: '/inspections/:id', element: <InspectionFillPage /> }],
      { initialEntries: ['/inspections/look-insp-pat?look=inspection-snapshot-view'] },
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
    await waitForText('Pat Snapshot · EC-4411');
    expect(document.querySelector('[data-inspector-line="1"]')?.textContent).toContain('EC-4411');
    expect(document.body.textContent).toContain('Site follows this job.');
  });
});
