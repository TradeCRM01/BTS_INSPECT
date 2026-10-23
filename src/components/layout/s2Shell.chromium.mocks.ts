/** Browser-side stubs for the S2 Chromium shell harness. Not imported by the app. */

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
      company_id: 'c1',
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

function todayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function liveDueIso(now = new Date()): string {
  const due = new Date(now);
  due.setHours(8, 0, 0, 0);
  return due.toISOString();
}

function liveJobs() {
  const day = todayKey();
  const stamp = liveDueIso();
  const base = {
    company_id: 'c1',
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
    start_time: '07:30',
    end_time: '16:00',
    address: '12 Example St, Ashgrove QLD 4060',
    assigned_team: ['live-crew-invitee'],
    job_number: 141,
    cost_code: 'A$',
  }, {
    ...base,
    id: 'live-job-harbour',
    client_id: 'live-client-harbour',
    title: 'Warehouse lights',
    status: 'scheduled',
    scheduled_date: day,
    start_time: '09:00',
    end_time: '12:00',
    address: '8 Wharf St, Fremantle WA 6160',
    assigned_team: ['live-crew-invitee'],
    job_number: 43,
    cost_code: null,
  }];
}

function liveClients() {
  return [{
    id: 'live-client-owen',
    name: 'Owen Price — delete ok',
    phone: null,
    address: '12 Example St, Ashgrove QLD 4060',
  }, {
    id: 'live-client-harbour',
    name: 'Harbour Lights',
    phone: null,
    address: '8 Wharf St, Fremantle WA 6160',
  }];
}

function liveReminders() {
  const due = liveDueIso();
  return LIVE_DASH_REMINDER_TITLES.map((title, i) => ({
    id: `live-rem-${i}`,
    company_id: 'c1',
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
  return [{ id: 'live-crew-invitee', name: LIVE_DASH_CREW_NAME }];
}

type MockRow = Record<string, unknown>;

function tableRows(table: string): MockRow[] {
  if (table === 'jobs') return liveJobs() as unknown as MockRow[];
  if (table === 'clients') return liveClients() as unknown as MockRow[];
  if (table === 'agent_reminders') return liveReminders() as unknown as MockRow[];
  return [];
}

function from(table: string) {
  const rows = tableRows(table);
  const payload = { data: rows, error: null, count: rows.length };
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.neq = () => chain;
  chain.gte = () => chain;
  chain.lte = () => chain;
  chain.in = () => chain;
  chain.or = () => chain;
  chain.ilike = () => chain;
  chain.limit = () => chain;
  chain.order = () => chain;
  chain.insert = () => chain;
  chain.update = () => chain;
  chain.delete = () => chain;
  chain.maybeSingle = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  chain.single = () => Promise.resolve({ data: rows[0] ?? null, error: null });
  chain.then = (
    resolve?: (v: unknown) => unknown,
    reject?: (e: unknown) => unknown,
  ) => Promise.resolve(payload).then(resolve, reject);
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
