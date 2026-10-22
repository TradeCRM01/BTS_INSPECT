/**
 * @vitest-environment jsdom
 *
 * Not a kill. The report_theme kill is src/components/layout/s2Shell.chromium.kill.tsx
 * (painted background-color on header, tab bar, avatar against built dist CSS).
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from './AppShell';

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { name: 'Field Audit', role: 'admin', company_id: 'c1' },
    company: {
      name: 'Northside Plumbing & Gas Maintenance Services Pty Ltd',
      report_theme: { navy: '#FF0000', accent: '#00FF00' },
    },
    signOut: async () => {},
    isPlatformOperator: false,
  }),
}));

vi.mock('../../lib/useCompanyAiKey', () => ({
  useCompanyAiKey: () => ({ ready: true, hasKey: false }),
}));

vi.mock('../ui/DevConsole', () => ({
  DevConsole: () => null,
}));

vi.mock('../../lib/supabase', () => {
  let chain: unknown;
  chain = new Proxy(function chainFn() { return chain; }, {
    get: (_target, key) => (key === 'then'
      ? (resolveThen: (v: unknown) => void) => resolveThen({ data: [], error: null, count: 0 })
      : chain),
    apply: () => chain,
  });
  return {
    supabase: {
      from: () => chain,
      rpc: async () => ({ data: [], error: null }),
      auth: {
        getSession: async () => ({ data: { session: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
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

describe('report_theme jsdom harness (not a kill; Chromium suite owns the kill)', () => {
  it('mounts AppShell with a header (not a kill)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/jobs']}>
            <AppShell>
              <div>child</div>
            </AppShell>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    expect(container.querySelector('.shell-header')).not.toBeNull();
  });
});
