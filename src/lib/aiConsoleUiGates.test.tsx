/**
 * @vitest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperatorOnlyPage } from '../components/layout/OperatorRoute';
import { AiAssistantPage } from '../pages/AiAssistantPage';
import { AppShell } from '../components/layout/AppShell';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../components/ui/LoadingSpinner', () => ({
  LoadingSpinner: () => <div>loading</div>,
}));

const auth = vi.hoisted(() => ({
  isPlatformOperator: false,
  loading: false,
  profile: { role: 'admin', name: 'Cust' } as { role: string; name: string } | null,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    isPlatformOperator: auth.isPlatformOperator,
    loading: auth.loading,
    profile: auth.profile,
    company: { name: 'Alpha' },
    session: null,
    signOut: async () => {},
  }),
}));

vi.mock('../lib/useCompanyAiKey', () => ({
  useCompanyAiKey: () => ({ ready: true, hasKey: true }),
}));

vi.mock('../components/ui/DevConsole', () => ({ DevConsole: () => null }));
vi.mock('../components/search/GlobalSearch', () => ({ GlobalSearch: () => null }));

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  auth.isPlatformOperator = false;
  auth.loading = false;
  auth.profile = { role: 'admin', name: 'Cust' };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('M45 to M48 UI gates', () => {
  it('M45 OperatorOnlyPage redirects a customer admin away from the console', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/ai-console']}>
          <Routes>
            <Route path="/" element={<div>Dashboard</div>} />
            <Route path="/ai-console" element={<OperatorOnlyPage><div>Console secret</div></OperatorOnlyPage>} />
          </Routes>
        </MemoryRouter>,
      );
    });
    expect(container.textContent).toContain('Dashboard');
    expect(container.textContent).not.toContain('Console secret');
  });

  it('M47 customer admin sees Coming soon for AI chat, not the composer', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <AiAssistantPage />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    expect(container.textContent).toContain('Coming soon');
    expect(container.textContent).not.toContain('How do I create a new inspection template?');
  });

  it('M48 AppShell hides AI nav from a customer admin', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <AppShell>
              <div>child</div>
            </AppShell>
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    const toggle = container.querySelector('button.md\\:hidden, button[aria-label]')
      ?? [...container.querySelectorAll('button')].find((b) => b.innerHTML.includes('Menu') || b.querySelector('svg'));
    if (toggle) {
      await act(async () => {
        toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
    const text = container.textContent ?? '';
    expect(text).not.toContain('AI Console');
    expect(text).not.toContain('AI Settings');
    expect(text).not.toContain('AI Assistant');
  });

  it('M46 operator can open the operator-only page', async () => {
    auth.isPlatformOperator = true;
    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/ai-console']}>
          <Routes>
            <Route path="/" element={<div>Dashboard</div>} />
            <Route path="/ai-console" element={<OperatorOnlyPage><div>Console secret</div></OperatorOnlyPage>} />
          </Routes>
        </MemoryRouter>,
      );
    });
    expect(container.textContent).toContain('Console secret');
  });
});
