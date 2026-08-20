import { useState, useMemo, memo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { PageError, EmptyState, SearchBar, ContextMenu, ConfirmDialog, useToast, ViewToggle, useViewMode } from '../components/ui';
import { SkeletonCardGrid } from '../components/ui/Skeletons';
import type { MenuEntry } from '../components/ui';
import type { Client, ClientWithStats } from '../types/crm';
import { formatMoney } from '../types/fsm';
import { Plus, Users, X, Trash2, CreditCard as Edit3, Archive, ArchiveRestore, Briefcase, FileText, Receipt } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  AU_ADDRESS_PLACEHOLDER,
  AU_EMAIL_PLACEHOLDER,
  AU_PHONE_PLACEHOLDER,
  applyHubScope,
  clientInvoiceMoney,
  clientListMoneyHint,
  clientListStatsQueries,
  clientQuotedTotal,
  clientRecordHref,
  mailtoHref,
  newInvoiceFromClientHref,
  newJobFromClientHref,
  newQuoteFromClientHref,
  telHref,
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
      <div className="ops-page">
        <div className="ops-page-head">
          <div>
            <h1 className="ops-page-title">Clients</h1>
            <p className="ops-meta mt-0.5">{clients?.length ?? 0} total clients</p>
          </div>
          <button
            onClick={() => { setEditingClient(null); setShowForm(true); }}
            className="btn-primary"
          >
            <Plus size={16} /> Add Client
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name, contact, phone, or email..." className="max-w-sm flex-1" />
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          <button
            onClick={() => setShowArchived(v => !v)}
            className={`ops-seg-btn ${showArchived ? 'ops-seg-btn-on' : 'ops-seg-btn-off'}`}
          >
            <Archive size={14} />
            {showArchived ? 'Archived' : 'Active'}
          </button>
        </div>

        {isLoading ? (
          <SkeletonCardGrid />
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
        ) : viewMode === 'grid' ? (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(client => (
              <ClientCard
                key={client.id}
                client={client}
                onEdit={() => { setEditingClient(client); setShowForm(true); }}
                onArchive={() => archiveMutation.mutate({ id: client.id, archived: !client.archived })}
                onDelete={() => setDeleteTarget(client)}
              />
            ))}
          </div>
        ) : (
          <div className="ops-table">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zebra text-left ops-meta font-medium uppercase tracking-wide">
                    <th className="px-3 py-2">Name</th>
                    <th className="px-3 py-2">Contact</th>
                    <th className="px-3 py-2">Phone</th>
                    <th className="px-3 py-2">Email</th>
                    <th className="px-3 py-2 text-right">Money</th>
                    <th className="px-3 py-2 text-right">Jobs</th>
                    <th className="px-3 py-2">Last job</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {filtered.map(client => (
                    <ClientListRow key={client.id} client={client}
                      onEdit={() => { setEditingClient(client); setShowForm(true); }}
                      onArchive={() => archiveMutation.mutate({ id: client.id, archived: !client.archived })}
                      onDelete={() => setDeleteTarget(client)} />
                  ))}
                </tbody>
              </table>
            </div>
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

function ClientContactLinks({ phone, email, address }: {
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}) {
  const lines = visibleClientContacts({ phone, email, address });
  if (lines.length === 0) return null;
  return (
    <div className="mt-2 flex flex-col gap-1 min-w-0">
      {lines.map(line => (
        <a
          key={line.kind}
          href={line.href}
          className="ops-link text-sm truncate"
          target={line.kind === 'map' ? '_blank' : undefined}
          rel={line.kind === 'map' ? 'noreferrer' : undefined}
          onClick={e => e.stopPropagation()}
        >
          {line.label}
        </a>
      ))}
    </div>
  );
}

export { ClientContactLinks };

function ClientMoneyCell({ client }: { client: ClientWithStats }) {
  const hint = clientListMoneyHint({
    quoted: client.quoted_total ?? 0,
    outstanding: client.outstanding_total ?? 0,
    overdue: client.overdue_total ?? 0,
  });
  const toneClass = hint.tone === 'overdue' ? 'text-fail' : 'text-navy';
  return (
    <div className="text-right">
      <p className={`ops-money text-sm ${toneClass}`}>{formatMoney(hint.amount)}</p>
      <p className="ops-meta">{hint.label}</p>
    </div>
  );
}

function ClientListRow({ client, onEdit, onArchive, onDelete }: {
  client: ClientWithStats; onEdit: () => void; onArchive: () => void; onDelete: () => void;
}) {
  const navigate = useNavigate();
  const phoneHref = telHref(client.phone);
  const emailHref = mailtoHref(client.email);
  return (
    <tr className="hover:bg-zebra transition-colors">
      <td className="px-3 py-2">
        <Link to={clientRecordHref(client.id)} className="font-semibold text-navy hover:text-accent">{client.name}</Link>
      </td>
      <td className="px-3 py-2 text-navy">{client.contact_person ?? <span className="ops-meta">—</span>}</td>
      <td className="px-3 py-2">
        {phoneHref && client.phone ? (
          <a href={phoneHref} className="text-accent hover:underline">{client.phone}</a>
        ) : <span className="ops-meta">—</span>}
      </td>
      <td className="px-3 py-2">
        {emailHref && client.email ? (
          <a href={emailHref} className="text-accent hover:underline">{client.email}</a>
        ) : <span className="ops-meta">—</span>}
      </td>
      <td className="px-3 py-2"><ClientMoneyCell client={client} /></td>
      <td className="px-3 py-2 text-right text-navy">
        {client.job_count ?? 0}
        {client.active_jobs ? <span className="block ops-meta text-accent">{client.active_jobs} live</span> : null}
      </td>
      <td className="px-3 py-2 ops-meta">{client.last_job_date ? format(parseISO(client.last_job_date), 'd MMM yyyy') : '—'}</td>
      <td className="px-3 py-2"><div className="flex justify-end"><ContextMenu items={clientMenuItems(client, navigate, onEdit, onArchive, onDelete)} /></div></td>
    </tr>
  );
}

const ClientCard = memo(function ClientCard({
  client, onEdit, onArchive, onDelete,
}: {
  client: ClientWithStats;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const navigate = useNavigate();
  const hint = clientListMoneyHint({
    quoted: client.quoted_total ?? 0,
    outstanding: client.outstanding_total ?? 0,
    overdue: client.overdue_total ?? 0,
  });
  const toneClass = hint.tone === 'overdue' ? 'text-fail' : 'text-navy';

  return (
    <div className="ops-card ops-card-hover relative">
      <div className="absolute top-2 right-2 z-10">
        <ContextMenu items={clientMenuItems(client, navigate, onEdit, onArchive, onDelete)} />
      </div>

      <Link to={clientRecordHref(client.id)} className="block ops-card-body pr-10 pb-1">
        <p className="text-sm font-semibold text-navy truncate">{client.name}</p>
        {client.contact_person && (
          <p className="ops-meta truncate mt-0.5">{client.contact_person}</p>
        )}
      </Link>
      <div className="px-3">
        <ClientContactLinks phone={client.phone} email={client.email} address={client.address} />
      </div>

      <Link to={clientRecordHref(client.id)} className="block px-3 pb-3">
        <div className="flex items-baseline justify-between gap-2 pt-2 border-t border-rule">
          <div>
            <p className={`ops-money text-left ${toneClass}`}>{formatMoney(hint.amount)}</p>
            <p className="ops-meta">{hint.label}</p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-navy tabular-nums">{client.job_count ?? 0} jobs</p>
            {client.active_jobs ? (
              <p className="ops-meta text-accent">{client.active_jobs} live</p>
            ) : client.last_job_date ? (
              <p className="ops-meta">{format(parseISO(client.last_job_date), 'd MMM yyyy')}</p>
            ) : (
              <p className="ops-meta">No jobs yet</p>
            )}
          </div>
        </div>
      </Link>
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
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zebra text-muted">
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
            {err && <p className="overlay-form-span-all text-sm text-red-600">{err}</p>}
          </div>
        </form>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-rule">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} className="btn-primary disabled:opacity-50">
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
