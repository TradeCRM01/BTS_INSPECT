/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../components/ui';
import { Take5ListPage } from './Take5ListPage';

vi.mock('../lib/supabase', () => {
  const user = {
    id: '00000000-0000-4000-8000-0000000000aa',
    email: 'qa@example.com',
    app_metadata: {},
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00.000Z',
  };
  const session = {
    access_token: 'qa-token',
    refresh_token: 'qa-refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user,
  };
  const profile = {
    id: user.id,
    company_id: '00000000-0000-4000-8000-0000000000bb',
    name: 'QA',
    role: 'admin',
    email: user.email,
  };
  const company = { id: profile.company_id, name: 'QA Co' };

  return {
    supabase: {
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null }),
      },
      from: () => ({
        select() { return this; },
        eq() { return this; },
        maybeSingle: async () => ({ data: profile, error: null }),
      }),
      rpc: async () => ({ data: [], error: null }),
    },
    __profile: profile,
    __company: company,
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

async function renderList() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter([
    {
      path: '/jha/take5',
      element: (
        <AuthProvider>
          <ToastProvider>
            <Take5ListPage />
          </ToastProvider>
        </AuthProvider>
      ),
    },
  ], { initialEntries: ['/jha/take5?look=take5-list'] });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  });
}

async function waitFor(label: string, find: () => boolean) {
  const started = Date.now();
  while (Date.now() - started < 4000) {
    if (find()) return;
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  }
  throw new Error(`timed out waiting for ${label}: ${document.body.textContent?.slice(0, 400)}`);
}

describe('Take 5 list Open / Done tabs', () => {
  it('renders Open and Done tabs and switches the list', async () => {
    await renderList();
    await waitFor('tabs', () => !!document.querySelector('[role="tablist"][aria-label="Take 5 status"]'));

    const tabs = [...document.querySelectorAll('[role="tablist"][aria-label="Take 5 status"] [role="tab"]')];
    expect(tabs.map(tab => tab.textContent)).toEqual(['Open', 'Done']);

    const done = tabs.find(tab => tab.textContent === 'Done') as HTMLButtonElement;
    await act(async () => {
      done.click();
    });
    expect(done.getAttribute('aria-selected')).toBe('true');
    expect(document.body.textContent).toMatch(/Done · \d+ Take 5/);
  });
});
