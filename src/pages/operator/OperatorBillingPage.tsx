import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader, LoadingSpinner, PageError } from '../../components/ui';
import {
  GRAFTER_PLANS,
  STRIPE_SECRET_MISS,
  STRIPE_TAX_NOTE,
  callOperatorApi,
  type OperatorBillingConfig,
} from '../../lib/platformOperator';

export function OperatorBillingPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['operator', 'billing'],
    queryFn: async () => {
      const res = await callOperatorApi({ action: 'billing_config' });
      if (!res.ok) throw new Error(res.error);
      return (res.billing ?? { miss: res.miss }) as OperatorBillingConfig;
    },
  });

  if (isLoading) {
    return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  }
  if (error) {
    return <PageError message={error instanceof Error ? error.message : 'Could not load billing'} />;
  }

  const billing = data;
  const miss = billing?.miss || (!billing?.stripe_configured ? STRIPE_SECRET_MISS : null);

  return (
    <div>
      <PageHeader
        title="Billing"
        subtitle="Charge companies a Grafter subscription. One Stripe Product per plan."
      />

      {miss && (
        <p className="mt-4 text-sm text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-md px-3 py-2">
          {miss}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        {GRAFTER_PLANS.map(plan => (
          <div key={plan.id} className="card p-4">
            <h2 className="text-base font-semibold text-[#1A1A1A]">{plan.name}</h2>
            <p className="text-sm text-[#4A5568] mt-1">{plan.blurb}</p>
            <p className="text-sm text-[#1A1A1A] mt-2">
              {plan.seats ? `${plan.seats} seats` : 'Unlimited seats'}
            </p>
            <p className="ops-meta mt-2">{plan.stripeProductHint}</p>
            <ul className="mt-3 text-xs text-[#4A5568] space-y-1">
              <li>Monthly secret: {plan.monthlyEnv} {billing?.prices?.[plan.monthlyEnv] ? '· set' : '· missing'}</li>
              <li>Yearly secret: {plan.yearlyEnv} {billing?.prices?.[plan.yearlyEnv] ? '· set' : '· missing'}</li>
            </ul>
          </div>
        ))}
      </div>

      <section className="card p-4 mt-4">
        <h2 className="ops-section-title">How charging works</h2>
        <ol className="mt-3 text-sm text-[#1A1A1A] space-y-2 list-decimal pl-5">
          <li>Create three Products in Stripe (Starter, Crew, Shop). Put monthly and yearly Prices on each Product — never mix tiers on one Product.</li>
          <li>Add a restricted key (`rk_`) as <code>STRIPE_SECRET_KEY</code> on <code>platform-operator</code> and <code>stripe-webhook</code>.</li>
          <li>Paste Price IDs into the <code>STRIPE_PRICE_*</code> secrets listed above.</li>
          <li>Point a Stripe webhook at <code>/functions/v1/stripe-webhook</code> with <code>STRIPE_WEBHOOK_SECRET</code>.</li>
          <li>Open a company and run Checkout. They pay. The webhook marks them paying.</li>
          <li>Customer Portal is for card changes and cancel. Open it from the company page.</li>
        </ol>
        <p className="ops-meta mt-4">{STRIPE_TAX_NOTE}</p>
        <p className="ops-meta mt-2">
          New signups start on a 14-day trial. You can still suspend a company that has not paid.
        </p>
        <p className="mt-3">
          <Link to="/operator/companies" className="text-[#2E75B6] hover:underline text-sm font-medium">
            Open companies to start Checkout
          </Link>
        </p>
      </section>
    </div>
  );
}
