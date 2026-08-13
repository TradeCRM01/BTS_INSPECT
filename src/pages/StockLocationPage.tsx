import { useState, useMemo, memo } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRightLeft, Package, Boxes, CheckSquare } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { PageError, EmptyState, SearchBar, Breadcrumbs, ContextMenu } from '../components/ui';
import { SkeletonCardGrid } from '../components/ui/Skeletons';
import { MoveStockModal, toMoveTargets } from '../components/stock/MoveStockModal';
import { decodeLocationKey, locationLabel, encodeLocationKey } from '../lib/stockLocations';
import type { StockItemWithSupplier, StockItem } from '../types/fsm';
import { getStockLevel, STOCK_LEVEL_STYLES, STOCK_LEVEL_LABELS } from '../types/fsm';

export function StockLocationPage() {
  const { locationKey } = useParams<{ locationKey: string }>();
  const navigate = useNavigate();
  const location = decodeLocationKey(locationKey);
  const label = locationLabel(location);
  const { profile } = useAuth();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [moveItems, setMoveItems] = useState<StockItemWithSupplier[] | null>(null);

  const { data: items, isLoading, error } = useQuery<StockItemWithSupplier[]>({
    queryKey: ['stock-items', false],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_items')
        .select('id, company_id, name, sku, description, category, unit_of_measure, quantity_on_hand, reorder_level, reorder_quantity, storage_location, unit_cost, supplier_id, archived, created_at, updated_at, suppliers!supplier_id(name)')
        .eq('archived', false)
        .order('name', { ascending: true });
      if (error) throw error;
      return ((data ?? []) as (StockItem & { suppliers?: { name: string } | null })[]).map(
        (i) => ({ ...i, supplier_name: i.suppliers?.name ?? null } as StockItemWithSupplier)
      );
    },
    enabled: !!profile,
  });

  const inLocation = useMemo(() => {
    const list = items ?? [];
    return list.filter((i) => {
      const loc = (i.storage_location ?? '').trim();
      if (location === null) return !loc;
      return loc === location;
    });
  }, [items, location]);

  const filtered = useMemo(() => {
    if (!search.trim()) return inLocation;
    const q = search.toLowerCase();
    return inLocation.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.sku ?? '').toLowerCase().includes(q) ||
        (i.category ?? '').toLowerCase().includes(q)
    );
  }, [inLocation, search]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((i) => i.id)));
  }

  const selectedItems = filtered.filter((i) => selected.has(i.id));

  if (error) return <AppShell><PageError message="Could not load stock for this drive" /></AppShell>;

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        <Breadcrumbs
          items={[
            { label: 'Stock', to: '/stock' },
            { label: 'Drives', to: '/stock?view=drives' },
            { label },
          ]}
        />

        <div className="flex items-center justify-between mb-6 flex-wrap gap-3 mt-2">
          <div className="flex items-start gap-3">
            <Link
              to="/stock?view=drives"
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-[#E5E7EB] text-[#4A5568] hover:bg-[#F9FAFB]"
            >
              <ArrowLeft size={16} />
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-[#1A1A1A]">{label}</h1>
              <p className="text-sm text-[#4A5568] mt-0.5">
                {inLocation.length} item{inLocation.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>
          {selected.size > 0 && (
            <button
              type="button"
              onClick={() => setMoveItems(selectedItems)}
              className="flex items-center gap-2 bg-[#0A2540] text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e]"
            >
              <ArrowRightLeft size={16} /> Move selected ({selected.size})
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Search items in this drive..." />
        </div>

        {isLoading ? (
          <SkeletonCardGrid />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Boxes}
            title={search ? 'No items match your search' : 'This drive is empty'}
            message={search ? 'Try a different search.' : 'Move items here from another drive or assign a location when editing stock.'}
          />
        ) : (
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9FAFB] text-left text-xs font-medium text-[#4A5568] uppercase tracking-wide">
                    <th className="px-4 py-3 w-10">
                      <button
                        type="button"
                        onClick={toggleAll}
                        className="text-[#9CA3AF] hover:text-[#2E75B6]"
                        title="Select all"
                      >
                        <CheckSquare size={16} />
                      </button>
                    </th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">SKU</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3 text-right">Qty</th>
                    <th className="px-4 py-3">Level</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {filtered.map((item) => {
                    const level = getStockLevel(item);
                    return (
                      <tr key={item.id} className="hover:bg-[#F9FAFB] transition-colors">
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(item.id)}
                            onChange={() => toggle(item.id)}
                            className="rounded border-[#D1D5DB] text-[#2E75B6] focus:ring-[#2E75B6]"
                          />
                        </td>
                        <td className="px-4 py-3 font-medium text-[#1A1A1A]">
                          <Link to={`/stock/${item.id}`} className="hover:text-[#2E75B6]">
                            {item.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-[#4A5568]">{item.sku ?? '—'}</td>
                        <td className="px-4 py-3 text-[#4A5568]">{item.category ?? '—'}</td>
                        <td className="px-4 py-3 text-right text-[#4A5568]">
                          {item.quantity_on_hand} {item.unit_of_measure}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STOCK_LEVEL_STYLES[level]}`}>
                            {STOCK_LEVEL_LABELS[level]}
                          </span>
                        </td>
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end">
                            <ContextMenu
                              items={[
                                { label: 'Open', icon: Package, onClick: () => navigate(`/stock/${item.id}`) },
                                { label: 'Move…', icon: ArrowRightLeft, onClick: () => setMoveItems([item]) },
                              ]}
                            />
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

      {moveItems && moveItems.length > 0 && (
        <MoveStockModal
          items={toMoveTargets(moveItems)}
          onClose={() => setMoveItems(null)}
          onMoved={() => {
            setSelected(new Set());
            setMoveItems(null);
          }}
        />
      )}
    </AppShell>
  );
}

/** Drive summary cards for Stock page Drives mode */
export const DriveCard = memo(function DriveCard({
  location,
  itemCount,
  totalQty,
}: {
  location: string | null;
  itemCount: number;
  totalQty: number;
}) {
  const label = locationLabel(location);
  const key = encodeLocationKey(location);
  return (
    <Link
      to={`/stock/locations/${key}`}
      className="card-hover p-4 block"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#0A2540]/10 flex items-center justify-center shrink-0">
          <Package size={18} className="text-[#0A2540]" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-[#1A1A1A] truncate">{label}</h3>
          <p className="text-xs text-[#4A5568] mt-0.5">
            {itemCount} item{itemCount === 1 ? '' : 's'}
          </p>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t border-[#F3F4F6] text-xs text-[#6B7280]">
        <span className="flex items-center gap-1">
          <Boxes size={12} /> {totalQty} on hand
        </span>
      </div>
    </Link>
  );
});
