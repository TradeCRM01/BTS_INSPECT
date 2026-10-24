/**
 * HF-403-768 FROZEN kill (CoS) — do not edit.
 * Browser-side stubs for the hf406 frozen store harness. Not imported by the app.
 * Self-contained copy of the S2 shell stubs, plus a real in-page `dashboard_widgets`
 * store (window.__HF406_STORE__) that applies update payloads the way
 * src/pages/dashboardPhonePersist.test.tsx does.
 */

import { BRAND_NAME } from '../lib/brand';
import {
  TODAY_FIXTURE_CLIENTS,
  TODAY_FIXTURE_COMPANY,
  TODAY_FIXTURE_CREW,
  TODAY_FIXTURE_DAY,
  TODAY_FIXTURE_EXPENSES,
  TODAY_FIXTURE_INVOICES,
  TODAY_FIXTURE_JOBS,
  TODAY_FIXTURE_PAYMENTS,
} from '../lib/todayFixture';

export type S2ShellCfg = {
  companyName?: string;
  reportTheme?: Record<string, string> | null;
};

function cfg(): S2ShellCfg {
  return (globalThis as unknown as { __S2_SHELL__?: S2ShellCfg }).__S2_SHELL__ ?? {};
}

export function useAuth() {
  return {
    profile: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Field Audit',
      role: 'admin',
      company_id: TODAY_FIXTURE_COMPANY,
    },
    company: {
      id: '00000000-0000-0000-0000-000000000001',
      name: cfg().companyName || 'Northside Plumbing & Gas Maintenance Services Pty Ltd',
      report_theme: cfg().reportTheme ?? null,
    },
    signOut: async () => {},
    isPlatformOperator: true,
  };
}

export function useCompanyAiKey() {
  return { ready: true, hasKey: true };
}

export const LOOK_DASHBOARD_REMINDERS = [
  { id: 'look-rem-mia', title: 'Call Mia about quote follow-up before Friday' },
  { id: 'look-rem-0137', title: '#0137 · Replace kitchen mixer today' },
  { id: 'look-rem-megan', title: 'Ring Megan re valve Tuesday morning on site' },
];

export const LIVE_DASH_CREW_NAME = 'CoS Invitee Test';
export const LIVE_DASH_REMINDER_TITLES = [
  'Call Mia about quote p2b-3mxz — delete ok',
  'Ring Megan re valve Tue 3pm — delete ok 375',
] as const;
export const LIVE_DASH_META = '#0141.A$ · Owen Price — delete ok · Ashgrove · CoS Invitee Test';

function liveDueIso(): string {
  return '2026-10-19T08:00:00.000+10:00';
}

function liveReminders() {
  const due = liveDueIso();
  return LIVE_DASH_REMINDER_TITLES.map((title, i) => ({
    id: `live-rem-${i}`,
    company_id: TODAY_FIXTURE_COMPANY,
    user_id: '00000000-0000-0000-0000-000000000002',
    title,
    details: '',
    due_date: due,
    related_type: null,
    related_id: null,
    completed: false,
    completed_at: null,
    visibility: 'private' as const,
    tagged_user_ids: [],
    created_at: due,
    updated_at: due,
  }));
}

function liveCrew() {
  return [
    ...TODAY_FIXTURE_CREW,
    { id: 'live-crew-invitee', name: LIVE_DASH_CREW_NAME },
    { id: 'live-crew-0137', name: `${BRAND_NAME} CoS Test` },
  ];
}

type MockRow = Record<string, unknown>;

function liveJobs() {
  const day = TODAY_FIXTURE_DAY;
  const stamp = liveDueIso();
  const base = {
    company_id: TODAY_FIXTURE_COMPANY,
    description: null as string | null,
    priority: 'medium',
    inspection_id: null as string | null,
    created_by: '00000000-0000-0000-0000-000000000002',
    created_at: stamp,
    updated_at: stamp,
    color: null as string | null,
    budget: null as number | null,
    parent_job_id: null as string | null,
  };
  return [{
    ...base,
    id: 'live-job-0141',
    client_id: 'live-client-owen',
    title: 'Mixer tap',
    status: 'scheduled',
    scheduled_date: day,
    start_time: '13:00',
    end_time: '15:00',
    address: '12 Example St, Ashgrove QLD 4060',
    assigned_team: ['live-crew-invitee'],
    job_number: 141,
    cost_code: 'A$',
  }, {
    ...base,
    id: 'live-job-0137',
    client_id: 'live-client-megan',
    title: 'Replace kitchen mixer tap',
    status: 'scheduled',
    scheduled_date: day,
    start_time: '14:00',
    end_time: '16:00',
    address: '4 Example St, Wilston QLD 4051',
    assigned_team: ['live-crew-0137'],
    job_number: 137,
    cost_code: null,
  }, {
    ...base,
    id: 'live-job-undated',
    client_id: 'live-client-owen',
    title: 'Waiting on a date',
    status: 'scheduled',
    scheduled_date: null,
    start_time: null,
    end_time: null,
    address: '9 Yard Rd, Ashgrove QLD 4060',
    assigned_team: [],
    job_number: 42,
    cost_code: null,
  }, {
    ...base,
    id: 'live-job-unknown',
    client_id: 'live-client-megan',
    title: 'Hold for parts',
    status: 'on_hold',
    scheduled_date: day,
    start_time: '16:00',
    end_time: '17:00',
    address: '2 Hold St, Wilston QLD 4051',
    assigned_team: [' '],
    job_number: 46,
    cost_code: null,
  }, {
    ...base,
    id: 'live-job-awaiting',
    client_id: 'live-client-owen',
    title: 'Parts on order',
    status: 'awaiting_parts',
    scheduled_date: day,
    start_time: '15:00',
    end_time: '16:00',
    address: '47 Parts Rd, Ashgrove QLD 4060',
    assigned_team: ['live-crew-invitee'],
    job_number: 47,
    cost_code: null,
  }];
}

function liveClients() {
  return [{
    id: 'live-client-owen',
    company_id: TODAY_FIXTURE_COMPANY,
    name: 'Owen Price — delete ok',
    phone: null,
    address: '12 Example St, Ashgrove QLD 4060',
  }, {
    id: 'live-client-megan',
    company_id: TODAY_FIXTURE_COMPANY,
    name: 'Megan Lowe',
    phone: null,
    address: '4 Example St, Wilston QLD 4051',
  }];
}

type Hf406Write = { table: string; op: string; payload: unknown; filters: Array<{ kind: string; col: string; val: unknown }> };
type Hf406Store = { rows: MockRow[]; profileSeeded: boolean; writes: Hf406Write[] };

function hf406Store(): Hf406Store {
  const g = globalThis as unknown as { __HF406_STORE__?: Hf406Store; __HF406_SEED__?: MockRow[] };
  if (!g.__HF406_STORE__) {
    const seed = Array.isArray(g.__HF406_SEED__) ? g.__HF406_SEED__ : [];
    g.__HF406_STORE__ = {
      rows: JSON.parse(JSON.stringify(seed)) as MockRow[],
      profileSeeded: true,
      writes: [],
    };
  }
  return g.__HF406_STORE__;
}

function tableRows(table: string): MockRow[] {
  if (table === 'dashboard_widgets') return hf406Store().rows;
  if (table === 'jobs') return [...liveJobs(), ...TODAY_FIXTURE_JOBS] as unknown as MockRow[];
  if (table === 'clients') return [...liveClients(), ...TODAY_FIXTURE_CLIENTS] as unknown as MockRow[];
  if (table === 'invoices') return TODAY_FIXTURE_INVOICES as unknown as MockRow[];
  if (table === 'invoice_payments') return TODAY_FIXTURE_PAYMENTS as unknown as MockRow[];
  if (table === 'expenses') return TODAY_FIXTURE_EXPENSES as unknown as MockRow[];
  if (table === 'agent_reminders') return liveReminders() as unknown as MockRow[];
  if (table === 'profiles') {
    return [{
      id: '00000000-0000-0000-0000-000000000002',
      dashboard_widgets_seeded: hf406Store().profileSeeded,
      company_id: TODAY_FIXTURE_COMPANY,
    }];
  }
  return [];
}

function match(row: MockRow, kind: string, col: string, val: unknown): boolean {
  const raw = row[col];
  if (kind === 'eq') return String(raw ?? '') === String(val);
  if (kind === 'neq') return String(raw ?? '') !== String(val);
  if (kind === 'in') return (val as unknown[]).map(String).includes(String(raw ?? ''));
  const date = String(raw ?? '').slice(0, 10);
  const bound = String(val);
  if (kind === 'gte') return date >= bound;
  if (kind === 'lte') return date <= bound;
  if (kind === 'gt') return date > bound;
  if (kind === 'lt') return date < bound;
  return true;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function from(table: string) {
  const rows = tableRows(table);
  const filters: Array<{ kind: string; col: string; val: unknown }> = [];
  const order: Array<{ col: string; asc: boolean }> = [];
  let limit: number | undefined;
  let op: 'select' | 'update' | 'insert' | 'delete' = 'select';
  let payload: unknown = null;
  const matched = () => rows.filter((row) => filters.every((filter) => (
    filter.kind === 'limit' ? true : match(row, filter.kind, filter.col, filter.val)
  )));
  const sorted = (list: MockRow[]) => {
    let next = list;
    for (const rule of [...order].reverse()) {
      next = [...next].sort((a, b) => {
        const av = a[rule.col];
        const bv = b[rule.col];
        const cmp = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av ?? '').localeCompare(String(bv ?? ''));
        return rule.asc ? cmp : -cmp;
      });
    }
    if (limit != null) next = next.slice(0, limit);
    return next;
  };
  const run = (): MockRow[] => {
    const store = hf406Store();
    if (op === 'select') return clone(sorted(matched()));
    if (table === 'dashboard_widgets' && op === 'update') {
      const hit = matched();
      for (const row of hit) Object.assign(row, clone(payload as MockRow));
      store.writes.push({ table, op, payload: clone(payload), filters: clone(filters) });
      return clone(hit);
    }
    if (table === 'dashboard_widgets' && op === 'delete') {
      const hit = matched();
      for (const row of hit) rows.splice(rows.indexOf(row), 1);
      store.writes.push({ table, op, payload: null, filters: clone(filters) });
      return clone(hit);
    }
    if (table === 'dashboard_widgets' && op === 'insert') {
      const list = (Array.isArray(payload) ? payload : [payload]) as MockRow[];
      const made = list.map((row, i) => ({ id: `hf406-new-${store.writes.length}-${i}`, ...clone(row) }));
      rows.push(...made);
      store.writes.push({ table, op, payload: clone(payload), filters: [] });
      return clone(made);
    }
    if (table === 'profiles' && op === 'update') {
      const p = payload as { dashboard_widgets_seeded?: boolean } | null;
      const hit = matched();
      if (hit.length && p && typeof p.dashboard_widgets_seeded === 'boolean') store.profileSeeded = p.dashboard_widgets_seeded;
      store.writes.push({ table, op, payload: clone(payload), filters: clone(filters) });
      return clone(hit);
    }
    store.writes.push({ table, op, payload: clone(payload), filters: clone(filters) });
    return [];
  };
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = (col: string, val: unknown) => { filters.push({ kind: 'eq', col, val }); return chain; };
  chain.neq = (col: string, val: unknown) => { filters.push({ kind: 'neq', col, val }); return chain; };
  chain.gte = (col: string, val: unknown) => { filters.push({ kind: 'gte', col, val }); return chain; };
  chain.lte = (col: string, val: unknown) => { filters.push({ kind: 'lte', col, val }); return chain; };
  chain.gt = (col: string, val: unknown) => { filters.push({ kind: 'gt', col, val }); return chain; };
  chain.lt = (col: string, val: unknown) => { filters.push({ kind: 'lt', col, val }); return chain; };
  chain.in = (col: string, val: unknown) => { filters.push({ kind: 'in', col, val }); return chain; };
  chain.or = () => chain;
  chain.ilike = () => chain;
  chain.limit = (count: number) => { limit = count; filters.push({ kind: 'limit', col: '', val: count }); return chain; };
  chain.order = (col: string, opts?: { ascending?: boolean }) => {
    order.push({ col, asc: opts?.ascending !== false });
    return chain;
  };
  chain.insert = (value: unknown) => { op = 'insert'; payload = value; return chain; };
  chain.update = (value: unknown) => { op = 'update'; payload = value; return chain; };
  chain.upsert = (value: unknown) => { op = 'update'; payload = value; return chain; };
  chain.delete = () => { op = 'delete'; return chain; };
  chain.maybeSingle = () => Promise.resolve().then(() => ({ data: run()[0] ?? null, error: null }));
  chain.single = () => Promise.resolve().then(() => ({ data: run()[0] ?? null, error: null }));
  chain.then = (
    resolve?: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve().then(() => {
    const next = run();
    return { data: next, error: null, count: next.length };
  }).then(resolve, reject);
  return chain;
}

export function DevConsole() {
  return null;
}

export function GlobalSearch() {
  return null;
}

export const supabase = {
  from,
  rpc: async (name: string) => {
    if (name === 'get_company_members') return { data: liveCrew(), error: null };
    return { data: [], error: null };
  },
  channel: () => {
    const ch: Record<string, unknown> = {};
    ch.on = () => ch;
    ch.subscribe = () => ch;
    ch.unsubscribe = async () => 'ok';
    return ch;
  },
  removeChannel: async () => 'ok',
  auth: {
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
};

