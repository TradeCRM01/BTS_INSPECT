/** Browser-side stubs for the S2 Chromium shell harness. Not imported by the app. */

import { BRAND_NAME } from '../../lib/brand';
import {
  TODAY_FIXTURE_CLIENTS,
  TODAY_FIXTURE_COMPANY,
  TODAY_FIXTURE_CREW,
  TODAY_FIXTURE_DAY,
  TODAY_FIXTURE_EXPENSES,
  TODAY_FIXTURE_INVOICES,
  TODAY_FIXTURE_JOBS,
  TODAY_FIXTURE_PAYMENTS,
} from '../../lib/todayFixture';

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

function tableRows(table: string): MockRow[] {
  if (table === 'jobs') return TODAY_FIXTURE_JOBS as unknown as MockRow[];
  if (table === 'clients') return TODAY_FIXTURE_CLIENTS as unknown as MockRow[];
  if (table === 'invoices') return TODAY_FIXTURE_INVOICES as unknown as MockRow[];
  if (table === 'invoice_payments') return TODAY_FIXTURE_PAYMENTS as unknown as MockRow[];
  if (table === 'expenses') return TODAY_FIXTURE_EXPENSES as unknown as MockRow[];
  if (table === 'agent_reminders') return liveReminders() as unknown as MockRow[];
  if (table === 'profiles') {
    return [{
      id: '00000000-0000-0000-0000-000000000002',
      dashboard_widgets_seeded: true,
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

function from(table: string) {
  const rows = tableRows(table);
  const filters: Array<{ kind: string; col: string; val: unknown }> = [];
  const order: Array<{ col: string; asc: boolean }> = [];
  let limit: number | undefined;
  const apply = () => {
    let next = rows.filter((row) => filters.every((filter) => (
      filter.kind === 'limit' ? true : match(row, filter.kind, filter.col, filter.val)
    )));
    for (const rule of order) {
      next = [...next].sort((a, b) => {
        const av = String(a[rule.col] ?? '');
        const bv = String(b[rule.col] ?? '');
        return rule.asc ? av.localeCompare(bv) : bv.localeCompare(av);
      });
    }
    if (limit != null) next = next.slice(0, limit);
    return next;
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
  chain.insert = () => chain;
  chain.update = () => chain;
  chain.delete = () => chain;
  chain.maybeSingle = () => Promise.resolve({ data: apply()[0] ?? null, error: null });
  chain.single = () => Promise.resolve({ data: apply()[0] ?? null, error: null });
  chain.then = (
    resolve?: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => {
    const next = apply();
    return Promise.resolve({ data: next, error: null, count: next.length }).then(resolve, reject);
  };
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
  auth: {
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
};

