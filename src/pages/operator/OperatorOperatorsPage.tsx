import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserCog } from 'lucide-react';
import { PageHeader, LoadingSpinner, PageError, EmptyState, ConfirmDialog, useToast } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import {
  callOperatorApi,
  canRemoveOperator,
  type PlatformOperatorRow,
} from '../../lib/platformOperator';

export function OperatorOperatorsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [removing, setRemoving] = useState<PlatformOperatorRow | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['operator', 'operators'],
    queryFn: async () => {
      const res = await callOperatorApi({ action: 'list_operators' });
      if (!res.ok) throw new Error(res.error);
      return (res.operators ?? []) as PlatformOperatorRow[];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['operator'] });
  };

  const addMut = useMutation({
    mutationFn: async (value: string) => {
      const res = await callOperatorApi({ action: 'add_operator', email: value });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      showToast('Developer appointed');
      setEmail('');
      invalidate();
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  });

  const removeMut = useMutation({
    mutationFn: async (userId: string) => {
      const res = await callOperatorApi({ action: 'remove_operator', user_id: userId });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      showToast('Developer removed');
      setRemoving(null);
      invalidate();
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  });

  const onAppoint = (event: FormEvent) => {
    event.preventDefault();
    addMut.mutate(email);
  };

  const operators = data ?? [];
  const lastOnly = operators.length <= 1;

  return (
    <div>
      <PageHeader
        title="Developers"
        subtitle="Appoint people who can run Grafter: companies, billing, and this console. Company admin is not this."
      />

      <form className="card p-4 mt-4" onSubmit={onAppoint}>
        <h2 className="ops-section-title">Appoint a developer</h2>
        <p className="ops-meta mt-2">
          They must already have a Grafter login. Enter that email. They get the same operator controls as you.
        </p>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
          <label className="sr-only" htmlFor="appoint-email">Account email</label>
          <input
            id="appoint-email"
            type="email"
            autoComplete="off"
            placeholder="they@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="form-input sm:max-w-[320px]"
            required
          />
          <button type="submit" className="btn-primary min-h-[44px]" disabled={addMut.isPending}>
            {addMut.isPending ? 'Appointing…' : 'Appoint'}
          </button>
        </div>
      </form>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : error ? (
        <PageError message={error instanceof Error ? error.message : 'Could not load developers'} />
      ) : !operators.length ? (
        <EmptyState icon={UserCog} title="No developers" message="Appoint an existing Grafter account to help run the product." />
      ) : (
        <div className="card mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-[#4A5568] border-b border-[#E5E7EB]">
                <th className="px-4 py-3 font-medium">Developer</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Appointed</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {operators.map(row => {
                const you = row.user_id === user?.id;
                const removable = canRemoveOperator(operators, row.user_id).ok;
                return (
                  <tr key={row.user_id} className="border-b border-[#F3F4F6] last:border-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#0A2540]">{row.name || row.email}</p>
                      <p className="text-xs text-[#4A5568]">
                        {row.email}{you ? ' · you' : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3">{row.company_name || '—'}</td>
                    <td className="px-4 py-3 text-[#4A5568] whitespace-nowrap">
                      {new Date(row.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        className="btn-danger min-h-[44px]"
                        disabled={!removable || removeMut.isPending}
                        title={lastOnly ? 'Cannot remove the last developer. Appoint someone else first.' : undefined}
                        onClick={() => setRemoving(row)}
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(removing)}
        title={removing?.user_id === user?.id ? 'Remove your own developer access?' : `Remove ${removing?.email}?`}
        message={
          removing?.user_id === user?.id
            ? 'You will lose the operator console until another developer appoints you again.'
            : 'They will lose operator controls. Their company login stays.'
        }
        confirmLabel="Remove"
        variant="danger"
        onCancel={() => setRemoving(null)}
        onConfirm={() => {
          if (removing) removeMut.mutate(removing.user_id);
        }}
      />
    </div>
  );
}
