import { useState, useMemo, memo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, EmptyState, SearchBar, ContextMenu, ConfirmDialog, useToast, ViewToggle, useViewMode } from '../components/ui';
import { SkeletonCardGrid } from '../components/ui/Skeletons';
import type { MenuEntry } from '../components/ui';
import type { Client, ClientWithStats } from '../types/crm';
import { Plus, Search, Users, Phone, Mail, MapPin, ChevronRight, X, Trash2, CreditCard as Edit3, Archive, ArchiveRestore, MoreVertical, Briefcase, Calendar } from 'lucide-react';
import { format, parseISO } from 'date-fns';

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
    queryKey: ['clients', showArchived],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, company_id, name, contact_person, phone, email, address, notes, archived, created_at')
        .eq('archived', showArchived)
        .order('name', { ascending: true });
      if (error) throw error;
      const clientsData = (data ?? []) as Client[];

      const { data: jobs } = await supabase
        .from('jobs')
        .select('client_id, status, scheduled_date');
      const jobMap = new Map<string, { total: number; active: number; lastDate: string | null }>();
      for (const j of jobs ?? []) {
        if (!j.client_id) continue;
        const entry = jobMap.get(j.client_id) ?? { total: 0, active: 0, lastDate: null };
        entry.total++;
        if (j.status === 'scheduled' || j.status === 'in_progress') entry.active++;
        if (j.scheduled_date && (!entry.lastDate || j.scheduled_date > entry.lastDate)) {
          entry.lastDate = j.scheduled_date;
        }
        jobMap.set(j.client_id, entry);
      }

      return clientsData.map(c => {
        const stats = jobMap.get(c.id);
        return {
          ...c,
          job_count: stats?.total ?? 0,
          active_jobs: stats?.active ?? 0,
          last_job_date: stats?.lastDate ?? null,
        };
      });
    },
    enabled: !!profile,
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
        {/* Header */}
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

        {/* Search + filters */}
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

        {/* List */}
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

// ── Client List Row ─────────────────────────────────────────────

function ClientListRow({ client, onEdit, onArchive, onDelete }: {
  client: ClientWithStats; onEdit: () => void; onArchive: () => void; onDelete: () => void;
}) {
  const menuItems: MenuEntry[] = [
    { label: 'Edit', icon: Edit3, onClick: onEdit },
    { label: client.archived ? 'Restore' : 'Archive', icon: client.archived ? ArchiveRestore : Archive, onClick: onArchive },
    { divider: true },
    { label: 'Delete', icon: Trash2, onClick: onDelete, variant: 'danger' },
  ];
  return (
    <tr className="hover:bg-[#F9FAFB] transition-colors">
      <td className="px-4 py-3">
        <Link to={`/clients/${client.id}`} className="font-medium text-[#1A1A1A] hover:text-[#2E75B6]">{client.name}</Link>
      </td>
      <td className="px-4 py-3 text-[#4A5568]">{client.contact_person ?? <span className="text-[#9CA3AF]">—</span>}</td>
      <td className="px-4 py-3 text-[#4A5568]">{client.phone ?? <span className="text-[#9CA3AF]">—</span>}</td>
      <td className="px-4 py-3 text-[#4A5568]">{client.email ?? <span className="text-[#9CA3AF]">—</span>}</td>
      <td className="px-4 py-3 text-right text-[#4A5568]">{client.job_count ?? 0}</td>
      <td className="px-4 py-3 text-[#4A5568]">{client.last_job_date ? format(parseISO(client.last_job_date), 'd MMM yyyy') : '—'}</td>
      <td className="px-4 py-3"><div className="flex justify-end"><ContextMenu items={menuItems} /></div></td>
    </tr>
  );
}

// ── Client Card ──────────────────────────────────────────────────

const ClientCard = memo(function ClientCard({
  client, onEdit, onArchive, onDelete,
}: {
  client: ClientWithStats;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const menuItems: MenuEntry[] = [
    { label: 'Edit', icon: Edit3, onClick: onEdit },
    { label: client.archived ? 'Restore' : 'Archive', icon: client.archived ? ArchiveRestore : Archive, onClick: onArchive },
    { divider: true },
    { label: 'Delete', icon: Trash2, onClick: onDelete, variant: 'danger' },
  ];

  return (
    <div className="card-hover p-4">
      <div className="absolute top-3 right-3">
        <ContextMenu items={menuItems} />
      </div>

      <Link to={`/clients/${client.id}`} className="block">
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

        <div className="mt-3 space-y-1.5">
          {client.phone && (
            <div className="flex items-center gap-2 text-xs text-[#4A5568]">
              <Phone size={12} className="text-[#9CA3AF] shrink-0" />
              <span className="truncate">{client.phone}</span>
            </div>
          )}
          {client.email && (
            <div className="flex items-center gap-2 text-xs text-[#4A5568]">
              <Mail size={12} className="text-[#9CA3AF] shrink-0" />
              <span className="truncate">{client.email}</span>
            </div>
          )}
          {client.address && (
            <div className="flex items-center gap-2 text-xs text-[#4A5568]">
              <MapPin size={12} className="text-[#9CA3AF] shrink-0" />
              <span className="truncate">{client.address}</span>
            </div>
          )}
        </div>

        {/* Stats footer */}
        <div className="mt-3 pt-3 border-t border-[#F3F4F6] flex items-center gap-4 text-xs text-[#6B7280]">
          <span className="flex items-center gap-1">
            <Briefcase size={12} /> {client.job_count ?? 0} jobs
          </span>
          {client.active_jobs ? (
            <span className="flex items-center gap-1 text-blue-600 font-medium">
              <Calendar size={12} /> {client.active_jobs} active
            </span>
          ) : null}
          {client.last_job_date && (
            <span className="ml-auto text-[#9CA3AF]">
              {format(parseISO(client.last_job_date), 'd MMM yyyy')}
            </span>
          )}
        </div>
      </Link>
    </div>
  );
});

// ── Client Form Modal ────────────────────────────────────────────

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
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[8vh] overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-[#1A1A1A]">{client ? 'Edit Client' : 'New Client'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-auto px-5 py-4 space-y-4">
          <Field label="Client / Business Name" required>
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="form-input" placeholder="e.g. Acme Corp" autoFocus />
          </Field>
          <Field label="Contact Person">
            <input value={form.contact_person} onChange={e => setForm(f => ({ ...f, contact_person: e.target.value }))}
              className="form-input" placeholder="e.g. John Smith" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone">
              <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                className="form-input" placeholder="(555) 123-4567" />
            </Field>
            <Field label="Email">
              <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                className="form-input" placeholder="john@acme.com" />
            </Field>
          </div>
          <Field label="Address">
            <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
              className="form-input" placeholder="123 Main St, City, State" />
          </Field>
          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="form-input min-h-[80px] resize-y" placeholder="Any notes about this client..." />
          </Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
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
