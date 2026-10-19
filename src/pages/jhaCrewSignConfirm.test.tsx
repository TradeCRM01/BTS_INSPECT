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
import { JhaCrewSignPage } from './JhaCrewSignPage';

const harness = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  userId: '00000000-0000-4000-8000-0000000000aa',
  companyId: '00000000-0000-4000-8000-0000000000bb',
  docId: '00000000-0000-4000-8000-0000000000ee',
  crewId: 'crew-1',
  doc: {
    id: '00000000-0000-4000-8000-0000000000ee',
    meta: {
      taskName: 'Hot water swap',
      siteName: '14 Kedron Brook Rd',
      crewSignOns: JSON.stringify([{
        id: 'crew-1',
        name: 'Sam Field',
        role: 'Worker',
        date: '2026-10-19',
        profileId: '00000000-0000-4000-8000-0000000000aa',
        signMode: 'on_device',
      }]),
    },
    status: 'draft',
    report_number: 'JHA-QA',
    template_snapshot: { name: 'Hot water JHA', schema: {} },
    company_id: '00000000-0000-4000-8000-0000000000bb',
    job_id: null,
  },
}));

vi.mock('../components/ui/SignatureCapture', () => {
  const React = require('react') as typeof import('react');
  return {
    SignatureCapture: (props: { onChange: (value: string) => void }) =>
      React.createElement('button', {
        type: 'button',
        'data-apply-sig': '1',
        onClick: () => props.onChange('data:image/png;base64,crew'),
      }, 'Use drawing'),
  };
});

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
    name: 'Sam Field',
    role: 'admin',
    email: 'qa@example.com',
  };
  const company = { id: harness.companyId, name: 'QA Co' };

  function resultFor(table: string) {
    if (table === 'profiles') return { data: profile, error: null };
    if (table === 'companies') return { data: company, error: null };
    if (table === 'jha_documents') return { data: harness.doc, error: null };
    if (table === 'jobs') return { data: null, error: null };
    return { data: [], error: null };
  }

  function builder(table: string) {
    const promise = Promise.resolve(resultFor(table));
    const query = {
      select() { return query; },
      eq() { return query; },
      maybeSingle() { return promise; },
      update(payload: Record<string, unknown>) {
        if (table === 'jha_documents') harness.updates.push(payload);
        return query;
      },
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
    },
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.updates = [];
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
  const router = createMemoryRouter([
    {
      path: '/jha/crew-sign',
      element: (
        <AuthProvider>
          <ToastProvider>
            <JhaCrewSignPage />
          </ToastProvider>
        </AuthProvider>
      ),
    },
  ], { initialEntries: [`/jha/crew-sign?docId=${harness.docId}&crewId=${harness.crewId}`] });
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

describe('JHA crew-sign confirm date', () => {
  it('shows the signed date on the thank-you line after confirm', async () => {
    await renderPage();
    await waitFor('sign button', () => document.body.textContent?.includes('Confirm sign-on') === true);

    await act(async () => {
      (document.querySelector('[data-apply-sig]') as HTMLButtonElement).click();
    });
    await act(async () => {
      [...document.querySelectorAll('button')].find(btn => btn.textContent === 'Confirm sign-on')?.click();
    });

    await waitFor('confirm copy', () => !!document.querySelector('[data-crew-sign-confirm]'));
    const copy = document.querySelector('[data-crew-sign-confirm]')?.textContent ?? '';
    expect(copy).toMatch(/^Signed \d{1,2} [A-Z][a-z]{2} \d{4}/);
    expect(copy).toContain('Thank you.');
    expect(copy).not.toBe('Signed . Thank you.');
  });
});
