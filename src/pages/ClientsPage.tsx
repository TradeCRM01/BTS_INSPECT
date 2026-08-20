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
import { Plus, Users, Phone, Mail, MapPin, X, Trash2, CreditCard as Edit3, Archive, ArchiveRestore, Briefcase, Calendar, FileText, Receipt } from 'lucide-react';
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
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Clients</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">{clients?.length ?? 0} total clients</p>
          </div>
          <button
            onClick={() => { setEditingClient(null); setShowForm(true); }}
            className="flex items-center gap-2 bg-[#0A2540] text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e] transition-colors"
          >
            <Plus size={16} /> Add Client
          </button>
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name, contact, phone, or email..." />
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          <button
            onClick={() => setShowArchived(v => !v)}
            className={`flex items-center gap-1.5 h-9 px-3 rounded-md text-sm font-medium border transition-colors ${
              showArchived
                ? 'border-[#2E75B6] bg-[#EFF6FF] text-[#1e40af]'
                : 'border-[#E5E7EB] bg-white text-[#4A5568] hover:bg-gray-50'
            }`}
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9FAFB] text-left text-xs font-medium text-[#4A5568] uppercase tracking-wide">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Contact</th>
                    <th className="px-4 py-3">Phone</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3 text-right">Money</th>
                    <th className="px-4 py-3 text-right">Jobs</th>
                    <th className="px-4 py-3">Last Job</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
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
    <tr className="hover:bg-[#F9FAFB] transition-colors">
      <td className="px-4 py-3">
        <Link to={clientRecordHref(client.id)} className="font-medium text-[#1A1A1A] hover:text-[#2E75B6]">{client.name}</Link>
      </td>
      <td className="px-4 py-3 text-[#4A5568]">{client.contact_person ?? <span className="text-[#9CA3AF]">—</span>}</td>
      <td className="px-4 py-3 text-[#4A5568]">
        {phoneHref && client.phone ? (
          <a href={phoneHref} className="text-accent hover:underline">{client.phone}</a>
        ) : <span className="text-[#9CA3AF]">—</span>}
      </td>
      <td className="px-4 py-3 text-[#4A5568]">
        {emailHref && client.email ? (
          <a href={emailHref} className="text-accent hover:underline">{client.email}</a>
        ) : <span className="text-[#9CA3AF]">—</span>}
      </td>
      <td className="px-4 py-3"><ClientMoneyCell client={client} /></td>
      <td className="px-4 py-3 text-right text-[#4A5568]">
        {client.job_count ?? 0}
        {client.active_jobs ? <span className="block ops-meta text-accent">{client.active_jobs} live</span> : null}
      </td>
      <td className="px-4 py-3 text-[#4A5568]">{client.last_job_date ? format(parseISO(client.last_job_date), 'd MMM yyyy') : '—'}</td>
      <td className="px-4 py-3"><div className="flex justify-end"><ContextMenu items={clientMenuItems(client, navigate, onEdit, onArchive, onDelete)} /></div></td>
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
  const phoneHref = telHref(client.phone);
  const emailHref = mailtoHref(client.email);
  const hint = clientListMoneyHint({
    quoted: client.quoted_total ?? 0,
    outstanding: client.outstanding_total ?? 0,
    overdue: client.overdue_total ?? 0,
  });
  const toneClass = hint.tone === 'overdue' ? 'text-fail' : 'text-navy';

  return (
    <div className="card-hover p-4">
      <div className="absolute top-3 right-3">
        <ContextMenu items={clientMenuItems(client, navigate, onEdit, onArchive, onDelete)} />
      </div>

      <Link to={clientRecordHref(client.id)} className="block">
        <div className="flex items-start gap-3 pr-8">
          <div className="w-10 h-10 rounded-lg bg-[#0A2540]/10 flex items-center justify-center shrink-0">
            <Users size={18} className="text-[#0A2540]" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[#1A1A1A] truncate">{client.name}</h3>
            {client.contact_person && (
              <p className="text-xs text-[#4A5568] truncate mt-0.5">{client.contact_person}</p>
            )}
          </div>
        </div>
      </Link>

      <div className="mt-3 space-y-1.5">
        {phoneHref && client.phone && (
          <a href={phoneHref} className="flex items-center gap-2 text-xs text-accent hover:underline">
            <Phone size={12} className="text-[#9CA3AF] shrink-0" />
            <span className="truncate">{client.phone}</span>
          </a>
        )}
        {emailHref && client.email && (
          <a href={emailHref} className="flex items-center gap-2 text-xs text-accent hover:underline">
            <Mail size={12} className="text-[#9CA3AF] shrink-0" />
            <span className="truncate">{client.email}</span>
          </a>
        )}
        {client.address && (
          <div className="flex items-center gap-2 text-xs text-[#4A5568]">
            <MapPin size={12} className="text-[#9CA3AF] shrink-0" />
            <span className="truncate">{client.address}</span>
          </div>
        )}
      </div>

      <Link to={clientRecordHref(client.id)} className="block mt-3 pt-3 border-t border-[#F3F4F6]">
        <div className="flex items-center gap-4 text-xs text-[#6B7280]">
          <span className={`ops-money text-sm ${toneClass}`}>{formatMoney(hint.amount)}</span>
          <span className="ops-meta">{hint.label}</span>
          <span className="flex items-center gap-1 ml-auto">
            <Briefcase size={12} /> {client.job_count ?? 0}
          </span>
          {client.active_jobs ? (
            <span className="flex items-center gap-1 text-accent font-medium">
              <Calendar size={12} /> {client.active_jobs} live
            </span>
          ) : null}
        </div>
        {client.last_job_date && (
          <p className="ops-meta mt-1">{format(parseISO(client.last_job_date), 'd MMM yyyy')}</p>
        )}
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-[#1A1A1A]">{client ? 'Edit Client' : 'New Client'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
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

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#4A5568] border border-[#E5E7EB] rounded-md hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md hover:bg-[#0d2f4e] disabled:opacity-50">
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
      <label className="block text-xs font-medium text-[#4A5568] mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
