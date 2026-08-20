import { useState, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { PageError, EmptyState, SearchBar, ContextMenu, ConfirmDialog, useToast, ViewToggle, useViewMode, LoadingSpinner } from '../components/ui';
import type { MenuEntry } from '../components/ui';
import type { Client, ClientWithStats } from '../types/crm';
import { formatMoney } from '../types/fsm';
import { Plus, Users, X, Trash2, CreditCard as Edit3, Archive, ArchiveRestore, Briefcase, FileText, Receipt } from 'lucide-react';
import {
  AU_ADDRESS_PLACEHOLDER,
  AU_EMAIL_PLACEHOLDER,
  AU_PHONE_PLACEHOLDER,
  applyHubScope,
  clientInvoiceMoney,
  clientListStatsQueries,
  clientQuotedTotal,
  clientRecordHref,
  newInvoiceFromClientHref,
  newJobFromClientHref,
  newQuoteFromClientHref,
  visibleClientContacts,
} from '../lib/clientRecords';

export function ClientsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [viewMode, setViewMode] = useViewMode('clients');

  const { data: clients, isLoading, error } = useQuery<ClientWithStats[]>({
    queryKey: ['clients', showArchived, profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data, error } = await supabase
        .from('clients')
        .select('id, company_id, name, contact_person, phone, email, address, notes, archived, created_at')
        .eq('archived', showArchived)
        .eq('company_id', profile.company_id)
        .order('name', { ascending: true });
      if (error) throw error;
      const clientsData = (data ?? []) as Client[];
      const emptyStats = {
        job_count: 0,
        active_jobs: 0,
        last_job_date: null as string | null,
        quoted_total: 0,
        outstanding_total: 0,
        overdue_total: 0,
      };

      const scopes = clientListStatsQueries({
        companyId: profile.company_id,
        clientIds: clientsData.map(c => c.id),
      });
      if (!scopes) {
        return clientsData.map(c => ({ ...c, ...emptyStats }));
      }

      const [jobsRes, quotesRes, invoicesRes] = await Promise.all([
        applyHubScope(supabase.from('jobs'), scopes.jobs),
        applyHubScope(supabase.from('quotes'), scopes.quotes),
        applyHubScope(supabase.from('invoices'), scopes.invoices),
      ]);
      if (jobsRes.error) throw jobsRes.error;
      if (quotesRes.error) throw quotesRes.error;
      if (invoicesRes.error) throw invoicesRes.error;

      const jobRows = (jobsRes.data ?? []) as {
        client_id: string | null;
        status: string;
        scheduled_date: string | null;
      }[];
      const quoteRows = (quotesRes.data ?? []) as {
        client_id: string | null;
        status: string;
        total: number | string | null;
      }[];
      const invoiceRows = (invoicesRes.data ?? []) as {
        client_id: string | null;
        status: string;
        total: number | string | null;
        due_date: string | null;
      }[];

      const jobMap = new Map<string, { total: number; active: number; lastDate: string | null }>();
      for (const j of jobRows) {
        if (!j.client_id) continue;
        const entry = jobMap.get(j.client_id) ?? { total: 0, active: 0, lastDate: null };
        entry.total++;
        if (j.status === 'scheduled' || j.status === 'in_progress') entry.active++;
        if (j.scheduled_date && (!entry.lastDate || j.scheduled_date > entry.lastDate)) {
          entry.lastDate = j.scheduled_date;
        }
        jobMap.set(j.client_id, entry);
      }

      const quotesByClient = new Map<string, { status: string; total: number | string | null }[]>();
      for (const q of quoteRows) {
        if (!q.client_id) continue;
        const list = quotesByClient.get(q.client_id) ?? [];
        list.push({ status: q.status, total: q.total });
        quotesByClient.set(q.client_id, list);
      }

      const invoicesByClient = new Map<string, { status: string; total: number | string | null; due_date: string | null }[]>();
      for (const inv of invoiceRows) {
        if (!inv.client_id) continue;
        const list = invoicesByClient.get(inv.client_id) ?? [];
        list.push({ status: inv.status, total: inv.total, due_date: inv.due_date });
        invoicesByClient.set(inv.client_id, list);
      }

      return clientsData.map(c => {
        const jobs = jobMap.get(c.id);
        const quoted = clientQuotedTotal(quotesByClient.get(c.id) ?? []);
        const { outstanding, overdue } = clientInvoiceMoney(invoicesByClient.get(c.id) ?? []);
        return {
          ...c,
          job_count: jobs?.total ?? 0,
          active_jobs: jobs?.active ?? 0,
          last_job_date: jobs?.lastDate ?? null,
          quoted_total: quoted,
          outstanding_total: outstanding,
          overdue_total: overdue,
        };
      });
    },
    enabled: !!profile?.company_id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      showToast('Client deleted');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from('clients').update({ archived }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      showToast(showArchived ? 'Client restored' : 'Client archived');
    },
  });

  const filtered = useMemo(() => {
    const list = clients ?? [];
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(c =>
      c.name.toLowerCase().includes(q) ||
      (c.contact_person ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.phone ?? '').toLowerCase().includes(q)
    );
  }, [clients, search]);

  if (error) return <AppShell><PageError message="Could not load clients" /></AppShell>;

  return (
    <AppShell>
      <div className="ops-page hub-clients">
        <div className="ops-page-head">
          <div>
            <h1 className="ops-page-title">Clients</h1>
          </div>
          <button
            onClick={() => { setEditingClient(null); setShowForm(true); }}
            className="btn-primary"
          >
            <Plus size={16} /> Add Client
          </button>
        </div>

        <div className="hub-clients-chrome">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name, contact, phone, or email..." className="max-w-sm flex-1" />
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          <button
            type="button"
            onClick={() => setShowArchived(v => !v)}
            className="hub-chrome-filter"
          >
            {showArchived ? 'Archived' : 'Active'}
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Users}
            title={search ? 'No clients match your search' : 'No clients yet'}
            message={search ? 'Try a different search term.' : 'Add your first client to get started.'}
            action={!search && (
              <button onClick={() => { setEditingClient(null); setShowForm(true); }} className="btn-primary">
                <Plus size={16} /> Add your first client
              </button>
            )}
          />
        ) : (
          <div className={viewMode === 'list' ? 'hub-stack hub-stack-tight' : 'hub-stack'}>
            {filtered.map(client => (
              <ClientRow
                key={client.id}
                client={client}
                onEdit={() => { setEditingClient(client); setShowForm(true); }}
                onArchive={() => archiveMutation.mutate({ id: client.id, archived: !client.archived })}
                onDelete={() => setDeleteTarget(client)}
              />
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <ClientForm
          client={editingClient}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            showToast(editingClient ? 'Client updated' : 'Client added');
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete client?"
        message="This will permanently remove the client. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}

function clientMenuItems(client: ClientWithStats, navigate: ReturnType<typeof useNavigate>, onEdit: () => void, onArchive: () => void, onDelete: () => void): MenuEntry[] {
  return [
    { label: 'New quote', icon: FileText, onClick: () => navigate(newQuoteFromClientHref(client.id)) },
    { label: 'New job', icon: Briefcase, onClick: () => navigate(newJobFromClientHref(client.id)) },
    { label: 'New invoice', icon: Receipt, onClick: () => navigate(newInvoiceFromClientHref(client.id)) },
    { divider: true },
    { label: 'Edit', icon: Edit3, onClick: onEdit },
    { label: client.archived ? 'Restore' : 'Archive', icon: client.archived ? ArchiveRestore : Archive, onClick: onArchive },
    { divider: true },
    { label: 'Delete', icon: Trash2, onClick: onDelete, variant: 'danger' },
  ];
}

function clientSignal(client: ClientWithStats) {
  const overdue = client.overdue_total ?? 0;
  if (overdue > 0) {
    return { kind: 'overdue' as const, amount: formatMoney(overdue) };
  }
  if ((client.active_jobs ?? 0) > 0) {
    return { kind: 'live' as const };
  }
  return null;
}

const ClientRow = memo(function ClientRow({
  client, onEdit, onArchive, onDelete,
}: {
  client: ClientWithStats;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const signal = clientSignal(client);
  const site = client.address?.trim() ?? '';
  const lines = visibleClientContacts({ phone: client.phone, email: client.email, address: null });

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(clientRecordHref(client.id))}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(clientRecordHref(client.id)); } }}
      className="hub-row"
    >
      <div className="min-w-0 flex-1">
        <p className="hub-row-name">{client.name}</p>
        {client.contact_person ? (
          <p className="ops-meta truncate">{client.contact_person}</p>
        ) : null}
        {site ? <p className="ops-meta truncate">{site}</p> : null}
        {lines.length > 0 ? (
          <div className="mt-1 flex flex-col gap-0.5 min-w-0">
            {lines.map(line => (
              <a
                key={line.kind}
                href={line.href}
                className="ops-link truncate"
                onClick={e => e.stopPropagation()}
              >
                {line.label}
              </a>
            ))}
          </div>
        ) : null}
      </div>
      {signal?.kind === 'overdue' ? (
        <div className="hub-row-signal">
          <p className="hub-signal-amount text-fail">{signal.amount}</p>
          <p className="ops-meta">Overdue</p>
        </div>
      ) : signal?.kind === 'live' ? (
        <p className="hub-row-signal ops-meta">Live</p>
      ) : null}
      <div className="shrink-0" onClick={e => e.stopPropagation()}>
        <ContextMenu items={clientMenuItems(client, navigate, onEdit, onArchive, onDelete)} />
      </div>
    </div>
  );
});

export function ClientForm({ client, onClose, onSaved }: {
  client: Client | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [form, setForm] = useState({
    name: client?.name ?? '',
    contact_person: client?.contact_person ?? '',
    phone: client?.phone ?? '',
    email: client?.email ?? '',
    address: client?.address ?? '',
    notes: client?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Name is required'); return; }
    if (!profile?.company_id) return;
    setSaving(true);
    setErr('');

    const payload = {
      name: form.name.trim(),
      contact_person: form.contact_person.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      notes: form.notes.trim() || null,
    };

    const { error } = client
      ? await supabase.from('clients').update(payload).eq('id', client.id)
      : await supabase.from('clients').insert({ ...payload, company_id: profile.company_id });

    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-rule">
          <h2 className="text-base font-semibold text-navy">{client ? 'Edit Client' : 'New Client'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-zebra text-muted">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overlay-body">
          <div className="overlay-form-grid">
            <Field label="Client / Business Name" required>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                className="form-input" placeholder="e.g. Acme Electrical" autoFocus />
            </Field>
            <Field label="Contact Person">
              <input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))}
                className="form-input" placeholder="e.g. Alex Nguyen" />
            </Field>
            <Field label="Phone">
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="form-input" placeholder={AU_PHONE_PLACEHOLDER} inputMode="tel" autoComplete="tel" />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="form-input" placeholder={AU_EMAIL_PLACEHOLDER} autoComplete="email" />
            </Field>
            <div className="overlay-form-span-2">
              <Field label="Address">
                <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="form-input" placeholder={AU_ADDRESS_PLACEHOLDER} autoComplete="street-address" />
              </Field>
            </div>
            <div className="overlay-form-span-all">
              <Field label="Notes">
                <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="form-input min-h-[80px] resize-y" placeholder="Any notes about this client..." />
              </Field>
            </div>
            {err && <p className="overlay-form-span-all text-sm text-fail">{err}</p>}
          </div>
        </form>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-rule">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} className="btn-primary min-h-[44px] disabled:opacity-50">
            {saving ? 'Saving...' : client ? 'Save Changes' : 'Add Client'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="ops-field-label">
        {label}{required && <span className="text-fail"> *</span>}
      </label>
      {children}
    </div>
  );
}
