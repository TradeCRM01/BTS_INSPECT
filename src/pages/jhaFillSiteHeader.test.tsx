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
import { JhaFillPage } from './JhaFillPage';

const harness = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
  userId: '00000000-0000-4000-8000-0000000000aa',
  companyId: '00000000-0000-4000-8000-0000000000bb',
  docId: '00000000-0000-4000-8000-0000000000ee',
  doc: {
    id: '00000000-0000-4000-8000-0000000000ee',
    template_id: 'tmpl',
    template_snapshot: {
      name: 'Hot water JHA',
      schema: {
        meta: {
          requiresTaskName: true,
          requiresSiteName: true,
          requiresDate: true,
          requiresSupervisor: false,
          maxAcceptableResidualScore: 9,
        },
        riskLevels: [{ id: 'low', label: 'Low', color: '#166534', score: 1 }],
        ppeOptions: [],
        signOffRoles: [{ id: 'sup', label: 'Supervisor', required: true }],
        stepLibrary: [],
      },
    },
    company_id: '00000000-0000-4000-8000-0000000000bb',
    created_by: '00000000-0000-4000-8000-0000000000aa',
    status: 'draft',
    meta: {
      taskName: 'Hot water swap',
      siteName: '',
      date: '2026-10-19',
      documentTitle: 'Hot water JHA',
      crewSignOns: JSON.stringify([{
        id: 'crew-1',
        name: 'Sam Field',
        role: 'Worker',
        date: '2026-10-19',
        signature: 'data:image/png;base64,crew',
        signedAt: '2026-10-19T09:00:00.000Z',
      }]),
    },
    steps: [{
      id: 's1',
      description: 'Isolate supply',
      hazards: 'Live',
      consequence: 'major',
      likelihood: 'possible',
      controls: 'Lock out',
      controlMeasures: [{ id: 'c1', hierarchy: 'isolate', text: 'Lock out', owner: '', verify: '' }],
      initialRisk: '',
      residualRisk: '',
      photos: [],
    }],
    ppe: [],
    sign_offs: [{
      roleId: 'sup',
      roleLabel: 'Supervisor',
      name: 'Pat Lee',
      signature: '',
      date: '',
    }],
    report_number: 'JHA-QA',
    pdf_storage_path: null,
    client_id: null,
    job_id: null,
    doc_version: 1,
    amended_from_id: null,
    amendment_reason: null,
    created_at: '2026-10-19T00:00:00.000Z',
    completed_at: null,
  },
}));

vi.mock('../components/ui/SignatureCapture', () => ({
  SignatureCapture: () => null,
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
    if (table === 'jha_documents') return { data: harness.doc, error: null };
    if (table === 'jha_templates') return { data: null, error: null };
    if (table === 'jha_take5') return { data: [], error: null };
    if (table === 'jobs') return { data: [], error: null };
    if (table === 'clients') return { data: [], error: null };
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
      maybeSingle() { return promise; },
      single() { return promise; },
      update(payload: Record<string, unknown>) {
        if (table === 'jha_documents') {
          harness.updates.push(payload);
          Object.assign(harness.doc, payload);
          if (payload.meta) harness.doc.meta = { ...harness.doc.meta, ...(payload.meta as Record<string, string>) };
        }
        return query;
      },
      insert() { return query; },
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
      rpc: async () => ({ data: [], error: null }),
      storage: {
        from: () => ({
          download: async () => ({ data: null, error: null }),
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
  harness.doc.meta.siteName = '';
  harness.doc.sign_offs[0].signature = '';
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
      path: '/jha/new',
      element: (
        <AuthProvider>
          <ToastProvider>
            <JhaFillPage />
          </ToastProvider>
        </AuthProvider>
      ),
    },
  ], { initialEntries: [`/jha/new?docId=${harness.docId}`] });
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

function setInputValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('JHA fill — site stays while typing, header Save draft vs Sign off', () => {
  it('does not hide Site mid-keystroke, trims " 6", and keeps Save draft while unsaved', async () => {
    await renderPage();
    await waitFor('site field', () => document.body.textContent?.includes('Site / location') === true);
    expect(document.body.textContent).toContain('Signed Sam Field');

    const site = [...document.querySelectorAll('input')].find(el =>
      el.placeholder === 'Where is the work?',
    ) as HTMLInputElement;
    expect(site).toBeTruthy();

    await act(async () => {
      site.focus();
      setInputValue(site, ' 6');
    });
    const stillThere = [...document.querySelectorAll('input')].find(el =>
      el.placeholder === 'Where is the work?',
    );
    expect(stillThere).toBeTruthy();
    expect((stillThere as HTMLInputElement).value).toBe(' 6');
    expect(document.body.textContent).toContain('Save draft');

    await act(async () => {
      stillThere?.blur();
    });
    const afterBlur = [...document.querySelectorAll('input')].find(el =>
      el.placeholder === 'Where is the work?',
    );
    if (afterBlur) expect(afterBlur.value).toBe('6');

    const save = [...document.querySelectorAll('button')].find(btn => btn.textContent?.includes('Save draft'));
    if (save) {
      await act(async () => {
        save.click();
      });
    }
    await waitFor('trimmed site persist', () => harness.updates.some(row => {
      const meta = row.meta as { siteName?: string } | undefined;
      return meta?.siteName === '6';
    }));
  });
});
