import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ScrollText } from 'lucide-react';
import { PageHeader, LoadingSpinner, PageError, EmptyState } from '../../components/ui';
import { callOperatorApi, type OperatorEvent } from '../../lib/platformOperator';

export function OperatorAuditPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['operator', 'events'],
    queryFn: async () => {
      const res = await callOperatorApi({ action: 'list_events' });
      if (!res.ok) throw new Error(res.error);
      return (res.events ?? []) as OperatorEvent[];
    },
  });

  return (
    <div>
      <PageHeader
        title="Audit"
        subtitle="Suspend, plan changes, Checkout, and new signups."
      />
      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : error ? (
        <PageError message={error instanceof Error ? error.message : 'Could not load audit'} />
      ) : !data?.length ? (
        <EmptyState icon={ScrollText} title="No events yet" message="Actions you take on companies, plus Stripe webhooks, show up here." />
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[#4A5568] border-b border-[#E5E7EB]">
                <th className="px-4 py-3 font-medium">When</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Who</th>
              </tr>
            </thead>
            <tbody>
              {data.map(evt => (
                <tr key={evt.id} className="border-b border-[#F3F4F6] last:border-0">
                  <td className="px-4 py-3 text-[#4A5568] whitespace-nowrap">
                    {new Date(evt.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-medium">{evt.action}</td>
                  <td className="px-4 py-3">
                    {evt.company_id ? (
                      <Link to={`/operator/companies/${evt.company_id}`} className="text-[#2E75B6] hover:underline">
                        {evt.company_name || evt.company_id}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">{evt.actor_email || 'system'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
