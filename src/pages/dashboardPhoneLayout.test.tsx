/**
 * @vitest-environment jsdom
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui';
import { swapAdjacentDashboardWidgetPhoneOrder } from '../lib/dashboardWidgetView';
import { DashboardPage, DashboardPhoneEditStack } from './DashboardPage';

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

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

function lookCss(): string {
  const css = src('src/index.css');
  const lookStart = css.indexOf('/* Signed-in home / only.');
  const lookEnd = css.indexOf('/* Field Work inspections list only.', lookStart);
  return css.slice(lookStart, lookEnd);
}

function ruleBeforeMedia(css: string, selector: string, media: string): string {
  const start = css.indexOf(`${selector} {`);
  expect(start).toBeGreaterThan(-1);
  const mediaAt = css.indexOf(media, start);
  const end = mediaAt === -1 ? css.length : mediaAt;
  return css.slice(start, end);
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

async function renderDashboard() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
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
}

async function waitForSelector(selector: string) {
  const started = Date.now();
  while (Date.now() - started < 4000) {
    if (document.querySelector(selector)) return;
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
    });
  }
  throw new Error(`timed out waiting for ${selector}: ${document.body.textContent?.slice(0, 400)}`);
}

async function enterCustomize() {
  const more = document.querySelector('.dashboard-home-more > summary') as HTMLElement | null;
  expect(more).toBeTruthy();
  await act(async () => {
    more!.click();
  });
  const customize = [...document.querySelectorAll('[role="menuitem"]')].find(
    el => el.textContent === 'Customize',
  ) as HTMLElement | undefined;
  expect(customize).toBeTruthy();
  await act(async () => {
    customize!.click();
  });
}

function phoneStack(): HTMLElement {
  const stack = document.querySelector('[data-dashboard-phone-stack="1"]') as HTMLElement | null;
  expect(stack).toBeTruthy();
  return stack!;
}

function phoneWidgetIds(): string[] {
  return [...phoneStack().querySelectorAll('[data-dashboard-widget-id]')].map(
    el => el.getAttribute('data-dashboard-widget-id') ?? '',
  );
}

describe('dashboard phone layout', () => {
  it('keeps the phone view grid able to shrink so widgets cannot force sideways overflow', () => {
    const css = lookCss();
    const view = ruleBeforeMedia(css, '.dashboard-home-view-grid', '@media (min-width: 640px)');
    expect(view).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(view).not.toMatch(/grid-template-columns:\s*1fr;/);
    expect(view).toMatch(/gap:\s*20px/);
    const mdBlock = css.slice(css.indexOf('@media (min-width: 640px)'));
    const mdViewStart = mdBlock.indexOf('.dashboard-home-view-grid {');
    const mdView = mdBlock.slice(mdViewStart, mdBlock.indexOf('}', mdViewStart) + 1);
    expect(mdView).toMatch(/gap:\s*16px/);
    const stack = css.slice(css.indexOf('.dashboard-home-widget-stack {'));
    const stackRule = stack.slice(0, stack.indexOf('}') + 1);
    expect(stackRule).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    expect(stackRule).not.toMatch(/grid-template-columns:\s*1fr;/);
    expect(stackRule).toMatch(/gap:\s*20px/);
    const stackInkStart = css.indexOf('.dashboard-home-widget-stack .dashboard-home-widget-ink {');
    const stackInk = css.slice(stackInkStart, css.indexOf('}', stackInkStart) + 1);
    expect(stackInk).toMatch(/height:\s*auto/);
    expect(stackInk).not.toMatch(/height:\s*100%/);
  });

  it('renders phone widgets inside a shrinking grid on the look dashboard', async () => {
    await renderDashboard();
    await waitForSelector('[data-dashboard-view-grid="1"]');
    const grid = document.querySelector('[data-dashboard-view-grid="1"]') as HTMLElement;
    expect(grid.className.split(/\s+/)).toContain('min-w-0');
    const cards = [...grid.querySelectorAll('.dashboard-home-widget')];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.className.split(/\s+/)).toContain('min-w-0');
    }
  });

  it('shows tappable remove and reorder controls on the phone customize stack', async () => {
    await renderDashboard();
    await waitForSelector('[data-dashboard-widgets="1"]');
    await enterCustomize();
    const stack = phoneStack();
    expect(stack.className.split(/\s+/)).toContain('md:hidden');
    expect(stack.className.split(/\s+/)).not.toContain('hidden');
    const remove = [...stack.querySelectorAll('button[aria-label^="Remove "]')] as HTMLButtonElement[];
    const up = [...stack.querySelectorAll('button[aria-label^="Move "][aria-label$=" up"]')] as HTMLButtonElement[];
    const down = [...stack.querySelectorAll('button[aria-label^="Move "][aria-label$=" down"]')] as HTMLButtonElement[];
    expect(remove.length).toBeGreaterThan(0);
    expect(up.length).toBe(remove.length);
    expect(down.length).toBe(remove.length);
    expect(remove.some(btn => btn.getAttribute('aria-label') === 'Remove Outstanding Invoices')).toBe(true);
    expect(up.some(btn => btn.getAttribute('aria-label') === 'Move Upcoming Jobs up')).toBe(true);
    const css = lookCss();
    expect(css).toContain('.dashboard-home-phone-edit-bar button');
    expect(css).toMatch(/\.dashboard-home-phone-edit-bar button[\s\S]*min-height:\s*44px/);
    expect(css).toMatch(/\.dashboard-home-phone-edit-bar button[\s\S]*min-width:\s*44px/);
  });

  it('removes a widget from the phone customize stack', async () => {
    await act(async () => {
      root.render(<PhoneStackHarness />);
    });
    const before = phoneWidgetIds();
    expect(before).toEqual(['a', 'b', 'c']);
    const remove = phoneStack().querySelector(
      '[data-dashboard-widget-id="a"] button[aria-label="Remove Upcoming Jobs"]',
    ) as HTMLButtonElement | null;
    expect(remove).toBeTruthy();
    await act(async () => {
      remove!.click();
    });
    expect(phoneWidgetIds()).toEqual(['b', 'c']);
  });

  it('reorders widgets with the phone up and down controls', async () => {
    await act(async () => {
      root.render(<PhoneStackHarness />);
    });
    const down = phoneStack().querySelector(
      '[data-dashboard-widget-id="a"] button[aria-label="Move Upcoming Jobs down"]',
    ) as HTMLButtonElement | null;
    expect(down).toBeTruthy();
    await act(async () => {
      down!.click();
    });
    expect(phoneWidgetIds()).toEqual(['b', 'a', 'c']);
    const up = phoneStack().querySelector(
      '[data-dashboard-widget-id="a"] button[aria-label="Move Upcoming Jobs up"]',
    ) as HTMLButtonElement | null;
    expect(up).toBeTruthy();
    await act(async () => {
      up!.click();
    });
    expect(phoneWidgetIds()).toEqual(['a', 'b', 'c']);
  });

  it('uses the same order for phone view and Customize, including after a move', async () => {
    await renderDashboard();
    await waitForSelector('[data-dashboard-view-grid="1"]');
    const viewIds = () => [...document.querySelectorAll('[data-dashboard-view-grid="1"] [data-dashboard-widget-id]')].map(
      el => el.getAttribute('data-dashboard-widget-id') ?? '',
    );
    expect(viewIds()).toEqual([
      'look-widget-outstanding-invoices',
      'look-widget-upcoming-jobs',
      'look-widget-compliance',
    ]);
    await enterCustomize();
    expect(phoneWidgetIds()).toEqual([
      'look-widget-outstanding-invoices',
      'look-widget-upcoming-jobs',
      'look-widget-compliance',
    ]);
    const down = phoneStack().querySelector(
      '[data-dashboard-widget-id="look-widget-outstanding-invoices"] button[aria-label="Move Outstanding Invoices down"]',
    ) as HTMLButtonElement | null;
    expect(down).toBeTruthy();
    await act(async () => {
      down!.click();
      await new Promise(resolve => setTimeout(resolve, 30));
    });
    expect(phoneWidgetIds()).toEqual([
      'look-widget-upcoming-jobs',
      'look-widget-outstanding-invoices',
      'look-widget-compliance',
    ]);
    const more = document.querySelector('.dashboard-home-more > summary') as HTMLElement;
    await act(async () => {
      more.click();
    });
    const done = [...document.querySelectorAll('[role="menuitem"]')].find(
      el => el.textContent === 'Done editing',
    ) as HTMLElement;
    await act(async () => {
      done.click();
    });
    await waitForSelector('[data-dashboard-view-grid="1"]');
    expect(viewIds()).toEqual([
      'look-widget-upcoming-jobs',
      'look-widget-outstanding-invoices',
      'look-widget-compliance',
    ]);
  });
});

const SAMPLE_PHONE_WIDGETS = [
  { id: 'a', widget_type: 'upcoming_jobs', grid_x: 20, grid_y: 20, grid_w: 390, grid_h: 180, config: {} },
  { id: 'b', widget_type: 'weather', grid_x: 20, grid_y: 200, grid_w: 260, grid_h: 180, config: {} },
  { id: 'c', widget_type: 'clock', grid_x: 20, grid_y: 400, grid_w: 260, grid_h: 180, config: {} },
];

function PhoneStackHarness() {
  const [widgets, setWidgets] = useState(SAMPLE_PHONE_WIDGETS);
  return (
    <DashboardPhoneEditStack
      widgets={widgets}
      onMove={(id, direction) => {
        setWidgets(current => swapAdjacentDashboardWidgetPhoneOrder(current, id, direction));
      }}
      onRemove={id => {
        setWidgets(current => current.filter(row => row.id !== id));
      }}
    >
      {widget => <span>{widget.id}</span>}
    </DashboardPhoneEditStack>
  );
}
