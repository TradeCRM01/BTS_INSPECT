/** @vitest-environment jsdom */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEMPLATE_DELETE_FAILED, TEMPLATE_WRITE_NO_ROW } from './templateAccess';

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const navigate = vi.fn();
const auth = vi.hoisted(() => ({
  profile: {
    id: 'u-admin',
    role: 'admin',
    template_access: 'edit',
    company_id: 'c1',
    name: 'Admin',
  } as Record<string, unknown>,
  company: {
    id: 'c1',
    name: 'Co',
    created_by: 'u-admin',
    access_status: 'active',
    abn: '',
    licence_number: '',
    phone: '',
    email: '',
    website: '',
    default_tax_rate: 10,
    default_material_markup: 0,
    trades: [],
    logo_url: '',
  } as Record<string, unknown>,
}));

const write = vi.hoisted(() => ({
  result: { data: [] as unknown, error: null as { message: string } | null },
}));

const seed = vi.hoisted(() => ({
  rpc: 0,
  insertPayloads: [] as unknown[],
  emptyRenderers: false,
  rpcError: null as { message: string } | null,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-admin' },
    profile: auth.profile,
    company: auth.company,
    loading: false,
    isPlatformOperator: false,
    refreshProfile: async () => {},
    signOut: async () => {},
    session: { access_token: 'x' },
  }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

vi.mock('./supabase', () => {
  const template = {
    id: 'tmpl-1',
    name: 'Board',
    archived: true,
    report_renderer: 'generic_inspection',
    updated_at: '2026-01-01T00:00:00.000Z',
    schema: {
      meta: { requiresSiteName: true, requiresSiteAddress: true, requiresClientName: true, requiresJobNumber: false, customFields: [] },
      sections: [],
    },
    version: 1,
    description: '',
  };
  const jha = {
    ...template,
    id: 'jha-1',
    name: 'Heights',
    schema: {
      meta: {
        requiresTaskName: true, requiresSiteName: true, requiresDate: true, requiresSupervisor: true,
        requiresClient: true, requiresPlantArea: true, requiresShift: true, requiresPermitRefs: true,
        requiresMusterPoint: true, customFields: [], maxAcceptableResidualScore: 9,
      },
      riskLevels: [
        { id: 'low', label: 'Low', color: '#166534', score: 1 },
        { id: 'moderate', label: 'Moderate', color: '#B45309', score: 2 },
      ],
      ppeOptions: [],
      signOffRoles: [{ id: 's', label: 'Supervisor', required: true }],
      stepLibrary: [],
    },
  };
  const renderer = { id: 'r1', key: 'custom_a', label: 'Custom A', built_in: false };

  function chain(table: string) {
    let op = 'select';
    const rows = () => {
      if (op === 'update' || op === 'delete' || op === 'insert') {
        return { data: write.result.data, error: write.result.error };
      }
      if (table === 'templates') return { data: [template], error: null };
      if (table === 'jha_templates') return { data: [jha], error: null };
      if (table === 'inspection_renderers') {
        return { data: seed.emptyRenderers ? [] : [renderer], error: null };
      }
      return { data: [], error: null };
    };
    const api = {
      select() { return api; },
      update() { op = 'update'; return api; },
      delete() { op = 'delete'; return api; },
      insert(payload?: unknown) {
        op = 'insert';
        seed.insertPayloads.push(payload);
        return api;
      },
      eq() { return api; },
      order() { return api; },
      filter() { return api; },
      is() { return api; },
      in() { return api; },
      or() { return api; },
      not() { return api; },
      gte() { return api; },
      lte() { return api; },
      neq() { return api; },
      match() { return api; },
      range() { return api; },
      limit() { return api; },
      maybeSingle() {
        const r = rows();
        const data = Array.isArray(r.data) ? r.data[0] ?? null : r.data;
        return Promise.resolve({ data, error: r.error });
      },
      single() { return Promise.resolve(rows()); },
      then(resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) {
        return Promise.resolve(rows()).then(resolve, reject);
      },
    };
    return api;
  }

  return {
    supabase: {
      from: (table: string) => chain(table),
      rpc: async (name: string) => {
        if (name === 'ensure_builtin_renderers') {
          seed.rpc += 1;
          return { data: null, error: seed.rpcError };
        }
        return { data: null, error: null };
      },
      storage: { from: () => chain('storage') },
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      channel: () => chain('channel'),
      removeChannel: () => {},
    },
  };
});

vi.mock('./useCompanyAiKey', () => ({ useCompanyAiKey: () => ({ hasKey: false }) }));
vi.mock('../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: unknown }) => children,
}));
vi.mock('./companySettingsNav', async () => {
  const actual = await vi.importActual<typeof import('./companySettingsNav')>('./companySettingsNav');
  return {
    ...actual,
    observeCompanySettingsSections: () => () => {},
  };
});

import { TemplateEditorPage } from '../pages/TemplateEditorPage';
import { JhaTemplateEditorPage } from '../pages/JhaTemplateEditorPage';
import { TemplatesPage } from '../pages/TemplatesPage';
import { CompanySettingsPage } from '../pages/CompanySettingsPage';
import { NewInspectionPage } from '../pages/NewInspectionPage';

async function flush(times = 12) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => { await Promise.resolve(); });
  }
}

async function waitFor(assert: () => boolean, label: string | (() => string), tries = 50) {
  for (let i = 0; i < tries; i += 1) {
    if (assert()) return;
    await act(async () => {
      await new Promise<void>(resolve => { setTimeout(resolve, 0); });
    });
  }
  throw new Error(typeof label === 'function' ? label() : label);
}

async function waitForText(container: HTMLElement, needle: string) {
  await waitFor(
    () => (container.textContent || '').includes(needle),
    () => `missing "${needle}": ${(container.textContent || '').slice(0, 400)}`,
  );
}

function setInputValue(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

async function render(ui: ReactElement): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  });
  await flush(16);
  return { container, root };
}

describe('0-row template writes show a visible failure', () => {
  beforeEach(() => {
    navigate.mockReset();
    write.result = { data: [], error: null };
    seed.rpc = 0;
    seed.insertPayloads = [];
    seed.emptyRenderers = false;
    seed.rpcError = null;
    auth.profile.role = 'admin';
    auth.profile.template_access = 'edit';
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('TemplateEditorPage shows the failure and does not say Saved after a 0-row update', async () => {
    const { container, root } = await render(
      <MemoryRouter initialEntries={['/templates/tmpl-1']}>
        <Routes>
          <Route path="/templates/:id" element={<TemplateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitForText(container, 'Save');
    const save = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('Save'));
    expect(save).toBeTruthy();
    await act(async () => { save!.click(); });
    await waitFor(
      () => (container.querySelector('[role="alert"]')?.textContent || '').includes(TEMPLATE_WRITE_NO_ROW),
      () => `missing alert: ${(container.textContent || '').slice(0, 400)}`,
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(TEMPLATE_WRITE_NO_ROW);
    expect(container.textContent).toContain('Error');
    expect(container.textContent).not.toMatch(/\bSaved\b/);
    act(() => { root.unmount(); });
    container.remove();
  });

  it('TemplateEditorPage stays on the page after a 0-row delete', async () => {
    const { container, root } = await render(
      <MemoryRouter initialEntries={['/templates/tmpl-1']}>
        <Routes>
          <Route path="/templates/:id" element={<TemplateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitForText(container, 'Delete');
    const del = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('Delete'));
    expect(del).toBeTruthy();
    await act(async () => { del!.click(); });
    await waitFor(
      () => (container.querySelector('[role="alert"]')?.textContent || '').includes(TEMPLATE_DELETE_FAILED),
      () => `missing alert: ${(container.textContent || '').slice(0, 400)}`,
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(TEMPLATE_DELETE_FAILED);
    expect(container.textContent).not.toContain('Please fix the following before saving');
    expect(navigate).not.toHaveBeenCalledWith('/templates');
    act(() => { root.unmount(); });
    container.remove();
  });

  it('JhaTemplateEditorPage shows the failure and does not say Saved after a 0-row update', async () => {
    const { container, root } = await render(
      <MemoryRouter initialEntries={['/jha-templates/jha-1']}>
        <Routes>
          <Route path="/jha-templates/:id" element={<JhaTemplateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(
      () => [...container.querySelectorAll('button')].some(b => (b.textContent || '').trim() === 'Save'),
      () => `missing Save button: ${(container.textContent || '').slice(0, 400)}`,
    );
    const save = [...container.querySelectorAll('button')].find(b => (b.textContent || '').trim() === 'Save');
    expect(save).toBeTruthy();
    await act(async () => { save!.click(); });
    await waitFor(
      () => (container.querySelector('[role="alert"]')?.textContent || '').includes(TEMPLATE_WRITE_NO_ROW),
      () => `missing alert: ${(container.textContent || '').slice(0, 400)}`,
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(TEMPLATE_WRITE_NO_ROW);
    expect(container.textContent).toContain('Save failed');
    expect(container.textContent).not.toMatch(/\bSaved\b/);
    act(() => { root.unmount(); });
    container.remove();
  });

  it('TemplatesPage shows the failure after a 0-row unarchive', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const archivedRow = {
      id: 'tmpl-1',
      name: 'Board',
      archived: true,
      report_renderer: 'generic_inspection',
      updated_at: '2026-01-01T00:00:00.000Z',
      schema: { meta: {}, sections: [] },
    };
    qc.setQueryData(['templates', false], [archivedRow]);
    qc.setQueryData(['templates', true], [archivedRow]);
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <TemplatesPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await flush(8);
    await waitForText(container, 'View archived templates');
    const archived = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('View archived templates'));
    expect(archived).toBeTruthy();
    await act(async () => { archived!.click(); });
    await waitForText(container, 'Unarchive');
    const unarchive = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('Unarchive'));
    expect(unarchive).toBeTruthy();
    await act(async () => { unarchive!.click(); });
    await waitForText(container, TEMPLATE_WRITE_NO_ROW);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(TEMPLATE_WRITE_NO_ROW);
    act(() => { root.unmount(); });
    container.remove();
  });

  it('CompanySettingsPage shows the failure after a 0-row renderer delete', async () => {
    const { container, root } = await render(
      <MemoryRouter>
        <CompanySettingsPage />
      </MemoryRouter>,
    );
    await waitForText(container, 'Custom A');
    const row = [...container.querySelectorAll('#settings-inspections .hub-company-row')]
      .find(el => (el.textContent || '').includes('Custom A'));
    const trash = row?.querySelector('button');
    expect(trash).toBeTruthy();
    await act(async () => { trash!.click(); });
    await waitFor(
      () => (container.querySelector('[role="alert"]')?.textContent || '').includes(TEMPLATE_WRITE_NO_ROW),
      () => `missing alert: ${(container.textContent || '').slice(0, 400)}`,
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(TEMPLATE_WRITE_NO_ROW);
    act(() => { root.unmount(); });
    container.remove();
  });

  it('JhaTemplateEditorPage shows the failure alert and does not leave after a 0-row delete', async () => {
    const { container, root } = await render(
      <MemoryRouter initialEntries={['/jha-templates/jha-1']}>
        <Routes>
          <Route path="/jha-templates/:id" element={<JhaTemplateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(
      () => !!container.querySelector('button[title="Delete template"]'),
      () => `missing Delete: ${(container.textContent || '').slice(0, 400)}`,
    );
    const del = container.querySelector('button[title="Delete template"]') as HTMLButtonElement | null;
    expect(del).toBeTruthy();
    await act(async () => { del!.click(); });
    await waitFor(
      () => (container.querySelector('[role="alert"]')?.textContent || '').includes(TEMPLATE_WRITE_NO_ROW),
      () => `missing delete alert: ${(container.textContent || '').slice(0, 400)}`,
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(TEMPLATE_WRITE_NO_ROW);
    expect(navigate).not.toHaveBeenCalledWith('/templates');
    act(() => { root.unmount(); });
    container.remove();
  });

  it('TemplatesPage shows the failure after a 0-row JHA unarchive', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const archivedJha = {
      id: 'jha-1',
      name: 'Heights',
      archived: true,
      updated_at: '2026-01-01T00:00:00.000Z',
      schema: { riskLevels: [], ppeOptions: [], signOffRoles: [] },
    };
    qc.setQueryData(['jha-templates', false], [archivedJha]);
    qc.setQueryData(['jha-templates', true], [archivedJha]);
    await act(async () => {
      root.render(
        <QueryClientProvider client={qc}>
          <MemoryRouter>
            <TemplatesPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    await waitForText(container, 'JHA Templates');
    const jhaTab = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('JHA Templates'));
    expect(jhaTab).toBeTruthy();
    await act(async () => { jhaTab!.click(); });
    await waitForText(container, 'View archived templates');
    const archived = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('View archived templates'));
    expect(archived).toBeTruthy();
    await act(async () => { archived!.click(); });
    await waitForText(container, 'Unarchive');
    const unarchive = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('Unarchive'));
    expect(unarchive).toBeTruthy();
    await act(async () => { unarchive!.click(); });
    await waitForText(container, TEMPLATE_WRITE_NO_ROW);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(TEMPLATE_WRITE_NO_ROW);
    act(() => { root.unmount(); });
    container.remove();
  });

  it('CompanySettingsPage shows the failure after a 0-row renderer insert', async () => {
    const { container, root } = await render(
      <MemoryRouter>
        <CompanySettingsPage />
      </MemoryRouter>,
    );
    await waitForText(container, 'Add Type');
    const add = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('Add Type'));
    expect(add).toBeTruthy();
    await act(async () => { add!.click(); });
    await waitFor(
      () => !!container.querySelector('.hub-company-add input'),
      () => `missing add form: ${(container.textContent || '').slice(0, 400)}`,
    );
    const input = container.querySelector('.hub-company-add input') as HTMLInputElement;
    await act(async () => { setInputValue(input, 'Roof Check'); });
    const form = container.querySelector('.hub-company-add') as HTMLFormElement;
    await act(async () => { form.requestSubmit(); });
    await waitFor(
      () => (container.querySelector('[role="alert"]')?.textContent || '').includes(TEMPLATE_WRITE_NO_ROW),
      () => `missing insert alert: ${(container.textContent || '').slice(0, 400)}`,
    );
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(TEMPLATE_WRITE_NO_ROW);
    act(() => { root.unmount(); });
    container.remove();
  });

  it('initializeBuiltInRenderers calls ensure_builtin_renderers and does not insert built-ins', async () => {
    seed.emptyRenderers = true;
    const { container, root } = await render(
      <MemoryRouter initialEntries={['/templates/tmpl-1']}>
        <Routes>
          <Route path="/templates/:id" element={<TemplateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitForText(container, 'Save');
    await waitFor(
      () => seed.rpc >= 1,
      () => `rpc count=${seed.rpc} inserts=${JSON.stringify(seed.insertPayloads)}`,
    );
    expect(seed.rpc).toBeGreaterThanOrEqual(1);
    expect(seed.insertPayloads).toEqual([]);
    act(() => { root.unmount(); });
    container.remove();
  });

  it('K23: a failed delete replaces stale validation errors with the delete copy', async () => {
    const { container, root } = await render(
      <MemoryRouter initialEntries={['/templates/tmpl-1']}>
        <Routes>
          <Route path="/templates/:id" element={<TemplateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitForText(container, 'Save');
    const name = container.querySelector('input[placeholder="Template name"]') as HTMLInputElement;
    expect(name).toBeTruthy();
    await act(async () => { setInputValue(name, ''); });
    const save = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('Save'));
    await act(async () => { save!.click(); });
    await waitForText(container, 'Please fix the following before saving');
    expect(container.textContent).toContain('Template name is required');
    const del = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('Delete'));
    await act(async () => { del!.click(); });
    await waitFor(
      () => (container.textContent || '').includes(TEMPLATE_DELETE_FAILED),
      () => `missing delete copy: ${(container.textContent || '').slice(0, 400)}`,
    );
    expect(container.textContent).not.toContain('Please fix the following before saving');
    expect(container.textContent).not.toContain('Template name is required');
    const alerts = [...container.querySelectorAll('[role="alert"]')];
    expect(alerts.some(el => (el.textContent || '').trim() === TEMPLATE_DELETE_FAILED)).toBe(true);
    expect(alerts.some(el => (el.textContent || '').includes('Please fix the following before saving'))).toBe(false);
    act(() => { root.unmount(); });
    container.remove();
  });

  it('shows the delete-failure copy as its own message', async () => {
    const { container, root } = await render(
      <MemoryRouter initialEntries={['/templates/tmpl-1']}>
        <Routes>
          <Route path="/templates/:id" element={<TemplateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitForText(container, 'Delete');
    const del = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('Delete'));
    await act(async () => { del!.click(); });
    await waitForText(container, TEMPLATE_DELETE_FAILED);
    expect(container.textContent).toContain(TEMPLATE_DELETE_FAILED);
    expect(container.textContent).not.toContain('Please fix the following before saving');
    const alert = [...container.querySelectorAll('[role="alert"]')]
      .find(el => (el.textContent || '').includes(TEMPLATE_DELETE_FAILED));
    expect(alert).toBeTruthy();
    expect((alert!.textContent || '').trim()).toBe(TEMPLATE_DELETE_FAILED);
    act(() => { root.unmount(); });
    container.remove();
  });

  it('logs an ensure_builtin_renderers error once and still renders', async () => {
    seed.emptyRenderers = true;
    seed.rpcError = { message: 'seed failed' };
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container, root } = await render(
      <MemoryRouter initialEntries={['/templates/tmpl-1']}>
        <Routes>
          <Route path="/templates/:id" element={<TemplateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitForText(container, 'Save');
    await waitFor(
      () => seed.rpc >= 1 && logged.mock.calls.length >= 1,
      () => `rpc=${seed.rpc} console.error=${logged.mock.calls.length}`,
    );
    expect(seed.rpc).toBe(1);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(seed.rpcError);
    expect(container.textContent).toContain('Save');
    expect(container.textContent).not.toContain('seed failed');
    logged.mockRestore();
    act(() => { root.unmount(); });
    container.remove();
  });

  it('clears the delete-failure copy on the next successful save', async () => {
    const { container, root } = await render(
      <MemoryRouter initialEntries={['/templates/tmpl-1']}>
        <Routes>
          <Route path="/templates/:id" element={<TemplateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitForText(container, 'Delete');
    const del = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('Delete'));
    await act(async () => { del!.click(); });
    await waitForText(container, TEMPLATE_DELETE_FAILED);
    write.result = { data: [{ id: 'tmpl-1' }], error: null };
    const save = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('Save'));
    await act(async () => { save!.click(); });
    await waitFor(
      () => !(container.textContent || '').includes(TEMPLATE_DELETE_FAILED),
      () => `delete copy still visible: ${(container.textContent || '').slice(0, 400)}`,
    );
    expect(container.textContent).not.toContain(TEMPLATE_DELETE_FAILED);
    act(() => { root.unmount(); });
    container.remove();
  });

  it('clears the delete-failure copy on a later successful delete', async () => {
    const { container, root } = await render(
      <MemoryRouter initialEntries={['/templates/tmpl-1']}>
        <Routes>
          <Route path="/templates/:id" element={<TemplateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitForText(container, 'Delete');
    const del = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('Delete'));
    await act(async () => { del!.click(); });
    await waitForText(container, TEMPLATE_DELETE_FAILED);
    write.result = { data: [{ id: 'tmpl-1' }], error: null };
    await act(async () => { del!.click(); });
    await waitFor(
      () => !(container.textContent || '').includes(TEMPLATE_DELETE_FAILED),
      () => `delete copy still visible: ${(container.textContent || '').slice(0, 400)}`,
    );
    expect(container.textContent).not.toContain(TEMPLATE_DELETE_FAILED);
    expect(navigate).toHaveBeenCalledWith('/templates');
    act(() => { root.unmount(); });
    container.remove();
  });

  it('NewInspectionPage hides Edit the template for a view member', async () => {
    auth.profile.role = 'member';
    auth.profile.template_access = 'view';
    const { container, root } = await render(
      <MemoryRouter initialEntries={['/inspections/new?templateId=tmpl-1']}>
        <NewInspectionPage />
      </MemoryRouter>,
    );
    await waitForText(container, 'Board');
    await waitForText(container, 'Ask someone with edit access');
    expect(container.textContent).toContain('Ask someone with edit access to add questions before starting an inspection.');
    expect(container.textContent).not.toContain('Edit the template');
    act(() => { root.unmount(); });
    container.remove();
  });
});
