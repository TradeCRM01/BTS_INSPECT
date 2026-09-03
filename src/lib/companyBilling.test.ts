import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkoutTrialPeriodDays } from './companyBilling';
import {
  GRAFTER_PLANS,
  SIGNUP_TRIAL_DAYS,
  companyNeedsPaidPlan,
  inviteWouldExceedSeatLimit,
  seatLimitFor,
} from './platformOperator';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('public catalog locks', () => {
  it('matches Crew / Company / Plant at $59 / $119 / $199 with seats 5 / 15 / 40', () => {
    expect(GRAFTER_PLANS.map(p => ({ id: p.id, seats: p.seats, aud: p.monthlyAud }))).toEqual([
      { id: 'crew', seats: 5, aud: 59 },
      { id: 'company', seats: 15, aud: 119 },
      { id: 'plant', seats: 40, aud: 199 },
    ]);
    expect(SIGNUP_TRIAL_DAYS).toBe(90);
    expect(seatLimitFor('crew')).toBe(5);
  });

  it('remaps the companies plan check in one migration', () => {
    const sql = src('supabase/migrations/20260902200000_070_public_plan_catalog.sql');
    expect(sql).toContain("CHECK (plan IN ('crew', 'company', 'plant'))");
    expect(sql).toContain("plan = 'plant'");
    expect(sql).toContain("plan = 'company'");
    expect(sql).toContain("plan = 'crew'");
    expect(sql).toContain("ALTER COLUMN plan SET DEFAULT 'crew'");
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS companies_plan_check');
    expect(src('supabase/migrations/20260825120000_067_platform_operator.sql')).toContain(
      'protect_company_platform_columns',
    );
  });
});

describe('90-day Crew trial on signup', () => {
  it('starts new companies on trial Crew with seat_limit 5 and +90d', () => {
    const signup = src('supabase/functions/signup-user/index.ts');
    expect(signup).toContain('90 * 24 * 60 * 60 * 1000');
    expect(signup).toContain('billing_status: "trial"');
    expect(signup).toContain('plan: "crew"');
    expect(signup).toContain('seat_limit: 5');
    expect(signup).toContain('email_confirm: true');
    expect(signup).not.toContain('14 * 24 * 60 * 60 * 1000');
    expect(signup).not.toContain('plan: "starter"');
    expect(signup).not.toContain('seat_limit: 3');
  });
});

describe('tenant checkout and portal', () => {
  it('exposes Settings / billing, not a new app module', () => {
    const app = src('src/App.tsx');
    expect(app).toContain('/settings/billing');
    expect(app).toContain('BillingSettingsPage');
    expect(src('src/components/layout/AppShell.tsx')).toContain('to="/settings/billing"');
    expect(src('src/pages/BillingSettingsPage.tsx')).toContain('callCompanyBillingApi');
    expect(src('src/pages/BillingSettingsPage.tsx')).toContain('create_checkout');
    expect(src('src/pages/BillingSettingsPage.tsx')).toContain('create_portal');
    expect(src('src/pages/BillingSettingsPage.tsx')).toContain('billing-plan-banner');
    expect(src('src/pages/BillingSettingsPage.tsx')).toContain('companyNeedsPaidPlan');
    expect(src('src/pages/BillingSettingsPage.tsx')).toContain('throw new Error(res.error)');
    expect(src('src/pages/BillingSettingsPage.tsx')).not.toContain('res.miss');
    expect(src('src/lib/companyBilling.ts')).toContain('company-billing');
    expect(src('src/lib/companyBilling.ts')).not.toMatch(/VITE_STRIPE/);
  });

  it('runs Checkout and Portal in company-billing with service role', () => {
    const fn = src('supabase/functions/company-billing/index.ts');
    expect(fn).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(fn).toContain('STRIPE_SECRET_KEY');
    expect(fn).toContain('new Stripe(');
    expect(fn).toContain('2026-07-29.dahlia');
    expect(fn).toContain('mode: "subscription"');
    expect(fn).toContain('integration_identifier');
    expect(fn).toContain('billingPortal.sessions.create');
    expect(fn).toContain('/settings/billing');
    expect(fn).toContain('STRIPE_PRICE_CREW_MONTHLY');
    expect(fn).toContain('STRIPE_PRICE_COMPANY_MONTHLY');
    expect(fn).toContain('STRIPE_PRICE_PLANT_MONTHLY');
    expect(fn).toContain('role !== "admin"');
    expect(fn).toContain('profile.company_id');
    expect(fn).not.toContain('payment_method_types');
    expect(fn).not.toContain('automatic_tax');
    expect(fn).not.toContain('stripe.api_key');
    expect(fn).not.toContain('VITE_STRIPE');
    expect(fn).not.toContain('STRIPE_PRICE_STARTER');
    expect(fn).not.toContain('interval');
  });

  it('passes leftover trial_period_days only while the 90-day trial is still running', () => {
    const now = new Date('2026-09-03T00:00:00.000Z');
    const in90 = new Date(now.getTime() + 90 * 86_400_000).toISOString();
    const in12h = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
    const ended = new Date(now.getTime() - 86_400_000).toISOString();

    expect(checkoutTrialPeriodDays({ billing_status: 'trial', trial_ends_at: in90 }, now)).toBe(90);
    expect(checkoutTrialPeriodDays({ billing_status: 'trial', trial_ends_at: in12h }, now)).toBe(1);
    expect(checkoutTrialPeriodDays({ billing_status: 'trial', trial_ends_at: ended }, now)).toBeNull();
    expect(checkoutTrialPeriodDays({ billing_status: 'active', trial_ends_at: in90 }, now)).toBeNull();
    expect(checkoutTrialPeriodDays({ billing_status: 'trial', trial_ends_at: null }, now)).toBeNull();

    const fn = src('supabase/functions/company-billing/index.ts');
    expect(fn).toContain('trial_period_days');
    expect(fn).toContain('billing_status, trial_ends_at');
    expect(fn).toContain('checkoutTrialPeriodDays');
    expect(fn).toContain('leftoverTrialDays != null');
    expect(fn).toContain('Math.max(1, Math.floor(remainingMs / 86_400_000))');
    expect(fn).toContain('if (remainingMs <= 0) return null');
    expect(fn).toContain('billing_status !== "trial"');
    expect(fn).not.toContain('automatic_tax');
    expect(fn).not.toContain('payment_method_types');
  });

  it('keeps stripe-webhook as the writer for the new plan keys', () => {
    const hook = src('supabase/functions/stripe-webhook/index.ts');
    expect(hook).toContain('constructEventAsync');
    expect(hook).toContain('plan === "crew" || plan === "company" || plan === "plant"');
    expect(hook).toContain('seat_limit');
    expect(hook).not.toContain('plan === "starter"');
    expect(hook).not.toContain('automatic_tax');
    expect(hook).not.toContain('VITE_STRIPE');
    expect(src('src/pages/BillingSettingsPage.tsx')).not.toContain("from('companies').update");
  });
});

describe('seat limit on invite', () => {
  it('blocks a new seat at the cap and allows a resend', () => {
    expect(inviteWouldExceedSeatLimit({ seatLimit: 5, peopleCount: 5, alreadyOnTeam: false })).toBe(true);
    expect(inviteWouldExceedSeatLimit({ seatLimit: 5, peopleCount: 4, alreadyOnTeam: false })).toBe(false);
    expect(inviteWouldExceedSeatLimit({ seatLimit: 5, peopleCount: 5, alreadyOnTeam: true })).toBe(false);
    expect(inviteWouldExceedSeatLimit({ seatLimit: null, peopleCount: 99, alreadyOnTeam: false })).toBe(false);
  });

  it('enforces seat_limit inside invite-user', () => {
    const invite = src('supabase/functions/invite-user/index.ts');
    expect(invite).toContain('seat_limit');
    expect(invite).toContain('alreadyOnTeam');
    expect(invite).toContain('peopleCount >= seatLimit');
    expect(invite).toContain('Settings → Billing');
  });
});

describe('trial banner is not a suspend', () => {
  it('asks for a plan after trial without treating it as access_status', () => {
    const now = new Date('2026-09-02T00:00:00.000Z');
    expect(companyNeedsPaidPlan({ billing_status: 'trial', trial_ends_at: '2026-12-01T00:00:00.000Z' }, now)).toBe(false);
    expect(companyNeedsPaidPlan({ billing_status: 'trial', trial_ends_at: '2026-08-01T00:00:00.000Z' }, now)).toBe(true);
    expect(companyNeedsPaidPlan({ billing_status: 'active', trial_ends_at: '2026-08-01T00:00:00.000Z' }, now)).toBe(false);
    expect(companyNeedsPaidPlan({ billing_status: 'past_due', trial_ends_at: null }, now)).toBe(false);
    expect(src('src/pages/BillingSettingsPage.tsx')).toContain('not a lock-out');
    expect(src('src/pages/BillingSettingsPage.tsx')).not.toContain('access_status');
  });
});
