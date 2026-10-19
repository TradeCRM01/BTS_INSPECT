/** @vitest-environment jsdom */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TEMPLATE_WRITE_NO_ROW } from './templateAccess';

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
      if (table === 'inspection_renderers') return { data: [renderer], error: null };
      return { data: [], error: null };
    };
    const api = {
      select() { return api; },
      update() { op = 'update'; return api; },
      delete() { op = 'delete'; return api; },
      insert() { op = 'insert'; return api; },
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
      rpc: async () => ({ data: [], error: null }),
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

async function waitForText(container: HTMLElement, needle: string, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    if ((container.textContent || '').includes(needle)) return;
    await flush(2);
  }
  throw new Error(`missing "${needle}": ${(container.textContent || '').slice(0, 400)}`);
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
    const save = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('Save'));
    expect(save).toBeTruthy();
    await act(async () => { save!.click(); });
    await flush(20);
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
    const del = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('Delete'));
    expect(del).toBeTruthy();
    await act(async () => { del!.click(); });
    await flush(20);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(TEMPLATE_WRITE_NO_ROW);
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
    await waitForText(container, 'Save');
    const save = [...container.querySelectorAll('button')].find(b => (b.textContent || '').includes('Save'));
    expect(save).toBeTruthy();
    await act(async () => { save!.click(); });
    await flush(20);
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
    await flush(20);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(TEMPLATE_WRITE_NO_ROW);
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
    await flush(16);
    expect(container.textContent).not.toContain('Edit the template');
    act(() => { root.unmount(); });
    container.remove();
  });
});
