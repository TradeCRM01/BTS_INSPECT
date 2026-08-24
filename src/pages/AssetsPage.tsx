import { useState, useMemo, memo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { ManagedSelect } from '../components/ui/ManagedSelect';
import { LIST_KEYS } from '../lib/useManagedList';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, EmptyState, SearchBar, ContextMenu, ConfirmDialog, SummaryCard, useToast, ViewToggle, useViewMode } from '../components/ui';
import { SkeletonCardGrid, SkeletonSummaryCards } from '../components/ui/Skeletons';
import type { MenuEntry } from '../components/ui';
import { format, parseISO, isPast } from 'date-fns';
import {
  Plus, Search, HardDrive, X, Trash2, Pencil, MoreVertical, MapPin,
  Tag, Wrench, Calendar, ShieldCheck, AlertTriangle,
} from 'lucide-react';
import type { Asset, AssetStatus, AssetWithClient } from '../types/fsm';
import { ASSET_STATUS_LABELS, ASSET_STATUS_STYLES } from '../types/fsm';
import type { Client } from '../types/crm';

export function AssetsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | AssetStatus>('all');
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AssetWithClient | null>(null);
  const [viewMode, setViewMode] = useViewMode('assets');

  const { data: assets, isLoading, error } = useQuery({
    queryKey: ['assets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assets')
        .select('*')
        .eq('company_id', profile!.company_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const assetList = (data ?? []) as Asset[];

      if (assetList.length === 0) return [] as AssetWithClient[];
      const clientIds = [...new Set(assetList.map(a => a.client_id).filter(Boolean))] as string[];
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name')
        .in('id', clientIds);
      const clientMap = new Map((clients ?? []).map((c: Pick<Client, 'id' | 'name'>) => [c.id, c.name]));

      return assetList.map(a => ({ ...a, client_name: a.client_id ? clientMap.get(a.client_id) ?? null : null })) as AssetWithClient[];
    },
    enabled: !!profile,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('assets').delete().eq('id', id).eq('company_id', profile!.company_id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      showToast('Asset deleted');
    },
  });

  const filtered = useMemo(() => {
    const all = assets ?? [];
    return all.filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      const q = search.toLowerCase();
      if (!q) return true;
      return [a.name, a.asset_tag, a.serial_number, a.manufacturer, a.model, a.category, a.client_name]
        .filter(Boolean).some(v => v!.toLowerCase().includes(q));
    });
  }, [assets, search, statusFilter]);

  const counts = useMemo(() => {
    const all = assets ?? [];
    return {
      total: all.length,
      active: all.filter(a => a.status === 'active').length,
      faulty: all.filter(a => a.status === 'faulty').length,
      warrantyExpiring: all.filter(a => a.warranty_expiry && isPast(parseISO(a.warranty_expiry))).length,
    };
  }, [assets]);

  if (pageQueryBlocked(error)) return <AppShell><PageError message="Could not load assets" /></AppShell>;

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Assets</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">{counts.total} total assets</p>
          </div>
          <button onClick={() => { setEditingAsset(null); setShowForm(true); }} className="btn-primary">
            <Plus size={16} /> Add Asset
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {isLoading ? (
            <SkeletonSummaryCards count={4} />
          ) : (
            <>
              <SummaryCard label="Total" value={counts.total} accentColor="#0A2540" />
              <SummaryCard label="Active" value={counts.active} accentColor="#16A34A" />
              <SummaryCard label="Faulty" value={counts.faulty} accentColor="#DC2626" />
              <SummaryCard label="Warranty Expired" value={counts.warrantyExpiring} accentColor="#D97706" />
            </>
          )}
        </div>

        {/* Search + filter */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by name, tag, serial, manufacturer..." />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as 'all' | AssetStatus)}
            className="min-h-[44px] h-auto py-2 px-3 text-sm border border-[#E5E7EB] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#2E75B6]">
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="faulty">Faulty</option>
            <option value="decommissioned">Decommissioned</option>
          </select>
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>

        {/* Grid */}
        {isLoading ? (
          <SkeletonCardGrid />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={HardDrive}
            title={search || statusFilter !== 'all' ? 'No assets match your filters' : 'No assets yet'}
            message={search || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'Add your first asset to get started.'}
            action={!search && statusFilter === 'all' && (
              <button onClick={() => { setEditingAsset(null); setShowForm(true); }} className="btn-primary">
                <Plus size={16} /> Add your first asset
              </button>
            )}
          />
        ) : viewMode === 'grid' ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(asset => (
              <AssetCard key={asset.id} asset={asset}
                onEdit={() => { setEditingAsset(asset); setShowForm(true); }}
                onDelete={() => setDeleteTarget(asset)} />
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9FAFB] text-left text-xs font-medium text-[#4A5568] uppercase tracking-wide">
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Asset Tag</th>
                    <th className="px-4 py-3">Serial #</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Warranty</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {filtered.map(asset => {
                    const warrantyExpired = asset.warranty_expiry && isPast(parseISO(asset.warranty_expiry));
                    return (
                      <tr key={asset.id} className="hover:bg-[#F9FAFB] transition-colors">
                        <td className="px-4 py-3 font-medium text-[#1A1A1A]">{asset.name}</td>
                        <td className="px-4 py-3 text-[#4A5568]">{asset.asset_tag ?? <span className="text-[#9CA3AF]">ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â</span>}</td>
                        <td className="px-4 py-3 text-[#4A5568]">{asset.serial_number ?? <span className="text-[#9CA3AF]">ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â</span>}</td>
                        <td className="px-4 py-3 text-[#4A5568]">{asset.client_name ?? <span className="text-[#9CA3AF]">ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â</span>}</td>
                        <td className="px-4 py-3 text-[#4A5568]">{asset.warranty_expiry ? format(parseISO(asset.warranty_expiry), 'd MMM yyyy') : 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}{warrantyExpired && <AlertTriangle size={11} className="text-[#D97706] ml-1 inline" />}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ASSET_STATUS_STYLES[asset.status]}`}>{ASSET_STATUS_LABELS[asset.status]}</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end">
                            <ContextMenu items={[
                              { label: 'Edit', icon: Pencil, onClick: () => { setEditingAsset(asset); setShowForm(true); } },
                              { divider: true },
                              { label: 'Delete', icon: Trash2, onClick: () => setDeleteTarget(asset), variant: 'danger' },
                            ]} />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <AssetForm asset={editingAsset} onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); queryClient.invalidateQueries({ queryKey: ['assets'] }); showToast(editingAsset ? 'Asset updated' : 'Asset added'); }} />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete asset?"
        message="This will permanently remove the asset. This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => { if (deleteTarget) deleteMutation.mutate(deleteTarget.id); setDeleteTarget(null); }}
        onCancel={() => setDeleteTarget(null)}
      />
    </AppShell>
  );
}

const AssetCard = memo(function AssetCard({ asset, onEdit, onDelete }: {
  asset: AssetWithClient; onEdit: () => void; onDelete: () => void;
}) {
  const warrantyExpired = asset.warranty_expiry && isPast(parseISO(asset.warranty_expiry));
  const menuItems: MenuEntry[] = [
    { label: 'Edit', icon: Pencil, onClick: onEdit },
    { divider: true },
    { label: 'Delete', icon: Trash2, onClick: onDelete, variant: 'danger' },
  ];

  return (
    <div className="card-hover p-4">
      <div className="absolute top-3 right-3">
        <ContextMenu items={menuItems} />
      </div>

      <div className="flex items-start gap-3 pr-8">
        <div className="w-10 h-10 rounded-lg bg-[#0A2540]/5 flex items-center justify-center shrink-0">
          <HardDrive size={20} className="text-[#0A2540]" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-[#1A1A1A] truncate">{asset.name}</h3>
          {asset.asset_tag && <p className="text-xs text-[#6B7280] mt-0.5">Tag: {asset.asset_tag}</p>}
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {asset.client_name && (
          <div className="flex items-center gap-1.5 text-xs text-[#4A5568]">
            <Tag size={13} className="text-[#9CA3AF]" /> {asset.client_name}
          </div>
        )}
        {asset.serial_number && (
          <div className="flex items-center gap-1.5 text-xs text-[#4A5568]">
            <Wrench size={13} className="text-[#9CA3AF]" /> S/N: {asset.serial_number}
          </div>
        )}
        {asset.location_description && (
          <div className="flex items-center gap-1.5 text-xs text-[#4A5568]">
            <MapPin size={13} className="text-[#9CA3AF]" /> {asset.location_description}
          </div>
        )}
        {asset.warranty_expiry && (
          <div className={`flex items-center gap-1.5 text-xs ${warrantyExpired ? 'text-[#D97706]' : 'text-[#4A5568]'}`}>
            <ShieldCheck size={13} className={warrantyExpired ? 'text-[#D97706]' : 'text-[#9CA3AF]'} />
            Warranty: {format(parseISO(asset.warranty_expiry), 'dd MMM yyyy')}
            {warrantyExpired && <AlertTriangle size={11} className="text-[#D97706]" />}
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${ASSET_STATUS_STYLES[asset.status]}`}>
          {ASSET_STATUS_LABELS[asset.status]}
        </span>
        {asset.category && <span className="text-xs text-[#9CA3AF]">{asset.category}</span>}
      </div>
    </div>
  );
});

function AssetForm({ asset, onClose, onSaved }: { asset: Asset | null; onClose: () => void; onSaved: () => void }) {
  const { profile } = useAuth();
  const [form, setForm] = useState({
    name: asset?.name ?? '',
    asset_tag: asset?.asset_tag ?? '',
    serial_number: asset?.serial_number ?? '',
    manufacturer: asset?.manufacturer ?? '',
    model: asset?.model ?? '',
    category: asset?.category ?? '',
    client_id: asset?.client_id ?? '',
    location_description: asset?.location_description ?? '',
    install_date: asset?.install_date ?? '',
    warranty_expiry: asset?.warranty_expiry ?? '',
    status: asset?.status ?? 'active',
    notes: asset?.notes ?? '',
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
        name: form.name,
        asset_tag: form.asset_tag || null,
        serial_number: form.serial_number || null,
        manufacturer: form.manufacturer || null,
        model: form.model || null,
        category: form.category || null,
        client_id: form.client_id || null,
        location_description: form.location_description || null,
        install_date: form.install_date || null,
        warranty_expiry: form.warranty_expiry || null,
        status: form.status,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      };
      if (asset) {
        const { error } = await supabase.from('assets').update(payload).eq('id', asset.id).eq('company_id', profile!.company_id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('assets').insert(payload);
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
    <div className="overlay-backdrop">
      <div className="overlay-panel-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB] shrink-0">
          <h2 className="text-lg font-semibold text-[#1A1A1A]">{asset ? 'Edit Asset' : 'Add Asset'}</h2>
          <button onClick={onClose} className="text-[#6B7280] hover:text-[#1A1A1A]"><X size={20} /></button>
        </div>
        <form onSubmit={handleSave} className="overlay-body">
          <Field label="Name *">
            <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="form-input" placeholder="e.g. Main Switchboard" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Asset Tag">
              <input value={form.asset_tag} onChange={e => setForm(f => ({ ...f, asset_tag: e.target.value }))}
                className="form-input" placeholder="AST-001" />
            </Field>
            <Field label="Serial Number">
              <input value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))}
                className="form-input" placeholder="SN12345" />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Manufacturer">
              <input value={form.manufacturer} onChange={e => setForm(f => ({ ...f, manufacturer: e.target.value }))}
                className="form-input" placeholder="e.g. Schneider" />
            </Field>
            <Field label="Model">
              <input value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))}
                className="form-input" placeholder="e.g. NSX160" />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Category"><ManagedSelect listKey={LIST_KEYS.assetCategories} value={form.category}
              onChange={v => setForm(f => ({ ...f, category: v }))} placeholder="Select category..." /></Field>
            <Field label="Client">
              <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value }))}
                className="form-input cursor-pointer">
                <option value="">ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â None ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Location Description">
            <input value={form.location_description} onChange={e => setForm(f => ({ ...f, location_description: e.target.value }))}
              className="form-input" placeholder="e.g. Main plant room, Level 1" />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Install Date">
              <input type="date" value={form.install_date} onChange={e => setForm(f => ({ ...f, install_date: e.target.value }))}
                className="form-input" />
            </Field>
            <Field label="Warranty Expiry">
              <input type="date" value={form.warranty_expiry} onChange={e => setForm(f => ({ ...f, warranty_expiry: e.target.value }))}
                className="form-input" />
            </Field>
          </div>
          <Field label="Status">
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as AssetStatus }))}
              className="form-input cursor-pointer">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="faulty">Faulty</option>
              <option value="decommissioned">Decommissioned</option>
            </select>
          </Field>
          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3}
              className="form-input min-h-[60px] resize-y" placeholder="Any notes about this asset..." />
          </Field>
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
