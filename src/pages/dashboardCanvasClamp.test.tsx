/**
 * @vitest-environment jsdom
 * Render-time 1024/800 canvas clamp. Mutant: drop clampDashboardWidgetsToCanvas from the page.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui';
import { DashboardPage } from './DashboardPage';

vi.mock('../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div data-app-shell="1">{children}</div>,
}));

vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: {
      id: '00000000-0000-0000-0000-000000000002',
      company_id: '00000000-0000-0000-0000-000000000001',
      name: 'QA',
      role: 'admin',
      email: 'qa@example.com',
    },
    company: { id: '00000000-0000-0000-0000-000000000001', name: 'QA Co' },
  }),
}));

vi.mock('../lib/supabase', () => {
  function builder() {
    const promise = Promise.resolve({ data: [], error: null });
    const query: Record<string, unknown> = {};
    const chain = () => query;
    query.select = chain;
    query.order = chain;
    query.eq = chain;
    query.in = chain;
    query.gte = chain;
    query.lte = chain;
    query.limit = chain;
    query.or = chain;
    query.update = chain;
    query.insert = chain;
    query.delete = chain;
    query.maybeSingle = () => promise;
    query.single = () => promise;
    query.then = (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      promise.then(onFulfilled, onRejected);
    return query;
  }
  return {
    supabase: {
      from: () => builder(),
      rpc: async () => ({ data: [], error: null }),
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get() { return 910; },
  });
  vi.stubGlobal('ResizeObserver', class {
    cb: () => void;
    constructor(cb: () => void) { this.cb = cb; }
    observe() { this.cb(); }
    disconnect() {}
    unobserve() {}
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function tick() {
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
}

async function waitFor(fn: () => boolean, what: string) {
  const started = Date.now();
  while (Date.now() - started < 4000) {
    if (fn()) return;
    await tick();
  }
  throw new Error(`timeout ${what}`);
}

describe('dashboard canvas clamp', () => {
  it('DashboardPage clamps display widgets to the measured canvas in view and edit', () => {
    const page = readFileSync(resolve(process.cwd(), 'src/pages/DashboardPage.tsx'), 'utf8');
    expect(page).toContain('clampDashboardWidgetsToCanvas(widgets ?? [], canvasW)');
    expect(page).toContain('displayWidgets.map(w =>');
    expect(page).toContain('sortDashboardWidgetsForView(displayWidgets)');
    expect(page).not.toContain('{(widgets ?? []).map(w => (\n                            <FreeWidget');
  });

  it('renders look Compliance inside a 910 canvas; removing the clamp fails this', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      root.render(
        <QueryClientProvider client={client}>
          <ToastProvider>
            <MemoryRouter initialEntries={['/?look=dashboard']}>
              <DashboardPage />
            </MemoryRouter>
          </ToastProvider>
        </QueryClientProvider>,
      );
    });
    await waitFor(() => !!document.querySelector('[data-dashboard-widgets="1"]'), 'widgets');
    const more = document.querySelector('.dashboard-home-more > summary') as HTMLElement;
    await act(async () => { more.click(); });
    const customize = [...document.querySelectorAll('[role="menuitem"]')].find(el => el.textContent === 'Customize') as HTMLElement;
    await act(async () => { customize.click(); });
    await waitFor(() => !!document.querySelector('.dashboard-home-canvas [data-dashboard-widget-id="look-widget-compliance"]'), 'canvas compliance');
    const el = document.querySelector('.dashboard-home-canvas [data-dashboard-widget-id="look-widget-compliance"]') as HTMLElement;
    const left = parseFloat(el.style.left);
    const width = parseFloat(el.style.width);
    expect(left + width).toBeLessThanOrEqual(910);
    expect(width).toBeLessThan(320);
  });
});
