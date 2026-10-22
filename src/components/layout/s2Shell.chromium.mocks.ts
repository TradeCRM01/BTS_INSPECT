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

export function DevConsole() {
  return null;
}

export function GlobalSearch() {
  return null;
}

let chain: unknown;
chain = new Proxy(function chainFn() { return chain; }, {
  get: (_target, key) => (key === 'then'
    ? (resolveThen: (v: unknown) => void) => resolveThen({ data: [], error: null, count: 0 })
    : chain),
  apply: () => chain,
});

export const supabase = {
  from: () => chain,
  rpc: async () => ({ data: [], error: null }),
  auth: {
    getSession: async () => ({ data: { session: null } }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },
};
