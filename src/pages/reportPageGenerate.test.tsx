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
import { ReportPage } from './ReportPage';

const harness = vi.hoisted(() => ({
  userId: '00000000-0000-4000-8000-0000000000aa',
  companyId: '00000000-0000-4000-8000-0000000000bb',
  inspectionId: '00000000-0000-4000-8000-0000000000cc',
  issued: [] as string[],
  inspectionUpdates: [] as Array<Record<string, unknown>>,
  reportInserts: [] as Array<Record<string, unknown>>,
  uploads: [] as string[],
  status: 'completed',
}));

vi.mock('../lib/aiSettingsClient', () => ({
  fetchAiSettings: async () => ({ keySet: false }),
}));

vi.mock('../reports/generatePdf', () => ({
  generatePdf: async () => new Blob(['pdf'], { type: 'application/pdf' }),
}));

vi.mock('../components/pdf/PdfViewer', () => ({
  PdfViewer: () => <div>pdf viewer</div>,
}));

vi.mock('../lib/pdfWorker', () => ({}));

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
  const inspection = () => ({
    id: harness.inspectionId,
    status: harness.status,
    responses: {},
    meta: { siteName: 'Phone site' },
    template_snapshot: {
      name: 'CoS 069 prove template',
      report_renderer: 'generic_inspection',
      schema: {
        meta: {},
        sections: [],
      },
    },
    started_at: '2026-10-19T00:00:00.000Z',
    completed_at: '2026-10-19T01:00:00.000Z',
    inspector_id: harness.userId,
    crm_job_id: null,
    client_id: null,
    archived: false,
    doc_version: 1,
    amendment_reason: null,
  });

  function resultFor(table: string) {
    if (table === 'profiles') return { data: profile, error: null };
    if (table === 'companies') return { data: company, error: null };
    if (table === 'inspections') return { data: inspection(), error: null };
    if (table === 'reports') return { data: null, error: null };
    if (table === 'photos') return { data: [], error: null };
    if (table === 'jobs') return { data: null, error: null };
    if (table === 'clients') return { data: null, error: null };
    if (table === 'pdf_annotations') return { data: [], error: null };
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
      not() { return query; },
      update(payload: Record<string, unknown>) {
        if (table === 'inspections') {
          harness.inspectionUpdates.push(payload);
          if (payload.status === 'issued') harness.issued.push(harness.inspectionId);
        }
        return query;
      },
      insert(payload: Record<string, unknown>) {
        if (table === 'reports') harness.reportInserts.push(payload);
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
          upload: async (path: string) => {
            harness.uploads.push(path);
            return { error: null };
          },
          download: async () => ({ data: null, error: { message: 'none' } }),
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
  harness.issued = [];
  harness.inspectionUpdates = [];
  harness.reportInserts = [];
  harness.uploads = [];
  harness.status = 'completed';
  if (!URL.createObjectURL) {
    URL.createObjectURL = () => 'blob:mock';
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = () => {};
  }
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

describe('C6 report generate does not issue', () => {
  it('C6: Generate PDF does not mark the inspection Issued', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter([
      {
        path: '/inspections/:id/report',
        element: (
          <AuthProvider>
            <ToastProvider>
              <ReportPage />
            </ToastProvider>
          </AuthProvider>
        ),
      },
    ], { initialEntries: [`/inspections/${harness.inspectionId}/report`] });

    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <RouterProvider router={router} />
        </QueryClientProvider>,
      );
    });
    await waitForText('Generate PDF');
    const generate = Array.from(document.body.querySelectorAll('button')).find(btn => btn.textContent === 'Generate PDF');
    if (!generate) throw new Error('missing Generate PDF');
    await act(async () => {
      generate.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    const started = Date.now();
    while (Date.now() - started < 4000 && harness.uploads.length === 0) {
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
      });
    }
    expect(harness.uploads.length).toBeGreaterThan(0);
    expect(harness.reportInserts.length).toBeGreaterThan(0);
    expect(harness.issued).toEqual([]);
    expect(harness.inspectionUpdates.some(update => update.status === 'issued')).toBe(false);
    expect(document.body.textContent).not.toMatch(/\bIssued\b/);
  });
});
