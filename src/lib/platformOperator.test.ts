import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  APPOINT_ALREADY_DEVELOPER,
  APPOINT_NEED_ACCOUNT,
  APPOINT_NEED_EMAIL,
  BILLING_STATUS_LABELS,
  GRAFTER_PLANS,
  OPERATOR_EMAIL,
  REMOVE_LAST_DEVELOPER,
  REMOVE_NOT_DEVELOPER,
  STRIPE_SECRET_MISS,
  STRIPE_TAX_NOTE,
  canAppointOperator,
  canRemoveOperator,
  companyAccessBlocked,
  grafterPlan,
  priceEnvFor,
  trialLabel,
} from './platformOperator';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('platform operator access', () => {
  it('blocks suspended companies unless the viewer is a platform operator', () => {
    expect(companyAccessBlocked({ access_status: 'suspended' }, false)).toBe(true);
    expect(companyAccessBlocked({ access_status: 'suspended' }, true)).toBe(false);
    expect(companyAccessBlocked({ access_status: 'active' }, false)).toBe(false);
    expect(companyAccessBlocked(null, false)).toBe(false);
  });

  it('does not treat company admin as a platform operator', () => {
    const auth = src('src/contexts/AuthContext.tsx');
    expect(auth).toContain('isPlatformOperator');
    expect(auth).toContain('loadIsPlatformOperator');
    expect(auth).not.toMatch(/isPlatformOperator.*=.*role === 'admin'/);
    expect(src('src/components/layout/OperatorRoute.tsx')).toContain('isPlatformOperator');
    expect(src('src/components/layout/OperatorRoute.tsx')).not.toContain("role === 'admin'");
    expect(src('src/lib/platformOperator.ts')).toContain("from('platform_operators')");
    expect(src('src/lib/platformOperator.ts')).toContain("rpc('is_platform_operator')");
    expect(src('src/lib/platformOperator.ts')).not.toContain('user_metadata');
    expect(src('src/lib/platformOperator.ts')).not.toMatch(/VITE_.*OPERATOR/);
    expect(src('src/contexts/AuthContext.tsx')).not.toContain('user_metadata');
  });

  it('seeds only the developer email and keeps operator writes off PostgREST', () => {
    const sql = src('supabase/migrations/20260825120000_067_platform_operator.sql');
    expect(sql).toContain(OPERATOR_EMAIL);
    expect(sql).toContain('platform_operators');
    expect(sql).toContain('is_platform_operator');
    expect(sql).toContain('protect_company_platform_columns');
    expect(sql).toContain("auth.jwt() ->> 'role'");
    expect(sql).toContain('service_role');
    expect(sql).toContain('platform_operator_events');
    expect(sql).toContain('platform_company_notes');
    expect(sql).not.toMatch(/user_metadata/);
    expect(sql).not.toMatch(/VITE_/);
  });
});

describe('platform billing catalog', () => {
  it('keeps one Stripe Product per plan and separate monthly/yearly prices', () => {
    expect(GRAFTER_PLANS.map(p => p.id)).toEqual(['starter', 'crew', 'shop']);
    const products = GRAFTER_PLANS.map(p => p.stripeProductHint);
    expect(new Set(products).size).toBe(3);
    expect(priceEnvFor('starter', 'month')).toBe('STRIPE_PRICE_STARTER_MONTHLY');
    expect(priceEnvFor('shop', 'year')).toBe('STRIPE_PRICE_SHOP_YEARLY');
    expect(grafterPlan('crew').name).toBe('Crew');
    expect(BILLING_STATUS_LABELS.past_due).toBe('Past due');
    expect(STRIPE_SECRET_MISS).toContain('rk_');
    expect(STRIPE_SECRET_MISS).toContain('VITE_*');
    expect(STRIPE_TAX_NOTE).toContain('automatic_tax');
  });

  it('labels a trial window from today', () => {
    const now = new Date('2026-08-25T00:00:00.000Z');
    expect(trialLabel(new Date('2026-09-08T00:00:00.000Z').toISOString(), now)).toBe('Trial · 14d left');
    expect(trialLabel(new Date('2026-08-20T00:00:00.000Z').toISOString(), now)).toBe('Trial ended 5d ago');
    expect(trialLabel(null, now)).toBe('No trial end');
  });
});

describe('operator console wiring', () => {
  it('puts operator routes behind OperatorRoute and a separate shell', () => {
    const app = src('src/App.tsx');
    expect(app).toContain('/operator');
    expect(app).toContain('OperatorRoute');
    expect(app).toContain('OperatorOverviewPage');
    expect(app).toContain('OperatorCompaniesPage');
    expect(app).toContain('OperatorBillingPage');
    expect(app).toContain('OperatorAuditPage');
    expect(src('src/components/layout/OperatorShell.tsx')).toContain('Operator');
    expect(src('src/components/layout/OperatorShell.tsx')).not.toContain('AppShell');
    expect(src('src/components/layout/OperatorShell.tsx')).toContain('/operator/operators');
    expect(app).toContain('OperatorOperatorsPage');
    expect(src('src/components/layout/AppShell.tsx')).toContain('to="/operator"');
    expect(src('src/components/layout/AppShell.tsx')).toContain('isPlatformOperator');
    expect(src('src/components/layout/ProtectedRoute.tsx')).toContain('companyAccessBlocked');
  });

  it('creates a tenant on signup instead of joining the first company', () => {
    const signup = src('supabase/functions/signup-user/index.ts');
    expect(signup).toContain('company_name');
    expect(signup).toContain('billing_status');
    expect(signup).toContain('trial');
    expect(signup).not.toContain('all users belong to same company');
    expect(signup).not.toMatch(/\.limit\(1\)/);
    expect(src('src/pages/SignupPage.tsx')).toContain('company_name');
    expect(src('src/pages/SignupPage.tsx')).toContain('Company / business name');
  });

  it('charges through Checkout Sessions without payment_method_types or automatic_tax', () => {
    const fn = src('supabase/functions/platform-operator/index.ts');
    expect(fn).toContain('new Stripe(');
    expect(fn).toContain('2026-07-29.dahlia');
    expect(fn).toContain("mode: \"subscription\"");
    expect(fn).toContain('integration_identifier');
    expect(fn).toContain('billingPortal.sessions.create');
    expect(fn).toContain('platform_operators');
    expect(fn).not.toContain('payment_method_types');
    expect(fn).not.toContain('automatic_tax');
    expect(fn).not.toContain('stripe.api_key');
    expect(fn).not.toContain('Stripe.setApiKey');
    expect(fn).not.toContain('VITE_STRIPE');
    expect(fn).toContain('STRIPE_SECRET_KEY');
    expect(fn).toContain('rk_');
    expect(fn).toContain('list_operators');
    expect(fn).toContain('add_operator');
    expect(fn).toContain('remove_operator');
    expect(fn).toContain('Cannot remove the last developer');
    expect(fn).toContain('They must sign up first');
    expect(fn).not.toContain('user_metadata');
    const hook = src('supabase/functions/stripe-webhook/index.ts');
    expect(hook).toContain('constructEventAsync');
    expect(hook).toContain('customer.subscription.updated');
    expect(hook).not.toContain('payment_method_types');
    expect(hook).not.toContain('automatic_tax');
  });
});

describe('appoint developers', () => {
  const jack = { user_id: 'jack', email: OPERATOR_EMAIL };
  const sam = { id: 'sam', email: 'sam@example.com', name: 'Sam Field' };

  it('requires an existing Grafter account and will not duplicate a developer', () => {
    expect(canAppointOperator('', [], null)).toEqual({ ok: false, error: APPOINT_NEED_EMAIL });
    expect(canAppointOperator('nobody@example.com', [], null)).toEqual({
      ok: false,
      error: APPOINT_NEED_ACCOUNT,
    });
    expect(canAppointOperator(OPERATOR_EMAIL, [jack], sam)).toEqual({
      ok: false,
      error: APPOINT_ALREADY_DEVELOPER,
    });
    expect(canAppointOperator('  SAM@example.com ', [jack], sam)).toEqual({
      ok: true,
      userId: 'sam',
      email: 'sam@example.com',
      name: 'Sam Field',
    });
  });

  it('will not drop the last developer', () => {
    expect(canRemoveOperator([jack], jack.user_id)).toEqual({
      ok: false,
      error: REMOVE_LAST_DEVELOPER,
    });
    expect(canRemoveOperator([jack, { user_id: 'sam', email: sam.email }], jack.user_id)).toEqual({
      ok: true,
    });
    expect(canRemoveOperator([jack], 'missing')).toEqual({
      ok: false,
      error: REMOVE_NOT_DEVELOPER,
    });
  });

  it('appoints through the operator function, not user_metadata or client env', () => {
    const page = src('src/pages/operator/OperatorOperatorsPage.tsx');
    expect(page).toContain("action: 'add_operator'");
    expect(page).toContain("action: 'remove_operator'");
    expect(page).not.toContain('user_metadata');
    expect(src('src/lib/platformOperator.ts')).not.toMatch(/VITE_.*OPERATOR/);
    expect(src('src/App.tsx')).toContain('/operator/operators');
  });
});
