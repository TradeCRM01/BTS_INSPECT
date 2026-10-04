/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../components/ui';
import { InspectionsPage } from './InspectionsPage';

const harness = vi.hoisted(() => ({
  inspections: 'error' as 'error' | 'pending',
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
    if (table === 'profiles') return { data: profile, error: null };
    if (table === 'companies') return { data: company, error: null };
    if (table === 'inspections' && harness.inspections === 'error') {
      return { data: null, error: { message: 'inspections failed' } };
    }
    return { data: [], error: null };
  }

  function builder(table: string) {
    const pending = table === 'inspections' && harness.inspections === 'pending';
    const promise = pending ? new Promise(() => {}) : Promise.resolve(resultFor(table));
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
        getSession: async () => ({ data: { session }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => ({ error: null }),
      },
      from: (table: string) => builder(table),
      rpc: async () => ({ data: false, error: null }),
    },
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  window.history.replaceState({}, '', '/inspections');
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

async function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={['/inspections']}>
              <InspectionsPage />
            </MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
  });
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

function whisper(): string {
  return document.querySelector('.hub-inspections-list-whisper')?.textContent ?? '';
}

describe('inspections list outside audit auth', () => {
  it('says the list could not load when the query fails, beside the error panel', async () => {
    harness.inspections = 'error';
    await renderPage();
    await waitForText('Failed to load');
    expect(sessionStorage.getItem('grafter-audit-auth')).toBeNull();
    expect(whisper()).toBe('Open or due · Could not load');
    expect(document.body.textContent).toContain('Failed to load');
  });

  it('says the list is loading while the query is still pending', async () => {
    harness.inspections = 'pending';
    await renderPage();
    await waitForText('Open or due · Loading');
    expect(whisper()).toBe('Open or due · Loading');
    expect(document.body.textContent).not.toContain('0 inspections');
  });
});
