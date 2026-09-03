import { useEffect, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { callCompanyBillingApi } from '../lib/companyBilling';
import {
  GRAFTER_PLANS,
  companyNeedsPaidPlan,
  formatPlanPriceAud,
  grafterPlan,
  trialLabel,
  type GrafterPlanId,
} from '../lib/platformOperator';
import { AppShell } from '../components/layout/AppShell';

/** Page-local billing sheet. Same week-board tokens. Not a new module. */
const BILLING_LOOK_CSS = `
.hub-billing {
  --billing-look-page: #F5F0E6;
  --billing-look-sheet: #FFFDF8;
  --billing-look-ink: #0A2540;
  --billing-look-muted: #5B6B7C;
  --billing-look-line: #E2D9CC;
  --billing-look-action: #2E75B6;
  --billing-look-r-ctl: 12px;
  --billing-look-r-sheet: 16px;
  --billing-look-fail: #B42318;
  font-family: 'Source Sans 3', system-ui, sans-serif;
}
.hub-billing.ops-page {
  max-width: none;
  width: 100%;
  min-height: calc(100dvh - 3.5rem);
  margin: 0;
  background: var(--billing-look-page);
  color: var(--billing-look-ink);
  padding: 24px 24px 48px;
}
.hub-billing-label {
  display: block;
  max-width: 880px;
  margin: 0 auto 8px;
  padding-top: 8px;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: var(--billing-look-muted);
}
.hub-billing-hero {
  max-width: 880px;
  margin: 0 auto;
  font-family: Rajdhani, sans-serif;
  font-weight: 700;
  font-size: 56px;
  letter-spacing: 0.02em;
  line-height: 0.96;
  color: var(--billing-look-ink);
}
.hub-billing-lede {
  max-width: 880px;
  margin: 8px auto 0;
  color: var(--billing-look-muted);
  font-size: 14px;
  font-weight: 500;
}
.hub-billing-meta {
  max-width: 880px;
  margin: 8px auto 0;
  color: var(--billing-look-ink);
  font-size: 14px;
  font-weight: 500;
}
.hub-billing-tools {
  max-width: 880px;
  margin: 16px auto 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
}
.hub-billing-sub {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0;
  background: none;
  border: none;
  border-radius: 12px;
  color: #2E75B6;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
  box-shadow: none;
  cursor: pointer;
}
.hub-billing-sub:hover { color: var(--billing-look-ink); }
.hub-billing-sub:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hub-billing-note {
  max-width: 880px;
  margin: 16px auto 0;
  padding: 16px;
  border: 1px solid var(--billing-look-line);
  border-radius: 12px;
  background: var(--billing-look-sheet);
  color: var(--billing-look-ink);
  font-size: 14px;
  font-weight: 500;
  box-shadow: none;
}
.hub-billing-fail {
  max-width: 880px;
  margin: 16px auto 0;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: var(--billing-look-fail);
  font-size: 14px;
}
.hub-billing-kicker {
  max-width: 880px;
  margin: 24px auto 8px;
  font-family: Rajdhani, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--billing-look-muted);
}
.hub-billing-plans {
  max-width: 880px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
}
.hub-billing-card {
  background: var(--billing-look-sheet);
  border: 1px solid var(--billing-look-line);
  border-radius: 16px;
  padding: 24px;
  box-shadow:
    inset 0 1px 0 #fff,
    0 10px 28px rgba(10, 37, 64, 0.08);
}
.hub-billing-card-name {
  margin: 0;
  font-family: Rajdhani, sans-serif;
  font-weight: 700;
  font-size: 16px;
  letter-spacing: 0.02em;
  color: var(--billing-look-ink);
}
.hub-billing-price {
  margin: 8px 0 0;
  font-family: Rajdhani, sans-serif;
  font-weight: 700;
  font-size: 40px;
  letter-spacing: 0.02em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--billing-look-ink);
}
.hub-billing-price span {
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--billing-look-muted);
}
.hub-billing-card-meta {
  margin: 8px 0 0;
  color: var(--billing-look-muted);
  font-size: 13px;
  font-weight: 500;
}
.hub-billing-card-blurb {
  margin: 8px 0 0;
  color: var(--billing-look-ink);
  font-size: 14px;
  font-weight: 500;
}
.hub-billing-choose {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin-top: 16px;
  background: #2E75B6;
  color: #fff;
  min-height: 44px;
  height: 44px;
  padding: 0 16px;
  border: none;
  border-radius: 12px;
  box-shadow: none;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.hub-billing-choose:hover {
  background: color-mix(in srgb, #2E75B6 86%, #0A2540);
  color: #fff;
}
.hub-billing-choose:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.hub-billing-foot {
  max-width: 880px;
  margin: 16px auto 0;
  color: var(--billing-look-muted);
  font-size: 13px;
  font-weight: 500;
}
@media (min-width: 640px) {
  .hub-billing-plans {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }
}
@media (max-width: 639px) {
  .hub-billing.ops-page { padding: 16px 16px 40px; }
  .hub-billing-hero { font-size: 40px; }
  .hub-billing-card { padding: 16px; }
  .hub-billing-price { font-size: 32px; }
  .hub-billing-choose { width: 100%; }
}
`;

export function BillingSettingsPage() {
  const { profile, company, refreshProfile } = useAuth();
  const [params] = useSearchParams();
  const checkout = params.get('checkout');
  const [error, setError] = useState('');
  const isAdmin = profile?.role === 'admin';

  const { data: peopleCount } = useQuery({
    queryKey: ['billing', 'people', company?.id],
    enabled: !!company?.id,
    queryFn: async () => {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', company!.id);
      return count ?? 0;
    },
  });

  useEffect(() => {
    if (checkout === 'success') void refreshProfile();
    // refreshProfile is recreated each render; only re-run when checkout returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkout]);

  const checkoutMut = useMutation({
    mutationFn: async (plan: GrafterPlanId) => {
      const res = await callCompanyBillingApi({
        action: 'create_checkout',
        plan,
        origin: window.location.origin,
      });
      if (!res.ok) throw new Error(res.error);
      if (!res.url) throw new Error('No Checkout URL');
      window.location.href = res.url;
    },
    onError: (err: Error) => setError(err.message),
  });

  const portalMut = useMutation({
    mutationFn: async () => {
      const res = await callCompanyBillingApi({
        action: 'create_portal',
        origin: window.location.origin,
      });
      if (!res.ok) throw new Error(res.error);
      if (!res.url) throw new Error('No portal URL');
      window.location.href = res.url;
    },
    onError: (err: Error) => setError(err.message),
  });

  if (profile && !isAdmin) return <Navigate to="/settings/company" replace />;

  const plan = grafterPlan((company as { plan?: string } | null)?.plan);
  const trialEnds = (company as { trial_ends_at?: string | null } | null)?.trial_ends_at ?? null;
  const billingStatus = (company as { billing_status?: string | null } | null)?.billing_status ?? null;
  const seatLimit = (company as { seat_limit?: number | null } | null)?.seat_limit ?? plan.seats;
  const hasCustomer = Boolean((company as { stripe_customer_id?: string | null } | null)?.stripe_customer_id);
  const needsPlan = companyNeedsPaidPlan(company as { billing_status?: string | null; trial_ends_at?: string | null } | null);
  const paying = billingStatus === 'active' || billingStatus === 'past_due';
  const hero = billingStatus === 'trial' ? trialLabel(trialEnds) : 'Billing';

  return (
    <AppShell>
      <style>{BILLING_LOOK_CSS}</style>
      <div className="ops-page hub-billing">
        <p className="hub-billing-label">Billing</p>
        <h1 className="hub-billing-hero">{hero}</h1>
        <p className="hub-billing-lede">
          Same Grafter on every plan. Seats are the only difference. Prices include GST.
        </p>
        <p className="hub-billing-meta">
          {plan.name} · {peopleCount ?? '—'} of {seatLimit} seats
          {paying ? ' · Paying' : null}
          {billingStatus === 'past_due' ? ' · Payment past due' : null}
        </p>
        {hasCustomer && (
          <div className="hub-billing-tools">
            <button
              type="button"
              className="hub-billing-sub"
              disabled={portalMut.isPending}
              onClick={() => {
                setError('');
                portalMut.mutate();
              }}
            >
              {portalMut.isPending ? 'Opening…' : 'Manage billing'}
            </button>
          </div>
        )}

        {checkout === 'success' && (
          <p className="hub-billing-note">
            Checkout finished. Billing updates when Stripe confirms the subscription.
          </p>
        )}
        {checkout === 'cancel' && (
          <p className="hub-billing-note">
            Checkout cancelled. Nothing was charged.
          </p>
        )}

        {needsPlan && (
          <p id="billing-plan-banner" className="hub-billing-note">
            Your trial has ended. Pick a plan to keep Grafter for the crew. The workspace stays open — this is not a lock-out.
          </p>
        )}

        <p className="hub-billing-kicker">Pick a monthly plan</p>
        <div className="hub-billing-plans">
          {GRAFTER_PLANS.map(row => {
            const current = row.id === plan.id;
            return (
              <div key={row.id} className="hub-billing-card">
                <p className="hub-billing-card-name">{row.name}</p>
                <p className="hub-billing-price">
                  {formatPlanPriceAud(row)}
                  <span> / mo</span>
                </p>
                <p className="hub-billing-card-meta">GST included · {row.seats} seats</p>
                <p className="hub-billing-card-blurb">{row.blurb}</p>
                <button
                  type="button"
                  className="hub-billing-choose"
                  disabled={checkoutMut.isPending}
                  onClick={() => {
                    setError('');
                    checkoutMut.mutate(row.id);
                  }}
                >
                  {checkoutMut.isPending
                    ? 'Starting…'
                    : current && paying
                      ? 'Current plan'
                      : `Choose ${row.name}`}
                </button>
              </div>
            );
          })}
        </div>

        {error && (
          <p className="hub-billing-fail">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </p>
        )}

        <p className="hub-billing-foot">
          Card is not required at signup. After Checkout, use Manage billing to update the card or cancel.
        </p>
      </div>
    </AppShell>
  );
}
