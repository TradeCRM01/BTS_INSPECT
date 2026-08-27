import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserCog } from 'lucide-react';
import { PageHeader, LoadingSpinner, PageError, EmptyState, ConfirmDialog, useToast } from '../../components/ui';
import { useAuth } from '../../contexts/AuthContext';
import {
  callOperatorApi,
  canRemoveOperator,
  REMOVE_LAST_DEVELOPER,
  type PlatformOperatorRow,
} from '../../lib/platformOperator';

export function OperatorOperatorsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [email, setEmail] = useState('');
  const [appointMiss, setAppointMiss] = useState('');
  const [removeMiss, setRemoveMiss] = useState('');
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
      setAppointMiss('');
      invalidate();
    },
    onError: (err: Error) => setAppointMiss(err.message),
  });

  const removeMut = useMutation({
    mutationFn: async (userId: string) => {
      const res = await callOperatorApi({ action: 'remove_operator', user_id: userId });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      showToast('Developer removed');
      setRemoving(null);
      setRemoveMiss('');
      invalidate();
    },
    onError: (err: Error) => {
      setRemoving(null);
      setRemoveMiss(err.message);
    },
  });

  const onAppoint = (event: FormEvent) => {
    event.preventDefault();
    addMut.mutate(email);
  };

  const operators = data ?? [];
  const lastOnly = operators.length <= 1;

  return (
    <div id="operator-developers">
      <PageHeader
        title="Developers"
        subtitle="Appoint people who can run Grafter: companies, billing, and this console. Company admin is not this."
      />

      <form className="dev-sheet" onSubmit={onAppoint}>
        <h2 className="ops-section-title">Appoint a developer</h2>
        <p className="dev-meta">
          They must already have a Grafter login. Enter that email. They get the same operator controls as you.
        </p>
        <div className="dev-write">
          <label className="dev-label" htmlFor="appoint-email">Account email</label>
          <div className="dev-act">
            <input
              id="appoint-email"
              type="email"
              autoComplete="off"
              placeholder="they@company.com"
              value={email}
              onChange={e => {
                setEmail(e.target.value);
                if (appointMiss) setAppointMiss('');
              }}
              className="dev-email"
              required
            />
            <button type="submit" className="btn-primary" disabled={addMut.isPending}>
              {addMut.isPending ? 'Appointing…' : 'Appoint'}
            </button>
          </div>
          {appointMiss ? <p className="dev-miss">{appointMiss}</p> : null}
        </div>
      </form>

      {isLoading ? (
        <div className="flex justify-center py-16"><LoadingSpinner /></div>
      ) : error ? (
        <PageError message={error instanceof Error ? error.message : 'Could not load developers'} />
      ) : !operators.length ? (
        <EmptyState icon={UserCog} title="No developers" message="Appoint an existing Grafter account to help run the product." />
      ) : (
        <div className="dev-sheet">
          <div className="dev-rows">
            {operators.map(row => {
              const you = row.user_id === user?.id;
              const removable = canRemoveOperator(operators, row.user_id).ok;
              return (
                <div key={row.user_id} className="dev-row">
                  <div className="dev-row-main">
                    <p className="dev-name">{row.name || row.email}</p>
                    <p className="dev-meta">
                      {row.email}{you ? ' · you' : ''}
                    </p>
                    <p className="dev-meta">
                      {row.company_name || '—'} · {new Date(row.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {removable ? (
                    <button
                      type="button"
                      className="dev-remove"
                      disabled={removeMut.isPending}
                      onClick={() => setRemoving(row)}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
          {lastOnly ? <p className="dev-miss">{REMOVE_LAST_DEVELOPER}</p> : null}
          {removeMiss ? <p className="dev-miss">{removeMiss}</p> : null}
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
