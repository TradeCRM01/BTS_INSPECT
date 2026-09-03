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

/** Page-local Settings sheet. Same language as CompanySettingsPage. Not a new module. */
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
  max-width: 1100px;
  margin: 0 auto 16px;
  padding-top: 8px;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0;
  text-transform: none;
  color: var(--billing-look-muted);
}
.hub-billing-sheet {
  max-width: 1100px;
  margin: 0 auto 24px;
  background: var(--billing-look-sheet);
  border: 1px solid var(--billing-look-line);
  border-radius: 16px;
  padding: 0;
  overflow: hidden;
  box-shadow:
    inset 0 1px 0 #fff,
    0 10px 28px rgba(10, 37, 64, 0.08);
}
.hub-billing-sheet-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 44px;
  padding: 8px 24px;
  background: var(--billing-look-ink);
  color: #fff;
}
.hub-billing-sheet-bar-meta {
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 16px;
  font-weight: 500;
  color: #fff;
}
.hub-billing-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 24px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 999px;
  font-family: Rajdhani, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1;
  width: fit-content;
  white-space: nowrap;
  background: #fff;
  color: var(--billing-look-ink);
}
.hub-billing-sheet-body {
  padding: 32px 32px 24px;
  background: var(--billing-look-sheet);
  box-shadow: inset 0 1px 0 #fff;
}
.hub-billing-hero {
  font-family: Rajdhani, sans-serif;
  font-weight: 700;
  font-size: 56px;
  letter-spacing: 0.02em;
  line-height: 0.96;
  color: var(--billing-look-ink);
  margin: 0;
}
.hub-billing-jobline {
  margin: 8px 0 0;
  color: var(--billing-look-muted);
  font-size: 16px;
  font-weight: 500;
}
.hub-billing-lede {
  margin: 8px 0 0;
  color: var(--billing-look-muted);
  font-size: 14px;
  font-weight: 500;
}
.hub-billing-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
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
  margin: 16px 0 0;
  color: var(--billing-look-ink);
  font-size: 14px;
  font-weight: 500;
}
.hub-billing-fail {
  margin: 16px 0 0;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--billing-look-fail);
  font-size: 14px;
}
.hub-billing-kicker {
  font-family: Rajdhani, sans-serif;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--billing-look-muted);
  margin: 32px 0 0;
}
.hub-billing-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 16px;
  margin: 0;
  padding: 16px 0;
  border-bottom: 1px solid var(--billing-look-line);
  background: none;
  border-radius: 0;
  box-shadow: none;
  min-height: 44px;
  font-size: 14px;
  font-family: 'Source Sans 3', system-ui, sans-serif;
  color: var(--billing-look-ink);
}
.hub-billing-row-copy {
  flex: 1 1 180px;
  min-width: 0;
}
.hub-billing-row-label {
  margin: 0;
  font-family: Rajdhani, sans-serif;
  font-weight: 700;
  font-size: 14px;
  letter-spacing: 0.02em;
  color: var(--billing-look-ink);
}
.hub-billing-row-meta {
  margin: 8px 0 0;
  color: var(--billing-look-muted);
  font-size: 13px;
  font-weight: 500;
}
.hub-billing-price {
  margin: 0;
  font-family: Rajdhani, sans-serif;
  font-weight: 700;
  font-size: 24px;
  letter-spacing: 0.02em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--billing-look-ink);
  white-space: nowrap;
}
.hub-billing-price span {
  font-family: 'Source Sans 3', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0;
  color: var(--billing-look-muted);
}
.hub-billing-choose {
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
  margin: 16px 0 0;
  color: var(--billing-look-muted);
  font-size: 13px;
  font-weight: 500;
}
@media (max-width: 639px) {
  .hub-billing.ops-page { padding: 16px 16px 40px; }
  .hub-billing-sheet-bar { padding: 8px 16px; }
  .hub-billing-sheet-body { padding: 24px 16px 16px; }
  .hub-billing-hero { font-size: 40px; }
  .hub-billing-tools {
    flex-direction: column;
    align-items: center;
    width: 100%;
  }
  .hub-billing-row {
    flex-direction: column;
    align-items: flex-start;
  }
  .hub-billing-choose { width: min(100%, 240px); }
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
  const sheetName = company?.name || 'Billing';

  return (
    <AppShell>
      <style>{BILLING_LOOK_CSS}</style>
      <div className="ops-page hub-billing">
        <p className="hub-billing-label">Settings</p>
        <article className="hub-billing-sheet">
          <header className="hub-billing-sheet-bar">
            <span className="hub-billing-sheet-bar-meta">{sheetName}</span>
            <span className="hub-billing-pill">Billing</span>
          </header>
          <div className="hub-billing-sheet-body">
            <h1 className="hub-billing-hero">{hero}</h1>
            <p className="hub-billing-jobline">
              {plan.name} · {peopleCount ?? '—'} of {seatLimit} seats
              {paying ? ' · Paying' : null}
              {billingStatus === 'past_due' ? ' · Payment past due' : null}
            </p>
            <p className="hub-billing-lede">
              Same Grafter on every plan. Seats are the only difference. Prices are AUD inc GST.
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
            {GRAFTER_PLANS.map(row => {
              const current = row.id === plan.id;
              return (
                <div key={row.id} className="hub-billing-row">
                  <div className="hub-billing-row-copy">
                    <p className="hub-billing-row-label">{row.name}</p>
                    <p className="hub-billing-row-meta">
                      GST included · {row.seats} seats · {row.blurb}
                    </p>
                  </div>
                  <p className="hub-billing-price">
                    {formatPlanPriceAud(row)}
                    <span> / mo</span>
                  </p>
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

            {error && (
              <p className="hub-billing-fail">
                <AlertCircle size={14} /> {error}
              </p>
            )}

            <p className="hub-billing-foot">
              Card is not required at signup. After Checkout, use Manage billing to update the card or cancel.
            </p>
          </div>
        </article>
      </div>
    </AppShell>
  );
}
