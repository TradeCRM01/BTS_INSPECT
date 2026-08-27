import { supabase } from './supabase';
import { isDevOperatorAudit } from './devFieldAuditAuth';

export const OPERATOR_EMAIL = 'jackpeterwieland@gmail.com';

export type CompanyAccessStatus = 'active' | 'suspended';
export type CompanyBillingStatus = 'none' | 'trial' | 'active' | 'past_due' | 'canceled';
export type GrafterPlanId = 'starter' | 'crew' | 'shop';
export type BillingInterval = 'month' | 'year';

export interface GrafterPlan {
  id: GrafterPlanId;
  name: string;
  blurb: string;
  seats: number | null;
  monthlyEnv: string;
  yearlyEnv: string;
  /** One Stripe Product per plan. Monthly/yearly are Prices on that Product. */
  stripeProductHint: string;
}

export const GRAFTER_PLANS: readonly GrafterPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    blurb: 'Owner-operator and a small crew.',
    seats: 3,
    monthlyEnv: 'STRIPE_PRICE_STARTER_MONTHLY',
    yearlyEnv: 'STRIPE_PRICE_STARTER_YEARLY',
    stripeProductHint: 'Product: Grafter Starter',
  },
  {
    id: 'crew',
    name: 'Crew',
    blurb: 'Field crew with quoting and invoicing.',
    seats: 10,
    monthlyEnv: 'STRIPE_PRICE_CREW_MONTHLY',
    yearlyEnv: 'STRIPE_PRICE_CREW_YEARLY',
    stripeProductHint: 'Product: Grafter Crew',
  },
  {
    id: 'shop',
    name: 'Shop',
    blurb: 'Full workshop — every module, no seat cap.',
    seats: null,
    monthlyEnv: 'STRIPE_PRICE_SHOP_MONTHLY',
    yearlyEnv: 'STRIPE_PRICE_SHOP_YEARLY',
    stripeProductHint: 'Product: Grafter Shop',
  },
];

export const ACCESS_STATUS_LABELS: Record<CompanyAccessStatus, string> = {
  active: 'Active',
  suspended: 'Suspended',
};

export const BILLING_STATUS_LABELS: Record<CompanyBillingStatus, string> = {
  none: 'Not billed',
  trial: 'Trial',
  active: 'Paying',
  past_due: 'Past due',
  canceled: 'Canceled',
};

export const ACCESS_STATUS_STYLES: Record<CompanyAccessStatus, string> = {
  active: 'ops-status-ok',
  suspended: 'ops-status-bad',
};

export const BILLING_STATUS_STYLES: Record<CompanyBillingStatus, string> = {
  none: 'ops-status-wait',
  trial: 'ops-status-info',
  active: 'ops-status-ok',
  past_due: 'ops-status-bad',
  canceled: 'ops-status-wait',
};

export interface OperatorCompanyRow {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  created_at: string;
  access_status: CompanyAccessStatus;
  billing_status: CompanyBillingStatus;
  plan: GrafterPlanId;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  trial_ends_at: string | null;
  seat_limit: number | null;
  people_count: number;
  notes: string;
}

export interface OperatorPerson {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
  last_sign_in_at: string | null;
}

export interface OperatorEvent {
  id: string;
  created_at: string;
  actor_email: string | null;
  company_id: string | null;
  company_name: string | null;
  action: string;
  detail: Record<string, unknown>;
}

export interface OperatorOverview {
  companies: number;
  people: number;
  suspended: number;
  trial: number;
  paying: number;
  past_due: number;
  recent: OperatorCompanyRow[];
}

export interface OperatorBillingConfig {
  stripe_configured: boolean;
  webhook_configured: boolean;
  prices: Record<string, boolean>;
  miss: string | null;
}

export interface PlatformOperatorRow {
  user_id: string;
  email: string;
  name: string | null;
  company_name: string | null;
  created_at: string;
}

export const APPOINT_NEED_ACCOUNT =
  'No Grafter account with that email. They must sign up first, then you can appoint them.';
export const APPOINT_ALREADY_DEVELOPER = 'That account is already a developer.';
export const APPOINT_NEED_EMAIL = 'Enter the email of an existing Grafter account.';
export const REMOVE_LAST_DEVELOPER =
  'Cannot remove the last developer. Appoint someone else first.';
export const REMOVE_NOT_DEVELOPER = 'That account is not a developer.';

export function normalizeOperatorEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function canAppointOperator(
  email: string,
  existing: { email: string }[],
  profile: { id: string; email: string; name: string } | null,
): { ok: true; userId: string; email: string; name: string } | { ok: false; error: string } {
  const normalized = normalizeOperatorEmail(email);
  if (!normalized.includes('@')) return { ok: false, error: APPOINT_NEED_EMAIL };
  if (existing.some(row => normalizeOperatorEmail(row.email) === normalized)) {
    return { ok: false, error: APPOINT_ALREADY_DEVELOPER };
  }
  if (!profile) return { ok: false, error: APPOINT_NEED_ACCOUNT };
  return { ok: true, userId: profile.id, email: profile.email, name: profile.name };
}

export function canRemoveOperator(
  operators: { user_id: string }[],
  targetUserId: string,
): { ok: true } | { ok: false; error: string } {
  if (!operators.some(row => row.user_id === targetUserId)) {
    return { ok: false, error: REMOVE_NOT_DEVELOPER };
  }
  if (operators.length <= 1) return { ok: false, error: REMOVE_LAST_DEVELOPER };
  return { ok: true };
}

export interface OperatorCompanyDetail {
  company: OperatorCompanyRow;
  people: OperatorPerson[];
  events: OperatorEvent[];
  billing: OperatorBillingConfig;
}

export type OperatorAction =
  | { action: 'overview' }
  | { action: 'list_companies'; q?: string; access?: CompanyAccessStatus | 'all'; billing?: CompanyBillingStatus | 'all' }
  | { action: 'get_company'; company_id: string }
  | { action: 'set_access'; company_id: string; access_status: CompanyAccessStatus; reason?: string }
  | { action: 'set_plan'; company_id: string; plan: GrafterPlanId }
  | { action: 'set_notes'; company_id: string; notes: string }
  | { action: 'set_trial'; company_id: string; trial_ends_at: string | null }
  | { action: 'create_checkout'; company_id: string; plan: GrafterPlanId; interval: BillingInterval; origin: string }
  | { action: 'create_portal'; company_id: string; origin: string }
  | { action: 'list_events'; company_id?: string }
  | { action: 'billing_config' }
  | { action: 'list_operators' }
  | { action: 'add_operator'; email: string }
  | { action: 'remove_operator'; user_id: string };

export interface OperatorApiOk {
  ok: true;
  overview?: OperatorOverview;
  companies?: OperatorCompanyRow[];
  detail?: OperatorCompanyDetail;
  events?: OperatorEvent[];
  billing?: OperatorBillingConfig;
  operators?: PlatformOperatorRow[];
  url?: string;
  miss?: string | null;
}

export interface OperatorApiErr {
  ok: false;
  error: string;
  miss?: string;
}

export type OperatorApiResult = OperatorApiOk | OperatorApiErr;

export const STRIPE_SECRET_MISS =
  'Add a restricted Stripe key (rk_…) as STRIPE_SECRET_KEY on the platform-operator and stripe-webhook functions. Create three Stripe Products — Starter, Crew, Shop — each with a monthly Price and a yearly Price. Paste those Price IDs into STRIPE_PRICE_STARTER_MONTHLY (and the other STRIPE_PRICE_* secrets). Do not put Stripe keys in VITE_*. Until then, you can still suspend companies and set a plan by hand.';

export const STRIPE_TAX_NOTE =
  'Do not turn on Stripe Tax automatic_tax until you have an active tax registration in Stripe. Without one, Stripe collects no tax and does not error.';

export function grafterPlan(id: string | null | undefined): GrafterPlan {
  return GRAFTER_PLANS.find(p => p.id === id) ?? GRAFTER_PLANS[0];
}

export function priceEnvFor(plan: GrafterPlanId, interval: BillingInterval): string {
  const row = grafterPlan(plan);
  return interval === 'year' ? row.yearlyEnv : row.monthlyEnv;
}

export function companyIsSuspended(company: { access_status?: string | null } | null | undefined): boolean {
  return company?.access_status === 'suspended';
}

export function companyAccessBlocked(
  company: { access_status?: string | null } | null | undefined,
  isPlatformOperator: boolean,
): boolean {
  return companyIsSuspended(company) && !isPlatformOperator;
}

export function trialLabel(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return 'No trial end';
  const ends = new Date(iso);
  if (Number.isNaN(ends.getTime())) return 'No trial end';
  const days = Math.ceil((ends.getTime() - now.getTime()) / 86_400_000);
  if (days < 0) return `Trial ended ${Math.abs(days)}d ago`;
  if (days === 0) return 'Trial ends today';
  return `Trial · ${days}d left`;
}

function mockCompanies(): OperatorCompanyRow[] {
  const now = new Date().toISOString();
  const in12 = new Date(Date.now() + 12 * 86_400_000).toISOString();
  return [
    {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Field Audit Co',
      email: 'office@field-audit.example.com',
      phone: '08 1234 5678',
      created_at: now,
      access_status: 'active',
      billing_status: 'none',
      plan: 'shop',
      stripe_customer_id: null,
      stripe_subscription_id: null,
      trial_ends_at: null,
      seat_limit: null,
      people_count: 1,
      notes: 'Your own tenant. Charge other companies, not this one, unless you want to.',
    },
    {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Northside Electrics',
      email: 'admin@northside.example.com',
      phone: '08 9000 1000',
      created_at: now,
      access_status: 'active',
      billing_status: 'trial',
      plan: 'crew',
      stripe_customer_id: null,
      stripe_subscription_id: null,
      trial_ends_at: in12,
      seat_limit: 10,
      people_count: 4,
      notes: '',
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      name: 'Harbour HVAC',
      email: 'accounts@harbour.example.com',
      phone: null,
      created_at: now,
      access_status: 'suspended',
      billing_status: 'past_due',
      plan: 'starter',
      stripe_customer_id: 'cus_demo',
      stripe_subscription_id: 'sub_demo',
      trial_ends_at: null,
      seat_limit: 3,
      people_count: 2,
      notes: 'Card failed. Suspended until they pay.',
    },
  ];
}

function mockBilling(): OperatorBillingConfig {
  return {
    stripe_configured: false,
    webhook_configured: false,
    prices: Object.fromEntries(
      GRAFTER_PLANS.flatMap(p => [p.monthlyEnv, p.yearlyEnv]).map(k => [k, false]),
    ),
    miss: STRIPE_SECRET_MISS,
  };
}

function mockOverview(): OperatorOverview {
  const companies = mockCompanies();
  return {
    companies: companies.length,
    people: companies.reduce((n, c) => n + c.people_count, 0),
    suspended: companies.filter(c => c.access_status === 'suspended').length,
    trial: companies.filter(c => c.billing_status === 'trial').length,
    paying: companies.filter(c => c.billing_status === 'active').length,
    past_due: companies.filter(c => c.billing_status === 'past_due').length,
    recent: companies,
  };
}

function mockOperators(): PlatformOperatorRow[] {
  return [
    {
      user_id: '00000000-0000-0000-0000-000000000099',
      email: OPERATOR_EMAIL,
      name: 'Jack Wieland',
      company_name: 'Field Audit Co',
      created_at: new Date().toISOString(),
    },
  ];
}

function mockResult(body: OperatorAction): OperatorApiResult {
  const companies = mockCompanies();
  if (body.action === 'overview') return { ok: true, overview: mockOverview() };
  if (body.action === 'list_companies') {
    const q = (body.q ?? '').trim().toLowerCase();
    let rows = companies;
    if (body.access && body.access !== 'all') rows = rows.filter(c => c.access_status === body.access);
    if (body.billing && body.billing !== 'all') rows = rows.filter(c => c.billing_status === body.billing);
    if (q) rows = rows.filter(c => c.name.toLowerCase().includes(q) || (c.email ?? '').toLowerCase().includes(q));
    return { ok: true, companies: rows };
  }
  if (body.action === 'get_company') {
    const company = companies.find(c => c.id === body.company_id) ?? companies[0];
    return {
      ok: true,
      detail: {
        company,
        people: [
          {
            id: '00000000-0000-0000-0000-000000000002',
            email: company.email ?? 'admin@example.com',
            name: 'Owner',
            role: 'admin',
            created_at: company.created_at,
            last_sign_in_at: null,
          },
          ...(company.id === '11111111-1111-1111-1111-111111111111'
            ? [
                { id: 'p2', email: 'sparky@northside.example.com', name: 'Sam Field', role: 'member', created_at: company.created_at, last_sign_in_at: null },
                { id: 'p3', email: 'office@northside.example.com', name: 'Pat Office', role: 'member', created_at: company.created_at, last_sign_in_at: null },
                { id: 'p4', email: 'apprentice@northside.example.com', name: 'Alex Apprentice', role: 'member', created_at: company.created_at, last_sign_in_at: null },
              ]
            : []),
        ],
        events: [
          {
            id: 'evt-1',
            created_at: company.created_at,
            actor_email: OPERATOR_EMAIL,
            company_id: company.id,
            company_name: company.name,
            action: 'signup',
            detail: { source: 'signup-user' },
          },
        ],
        billing: mockBilling(),
      },
    };
  }
  if (body.action === 'list_events') {
    return {
      ok: true,
      events: companies.map(c => ({
        id: `evt-${c.id}`,
        created_at: c.created_at,
        actor_email: OPERATOR_EMAIL,
        company_id: c.id,
        company_name: c.name,
        action: c.access_status === 'suspended' ? 'suspend' : 'signup',
        detail: {},
      })),
    };
  }
  if (body.action === 'billing_config') return { ok: true, billing: mockBilling(), miss: STRIPE_SECRET_MISS };
  if (body.action === 'create_checkout' || body.action === 'create_portal') {
    return { ok: false, error: 'Stripe is not configured in this DEV session.', miss: STRIPE_SECRET_MISS };
  }
  if (body.action === 'list_operators') return { ok: true, operators: mockOperators() };
  if (body.action === 'add_operator') {
    const decided = canAppointOperator(body.email, mockOperators(), null);
    if (decided.ok) return { ok: false, error: APPOINT_NEED_ACCOUNT };
    return { ok: false, error: decided.error };
  }
  if (body.action === 'remove_operator') {
    const decided = canRemoveOperator(mockOperators(), body.user_id);
    if (!decided.ok) return { ok: false, error: decided.error };
    return { ok: true };
  }
  return { ok: true };
}

export async function callOperatorApi(body: OperatorAction): Promise<OperatorApiResult> {
  if (isDevOperatorAudit()) return mockResult(body);

  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return { ok: false, error: 'Sign in required' };

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/platform-operator`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
    },
    body: JSON.stringify(body),
  });

  let parsed: OperatorApiResult;
  try {
    parsed = (await res.json()) as OperatorApiResult;
  } catch {
    return {
      ok: false,
      error: res.ok ? 'Empty response' : `Operator function failed (${res.status}). Deploy platform-operator and apply SQL 067.`,
    };
  }
  if (!res.ok && parsed && typeof parsed === 'object') {
    if (!('ok' in parsed)) {
      return { ok: false, error: (parsed as { error?: string }).error ?? `Operator function failed (${res.status})` };
    }
  }
  return parsed;
}

export async function loadIsPlatformOperator(userId: string): Promise<boolean> {
  if (isDevOperatorAudit()) return true;
  const { data, error } = await supabase.rpc('is_platform_operator');
  if (!error && data === true) return true;
  const { data: row } = await supabase
    .from('platform_operators')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  return Boolean(row?.user_id);
}
