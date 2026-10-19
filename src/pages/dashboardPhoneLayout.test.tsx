/**
 * @vitest-environment jsdom
 */
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui';
import { swapAdjacentDashboardWidgetPhoneOrder } from '../lib/dashboardWidgetView';
import { DashboardPage, DashboardPhoneEditStack } from './DashboardPage';
import {
  closeDashboardLookServer,
  measureDashboardLook,
} from './dashboardPhoneRenderedHarness';

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

function phoneViewTracks(report: Awaited<ReturnType<typeof measureDashboardLook>>) {
  return report.viewTracks.filter(rule => !/min-width:\s*640px|min-width:\s*1024px|min-width:\s*1280px/.test(rule.media));
}

describe('dashboard phone rendered layout', () => {
  afterAll(async () => {
    await closeDashboardLookServer();
  });

  it('keeps every phone widget and its text inside the sheet at 375 and 390', async () => {
    for (const width of [375, 390]) {
      const report = await measureDashboardLook(width, { look: 'dashboard-repro', overflowProbe: true });
      expect(report.cardCount, `${width} cards`).toBeGreaterThan(0);
      expect(report.maxCardRight, `${width} card right ${report.maxCardRight} vs sheet ${report.innerRight}`).toBeLessThanOrEqual(report.innerRight + 0.5);
      expect(report.overflowCards, `${width} overflowing cards`).toBe(0);
      expect(report.overflowTexts, `${width} text past sheet ${JSON.stringify(report.overflowTexts)}`).toEqual([]);
      const tracks = phoneViewTracks(report);
      const minmax = /minmax\(\s*0(?:px)?\s*,\s*1fr\s*\)/;
      expect(tracks.some(rule => minmax.test(rule.cols)), `${width} view tracks ${JSON.stringify(tracks)}`).toBe(true);
      expect(tracks.every(rule => rule.cols !== '1fr'), `${width} 1fr track ${JSON.stringify(tracks)}`).toBe(true);
      expect(report.stackTracks.some(rule => minmax.test(rule.cols)), `${width} stack tracks ${JSON.stringify(report.stackTracks)}`).toBe(true);
    }
  }, 120_000);

  it('measures the real 20px phone gap and 16px desktop/tablet gaps in view mode', async () => {
    for (const width of [375, 390]) {
      const report = await measureDashboardLook(width);
      expect(report.viewGap, `${width} view gap`).toBe('20px');
      const vGaps = report.neighbourGaps.filter(g => g.kind === 'v').map(g => g.gap);
      expect(vGaps.length, `${width} vertical neighbours`).toBeGreaterThan(0);
      for (const gap of vGaps) expect(gap, `${width} view neighbour ${gap}`).toBeCloseTo(20, 0);
    }
    for (const width of [800, 1024, 1280]) {
      const report = await measureDashboardLook(width);
      expect(report.viewGap, `${width} view gap`).toBe('16px');
      const gaps = report.neighbourGaps.map(g => g.gap);
      expect(gaps.length, `${width} neighbours`).toBeGreaterThan(0);
      for (const gap of gaps) expect(gap, `${width} view neighbour ${gap}`).toBeCloseTo(16, 0);
    }
  }, 120_000);

  it('keeps Customize neighbour gaps at the phone 20px gutter and the desktop 16px gutter', async () => {
    for (const width of [375, 390]) {
      const report = await measureDashboardLook(width, { edit: true });
      expect(report.stackGap, `${width} stack gap`).toBe('20px');
      expect(report.minNeighbour, `${width} min neighbour`).toBeGreaterThanOrEqual(20);
      const vGaps = report.neighbourGaps.filter(g => g.kind === 'v').map(g => g.gap);
      expect(vGaps.length, `${width} stack neighbours`).toBeGreaterThan(0);
      for (const gap of vGaps) expect(gap, `${width} stack neighbour ${gap}`).toBeCloseTo(20, 0);
    }
    for (const width of [800, 1024, 1280]) {
      const report = await measureDashboardLook(width, { edit: true });
      expect(report.minNeighbour, `${width} customize min neighbour`).toBeGreaterThanOrEqual(16);
    }
  }, 120_000);
});

describe('dashboard phone layout', () => {

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
