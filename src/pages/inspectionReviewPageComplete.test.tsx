/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { InspectionReviewPage } from './InspectionReviewPage';

const harness = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  userId: '00000000-0000-4000-8000-0000000000aa',
  companyId: '00000000-0000-4000-8000-0000000000bb',
  inspectionId: '00000000-0000-4000-8000-0000000000cc',
  inspectionStatus: 'completed',
  inspectionArchived: false,
  inspectionCrmJobId: 'job-1',
  job: {
    id: 'job-1',
    title: 'New job',
    address: 'New St',
    client_id: 'client-1',
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
  const schema = {
    meta: {
      requiresSiteName: false,
      requiresSiteAddress: false,
      requiresClientName: false,
      requiresJobNumber: false,
    },
    sections: [],
  };
  function inspectionRow() {
    return {
      id: harness.inspectionId,
      status: harness.inspectionStatus,
      archived: harness.inspectionArchived,
      responses: {},
      meta: { siteName: 'Old St' },
      template_snapshot: { name: 'Review template', schema },
      started_at: '2026-10-19T00:00:00.000Z',
      completed_at: '2026-10-19T00:00:00.000Z',
      inspector_id: harness.userId,
      crm_job_id: harness.inspectionCrmJobId,
      client_id: null,
      site_name_snapshot: 'Old St',
      site_address_snapshot: 'Old St',
      client_name_snapshot: 'Old Client',
    };
  }
  function resultFor(table: string) {
    if (table === 'profiles') return { data: profile, error: null };
    if (table === 'companies') return { data: company, error: null };
    if (table === 'inspections') return { data: inspectionRow(), error: null };
    if (table === 'photos') return { data: [], error: null };
    if (table === 'jobs') return { data: harness.job, error: null };
    if (table === 'clients') return { data: null, error: null };
    return { data: [], error: null };
  }
  function builder(table: string) {
    let promise: Promise<unknown> = Promise.resolve(resultFor(table));
    const query = {
      select() { return query; },
      order() { return query; },
      eq() { return query; },
      in() { return query; },
      limit() { return query; },
      or() { return query; },
      update(payload: Record<string, unknown>) {
        if (table === 'inspections') harness.updates.push(payload);
        promise = Promise.resolve({ data: [{ id: harness.inspectionId, ...payload }], error: null });
        return query;
      },
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
  harness.inspectionStatus = 'completed';
  harness.inspectionArchived = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([
    {
      path: '/inspections/:id/review',
      element: (
        <AuthProvider>
          <InspectionReviewPage />
        </AuthProvider>
      ),
    },
    { path: '/inspections/:id/report', element: <div>REPORT PAGE</div> },
    { path: '/inspections/:id', element: <div>FILL PAGE</div> },
  ], { initialEntries: [`/inspections/${harness.inspectionId}/review`] });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  });
}

async function waitForLock() {
  const started = Date.now();
  while (Date.now() - started < 4000) {
    if ((document.body.textContent || '').includes('Locked. Contact the office to amend.')) return;
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
  }
  throw new Error(`timed out waiting for lock: ${document.body.textContent?.slice(0, 400)}`);
}

describe('InspectionReviewPage complete guard', () => {
  it('does not re-complete an already completed inspection', async () => {
    await renderPage();
    await waitForLock();
    const complete = Array.from(document.body.querySelectorAll('button')).find(btn => (
      /Complete Inspection|Locked/.test(btn.textContent || '')
    ));
    expect(complete).toBeTruthy();
    await act(async () => { complete?.click(); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 40)); });
    expect(harness.updates).toEqual([]);
    expect(document.body.textContent).toContain('Locked. Contact the office to amend.');
    expect(document.body.textContent).toContain('Old St');
    expect(document.body.textContent).not.toContain('New St');
    expect(document.body.textContent).not.toContain('REPORT PAGE');
  });
});
