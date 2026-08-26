import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Building2, CreditCard, Users, Ban, AlertTriangle } from 'lucide-react';
import { PageHeader, SummaryCard, LoadingSpinner, PageError, StatusBadge } from '../../components/ui';
import {
  ACCESS_STATUS_LABELS,
  ACCESS_STATUS_STYLES,
  BILLING_STATUS_LABELS,
  BILLING_STATUS_STYLES,
  callOperatorApi,
  grafterPlan,
  trialLabel,
  type OperatorOverview,
} from '../../lib/platformOperator';

export function OperatorOverviewPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['operator', 'overview'],
    queryFn: async () => {
      const res = await callOperatorApi({ action: 'overview' });
      if (!res.ok) throw new Error(res.error);
      return res.overview as OperatorOverview;
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }
  if (error || !data) {
    return <PageError message={error instanceof Error ? error.message : 'Could not load operator overview'} />;
  }

  return (
    <div>
      <PageHeader
        title="Grafter operator"
        subtitle="Every business that signed up. Company admins cannot see this."
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
        <SummaryCard label="Companies" value={data.companies} icon={<Building2 size={12} />} />
        <SummaryCard label="People" value={data.people} icon={<Users size={12} />} accentColor="#0A2540" />
        <SummaryCard label="Paying" value={data.paying} icon={<CreditCard size={12} />} accentColor="#059669" />
        <SummaryCard label="Trial" value={data.trial} icon={<CreditCard size={12} />} />
        <SummaryCard label="Past due" value={data.past_due} icon={<AlertTriangle size={12} />} accentColor="#B45309" />
        <SummaryCard label="Suspended" value={data.suspended} icon={<Ban size={12} />} accentColor="#DC2626" />
      </div>

      <h2 className="ops-section-title mt-8">Recent companies</h2>
      <div className="card mt-3 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-[#4A5568] border-b border-[#E5E7EB]">
              <th className="px-4 py-3 font-medium">Company</th>
              <th className="px-4 py-3 font-medium">Access</th>
              <th className="px-4 py-3 font-medium">Billing</th>
              <th className="px-4 py-3 font-medium">Plan</th>
              <th className="px-4 py-3 font-medium">People</th>
            </tr>
          </thead>
          <tbody>
            {data.recent.map(row => (
              <tr key={row.id} className="border-b border-[#F3F4F6] last:border-0">
                <td className="px-4 py-3">
                  <Link to={`/operator/companies/${row.id}`} className="font-medium text-[#0A2540] hover:underline">
                    {row.name}
                  </Link>
                  <p className="text-xs text-[#4A5568]">{row.email || 'No email'}</p>
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    status={row.access_status}
                    customMap={{
                      active: { label: ACCESS_STATUS_LABELS.active, cls: ACCESS_STATUS_STYLES.active },
                      suspended: { label: ACCESS_STATUS_LABELS.suspended, cls: ACCESS_STATUS_STYLES.suspended },
                    }}
                  />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    status={row.billing_status}
                    customMap={Object.fromEntries(
                      Object.entries(BILLING_STATUS_LABELS).map(([k, label]) => [
                        k,
                        { label, cls: BILLING_STATUS_STYLES[k as keyof typeof BILLING_STATUS_STYLES] },
                      ]),
                    )}
                  />
                  {row.billing_status === 'trial' && (
                    <p className="text-xs text-[#4A5568] mt-1">{trialLabel(row.trial_ends_at)}</p>
                  )}
                </td>
                <td className="px-4 py-3">{grafterPlan(row.plan).name}</td>
                <td className="px-4 py-3">{row.people_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
