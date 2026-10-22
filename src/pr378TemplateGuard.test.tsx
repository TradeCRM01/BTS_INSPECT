/** @vitest-environment jsdom */
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

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

vi.mock('./contexts/AuthContext', () => ({
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

vi.mock('./lib/supabase', () => {
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

vi.mock('./lib/useCompanyAiKey', () => ({ useCompanyAiKey: () => ({ hasKey: false }) }));

import App from './App';
import { AppShell } from './components/layout/AppShell';

async function openField(container: HTMLElement) {
  const btn = [...container.querySelectorAll('[data-shell-nav-group="Field"]')][0] as HTMLButtonElement | undefined;
  await act(async () => {
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  return !!btn;
}

async function render(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
  });
  for (let i = 0; i < 60; i += 1) {
    await act(async () => { await new Promise(r => setTimeout(r, 20)); });
    if (container.querySelector('[data-template-access="denied"]')) break;
  }
  return { container, root };
}

const PATHS = ['/templates', '/templates/new', '/templates/abc', '/jha-templates/new', '/jha-templates/abc'];

describe('PR378 probe: template_access=none guard end-to-end', () => {
  for (const path of PATHS) {
    it(`member none: ${path} renders No access`, async () => {
      const { container, root } = await render(
        <MemoryRouter initialEntries={[path]}><App /></MemoryRouter>,
      );
      expect(container.querySelector('[data-template-access="denied"]')).toBeTruthy();
      act(() => { root.unmount(); });
      container.remove();
    }, 20000);
  }

  it('member none: nav has no /templates link; member view: nav has it', async () => {
    auth.profile = { ...auth.profile, template_access: 'none' };
    const noneNav = await render(
      <MemoryRouter initialEntries={['/']}><AppShell><div /></AppShell></MemoryRouter>,
    );
    const openedNone = await openField(noneNav.container);
    const hasTemplatesNone = !!noneNav.container.querySelector('a[href="/templates"]');
    const hasInspectionsNone = !!noneNav.container.querySelector('a[href="/inspections"]');
    act(() => { noneNav.root.unmount(); });
    noneNav.container.remove();

    auth.profile = { ...auth.profile, template_access: 'view' };
    const viewNav = await render(
      <MemoryRouter initialEntries={['/']}><AppShell><div /></AppShell></MemoryRouter>,
    );
    await openField(viewNav.container);
    const hasTemplatesView = !!viewNav.container.querySelector('a[href="/templates"]');
    act(() => { viewNav.root.unmount(); });
    viewNav.container.remove();
    auth.profile = { ...auth.profile, template_access: 'none' };

    expect(openedNone).toBe(true);
    expect(hasInspectionsNone).toBe(true);
    expect(hasTemplatesNone).toBe(false);
    expect(hasTemplatesView).toBe(true);
  }, 20000);
});
