import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, EmptyState, SearchBar, SummaryCard, useToast, ViewToggle, useViewMode } from '../components/ui';
import { SkeletonRow, SkeletonSummaryCards } from '../components/ui/Skeletons';
import type {
  PurchaseOrderWithDetails, PurchaseOrder, POLineItem, POStatus,
  Supplier, StockItem,
} from '../types/fsm';
import {
  PO_STATUS_LABELS, PO_STATUS_STYLES, formatMoney,
} from '../types/fsm';
import {
  Plus, Search, FileText, X, Trash2, PackagePlus, PackageCheck,
  Package, ArrowRight,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';

type StatusFilter = 'all' | POStatus;
const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'partially_received', label: 'Partially Received' },
  { key: 'received', label: 'Received' },
  { key: 'cancelled', label: 'Cancelled' },
];

export function PurchaseOrdersPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [editingPO, setEditingPO] = useState<PurchaseOrderWithDetails | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [receivingPO, setReceivingPO] = useState<PurchaseOrderWithDetails | null>(null);
  const [viewMode, setViewMode] = useViewMode('purchase-orders', 'list');

  const { data: pos, isLoading, error } = useQuery<PurchaseOrderWithDetails[]>({
    queryKey: ['purchase-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const poList = (data ?? []) as PurchaseOrder[];

      const [supRes, jobRes] = await Promise.all([
        supabase.from('suppliers').select('id, name'),
        supabase.from('jobs').select('id, title, job_number'),
      ]);
      const supMap = new Map((supRes.data ?? []).map(s => [s.id, s.name]));
      const jobMap = new Map((jobRes.data ?? []).map(j => [j.id, { title: j.title, job_number: j.job_number }]));

      return poList.map(po => ({
        ...po,
        line_items: (po.line_items ?? []) as POLineItem[],
        supplier_name: po.supplier_id ? (supMap.get(po.supplier_id) ?? null) : null,
        job_title: po.job_id ? (jobMap.get(po.job_id)?.title ?? null) : null,
        job_number: po.job_id ? (jobMap.get(po.job_id)?.job_number ?? null) : null,
      }));
    },
    enabled: !!profile,
  });

  const filtered = useMemo(() => {
    let list = pos ?? [];
    if (statusFilter !== 'all') list = list.filter(po => po.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(po =>
        String(po.po_number).includes(q) ||
        (po.supplier_name ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [pos, statusFilter, search]);

  if (error) return <AppShell><PageError message="Could not load purchase orders" /></AppShell>;

  const totals = useMemo(() => {
    const all = pos ?? [];
    const open = all.filter(po => po.status === 'draft' || po.status === 'sent' || po.status === 'partially_received');
    const openValue = open.reduce((s, po) => s + (po.total ?? 0), 0);
    const received = all.filter(po => po.status === 'received');
    const receivedValue = received.reduce((s, po) => s + (po.total ?? 0), 0);
    return { openCount: open.length, openValue, receivedCount: received.length, receivedValue };
  }, [pos]);

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Purchase Orders</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">{pos?.length ?? 0} total purchase orders</p>
          </div>
          <button onClick={() => { setEditingPO(null); setShowEditor(true); }} className="btn-primary">
            <Plus size={16} /> New PO
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {isLoading ? (
            <SkeletonSummaryCards count={2} />
          ) : (
            <>
              <SummaryCard label="Open POs" value={`${totals.openCount}`} subtext={formatMoney(totals.openValue)} accentColor="#2E75B6" />
              <SummaryCard label="Received POs" value={`${totals.receivedCount}`} subtext={formatMoney(totals.receivedValue)} accentColor="#16A34A" />
            </>
          )}
        </div>

        {/* Search + filter row */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by PO number or supplier name..." />
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 mb-4 border-b border-[#E5E7EB] overflow-x-auto">
          {STATUS_TABS.map(tab => {
            const count = tab.key === 'all' ? (pos?.length ?? 0) : (pos?.filter(po => po.status === tab.key).length ?? 0);
            const active = statusFilter === tab.key;
            return (
              <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  active ? 'border-[#0A2540] text-[#0A2540]' : 'border-transparent text-[#4A5568] hover:text-[#1A1A1A]'
                }`}>
                {tab.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${active ? 'bg-[#0A2540] text-white' : 'bg-gray-100 text-[#6B7280]'}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Table */}
        {isLoading ? (
          <SkeletonRow />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={search || statusFilter !== 'all' ? 'No purchase orders match your filters' : 'No purchase orders yet'}
            message={search || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'Create your first PO to get started.'}
            action={!search && statusFilter === 'all' && (
              <button onClick={() => { setEditingPO(null); setShowEditor(true); }} className="btn-primary">
                <Plus size={16} /> Create your first PO
              </button>
            )}
          />
        ) : viewMode === 'list' ? (
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB] text-left text-xs font-medium text-[#6B7280] uppercase tracking-wide">
                  <th className="px-4 py-3">PO Number</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3">Expected</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {filtered.map(po => (
                  <PORow key={po.id} po={po}
                    onOpen={() => { setEditingPO(po); setShowEditor(true); }}
                    onReceive={() => setReceivingPO(po)} />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(po => {
              const canReceive = po.status === 'sent' || po.status === 'partially_received';
              return (
                <div key={po.id} onClick={() => { setEditingPO(po); setShowEditor(true); }}
                  className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-2">
                    <span className="font-bold text-[#0A2540]">#{String(po.po_number).padStart(4, '0')}</span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${PO_STATUS_STYLES[po.status]}`}>{PO_STATUS_LABELS[po.status]}</span>
                  </div>
                  <p className="text-sm font-medium text-[#1A1A1A] mb-1">{po.supplier_name ?? 'No supplier'}</p>
                  {po.job_title && <p className="text-xs text-[#4A5568] mb-2 truncate">Job: {po.job_title}</p>}
                  <p className="text-lg font-bold text-[#1A1A1A] mb-2">{formatMoney(po.total)}</p>
                  <div className="flex items-center justify-between text-xs text-[#4A5568]">
                    <span>Expected: {po.expected_delivery_date ? format(parseISO(po.expected_delivery_date), 'd MMM yyyy') : '—'}</span>
                    {canReceive && (
                      <button onClick={(e) => { e.stopPropagation(); setReceivingPO(po); }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#F7931A] bg-[#F7931A]/10 rounded-md hover:bg-[#F7931A]/20 transition-colors">
                        <PackageCheck size={12} /> Receive
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showEditor && (
        <POEditorModal
          po={editingPO}
          onClose={() => setShowEditor(false)}
          onSaved={() => { setShowEditor(false); queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); showToast(editingPO ? 'PO updated' : 'PO created'); }}
        />
      )}
      {receivingPO && (
        <ReceiveGoodsModal
          po={receivingPO}
          onClose={() => setReceivingPO(null)}
          onSaved={() => { setReceivingPO(null); queryClient.invalidateQueries({ queryKey: ['purchase-orders'] }); showToast('Goods received'); }}
        />
      )}
    </AppShell>
  );
}

// ── PO Row ────────────────────────────────────────────────────────

function PORow({ po, onOpen, onReceive }: {
  po: PurchaseOrderWithDetails;
  onOpen: () => void;
  onReceive: () => void;
}) {
  const canReceive = po.status === 'sent' || po.status === 'partially_received';
  return (
    <tr onClick={onOpen} className="hover:bg-[#F9FAFB] cursor-pointer transition-colors">
      <td className="px-4 py-3 font-semibold text-[#0A2540]">
        #{String(po.po_number).padStart(4, '0')}
      </td>
      <td className="px-4 py-3 text-[#1A1A1A]">{po.supplier_name ?? <span className="text-[#9CA3AF]">—</span>}</td>
      <td className="px-4 py-3 text-[#4A5568]">
        {po.job_title ? (
          <span className="truncate">{po.job_title}</span>
        ) : <span className="text-[#9CA3AF]">—</span>}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PO_STATUS_STYLES[po.status]}`}>
          {PO_STATUS_LABELS[po.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-right font-medium text-[#1A1A1A]">{formatMoney(po.total)}</td>
      <td className="px-4 py-3 text-[#4A5568]">
        {po.expected_delivery_date ? format(parseISO(po.expected_delivery_date), 'd MMM yyyy') : <span className="text-[#9CA3AF]">—</span>}
      </td>
      <td className="px-4 py-3 text-[#6B7280]">{format(parseISO(po.created_at), 'd MMM yyyy')}</td>
      <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
        {canReceive && (
          <button onClick={onReceive}
            className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-[#F7931A] bg-[#F7931A]/10 rounded-md hover:bg-[#F7931A]/20 transition-colors">
            <PackageCheck size={13} /> Receive
          </button>
        )}
      </td>
    </tr>
  );
}

// ── PO Editor Modal ───────────────────────────────────────────────

interface POLineEdit {
  description: string;
  quantity: string;
  unit_cost: string;
  received_quantity: number;
  stock_item_id?: string | null;
}

function toPOLineEdit(li: POLineItem): POLineEdit {
  return { description: li.description, quantity: String(li.quantity), unit_cost: String(li.unit_cost), received_quantity: li.received_quantity ?? 0, stock_item_id: li.stock_item_id ?? null };
}
function fromPOLineEdit(li: POLineEdit): POLineItem {
  return { description: li.description, quantity: parseFloat(li.quantity) || 0, unit_cost: parseFloat(li.unit_cost) || 0, received_quantity: li.received_quantity, stock_item_id: li.stock_item_id ?? null };
}

function POEditorModal({ po, onClose, onSaved }: {
  po: PurchaseOrderWithDetails | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile, company } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [jobs, setJobs] = useState<{ id: string; title: string; job_number: number | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [showStockPicker, setShowStockPicker] = useState(false);

  const [form, setForm] = useState({
    supplier_id: po?.supplier_id ?? '',
    job_id: po?.job_id ?? '',
    status: po?.status ?? ('draft' as POStatus),
    tax_rate: String(po?.tax_rate ?? company?.default_tax_rate ?? 10),
    expected_delivery_date: po?.expected_delivery_date ?? '',
    notes: po?.notes ?? '',
  });
  const [lines, setLines] = useState<POLineEdit[]>(
    po?.line_items?.length ? po.line_items.map(toPOLineEdit) : [{ description: '', quantity: '1', unit_cost: '', received_quantity: 0, stock_item_id: null }]
  );

  useEffect(() => {
    if (!profile?.company_id) return;
    Promise.all([
      supabase.from('suppliers').select('*').eq('archived', false).order('name'),
      supabase.from('jobs').select('id, title, job_number').order('created_at', { ascending: false }),
    ]).then(([sRes, jRes]) => {
      if (sRes.data) setSuppliers(sRes.data as Supplier[]);
      if (jRes.data) setJobs(jRes.data as { id: string; title: string; job_number: number | null }[]);
    });
  }, [profile?.company_id]);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_cost) || 0), 0), [lines]);
  const taxAmount = useMemo(() => subtotal * (parseFloat(form.tax_rate) || 0) / 100, [subtotal, form.tax_rate]);
  const grandTotal = subtotal + taxAmount;

  const updateLine = (idx: number, patch: Partial<POLineEdit>) =>
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  const addLine = () => setLines(prev => [...prev, { description: '', quantity: '1', unit_cost: '', received_quantity: 0, stock_item_id: null }]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));
  const addStockItem = (item: StockItem) => {
    setLines(prev => [...prev, {
      description: item.name + (item.sku ? ` (${item.sku})` : ''),
      quantity: '1', unit_cost: String(item.unit_cost ?? ''), received_quantity: 0, stock_item_id: item.id,
    }]);
    setShowStockPicker(false);
  };

  const handleSave = async () => {
    if (!profile?.company_id) return;
    const validLines: POLineItem[] = lines.filter(l => l.description.trim()).map(fromPOLineEdit);
    if (!form.supplier_id) { setErr('Please select a supplier'); return; }
    setSaving(true); setErr('');

    const payload = {
      supplier_id: form.supplier_id || null,
      job_id: form.job_id || null,
      status: form.status,
      line_items: validLines as any,
      subtotal, tax_rate: parseFloat(form.tax_rate) || 0, tax_amount: taxAmount, total: grandTotal,
      expected_delivery_date: form.expected_delivery_date || null,
      notes: form.notes.trim() || null,
    };

    const { error } = po
      ? await supabase.from('purchase_orders').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', po.id)
      : await supabase.from('purchase_orders').insert({ ...payload, company_id: profile.company_id, created_by: profile.id });

    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[8vh] overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[#1A1A1A]">{po ? 'Edit Purchase Order' : 'New Purchase Order'}</h2>
            {po?.po_number && (
              <span className="text-xs font-bold text-[#2E75B6] bg-[#EFF6FF] px-2 py-0.5 rounded-full">
                #{String(po.po_number).padStart(4, '0')}
              </span>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          {/* Supplier + Job */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Supplier" required>
              <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}
                className="form-input cursor-pointer">
                <option value="">Select supplier...</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Linked Job (optional)">
              <select value={form.job_id} onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))}
                className="form-input cursor-pointer">
                <option value="">No linked job</option>
                {jobs.map(j => (
                  <option key={j.id} value={j.id}>
                    {j.title}{j.job_number ? ` (#${String(j.job_number).padStart(4, '0')})` : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-[#4A5568]">Line Items</label>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setShowStockPicker(true)}
                  className="flex items-center gap-1 text-xs font-medium text-[#2E75B6] hover:text-[#1e40af] px-2 py-1 rounded-md hover:bg-[#EFF6FF]">
                  <PackagePlus size={14} /> From Stock Catalog
                </button>
                <button type="button" onClick={addLine}
                  className="flex items-center gap-1 text-xs font-medium text-[#0A2540] px-2 py-1 rounded-md hover:bg-gray-100">
                  <Plus size={14} /> Add Line
                </button>
              </div>
            </div>
            <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#F9FAFB] text-xs text-[#6B7280] uppercase">
                  <tr>
                    <th className="px-2 py-2 text-left font-medium">Description</th>
                    <th className="px-2 py-2 text-right font-medium w-20">Qty</th>
                    <th className="px-2 py-2 text-right font-medium w-28">Unit Cost</th>
                    <th className="px-2 py-2 text-right font-medium w-28">Total</th>
                    <th className="w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {lines.map((line, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5">
                        <input value={line.description} onChange={e => updateLine(i, { description: e.target.value })}
                          className="form-input-sm" placeholder="Item description" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" min={0} value={line.quantity} onChange={e => updateLine(i, { quantity: e.target.value })}
                          className="form-input-sm text-right" />
                      </td>
                      <td className="px-2 py-1.5">
                        <input type="number" min={0} step="0.01" value={line.unit_cost} onChange={e => updateLine(i, { unit_cost: e.target.value })}
                          className="form-input-sm text-right" placeholder="0.00" />
                      </td>
                      <td className="px-2 py-1.5 text-right text-sm font-medium text-[#1A1A1A]">
                        {formatMoney((parseFloat(line.quantity) || 0) * (parseFloat(line.unit_cost) || 0))}
                      </td>
                      <td className="px-1 py-1.5 text-center">
                        <button type="button" onClick={() => removeLine(i)}
                          className="w-6 h-6 flex items-center justify-center rounded text-[#9CA3AF] hover:text-red-600 hover:bg-red-50">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {lines.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-4 text-center text-sm text-[#9CA3AF]">No line items. Click "Add Line" to start.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals + Tax */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Tax Rate (%)">
                  <input type="number" min={0} step="0.01" value={form.tax_rate}
                    onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))}
                    className="form-input" placeholder="0" />
                </Field>
                <Field label="Status">
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as POStatus }))}
                    className="form-input cursor-pointer">
                    {(Object.keys(PO_STATUS_LABELS) as POStatus[]).map(s => (
                      <option key={s} value={s}>{PO_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Expected Delivery Date">
                <input type="date" value={form.expected_delivery_date}
                  onChange={e => setForm(f => ({ ...f, expected_delivery_date: e.target.value }))}
                  className="form-input" />
              </Field>
            </div>
            <div className="bg-[#F9FAFB] rounded-lg border border-[#E5E7EB] p-3 space-y-1.5 self-start">
              <div className="flex justify-between text-sm text-[#4A5568]">
                <span>Subtotal</span><span>{formatMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm text-[#4A5568]">
                <span>Tax ({parseFloat(form.tax_rate) || 0}%)</span><span>{formatMoney(taxAmount)}</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-[#0A2540] pt-1.5 border-t border-[#E5E7EB]">
                <span>Grand Total</span><span>{formatMoney(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Notes */}
          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="form-input min-h-[60px] resize-y" placeholder="Delivery instructions, internal notes..." />
          </Field>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#4A5568] border border-[#E5E7EB] rounded-md hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md hover:bg-[#0d2f4e] disabled:opacity-50">
            {saving ? 'Saving...' : po ? 'Save Changes' : 'Create PO'}
          </button>
        </div>
      </div>

      {showStockPicker && <StockPicker onClose={() => setShowStockPicker(false)} onSelect={addStockItem} />}
    </div>
  );
}

// ── Stock Picker ──────────────────────────────────────────────────

function StockPicker({ onClose, onSelect }: {
  onClose: () => void;
  onSelect: (item: StockItem) => void;
}) {
  const { profile } = useAuth();
  const [items, setItems] = useState<StockItem[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.company_id) return;
    supabase.from('stock_items').select('*').eq('archived', false).order('name')
      .then(({ data }) => { setItems((data ?? []) as StockItem[]); setLoading(false); });
  }, [profile?.company_id]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(q) || (i.sku ?? '').toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-[8vh] overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2"><Package size={16} /> Stock Catalog</h3>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400"><X size={16} /></button>
        </div>
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input value={search} onChange={e => setSearch(e.target.value)} autoFocus
              placeholder="Search by name or SKU..."
              className="w-full h-8 pl-8 pr-3 text-sm border border-[#E5E7EB] rounded-md focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent" />
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex justify-center py-8"><LoadingSpinner /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-[#9CA3AF] py-8">No stock items found</p>
          ) : (
            <div className="divide-y divide-[#F3F4F6]">
              {filtered.map(item => (
                <button key={item.id} onClick={() => onSelect(item)}
                  className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-[#F9FAFB] transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#1A1A1A] truncate">{item.name}</p>
                    {item.sku && <p className="text-xs text-[#9CA3AF]">SKU: {item.sku}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-sm text-[#4A5568]">{formatMoney(item.unit_cost)}</span>
                    <ArrowRight size={14} className="text-[#9CA3AF]" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Receive Goods Modal ───────────────────────────────────────────

function ReceiveGoodsModal({ po, onClose, onSaved }: {
  po: PurchaseOrderWithDetails;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [receiving, setReceiving] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const lines = (po.line_items ?? []) as POLineItem[];

  const handleConfirm = async () => {
    if (!profile?.company_id) return;
    setSaving(true); setErr('');
    try {
      const updatedLines = lines.map((line, i) => ({
        ...line,
        received_quantity: (line.received_quantity ?? 0) + (parseFloat(receiving[i] ?? '') || 0),
      }));
      const allComplete = updatedLines.every(l => (l.received_quantity ?? 0) >= (l.quantity ?? 0));
      const anyReceived = updatedLines.some(l => (l.received_quantity ?? 0) > 0);
      const newStatus: POStatus = allComplete ? 'received' : anyReceived ? 'partially_received' : po.status;

      const subtotal = updatedLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unit_cost) || 0), 0);
      const taxAmount = subtotal * (Number(po.tax_rate) || 0) / 100;

      const { error: poErr } = await supabase.from('purchase_orders').update({
        line_items: updatedLines as any, status: newStatus,
        subtotal, tax_amount: taxAmount, total: subtotal + taxAmount,
        updated_at: new Date().toISOString(),
      }).eq('id', po.id);
      if (poErr) throw poErr;

      // Stock movements + quantity updates for lines with receiving qty and linked stock item
      for (let i = 0; i < lines.length; i++) {
        const qty = parseFloat(receiving[i] ?? '') || 0;
        if (qty <= 0) continue;
        const line = lines[i];
        if (!line.stock_item_id) continue;

        const { error: mvErr } = await supabase.from('stock_movements').insert({
          company_id: profile.company_id, stock_item_id: line.stock_item_id,
          movement_type: 'received', quantity: qty,
          purchase_order_id: po.id, reason: `PO #${String(po.po_number).padStart(4, '0')} goods received`,
          created_by: profile.id,
        });
        if (mvErr) throw mvErr;

        const { data: cur } = await supabase.from('stock_items')
          .select('quantity_on_hand').eq('id', line.stock_item_id).single();
        const newQty = (cur?.quantity_on_hand ?? 0) + qty;
        const { error: updErr } = await supabase.from('stock_items')
          .update({ quantity_on_hand: newQty, updated_at: new Date().toISOString() })
          .eq('id', line.stock_item_id);
        if (updErr) throw updErr;
      }

      onSaved();
    } catch (e: any) {
      setErr(e.message ?? 'Failed to receive goods'); setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[8vh] overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <PackageCheck size={18} className="text-[#F7931A]" />
            <h2 className="text-base font-semibold text-[#1A1A1A]">Receive Goods</h2>
            <span className="text-xs font-bold text-[#2E75B6] bg-[#EFF6FF] px-2 py-0.5 rounded-full">
              #{String(po.po_number).padStart(4, '0')}
            </span>
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4">
          <div className="border border-[#E5E7EB] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F9FAFB] text-xs text-[#6B7280] uppercase">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Item</th>
                  <th className="px-3 py-2 text-right font-medium w-20">Ordered</th>
                  <th className="px-3 py-2 text-right font-medium w-20">Received</th>
                  <th className="px-3 py-2 text-right font-medium w-24">Receiving Now</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F3F4F6]">
                {lines.map((line, i) => (
                  <tr key={i}>
                    <td className="px-3 py-2 text-[#1A1A1A] truncate max-w-[180px]">{line.description || '—'}</td>
                    <td className="px-3 py-2 text-right text-[#4A5568]">{line.quantity}</td>
                    <td className="px-3 py-2 text-right text-[#4A5568]">{line.received_quantity ?? 0}</td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} value={receiving[i] ?? ''}
                        onChange={e => setReceiving(prev => ({ ...prev, [i]: e.target.value }))}
                        className="w-full px-2 py-1 text-sm text-right border border-[#E5E7EB] rounded focus:outline-none focus:ring-2 focus:ring-[#2E75B6] focus:border-transparent" />
                    </td>
                  </tr>
                ))}
                {lines.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-4 text-center text-sm text-[#9CA3AF]">No line items on this PO.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#4A5568] border border-[#E5E7EB] rounded-md hover:bg-gray-50">Cancel</button>
          <button onClick={handleConfirm} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-[#F7931A] rounded-md hover:bg-[#e08415] disabled:opacity-50">
            {saving ? 'Processing...' : 'Confirm Receipt'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Summary card ─────────────────────────────────────────────────

// ── Field helper ──────────────────────────────────────────────────

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
