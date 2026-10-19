/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../components/ui';
import { unsavedChangesLeaveCopy } from '../lib/unsavedChangesGuard';
import { JhaFillPage } from './JhaFillPage';
import { JhaTemplateEditorPage } from './JhaTemplateEditorPage';
import { Take5Page } from './Take5Page';

const jhaSchema = {
  meta: {
    requiresTaskName: true,
    requiresSiteName: true,
    requiresDate: true,
    requiresSupervisor: false,
  },
  riskLevels: [{ id: 'low', label: 'Low', color: '#166534', score: 1 }],
  ppeOptions: [],
  signOffRoles: [],
  stepLibrary: [],
};

const harness = vi.hoisted(() => ({
  userId: '00000000-0000-4000-8000-0000000000aa',
  companyId: '00000000-0000-4000-8000-0000000000bb',
  jhaId: '00000000-0000-4000-8000-0000000000cc',
  take5Id: '00000000-0000-4000-8000-0000000000dd',
  saves: [] as Array<{ table: string; payload: Record<string, unknown> }>,
  jhaStatus: 'draft',
  take5Status: 'draft',
}));

vi.mock('../lib/aiSettingsClient', () => ({
  fetchAiSettings: async () => ({ keySet: false }),
}));

vi.mock('react-signature-canvas', () => {
  const { forwardRef } = require('react') as typeof import('react');
  return {
    default: forwardRef(function SignatureCanvas(_props: unknown, _ref: unknown) {
      return <canvas data-testid="sig" />;
    }),
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
    name: 'QA',
    role: 'admin',
    email: 'qa@example.com',
    template_access: 'edit',
  };
  const company = { id: harness.companyId, name: 'QA Co' };
  const jhaDoc = () => ({
    id: harness.jhaId,
    template_id: 'tmpl-1',
    template_snapshot: { name: 'Plant isolation', schema: jhaSchema },
    company_id: harness.companyId,
    created_by: harness.userId,
    status: harness.jhaStatus,
    meta: { siteName: 'Plant A', date: '2026-10-19', documentTitle: 'Plant isolation', taskName: 'Isolate' },
    steps: [{
      id: 'step-1',
      description: 'Isolate',
      hazards: '',
      consequence: '',
      likelihood: '',
      controls: '',
      controlMeasures: [],
      initialRisk: '',
      residualRisk: '',
      residualLikelihood: '',
      residualConsequence: '',
      residualEscalationNote: '',
      photos: [],
    }],
    ppe: [],
    sign_offs: [],
    report_number: 'JHA-261019-1000',
    pdf_storage_path: null,
    client_id: null,
    job_id: null,
    doc_version: 1,
    amended_from_id: null,
    amendment_reason: null,
    created_at: '2026-10-19T00:00:00.000Z',
    completed_at: harness.jhaStatus === 'completed' ? '2026-10-19T01:00:00.000Z' : null,
  });
  const take5Row = () => ({
    id: harness.take5Id,
    jha_document_id: harness.jhaId,
    status: harness.take5Status,
    meta: { date: '2026-10-19', time: '08:00', location: 'Board 1', crewSignOns: '' },
    stop_think: 'Look',
    identify_hazards: 'Live',
    assess_risk: 'High',
    control_actions: 'Isolate',
    go_no_go: 'go',
    signed_name: 'QA',
    signature: null,
    signed_at: null,
  });

  function resultFor(table: string) {
    if (table === 'profiles') return { data: profile, error: null };
    if (table === 'companies') return { data: company, error: null };
    if (table === 'jha_documents') return { data: jhaDoc(), error: null };
    if (table === 'jha_templates') return { data: null, error: null };
    if (table === 'jha_take5') return { data: take5Row(), error: null };
    if (table === 'clients') return { data: [], error: null };
    if (table === 'jobs') return { data: [], error: null };
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
        harness.saves.push({ table, payload });
        return query;
      },
      insert(payload: Record<string, unknown>) {
        harness.saves.push({ table, payload });
        return query;
      },
      upsert(payload: Record<string, unknown>) {
        harness.saves.push({ table, payload });
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
      rpc: async () => ({ data: [], error: null }),
      storage: {
        from: () => ({
          download: async () => ({ data: null, error: { message: 'none' } }),
        }),
      },
    },
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.saves = [];
  harness.jhaStatus = 'draft';
  harness.take5Status = 'draft';
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

async function renderRoutes(path: string, routes: Parameters<typeof createMemoryRouter>[0]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  await act(async () => {
    root.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  });
}

function shell(element: ReactNode) {
  return (
    <AuthProvider>
      <ToastProvider>
        {element}
      </ToastProvider>
    </AuthProvider>
  );
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

function clickNamed(label: string) {
  const button = Array.from(document.body.querySelectorAll('a,button')).find(el => (
    el.textContent?.replace(/\s+/g, ' ').trim() === label
  ));
  if (!button) throw new Error(`missing ${label}`);
  return act(async () => {
    (button as HTMLElement).click();
  });
}

describe('W4 W5 W6 leave dialogs on JHA fill, JHA template, and Take 5', () => {
  it('W4: JHA fill warns on leave and does not flush a completed document on blur', async () => {
    await renderRoutes(`/jha/new?docId=${harness.jhaId}`, [
      { path: '/jha/new', element: shell(<JhaFillPage />) },
      { path: '/jha', element: <div>JHA list</div> },
    ]);
    await waitForText('Hazards, steps & controls');
    const site = document.querySelector('input[placeholder="Where is the work?"]');
    if (!(site instanceof HTMLInputElement)) throw new Error('missing site');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(site, 'Plant B');
      site.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await clickNamed('JHA documents');
    await waitForText('Leave without saving?');
    expect(document.body.textContent).not.toContain('JHA list');
    expect(document.body.textContent).toContain(unsavedChangesLeaveCopy().message);
    expect(unsavedChangesLeaveCopy().message).not.toContain('lost');
    await clickNamed('Cancel');
    expect(document.body.textContent).not.toContain('Leave without saving?');
    expect((document.querySelector('input[placeholder="Where is the work?"]') as HTMLInputElement).value).toBe('Plant B');

    harness.saves = [];
    harness.jhaStatus = 'completed';
    await renderRoutes(`/jha/new?docId=${harness.jhaId}`, [
      { path: '/jha/new', element: shell(<JhaFillPage />) },
      { path: '/jha', element: <div>JHA list</div> },
    ]);
    await waitForText('Hazards, steps & controls');
    await act(async () => {
      document.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(harness.saves.filter(save => save.table === 'jha_documents' && save.payload.status === 'draft')).toEqual([]);
  });

  it('W5: JHA template editor warns on Templates while unsaved', async () => {
    await renderRoutes('/jha-templates/new', [
      { path: '/jha-templates/new', element: shell(<JhaTemplateEditorPage />) },
      { path: '/templates', element: <div>Templates list</div> },
    ]);
    await waitForText('Max acceptable residual');
    const name = document.querySelector('input[placeholder="e.g. Electrical isolation JHA"]');
    if (!(name instanceof HTMLInputElement)) throw new Error('missing template name');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(name, 'Isolation pack');
      name.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await clickNamed('Templates');
    await waitForText('Leave without saving?');
    expect(document.body.textContent).not.toContain('Templates list');
    expect(document.body.textContent).toContain(unsavedChangesLeaveCopy().message);
    expect(unsavedChangesLeaveCopy().message).not.toContain('lost');
    await clickNamed('Cancel');
    expect((document.querySelector('input[placeholder="e.g. Electrical isolation JHA"]') as HTMLInputElement).value).toBe('Isolation pack');
  });

  it('W6: Take 5 warns on leave and does not insert a draft on blur when nothing changed', async () => {
    await renderRoutes(`/jha/take5?jhaId=${harness.jhaId}&id=${harness.take5Id}`, [
      { path: '/jha/take5', element: shell(<Take5Page />) },
      { path: '/jha/new', element: <div>Parent JHA</div> },
    ]);
    await waitForText('The five checks');
    const notes = Array.from(document.querySelectorAll('textarea'))[0];
    if (!(notes instanceof HTMLTextAreaElement)) throw new Error('missing Take 5 notes');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(notes, 'Look both ways');
      notes.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(document.body.textContent).toContain('Unsaved');
    await clickNamed('Parent JHA');
    await waitForText('Leave without saving?');
    expect(document.body.textContent).toContain(unsavedChangesLeaveCopy().message);
    expect(unsavedChangesLeaveCopy().message).not.toContain('lost');
    await clickNamed('Cancel');
    expect((document.querySelectorAll('textarea')[0] as HTMLTextAreaElement).value).toBe('Look both ways');

    harness.saves = [];
    harness.take5Status = 'completed';
    await renderRoutes(`/jha/take5?jhaId=${harness.jhaId}&id=${harness.take5Id}`, [
      { path: '/jha/take5', element: shell(<Take5Page />) },
    ]);
    await waitForText('The five checks');
    await act(async () => {
      document.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(harness.saves.filter(save => save.table === 'jha_take5')).toEqual([]);
  });
});
