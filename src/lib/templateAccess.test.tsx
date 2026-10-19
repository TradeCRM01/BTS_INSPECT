/** @vitest-environment jsdom */
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import {
  TEMPLATE_ACCESS_DENIED_TITLE,
  TEMPLATE_WRITE_NO_ROW,
  canEditTemplates,
  canViewTemplates,
  throwIfNoRows,
} from './templateAccess';

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const auth = vi.hoisted(() => ({
  profile: {
    id: 'u-member',
    role: 'member',
    template_access: 'none',
    company_id: 'c1',
    name: 'M',
  } as Record<string, unknown>,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u-member' },
    profile: auth.profile,
    company: { id: 'c1', name: 'Co', created_by: 'u-owner', access_status: 'active' },
    loading: false,
    isPlatformOperator: false,
    refreshProfile: async () => {},
    signOut: async () => {},
    session: { access_token: 'x' },
  }),
  AuthProvider: ({ children }: { children: unknown }) => children,
}));

vi.mock('./supabase', () => {
  let chain: unknown;
  chain = new Proxy(function chainFn() { return chain; }, {
    get: (_target, key) => (key === 'then'
      ? (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 0 })
      : chain),
    apply: () => chain,
  });
  return {
    supabase: {
      from: () => chain,
      rpc: async () => ({ data: [], error: null }),
      storage: { from: () => chain },
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
      channel: () => chain,
      removeChannel: () => {},
    },
  };
});

vi.mock('./useCompanyAiKey', () => ({ useCompanyAiKey: () => ({ hasKey: false }) }));

import { TemplateAccessRoute } from '../components/layout/TemplateAccessRoute';
import { TemplatesPage } from '../pages/TemplatesPage';
import { TemplateEditorPage } from '../pages/TemplateEditorPage';
import { JhaTemplateEditorPage } from '../pages/JhaTemplateEditorPage';

async function render(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  });
  for (let i = 0; i < 40; i += 1) {
    if (container.querySelector('[data-template-access="denied"]')) break;
    await act(async () => { await Promise.resolve(); });
  }
  return { container, root };
}

describe('canViewTemplates', () => {
  it('allows admins and view/edit, and blocks none', () => {
    expect(canViewTemplates({ role: 'admin', template_access: 'none' })).toBe(true);
    expect(canViewTemplates({ role: 'member', template_access: 'view' })).toBe(true);
    expect(canViewTemplates({ role: 'member', template_access: 'edit' })).toBe(true);
    expect(canViewTemplates({ role: 'member', template_access: 'none' })).toBe(false);
    expect(canViewTemplates({ role: 'member', template_access: null })).toBe(false);
  });
});

describe('throwIfNoRows', () => {
  it('throws the visible failure text on a silent 0-row write', () => {
    expect(() => throwIfNoRows({ data: [], error: null })).toThrow(TEMPLATE_WRITE_NO_ROW);
    expect(() => throwIfNoRows({ data: null, error: null })).toThrow(TEMPLATE_WRITE_NO_ROW);
    expect(() => throwIfNoRows({ data: null, error: { message: 'new row violates row-level security policy' } }))
      .toThrow('new row violates row-level security policy');
    expect(() => throwIfNoRows({ data: [{ id: 't1' }], error: null })).not.toThrow();
  });
});

describe('canEditTemplates', () => {
  it('allows admins and edit, and blocks view/none', () => {
    expect(canEditTemplates({ role: 'admin', template_access: 'view' })).toBe(true);
    expect(canEditTemplates({ role: 'member', template_access: 'edit' })).toBe(true);
    expect(canEditTemplates({ role: 'member', template_access: 'view' })).toBe(false);
    expect(canEditTemplates({ role: 'member', template_access: 'none' })).toBe(false);
  });
});

describe('template guards render as a none member', () => {
  it('TemplateAccessRoute denies and hides children', async () => {
    const { container, root } = await render(
      <MemoryRouter>
        <TemplateAccessRoute>
          <div data-templates-passed>passed</div>
        </TemplateAccessRoute>
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-template-access="denied"]')).toBeTruthy();
    expect(container.textContent).toContain(TEMPLATE_ACCESS_DENIED_TITLE);
    expect(container.querySelector('[data-templates-passed]')).toBeNull();
    act(() => { root.unmount(); });
    container.remove();
  });

  it('TemplatesPage renders No access', async () => {
    const { container, root } = await render(
      <MemoryRouter>
        <TemplatesPage />
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-template-access="denied"]')).toBeTruthy();
    expect(container.textContent).toContain(TEMPLATE_ACCESS_DENIED_TITLE);
    expect(container.textContent).not.toContain('Build and manage your inspection and JHA templates');
    act(() => { root.unmount(); });
    container.remove();
  });

  it('TemplateEditorPage renders No access', async () => {
    const { container, root } = await render(
      <MemoryRouter initialEntries={['/templates/abc']}>
        <Routes>
          <Route path="/templates/:id" element={<TemplateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-template-access="denied"]')).toBeTruthy();
    expect(container.textContent).toContain(TEMPLATE_ACCESS_DENIED_TITLE);
    act(() => { root.unmount(); });
    container.remove();
  });

  it('TemplateEditorPage is read-only for a view member', async () => {
    auth.profile.template_access = 'view';
    auth.profile.role = 'member';
    const { container, root } = await render(
      <MemoryRouter initialEntries={['/templates/abc']}>
        <Routes>
          <Route path="/templates/:id" element={<TemplateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain('No edit access');
    expect(container.textContent).not.toContain('Saved');
    act(() => { root.unmount(); });
    container.remove();
    auth.profile.template_access = 'none';
  });

  it('JhaTemplateEditorPage is read-only for a view member', async () => {
    auth.profile.template_access = 'view';
    auth.profile.role = 'member';
    const { container, root } = await render(
      <MemoryRouter initialEntries={['/jha-templates/abc']}>
        <Routes>
          <Route path="/jha-templates/:id" element={<JhaTemplateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.textContent).toContain('No edit access');
    expect(container.textContent).not.toContain('Saved');
    expect([...container.querySelectorAll('button')].some(b => (b.textContent || '').trim() === 'Save')).toBe(false);
    act(() => { root.unmount(); });
    container.remove();
    auth.profile.template_access = 'none';
  });

  it('JhaTemplateEditorPage renders No access', async () => {
    const { container, root } = await render(
      <MemoryRouter initialEntries={['/jha-templates/abc']}>
        <Routes>
          <Route path="/jha-templates/:id" element={<JhaTemplateEditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.querySelector('[data-template-access="denied"]')).toBeTruthy();
    expect(container.textContent).toContain(TEMPLATE_ACCESS_DENIED_TITLE);
    act(() => { root.unmount(); });
    container.remove();
  });
});
