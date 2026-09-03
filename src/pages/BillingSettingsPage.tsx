import { useEffect, useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, Check } from 'lucide-react';
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

  return (
    <AppShell>
      <div className="page-shell-narrow space-y-6">
        <div>
          <p className="text-sm text-[#4A5568] mb-1">
            <Link to="/settings/company" className="text-[#2E75B6] hover:underline">Settings</Link>
            {' / '}
            Billing
          </p>
          <h1 className="text-xl font-semibold text-[#1A1A1A] mb-1">Billing</h1>
          <p className="text-sm text-[#4A5568]">
            Same Grafter on every plan. Seats are the only difference. Prices include GST.
          </p>
        </div>

        {checkout === 'success' && (
          <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2.5 rounded-md text-sm">
            <Check size={16} className="mt-0.5 shrink-0" />
            Checkout finished. Billing updates when Stripe confirms the subscription.
          </div>
        )}
        {checkout === 'cancel' && (
          <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 text-orange-800 px-3 py-2.5 rounded-md text-sm">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            Checkout cancelled. Nothing was charged.
          </div>
        )}

        {needsPlan && (
          <div
            id="billing-plan-banner"
            className="bg-[#FFFBEB] border border-[#FDE68A] text-[#92400E] px-3 py-2.5 rounded-md text-sm"
          >
            Your trial has ended. Pick a plan to keep Grafter for the crew. The workspace stays open — this is not a lock-out.
          </div>
        )}

        <div className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-6">
          <h2 className="text-sm font-semibold text-[#1A1A1A] mb-1">Current plan</h2>
          <p className="text-lg font-semibold text-[#1A1A1A] mt-2">{plan.name}</p>
          <p className="text-sm text-[#4A5568] mt-1">
            {peopleCount ?? '—'} of {seatLimit} seats
            {billingStatus === 'trial' ? ` · ${trialLabel(trialEnds)}` : null}
            {paying ? ' · Paying' : null}
            {billingStatus === 'past_due' ? ' · Payment past due' : null}
          </p>
          {hasCustomer && (
            <button
              type="button"
              className="mt-4 flex items-center gap-2 bg-white text-[#0A2540] border border-[#E5E7EB] px-4 py-2.5 rounded-md text-sm font-medium hover:bg-[#F9FAFB] disabled:opacity-50"
              disabled={portalMut.isPending}
              onClick={() => {
                setError('');
                portalMut.mutate();
              }}
            >
              {portalMut.isPending ? 'Opening…' : 'Manage billing'}
            </button>
          )}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3">Pick a monthly plan</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {GRAFTER_PLANS.map(row => (
              <div key={row.id} className="bg-white rounded-lg border border-[#E5E7EB] shadow-sm p-5">
                <p className="text-sm font-semibold text-[#1A1A1A]">{row.name}</p>
                <p className="text-2xl font-semibold text-[#1A1A1A] mt-2">
                  {formatPlanPriceAud(row)}
                  <span className="text-sm font-normal text-[#4A5568]"> / mo</span>
                </p>
                <p className="text-xs text-[#4A5568] mt-1">GST included · {row.seats} seats</p>
                <p className="text-sm text-[#4A5568] mt-2">{row.blurb}</p>
                <button
                  type="button"
                  className="mt-4 w-full flex items-center justify-center gap-2 bg-[#0A2540] text-white px-4 py-2.5 rounded-md text-sm font-medium hover:bg-[#0d2f4e] disabled:opacity-50"
                  disabled={checkoutMut.isPending}
                  onClick={() => {
                    setError('');
                    checkoutMut.mutate(row.id);
                  }}
                >
                  {checkoutMut.isPending ? 'Starting…' : `Choose ${row.name}`}
                </button>
              </div>
            ))}
          </div>
        </div>

        {error && (
          <div className="flex items-start gap-2 text-sm text-red-600">
            <AlertCircle size={14} className="mt-0.5 shrink-0" /> {error}
          </div>
        )}

        <p className="text-xs text-[#4A5568]">
          Card is not required at signup. After Checkout, use Manage billing to update the card or cancel.
        </p>
      </div>
    </AppShell>
  );
}
