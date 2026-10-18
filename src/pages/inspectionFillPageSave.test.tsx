/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../components/ui';
import { InspectionFillPage } from './InspectionFillPage';

const harness = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  userId: '00000000-0000-4000-8000-0000000000aa',
  companyId: '00000000-0000-4000-8000-0000000000bb',
  inspectionId: '00000000-0000-4000-8000-0000000000cc',
  schema: {
    meta: {
      requiresSiteName: false,
      requiresSiteAddress: false,
      requiresClientName: false,
      requiresJobNumber: false,
    },
    sections: [{
      id: 'sec-1',
      title: 'Prove section',
      isRepeating: false,
      questions: [{
        id: 'notes-1',
        type: 'long_text',
        label: 'Notes',
        required: false,
      }],
    }],
  },
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
  const inspection = {
    id: harness.inspectionId,
    status: 'draft',
    responses: {},
    meta: { siteName: 'Phone site' },
    template_snapshot: { name: 'CoS 069 prove template', schema: harness.schema },
    started_at: '2026-10-19T00:00:00.000Z',
    completed_at: null,
    inspector_id: harness.userId,
    crm_job_id: null,
    client_id: null,
    archived: false,
  };

  function resultFor(table: string) {
    if (table === 'profiles') return { data: profile, error: null };
    if (table === 'companies') return { data: company, error: null };
    if (table === 'inspections') return { data: inspection, error: null };
    if (table === 'jobs') return { data: [], error: null };
    if (table === 'photos') return { data: [], error: null };
    if (table === 'clients') return { data: null, error: null };
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
      update(payload: Record<string, unknown>) {
        if (table === 'inspections') harness.updates.push(payload);
        return query;
      },
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
      storage: {
        from: () => ({
          createSignedUrl: async () => ({ data: { signedUrl: '' }, error: null }),
          remove: async () => ({ error: null }),
        }),
      },
    },
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.updates = [];
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

async function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <AuthProvider>
          <ToastProvider>
            <MemoryRouter initialEntries={[`/inspections/${harness.inspectionId}`]}>
              <Routes>
                <Route path="/inspections/:id" element={<InspectionFillPage />} />
              </Routes>
            </MemoryRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>,
    );
  });
}

async function waitForNotes() {
  const started = Date.now();
  while (Date.now() - started < 4000) {
    if (container.querySelector('textarea')) return container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  }
  throw new Error(`timed out waiting for notes: ${document.body.textContent?.slice(0, 400)}`);
}

describe('inspection fill page flush', () => {
  it('keeps a typed note by flushing on blur before the debounce would fire', async () => {
    await renderPage();
    const notes = await waitForNotes();
    expect(document.body.textContent).toContain('Saved');

    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(notes, 'keep this note');
      notes.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.body.textContent).toContain('Saving…');
    expect(harness.updates).toEqual([]);

    await act(async () => {
      notes.blur();
      notes.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      await Promise.resolve();
    });

    expect(harness.updates.length).toBeGreaterThan(0);
    expect(JSON.stringify(harness.updates[0])).toContain('keep this note');
  });
});
