import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { PageError, EmptyState, SearchBar, useToast, ViewToggle, useViewMode } from '../components/ui';
import { SkeletonRow, SkeletonSummaryCards } from '../components/ui/Skeletons';
import { SummaryCardMoney } from '../components/ui/SummaryCard';
import type { InvoiceWithDetails, InvoiceLineItem, InvoiceStatus, JobCost, Quote, StockItem, PriceBookItem } from '../types/fsm';
import type { Client, Job } from '../types/crm';
import { LineItemEditor, emptyLineItem, toEditLine, calcSubtotal, type EditLineItem } from '../components/invoicing/LineItemEditor';
import { DocumentVariationsEditor } from '../components/invoicing/DocumentVariationsEditor';
import { DocumentGstTotals } from '../components/invoicing/DocumentGstTotals';
import { CommercialPdfPreviewModal } from '../components/invoicing/CommercialPdfPreviewModal';
import { ActionButton, NextBanner } from '../components/invoicing/DocNextAction';
import { linesFromQuoteItems } from '../reports/commercial/CommercialDocumentPdf';
import type { CommercialPdfData } from '../reports/commercial/CommercialDocumentPdf';
import { asStringList } from '../lib/asStringList';
import { calcDocumentTotals, DEFAULT_TAX_RATE, gstLabel } from '../lib/gst';
import { effectiveInvoiceStatus, persistableInvoiceStatus } from '../lib/invoiceStatus';
import { invoiceListBucket, recommendInvoiceAction, type InvoiceActionKey } from '../lib/invoiceNextAction';
import { INVOICE_SOURCE_QUOTE } from '../lib/invoiceFromQuote';
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_STYLES, formatMoney } from '../types/fsm';
import { Plus, Receipt, X, Download, AlertCircle, Eye, Check, Send, User, Calendar } from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';

const padInv = (n: number | null) => String(n ?? 0).padStart(4, '0');

type StatusFilter = 'all' | InvoiceStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'paid', label: 'Paid' },
];

export function InvoicesPage() {
  const { profile, company } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [editingInvoice, setEditingInvoice] = useState<InvoiceWithDetails | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useViewMode('invoices');
  const preselectId = searchParams.get('id');

  const { data: invoices, isLoading, error } = useQuery<InvoiceWithDetails[]>({
    queryKey: ['invoices'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, company_id, invoice_number, client_id, job_id, quote_id, source, status, line_items, subtotal, tax_rate, tax_amount, total, payment_terms, due_date, notes, inclusions, exclusions, created_by, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as InvoiceWithDetails[];

      const clientIds = [...new Set(list.map(i => i.client_id).filter(Boolean))] as string[];
      const jobIds = [...new Set(list.map(i => i.job_id).filter(Boolean))] as string[];
      const [clientsRes, jobsRes] = await Promise.all([
        clientIds.length ? supabase.from('clients').select('id, name').in('id', clientIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        jobIds.length ? supabase.from('jobs').select('id, title').in('id', jobIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
      ]);
      const clientMap = new Map((clientsRes.data ?? []).map(c => [c.id, c.name]));
      const jobMap = new Map((jobsRes.data ?? []).map(j => [j.id, j.title]));
      return list.map(i => ({
        ...i,
        inclusions: asStringList(i.inclusions),
        exclusions: asStringList(i.exclusions),
        client_name: i.client_id ? clientMap.get(i.client_id) ?? null : null,
        job_title: i.job_id ? jobMap.get(i.job_id) ?? null : null,
      }));
    },
    enabled: !!profile,
  });

  const totals = useMemo(() => {
    const list = invoices ?? [];
    return {
      outstanding: list.filter(i => {
        const s = effectiveInvoiceStatus(i);
        return s === 'sent' || s === 'overdue';
      }).reduce((s, i) => s + Number(i.total), 0),
      overdue: list.filter(i => effectiveInvoiceStatus(i) === 'overdue').reduce((s, i) => s + Number(i.total), 0),
      paid: list.filter(i => i.status === 'paid').reduce((s, i) => s + Number(i.total), 0),
    };
  }, [invoices]);

  const filtered = useMemo(() => {
    const list = invoices ?? [];
    return list.filter(i => {
      if (statusFilter !== 'all' && effectiveInvoiceStatus(i) !== statusFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        const num = `#${padInv(i.invoice_number)}`.toLowerCase();
        return num.includes(s) || (i.client_name ?? '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [invoices, statusFilter, search]);

  const overdueInvoices = filtered.filter(i => invoiceListBucket(i) === 'overdue');
  const draftInvoices = filtered.filter(i => invoiceListBucket(i) === 'draft');
  const awaitingInvoices = filtered.filter(i => invoiceListBucket(i) === 'awaiting');
  const paidInvoices = filtered.filter(i => invoiceListBucket(i) === 'paid');

  const counts = useMemo(() => {
    const list = invoices ?? [];
    return {
      all: list.length,
      draft: list.filter(i => effectiveInvoiceStatus(i) === 'draft').length,
      sent: list.filter(i => effectiveInvoiceStatus(i) === 'sent').length,
      overdue: list.filter(i => effectiveInvoiceStatus(i) === 'overdue').length,
      paid: list.filter(i => i.status === 'paid').length,
    };
  }, [invoices]);

  useEffect(() => {
    if (!preselectId || !invoices) return;
    const inv = invoices.find(i => i.id === preselectId);
    if (!inv) return;
    setEditingInvoice(inv);
    setShowForm(true);
    setSearchParams({}, { replace: true });
  }, [preselectId, invoices, setSearchParams]);

  function openInvoice(inv: InvoiceWithDetails | null) {
    setEditingInvoice(inv);
    setShowForm(true);
  }

  function handleSaved(opts?: { close?: boolean; message?: string }) {
    if (opts?.close !== false) setShowForm(false);
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    showToast(opts?.message ?? (editingInvoice ? 'Invoice updated' : 'Invoice created'));
  }

  if (error) return <AppShell><PageError message="Could not load invoices" /></AppShell>;

  const filteredEmpty = !search && statusFilter === 'all';

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Invoices</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">
              {filtered.length} of {invoices?.length ?? 0} invoices
            </p>
          </div>
          <button
            onClick={() => openInvoice(null)}
            className="btn-primary"
          >
            <Plus size={16} /> New Invoice
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          {isLoading ? (
            <SkeletonSummaryCards count={3} />
          ) : (
            <>
              <SummaryCardMoney label="Outstanding (inc GST)" amount={totals.outstanding} color="text-[#2E75B6]" formatMoney={formatMoney} />
              <SummaryCardMoney label="Overdue (inc GST)" amount={totals.overdue} color="text-red-600" icon={<AlertCircle size={15} />} formatMoney={formatMoney} />
              <SummaryCardMoney label="Paid (inc GST)" amount={totals.paid} color="text-green-600" formatMoney={formatMoney} />
            </>
          )}
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Search invoices or clients..." className="max-w-sm flex-1" />
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 overflow-x-auto">
            {STATUS_FILTERS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                  statusFilter === tab.key ? 'bg-white text-[#0A2540] shadow-sm' : 'text-[#6B7280] hover:text-[#374151]'
                }`}
              >
                {tab.label}
                <span className={`ml-1.5 text-xs ${tab.key === 'overdue' && counts.overdue > 0 ? 'text-red-500' : 'text-[#9CA3AF]'}`}>
                  {counts[tab.key]}
                </span>
              </button>
            ))}
          </div>
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>

        {isLoading ? (
          <SkeletonRow />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={filteredEmpty ? 'No invoices yet' : 'No matching invoices'}
            message={filteredEmpty
              ? 'Invoice from an accepted quote, or open a job and invoice the bill.'
              : 'Try another status or search.'}
            action={filteredEmpty ? (
              <button onClick={() => openInvoice(null)} className="btn-primary">
                <Plus size={16} /> Create an invoice
              </button>
            ) : undefined}
          />
        ) : viewMode === 'grid' ? (
          <div className="space-y-6">
            <InvoiceGroup title="Overdue" invoices={overdueInvoices} onOpen={openInvoice} />
            <InvoiceGroup title="Drafts" invoices={draftInvoices} onOpen={openInvoice} />
            <InvoiceGroup title="Awaiting payment" invoices={awaitingInvoices} onOpen={openInvoice} />
            <InvoiceGroup title="Paid" invoices={paidInvoices} onOpen={openInvoice} />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9FAFB] text-left text-xs font-medium text-[#4A5568] uppercase tracking-wide">
                    <th className="px-4 py-3">Invoice #</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Total (inc GST)</th>
                    <th className="px-4 py-3">Due</th>
                    <th className="px-4 py-3">Next</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {filtered.map(inv => {
                    const status = effectiveInvoiceStatus(inv);
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => openInvoice(inv)}
                        className={`hover:bg-[#F9FAFB] cursor-pointer transition-colors ${status === 'overdue' ? 'bg-red-50/40' : ''}`}
                      >
                        <td className="px-4 py-3 font-medium text-[#2E75B6]">#{padInv(inv.invoice_number)}</td>
                        <td className="px-4 py-3 text-[#1A1A1A]">{inv.client_name ?? <span className="text-[#9CA3AF]">—</span>}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${INVOICE_STATUS_STYLES[status]}`}>
                            {INVOICE_STATUS_LABELS[status]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold text-[#1A1A1A]">{formatMoney(Number(inv.total))}</span>
                          <span className="block text-[11px] font-normal text-[#4A5568]">{gstLabel(Number(inv.tax_rate))} {formatMoney(Number(inv.tax_amount))}</span>
                        </td>
                        <td className={`px-4 py-3 ${status === 'overdue' ? 'text-red-600 font-medium' : 'text-[#4A5568]'}`}>
                          {inv.due_date ? format(parseISO(inv.due_date), 'd MMM yyyy') : '—'}
                        </td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <InvoiceNextControl invoice={inv} />
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
        <InvoiceEditorModal
          invoice={editingInvoice}
          defaultTaxRate={company?.default_tax_rate ?? DEFAULT_TAX_RATE}
          onClose={() => setShowForm(false)}
          onSaved={handleSaved}
        />
      )}
    </AppShell>
  );
}

function InvoiceGroup({
  title, invoices, onOpen,
}: {
  title: string;
  invoices: InvoiceWithDetails[];
  onOpen: (inv: InvoiceWithDetails) => void;
}) {
  if (invoices.length === 0) return null;
  return (
    <div>
      <h2 className={`text-xs font-semibold uppercase tracking-wide mb-2 ${title === 'Overdue' ? 'text-red-500' : 'text-[#9CA3AF]'}`}>
        {title}
        <span className="normal-case font-normal"> ({invoices.length})</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {invoices.map(inv => (
          <InvoiceCard key={inv.id} invoice={inv} onOpen={() => onOpen(inv)} />
        ))}
      </div>
    </div>
  );
}

function InvoiceCard({ invoice, onOpen }: { invoice: InvoiceWithDetails; onOpen: () => void }) {
  const next = recommendInvoiceAction(invoice);
  const overdue = next.status === 'overdue';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm hover:shadow-md transition-all text-left overflow-hidden group cursor-pointer"
      style={{ borderLeftWidth: 4, borderLeftColor: overdue ? '#DC2626' : next.status === 'paid' ? '#16A34A' : '#0A2540' }}
    >
      <div className={`px-3.5 py-2.5 ${overdue ? 'bg-[#7F1D1D]' : 'bg-[#0A2540]'}`}>
        <p className="text-[10px] font-bold tracking-wider text-white/55">
          INVOICE #{padInv(invoice.invoice_number)}
        </p>
        <h3 className="text-sm font-semibold text-white truncate mt-0.5 group-hover:text-[#93C5FD] transition-colors">
          {invoice.client_name || 'No client'}
        </h3>
        <p className="mt-1 flex items-center gap-1 text-[11px] text-white/75 truncate">
          <User size={11} className="shrink-0 text-[#93C5FD]" />
          {invoice.job_title || invoice.client_name || 'Invoice'}
        </p>
      </div>
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="text-lg font-bold text-[#1A1A1A]">{formatMoney(Number(invoice.total))}</p>
            <p className="text-[11px] text-[#4A5568]">inc GST · {gstLabel(Number(invoice.tax_rate))} {formatMoney(Number(invoice.tax_amount))}</p>
          </div>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${INVOICE_STATUS_STYLES[next.status]}`}>
            {INVOICE_STATUS_LABELS[next.status]}
          </span>
        </div>
        {invoice.due_date && (
          <div className={`flex items-center gap-1.5 text-xs mb-2 ${overdue ? 'text-red-600 font-medium' : 'text-[#4A5568]'}`}>
            <Calendar size={12} className={`shrink-0 ${overdue ? 'text-red-500' : 'text-[#9CA3AF]'}`} />
            Due {format(parseISO(invoice.due_date), 'd MMM yyyy')}
          </div>
        )}
        <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-[#F3F4F6]" onClick={e => e.stopPropagation()}>
          {next.key === 'none' ? (
            <span className="text-[11px] font-semibold text-[#0A2540]">{next.label}</span>
          ) : (
            <InvoiceNextControl invoice={invoice} />
          )}
        </div>
      </div>
    </div>
  );
}

function InvoiceNextControl({ invoice }: { invoice: InvoiceWithDetails }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<InvoiceActionKey | null>(null);
  const next = recommendInvoiceAction(invoice);
  if (next.key === 'none') return <span className="text-xs font-medium text-[#0A2540]">{next.label}</span>;

  const patchStatus = async (status: InvoiceStatus, message: string) => {
    setBusy(status === 'paid' ? 'mark_paid' : 'send');
    try {
      const { error } = await supabase.from('invoices')
        .update({ status: persistableInvoiceStatus(status), updated_at: new Date().toISOString() })
        .eq('id', invoice.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      showToast(message);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Could not update invoice');
    } finally {
      setBusy(null);
    }
  };

  return (
    <button
      type="button"
      onClick={() => {
        if (next.key === 'send') void patchStatus('sent', 'Invoice marked as sent');
        if (next.key === 'mark_paid') void patchStatus('paid', 'Invoice marked as paid');
      }}
      disabled={!!busy}
      className={`text-xs py-1.5 px-2.5 ${next.status === 'overdue' ? 'inline-flex items-center gap-1.5 bg-red-600 text-white px-3 py-1.5 rounded-md text-xs font-medium hover:bg-red-700 disabled:opacity-50' : 'btn-primary'}`}
    >
      {busy ? 'Working…' : next.label}
    </button>
  );
}

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
  inclusions: string[];
  exclusions: string[];
}

function InvoiceEditorModal({ invoice, defaultTaxRate, onClose, onSaved }: {
  invoice: InvoiceWithDetails | null;
  defaultTaxRate: number;
  onClose: () => void;
  onSaved: (opts?: { close?: boolean; message?: string }) => void;
}) {
  const { profile, company } = useAuth();
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [priceBookItems, setPriceBookItems] = useState<PriceBookItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [err, setErr] = useState('');
  const [savedId, setSavedId] = useState<string | null>(invoice?.id ?? null);

  const [form, setForm] = useState<EditorState>({
    client_id: invoice?.client_id ?? '',
    job_id: invoice?.job_id ?? '',
    quote_id: invoice?.quote_id ?? '',
    status: invoice?.status === 'overdue' ? 'sent' : (invoice?.status ?? 'draft'),
    line_items: invoice?.line_items?.length
      ? invoice.line_items.map(toEditLine)
      : [emptyLineItem(company?.default_material_markup ?? 0)],
    tax_rate: String(invoice?.tax_rate ?? defaultTaxRate),
    payment_terms: invoice?.payment_terms ?? 'Net 30',
    due_date: invoice?.due_date ?? format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    notes: invoice?.notes ?? '',
    inclusions: asStringList(invoice?.inclusions),
    exclusions: asStringList(invoice?.exclusions),
  });

  useEffect(() => {
    if (!profile?.company_id) return;
    (async () => {
      const [c, j, s, pb] = await Promise.all([
        supabase.from('clients').select('*').eq('archived', false).order('name'),
        supabase.from('jobs').select('id, company_id, client_id, title').order('created_at', { ascending: false }),
        supabase.from('stock_items').select('*').eq('archived', false).order('name'),
        supabase.from('price_book_items').select('*').eq('is_active', true).order('description'),
      ]);
      if (c.data) setClients(c.data as Client[]);
      if (j.data) setJobs(j.data as Job[]);
      if (s.data) setStockItems(s.data as StockItem[]);
      if (pb.data) setPriceBookItems(pb.data as PriceBookItem[]);
    })();
  }, [profile?.company_id]);

  useEffect(() => {
    if (!form.client_id) { setQuotes([]); return; }
    (async () => {
      const { data } = await supabase.from('quotes').select('id, company_id, quote_number, client_id, status, total').eq('client_id', form.client_id).order('created_at', { ascending: false });
      setQuotes((data ?? []) as Quote[]);
    })();
  }, [form.client_id]);

  const clientJobs = useMemo(() => jobs.filter(j => form.client_id && j.client_id === form.client_id), [jobs, form.client_id]);
  const selectedClient = clients.find(c => c.id === form.client_id);
  const rawSubtotal = useMemo(() => calcSubtotal(form.line_items), [form.line_items]);
  const gst = useMemo(
    () => calcDocumentTotals(rawSubtotal, parseFloat(form.tax_rate) || 0),
    [rawSubtotal, form.tax_rate],
  );
  const { subtotal, taxAmount, total: grandTotal } = gst;
  const next = recommendInvoiceAction({ status: form.status, due_date: form.due_date });
  const displayStatus = next.status;

  const previewData = useMemo((): CommercialPdfData | null => {
    if (!company) return null;
    const cleanLines: InvoiceLineItem[] = form.line_items
      .filter(li => li.description.trim() && (parseFloat(li.quantity) || 0) > 0)
      .map(li => ({
        description: li.description.trim(),
        quantity: parseFloat(li.quantity) || 0,
        unit_price: parseFloat(li.unit_price) || 0,
        charge_type: li.charge_type.trim() || null,
        unit_cost: li.unit_cost ? parseFloat(li.unit_cost) : null,
        markup_percent: li.markup_percent ? parseFloat(li.markup_percent) : null,
        cost_model_id: li.cost_model_id ?? null,
      }));
    return {
      kind: 'invoice',
      title: 'Invoice charges',
      docNumber: invoice?.invoice_number != null ? `#${padInv(invoice.invoice_number)}` : 'Draft',
      dateLabel: 'Date',
      dateValue: format(new Date(), 'd MMM yyyy'),
      secondaryLabel: 'Due',
      secondaryValue: form.due_date ? format(parseISO(form.due_date), 'd MMM yyyy') : '—',
      clientName: selectedClient?.name ?? '—',
      clientDetail: selectedClient?.address ?? null,
      company: {
        name: company.name,
        abn: company.abn ?? null,
        licence_number: company.licence_number ?? null,
        phone: company.phone ?? null,
        email: company.email ?? null,
        website: company.website ?? null,
        logo_url: company.logo_url ?? null,
      },
      inclusions: form.inclusions,
      exclusions: form.exclusions,
      lines: linesFromQuoteItems(cleanLines),
      subtotal,
      taxRate: parseFloat(form.tax_rate) || 0,
      taxAmount,
      total: grandTotal,
      notes: form.notes.trim() || null,
      paymentTerms: form.payment_terms.trim() || null,
    };
  }, [company, form, invoice, selectedClient, subtotal, taxAmount, grandTotal]);

  const handleImportFromJob = async () => {
    if (!form.job_id) { setErr('Select a job first'); return; }
    setImporting(true); setErr('');
    try {
      const { data, error: jcErr } = await supabase.from('job_costs').select('*').eq('job_id', form.job_id);
      if (jcErr) throw jcErr;
      const costs = (data ?? []) as JobCost[];
      if (costs.length === 0) { setErr('No job costs found for this job'); return; }
      const newLines: EditLineItem[] = costs.map(c => {
        const unitCost = Number(c.unit_cost) || 0;
        const unitPrice = Number(c.unit_price) || unitCost;
        const markup = c.markup_percent != null
          ? Number(c.markup_percent)
          : (unitCost > 0 ? Number((((unitPrice / unitCost) - 1) * 100).toFixed(1)) : 0);
        return {
          description: c.description,
          quantity: String(c.quantity),
          unit_price: String(unitPrice),
          stock_item_id: c.stock_item_id,
          price_book_item_id: null,
          charge_type: c.charge_type
            || (c.cost_type === 'labor' ? 'Labour' : c.cost_type === 'materials' ? 'Materials' : 'Other'),
          unit_cost: String(unitCost),
          markup_percent: String(markup),
          cost_model_id: c.cost_model_id ?? null,
        };
      });
      setForm(f => ({ ...f, line_items: [...f.line_items.filter(li => li.description.trim()), ...newLines] }));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const persist = async (status: InvoiceStatus, opts?: { close?: boolean; message?: string }) => {
    if (!profile?.company_id) return;
    if (!form.client_id) { setErr('Please select a client'); return; }
    const cleanLines: InvoiceLineItem[] = form.line_items
      .filter(li => li.description.trim() && (parseFloat(li.quantity) || 0) > 0)
      .map(li => ({
        description: li.description.trim(),
        quantity: parseFloat(li.quantity) || 0,
        unit_price: parseFloat(li.unit_price) || 0,
        stock_item_id: li.stock_item_id ?? null,
        price_book_item_id: li.price_book_item_id ?? null,
        charge_type: li.charge_type.trim() || null,
        unit_cost: li.unit_cost ? parseFloat(li.unit_cost) : null,
        markup_percent: li.markup_percent ? parseFloat(li.markup_percent) : null,
        cost_model_id: li.cost_model_id ?? null,
      }));
    if (cleanLines.length === 0) { setErr('Add at least one line item'); return; }
    setSaving(true); setErr('');
    const storedStatus = persistableInvoiceStatus(status);
    const payload = {
      client_id: form.client_id || null,
      job_id: form.job_id || null,
      quote_id: form.quote_id || null,
      status: storedStatus,
      line_items: cleanLines,
      subtotal,
      tax_rate: parseFloat(form.tax_rate) || 0,
      tax_amount: taxAmount,
      total: grandTotal,
      payment_terms: form.payment_terms.trim() || null,
      due_date: form.due_date || null,
      notes: form.notes.trim() || null,
      inclusions: form.inclusions,
      exclusions: form.exclusions,
    };
    const id = savedId ?? invoice?.id;
    if (id) {
      const { error } = await supabase.from('invoices').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id);
      setSaving(false);
      if (error) {
        if (error.code === '23505') {
          setErr('An invoice already exists for this quote');
          return;
        }
        setErr(error.message);
        return;
      }
      setForm(f => ({ ...f, status: storedStatus }));
      onSaved({ close: opts?.close ?? false, message: opts?.message ?? 'Invoice updated' });
      return;
    }
    const { data, error } = await supabase.from('invoices').insert({
      ...payload,
      source: form.quote_id ? INVOICE_SOURCE_QUOTE : null,
      company_id: profile.company_id,
      created_by: profile.id,
    }).select('id').single();
    setSaving(false);
    if (error) {
      if (error.code === '23505') {
        setErr('An invoice already exists for this quote');
        return;
      }
      setErr(error.message);
      return;
    }
    setSavedId(data.id as string);
    setForm(f => ({ ...f, status: storedStatus }));
    onSaved({ close: opts?.close ?? true, message: opts?.message ?? 'Invoice created' });
  };

  const heading = invoice?.invoice_number != null
    ? `INVOICE #${padInv(invoice.invoice_number)}`
    : 'NEW INVOICE';

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-xl" onClick={e => e.stopPropagation()}>
        <div className={`text-white px-5 py-4 ${displayStatus === 'overdue' ? 'bg-[#7F1D1D]' : 'bg-[#0A2540]'}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-bold tracking-wider text-white/60 mb-1">{heading}</p>
              <h2 className="text-lg font-semibold tracking-tight truncate">
                {selectedClient?.name || 'Invoice'}
              </h2>
              <p className="mt-1 text-sm text-white/80 truncate">
                {form.due_date ? `Due ${format(parseISO(form.due_date), 'd MMM yyyy')}` : 'No due date'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${INVOICE_STATUS_STYLES[displayStatus]}`}>
                {INVOICE_STATUS_LABELS[displayStatus]}
              </span>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/70">
                <X size={18} />
              </button>
            </div>
          </div>
          <p className="mt-3 text-xl font-bold">
            {formatMoney(grandTotal)} <span className="text-sm font-medium text-white/70">inc GST</span>
          </p>
          <p className="text-sm text-white/70 mt-0.5">{gstLabel(parseFloat(form.tax_rate) || 0)} {formatMoney(taxAmount)}</p>
        </div>

        <div className="px-5 py-3 border-b border-[#F3F4F6] space-y-3">
          <NextBanner detail={next.detail} />
          <div className="flex flex-wrap gap-2">
            {next.key === 'send' && (
              <ActionButton recommended onClick={() => void persist('sent', { close: false, message: 'Invoice marked as sent' })} disabled={saving}>
                <Send size={14} /> {saving ? 'Saving...' : 'Send'}
              </ActionButton>
            )}
            {form.status !== 'paid' && (
              <ActionButton
                recommended={next.key === 'mark_paid'}
                onClick={() => void persist('paid', { close: false, message: 'Invoice marked as paid' })}
                disabled={saving}
              >
                <Check size={14} /> {saving ? 'Saving...' : 'Mark paid'}
              </ActionButton>
            )}
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              disabled={!previewData}
              className="btn-ghost"
            >
              <Eye size={14} /> Preview PDF
            </button>
          </div>
        </div>

        <div className="overlay-body">
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
            <button type="button" onClick={() => void handleImportFromJob()} disabled={importing}
              className="flex items-center gap-1.5 text-xs text-[#2E75B6] hover:underline font-medium disabled:opacity-50">
              <Download size={13} /> {importing ? 'Importing...' : 'Import line items from job'}
            </button>
          )}

          <DocumentVariationsEditor
            inclusions={form.inclusions}
            exclusions={form.exclusions}
            onChange={({ inclusions, exclusions }) => setForm(f => ({ ...f, inclusions, exclusions }))}
          />

          <LineItemEditor
            lines={form.line_items}
            stockItems={stockItems}
            priceBookItems={priceBookItems}
            defaultMarkup={company?.default_material_markup ?? 0}
            onChange={lines => setForm(f => ({ ...f, line_items: lines }))}
          />

          <DocumentGstTotals
            subtotal={subtotal}
            taxRate={parseFloat(form.tax_rate) || 0}
            taxAmount={taxAmount}
            total={grandTotal}
          />

          <div className="grid grid-cols-2 gap-3">
            <Field label="GST rate (%)">
              <input type="number" min={0} step="0.01" value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))}
                className="form-input" placeholder="0" />
            </Field>
            <Field label="Payment Terms">
              <input value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))}
                className="form-input" placeholder="Net 30" />
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

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => void persist(form.status, { close: true })} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : invoice || savedId ? 'Save Changes' : 'Save draft'}
          </button>
        </div>
      </div>

      {showPreview && previewData && (
        <CommercialPdfPreviewModal data={previewData} onClose={() => setShowPreview(false)} />
      )}
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
