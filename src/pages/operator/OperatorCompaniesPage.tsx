import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { PageHeader, SearchBar, LoadingSpinner, PageError, EmptyState, StatusBadge } from '../../components/ui';
import {
  ACCESS_STATUS_LABELS,
  ACCESS_STATUS_STYLES,
  BILLING_STATUS_LABELS,
  BILLING_STATUS_STYLES,
  GRAFTER_PLANS,
  callOperatorApi,
  grafterPlan,
  trialLabel,
  type CompanyAccessStatus,
  type CompanyBillingStatus,
  type OperatorCompanyRow,
} from '../../lib/platformOperator';

const ACCESS_FILTERS: { id: 'all' | CompanyAccessStatus; label: string }[] = [
  { id: 'all', label: 'All access' },
  { id: 'active', label: 'Active' },
  { id: 'suspended', label: 'Suspended' },
];

const BILLING_FILTERS: { id: 'all' | CompanyBillingStatus; label: string }[] = [
  { id: 'all', label: 'All billing' },
  { id: 'trial', label: 'Trial' },
  { id: 'active', label: 'Paying' },
  { id: 'past_due', label: 'Past due' },
  { id: 'canceled', label: 'Canceled' },
  { id: 'none', label: 'Not billed' },
];

export function OperatorCompaniesPage() {
  const [q, setQ] = useState('');
  const [access, setAccess] = useState<'all' | CompanyAccessStatus>('all');
  const [billing, setBilling] = useState<'all' | CompanyBillingStatus>('all');

  const { data, isLoading, error } = useQuery({
    queryKey: ['operator', 'companies', q, access, billing],
    queryFn: async () => {
      const res = await callOperatorApi({ action: 'list_companies', q, access, billing });
      if (!res.ok) throw new Error(res.error);
      return (res.companies ?? []) as OperatorCompanyRow[];
    },
  });

  const planCounts = useMemo(() => {
    const rows = data ?? [];
    return GRAFTER_PLANS.map(p => ({ id: p.id, name: p.name, n: rows.filter(r => r.plan === p.id).length }));
  }, [data]);

  return (
    <div>
      <PageHeader
        title="Companies"
        subtitle="Every tenant. Suspend to lock them out of Grafter. Charge them from the company page."
      />
      <div className="flex flex-col gap-3 mt-4">
        <SearchBar value={q} onChange={setQ} placeholder="Search company or email" />
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            className="form-input sm:max-w-[200px]"
            value={access}
            onChange={e => setAccess(e.target.value as typeof access)}
          >
            {ACCESS_FILTERS.map(f => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
          <select
            className="form-input sm:max-w-[200px]"
            value={billing}
            onChange={e => setBilling(e.target.value as typeof billing)}
          >
            {BILLING_FILTERS.map(f => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {planCounts.some(p => p.n > 0) && (
        <p className="ops-meta mt-3">
          {planCounts.filter(p => p.n).map(p => `${p.name} ${p.n}`).join(' · ')}
        </p>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : error ? (
        <PageError message={error instanceof Error ? error.message : 'Could not load companies'} />
      ) : !data?.length ? (
        <EmptyState icon={Building2} title="No companies" message="New signups create a tenant here. Invited team members join an existing company." />
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[#4A5568] border-b border-[#E5E7EB]">
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Access</th>
                <th className="px-4 py-3 font-medium">Billing</th>
                <th className="px-4 py-3 font-medium">Plan</th>
                <th className="px-4 py-3 font-medium">People</th>
                <th className="px-4 py-3 font-medium">Joined</th>
              </tr>
            </thead>
            <tbody>
              {data.map(row => (
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
                  <td className="px-4 py-3 text-[#4A5568]">
                    {row.created_at ? new Date(row.created_at).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
