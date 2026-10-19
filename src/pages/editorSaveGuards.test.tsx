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
  saves: [] as Array<{ table: string; payload: Record<string, unknown>; op?: string }>,
  insertDelay: 0,
  ins: 0,
  rowIds: new Set<string>(),
  tplExists: true,
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
    completed_at: harness.jhaStatus === 'completed' || harness.jhaStatus === 'published'
      ? '2026-10-19T01:00:00.000Z'
      : null,
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
    signature: harness.take5Status === 'completed' ? 'data:image/png;base64,AAA' : null,
    signed_at: harness.take5Status === 'completed' ? '2026-10-19T00:00:00Z' : null,
  });

  function resultFor(table: string) {
    if (table === 'profiles') return { data: profile, error: null };
    if (table === 'companies') return { data: company, error: null };
    if (table === 'jha_documents') return { data: jhaDoc(), error: null };
    if (table === 'jha_templates') return { data: harness.tplExists ? { id: 'tmpl-1', name: 'Iso pack', description: '', schema: { ...jhaSchema, riskLevels: [{ id: 'low', label: 'Low', color: '#166534', score: 1 }, { id: 'high', label: 'High', color: '#991b1b', score: 4 }] }, version: 1, company_id: harness.companyId, created_by: harness.userId, archived: false } : null, error: null };
    if (table === 'jha_take5') return { data: take5Row(), error: null };
    if (table === 'clients') return { data: [], error: null };
    if (table === 'jobs') return { data: [], error: null };
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
        harness.saves.push({ table, payload, op: 'update' });
        promise = Promise.resolve({ data: { ...(resultFor(table) as { data: object }).data, ...payload }, error: null });
        return query;
      },
      insert(payload: Record<string, unknown>) {
        const id = typeof payload.id === 'string' ? payload.id : '';
        if (id && harness.rowIds.has(id)) {
          promise = Promise.resolve({
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint' },
          });
          return query;
        }
        return query.upsert(payload);
      },
      upsert(payload: Record<string, unknown>) {
        if (table === 'jha_documents') {
          for (const col of ['template_id', 'template_snapshot', 'company_id', 'created_by']) {
            if (payload[col] == null) {
              promise = Promise.resolve({
                data: null,
                error: { message: `null value in column "${col}" of relation "jha_documents"` },
              });
              return query;
            }
          }
        }
        const id = typeof payload.id === 'string' && payload.id
          ? payload.id
          : `new-${table}-${harness.ins + 1}`;
        const seen = harness.rowIds.has(id);
        harness.rowIds.add(id);
        if (!seen) harness.ins += 1;
        harness.saves.push({ table, payload: { ...payload, id }, op: seen ? 'update' : 'insert' });
        const base = resultFor(table) as { data: Record<string, unknown> | null };
        const row = { ...(base.data ?? {}), ...payload, id };
        promise = new Promise(r => setTimeout(() => r({ data: row, error: null }), harness.insertDelay));
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
let lastRouter: ReturnType<typeof createMemoryRouter> | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  harness.saves = [];
  harness.insertDelay = 0;
  harness.ins = 0;
  harness.rowIds = new Set();
  harness.tplExists = true;
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
  lastRouter = router;
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

async function sleep(ms: number) {
  await act(async () => {
    await new Promise(r => setTimeout(r, ms));
  });
}

async function typeArea(i: number, v: string) {
  const el = Array.from(document.querySelectorAll('textarea'))[i] as HTMLTextAreaElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set?.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  return el;
}

async function typeInput(sel: string, v: string) {
  const el = document.querySelector(sel) as HTMLInputElement;
  if (!el) throw new Error('missing ' + sel);
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set?.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function blur(target: EventTarget = document.body) {
  await act(async () => {
    target.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });
  await sleep(60);
}

const w = (t: string) => harness.saves.filter(s => s.table === t);
const loc = () => `${lastRouter!.state.location.pathname}${lastRouter!.state.location.search}`;
const t5Routes = () => [
  { path: '/jha/take5', element: shell(<Take5Page />) },
  { path: '/jha/new', element: <div>Parent JHA page</div> },
];
const jhaRoutes = () => [
  { path: '/jha/new', element: shell(<JhaFillPage />) },
  { path: '/jha', element: <div>JHA list</div> },
];
const jtRoutes = () => [
  { path: '/jha-templates/new', element: shell(<JhaTemplateEditorPage />) },
  { path: '/jha-templates/:id', element: shell(<JhaTemplateEditorPage />) },
  { path: '/templates', element: <div>Templates list</div> },
];

describe('Take 5 and JHA save guards', () => {
  it('F4: completed Take 5 blur save stays completed and does not re-stamp signed_at', async () => {
    harness.take5Status = 'completed';
    await renderRoutes(`/jha/take5?jhaId=${harness.jhaId}&id=${harness.take5Id}`, t5Routes());
    await waitForText('The five checks');
    const el = await typeArea(0, 'Look again');
    await blur(el);
    await sleep(120);
    const writes = w('jha_take5');
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.every(s => s.payload.status === 'completed')).toBe(true);
    expect(writes.every(s => s.payload.signed_at === '2026-10-19T00:00:00Z')).toBe(true);
  });

  it('P1-2 Take 5: delayed insert then later edit updates the same row', async () => {
    harness.insertDelay = 400;
    await renderRoutes(`/jha/take5?jhaId=${harness.jhaId}`, t5Routes());
    await waitForText('The five checks');
    const a = await typeArea(0, 'Check ladder');
    await blur(a);
    const b = await typeArea(1, 'Wet roof');
    await blur(b);
    await sleep(900);
    const rows = w('jha_take5');
    const ids = [...new Set(rows.map(s => String(s.payload.id)))];
    expect(ids).toHaveLength(1);
    expect(rows.filter(s => s.op === 'insert')).toHaveLength(1);
    expect(rows.some(s => s.payload.identify_hazards === 'Wet roof')).toBe(true);
  });

  it('R1/R5: after the first Take 5 insert, the next edit warns on leave', async () => {
    await renderRoutes(`/jha/take5?jhaId=${harness.jhaId}`, t5Routes());
    await waitForText('The five checks');
    const a = await typeArea(0, 'Check ladder');
    await blur(a);
    await sleep(300);
    expect(w('jha_take5').filter(s => s.op === 'insert')).toHaveLength(1);
    expect(loc()).toMatch(/id=[0-9a-f-]{36}/i);
    expect(document.body.textContent).not.toContain('Leave without saving?');
    await typeArea(0, 'Check ladder twice');
    await clickNamed('Parent JHA');
    await sleep(80);
    expect(document.body.textContent).toMatch(/Leave without saving\?|Leave\?/);
    expect(document.body.textContent).not.toContain('Parent JHA page');
  });

  it('F5: completed JHA blur save stays completed', async () => {
    harness.jhaStatus = 'completed';
    await renderRoutes(`/jha/new?docId=${harness.jhaId}`, jhaRoutes());
    await waitForText('Hazards, steps & controls');
    await typeInput('input[placeholder="Where is the work?"]', 'Plant B');
    await blur(document.querySelector('input[placeholder="Where is the work?"]')!);
    await sleep(120);
    const st = w('jha_documents').map(s => s.payload.status);
    expect(st.length).toBeGreaterThan(0);
    expect(st.every(s => s === 'completed')).toBe(true);
  });

  it('list-opened JHA blur updates the existing row and does not insert', async () => {
    await renderRoutes(`/jha/new?docId=${harness.jhaId}`, jhaRoutes());
    await waitForText('Hazards, steps & controls');
    const sel = 'input[placeholder="Where is the work?"]';
    await typeInput(sel, 'Plant D');
    await blur(document.querySelector(sel)!);
    await sleep(200);
    const rows = w('jha_documents');
    expect(rows.filter(s => s.op === 'insert')).toHaveLength(0);
    expect(rows.some(s => s.op === 'update' && (s.payload.meta as { siteName?: string } | undefined)?.siteName === 'Plant D')).toBe(true);
    expect(rows.every(s => String(s.payload.id ?? harness.jhaId) === harness.jhaId)).toBe(true);
  });

  it('completed JHA debounce stays completed', async () => {
    harness.jhaStatus = 'completed';
    await renderRoutes(`/jha/new?docId=${harness.jhaId}`, jhaRoutes());
    await waitForText('Hazards, steps & controls');
    await typeInput('input[placeholder="Where is the work?"]', 'Plant debounce');
    await sleep(2200);
    const st = w('jha_documents').map(s => s.payload.status);
    expect(st.length).toBeGreaterThan(0);
    expect(st.every(s => s === 'completed')).toBe(true);
  });

  it('P1-2 JHA: delayed insert then later edit updates the same row and sets docId', async () => {
    harness.insertDelay = 400;
    await renderRoutes('/jha/new?templateId=tmpl-1', jhaRoutes());
    await waitForText('Hazards, steps & controls');
    const sel = 'input[placeholder="Where is the work?"]';
    await typeInput(sel, 'Plant B');
    await blur(document.querySelector(sel)!);
    await typeInput(sel, 'Plant C');
    await blur(document.querySelector(sel)!);
    await sleep(900);
    const rows = w('jha_documents');
    const ids = [...new Set(rows.map(s => String(s.payload.id)))];
    expect(ids).toHaveLength(1);
    expect(rows.filter(s => s.op === 'insert')).toHaveLength(1);
    expect(rows.some(s => (s.payload.meta as { siteName?: string } | undefined)?.siteName === 'Plant C')).toBe(true);
    expect(loc()).toMatch(/docId=[0-9a-f-]{36}/i);
  });

  it('completed JHA blur keeps the original completed_at', async () => {
    harness.jhaStatus = 'completed';
    await renderRoutes(`/jha/new?docId=${harness.jhaId}`, jhaRoutes());
    await waitForText('Hazards, steps & controls');
    const sel = 'input[placeholder="Where is the work?"]';
    await typeInput(sel, 'Plant stamp');
    await blur(document.querySelector(sel)!);
    await sleep(120);
    const stamps = w('jha_documents').map(s => s.payload.completed_at);
    expect(stamps.length).toBeGreaterThan(0);
    expect(stamps.every(s => s === '2026-10-19T01:00:00.000Z')).toBe(true);
  });

  it('published JHA blur stays published', async () => {
    harness.jhaStatus = 'published';
    await renderRoutes(`/jha/new?docId=${harness.jhaId}`, jhaRoutes());
    await waitForText('Hazards, steps & controls');
    const sel = 'input[placeholder="Where is the work?"]';
    await typeInput(sel, 'Plant published');
    await blur(document.querySelector(sel)!);
    await sleep(120);
    const st = w('jha_documents').map(s => s.payload.status);
    expect(st.length).toBeGreaterThan(0);
    expect(st.every(s => s === 'published')).toBe(true);
  });

  it('F8: new JHA template blur does not insert', async () => {
    harness.tplExists = false;
    await renderRoutes('/jha-templates/new', jtRoutes());
    await waitForText('Max acceptable residual');
    await typeInput('input[placeholder="e.g. Electrical isolation JHA"]', 'Iso pack');
    await blur(document.querySelector('input[placeholder="e.g. Electrical isolation JHA"]')!);
    await blur();
    expect(w('jha_templates')).toEqual([]);
  });

  it('R6: new JHA template Save goes to /jha-templates/:id with no leave dialog', async () => {
    harness.tplExists = false;
    await renderRoutes('/jha-templates/new', jtRoutes());
    await waitForText('Max acceptable residual');
    await typeInput('input[placeholder="e.g. Electrical isolation JHA"]', 'Iso pack');
    const btn = Array.from(document.body.querySelectorAll('button')).find(b => /^\s*Save\s*$/.test(b.textContent || ''));
    if (!btn) throw new Error('missing Save');
    await act(async () => {
      (btn as HTMLButtonElement).click();
    });
    await sleep(400);
    expect(w('jha_templates').some(s => s.op === 'insert')).toBe(true);
    expect(document.body.textContent).not.toContain('Leave without saving?');
    expect(loc()).toMatch(/^\/jha-templates\/new-jha_templates-/);
  });
});
