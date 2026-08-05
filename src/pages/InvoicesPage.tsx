import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, EmptyState, SearchBar, useToast, ViewToggle, useViewMode } from '../components/ui';
import { SkeletonRow, SkeletonSummaryCards } from '../components/ui/Skeletons';
import { SummaryCardMoney } from '../components/ui/SummaryCard';
import type { InvoiceWithDetails, InvoiceLineItem, InvoiceStatus, JobCost, Quote, StockItem } from '../types/fsm';
import type { Client, Job } from '../types/crm';
import { LineItemEditor, emptyLineItem, toEditLine, calcSubtotal, type EditLineItem } from '../components/invoicing/LineItemEditor';
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_STYLES, formatMoney } from '../types/fsm';
import { Plus, Search, Receipt, X, Download, MoreVertical, AlertCircle } from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';

type StatusFilter = 'all' | InvoiceStatus;

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'paid', label: 'Paid' },
  { key: 'overdue', label: 'Overdue' },
];

export function InvoicesPage() {
  const { profile, company } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [editingInvoice, setEditingInvoice] = useState<InvoiceWithDetails | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useViewMode('invoices', 'list');

  const { data: invoices, isLoading, error } = useQuery<InvoiceWithDetails[]>({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, company_id, invoice_number, client_id, job_id, quote_id, status, line_items, subtotal, tax_rate, tax_amount, total, payment_terms, due_date, notes, created_by, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as InvoiceWithDetails[];

      const clientIds = [...new Set(list.map(i => i.client_id).filter(Boolean))] as string[];
      const jobIds = [...new Set(list.map(i => i.job_id).filter(Boolean))] as string[];
      const [clientsRes, jobsRes] = await Promise.all([
        clientIds.length ? supabase.from('clients').select('id, name').in('id', clientIds) : Promise.resolve({ data: [], error: null }),
        jobIds.length ? supabase.from('jobs').select('id, title').in('id', jobIds) : Promise.resolve({ data: [], error: null }),
      ]);
      const clientMap = new Map((clientsRes.data ?? []).map((c: any) => [c.id, c.name]));
      const jobMap = new Map((jobsRes.data ?? []).map((j: any) => [j.id, j.title]));
      return list.map(i => ({
        ...i,
        client_name: i.client_id ? clientMap.get(i.client_id) ?? null : null,
        job_title: i.job_id ? jobMap.get(i.job_id) ?? null : null,
      }));
    },
    enabled: !!profile,
  });

  const totals = useMemo(() => {
    const list = invoices ?? [];
    return {
      outstanding: list.filter(i => i.status === 'sent' || i.status === 'overdue').reduce((s, i) => s + Number(i.total), 0),
      overdue: list.filter(i => i.status === 'overdue').reduce((s, i) => s + Number(i.total), 0),
      paid: list.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total), 0),
    };
  }, [invoices]);

  const filtered = useMemo(() => {
    const list = invoices ?? [];
    return list.filter(i => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        const num = `#${String(i.invoice_number ?? 0).padStart(4, '0')}`.toLowerCase();
        return num.includes(s) || (i.client_name ?? '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [invoices, statusFilter, search]);

  if (error) return <AppShell><PageError message="Could not load invoices" /></AppShell>;

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Invoices</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">{invoices?.length ?? 0} total invoices</p>
          </div>
          <button
            onClick={() => { setEditingInvoice(null); setShowForm(true); }}
            className="flex items-center gap-2 bg-[#0A2540] text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e] transition-colors"
          >
            <Plus size={16} /> New Invoice
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {isLoading ? (
            <SkeletonSummaryCards count={3} />
          ) : (
            <>
              <SummaryCardMoney label="Total Outstanding" amount={totals.outstanding} color="text-[#2E75B6]" formatMoney={formatMoney} />
              <SummaryCardMoney label="Total Overdue" amount={totals.overdue} color="text-red-600" icon={<AlertCircle size={15} />} formatMoney={formatMoney} />
              <SummaryCardMoney label="Total Paid" amount={totals.paid} color="text-green-600" formatMoney={formatMoney} />
            </>
          )}
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Search by invoice number or client name..." />
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>

        {/* Status tabs */}
        <div className="flex items-center gap-1 mb-4 border-b border-[#E5E7EB] overflow-x-auto">
          {STATUS_TABS.map(tab => {
            const count = tab.key === 'all' ? (invoices?.length ?? 0) : (invoices?.filter(i => i.status === tab.key).length ?? 0);
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  active ? 'border-[#0A2540] text-[#0A2540]' : 'border-transparent text-[#4A5568] hover:text-[#1A1A1A]'
                }`}
              >
                {tab.label}
                <span className={`text-xs px-1.5 rounded-full ${active ? 'bg-[#0A2540] text-white' : 'bg-gray-100 text-[#4A5568]'}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* List */}
        {isLoading ? (
          <SkeletonRow />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={search || statusFilter !== 'all' ? 'No invoices match your filters' : 'No invoices yet'}
            message={search || statusFilter !== 'all' ? 'Try adjusting your filters.' : 'Create your first invoice to get started.'}
            action={!search && statusFilter === 'all' && (
              <button onClick={() => { setEditingInvoice(null); setShowForm(true); }} className="btn-primary">
                <Plus size={16} /> Create your first invoice
              </button>
            )}
          />
        ) : viewMode === 'list' ? (
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9FAFB] text-left text-xs font-medium text-[#4A5568] uppercase tracking-wide">
                    <th className="px-4 py-3">Invoice #</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Total</th>
                    <th className="px-4 py-3">Due Date</th>
                    <th className="px-4 py-3">Created</th>
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {filtered.map(inv => (
                    <tr key={inv.id} onClick={() => { setEditingInvoice(inv); setShowForm(true); }}
                      className="hover:bg-[#F9FAFB] cursor-pointer transition-colors">
                      <td className="px-4 py-3 font-medium text-[#2E75B6]">#{String(inv.invoice_number ?? 0).padStart(4, '0')}</td>
                      <td className="px-4 py-3 text-[#1A1A1A]">{inv.client_name ?? <span className="text-[#9CA3AF]">—</span>}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${INVOICE_STATUS_STYLES[inv.status]}`}>
                          {INVOICE_STATUS_LABELS[inv.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-[#1A1A1A]">{formatMoney(Number(inv.total))}</td>
                      <td className="px-4 py-3 text-[#4A5568]">{inv.due_date ? format(parseISO(inv.due_date), 'd MMM yyyy') : '—'}</td>
                      <td className="px-4 py-3 text-[#4A5568]">{format(parseISO(inv.created_at), 'd MMM yyyy')}</td>
                      <td className="px-4 py-3 text-[#9CA3AF]"><MoreVertical size={15} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map(inv => (
              <div key={inv.id} onClick={() => { setEditingInvoice(inv); setShowForm(true); }}
                className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4 cursor-pointer hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-2">
                  <span className="font-bold text-[#2E75B6]">#{String(inv.invoice_number ?? 0).padStart(4, '0')}</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${INVOICE_STATUS_STYLES[inv.status]}`}>{INVOICE_STATUS_LABELS[inv.status]}</span>
                </div>
                <p className="text-sm font-medium text-[#1A1A1A] mb-1">{inv.client_name ?? 'No client'}</p>
                <p className="text-lg font-bold text-[#1A1A1A] mb-2">{formatMoney(Number(inv.total))}</p>
                <div className="flex items-center justify-between text-xs text-[#4A5568]">
                  <span>Due: {inv.due_date ? format(parseISO(inv.due_date), 'd MMM yyyy') : '—'}</span>
                  <span>{format(parseISO(inv.created_at), 'd MMM yyyy')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <InvoiceEditorModal
          invoice={editingInvoice}
          defaultTaxRate={company?.default_tax_rate ?? 10}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); queryClient.invalidateQueries({ queryKey: ['invoices'] }); showToast(editingInvoice ? 'Invoice updated' : 'Invoice created'); }}
        />
      )}
    </AppShell>
  );
}

// ── Summary Card ──────────────────────────────────────────────────

function SummaryCard({ label, amount, color, icon }: { label: string; amount: number; color: string; icon?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-[#4A5568]">
        {icon}{label}
      </div>
      <p className={`text-xl font-bold mt-1 ${color}`}>{formatMoney(amount)}</p>
    </div>
  );
}

// ── Invoice Editor Modal ──────────────────────────────────────────

interface EditorState {
  client_id: string;
  job_id: string;
  quote_id: string;
  status: InvoiceStatus;
  line_items: EditLineItem[];
  tax_rate: string;
  payment_terms: string;
  due_date: string;
  notes: string;
}

function InvoiceEditorModal({ invoice, defaultTaxRate, onClose, onSaved }: {
  invoice: InvoiceWithDetails | null;
  defaultTaxRate: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { profile } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const [form, setForm] = useState<EditorState>({
    client_id: invoice?.client_id ?? '',
    job_id: invoice?.job_id ?? '',
    quote_id: invoice?.quote_id ?? '',
    status: invoice?.status ?? 'draft',
    line_items: invoice?.line_items?.length ? invoice.line_items.map(toEditLine) : [emptyLineItem()],
    tax_rate: String(invoice?.tax_rate ?? defaultTaxRate),
    payment_terms: invoice?.payment_terms ?? 'Net 30',
    due_date: invoice?.due_date ?? format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    notes: invoice?.notes ?? '',
  });

  useEffect(() => {
    if (!profile?.company_id) return;
    (async () => {
      const [c, j, s] = await Promise.all([
        supabase.from('clients').select('*').eq('archived', false).order('name'),
        supabase.from('jobs').select('id, company_id, client_id, title').order('created_at', { ascending: false }),
        supabase.from('stock_items').select('*').eq('archived', false).order('name'),
      ]);
      if (c.data) setClients(c.data as Client[]);
      if (j.data) setJobs(j.data as Job[]);
      if (s.data) setStockItems(s.data as StockItem[]);
    })();
  }, [profile?.company_id]);

  // Load quotes for the selected client
  useEffect(() => {
    if (!form.client_id) { setQuotes([]); return; }
    (async () => {
      const { data } = await supabase.from('quotes').select('id, company_id, quote_number, client_id, status, total').eq('client_id', form.client_id).order('created_at', { ascending: false });
      setQuotes((data ?? []) as Quote[]);
    })();
  }, [form.client_id]);

  const clientJobs = useMemo(() => jobs.filter(j => form.client_id && j.client_id === form.client_id), [jobs, form.client_id]);

  const subtotal = useMemo(() => calcSubtotal(form.line_items), [form.line_items]);
  const taxAmount = useMemo(() => subtotal * (parseFloat(form.tax_rate) || 0) / 100, [subtotal, form.tax_rate]);
  const grandTotal = subtotal + taxAmount;



  const handleImportFromJob = async () => {
    if (!form.job_id) { setErr('Select a job first'); return; }
    setImporting(true); setErr('');
    try {
      const { data, error: jcErr } = await supabase.from('job_costs').select('*').eq('job_id', form.job_id);
      if (jcErr) throw jcErr;
      const costs = (data ?? []) as JobCost[];
      if (costs.length === 0) { setErr('No job costs found for this job'); return; }
      const newLines: EditLineItem[] = costs.map(c => ({ description: c.description, quantity: String(c.quantity), unit_price: String(c.unit_cost), stock_item_id: null, unit_cost: String(c.unit_cost), markup_percent: '0' }));
      setForm(f => ({ ...f, line_items: [...f.line_items.filter(li => li.description.trim()), ...newLines] }));
    } catch (e: any) {
      setErr(e.message ?? 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async () => {
    if (!profile?.company_id) return;
    if (!form.client_id) { setErr('Please select a client'); return; }
    const cleanLines: InvoiceLineItem[] = form.line_items
      .filter(li => li.description.trim() && (parseFloat(li.quantity) || 0) > 0)
      .map(li => ({
        description: li.description.trim(),
        quantity: parseFloat(li.quantity) || 0,
        unit_price: parseFloat(li.unit_price) || 0,
        stock_item_id: li.stock_item_id ?? null,
        unit_cost: li.unit_cost ? parseFloat(li.unit_cost) : null,
        markup_percent: li.markup_percent ? parseFloat(li.markup_percent) : null,
      }));
    if (cleanLines.length === 0) { setErr('Add at least one line item'); return; }
    setSaving(true); setErr('');
    const payload = {
      client_id: form.client_id || null,
      job_id: form.job_id || null,
      quote_id: form.quote_id || null,
      status: form.status,
      line_items: cleanLines,
      subtotal,
      tax_rate: parseFloat(form.tax_rate) || 0,
      tax_amount: taxAmount,
      total: grandTotal,
      payment_terms: form.payment_terms.trim() || null,
      due_date: form.due_date || null,
      notes: form.notes.trim() || null,
    };
    const { error } = invoice
      ? await supabase.from('invoices').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', invoice.id)
      : await supabase.from('invoices').insert({ ...payload, company_id: profile.company_id, created_by: profile.id });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-4 pt-[8vh] overflow-y-auto" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-[#1A1A1A]">{invoice ? 'Edit Invoice' : 'New Invoice'}</h2>
            {invoice?.invoice_number && (
              <span className="text-xs font-bold text-[#2E75B6] bg-[#EFF6FF] px-2 py-0.5 rounded-full">
                #{String(invoice.invoice_number).padStart(4, '0')}
              </span>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          <Field label="Client" required>
            <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value, job_id: '', quote_id: '' }))} className="form-input cursor-pointer">
              <option value="">Select a client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Linked Job">
              <select value={form.job_id} onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))} className="form-input cursor-pointer">
                <option value="">No linked job</option>
                {clientJobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </Field>
            <Field label="Linked Quote">
              <select value={form.quote_id} onChange={e => setForm(f => ({ ...f, quote_id: e.target.value }))} className="form-input cursor-pointer" disabled={!form.client_id}>
                <option value="">No linked quote</option>
                {quotes.map(q => <option key={q.id} value={q.id}>#{String(q.quote_number ?? 0).padStart(4, '0')} — {formatMoney(Number(q.total))}</option>)}
              </select>
            </Field>
          </div>

          {form.job_id && (
            <button type="button" onClick={handleImportFromJob} disabled={importing}
              className="flex items-center gap-1.5 text-xs text-[#2E75B6] hover:underline font-medium disabled:opacity-50">
              <Download size={13} /> {importing ? 'Importing...' : 'Import line items from job'}
            </button>
          )}

          {/* Line items */}
          <LineItemEditor
            lines={form.line_items}
            stockItems={stockItems}
            defaultMarkup={company?.default_material_markup ?? 0}
            onChange={lines => setForm(f => ({ ...f, line_items: lines }))}
          />

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-56 space-y-1.5 text-sm">
              <div className="flex justify-between text-[#4A5568]"><span>Subtotal</span><span>{formatMoney(subtotal)}</span></div>
              <div className="flex justify-between text-[#4A5568]"><span>Tax ({parseFloat(form.tax_rate) || 0}%)</span><span>{formatMoney(taxAmount)}</span></div>
              <div className="flex justify-between font-semibold text-[#1A1A1A] border-t border-[#E5E7EB] pt-1.5"><span>Grand Total</span><span>{formatMoney(grandTotal)}</span></div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Tax Rate (%)">
              <input type="number" min={0} step="0.01" value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))}
                className="form-input" placeholder="0" />
            </Field>
            <Field label="Payment Terms">
              <input value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))}
                className="form-input" placeholder="Net 30" />
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as InvoiceStatus }))}
                className="form-input cursor-pointer">
                {(Object.keys(INVOICE_STATUS_LABELS) as InvoiceStatus[]).map(s => <option key={s} value={s}>{INVOICE_STATUS_LABELS[s]}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Due Date">
            <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
              className="form-input" />
          </Field>

          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="form-input min-h-[60px] resize-y" placeholder="Notes for the client..." />
          </Field>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-[#4A5568] border border-[#E5E7EB] rounded-md hover:bg-gray-50">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md hover:bg-[#0d2f4e] disabled:opacity-50">
            {saving ? 'Saving...' : invoice ? 'Save Changes' : 'Create Invoice'}
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
