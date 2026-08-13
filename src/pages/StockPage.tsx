import { useState, useMemo, memo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { ManagedSelect } from '../components/ui/ManagedSelect';
import { LIST_KEYS, useManagedList } from '../lib/useManagedList';
import { AppShell } from '../components/layout/AppShell';
import { PageError, EmptyState, SearchBar, ContextMenu, ConfirmDialog, useToast, ViewToggle, useViewMode } from '../components/ui';
import { SkeletonCardGrid } from '../components/ui/Skeletons';
import type { MenuEntry } from '../components/ui';
import type { StockItem, StockItemWithSupplier, Supplier } from '../types/fsm';
import { getStockLevel, STOCK_LEVEL_STYLES, STOCK_LEVEL_LABELS, formatMoney } from '../types/fsm';
import { DriveCard } from './StockLocationPage';
import { locationLabel, encodeLocationKey } from '../lib/stockLocations';
import {
  Plus, Package, X, Trash2, Pencil, Archive, ArchiveRestore,
  ChevronDown, Tag, Boxes, Filter, HardDrive,
} from 'lucide-react';

type StockBrowseMode = 'items' | 'drives';

export function StockPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const browseMode: StockBrowseMode = searchParams.get('view') === 'drives' ? 'drives' : 'items';
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [category, setCategory] = useState('all');
  const [driveFilter, setDriveFilter] = useState('all');
  const [editingItem, setEditingItem] = useState<StockItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<StockItem | null>(null);
  const [viewMode, setViewMode] = useViewMode('stock');

  function setBrowseMode(mode: StockBrowseMode) {
    if (mode === 'drives') setSearchParams({ view: 'drives' });
    else setSearchParams({});
  }

  const { data: items, isLoading, error } = useQuery<StockItemWithSupplier[]>({
    queryKey: ['stock-items', showArchived],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_items')
        .select('id, company_id, name, sku, description, category, unit_of_measure, quantity_on_hand, reorder_level, reorder_quantity, storage_location, unit_cost, supplier_id, archived, created_at, updated_at, suppliers!supplier_id(name)')
        .eq('archived', showArchived)
        .order('name', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as (StockItem & { suppliers?: { name: string } | null })[]).map(
        i => ({ ...i, supplier_name: i.suppliers?.name ?? null } as StockItemWithSupplier)
      );
    },
    enabled: !!profile,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('stock_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      showToast('Item deleted');
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, archived }: { id: string; archived: boolean }) => {
      const { error } = await supabase.from('stock_items').update({ archived }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      showToast(showArchived ? 'Item restored' : 'Item archived');
    },
  });

  const { data: locationList = [] } = useManagedList(LIST_KEYS.storageLocations);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const i of items ?? []) if (i.category) set.add(i.category);
    return Array.from(set).sort();
  }, [items]);

  const driveOptions = useMemo(() => {
    const fromList = locationList.map((l) => l.value);
    const fromItems = new Set<string>();
    for (const i of items ?? []) {
      const loc = (i.storage_location ?? '').trim();
      if (loc) fromItems.add(loc);
    }
    return Array.from(new Set([...fromList, ...fromItems])).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [locationList, items]);

  const filtered = useMemo(() => {
    const list = items ?? [];
    return list.filter(i => {
      if (category !== 'all' && i.category !== category) return false;
      const loc = (i.storage_location ?? '').trim();
      if (driveFilter === 'unassigned') {
        if (loc) return false;
      } else if (driveFilter !== 'all' && loc !== driveFilter) {
        return false;
      }
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        i.name.toLowerCase().includes(q) ||
        (i.sku ?? '').toLowerCase().includes(q) ||
        (i.category ?? '').toLowerCase().includes(q) ||
        locationLabel(i.storage_location).toLowerCase().includes(q)
      );
    });
  }, [items, search, category, driveFilter]);

  const driveSummaries = useMemo(() => {
    const active = (items ?? []).filter((i) => !i.archived || showArchived);
    const byLoc = new Map<string, { location: string | null; itemCount: number; totalQty: number }>();

    for (const loc of locationList) {
      byLoc.set(loc.value, { location: loc.value, itemCount: 0, totalQty: 0 });
    }
    byLoc.set('__unassigned__', { location: null, itemCount: 0, totalQty: 0 });

    for (const item of active) {
      const key = (item.storage_location ?? '').trim() || '__unassigned__';
      const existing = byLoc.get(key) ?? {
        location: key === '__unassigned__' ? null : key,
        itemCount: 0,
        totalQty: 0,
      };
      existing.itemCount += 1;
      existing.totalQty += item.quantity_on_hand ?? 0;
      byLoc.set(key, existing);
    }

    const assigned = [...byLoc.entries()]
      .filter(([k]) => k !== '__unassigned__')
      .map(([, v]) => v)
      .sort((a, b) => locationLabel(a.location).localeCompare(locationLabel(b.location)));
    const unassigned = byLoc.get('__unassigned__')!;
    return [...assigned, unassigned];
  }, [items, locationList, showArchived]);

  if (error) return <AppShell><PageError message="Could not load stock items" /></AppShell>;

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Stock</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">
              {browseMode === 'drives'
                ? `${driveSummaries.filter((d) => d.itemCount > 0 || d.location !== null).length} drives`
                : `${items?.length ?? 0} total items`}
            </p>
          </div>
          {browseMode === 'items' && (
            <button
              onClick={() => { setEditingItem(null); setShowForm(true); }}
              className="flex items-center gap-2 bg-[#0A2540] text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e] transition-colors"
            >
              <Plus size={16} /> Add Item
            </button>
          )}
        </div>

        {/* Items | Drives toggle */}
        <div className="inline-flex rounded-lg border border-[#E5E7EB] p-0.5 mb-4 bg-[#F9FAFB]">
          <button
            type="button"
            onClick={() => setBrowseMode('items')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              browseMode === 'items' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-[#4A5568] hover:text-[#1A1A1A]'
            }`}
          >
            <Package size={14} /> Items
          </button>
          <button
            type="button"
            onClick={() => setBrowseMode('drives')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              browseMode === 'drives' ? 'bg-white text-[#1A1A1A] shadow-sm' : 'text-[#4A5568] hover:text-[#1A1A1A]'
            }`}
          >
            <HardDrive size={14} /> Drives
          </button>
        </div>

        {browseMode === 'drives' ? (
          isLoading ? (
            <SkeletonCardGrid />
          ) : driveSummaries.length === 0 ? (
            <EmptyState
              icon={HardDrive}
              title="No drives yet"
              message="Add storage locations under Settings â†’ Lists, or assign locations on stock items."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {driveSummaries.map((d) => (
                <DriveCard
                  key={d.location ?? '__unassigned__'}
                  location={d.location}
                  itemCount={d.itemCount}
                  totalQty={d.totalQty}
                />
              ))}
            </div>
          )
        ) : (
          <>
            {/* Search + filters */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <SearchBar value={search} onChange={setSearch} placeholder="Search by name, SKU, category, or drive..." />
              <ViewToggle mode={viewMode} onChange={setViewMode} />
              <div className="relative">
                <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="h-9 pl-8 pr-7 text-sm border border-[#E5E7EB] rounded-md bg-white text-[#4A5568] focus:outline-none focus:ring-2 focus:ring-[#2E75B6] appearance-none"
                >
                  <option value="all">All categories</option>
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
              </div>
              <div className="relative">
                <HardDrive size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
                <select
                  value={driveFilter}
                  onChange={e => setDriveFilter(e.target.value)}
                  className="h-9 pl-8 pr-7 text-sm border border-[#E5E7EB] rounded-md bg-white text-[#4A5568] focus:outline-none focus:ring-2 focus:ring-[#2E75B6] appearance-none max-w-[180px]"
                >
                  <option value="all">All drives</option>
                  <option value="unassigned">Unassigned</option>
                  {driveOptions.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none" />
              </div>
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
                icon={Boxes}
                title={search || category !== 'all' || driveFilter !== 'all' ? 'No items match your filters' : 'No stock items yet'}
                message={search || category !== 'all' || driveFilter !== 'all' ? 'Try adjusting your search or filters.' : 'Add your first stock item to get started.'}
                action={!search && category === 'all' && driveFilter === 'all' && (
                  <button onClick={() => { setEditingItem(null); setShowForm(true); }} className="btn-primary">
                    <Plus size={16} /> Add your first item
                  </button>
                )}
              />
            ) : viewMode === 'grid' ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map(item => (
                  <StockCard
                    key={item.id}
                    item={item}
                    onEdit={() => { setEditingItem(item); setShowForm(true); }}
                    onArchive={() => archiveMutation.mutate({ id: item.id, archived: !item.archived })}
                    onDelete={() => setDeleteTarget(item)}
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
                        <th className="px-4 py-3">SKU</th>
                        <th className="px-4 py-3">Category</th>
                        <th className="px-4 py-3">Drive</th>
                        <th className="px-4 py-3 text-right">Qty</th>
                        <th className="px-4 py-3 text-right">Unit Cost</th>
                        <th className="px-4 py-3">Level</th>
                        <th className="px-4 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F3F4F6]">
                      {filtered.map(item => (
                        <tr key={item.id} className="hover:bg-[#F9FAFB] cursor-pointer transition-colors" onClick={() => { setEditingItem(item); setShowForm(true); }}>
                          <td className="px-4 py-3 font-medium text-[#1A1A1A]">
                            <Link to={`/stock/${item.id}`} onClick={e => e.stopPropagation()}>{item.name}</Link>
                          </td>
                          <td className="px-4 py-3 text-[#4A5568]">{item.sku ?? <span className="text-[#9CA3AF]">â€”</span>}</td>
                          <td className="px-4 py-3 text-[#4A5568]">{item.category ?? <span className="text-[#9CA3AF]">â€”</span>}</td>
                          <td className="px-4 py-3 text-[#4A5568]" onClick={e => e.stopPropagation()}>
                            <Link
                              to={`/stock/locations/${encodeLocationKey(item.storage_location)}`}
                              className="hover:text-[#2E75B6] truncate inline-block max-w-[140px]"
                            >
                              {locationLabel(item.storage_location)}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-right text-[#4A5568]">{item.quantity_on_hand} {item.unit_of_measure}</td>
                          <td className="px-4 py-3 text-right font-medium text-[#1A1A1A]">{formatMoney(item.unit_cost)}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STOCK_LEVEL_STYLES[getStockLevel(item)]}`}>{STOCK_LEVEL_LABELS[getStockLevel(item)]}</span>
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex justify-end">
                              <ContextMenu items={[
                                { label: 'Edit', icon: Pencil, onClick: () => { setEditingItem(item); setShowForm(true); } },
                                { label: item.archived ? 'Restore' : 'Archive', icon: item.archived ? ArchiveRestore : Archive, onClick: () => archiveMutation.mutate({ id: item.id, archived: !item.archived }) },
                                { divider: true },
                                { label: 'Delete', icon: Trash2, onClick: () => setDeleteTarget(item), variant: 'danger' },
                              ]} />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {showForm && (
        <StockItemForm
          item={editingItem}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['stock-items'] });
            showToast(editingItem ? 'Item updated' : 'Item added');
          }}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete stock item?"
        message="This will permanently remove the item. This action cannot be undone."
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

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Stock Card ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

const StockCard = memo(function StockCard({
  item, onEdit, onArchive, onDelete,
}: {
  item: StockItemWithSupplier;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const level = getStockLevel(item);
  const menuItems: MenuEntry[] = [
    { label: 'Edit', icon: Pencil, onClick: onEdit },
    { label: item.archived ? 'Restore' : 'Archive', icon: item.archived ? ArchiveRestore : Archive, onClick: onArchive },
    { divider: true },
    { label: 'Delete', icon: Trash2, onClick: onDelete, variant: 'danger' },
  ];

  return (
    <div className="card-hover p-4">
      <div className="absolute top-3 right-3">
        <ContextMenu items={menuItems} />
      </div>

      <Link to={`/stock/${item.id}`} className="block">
        <div className="flex items-start gap-3 pr-8">
          <div className="w-10 h-10 rounded-lg bg-[#0A2540]/10 flex items-center justify-center shrink-0">
            <Package size={18} className="text-[#0A2540]" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[#1A1A1A] truncate">{item.name}</h3>
            <p className="text-xs text-[#4A5568] truncate mt-0.5">
              {item.sku ? `SKU: ${item.sku}` : 'No SKU'}
            </p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5">
          {item.category && (
            <div className="flex items-center gap-2 text-xs text-[#4A5568]">
              <Tag size={12} className="text-[#9CA3AF] shrink-0" />
              <span className="truncate">{item.category}</span>
            </div>
          )}
          <div className="flex items-center gap-2 text-xs text-[#4A5568]">
            <HardDrive size={12} className="text-[#9CA3AF] shrink-0" />
            <span className="truncate">{locationLabel(item.storage_location)}</span>
          </div>
        </div>

        {/* Stats footer */}
        <div className="mt-3 pt-3 border-t border-[#F3F4F6] flex items-center gap-4 text-xs text-[#6B7280]">
          <span className="flex items-center gap-1">
            <Boxes size={12} /> {item.quantity_on_hand} {item.unit_of_measure}
          </span>
          <span className="ml-auto font-medium text-[#1A1A1A]">{formatMoney(item.unit_cost)}</span>
        </div>
        <div className="mt-2">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STOCK_LEVEL_STYLES[level]}`}>
            {STOCK_LEVEL_LABELS[level]}
          </span>
        </div>
      </Link>
    </div>
  );
});

// ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Stock Item Form Modal ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬

export function StockItemForm({ item, onClose, onSaved }: {
  item: StockItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [form, setForm] = useState<Record<string, string>>({
    name: item?.name ?? '', sku: item?.sku ?? '', description: item?.description ?? '', category: item?.category ?? '',
    unit_of_measure: item?.unit_of_measure ?? 'each', quantity_on_hand: String(item?.quantity_on_hand ?? 0),
    reorder_level: String(item?.reorder_level ?? 0), reorder_quantity: String(item?.reorder_quantity ?? 0),
    storage_location: item?.storage_location ?? '', unit_cost: String(item?.unit_cost ?? 0), supplier_id: item?.supplier_id ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const { data: suppliers } = useQuery<Supplier[]>({
    queryKey: ['suppliers', 'stock-form'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('suppliers')
        .select('id, company_id, name, contact_person, phone, email, address, default_currency, notes, archived, created_at')
        .eq('archived', false)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setErr('Name is required'); return; }
    if (!profile?.company_id) return;
    setSaving(true);
    setErr('');

    const payload = {
      name: form.name.trim(), sku: form.sku.trim() || null, description: form.description.trim() || null,
      category: form.category.trim() || null, unit_of_measure: form.unit_of_measure.trim() || 'each',
      quantity_on_hand: Number(form.quantity_on_hand) || 0, reorder_level: Number(form.reorder_level) || 0,
      reorder_quantity: Number(form.reorder_quantity) || 0, storage_location: form.storage_location.trim() || null,
      unit_cost: Number(form.unit_cost) || 0, supplier_id: form.supplier_id || null,
    };

    const { error } = item
      ? await supabase.from('stock_items').update(payload).eq('id', item.id)
      : await supabase.from('stock_items').insert({ ...payload, company_id: profile.company_id });

    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-[#1A1A1A]">{item ? 'Edit Stock Item' : 'New Stock Item'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overlay-body">
          <Input label="Item Name" required k="name" ph="e.g. 20mm PVC Conduit" form={form} setForm={setForm} autoFocus />
          <div className="grid grid-cols-2 gap-3">
            <Input label="SKU" k="sku" ph="PVC-20" form={form} setForm={setForm} />
            <Field label="Category">
              <ManagedSelect listKey={LIST_KEYS.stockCategories} value={form.category}
                onChange={v => setForm(f => ({ ...f, category: v }))} placeholder="Select category..." />
            </Field>
          </div>
          <Field label="Description">
            <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="form-input min-h-[60px] resize-y" placeholder="Optional description..." />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unit of Measure">
              <ManagedSelect listKey={LIST_KEYS.unitsOfMeasure} value={form.unit_of_measure}
                onChange={v => setForm(f => ({ ...f, unit_of_measure: v }))} placeholder="each" noneLabel="each" />
            </Field>
            <Field label="Drive">
              <ManagedSelect listKey={LIST_KEYS.storageLocations} value={form.storage_location}
                onChange={v => setForm(f => ({ ...f, storage_location: v }))} placeholder="Select drive..." noneLabel="Unassigned" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Input label="Qty On Hand" k="quantity_on_hand" ph="0" type="number" form={form} setForm={setForm} />
            <Input label="Reorder Level" k="reorder_level" ph="0" type="number" form={form} setForm={setForm} />
            <Input label="Reorder Qty" k="reorder_quantity" ph="0" type="number" form={form} setForm={setForm} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Unit Cost (AUD)" k="unit_cost" ph="0.00" type="number" step="0.01" min="0" form={form} setForm={setForm} />
            <Field label="Supplier">
              <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))} className="form-input">
                <option value="">None</option>
                {(suppliers ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </form>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#4A5568] border border-[#E5E7EB] rounded-md hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md hover:bg-[#0d2f4e] disabled:opacity-50">
            {saving ? 'Saving...' : item ? 'Save Changes' : 'Add Item'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#4A5568] mb-1">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
    </div>
  );
}

function Input({
  label, k, ph, form, setForm, type = 'text', step, min, required, autoFocus,
}: {
  label: string; k: string; ph: string; form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  type?: string; step?: string; min?: string; required?: boolean; autoFocus?: boolean;
}) {
  return (
    <Field label={label} required={required}>
      <input type={type} step={step} min={min} value={form[k]} autoFocus={autoFocus}
        onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} className="form-input" placeholder={ph} />
    </Field>
  );
}
