/**
 * @vitest-environment jsdom
 * Adopted from the PR377 precheck probe
 * (/cursor/stores/store-70579235-acee-4ad5-8740-cf36a4816b65/handoff/pr377/pr377PhonePersist.probe.test.tsx,
 * sha256 ca739b26a0cb2b4362d69fd25693d789a094f23bc4a080b42eaff90f093d3487).
 * Real DashboardPage, NOT look/audit mode, so the phone Customize controls run the production
 * write path against a mocked Supabase client. Payloads are config.phone_order (not grid_x/y)
 * so a phone reorder cannot rewrite the desktop canvas.
 */
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui';
import { DASHBOARD_WIDGET_GAP, dashboardWidgetLayoutOverlaps, dashboardWidgetMinNeighborGap, repairDashboardWidgetLayout, type DashboardWidgetRect } from '../lib/dashboardWidgets';
import { DashboardPage } from './DashboardPage';

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]>; order: string[] };
const h = vi.hoisted(() => ({
  calls: [] as Call[],
  failOp: null as null | 'update' | 'delete',
  failIds: new Set<string>(),
  emptyWrite: false,
  loads: 0,
  orderKeys: [] as string[][],
  rows: [] as Array<Record<string, unknown>>,
  onDragEnd: null as null | ((event: { active: { id: string }; delta: { x: number; y: number } }) => void),
}));

vi.mock('@dnd-kit/core', async () => {
  const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core');
  return {
    ...actual,
    DndContext: (props: React.ComponentProps<typeof actual.DndContext>) => {
      h.onDragEnd = props.onDragEnd as typeof h.onDragEnd;
      return React.createElement(actual.DndContext, props);
    },
  };
});

vi.mock('../components/layout/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    profile: { id: 'u-1', company_id: 'c-1', name: 'QA', role: 'admin', email: 'qa@example.com' },
    company: { id: 'c-1', name: 'QA Co' },
  }),
}));
vi.mock('../lib/supabase', () => {
  function builder(table: string) {
    const call: Call = { table, op: 'select', filters: [], order: [] };
    const result = () => {
      if (call.op === 'update' || call.op === 'delete' || call.op === 'insert') h.calls.push(call);
      const id = call.filters.find(f => f[0] === 'id')?.[1] as string | undefined;
      if (
        table === 'dashboard_widgets'
        && call.op !== 'select'
        && (
          (h.failOp && call.op === h.failOp)
          || (id && h.failIds.has(id) && call.op === 'update')
        )
      ) {
        return Promise.resolve({ data: null, error: { message: 'probe forced failure', code: 'XX000' } });
      }
      if (table === 'dashboard_widgets' && (call.op === 'update' || call.op === 'delete') && h.emptyWrite) {
        return Promise.resolve({ data: [], error: null, count: 0 });
      }
      if (table === 'dashboard_widgets' && call.op === 'update') {
        const row = h.rows.find(r => r.id === id);
        if (row && call.payload && typeof call.payload === 'object') {
          Object.assign(row, JSON.parse(JSON.stringify(call.payload)));
        }
        return Promise.resolve({ data: row ? [{ id: row.id }] : [], error: null, count: row ? 1 : 0 });
      }
      if (table === 'dashboard_widgets' && call.op === 'delete') {
        const removed = call.filters.find(f => f[0] === 'id')?.[1];
        const existed = h.rows.some(r => r.id === removed);
        h.rows = h.rows.filter(r => r.id !== removed);
        return Promise.resolve({ data: existed ? [{ id: removed }] : [], error: null, count: existed ? 1 : 0 });
      }
      if (table === 'dashboard_widgets' && call.op === 'select') {
        if (id) {
          const row = h.rows.find(r => r.id === id);
          return Promise.resolve({ data: row ? JSON.parse(JSON.stringify(row)) : null, error: null });
        }
        h.loads += 1;
        h.orderKeys.push([...call.order]);
        const base = h.loads % 2 ? [...h.rows].reverse() : [...h.rows];
        const cmp = (a: Record<string, unknown>, b: Record<string, unknown>) => {
          for (const k of call.order) {
            const x = a[k] as string | number;
            const y = b[k] as string | number;
            if (x < y) return -1;
            if (x > y) return 1;
          }
          return 0;
        };
        const data = base.sort(cmp).map(r => JSON.parse(JSON.stringify(r)));
        return Promise.resolve({ data, error: null });
      }
      if (table === 'profiles') return Promise.resolve({ data: { id: 'u-1', dashboard_widgets_seeded: true }, error: null });
      return Promise.resolve({ data: [], error: null });
    };
    const q: Record<string, unknown> = {};
    const chain = () => q;
    q.order = (col: string) => { call.order.push(col); return q; };
    for (const m of ['select', 'in', 'gte', 'lte', 'lt', 'gt', 'limit', 'or', 'not', 'is', 'neq', 'range', 'ilike', 'match']) q[m] = chain;
    q.eq = (col: string, v: unknown) => { call.filters.push([col, v]); return q; };
    q.update = (p: unknown) => { call.op = 'update'; call.payload = p; return q; };
    q.delete = () => { call.op = 'delete'; return q; };
    q.insert = (p: unknown) => { call.op = 'insert'; call.payload = p; return q; };
    q.maybeSingle = result; q.single = result;
    q.then = (a: (v: unknown) => unknown, b?: (e: unknown) => unknown) => result().then(a, b);
    return q;
  }
  return { supabase: {
    from: (t: string) => builder(t),
    rpc: async () => ({ data: [], error: null }),
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
    auth: { getSession: async () => ({ data: { session: null }, error: null }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
  } };
});

const LIVE = [
  { id: 'w-jobs', widget_type: 'upcoming_jobs', grid_x: 20, grid_y: 20, grid_w: 390, grid_h: 270, config: {} },
  { id: 'w-weather1', widget_type: 'weather', grid_x: 540, grid_y: 20, grid_w: 260, grid_h: 270, config: { city: 'Brisbane' } },
  { id: 'w-weather2', widget_type: 'weather', grid_x: 20, grid_y: 380, grid_w: 260, grid_h: 270, config: { city: 'Cairns' } },
  { id: 'w-invoices', widget_type: 'outstanding_invoices', grid_x: 800, grid_y: 380, grid_w: 260, grid_h: 180, config: {} },
  { id: 'w-compliance', widget_type: 'compliance_deadlines', grid_x: 20, grid_y: 740, grid_w: 390, grid_h: 270, config: {} },
];

const LIVE_PHONE_IDS = ['w-invoices', 'w-jobs', 'w-compliance', 'w-weather1', 'w-weather2'];

let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  h.calls.length = 0; h.failOp = null; h.failIds = new Set(); h.emptyWrite = false; h.onDragEnd = null; h.rows = JSON.parse(JSON.stringify(LIVE)); h.loads = 0; h.orderKeys = [];
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ results: [{ latitude: 0, longitude: 0 }], current: {} }) })));
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function tick(ms = 30) { await act(async () => { await new Promise(r => setTimeout(r, ms)); }); }
async function waitFor(fn: () => boolean, what: string) {
  const t = Date.now();
  while (Date.now() - t < 4000) { if (fn()) return; await tick(); }
  throw new Error('timeout ' + what);
}
async function mountPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    root.render(<QueryClientProvider client={client}><ToastProvider><MemoryRouter initialEntries={['/']}><DashboardPage /></MemoryRouter></ToastProvider></QueryClientProvider>);
  });
  await waitFor(() => !!document.querySelector('.dashboard-home-more > summary') && !!document.querySelector('[data-dashboard-view-grid="1"] .dashboard-home-widget'), 'view grid');
  await tick(60);
}
async function remount() { act(() => root.unmount()); root = createRoot(container); h.calls.length = 0; await mountPage(); }
const W = (id: string, widget_type: string, grid_x: number, grid_y: number, grid_w = 260, grid_h = 270, config: Record<string, unknown> = {}) =>
  ({ id, widget_type, grid_x, grid_y, grid_w, grid_h, config });
const rect = (r: Record<string, unknown>) => ({ widget_type: String(r.widget_type), grid_x: r.grid_x as number, grid_y: r.grid_y as number, grid_w: r.grid_w as number, grid_h: r.grid_h as number });
const REP = () => [
  W('r-jobs', 'upcoming_jobs', 20, 20, 390, 270), W('r-wea1', 'weather', 20, 20), W('r-wea2', 'weather', 300, 30),
  W('r-inv', 'outstanding_invoices', 420, 20, 260, 180), W('r-stock', 'stock_market', 700, 20, 260, 180, { symbols: ['ASX:BHP'] }),
  W('r-btc', 'bitcoin', 20, 700, 260, 180), W('r-comp', 'compliance_deadlines', 20, 380, 390, 270), W('r-wea3', 'weather', 405, 380),
  W('r-gut', 'weather', 690, 700, 260, 180),
];
async function mountCustomize() {
  await mountPage();
  await act(async () => { (document.querySelector('.dashboard-home-more > summary') as HTMLElement).click(); });
  const item = [...document.querySelectorAll('[role="menuitem"]')].find(e => e.textContent === 'Customize') as HTMLElement;
  await act(async () => { item.click(); });
  await waitFor(() => !!document.querySelector('[data-dashboard-phone-stack="1"]'), 'phone stack');
}
async function doneEditing() {
  await act(async () => { (document.querySelector('.dashboard-home-more > summary') as HTMLElement).click(); });
  const item = [...document.querySelectorAll('[role="menuitem"]')].find(e => e.textContent === 'Done editing') as HTMLElement;
  await act(async () => { item.click(); });
  await waitFor(() => !!document.querySelector('[data-dashboard-view-grid="1"]'), 'view after done');
}
const ids = () => [...document.querySelectorAll('[data-dashboard-phone-stack="1"] [data-dashboard-widget-id]')].map(e => e.getAttribute('data-dashboard-widget-id'));
const viewIds = () => [...document.querySelectorAll('[data-dashboard-view-grid="1"] [data-dashboard-widget-id]')].map(e => e.getAttribute('data-dashboard-widget-id'));
const btn = (id: string, label: string) => document.querySelector(`[data-dashboard-phone-stack="1"] [data-dashboard-widget-id="${id}"] button[aria-label="${label}"]`) as HTMLButtonElement;
const writes = (op: string) => h.calls.filter(c => c.table === 'dashboard_widgets' && c.op === op);
const strip = (p: unknown) => { const { updated_at, ...rest } = p as Record<string, unknown>; expect(typeof updated_at).toBe('string'); return rest; };
function canvasRect(id: string) {
  const el = document.querySelector(`.dashboard-home-canvas [data-dashboard-widget-id="${id}"]`) as HTMLElement;
  return { left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height };
}

describe('PR377 probe: phone Customize persists to dashboard_widgets', () => {
  it('Down PATCHes phone_order for both neighbours and leaves desktop x/y alone (M4a/c/d)', async () => {
    await mountCustomize();
    expect(ids()).toEqual(LIVE_PHONE_IDS);
    const before = {
      jobs: canvasRect('w-jobs'),
      weather1: canvasRect('w-weather1'),
      invoices: canvasRect('w-invoices'),
      compliance: canvasRect('w-compliance'),
    };
    await act(async () => { btn('w-jobs', 'Move Upcoming Jobs down').click(); }); await tick();
    expect(ids()).toEqual(['w-invoices', 'w-compliance', 'w-jobs', 'w-weather1', 'w-weather2']);
    const up = writes('update');
    expect(up).toHaveLength(5);
    const byId = Object.fromEntries(up.map(c => [String(c.filters.find(f => f[0] === 'id')?.[1]), strip(c.payload)]));
    expect(byId).toEqual({
      'w-invoices': { config: { phone_order: 0 } },
      'w-compliance': { config: { phone_order: 1 } },
      'w-jobs': { config: { phone_order: 2 } },
      'w-weather1': { config: { city: 'Brisbane', phone_order: 3 } },
      'w-weather2': { config: { city: 'Cairns', phone_order: 4 } },
    });
    for (const call of up) {
      const rest = strip(call.payload);
      expect(Object.keys(rest).sort()).toEqual(['config']);
      expect(rest).not.toHaveProperty('grid_x');
      expect(rest).not.toHaveProperty('grid_y');
      expect(rest).not.toHaveProperty('grid_w');
      expect(rest).not.toHaveProperty('grid_h');
    }
    expect(writes('delete')).toHaveLength(0);
    expect(canvasRect('w-jobs')).toEqual(before.jobs);
    expect(canvasRect('w-weather1')).toEqual(before.weather1);
    expect(canvasRect('w-invoices')).toEqual(before.invoices);
    expect(canvasRect('w-compliance')).toEqual({ left: '20px', top: '740px', width: '390px', height: '270px' });
  });

  it('Up on the second row PATCHes the same phone_order swap', async () => {
    await mountCustomize();
    await act(async () => { btn('w-jobs', 'Move Upcoming Jobs up').click(); }); await tick();
    expect(ids()).toEqual(['w-jobs', 'w-invoices', 'w-compliance', 'w-weather1', 'w-weather2']);
    const up = writes('update');
    expect(up).toHaveLength(5);
    const byId = Object.fromEntries(up.map(c => [String(c.filters.find(f => f[0] === 'id')?.[1]), strip(c.payload)]));
    expect(byId).toEqual({
      'w-jobs': { config: { phone_order: 0 } },
      'w-invoices': { config: { phone_order: 1 } },
      'w-compliance': { config: { phone_order: 2 } },
      'w-weather1': { config: { city: 'Brisbane', phone_order: 3 } },
      'w-weather2': { config: { city: 'Cairns', phone_order: 4 } },
    });
    for (const call of up) {
      expect(Object.keys(strip(call.payload)).sort()).toEqual(['config']);
    }
  });

  it('Remove DELETEs the row by id and drops it from the stack (M4b)', async () => {
    await mountCustomize();
    await act(async () => { btn('w-invoices', 'Remove Outstanding Invoices').click(); }); await tick();
    const del = writes('delete');
    expect(del).toHaveLength(1);
    expect(del[0].filters).toEqual([['id', 'w-invoices']]);
    expect(ids()).toEqual(['w-jobs', 'w-compliance', 'w-weather1', 'w-weather2']);
  });

  it('Remove keeps the widget when Supabase returns {error} (M5a)', async () => {
    await mountCustomize();
    h.failOp = 'delete';
    await act(async () => { btn('w-invoices', 'Remove Outstanding Invoices').click(); }); await tick();
    expect(writes('delete')).toHaveLength(1);
    expect(ids()).toContain('w-invoices');
    expect(document.body.textContent).toContain('Could not remove the widget.');
  });

  it('Move reports an update {error} (console.error "Widget update failed") (M5b)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await mountCustomize();
    h.failOp = 'update';
    await act(async () => { btn('w-jobs', 'Move Upcoming Jobs down').click(); }); await tick();
    expect(writes('update').length).toBeGreaterThan(0);
    expect(spy.mock.calls.filter(c => String(c[0]).includes('Widget update failed')).length).toBe(writes('update').length);
  });

  it('Move rolls the stack back when the update returns {error}', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await mountCustomize();
    h.failOp = 'update';
    await act(async () => { btn('w-jobs', 'Move Upcoming Jobs down').click(); }); await tick(80);
    expect(ids()).toEqual(LIVE_PHONE_IDS);
    expect(document.body.textContent).toContain('Could not move the widget.');
  });

  it('phone view follows Customize after Done and after a reload', async () => {
    await mountCustomize();
    expect(ids()).toEqual(LIVE_PHONE_IDS);
    await act(async () => { btn('w-weather1', 'Move Weather up').click(); }); await tick();
    await act(async () => { btn('w-weather1', 'Move Weather up').click(); }); await tick();
    await act(async () => { btn('w-weather1', 'Move Weather up').click(); }); await tick();
    expect(ids()).toEqual(['w-weather1', 'w-invoices', 'w-jobs', 'w-compliance', 'w-weather2']);
    await doneEditing();
    expect(viewIds()).toEqual(['w-weather1', 'w-invoices', 'w-jobs', 'w-compliance', 'w-weather2']);
    act(() => root.unmount());
    root = createRoot(container);
    h.calls.length = 0;
    await mountPage();
    expect(viewIds()).toEqual(['w-weather1', 'w-invoices', 'w-jobs', 'w-compliance', 'w-weather2']);
    await act(async () => { (document.querySelector('.dashboard-home-more > summary') as HTMLElement).click(); });
    const customize = [...document.querySelectorAll('[role="menuitem"]')].find(e => e.textContent === 'Customize') as HTMLElement;
    await act(async () => { customize.click(); });
    await waitFor(() => !!document.querySelector('[data-dashboard-phone-stack="1"]'), 'stack after reload');
    expect(canvasRect('w-jobs')).toEqual({ left: '20px', top: '20px', width: '390px', height: '270px' });
    expect(canvasRect('w-invoices')).toEqual({ left: '800px', top: '380px', width: '260px', height: '180px' });
  });

  it('phone_order write keeps the rest of config under jsonb replace (N7)', async () => {
    await mountCustomize();
    await act(async () => { btn('w-weather1', 'Move Weather up').click(); }); await tick();
    const w1 = writes('update').find(c => c.filters.some(f => f[1] === 'w-weather1'))!;
    expect((strip(w1.payload).config as Record<string, unknown>).city).toBe('Brisbane');
    expect(h.rows.find(r => r.id === 'w-weather1')!.config).toMatchObject({ city: 'Brisbane' });
  });

  it('a Customize save merges phone_order into config that changed after page load', async () => {
    await mountCustomize();
    const weather = h.rows.find(r => r.id === 'w-weather1')!;
    weather.config = { ...(weather.config as Record<string, unknown>), city: 'Sydney' };
    h.calls.length = 0;
    await act(async () => { btn('w-weather1', 'Move Weather up').click(); }); await tick();
    const w1 = writes('update').find(c => c.filters.some(f => f[1] === 'w-weather1'))!;
    expect(w1).toBeTruthy();
    const cfg = strip(w1.payload).config as Record<string, unknown>;
    expect(cfg.city).toBe('Sydney');
    expect(cfg.phone_order).toBe(2);
    expect(w1.filters).toEqual(expect.arrayContaining([['id', 'w-weather1'], ['user_id', 'u-1']]));
  });

  it('partial failure writes the succeeded row back (N4c)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await mountCustomize();
    const before = ids();
    const cfg0 = JSON.stringify(h.rows.map(r => r.config));
    h.failIds.add('w-compliance');
    await act(async () => { btn('w-jobs', 'Move Upcoming Jobs down').click(); }); await tick(80);
    expect(ids()).toEqual(before);
    expect(document.body.textContent).toContain('Could not move the widget.');
    expect(JSON.stringify(h.rows.map(r => r.config))).toBe(cfg0);
  });

  it('logs a repair write error and still shows the cards', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.rows = [
      { id: 'keep', widget_type: 'upcoming_jobs', grid_x: 20, grid_y: 20, grid_w: 390, grid_h: 270, config: {} },
      { id: 'hit', widget_type: 'weather', grid_x: 20, grid_y: 20, grid_w: 260, grid_h: 270, config: {} },
    ];
    h.failOp = 'update';
    await mountPage();
    expect(spy.mock.calls.some(c => String(c[0]).includes('Dashboard widget repair write failed'))).toBe(true);
    expect(document.body.textContent).not.toContain('Could not load dashboard');
    expect(document.body.textContent ?? '').not.toMatch(/could not repair the widget layout/i);
    expect(document.querySelector('[data-dashboard-view-grid="1"] .dashboard-home-widget')).toBeTruthy();
  });

  it('same-grid_y same-tier rows come back in one order on every reload (tie broken by id)', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    h.rows = [
      W('w-d', 'weather', 668, 20, 200), W('w-a', 'weather', 20, 20, 200), W('w-c', 'weather', 452, 20, 200), W('w-b', 'weather', 236, 20, 200),
      W('w-ops', 'pending_reports', 20, 310, 390, 180),
    ];
    await mountPage();
    const first = viewIds();
    expect(first).toEqual(['w-ops', 'w-a', 'w-b', 'w-c', 'w-d']);
    for (let i = 0; i < 3; i += 1) {
      await remount();
      expect(viewIds()).toEqual(first);
    }
    expect(writes('update')).toEqual([]);
    expect(h.orderKeys.every(k => k.join(',') === 'grid_y,id')).toBe(true);
  });

  it('a failed repair DELETE is logged and stops the repair (RP1)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.rows = REP();
    h.failOp = 'delete';
    await mountPage();
    expect(spy.mock.calls.some(c => String(c[0]).includes('Dashboard widget repair write failed'))).toBe(true);
    expect(document.body.textContent ?? '').not.toMatch(/could not repair the widget layout/i);
    expect(writes('delete')).toHaveLength(1);
    expect(writes('update')).toHaveLength(0);
    expect(h.rows.some(r => r.id === 'r-stock')).toBe(true);
    expect(viewIds()).not.toContain('r-stock');
  });

  it('repair PATCH keeps grid_x when it moves a row (RP7)', async () => {
    h.rows = REP();
    await mountPage();
    expect(writes('delete').map(c => c.filters)).toEqual([
      [['id', 'r-stock'], ['user_id', 'u-1']],
      [['id', 'r-btc'], ['user_id', 'u-1']],
    ]);
    const ups = writes('update');
    expect(ups.length).toBeGreaterThan(0);
    const moved = ups.filter(u => Object.prototype.hasOwnProperty.call(u.payload as object, 'grid_x'));
    expect(moved.length).toBeGreaterThan(0);
    for (const u of moved) {
      const rest = strip(u.payload);
      expect(rest).toHaveProperty('grid_x');
      expect(rest).toHaveProperty('grid_y');
      expect(rest).not.toHaveProperty('grid_w');
      expect(rest).not.toHaveProperty('grid_h');
      expect(u.filters).toEqual(expect.arrayContaining([['id', expect.any(String)], ['user_id', 'u-1']]));
    }
    const stored = h.rows.filter(r => !['r-stock', 'r-btc'].includes(String(r.id))).map(rect);
    expect(dashboardWidgetLayoutOverlaps(stored)).toBe(false);
    expect(dashboardWidgetMinNeighborGap(stored)).toBeGreaterThanOrEqual(DASHBOARD_WIDGET_GAP);
  });

  it('a non-overlapping row gets no repair write', async () => {
    h.rows = [
      W('keep-city', 'weather', 20, 20, 260, 270, { city: 'Brisbane', units: 'c' }),
      W('hit', 'weather', 20, 20, 260, 270),
      W('solo', 'clock', 800, 800, 260, 180, { extra: 1 }),
    ];
    const snapshot = JSON.parse(JSON.stringify(h.rows)) as DashboardWidgetRect[];
    const expected = repairDashboardWidgetLayout(snapshot);
    await mountPage();
    const idsWritten = writes('update').map(c => String(c.filters.find(f => f[0] === 'id')?.[1]));
    expect(idsWritten).not.toContain('solo');
    expect(idsWritten).not.toContain('hit');
    expect(idsWritten.length).toBeGreaterThan(0);
    for (const prev of snapshot) {
      const next = expected.widgets.find(row => row.id === prev.id);
      if (!next || (next.grid_x === prev.grid_x && next.grid_y === prev.grid_y)) {
        expect(idsWritten).not.toContain(prev.id);
      } else {
        expect(idsWritten).toContain(prev.id);
        const payload = strip(writes('update').find(c => c.filters.some(f => f[1] === prev.id))!.payload);
        expect(payload).toEqual({ grid_x: next.grid_x, grid_y: next.grid_y });
      }
    }
  });

  it('repair PATCH has no grid_w/h and does not replace config keys', async () => {
    h.rows = [
      W('keep-city', 'weather', 20, 20, 260, 270, { city: 'Brisbane', units: 'c' }),
      W('hit', 'weather', 20, 20, 260, 270),
    ];
    await mountPage();
    const ups = writes('update');
    expect(ups.length).toBeGreaterThan(0);
    for (const u of ups) {
      const rest = strip(u.payload);
      expect(rest).not.toHaveProperty('grid_w');
      expect(rest).not.toHaveProperty('grid_h');
      expect(rest).not.toHaveProperty('config');
    }
    expect(h.rows.find(r => r.id === 'keep-city')!.config).toEqual({ city: 'Brisbane', units: 'c' });
  });

  it('a second load after repair writes nothing', async () => {
    h.rows = [
      W('keep-city', 'weather', 20, 20, 260, 270, { city: 'Brisbane' }),
      W('hit', 'weather', 20, 20, 260, 270),
    ];
    await mountPage();
    expect(writes('update').length).toBeGreaterThan(0);
    await remount();
    expect(writes('update')).toEqual([]);
    expect(writes('delete')).toEqual([]);
  });

  it('a 0-row repair PATCH shows no toast and does not retry', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.rows = [
      W('keep-city', 'weather', 20, 20, 260, 270, { city: 'Brisbane' }),
      W('hit', 'weather', 20, 20, 260, 270),
    ];
    h.emptyWrite = true;
    await mountPage();
    expect(spy.mock.calls.some(c => String(c[0]).includes('Dashboard widget repair write failed'))).toBe(true);
    expect(document.body.textContent ?? '').not.toMatch(/could not repair the widget layout/i);
    expect(writes('update')).toHaveLength(1);
    expect(document.querySelector('[data-dashboard-view-grid="1"] .dashboard-home-widget')).toBeTruthy();
  });

  it('C up, remove A, reload, then B down still reorders (P1-B)', async () => {
    h.rows = ['A', 'B', 'C', 'D'].map((id, i) => ({
      id, widget_type: 'weather', grid_x: 20, grid_y: 20 + i * 300, grid_w: 260, grid_h: 270, config: {},
    }));
    await mountCustomize();
    expect(ids()).toEqual(['A', 'B', 'C', 'D']);
    await act(async () => { btn('C', 'Move Weather up').click(); }); await tick();
    expect(ids()).toEqual(['A', 'C', 'B', 'D']);
    await act(async () => { btn('A', 'Remove Weather').click(); }); await tick();
    expect(ids()).toEqual(['C', 'B', 'D']);
    act(() => root.unmount());
    root = createRoot(container);
    h.calls.length = 0;
    await mountCustomize();
    expect(ids()).toEqual(['C', 'B', 'D']);
    await act(async () => { btn('B', 'Move Weather down').click(); }); await tick();
    expect(ids()).toEqual(['C', 'D', 'B']);
    const orders = Object.fromEntries(h.rows.map(r => [r.id, (r.config as { phone_order?: number }).phone_order]));
    expect(orders).toMatchObject({ C: 0, D: 1, B: 2 });
  });
});

describe('PR377 clamp persist (canvas forced to 910)', () => {
  function forceWidth(px: number) {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return px; } });
    vi.stubGlobal('ResizeObserver', class {
      cb: () => void;
      constructor(cb: () => void) { this.cb = cb; }
      observe() { this.cb(); }
      disconnect() {}
      unobserve() {}
    });
  }

  it('a 780-wide card is clamped to canvas minus the gutter on 686', async () => {
    forceWidth(686);
    h.rows = [{ id: 'w-wide', widget_type: 'upcoming_jobs', grid_x: 20, grid_y: 20, grid_w: 780, grid_h: 270, config: {} }];
    await mountCustomize();
    const el = document.querySelector('.dashboard-home-canvas [data-dashboard-widget-id="w-wide"]') as HTMLElement;
    expect(parseFloat(el.style.left) + parseFloat(el.style.width)).toBeLessThanOrEqual(686);
    expect(parseFloat(el.style.width)).toBe(666);
  });

  it('opening Customize writes nothing (C5)', async () => {
    forceWidth(910);
    await mountCustomize();
    expect(h.calls.filter(c => c.table === 'dashboard_widgets')).toEqual([]);
    await doneEditing();
    expect(h.calls.filter(c => c.table === 'dashboard_widgets')).toEqual([]);
    expect(h.rows.find(r => r.id === 'w-invoices')).toMatchObject({ grid_x: 800, grid_y: 380, grid_w: 260 });
  });

  it('drawn canvas cards keep at least a 16px gutter (P2-6)', async () => {
    forceWidth(910);
    h.rows = [
      { id: 'w-jobs', widget_type: 'upcoming_jobs', grid_x: 20, grid_y: 20, grid_w: 390, grid_h: 270, config: {} },
      { id: 'w-weather1', widget_type: 'weather', grid_x: 540, grid_y: 20, grid_w: 260, grid_h: 270, config: {} },
      { id: 'w-weather2', widget_type: 'weather', grid_x: 20, grid_y: 380, grid_w: 260, grid_h: 270, config: {} },
      { id: 'w-weather3', widget_type: 'weather', grid_x: 410, grid_y: 380, grid_w: 260, grid_h: 270, config: {} },
      { id: 'w-invoices', widget_type: 'outstanding_invoices', grid_x: 800, grid_y: 380, grid_w: 260, grid_h: 180, config: {} },
      { id: 'w-compliance', widget_type: 'compliance_deadlines', grid_x: 20, grid_y: 740, grid_w: 390, grid_h: 270, config: {} },
      { id: 'w-pending', widget_type: 'pending_reports', grid_x: 540, grid_y: 740, grid_w: 390, grid_h: 180, config: {} },
      { id: 'w-clock', widget_type: 'clock', grid_x: 20, grid_y: 1030, grid_w: 260, grid_h: 180, config: {} },
      { id: 'w-calendar', widget_type: 'calendar', grid_x: 410, grid_y: 1030, grid_w: 390, grid_h: 270, config: {} },
      { id: 'w-calculator', widget_type: 'calculator', grid_x: 20, grid_y: 1320, grid_w: 260, grid_h: 320, config: {} },
      { id: 'w-quick', widget_type: 'quick_actions', grid_x: 410, grid_y: 1320, grid_w: 260, grid_h: 270, config: {} },
      { id: 'w-kpi', widget_type: 'kpi_scorecard', grid_x: 800, grid_y: 1030, grid_w: 390, grid_h: 270, config: {} },
    ];
    for (const width of [686, 910, 1166]) {
      forceWidth(width);
      act(() => root.unmount());
      root = createRoot(container);
      h.calls.length = 0;
      await mountCustomize();
      const cards = [...document.querySelectorAll('.dashboard-home-canvas > [data-dashboard-widget-id]')].map(el => {
        const node = el as HTMLElement;
        return {
          id: node.getAttribute('data-dashboard-widget-id') ?? '',
          grid_x: parseFloat(node.style.left),
          grid_y: parseFloat(node.style.top),
          grid_w: parseFloat(node.style.width),
          grid_h: parseFloat(node.style.height),
        };
      });
      expect(cards.length).toBe(12);
      expect(dashboardWidgetMinNeighborGap(cards), `${width}px canvas`).toBeGreaterThanOrEqual(DASHBOARD_WIDGET_GAP);
    }
  });

  it('drag cannot pass the canvas right edge (P2-6)', async () => {
    forceWidth(910);
    await mountCustomize();
    const el = document.querySelector('.dashboard-home-canvas [data-dashboard-widget-id="w-jobs"]') as HTMLElement;
    const drawnX = parseFloat(el.style.left);
    const drawnW = parseFloat(el.style.width);
    h.calls.length = 0;
    await act(async () => {
      h.onDragEnd?.({ active: { id: 'w-jobs' }, delta: { x: 4000, y: 0 } });
    });
    await tick(40);
    const patch = writes('update').find(c => c.filters.some(f => f[1] === 'w-jobs'));
    expect(patch).toBeTruthy();
    const payload = strip(patch!.payload) as { grid_x: number; grid_y: number; grid_w: number };
    expect(payload.grid_x + payload.grid_w).toBe(910);
    expect(payload.grid_x).toBe(910 - drawnW);
    expect(payload.grid_x).not.toBe(drawnX);
  });

  it('drag on clamped Invoices at 910 starts from the drawn left (P1-A)', async () => {
    forceWidth(910);
    await mountCustomize();
    const el = document.querySelector('.dashboard-home-canvas [data-dashboard-widget-id="w-invoices"]') as HTMLElement;
    const drawnX = parseFloat(el.style.left);
    const drawnY = parseFloat(el.style.top);
    const drawnW = parseFloat(el.style.width);
    expect(drawnX + drawnW).toBeLessThanOrEqual(910);
    expect(drawnX).not.toBe(800);
    h.calls.length = 0;
    expect(h.onDragEnd).toBeTruthy();
    await act(async () => {
      h.onDragEnd?.({ active: { id: 'w-invoices' }, delta: { x: -100, y: 0 } });
    });
    await tick(40);
    const patch = writes('update').find(c => c.filters.some(f => f[1] === 'w-invoices'));
    expect(patch, `expected invoices PATCH after drag; drawn ${drawnX},${drawnY} ${drawnW}`).toBeTruthy();
    const payload = strip(patch!.payload) as { grid_x: number; grid_y: number; grid_w: number };
    expect(payload.grid_x).toBe(drawnX - 100);
    expect(payload.grid_y).toBe(drawnY);
    expect(payload.grid_w).toBe(drawnW);
    expect(payload.grid_x + payload.grid_w).toBeLessThanOrEqual(910);
    expect(payload.grid_x).not.toBe(700);
  });
});
