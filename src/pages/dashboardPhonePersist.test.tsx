/**
 * @vitest-environment jsdom
 * Adopted from the PR377 precheck probe
 * (/cursor/stores/store-70579235-acee-4ad5-8740-cf36a4816b65/handoff/pr377/pr377PhonePersist.probe.test.tsx,
 * sha256 ca739b26a0cb2b4362d69fd25693d789a094f23bc4a080b42eaff90f093d3487).
 * Real DashboardPage, NOT look/audit mode, so the phone Customize controls run the production
 * write path against a mocked Supabase client. Payloads are config.phone_order (not grid_x/y)
 * so a phone reorder cannot rewrite the desktop canvas.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../components/ui';
import { DASHBOARD_PHONE_ORDER_TIER } from '../lib/dashboardWidgetView';
import { DashboardPage } from './DashboardPage';

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, unknown]> };
const h = vi.hoisted(() => ({
  calls: [] as Call[],
  failOp: null as null | 'update' | 'delete',
  rows: [] as Array<Record<string, unknown>>,
}));

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
    const call: Call = { table, op: 'select', filters: [] };
    const result = () => {
      if (call.op === 'update' || call.op === 'delete' || call.op === 'insert') h.calls.push(call);
      if (h.failOp && call.op === h.failOp && table === 'dashboard_widgets') {
        return Promise.resolve({ data: null, error: { message: 'probe forced failure', code: 'XX000' } });
      }
      if (table === 'dashboard_widgets' && call.op === 'update') {
        const id = call.filters.find(f => f[0] === 'id')?.[1];
        const row = h.rows.find(r => r.id === id);
        if (row && call.payload && typeof call.payload === 'object') {
          const payload = { ...(call.payload as Record<string, unknown>) };
          if (payload.config && typeof payload.config === 'object') {
            row.config = { ...((row.config as object) ?? {}), ...(payload.config as object) };
            payload.config = row.config;
          }
          Object.assign(row, payload);
        }
      }
      if (table === 'dashboard_widgets' && call.op === 'delete') {
        const id = call.filters.find(f => f[0] === 'id')?.[1];
        h.rows = h.rows.filter(r => r.id !== id);
      }
      if (table === 'dashboard_widgets' && call.op === 'select') return Promise.resolve({ data: h.rows.map(r => ({ ...r })), error: null });
      if (table === 'profiles') return Promise.resolve({ data: { id: 'u-1', dashboard_widgets_seeded: true }, error: null });
      return Promise.resolve({ data: [], error: null });
    };
    const q: Record<string, unknown> = {};
    const chain = () => q;
    for (const m of ['select', 'order', 'in', 'gte', 'lte', 'lt', 'gt', 'limit', 'or', 'not', 'is', 'neq', 'range', 'ilike', 'match']) q[m] = chain;
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
  { id: 'w-weather1', widget_type: 'weather', grid_x: 540, grid_y: 20, grid_w: 260, grid_h: 270, config: {} },
  { id: 'w-weather2', widget_type: 'weather', grid_x: 20, grid_y: 380, grid_w: 260, grid_h: 270, config: {} },
  { id: 'w-invoices', widget_type: 'outstanding_invoices', grid_x: 800, grid_y: 380, grid_w: 260, grid_h: 180, config: {} },
  { id: 'w-compliance', widget_type: 'compliance_deadlines', grid_x: 20, grid_y: 740, grid_w: 390, grid_h: 270, config: {} },
];

const LIVE_PHONE_IDS = ['w-invoices', 'w-jobs', 'w-compliance', 'w-weather1', 'w-weather2'];
const JOBS_PHONE_ORDER = 1 * DASHBOARD_PHONE_ORDER_TIER + 0;
const COMPLIANCE_PHONE_ORDER = 1 * DASHBOARD_PHONE_ORDER_TIER + 4;
const INVOICES_PHONE_ORDER = 3;

let container: HTMLDivElement; let root: Root;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  h.calls.length = 0; h.failOp = null; h.rows = LIVE.map(r => ({ ...r, config: { ...r.config } }));
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
}
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
    expect(up).toHaveLength(2);
    const byId = Object.fromEntries(up.map(c => [String(c.filters.find(f => f[0] === 'id')?.[1]), strip(c.payload)]));
    expect(byId).toEqual({
      'w-jobs': { config: { phone_order: COMPLIANCE_PHONE_ORDER } },
      'w-compliance': { config: { phone_order: JOBS_PHONE_ORDER } },
    });
    expect(JSON.stringify(byId)).not.toMatch(/grid_x|grid_y|grid_w|grid_h/);
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
    const byId = Object.fromEntries(writes('update').map(c => [String(c.filters.find(f => f[0] === 'id')?.[1]), strip(c.payload)]));
    expect(byId).toEqual({
      'w-jobs': { config: { phone_order: INVOICES_PHONE_ORDER } },
      'w-invoices': { config: { phone_order: JOBS_PHONE_ORDER } },
    });
    expect(writes('update')).toHaveLength(2);
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
    expect(writes('update')).toHaveLength(2);
    expect(spy.mock.calls.filter(c => String(c[0]).includes('Widget update failed'))).toHaveLength(2);
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
  });
});
