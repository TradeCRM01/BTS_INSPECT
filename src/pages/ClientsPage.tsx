import { useState, useMemo, memo, useEffect, useRef } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { getAuditClients, getAuditJobs } from '../lib/devFieldAuditDocs';
import { AppShell } from '../components/layout/AppShell';
import { PageError, EmptyState, SearchBar, ConfirmDialog, useToast, LoadingSpinner } from '../components/ui';
import type { MenuEntry } from '../components/ui';
import type { Client, ClientWithStats } from '../types/crm';
import { Plus, Users, X, Trash2, CreditCard as Edit3, Archive, ArchiveRestore, Briefcase, FileText, Receipt, MoreHorizontal } from 'lucide-react';
import {
  AU_ADDRESS_PLACEHOLDER,
  AU_EMAIL_PLACEHOLDER,
  AU_PHONE_PLACEHOLDER,
  applyHubScope,
  clientInvoiceMoney,
  clientListStatsQueries,
  clientQuotedTotal,
  newInvoiceFromClientHref,
  newJobFromClientHref,
  newQuoteFromClientHref,
} from '../lib/clientRecords';
import {
  clientListFloorJobScope,
  clientOpenHref,
  collectJobSearchBitsByClient,
  filterClientsForSearch,
  formatClientJobCount,
} from '../lib/clientsFloor';

/** Signed clients-list frame seed — list look only, not a live company. */
const CLIENTS_LIST_LOOK = 'clients-list';

type ClientListRow = ClientWithStats & { jobSearchBits: string[] };

function clientSuburbFromSite(site: string): string {
  const parts = site.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return site;
  const loc = parts[1].replace(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b.*$/i, '').trim();
  return loc || parts[1];
}

function clientsListLookRows(): ClientListRow[] {
  const stamp = '2026-09-03T00:00:00.000Z';
  const base = {
    company_id: 'look-clients-list',
    contact_person: null as string | null,
    phone: null as string | null,
    email: null as string | null,
    notes: null as string | null,
    archived: false,
    created_at: stamp,
    active_jobs: 0,
    last_job_date: null as string | null,
    quoted_total: 0,
    outstanding_total: 0,
    overdue_total: 0,
    jobSearchBits: [] as string[],
  };
  return [
    {
      ...base,
      id: 'look-client-northside',
      name: 'Northside Electrical',
      address: '12 Workshop Rd, Perth WA 6000',
      phone: '0400 111 222',
      job_count: 2,
      active_jobs: 1,
    },
    {
      ...base,
      id: 'look-client-harbour',
      name: 'Harbour Lights',
      address: '8 Wharf St, Fremantle WA 6160',
      job_count: 1,
    },
    {
      ...base,
      id: 'look-client-midland',
      name: 'Midland Workshops',
      address: '44 Helena St, Midland WA 6056',
      job_count: 0,
    },
  ];
}

export function ClientsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const lookClientsList = searchParams.get('look') === CLIENTS_LIST_LOOK;
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);

  const { data: clients, isLoading, error } = useQuery<ClientListRow[]>({
    queryKey: ['clients', showArchived, profile?.company_id],
    queryFn: async () => {
      const mock = getAuditClients();
      if (mock) {
        const jobs = getAuditJobs() ?? [];
        const jobSearchByClient = collectJobSearchBitsByClient(jobs);
        return mock
          .filter(c => c.archived === showArchived)
          .map(c => {
            const theirs = jobs.filter(j => j.client_id === c.id);
            return {
              ...c,
              job_count: theirs.length,
              active_jobs: theirs.filter(j => j.status === 'scheduled' || j.status === 'in_progress').length,
              last_job_date: null as string | null,
              quoted_total: 0,
              outstanding_total: 0,
              overdue_total: 0,
              jobSearchBits: jobSearchByClient.get(c.id) ?? [],
            };
          });
      }
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
        jobSearchBits: [] as string[],
      };

      const scopes = clientListStatsQueries({
        companyId: profile.company_id,
        clientIds: clientsData.map(c => c.id),
      });
      if (!scopes) {
        return clientsData.map(c => ({ ...c, ...emptyStats }));
      }

      const [jobsRes, quotesRes, invoicesRes] = await Promise.all([
        applyHubScope(supabase.from('jobs'), clientListFloorJobScope(scopes.jobs)),
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
        address: string | null;
        title: string | null;
        job_number: number | null;
      }[];
      const jobSearchByClient = collectJobSearchBitsByClient(jobRows);
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
          jobSearchBits: jobSearchByClient.get(c.id) ?? [],
        };
      });
    },
    enabled: !!profile?.company_id && !lookClientsList,
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

  const listRows = lookClientsList ? clientsListLookRows() : (clients ?? []);
  const filtered = useMemo(
    () => filterClientsForSearch(listRows, search),
    [listRows, search],
  );
  const whisper = [
    showArchived ? 'Archived' : 'Active',
    filtered.length === 1 ? '1 client' : `${filtered.length} clients`,
  ].join(' · ');

  if (pageQueryBlocked(error)) return <AppShell><PageError message="Could not load clients" /></AppShell>;

  return (
    <AppShell>
      <div className="ops-page hub-clients hub-clients-list-doc">
        <div className="hub-clients-sheet">
          <header className="hub-clients-list-bar">
            <span className="hub-clients-list-mark">Clients</span>
          </header>
          <div className="hub-clients-list-body">
            <p className="hub-look-eyebrow hub-clients-label">Clients</p>
            <h1 className="ops-page-title">Clients</h1>
            <p className="hub-clients-list-whisper">{whisper}</p>
            <div className="hub-clients-list-tools">
              <button
                type="button"
                onClick={() => { setEditingClient(null); setShowForm(true); }}
                className="btn-primary"
              >
                <Plus size={16} /> New client
              </button>
            </div>
            <div className="hub-clients-chrome">
              <div className="hub-clients-filters">
                <button
                  type="button"
                  onClick={() => setShowArchived(false)}
                  className={`hub-chrome-filter ${!showArchived ? 'hub-chrome-filter-on' : ''}`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setShowArchived(true)}
                  className={`hub-chrome-filter ${showArchived ? 'hub-chrome-filter-on' : ''}`}
                >
                  Archived
                </button>
              </div>
              <SearchBar value={search} onChange={setSearch} placeholder="Search by name, site, job, phone, or email..." className="max-w-sm" />
            </div>
            {isLoading ? (
              <div className="flex justify-center py-20"><LoadingSpinner /></div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Users}
                title={search ? 'No clients match your search' : 'No clients yet'}
                message={search ? 'Try a different search term.' : 'Add your first client to get started.'}
              />
            ) : (
              <>
                <div className="hub-clients-thead">
                  <span>Customer</span>
                  <span>Suburb</span>
                  <span>Jobs</span>
                  <span />
                </div>
                {filtered.map(client => (
                  <ClientRow
                    key={client.id}
                    client={client}
                    onEdit={() => { setEditingClient(client); setShowForm(true); }}
                    onArchive={() => archiveMutation.mutate({ id: client.id, archived: !client.archived })}
                    onDelete={() => setDeleteTarget(client)}
                  />
                ))}
              </>
            )}
          </div>
        </div>
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

function ClientRowMore({ items }: { items: MenuEntry[] }) {
  const moreRef = useRef<HTMLDetailsElement>(null);

  const closeMore = () => {
    if (moreRef.current) moreRef.current.open = false;
  };

  const placeMoreMenu = () => {
    const more = moreRef.current;
    const menu = more?.querySelector('.hub-clients-list-more-menu') as HTMLElement | null;
    const paper = more?.closest('.hub-clients-sheet') as HTMLElement | null;
    if (!more || !menu || !paper) return;
    more.classList.remove('is-flip', 'is-shift');
    menu.style.removeProperty('--hub-clients-list-more-shift');
    if (!more.open) return;
    const pad = 8;
    const paperRect = paper.getBoundingClientRect();
    const viewBottom = window.innerHeight - pad;
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.bottom > Math.min(paperRect.bottom - pad, viewBottom)) {
      more.classList.add('is-flip');
    }
    const after = menu.getBoundingClientRect();
    let shift = 0;
    if (after.right > paperRect.right - pad) shift = paperRect.right - pad - after.right;
    if (after.left + shift < paperRect.left + pad) shift = paperRect.left + pad - after.left;
    if (shift !== 0) {
      more.classList.add('is-shift');
      menu.style.setProperty('--hub-clients-list-more-shift', `${Math.round(shift)}px`);
    }
  };

  useEffect(() => {
    const more = moreRef.current;
    const onPointer = (event: PointerEvent) => {
      if (!moreRef.current?.open) return;
      if (!moreRef.current.contains(event.target as Node)) closeMore();
    };
    more?.addEventListener('toggle', placeMoreMenu);
    window.addEventListener('resize', placeMoreMenu);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      more?.removeEventListener('toggle', placeMoreMenu);
      window.removeEventListener('resize', placeMoreMenu);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  return (
    <details ref={moreRef} className="hub-clients-list-more">
      <summary aria-label="More">
        <MoreHorizontal size={18} />
      </summary>
      <div className="hub-clients-list-more-menu" role="menu">
        {items.map((entry, i) => {
          if ('divider' in entry) {
            return <div key={`d-${i}`} className="hub-clients-list-more-rule" />;
          }
          return (
            <button
              key={entry.label}
              type="button"
              role="menuitem"
              className={entry.variant === 'danger' ? 'is-danger' : undefined}
              onClick={() => { entry.onClick(); closeMore(); }}
            >
              {entry.label}
            </button>
          );
        })}
      </div>
    </details>
  );
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
  const site = client.address?.trim() ?? '';
  const suburb = site ? clientSuburbFromSite(site) : '';
  const jobsLabel = formatClientJobCount(client.job_count ?? 0);
  const openHref = clientOpenHref(client.id);

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(openHref)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(openHref); } }}
      className="hub-clients-row"
    >
      <span className="hub-clients-name">{client.name}</span>
      <span className="truncate hub-clients-muted">{suburb}</span>
      <span className="hub-clients-jobs">{jobsLabel ?? ''}</span>
      <span className="hub-clients-row-next" onClick={e => e.stopPropagation()}>
        <Link to={openHref} className="hub-clients-next">Open</Link>
        <ClientRowMore items={clientMenuItems(client, navigate, onEdit, onArchive, onDelete)} />
      </span>
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
