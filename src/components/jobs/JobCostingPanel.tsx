import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import {
  formatMoney, COST_TYPE_LABELS, COST_TYPE_STYLES,
  type JobCost, type CostType, type StockItem,
} from '../../types/fsm';
import {
  Plus, Package, Trash2, DollarSign, Layers, HardHat, Wrench,
  Check, X, AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';

interface JobCostingPanelProps { jobId: string }

const COST_TYPES: CostType[] = ['materials', 'labor', 'other'];
const COST_ICON: Record<CostType, typeof Layers> = { materials: Layers, labor: HardHat, other: Wrench };
const STAT_BORDER: Record<CostType, string> = {
  materials: 'border-l-blue-400', labor: 'border-l-purple-400', other: 'border-l-gray-400',
};

export function JobCostingPanel({ jobId }: JobCostingPanelProps) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  // ── Load costs ──────────────────────────────────────────────────
  const { data: costs = [] } = useQuery<JobCost[]>({
    queryKey: ['job-costs', jobId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_costs').select('*').eq('job_id', jobId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as JobCost[];
    },
  });

  const sum = (t: CostType) => costs.filter(c => c.cost_type === t).reduce((s, c) => s + c.total_cost, 0);
  const totals = { materials: sum('materials'), labor: sum('labor'), other: sum('other') };
  const grandTotal = totals.materials + totals.labor + totals.other;

  // ── Add cost form ───────────────────────────────────────────────
  const [form, setForm] = useState({ cost_type: 'materials' as CostType, description: '', quantity: '1', unit_cost: '' });
  const [formErr, setFormErr] = useState('');

  const addCost = useMutation({
    mutationFn: async (payload: Omit<JobCost, 'id' | 'created_at'>) => {
      const { data, error } = await supabase.from('job_costs').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-costs', jobId] });
      setForm({ cost_type: 'materials', description: '', quantity: '1', unit_cost: '' });
      setFormErr('');
    },
  });

  const submitCost = () => {
    const description = form.description.trim();
    if (!description) return setFormErr('Description is required');
    if (!profile?.company_id) return setFormErr('No company context');
    const qty = parseFloat(form.quantity) || 0;
    const unit = parseFloat(form.unit_cost) || 0;
    if (qty <= 0 || unit < 0) return setFormErr('Enter a valid quantity and unit cost');
    addCost.mutate({
      company_id: profile.company_id, job_id: jobId, cost_type: form.cost_type,
      description, quantity: qty, unit_cost: unit,
      total_cost: Number((qty * unit).toFixed(2)),
      stock_item_id: null, purchase_order_id: null, created_by: profile.id,
    });
  };

  // ── Delete cost ─────────────────────────────────────────────────
  const deleteCost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('job_costs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['job-costs', jobId] }),
  });

  // ── Stock allocation ────────────────────────────────────────────
  const [showPicker, setShowPicker] = useState(false);
  const [selectedItem, setSelectedItem] = useState<StockItem | null>(null);
  const [allocQty, setAllocQty] = useState('1');
  const [allocErr, setAllocErr] = useState('');

  const { data: stockItems = [], refetch: refetchStock } = useQuery<StockItem[]>({
    queryKey: ['stock-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_items').select('*').eq('archived', false)
        .gt('quantity_on_hand', 0).order('name');
      if (error) throw error;
      return data as StockItem[];
    },
    enabled: showPicker,
  });

  const allocateParts = useMutation({
    mutationFn: async ({ item, qty }: { item: StockItem; qty: number }) => {
      if (!profile?.company_id) throw new Error('No company context');
      const { error: cErr } = await supabase.from('job_costs').insert({
        company_id: profile.company_id, job_id: jobId, cost_type: 'materials',
        description: item.name, quantity: qty, unit_cost: item.unit_cost,
        total_cost: Number((qty * item.unit_cost).toFixed(2)),
        stock_item_id: item.id, purchase_order_id: null, created_by: profile.id,
      });
      if (cErr) throw cErr;
      const { error: mErr } = await supabase.from('stock_movements').insert({
        company_id: profile.company_id, stock_item_id: item.id,
        movement_type: 'allocated_to_job', quantity: -qty, job_id: jobId,
        purchase_order_id: null, reason: 'Allocated to job', created_by: profile.id,
      });
      if (mErr) throw mErr;
      const { error: uErr } = await supabase.from('stock_items')
        .update({ quantity_on_hand: item.quantity_on_hand - qty, updated_at: new Date().toISOString() })
        .eq('id', item.id);
      if (uErr) throw uErr;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job-costs', jobId] });
      queryClient.invalidateQueries({ queryKey: ['stock-items'] });
      setSelectedItem(null); setAllocQty('1'); setAllocErr(''); setShowPicker(false);
    },
    onError: (e: Error) => setAllocErr(e.message),
  });

  const confirmAllocation = () => {
    if (!selectedItem) return;
    const qty = parseInt(allocQty, 10);
    if (!qty || qty <= 0) return setAllocErr('Enter a valid quantity');
    if (qty > selectedItem.quantity_on_hand) return setAllocErr(`Only ${selectedItem.quantity_on_hand} available`);
    allocateParts.mutate({ item: selectedItem, qty });
  };

  const lineTotal = (parseFloat(form.quantity) || 0) * (parseFloat(form.unit_cost) || 0);

  return (
    <div className="space-y-4">
      {/* ── Summary stat cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {COST_TYPES.map(type => {
          const Icon = COST_ICON[type];
          return (
            <div key={type} className={`bg-white rounded-xl border border-[#E5E7EB] border-l-4 ${STAT_BORDER[type]} p-3`}>
              <div className="flex items-center gap-1.5 text-[#4A5568]">
                <Icon size={14} /><span className="text-xs font-medium">{COST_TYPE_LABELS[type]}</span>
              </div>
              <p className="mt-1 text-lg font-bold text-[#0A2540]">{formatMoney(totals[type])}</p>
            </div>
          );
        })}
        <div className="bg-[#0A2540] rounded-xl p-3 flex flex-col justify-center">
          <div className="flex items-center gap-1.5 text-white/70">
            <DollarSign size={14} /><span className="text-xs font-medium">Grand Total</span>
          </div>
          <p className="mt-1 text-lg font-bold text-white">{formatMoney(grandTotal)}</p>
        </div>
      </div>

      {/* ── Costs table ─────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-[#F9FAFB] text-[#4A5568] text-xs">
            <tr>
              {['Date', 'Type', 'Description'].map(h => <th key={h} className="text-left font-medium px-3 py-2">{h}</th>)}
              <th className="text-right font-medium px-3 py-2">Qty</th>
              <th className="text-right font-medium px-3 py-2">Unit Cost</th>
              <th className="text-right font-medium px-3 py-2">Total</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E5E7EB]">
            {costs.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-[#4A5568]">No costs recorded yet. Add one below.</td></tr>
            )}
            {costs.map(c => (
              <tr key={c.id} className="hover:bg-[#F9FAFB]">
                <td className="px-3 py-2 text-[#4A5568] whitespace-nowrap">{format(new Date(c.created_at), 'dd MMM')}</td>
                <td className="px-3 py-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${COST_TYPE_STYLES[c.cost_type]}`}>
                    {COST_TYPE_LABELS[c.cost_type]}
                  </span>
                </td>
                <td className="px-3 py-2 text-[#1A1A1A]">{c.description}</td>
                <td className="px-3 py-2 text-right text-[#4A5568]">{c.quantity}</td>
                <td className="px-3 py-2 text-right text-[#4A5568]">{formatMoney(c.unit_cost)}</td>
                <td className="px-3 py-2 text-right font-semibold text-[#0A2540]">{formatMoney(c.total_cost)}</td>
                <td className="px-3 py-2">
                  <button onClick={() => deleteCost.mutate(c.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                    title="Delete cost"><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Add cost form ───────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
        <h3 className="text-sm font-semibold text-[#0A2540] mb-3">Add Cost</h3>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {COST_TYPES.map(type => {
            const Icon = COST_ICON[type];
            const selected = form.cost_type === type;
            return (
              <button key={type} type="button" onClick={() => setForm(f => ({ ...f, cost_type: type }))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  selected ? 'bg-[#0A2540] text-white' : 'bg-gray-100 text-[#4A5568] hover:bg-gray-200'}`}>
                <Icon size={13} /> {COST_TYPE_LABELS[type]}
              </button>
            );
          })}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            className="form-input md:col-span-6" placeholder="Description" />
          <input type="number" min="1" step="1" value={form.quantity}
            onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
            className="form-input md:col-span-2" placeholder="Qty" />
          <div className="md:col-span-3 relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#4A5568] text-sm">$</span>
            <input type="number" min="0" step="0.01" value={form.unit_cost}
              onChange={e => setForm(f => ({ ...f, unit_cost: e.target.value }))}
              className="form-input pl-6" placeholder="Unit cost" />
          </div>
          <button onClick={submitCost} disabled={addCost.isPending}
            className="md:col-span-1 h-[38px] flex items-center justify-center gap-1 bg-[#0A2540] text-white rounded-md text-sm font-medium hover:bg-[#0d2f4e] disabled:opacity-50">
            <Plus size={15} /> Add
          </button>
        </div>
        {formErr && <p className="text-xs text-red-600 mt-2">{formErr}</p>}
        {form.unit_cost && form.quantity && (
          <p className="text-xs text-[#4A5568] mt-2">
            Line total: <span className="font-medium text-[#0A2540]">{formatMoney(lineTotal)}</span>
          </p>
        )}
      </div>

      {/* ── Allocate parts from stock ──────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-[#2E75B6]" />
            <h3 className="text-sm font-semibold text-[#0A2540]">Allocate Parts from Stock</h3>
          </div>
          {!showPicker && (
            <button onClick={() => { setShowPicker(true); refetchStock(); }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#2E75B6] border border-[#2E75B6] rounded-md hover:bg-blue-50">
              <Package size={13} /> Allocate Parts
            </button>
          )}
        </div>

        {showPicker && !selectedItem && (
          <div className="mt-3 border border-[#E5E7EB] rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 bg-[#F9FAFB] border-b border-[#E5E7EB]">
              <span className="text-xs font-medium text-[#4A5568]">Select a stock item</span>
              <button onClick={() => setShowPicker(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="max-h-64 overflow-auto divide-y divide-[#E5E7EB]">
              {stockItems.length === 0 && <p className="px-3 py-6 text-center text-sm text-[#4A5568]">No stock items available</p>}
              {stockItems.map(item => (
                <button key={item.id} onClick={() => { setSelectedItem(item); setAllocQty('1'); setAllocErr(''); }}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-[#F9FAFB]">
                  <div>
                    <p className="text-sm font-medium text-[#1A1A1A]">{item.name}</p>
                    <p className="text-xs text-[#4A5568]">{item.sku ?? '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[#4A5568]">{item.quantity_on_hand} on hand</p>
                    <p className="text-xs font-medium text-[#0A2540]">{formatMoney(item.unit_cost)}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {selectedItem && (
          <div className="mt-3 border border-[#E5E7EB] rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-sm font-medium text-[#1A1A1A]">{selectedItem.name}</p>
                <p className="text-xs text-[#4A5568]">{selectedItem.quantity_on_hand} on hand · {formatMoney(selectedItem.unit_cost)} each</p>
              </div>
              <button onClick={() => { setSelectedItem(null); setAllocErr(''); }} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
            </div>
            <div className="flex items-end gap-2">
              <div className="w-32">
                <label className="block text-xs font-medium text-[#4A5568] mb-1">Quantity</label>
                <input type="number" min="1" max={selectedItem.quantity_on_hand} value={allocQty}
                  onChange={e => setAllocQty(e.target.value)} className="form-input" />
              </div>
              <button onClick={confirmAllocation} disabled={allocateParts.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-[#F7931A] text-white rounded-md text-sm font-medium hover:bg-[#e08415] disabled:opacity-50">
                <Check size={15} /> Confirm
              </button>
            </div>
            {allocErr && <p className="flex items-center gap-1 text-xs text-red-600 mt-2"><AlertCircle size={12} /> {allocErr}</p>}
            <p className="text-xs text-[#4A5568] mt-2">
              Cost to job: <span className="font-medium text-[#0A2540]">
                {formatMoney((parseInt(allocQty, 10) || 0) * selectedItem.unit_cost)}
              </span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
