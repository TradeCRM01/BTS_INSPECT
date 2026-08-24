import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, Breadcrumbs, useToast } from '../components/ui';
import { StockItemForm } from './StockPage';
import { MoveStockModal, toMoveTargets } from '../components/stock/MoveStockModal';
import type { StockItemWithSupplier, StockMovementWithDetails } from '../types/fsm';
import { getAuditEmptyList, getAuditStockItem } from '../lib/devFieldAuditDocs';
import {
  getStockLevel, STOCK_LEVEL_STYLES, STOCK_LEVEL_LABELS, formatMoney,
} from '../types/fsm';
import { format, parseISO } from 'date-fns';
import {
  Package, Tag, MapPin, Pencil, AlertTriangle, ArrowUpCircle,
  ArrowDownCircle, RotateCcw, SlidersHorizontal, TrendingUp, ArrowRightLeft,
} from 'lucide-react';

const MOVEMENT_META: Record<
  StockMovementWithDetails['movement_type'],
  { label: string; icon: typeof ArrowUpCircle; qtyClass: string }
> = {
  received: { label: 'Received', icon: TrendingUp, qtyClass: 'text-green-600' },
  allocated_to_job: { label: 'Allocated', icon: ArrowDownCircle, qtyClass: 'text-red-600' },
  returned: { label: 'Returned', icon: RotateCcw, qtyClass: 'text-green-600' },
  adjusted: { label: 'Adjusted', icon: SlidersHorizontal, qtyClass: 'text-[#4A5568]' },
  transferred: { label: 'Transferred', icon: ArrowRightLeft, qtyClass: 'text-[#2E75B6]' },
};

export function StockDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [showMove, setShowMove] = useState(false);
  const [adjQty, setAdjQty] = useState('');
  const [adjReason, setAdjReason] = useState('');

  const { data: item, isLoading, error } = useQuery<StockItemWithSupplier>({
    queryKey: ['stock-items', id],
    queryFn: async () => {
      const mock = getAuditStockItem(id!);
      if (mock) return mock as StockItemWithSupplier;
      const { data, error } = await supabase
        .from('stock_items')
        .select('id, company_id, name, sku, description, category, unit_of_measure, quantity_on_hand, reorder_level, reorder_quantity, storage_location, unit_cost, supplier_id, archived, created_at, updated_at, suppliers!supplier_id(name)')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Item not found');
      const row = data as StockItemWithSupplier & { suppliers?: { name: string } | null };
      return { ...row, supplier_name: row.suppliers?.name ?? null };
    },
    enabled: !!id && !!profile,
  });

  const { data: movements } = useQuery<StockMovementWithDetails[]>({
    queryKey: ['stock-movements', id],
    queryFn: async () => {
      const empty = getAuditEmptyList();
      if (empty) return empty as StockMovementWithDetails[];
      const { data, error } = await supabase
        .from('stock_movements')
        .select('id, company_id, stock_item_id, movement_type, quantity, job_id, purchase_order_id, reason, created_by, created_at, jobs!job_id(title), purchase_orders!purchase_order_id(po_number)')
        .eq('stock_item_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as (StockMovementWithDetails & {
        jobs?: { title: string } | null;
        purchase_orders?: { po_number: number | null } | null;
      })[]).map(m => ({
        ...m,
        job_title: m.jobs?.title ?? null,
        po_number: m.purchase_orders?.po_number ?? null,
      }));
    },
    enabled: !!id && !!profile,
  });

  const adjustMutation = useMutation({
    mutationFn: async ({ quantity, reason }: { quantity: number; reason: string }) => {
      if (!id || !profile?.company_id) throw new Error('Missing context');
      const { error: mErr } = await supabase.from('stock_movements').insert({
        company_id: profile.company_id,
        stock_item_id: id,
        movement_type: 'adjusted',
        quantity,
        reason: reason.trim() || null,
        created_by: profile.id,
      });
      if (mErr) throw mErr;
      const { error: uErr } = await supabase
        .from('stock_items')
        .update({ quantity_on_hand: (item!.quantity_on_hand + quantity) })
        .eq('id', id);
      if (uErr) throw uErr;
    },
    onSuccess: () => {
      setAdjQty('');
      setAdjReason('');
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      queryClient.invalidateQueries({ queryKey: ['stock-movements', id] });
    },
  });

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><LoadingSpinner /></div></AppShell>;
  if (error || !item) return <AppShell><PageError message="Could not load this stock item" onRetry={() => navigate('/stock')} /></AppShell>;

  const level = getStockLevel(item);
  const totalValue = item.quantity_on_hand * item.unit_cost;
  const isLow = level !== 'adequate';

  const handleAdjust = () => {
    const qty = Number(adjQty);
    if (!adjQty || isNaN(qty) || qty === 0) return;
    adjustMutation.mutate({ quantity: qty, reason: adjReason });
  };

  const stats = [
    { label: 'Current Quantity', value: `${item.quantity_on_hand} ${item.unit_of_measure}`, icon: Package },
    { label: 'Reorder Level', value: `${item.reorder_level} ${item.unit_of_measure}`, icon: AlertTriangle },
    { label: 'Unit Cost', value: formatMoney(item.unit_cost), icon: Tag },
    { label: 'Total Value', value: formatMoney(totalValue), icon: TrendingUp },
  ];

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 py-6 space-y-4">
        <Breadcrumbs items={[{ label: 'Stock', to: '/stock' }, { label: item.name }]} />

        {/* Header card */}
        <div className="card p-5">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg bg-[#0A2540]/10 flex items-center justify-center shrink-0">
                <Package size={22} className="text-[#0A2540]" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-[#1A1A1A]">{item.name}</h1>
                <div className="flex items-center gap-3 mt-1 text-xs text-[#4A5568] flex-wrap">
                  {item.sku && <span>SKU: {item.sku}</span>}
                  {item.category && (
                    <span className="flex items-center gap-1"><Tag size={12} className="text-[#9CA3AF]" /> {item.category}</span>
                  )}
                  {item.storage_location ? (
                    <span className="flex items-center gap-1"><MapPin size={12} className="text-[#9CA3AF]" /> {item.storage_location}</span>
                  ) : (
                    <span className="flex items-center gap-1 text-[#9CA3AF]"><MapPin size={12} /> Unassigned</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center px-2.5 py-1 rounded text-xs font-medium ${STOCK_LEVEL_STYLES[level]}`}>
                {STOCK_LEVEL_LABELS[level]}
              </span>
              <button
                type="button"
                onClick={() => setShowMove(true)}
                className="flex items-center gap-2 border border-[#E5E7EB] bg-white text-[#1A1A1A] px-3 py-2 rounded-md text-sm font-medium hover:bg-[#F9FAFB] transition-colors"
              >
                <ArrowRightLeft size={15} /> Move to drive
              </button>
              <button
                onClick={() => setShowForm(true)}
                className="flex items-center gap-2 bg-[#0A2540] text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e] transition-colors"
              >
                <Pencil size={15} /> Edit
              </button>
            </div>
          </div>
        </div>

        {/* Low stock warning */}
        {isLow && (
          <div className={`flex items-center gap-2 rounded-lg px-4 py-3 text-sm ${level === 'out' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
            <AlertTriangle size={16} />
            {level === 'out'
              ? 'This item is out of stock. Place a reorder to replenish.'
              : `Stock is at/below the reorder level of ${item.reorder_level} ${item.unit_of_measure}.`}
          </div>
        )}

        {/* Stats row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4">
              <div className="flex items-center gap-2 text-xs text-[#4A5568]">
                <s.icon size={14} className="text-[#9CA3AF]" /> {s.label}
              </div>
              <p className="text-lg font-semibold text-[#1A1A1A] mt-1">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Adjustment + history */}
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Manual adjustment */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-5">
            <h2 className="text-sm font-semibold text-[#1A1A1A] mb-3 flex items-center gap-2">
              <SlidersHorizontal size={15} className="text-[#2E75B6]" /> Manual Adjustment
            </h2>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#4A5568] mb-1">
                  Quantity <span className="text-[#9CA3AF]">(positive = add, negative = remove)</span>
                </label>
                <input
                  type="number" step="any" value={adjQty}
                  onChange={e => setAdjQty(e.target.value)}
                  className="form-input" placeholder="e.g. 10 or -5"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#4A5568] mb-1">Reason</label>
                <input
                  value={adjReason}
                  onChange={e => setAdjReason(e.target.value)}
                  className="form-input" placeholder="e.g. Stock count correction"
                />
              </div>
              {adjustMutation.isError && (
                <p className="text-xs text-red-600">{(adjustMutation.error as Error).message}</p>
              )}
              <button
                onClick={handleAdjust}
                disabled={adjustMutation.isPending || !adjQty || Number(adjQty) === 0}
                className="w-full flex items-center justify-center gap-2 bg-[#0A2540] text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e] disabled:opacity-50"
              >
                {adjustMutation.isPending ? 'Adjusting...' : <><SlidersHorizontal size={15} /> Adjust</>}
              </button>
            </div>
          </div>

          {/* Movement history */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-[#E5E7EB]">
              <h2 className="text-sm font-semibold text-[#1A1A1A]">Stock Movement History</h2>
            </div>
            {(movements ?? []).length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-[#4A5568]">No movements recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[#4A5568] border-b border-[#E5E7EB]">
                      <th className="px-5 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium text-right">Qty</th>
                      <th className="px-3 py-2 font-medium">Job</th>
                      <th className="px-5 py-2 font-medium">Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(movements ?? []).map(m => {
                      const meta = MOVEMENT_META[m.movement_type] ?? {
                        label: m.movement_type,
                        icon: ArrowRightLeft,
                        qtyClass: 'text-[#4A5568]',
                      };
                      const Icon = meta.icon;
                      return (
                        <tr key={m.id} className="border-b border-[#F3F4F6] last:border-0">
                          <td className="px-5 py-3 text-[#4A5568] whitespace-nowrap">
                            {format(parseISO(m.created_at), 'd MMM yyyy')}
                          </td>
                          <td className="px-3 py-3">
                            <span className="inline-flex items-center gap-1.5 text-[#1A1A1A]">
                              <Icon size={14} className="text-[#9CA3AF]" /> {meta.label}
                            </span>
                          </td>
                          <td className={`px-3 py-3 text-right font-medium ${meta.qtyClass}`}>
                            {m.movement_type === 'transferred'
                              ? '—'
                              : `${m.quantity > 0 ? '+' : ''}${m.quantity}`}
                          </td>
                          <td className="px-3 py-3 text-[#4A5568]">{m.job_title ?? '—'}</td>
                          <td className="px-5 py-3 text-[#4A5568]">{m.reason ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <StockItemForm
          item={item}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['stock-items'] });
            showToast('Stock item updated');
          }}
        />
      )}

      {showMove && (
        <MoveStockModal
          items={toMoveTargets([item])}
          onClose={() => setShowMove(false)}
        />
      )}
    </AppShell>
  );
}
