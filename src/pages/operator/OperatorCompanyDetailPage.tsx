import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader, LoadingSpinner, PageError, StatusBadge, ConfirmDialog, useToast } from '../../components/ui';
import {
  ACCESS_STATUS_LABELS,
  ACCESS_STATUS_STYLES,
  BILLING_STATUS_LABELS,
  BILLING_STATUS_STYLES,
  GRAFTER_PLANS,
  STRIPE_SECRET_MISS,
  callOperatorApi,
  grafterPlan,
  trialLabel,
  type BillingInterval,
  type GrafterPlanId,
  type OperatorCompanyDetail,
} from '../../lib/platformOperator';

export function OperatorCompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const checkout = params.get('checkout');
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [notes, setNotes] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [interval, setInterval] = useState<BillingInterval>('month');

  const { data, isLoading, error } = useQuery({
    queryKey: ['operator', 'company', id],
    enabled: !!id,
    queryFn: async () => {
      const res = await callOperatorApi({ action: 'get_company', company_id: id! });
      if (!res.ok) throw new Error(res.error);
      const detail = res.detail as OperatorCompanyDetail;
      setNotes(detail.company.notes);
      return detail;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['operator'] });
  };

  const accessMut = useMutation({
    mutationFn: async (access_status: 'active' | 'suspended') => {
      const res = await callOperatorApi({
        action: 'set_access',
        company_id: id!,
        access_status,
        reason,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      showToast('Access updated');
      setConfirmSuspend(false);
      setReason('');
      invalidate();
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  });

  const planMut = useMutation({
    mutationFn: async (plan: GrafterPlanId) => {
      const res = await callOperatorApi({ action: 'set_plan', company_id: id!, plan });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      showToast('Plan updated');
      invalidate();
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  });

  const notesMut = useMutation({
    mutationFn: async () => {
      const res = await callOperatorApi({ action: 'set_notes', company_id: id!, notes: notes ?? '' });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      showToast('Notes saved');
      invalidate();
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  });

  const trialMut = useMutation({
    mutationFn: async () => {
      const ends = new Date(Date.now() + 14 * 86_400_000).toISOString();
      const res = await callOperatorApi({ action: 'set_trial', company_id: id!, trial_ends_at: ends });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      showToast('Trial extended 14 days');
      invalidate();
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  });

  const checkoutMut = useMutation({
    mutationFn: async (plan: GrafterPlanId) => {
      const res = await callOperatorApi({
        action: 'create_checkout',
        company_id: id!,
        plan,
        interval,
        origin: window.location.origin,
      });
      if (!res.ok) throw new Error(res.miss || res.error);
      if (!res.url) throw new Error(res.miss || 'No Checkout URL');
      window.location.href = res.url;
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  });

  const portalMut = useMutation({
    mutationFn: async () => {
      const res = await callOperatorApi({
        action: 'create_portal',
        company_id: id!,
        origin: window.location.origin,
      });
      if (!res.ok) throw new Error(res.miss || res.error);
      if (!res.url) throw new Error(res.miss || 'No portal URL');
      window.location.href = res.url;
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  });

  if (isLoading) {
    return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  }
  if (error || !data) {
    return <PageError message={error instanceof Error ? error.message : 'Company not found'} />;
  }

  const { company, people, events, billing } = data;
  const suspended = company.access_status === 'suspended';
  const stripeMiss = billing.miss || (!billing.stripe_configured ? STRIPE_SECRET_MISS : null);

  return (
    <div>
      <p className="ops-meta mb-2">
        <Link to="/operator/companies" className="text-[#2E75B6] hover:underline">Companies</Link>
        {' / '}
        {company.name}
      </p>
      <PageHeader
        title={company.name}
        subtitle={company.email || 'No company email'}
        action={
          suspended ? (
            <button type="button" className="btn-primary" onClick={() => accessMut.mutate('active')}>
              Restore access
            </button>
          ) : (
            <button type="button" className="btn-danger" onClick={() => setConfirmSuspend(true)}>
              Suspend
            </button>
          )
        }
      />

      {checkout === 'success' && (
        <div className="mt-4 bg-emerald-50 border border-emerald-200 text-emerald-800 px-3 py-2.5 rounded-md text-sm">
          Checkout finished. Billing status updates when the Stripe webhook runs.
        </div>
      )}
      {checkout === 'cancel' && (
        <div className="mt-4 bg-orange-50 border border-orange-200 text-orange-800 px-3 py-2.5 rounded-md text-sm">
          Checkout cancelled. Nothing was charged.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-[#4A5568]">Access</p>
          <div className="mt-2">
            <StatusBadge
              status={company.access_status}
              customMap={{
                active: { label: ACCESS_STATUS_LABELS.active, cls: ACCESS_STATUS_STYLES.active },
                suspended: { label: ACCESS_STATUS_LABELS.suspended, cls: ACCESS_STATUS_STYLES.suspended },
              }}
            />
          </div>
          <label className="form-label mt-3">Suspend reason</label>
          <input
            className="form-input"
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="Optional note for the audit log"
          />
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-[#4A5568]">Billing</p>
          <div className="mt-2">
            <StatusBadge
              status={company.billing_status}
              customMap={Object.fromEntries(
                Object.entries(BILLING_STATUS_LABELS).map(([k, label]) => [
                  k,
                  { label, cls: BILLING_STATUS_STYLES[k as keyof typeof BILLING_STATUS_STYLES] },
                ]),
              )}
            />
          </div>
          {company.billing_status === 'trial' && (
            <p className="text-xs text-[#4A5568] mt-2">{trialLabel(company.trial_ends_at)}</p>
          )}
          <button
            type="button"
            className="btn-secondary w-full mt-3"
            disabled={trialMut.isPending}
            onClick={() => trialMut.mutate()}
          >
            Extend trial 14 days
          </button>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-[#4A5568]">Plan</p>
          <p className="text-lg font-semibold text-[#1A1A1A] mt-1">{grafterPlan(company.plan).name}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs uppercase tracking-wide text-[#4A5568]">People</p>
          <p className="text-lg font-semibold text-[#1A1A1A] mt-1">{company.people_count}</p>
        </div>
      </div>

      <section className="card p-4 mt-4">
        <h2 className="ops-section-title">People</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[#4A5568] border-b border-[#E5E7EB]">
                <th className="py-2 pr-3 font-medium">Name</th>
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Role</th>
              </tr>
            </thead>
            <tbody>
              {people.map(p => (
                <tr key={p.id} className="border-b border-[#F3F4F6] last:border-0">
                  <td className="py-2 pr-3">{p.name}</td>
                  <td className="py-2 pr-3">{p.email}</td>
                  <td className="py-2 pr-3">{p.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-4 mt-4">
        <h2 className="ops-section-title">Charge this company</h2>
        <p className="ops-meta mt-1">
          Checkout opens Stripe for a subscription. Customer Portal is for card updates and cancel.
        </p>
        {stripeMiss && (
          <p className="mt-3 text-sm text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] rounded-md px-3 py-2">
            {stripeMiss}
          </p>
        )}
        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <select
            className="form-input sm:max-w-[200px]"
            value={interval}
            onChange={e => setInterval(e.target.value as BillingInterval)}
          >
            <option value="month">Monthly</option>
            <option value="year">Yearly</option>
          </select>
          <button
            type="button"
            className="btn-secondary"
            disabled={portalMut.isPending || !company.stripe_customer_id}
            onClick={() => portalMut.mutate()}
          >
            {portalMut.isPending ? 'Opening…' : 'Customer Portal'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          {GRAFTER_PLANS.map(plan => (
            <div key={plan.id} className="border border-[#E5E7EB] rounded-md p-3">
              <p className="font-semibold text-[#1A1A1A]">{plan.name}</p>
              <p className="text-sm text-[#4A5568] mt-1">{plan.blurb}</p>
              <p className="text-xs text-[#4A5568] mt-1">
                {plan.seats ? `${plan.seats} seats` : 'Unlimited seats'}
              </p>
              <button
                type="button"
                className="btn-primary w-full mt-3"
                disabled={checkoutMut.isPending}
                onClick={() => checkoutMut.mutate(plan.id)}
              >
                Checkout {plan.name}
              </button>
              <button
                type="button"
                className="btn-secondary w-full mt-2"
                disabled={planMut.isPending}
                onClick={() => planMut.mutate(plan.id)}
              >
                Set plan without charge
              </button>
            </div>
          ))}
        </div>
        <p className="ops-meta mt-3">
          Stripe customer: {company.stripe_customer_id || 'none'}
          {company.stripe_subscription_id ? ` · sub ${company.stripe_subscription_id}` : ''}
        </p>
      </section>

      <section className="card p-4 mt-4">
        <h2 className="ops-section-title">Operator notes</h2>
        <textarea
          className="form-input mt-3 min-h-[96px]"
          value={notes ?? ''}
          onChange={e => setNotes(e.target.value)}
          placeholder="Private notes. Company admins never see this."
        />
        <button type="button" className="btn-primary mt-3" disabled={notesMut.isPending} onClick={() => notesMut.mutate()}>
          Save notes
        </button>
      </section>

      <section className="card p-4 mt-4">
        <h2 className="ops-section-title">Audit</h2>
        {events.length === 0 ? (
          <p className="ops-meta mt-2">No events yet.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {events.map(evt => (
              <li key={evt.id} className="text-sm text-[#1A1A1A]">
                <span className="font-medium">{evt.action}</span>
                <span className="text-[#4A5568]"> · {evt.actor_email || 'system'} · {new Date(evt.created_at).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConfirmDialog
        open={confirmSuspend}
        title={`Suspend ${company.name}?`}
        message="Everyone in this company will be locked out of Grafter until you restore access."
        confirmLabel="Suspend"
        variant="danger"
        onCancel={() => setConfirmSuspend(false)}
        onConfirm={() => accessMut.mutate('suspended')}
      />
    </div>
  );
}
