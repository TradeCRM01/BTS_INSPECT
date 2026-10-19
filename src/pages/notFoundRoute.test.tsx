/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { AuthProvider } from '../contexts/AuthContext';
import { ProtectedRoute } from '../components/layout/ProtectedRoute';
import { NotFoundPage } from './NotFoundPage';
import App from '../App';

const harness = vi.hoisted(() => ({
  signedIn: false,
  userId: '00000000-0000-4000-8000-0000000000aa',
  companyId: '00000000-0000-4000-8000-0000000000bb',
}));

vi.mock('../lib/supabase', () => {
  const user = {
    id: harness.userId,
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
    id: harness.userId,
    company_id: harness.companyId,
    name: 'QA',
    role: 'admin',
    email: 'qa@example.com',
  };
  const company = { id: harness.companyId, name: 'QA Co' };

  function resultFor(table: string) {
    if (!harness.signedIn) return { data: null, error: null };
    if (table === 'profiles') return { data: profile, error: null };
    if (table === 'companies') return { data: company, error: null };
    if (table === 'inspections') return { data: null, error: null };
    return { data: [], error: null };
  }

  function builder(table: string) {
    const promise = Promise.resolve(resultFor(table));
    const query = {
      select() { return query; },
      order() { return query; },
      eq() { return query; },
      in() { return query; },
      limit() { return query; },
      or() { return query; },
      update() { return query; },
      delete() { return query; },
      maybeSingle() { return promise; },
      single() { return promise; },
      then(onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        return promise.then(onFulfilled, onRejected);
      },
    };
    return query;
  }

  return {
    supabase: {
      auth: {
        getSession: async () => ({
          data: { session: harness.signedIn ? session : null },
          error: null,
        }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null }),
      },
      from: (table: string) => builder(table),
      rpc: async () => ({ data: false, error: null }),
      functions: {
        invoke: async () => ({ data: null, error: { message: 'no portal' } }),
      },
    },
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.signedIn = false;
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

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

async function renderAt(path: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter([
    {
      path: '*',
      element: (
        <QueryClientProvider client={client}>
          <AuthProvider>
            <App />
          </AuthProvider>
        </QueryClientProvider>
      ),
    },
  ], { initialEntries: [path] });
  await act(async () => {
    root.render(<RouterProvider router={router} />);
  });
  return router;
}

async function waitForText(text: string) {
  const started = Date.now();
  while (Date.now() - started < 4000) {
    if (document.body.textContent?.includes(text)) return;
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  }
  throw new Error(`timed out waiting for ${text}: ${document.body.textContent?.slice(0, 400)}`);
}

describe('unknown URL 404 and known deep routes', () => {
  it('keeps the SPA fallback and puts Page not found on the App catch-all, not a home redirect', () => {
    const app = src('src/App.tsx');
    const main = src('src/main.tsx');
    const redirects = src('public/_redirects');

    expect(app).toContain('<NotFoundPage />');
    expect(app).toContain('path="*"');
    expect(app).not.toMatch(/path="\*"\s+element=\{<Navigate to="\/" replace \/>\}/);
    expect(main).toContain('<App />');
    expect(main).toContain('grafterRootRoute');
    expect(src('src/components/layout/AppRouteError.tsx')).toContain("path: '*'");
    expect(main).not.toContain('<NotFoundPage');
    expect(redirects).toMatch(/^\/\*\s+\/index\.html\s+200$/m);
    expect(existsSync(resolve(process.cwd(), 'public/404.html'))).toBe(false);
  });

  it('shows Page not found on an unknown path and does not send you home', async () => {
    const router = await renderAt('/this-route-is-not-real');
    await waitForText('Page not found');
    expect(document.body.textContent).not.toContain('Quote it. Send it. Get paid.');
    expect(document.body.textContent).not.toContain('Sign in to Grafter');
    const home = Array.from(document.body.querySelectorAll('a')).find(link => (
      link.textContent?.trim() === 'Home' && link.getAttribute('href') === '/'
    ));
    if (!home) throw new Error('missing Home link');
    expect(router.state.location.pathname).toBe('/this-route-is-not-real');
  });

  it('renders a known deep route instead of the 404 catch-all', async () => {
    await renderAt('/login');
    await waitForText('Sign in to Grafter');
    expect(document.body.textContent).not.toContain('Page not found');
  });

  it('keeps a signed-out inspection deep link on the login redirect', async () => {
    expect(src('src/App.tsx')).toContain('path="/inspections/:id"');
    expect(src('src/App.tsx')).toContain('<Protected><InspectionFillPage />');

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter([
      { path: '/login', element: <div>Sign in to Grafter</div> },
      {
        path: '/inspections/:id',
        element: (
          <ProtectedRoute>
            <div>inspection fill stub</div>
          </ProtectedRoute>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ], { initialEntries: ['/inspections/00000000-0000-4000-8000-0000000000cc'] });

    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <AuthProvider>
            <RouterProvider router={router} />
          </AuthProvider>
        </QueryClientProvider>,
      );
    });
    await waitForText('Sign in to Grafter');
    expect(document.body.textContent).not.toContain('Page not found');
    expect(document.body.textContent).not.toContain('inspection fill stub');
    expect(document.body.textContent).not.toContain('Quote it. Send it. Get paid.');
  });

  it('renders the public client portal route instead of the 404 catch-all', async () => {
    await renderAt('/p');
    await waitForText('Missing portal link');
    expect(document.body.textContent).not.toContain('Page not found');
    expect(document.body.textContent).not.toContain('Sign in to Grafter');
  });

  it('renders a signed-in inspection deep link instead of the 404 catch-all', async () => {
    harness.signedIn = true;
    await renderAt('/inspections/00000000-0000-4000-8000-0000000000cc');
    await waitForText('Could not load inspection');
    expect(document.body.textContent).not.toContain('Page not found');
    expect(document.body.textContent).not.toContain('Sign in to Grafter');
  });
});
