import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { PageError, EmptyState, SearchBar, useToast, ViewToggle, useViewMode, OpsDocHead, OpsFromTo, OpsSiteRow, OpsStatus, opsSiteLabel } from '../components/ui';
import { SkeletonRow } from '../components/ui/Skeletons';
import type { InvoiceWithDetails, InvoiceLineItem, InvoiceStatus, JobCost, Quote, StockItem, PriceBookItem } from '../types/fsm';
import type { Client, Job } from '../types/crm';
import { LineItemEditor, emptyLineItem, toEditLine, calcSubtotal, type EditLineItem } from '../components/invoicing/LineItemEditor';
import { DocumentVariationsEditor } from '../components/invoicing/DocumentVariationsEditor';
import { DocumentGstTotals } from '../components/invoicing/DocumentGstTotals';
import { CommercialPdfPreviewModal } from '../components/invoicing/CommercialPdfPreviewModal';
import { ActionButton } from '../components/invoicing/DocNextAction';
import { linesFromQuoteItems } from '../reports/commercial/CommercialDocumentPdf';
import type { CommercialPdfData } from '../reports/commercial/CommercialDocumentPdf';
import { asStringList } from '../lib/asStringList';
import { calcDocumentTotals, DEFAULT_TAX_RATE, gstLabel } from '../lib/gst';
import { effectiveInvoiceStatus, persistableInvoiceStatus } from '../lib/invoiceStatus';
import { invoiceListBucket, recommendInvoiceAction, type InvoiceActionKey } from '../lib/invoiceNextAction';
import { INVOICE_SOURCE_QUOTE } from '../lib/invoiceFromQuote';
import { INVOICE_STATUS_LABELS, INVOICE_STATUS_STYLES, formatMoney } from '../types/fsm';
import { Plus, Receipt, Download, Eye, Check, Send } from 'lucide-react';
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
  const [presetClientId, setPresetClientId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useViewMode('invoices');

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
        jobIds.length ? supabase.from('jobs').select('id, title, address').in('id', jobIds) : Promise.resolve({ data: [] as { id: string; title: string; address: string | null }[] }),
      ]);
      const clientMap = new Map((clientsRes.data ?? []).map(c => [c.id, c.name]));
      const jobMap = new Map((jobsRes.data ?? []).map(j => [j.id, j]));
      return list.map(i => ({
        ...i,
        inclusions: asStringList(i.inclusions),
        exclusions: asStringList(i.exclusions),
        client_name: i.client_id ? clientMap.get(i.client_id) ?? null : null,
        job_title: i.job_id ? jobMap.get(i.job_id)?.title ?? null : null,
        job_address: i.job_id ? jobMap.get(i.job_id)?.address ?? null : null,
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
    const invoiceId = searchParams.get('id');
    const clientId = searchParams.get('client');
    if (invoiceId) {
      if (!invoices) return;
      const inv = invoices.find(i => i.id === invoiceId);
      if (!inv) return;
      setEditingInvoice(inv);
      setPresetClientId(null);
      setShowForm(true);
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      next.delete('client');
      setSearchParams(next, { replace: true });
      return;
    }
    if (!clientId) return;
    setEditingInvoice(null);
    setPresetClientId(clientId);
    setShowForm(true);
    const next = new URLSearchParams(searchParams);
    next.delete('client');
    setSearchParams(next, { replace: true });
  }, [searchParams, invoices, setSearchParams]);

  function openInvoice(inv: InvoiceWithDetails | null) {
    setEditingInvoice(inv);
    setPresetClientId(null);
    setShowForm(true);
  }

  function handleSaved(opts?: { close?: boolean; message?: string }) {
    if (opts?.close !== false) {
      setShowForm(false);
      setPresetClientId(null);
    }
    queryClient.invalidateQueries({ queryKey: ['invoices'] });
    queryClient.invalidateQueries({ queryKey: ['client-invoices'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    showToast(opts?.message ?? (editingInvoice ? 'Invoice updated' : 'Invoice created'));
  }

  if (error) return <AppShell><PageError message="Could not load invoices" /></AppShell>;

  const filteredEmpty = !search && statusFilter === 'all';

  return (
    <AppShell>
      <div className="ops-page">
        <div className="ops-page-head">
          <div>
            <h1 className="ops-page-title">Invoices</h1>
            <p className="ops-meta mt-0.5">
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

        <div className="ops-due-box mb-3">
          <span className="ops-meta font-semibold uppercase tracking-wide">Amount due</span>
          <span className="ops-money text-lg">{isLoading ? '—' : formatMoney(totals.outstanding)}</span>
        </div>

        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Search invoices or clients..." className="max-w-sm flex-1" />
          <div className="ops-tabs flex-1">
            {STATUS_FILTERS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`ops-tab ${statusFilter === tab.key ? 'ops-tab-active' : ''}`}
              >
                {tab.label}
                <span className={`ml-1.5 ${tab.key === 'overdue' && counts.overdue > 0 ? 'text-fail' : ''}`}>{counts[tab.key]}</span>
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
          <div className="space-y-4">
            <InvoiceGroup title="Overdue" invoices={overdueInvoices} onOpen={openInvoice} />
            <InvoiceGroup title="Drafts" invoices={draftInvoices} onOpen={openInvoice} />
            <InvoiceGroup title="Awaiting payment" invoices={awaitingInvoices} onOpen={openInvoice} />
            <InvoiceGroup title="Paid" invoices={paidInvoices} onOpen={openInvoice} />
          </div>
        ) : (
          <div className="ops-table">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zebra text-left ops-meta font-medium uppercase tracking-wide">
                    <th className="px-3 py-2">Invoice #</th>
                    <th className="px-3 py-2">Site</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Total (inc GST)</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2">Next</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
                  {filtered.map(inv => {
                    const status = effectiveInvoiceStatus(inv);
                    return (
                      <tr
                        key={inv.id}
                        onClick={() => openInvoice(inv)}
                        className={`hover:bg-zebra cursor-pointer transition-colors ${status === 'overdue' ? 'bg-fail/5' : ''}`}
                      >
                        <td className="px-3 py-2 font-medium text-accent">#{padInv(inv.invoice_number)}</td>
                        <td className="px-3 py-2">
                          <p className="text-sm font-semibold text-navy truncate">{opsSiteLabel(inv.job_address)}</p>
                          <p className="ops-meta truncate">{inv.client_name ?? '—'}</p>
                        </td>
                        <td className="px-3 py-2">
                          <OpsStatus className={INVOICE_STATUS_STYLES[status]}>{INVOICE_STATUS_LABELS[status]}</OpsStatus>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="ops-money text-base">{formatMoney(Number(inv.total))}</span>
                          <span className="block ops-meta">{gstLabel(Number(inv.tax_rate))} {formatMoney(Number(inv.tax_amount))}</span>
                        </td>
                        <td className={`px-3 py-2 ${status === 'overdue' ? 'text-fail font-semibold' : 'ops-meta'}`}>
                          {inv.due_date ? format(parseISO(inv.due_date), 'd MMM yyyy') : '—'}
                        </td>
                        <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
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
          key={editingInvoice?.id ?? presetClientId ?? 'new'}
          invoice={editingInvoice}
          presetClientId={presetClientId}
          defaultTaxRate={company?.default_tax_rate ?? DEFAULT_TAX_RATE}
          onClose={() => { setShowForm(false); setPresetClientId(null); }}
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
      <h2 className={`ops-group-title ${title === 'Overdue' ? 'text-fail' : ''}`}>
        {title}
        <span className="normal-case font-normal"> ({invoices.length})</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
      className="ops-card ops-card-hover group cursor-pointer"
    >
      <OpsDocHead
        kind="Invoice"
        id={`INV-${padInv(invoice.invoice_number)}`}
        trailing={<OpsStatus className={INVOICE_STATUS_STYLES[next.status]}>{INVOICE_STATUS_LABELS[next.status]}</OpsStatus>}
      />
      <div className="ops-card-body">
        <div className="flex items-start justify-between gap-2">
          <OpsSiteRow site={opsSiteLabel(invoice.job_address)} />
          <div className="shrink-0">
            <p className="ops-money">{formatMoney(Number(invoice.total))}</p>
            <p className="ops-meta text-right">inc GST</p>
          </div>
        </div>
        <div className="ops-card-footer" onClick={e => e.stopPropagation()}>
          {next.key === 'none' ? (
            <span className="ops-next-control-done">{next.label}</span>
          ) : (
            <InvoiceNextControl invoice={invoice} />
          )}
        </div>
        {invoice.client_name && <p className="ops-meta mt-2 truncate">{invoice.client_name}</p>}
        {invoice.due_date && (
          <p className={`ops-meta mt-0.5 ${overdue ? 'text-fail font-semibold' : ''}`}>
            Due {format(parseISO(invoice.due_date), 'd MMM yyyy')}
          </p>
        )}
      </div>
    </div>
  );
}

function InvoiceNextControl({ invoice }: { invoice: InvoiceWithDetails }) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<InvoiceActionKey | null>(null);
  const next = recommendInvoiceAction(invoice);
  if (next.key === 'none') return <span className="ops-next-hint">{next.label}</span>;

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
      className={next.status === 'overdue' ? 'ops-next-control-bad' : 'ops-next-control-block'}
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

function InvoiceEditorModal({ invoice, presetClientId, defaultTaxRate, onClose, onSaved }: {
  invoice: InvoiceWithDetails | null;
  presetClientId?: string | null;
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
    client_id: invoice?.client_id ?? presetClientId ?? '',
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
        supabase.from('jobs').select('id, company_id, client_id, title, address').order('created_at', { ascending: false }),
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

  const selectedJob = jobs.find(j => j.id === form.job_id);

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-xl ops-doc-panel" onClick={e => e.stopPropagation()}>
        <OpsDocHead
          kind="Invoice"
          id={invoice?.invoice_number != null ? `INV-${padInv(invoice.invoice_number)}` : 'INV-DRAFT'}
          meta={form.due_date ? `Due ${format(parseISO(form.due_date), 'd MMM yyyy')}` : undefined}
          trailing={<OpsStatus className={INVOICE_STATUS_STYLES[displayStatus]}>{INVOICE_STATUS_LABELS[displayStatus]}</OpsStatus>}
          onClose={onClose}
        />

        <div className="px-4 border-b border-rule">
          <OpsFromTo
            fromName={company?.name ?? 'Your company'}
            fromDetail={[company?.abn ? `ABN ${company.abn}` : null, company?.licence_number ? `Licence ${company.licence_number}` : null].filter(Boolean).join(' · ') || null}
            toName={selectedClient?.name ?? 'Select a client'}
            toDetail={opsSiteLabel(selectedJob?.address, selectedClient?.address)}
          />
          <div className="flex items-start justify-between gap-2 py-3">
            <OpsSiteRow
              hub
              site={opsSiteLabel(selectedJob?.address, selectedClient?.address)}
              phone={selectedClient?.phone}
              email={selectedClient?.email}
              mapsQuery={selectedJob?.address || selectedClient?.address}
            />
            <div className="shrink-0">
              <p className="ops-money text-lg">{formatMoney(grandTotal)}</p>
              <p className="ops-meta text-right">inc GST</p>
            </div>
          </div>
          {next.key !== 'none' && (
            <div className="pb-3">
              {next.key === 'send' && (
                <ActionButton recommended onClick={() => void persist('sent', { close: false, message: 'Invoice marked as sent' })} disabled={saving}>
                  <Send size={14} /> {saving ? 'Saving...' : 'Send'}
                </ActionButton>
              )}
              {next.key === 'mark_paid' && (
                <ActionButton recommended onClick={() => void persist('paid', { close: false, message: 'Invoice marked as paid' })} disabled={saving}>
                  <Check size={14} /> {saving ? 'Saving...' : 'Mark paid'}
                </ActionButton>
              )}
            </div>
          )}
        </div>

        <div className="px-3 py-2 border-b border-rule flex flex-wrap gap-2">
          {form.status !== 'paid' && next.key !== 'mark_paid' && (
            <ActionButton
              recommended={false}
              onClick={() => void persist('paid', { close: false, message: 'Invoice marked as paid' })}
              disabled={saving}
            >
              <Check size={14} /> Mark paid
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
              className="ops-link text-xs disabled:opacity-50">
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

        <div className="ops-sticky flex flex-col gap-2">
          {next.key === 'send' && (
            <ActionButton recommended onClick={() => void persist('sent', { close: false, message: 'Invoice marked as sent' })} disabled={saving}>
              <Send size={14} /> {saving ? 'Saving...' : 'Send'}
            </ActionButton>
          )}
          {next.key === 'mark_paid' && (
            <ActionButton recommended onClick={() => void persist('paid', { close: false, message: 'Invoice marked as paid' })} disabled={saving}>
              <Check size={14} /> {saving ? 'Saving...' : 'Mark paid'}
            </ActionButton>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => void persist(form.status, { close: true })} disabled={saving} className="btn-secondary">
              {saving ? 'Saving...' : invoice || savedId ? 'Save' : 'Save draft'}
            </button>
            <button onClick={onClose} className="btn-ghost ml-auto">Cancel</button>
          </div>
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
      <label className="block ops-meta font-medium mb-1">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
    </div>
  );
}
