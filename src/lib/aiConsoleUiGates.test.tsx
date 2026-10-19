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
import { AiAgentWidget, AgentActivityWidget } from '../widgets/IntelligenceWidgets';
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

  async function renderShell() {
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
  }

  async function openAvatarMenu() {
    const name = auth.profile?.name ?? '';
    const avatar = [...container.querySelectorAll('button')].find((b) => {
      const text = b.textContent ?? '';
      return text.includes(name) && text.includes(name.charAt(0).toUpperCase());
    });
    expect(avatar, 'avatar menu button').toBeTruthy();
    await act(async () => {
      avatar!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  async function openPhoneMore() {
    const more = container.querySelector('button[data-phone-tab][aria-expanded]');
    expect(more, 'phone More tab').toBeTruthy();
    await act(async () => {
      more!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
  }

  function aiHrefs(root: ParentNode = container) {
    return [...root.querySelectorAll('a')]
      .map((a) => a.getAttribute('href') ?? '')
      .filter((href) => href === '/assistant' || href === '/settings/ai' || href === '/ai-console');
  }

  function phoneMenu() {
    const el = container.querySelector('.shell-phone-menu');
    expect(el, 'phone More menu .shell-phone-menu').toBeTruthy();
    return el as HTMLElement;
  }

  it('G04-G09 customer admin sees 0 AI links after avatar and More open', async () => {
    await renderShell();
    await openAvatarMenu();
    expect(aiHrefs()).toEqual([]);
    await openPhoneMore();
    expect(aiHrefs(phoneMenu())).toEqual([]);
    expect(container.textContent).not.toContain('AI Settings');
    expect(container.textContent).not.toContain('AI Assistant');
    expect(container.textContent).not.toContain('AI Console');
  });

  it('G04-G09 operator sees the 3 AI links in the avatar menu and the More tab', async () => {
    auth.isPlatformOperator = true;
    auth.profile = { role: 'admin', name: 'Op' };
    await renderShell();
    await openAvatarMenu();
    expect(new Set(aiHrefs())).toEqual(new Set(['/assistant', '/settings/ai', '/ai-console']));
    expect(container.textContent).toContain('AI Settings');
    expect(container.textContent).toContain('AI Assistant');
    expect(container.textContent).toContain('AI Console');
    await openPhoneMore();
    expect(new Set(aiHrefs(phoneMenu()))).toEqual(new Set(['/assistant', '/settings/ai', '/ai-console']));
  });

  it('G10 customer admin dashboard agent widget is Coming soon, not chat', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <AiAgentWidget config={{}} />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    expect(container.textContent).toContain('Coming soon');
    expect(container.textContent).not.toContain('What needs my attention today?');
  });

  it('G11 customer admin agent activity widget is Coming soon', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <AgentActivityWidget />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    expect(container.textContent).toContain('Coming soon');
    expect(container.textContent).not.toContain('Agent activity appears after a company AI key is set.');
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
