import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, EmptyState, SearchBar, ContextMenu, ConfirmDialog, SummaryCard, useToast, ViewToggle, useViewMode } from '../components/ui';
import { SkeletonRow, SkeletonSummaryCards } from '../components/ui/Skeletons';
import type { MenuEntry } from '../components/ui';
import { format, parseISO, isPast } from 'date-fns';
import { Plus, Search, FileText, X, Trash2, Pencil, MoreVertical, RefreshCw, DollarSign, Calendar } from 'lucide-react';
import type { ServiceContract, ServiceContractWithClient, ContractStatus } from '../types/fsm';
import { CONTRACT_STATUS_LABELS, CONTRACT_STATUS_STYLES, BILLING_CYCLE_LABELS, SERVICE_FREQUENCY_LABELS, formatMoney } from '../types/fsm';
import type { Client } from '../types/crm';

const STATUS_TABS: { key: 'all' | ContractStatus; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'pending', label: 'Pending' },
  { key: 'expired', label: 'Expired' },
  { key: 'cancelled', label: 'Cancelled' },
];

export function ContractsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ContractStatus>('all');
  const [editingContract, setEditingContract] = useState<ServiceContract | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ServiceContractWithClient | null>(null);
  const [viewMode, setViewMode] = useViewMode('contracts', 'list');

  const { data: contracts, isLoading, error } = useQuery({
    queryKey: ['service-contracts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_contracts')
        .select('*')
        .eq('company_id', profile!.company_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as ServiceContract[];
      if (list.length === 0) return [] as ServiceContractWithClient[];
      const clientIds = [...new Set(list.map(c => c.client_id))];
      const { data: clients } = await supabase.from('clients').select('id, name').in('id', clientIds);
      const clientMap = new Map((clients ?? []).map((c: Pick<Client, 'id' | 'name'>) => [c.id, c.name]));
      return list.map(c => ({ ...c, client_name: clientMap.get(c.client_id) ?? null })) as ServiceContractWithClient[];
    },
    enabled: !!profile,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('service_contracts').delete().eq('id', id).eq('company_id', profile!.company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-contracts'] });
      showToast('Contract deleted');
    },
  });

  const filtered = useMemo(() => {
    const all = contracts ?? [];
    return all.filter(c => {
      if (statusFilter !== 'all' && c.status !== statusFilter) return false;
      const q = search.toLowerCase();
      if (!q) return true;
      return [c.title, c.contract_number, c.client_name].filter(Boolean).some(v => v!.toLowerCase().includes(q));
    });
  }, [contracts, search, statusFilter]);

  const totals = useMemo(() => {
    const all = contracts ?? [];
    const active = all.filter(c => c.status === 'active');
    return {
      total: all.length,
      activeValue: active.reduce((s, c) => s + Number(c.contract_value), 0),
      dueSoon: all.filter(c => c.next_service_date && !isPast(parseISO(c.next_service_date))).length,
      overdue: all.filter(c => c.next_service_date && isPast(parseISO(c.next_service_date))).length,
    };
  }, [contracts]);

  if (error) return <AppShell><PageError message="Could not load contracts" /></AppShell>;

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Service Contracts</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">{totals.total} total contracts</p>
          </div>
          <button onClick={() => { setEditingContract(null); setShowForm(true); }} className="btn-primary">
            <Plus size={16} /> New Contract
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {isLoading ? (
            <SkeletonSummaryCards count={4} />
          ) : (
            <>
              <SummaryCard label="Total" value={totals.total} accentColor="#0A2540" />
              <SummaryCard label="Active Value" value={formatMoney(totals.activeValue)} accentColor="#16A34A" />
              <SummaryCard label="Due Soon" value={totals.dueSoon} accentColor="#2E75B6" />
              <SummaryCard label="Overdue" value={totals.overdue} accentColor="#DC2626" />
            </>
          )}
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Search contracts..." />
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>

        <div className="flex items-center gap-1 mb-4 border-b border-[#E5E7EB] overflow-x-auto">
          {STATUS_TABS.map(tab => {
            const count = tab.key === 'all' ? (contracts?.length ?? 0) : (contracts?.filter(c => c.status === tab.key).length ?? 0);
            const active = statusFilter === tab.key;
            return (
              <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  active ? 'border-[#0A2540] text-[#0A2540]' : 'border-transparent text-[#4A5568] hover:text-[#1A1A1A]'}`}>
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? 'bg-[#0A2540] text-white' : 'bg-gray-100 text-[#6B7280]'}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No contracts yet"
            message="Create your first service contract to get started."
            action={
              <button onClick={() => { setEditingContract(null); setShowForm(true); }} className="btn-primary">
                <Plus size={16} /> Create your first contract
              </button>
            }
          />
        ) : isLoading ? (
          <SkeletonRow />
        ) : viewMode === 'list' ? (
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F9FAFB] text-left text-xs text-[#6B7280] uppercase tracking-wide">
                  <th className="px-4 py-2.5 font-medium">Contract</th>
                  <th className="px-4 py-2.5 font-medium">Client</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium">Frequency</th>
                  <th className="px-4 py-2.5 font-medium">Next Service</th>
                  <th className="px-4 py-2.5 font-medium text-right">Value</th>
                  <th className="px-4 py-2.5 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {filtered.map(c => <ContractRow key={c.id} contract={c}
                  onEdit={() => { setEditingContract(c); setShowForm(true); }}
                  onDelete={() => setDeleteTarget(c)} />)}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(c => {
              const overdue = c.next_service_date && isPast(parseISO(c.next_service_date));
              return (
                <div key={c.id} onClick={() => { setEditingContract(c); setShowForm(true); }}
                  className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <div className="min-w-0">
                      <p className="font-medium text-[#1A1A1A] truncate">{c.title}</p>
                      {c.contract_number && <p className="text-xs text-[#6B7280] truncate">{c.contract_number}</p>}
                    </div>
                    <span className={`badge ${CONTRACT_STATUS_STYLES[c.status]} shrink-0 ml-2`}>{CONTRACT_STATUS_LABELS[c.status]}</span>
                  </div>
                  <p className="text-xs text-[#4A5568] mb-2">{c.client_name ?? 'No client'}</p>
                  <div className="flex items-center justify-between text-xs">
                    <span className={overdue ? 'text-[#B42318] font-medium' : 'text-[#4A5568]'}>
                      Next: {c.next_service_date ? format(parseISO(c.next_service_date), 'd MMM yyyy') : '—'}
                    </span>
                    <span className="font-semibold text-[#1A1A1A]">{formatMoney(Number(c.contract_value))}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <ContractForm contract={editingContract} onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); queryClient.invalidateQueries({ queryKey: ['service-contracts'] }); showToast(editingContract ? 'Contract updated' : 'Contract created'); }} />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete contract?"
        message="This will permanently remove the contract. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}

function ContractRow({ contract, onEdit, onDelete }: { contract: ServiceContractWithClient; onEdit: () => void; onDelete: () => void }) {
  const overdue = contract.next_service_date && isPast(parseISO(contract.next_service_date));
  const menuItems: MenuEntry[] = [
    { label: 'Edit', icon: Pencil, onClick: onEdit },
    { divider: true },
    { label: 'Delete', icon: Trash2, onClick: onDelete, variant: 'danger' },
  ];

  return (
    <tr className="hover:bg-[#F9FAFB] transition-colors">
      <td className="px-4 py-3">
        <div>
          <p className="font-medium text-[#1A1A1A]">{contract.title}</p>
          {contract.contract_number && <p className="text-xs text-[#6B7280]">{contract.contract_number}</p>}
        </div>
      </td>
      <td className="px-4 py-3 text-[#4A5568]">{contract.client_name ?? '—'}</td>
      <td className="px-4 py-3">
        <span className={`badge ${CONTRACT_STATUS_STYLES[contract.status]}`}>
          {CONTRACT_STATUS_LABELS[contract.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-[#4A5568]">{SERVICE_FREQUENCY_LABELS[contract.service_frequency] ?? contract.service_frequency}</td>
      <td className="px-4 py-3">
        {contract.next_service_date ? (
          <span className={overdue ? 'text-[#B42318] font-medium' : 'text-[#4A5568]'}>
            {format(parseISO(contract.next_service_date), 'dd MMM yyyy')}
          </span>
        ) : '—'}
      </td>
      <td className="px-4 py-3 text-right font-medium text-[#1A1A1A]">{formatMoney(Number(contract.contract_value))}</td>
      <td className="px-4 py-3 relative">
        <ContextMenu items={menuItems} />
      </td>
    </tr>
  );
}

function ContractForm({ contract, onClose, onSaved }: { contract: ServiceContract | null; onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const [form, setForm] = useState({
    title: contract?.title ?? '',
    client_id: contract?.client_id ?? '',
    contract_number: contract?.contract_number ?? '',
    status: contract?.status ?? 'active',
    start_date: contract?.start_date ?? format(new Date(), 'yyyy-MM-dd'),
    end_date: contract?.end_date ?? '',
    billing_cycle: contract?.billing_cycle ?? 'monthly',
    contract_value: contract?.contract_value != null ? String(contract.contract_value) : '',
    service_frequency: contract?.service_frequency ?? 'monthly',
    next_service_date: contract?.next_service_date ?? '',
    auto_generate_jobs: contract?.auto_generate_jobs ?? false,
    description: contract?.description ?? '',
    notes: contract?.notes ?? '',
  });
  const [clients, setClients] = useState<Client[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('clients').select('*').eq('company_id', profile!.company_id).eq('archived', false).order('name')
      .then(({ data }) => setClients((data ?? []) as Client[]));
  }, [profile]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      const payload = {
        company_id: profile!.company_id,
        title: form.title,
        client_id: form.client_id || null,
        contract_number: form.contract_number || null,
        status: form.status,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        billing_cycle: form.billing_cycle,
        contract_value: parseFloat(form.contract_value) || 0,
        service_frequency: form.service_frequency,
        next_service_date: form.next_service_date || null,
        auto_generate_jobs: form.auto_generate_jobs,
        description: form.description || null,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (contract) {
        const { error } = await supabase.from('service_contracts').update(payload).eq('id', contract.id).eq('company_id', profile!.company_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('service_contracts').insert(payload);
        if (error) throw error;
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[8vh] overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB] shrink-0">
          <h2 className="text-lg font-semibold text-[#1A1A1A]">{contract ? 'Edit Contract' : 'New Service Contract'}</h2>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#1A1A1A]"><X size={20} /></button>
        </div>
        <form onSubmit={handleSave} className="flex-1 overflow-auto px-5 py-4 space-y-3">
          <Field label="Title *"><input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="form-input" placeholder="e.g. Annual Maintenance Agreement" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Client *">
              <select required value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))} className="form-input cursor-pointer">
                <option value="">Select client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Contract #"><input value={form.contract_number} onChange={e => setForm(f => ({ ...f, contract_number: e.target.value }))} className="form-input" placeholder="CON-001" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Status">
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as ContractStatus }))} className="form-input cursor-pointer">
                <option value="active">Active</option><option value="pending">Pending</option>
                <option value="expired">Expired</option><option value="cancelled">Cancelled</option>
              </select>
            </Field>
            <Field label="Contract Value"><input type="number" min={0} step="0.01" value={form.contract_value} onChange={e => setForm(f => ({ ...f, contract_value: e.target.value }))} className="form-input" placeholder="0.00" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date"><input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} className="form-input" /></Field>
            <Field label="End Date"><input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} className="form-input" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Billing Cycle">
              <select value={form.billing_cycle} onChange={e => setForm(f => ({ ...f, billing_cycle: e.target.value }))} className="form-input cursor-pointer">
                {Object.entries(BILLING_CYCLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Service Frequency">
              <select value={form.service_frequency} onChange={e => setForm(f => ({ ...f, service_frequency: e.target.value }))} className="form-input cursor-pointer">
                {Object.entries(SERVICE_FREQUENCY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Next Service Date"><input type="date" value={form.next_service_date} onChange={e => setForm(f => ({ ...f, next_service_date: e.target.value }))} className="form-input" /></Field>
          <Field label="Description"><textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} className="form-input min-h-[50px] resize-y" placeholder="What's included in this contract..." /></Field>
          <Field label="Notes"><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="form-input min-h-[50px] resize-y" placeholder="Internal notes..." /></Field>
          {err && <p className="text-sm text-[#B42318]">{err}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#4A5568] border border-[#E5E7EB] rounded-md hover:bg-[#F9FAFB]">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md hover:bg-[#0d2f4e] disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-sm font-medium text-[#4A5568] mb-1 block">{label}</span>{children}</label>;
}
