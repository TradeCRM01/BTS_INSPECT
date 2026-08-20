import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { PageError, EmptyState, SearchBar, useToast, ViewToggle, useViewMode, SummaryCard, OpsCardHeader, OpsStatus, opsSiteLabel } from '../components/ui';
import { SkeletonRow, SkeletonSummaryCards } from '../components/ui/Skeletons';
import type { QuoteWithDetails, QuoteLineItem, QuoteStatus, StockItem, PriceBookItem } from '../types/fsm';
import type { Client, Job } from '../types/crm';
import { convertQuoteToJob } from '../lib/convertQuoteToJob';
import { convertQuoteToInvoice } from '../lib/convertQuoteToInvoice';
import { invoiceHref, invoiceLandingPath, pickReusableInvoice } from '../lib/invoiceFromQuote';
import { calcDocumentTotals, DEFAULT_TAX_RATE } from '../lib/gst';
import { LineItemEditor, emptyLineItem, toEditLine, calcSubtotal, type EditLineItem } from '../components/invoicing/LineItemEditor';
import { DocumentVariationsEditor } from '../components/invoicing/DocumentVariationsEditor';
import { DocumentGstTotals } from '../components/invoicing/DocumentGstTotals';
import { CommercialPdfPreviewModal } from '../components/invoicing/CommercialPdfPreviewModal';
import { ActionButton, NextBanner } from '../components/invoicing/DocNextAction';
import { linesFromQuoteItems } from '../reports/commercial/CommercialDocumentPdf';
import type { CommercialPdfData } from '../reports/commercial/CommercialDocumentPdf';
import { asStringList } from '../lib/asStringList';
import { padQuoteNumber } from '../lib/quoteJobFields';
import {
  quoteActionContext,
  quoteListBucket,
  recommendQuoteAction,
  type QuoteActionKey,
} from '../lib/quoteNextAction';
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_STYLES, formatMoney } from '../types/fsm';
import { Plus, FileText, X, ArrowRight, Eye, Receipt, User, Calendar, Send, Check, MapPin } from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';

type StatusFilter = 'all' | QuoteStatus;

type QuoteListItem = QuoteWithDetails & { invoice_id: string | null };

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: 'accepted', label: 'Accepted' },
  { key: 'declined', label: 'Declined' },
  { key: 'expired', label: 'Expired' },
];

export function QuotesPage() {
  const { profile, company } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [editingQuote, setEditingQuote] = useState<QuoteListItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useViewMode('quotes');
  const [searchParams, setSearchParams] = useSearchParams();
  const preselectId = searchParams.get('id');

  const { data: quotes, isLoading, error } = useQuery<QuoteListItem[]>({
    queryKey: ['quotes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, company_id, quote_number, client_id, job_id, status, description, scope_of_works, line_items, subtotal, tax_rate, tax_amount, total, validity_date, notes, inclusions, exclusions, created_by, created_at, updated_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as QuoteWithDetails[];
      const clientIds = [...new Set(list.map(q => q.client_id).filter(Boolean))] as string[];
      const jobIds = [...new Set(list.map(q => q.job_id).filter(Boolean))] as string[];
      const quoteIds = list.map(q => q.id);
      const [clientsRes, jobsRes, invoicesRes] = await Promise.all([
        clientIds.length ? supabase.from('clients').select('id, name').in('id', clientIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        jobIds.length ? supabase.from('jobs').select('id, title, address').in('id', jobIds) : Promise.resolve({ data: [] as { id: string; title: string; address: string | null }[] }),
        quoteIds.length
          ? supabase.from('invoices').select('id, quote_id, status').in('quote_id', quoteIds)
          : Promise.resolve({ data: [] as { id: string; quote_id: string; status: string }[] }),
      ]);
      const clientMap = new Map((clientsRes.data ?? []).map(c => [c.id, c.name]));
      const jobMap = new Map((jobsRes.data ?? []).map(j => [j.id, j]));
      const invoicesByQuote = new Map<string, { id: string; status: string }[]>();
      for (const inv of invoicesRes.data ?? []) {
        if (!inv.quote_id) continue;
        const rows = invoicesByQuote.get(inv.quote_id) ?? [];
        rows.push({ id: inv.id, status: inv.status });
        invoicesByQuote.set(inv.quote_id, rows);
      }
      return list.map(q => ({
        ...q,
        inclusions: asStringList(q.inclusions),
        exclusions: asStringList(q.exclusions),
        client_name: q.client_id ? clientMap.get(q.client_id) ?? null : null,
        job_title: q.job_id ? jobMap.get(q.job_id)?.title ?? null : null,
        job_address: q.job_id ? jobMap.get(q.job_id)?.address ?? null : null,
        invoice_id: pickReusableInvoice(invoicesByQuote.get(q.id) ?? [])?.id ?? null,
      }));
    },
    enabled: !!profile,
  });

  const filtered = useMemo(() => {
    const list = quotes ?? [];
    return list.filter(q => {
      if (statusFilter !== 'all' && q.status !== statusFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        return `#${padQuoteNumber(q.quote_number)}`.toLowerCase().includes(s)
          || (q.client_name ?? '').toLowerCase().includes(s)
          || (q.description ?? '').toLowerCase().includes(s);
      }
      return true;
    });
  }, [quotes, statusFilter, search]);

  const draftQuotes = filtered.filter(q => quoteListBucket(q.status) === 'draft');
  const sentQuotes = filtered.filter(q => quoteListBucket(q.status) === 'sent');
  const acceptedQuotes = filtered.filter(q => quoteListBucket(q.status) === 'accepted');
  const closedQuotes = filtered.filter(q => quoteListBucket(q.status) === 'closed');

  useEffect(() => {
    if (!preselectId || !quotes) return;
    const q = quotes.find(item => item.id === preselectId);
    if (!q) return;
    setEditingQuote(q);
    setShowForm(true);
    setSearchParams({}, { replace: true });
  }, [preselectId, quotes, setSearchParams]);

  const counts = useMemo(() => {
    const all = quotes ?? [];
    return {
      all: all.length,
      draft: all.filter(q => q.status === 'draft').length,
      sent: all.filter(q => q.status === 'sent').length,
      accepted: all.filter(q => q.status === 'accepted').length,
      declined: all.filter(q => q.status === 'declined').length,
      expired: all.filter(q => q.status === 'expired').length,
    };
  }, [quotes]);

  const totals = useMemo(() => {
    const all = quotes ?? [];
    const pending = all.filter(q => q.status === 'draft' || q.status === 'sent');
    const pendingValue = pending.reduce((s, q) => s + Number(q.total ?? 0), 0);
    const accepted = all.filter(q => q.status === 'accepted');
    const acceptedValue = accepted.reduce((s, q) => s + Number(q.total ?? 0), 0);
    return { pendingCount: pending.length, pendingValue, acceptedCount: accepted.length, acceptedValue };
  }, [quotes]);

  function openQuote(q: QuoteListItem | null) {
    setEditingQuote(q);
    setShowForm(true);
  }

  function handleSaved(opts?: { close?: boolean; message?: string }) {
    if (opts?.close !== false) setShowForm(false);
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
    showToast(opts?.message ?? (editingQuote ? 'Quote updated' : 'Quote created'));
  }

  if (error) return <AppShell><PageError message="Could not load quotes" /></AppShell>;

  const filteredEmpty = !search && statusFilter === 'all';

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="ops-page-title">Quotes</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">
              {filtered.length} of {quotes?.length ?? 0} quotes
            </p>
          </div>
          <button onClick={() => openQuote(null)} className="btn-primary">
            <Plus size={16} /> New Quote
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {isLoading ? (
            <SkeletonSummaryCards count={2} />
          ) : (
            <>
              <SummaryCard label="Pending" value={`${totals.pendingCount}`} subtext={formatMoney(totals.pendingValue)} accentColor="#2E75B6" />
              <SummaryCard label="Accepted" value={`${totals.acceptedCount}`} subtext={formatMoney(totals.acceptedValue)} accentColor="#16A34A" />
            </>
          )}
        </div>

        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Search quotes, clients..." className="max-w-sm flex-1" />
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
                <span className="ml-1.5 text-xs text-[#9CA3AF]">{counts[tab.key]}</span>
              </button>
            ))}
          </div>
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>

        {isLoading ? (
          <SkeletonRow />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={filteredEmpty ? 'No quotes yet' : 'No matching quotes'}
            message={filteredEmpty
              ? 'Write a quote, send it to the client, then convert it to a job when they accept.'
              : 'Try another status or search.'}
            action={filteredEmpty ? (
              <button onClick={() => openQuote(null)} className="btn-primary">
                <Plus size={16} /> Write a quote
              </button>
            ) : undefined}
          />
        ) : viewMode === 'grid' ? (
          <div className="space-y-6">
            <QuoteGroup title="Drafts" quotes={draftQuotes} onOpen={openQuote} />
            <QuoteGroup title="Sent — waiting" quotes={sentQuotes} onOpen={openQuote} />
            <QuoteGroup title="Accepted" quotes={acceptedQuotes} onOpen={openQuote} />
            <QuoteGroup title="Closed" quotes={closedQuotes} onOpen={openQuote} />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9FAFB] text-left text-xs font-medium text-[#4A5568] uppercase tracking-wide">
                    <th className="px-4 py-3">Quote #</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Total (inc GST)</th>
                    <th className="px-4 py-3">Next</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {filtered.map(q => (
                    <QuoteRow key={q.id} quote={q} onOpen={() => openQuote(q)} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <QuoteEditorModal
          quote={editingQuote}
          defaultTaxRate={company?.default_tax_rate ?? DEFAULT_TAX_RATE}
          onClose={() => setShowForm(false)}
          onSaved={handleSaved}
        />
      )}
    </AppShell>
  );
}

function QuoteGroup({
  title, quotes, onOpen,
}: {
  title: string;
  quotes: QuoteListItem[];
  onOpen: (q: QuoteListItem) => void;
}) {
  if (quotes.length === 0) return null;
  return (
    <div>
      <h2 className="ops-group-title">
        {title}
        <span className="text-[#9CA3AF] normal-case font-normal"> ({quotes.length})</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {quotes.map(q => (
          <QuoteCard key={q.id} quote={q} onOpen={() => onOpen(q)} />
        ))}
      </div>
    </div>
  );
}

function QuoteCard({ quote, onOpen }: { quote: QuoteListItem; onOpen: () => void }) {
  const next = recommendQuoteAction(quoteActionContext(quote));
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="ops-card ops-card-hover group w-full cursor-pointer"
      style={{ borderLeftWidth: 4, borderLeftColor: '#2E75B6' }}
    >
      <OpsCardHeader
        kicker={`QUOTE #${padQuoteNumber(quote.quote_number)}`}
        title={quote.description?.trim() || quote.client_name || 'Untitled quote'}
        site={opsSiteLabel(quote.job_address, quote.job_title)}
      />
      <div className="ops-card-body">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <p className="text-lg font-bold text-[#1A1A1A]">{formatMoney(Number(quote.total))}</p>
            <p className="text-[11px] text-[#4A5568]">inc GST</p>
          </div>
          <OpsStatus className={QUOTE_STATUS_STYLES[quote.status]}>{QUOTE_STATUS_LABELS[quote.status]}</OpsStatus>
        </div>
        {quote.client_name && (
          <div className="flex items-center gap-1.5 text-xs text-[#4A5568] mb-2">
            <User size={12} className="text-[#9CA3AF] shrink-0" />
            <span className="truncate">{quote.client_name}</span>
          </div>
        )}
        {quote.validity_date && (
          <div className="flex items-center gap-1.5 text-xs text-[#4A5568] mb-2">
            <Calendar size={12} className="text-[#9CA3AF] shrink-0" />
            Valid {format(parseISO(quote.validity_date), 'd MMM yyyy')}
          </div>
        )}
        <div className="ops-card-footer" onClick={e => e.stopPropagation()}>
          <QuoteNextControl quote={quote} />
          {next.key === 'none' && (
            <span className="ops-next-hint">{next.label}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function QuoteRow({ quote, onOpen }: { quote: QuoteListItem; onOpen: () => void }) {
  const next = recommendQuoteAction(quoteActionContext(quote));
  return (
    <tr onClick={onOpen} className="hover:bg-[#F9FAFB] cursor-pointer transition-colors">
      <td className="px-4 py-3 font-medium text-[#2E75B6]">#{padQuoteNumber(quote.quote_number)}</td>
      <td className="px-4 py-3 text-[#1A1A1A]">{quote.client_name ?? <span className="text-[#9CA3AF]">—</span>}</td>
      <td className="px-4 py-3 text-[#4A5568] max-w-[220px]">
        {quote.description
          ? <span className="line-clamp-2">{quote.description}</span>
          : <span className="text-[#9CA3AF]">—</span>}
      </td>
      <td className="px-4 py-3">
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${QUOTE_STATUS_STYLES[quote.status]}`}>
          {QUOTE_STATUS_LABELS[quote.status]}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <span className="font-semibold text-[#1A1A1A]">{formatMoney(Number(quote.total))}</span>
        <span className="block text-[11px] font-normal text-[#4A5568]">inc GST</span>
      </td>
      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
        {next.key === 'none' ? (
          <span className="ops-next-hint">{next.label}</span>
        ) : (
          <QuoteNextControl quote={quote} />
        )}
      </td>
    </tr>
  );
}

function QuoteNextControl({ quote }: { quote: QuoteListItem }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, company } = useAuth();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<QuoteActionKey | null>(null);
  const next = recommendQuoteAction(quoteActionContext(quote));
  if (next.key === 'none') return null;

  const run = async (key: QuoteActionKey, fn: () => Promise<void>) => {
    if (!profile?.id) return;
    setBusy(key);
    try {
      await fn();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showToast(message);
    } finally {
      setBusy(null);
    }
  };

  const handle = () => {
    if (next.key === 'send') {
      void run('send', async () => {
        const { error } = await supabase.from('quotes')
          .update({ status: 'sent', updated_at: new Date().toISOString() })
          .eq('id', quote.id);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['quotes'] });
        showToast('Quote marked as sent');
      });
      return;
    }
    if (next.key === 'accept') {
      void run('accept', async () => {
        const { error } = await supabase.from('quotes')
          .update({ status: 'accepted', updated_at: new Date().toISOString() })
          .eq('id', quote.id);
        if (error) throw error;
        queryClient.invalidateQueries({ queryKey: ['quotes'] });
        showToast('Quote accepted');
      });
      return;
    }
    if (next.key === 'convert_job') {
      void run('convert_job', async () => {
        const jobId = await convertQuoteToJob(quote, profile!.id);
        queryClient.invalidateQueries({ queryKey: ['quotes'] });
        queryClient.invalidateQueries({ queryKey: ['jobs'] });
        navigate(`/jobs/${jobId}`);
      });
      return;
    }
    if (next.key === 'invoice') {
      void run('invoice', async () => {
        const result = await convertQuoteToInvoice(
          quote.id,
          profile!.id,
          Number(company?.default_tax_rate) || DEFAULT_TAX_RATE,
        );
        queryClient.invalidateQueries({ queryKey: ['quotes'] });
        queryClient.invalidateQueries({ queryKey: ['invoices'] });
        queryClient.invalidateQueries({ queryKey: ['job-invoices'] });
        navigate(invoiceLandingPath(quote.job_id, result.id));
      });
      return;
    }
    if (next.key === 'open_job' && quote.job_id) {
      navigate(`/jobs/${quote.job_id}`);
      return;
    }
    if (next.key === 'open_invoice' && quote.invoice_id) {
      navigate(invoiceHref(quote.invoice_id));
    }
  };

  return (
    <button
      type="button"
      onClick={handle}
      disabled={!!busy}
      className="btn-primary text-xs py-1.5 px-2.5"
    >
      {busy ? 'Working…' : next.label}
    </button>
  );
}

interface EditorState {
  client_id: string; job_id: string; status: QuoteStatus;
  description: string; scope_of_works: string;
  line_items: EditLineItem[]; tax_rate: string; validity_date: string; notes: string;
  inclusions: string[]; exclusions: string[];
}

function QuoteEditorModal({ quote, defaultTaxRate, onClose, onSaved }: {
  quote: QuoteListItem | null;
  defaultTaxRate: number;
  onClose: () => void;
  onSaved: (opts?: { close?: boolean; message?: string }) => void;
}) {
  const { profile, company } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [priceBookItems, setPriceBookItems] = useState<PriceBookItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [err, setErr] = useState('');
  const [savedId, setSavedId] = useState<string | null>(quote?.id ?? null);
  const [invoiceId, setInvoiceId] = useState<string | null>(quote?.invoice_id ?? null);

  const [form, setForm] = useState<EditorState>({
    client_id: quote?.client_id ?? '',
    job_id: quote?.job_id ?? '',
    status: quote?.status ?? 'draft',
    description: quote?.description ?? '',
    scope_of_works: quote?.scope_of_works ?? '',
    line_items: quote?.line_items?.length
      ? quote.line_items.map(toEditLine)
      : [emptyLineItem(company?.default_material_markup ?? 0)],
    tax_rate: String(quote?.tax_rate ?? defaultTaxRate),
    validity_date: quote?.validity_date ?? format(addDays(new Date(), 30), 'yyyy-MM-dd'),
    notes: quote?.notes ?? '',
    inclusions: asStringList(quote?.inclusions),
    exclusions: asStringList(quote?.exclusions),
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

  const clientJobs = useMemo(() => jobs.filter(j => form.client_id && j.client_id === form.client_id), [jobs, form.client_id]);
  const selectedClient = clients.find(c => c.id === form.client_id);
  const rawSubtotal = useMemo(() => calcSubtotal(form.line_items), [form.line_items]);
  const gst = useMemo(
    () => calcDocumentTotals(rawSubtotal, parseFloat(form.tax_rate) || 0),
    [rawSubtotal, form.tax_rate],
  );
  const { subtotal, taxAmount, total: grandTotal } = gst;

  const next = recommendQuoteAction({
    status: form.status,
    hasClient: !!form.client_id,
    hasLines: form.line_items.some(li => li.description.trim() && (parseFloat(li.quantity) || 0) > 0),
    jobId: form.job_id || null,
    invoiceId,
  });

  const previewData = useMemo((): CommercialPdfData | null => {
    if (!company) return null;
    const cleanLines: QuoteLineItem[] = form.line_items
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
      kind: 'quote',
      title: 'Quoted prices',
      docNumber: quote?.quote_number != null ? `#${padQuoteNumber(quote.quote_number)}` : 'Draft',
      dateLabel: 'Date',
      dateValue: format(new Date(), 'd MMM yyyy'),
      secondaryLabel: 'Valid until',
      secondaryValue: form.validity_date ? format(parseISO(form.validity_date), 'd MMM yyyy') : '—',
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
      description: form.description.trim() || null,
      scopeOfWorks: form.scope_of_works.trim() || null,
      lines: linesFromQuoteItems(cleanLines),
      subtotal,
      taxRate: parseFloat(form.tax_rate) || 0,
      taxAmount,
      total: grandTotal,
      notes: form.notes.trim() || null,
    };
  }, [company, form, quote, selectedClient, subtotal, taxAmount, grandTotal]);

  const buildPayload = (status: QuoteStatus) => {
    const cleanLines: QuoteLineItem[] = form.line_items
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
    return {
      cleanLines,
      payload: {
        client_id: form.client_id || null, job_id: form.job_id || null, status,
        description: form.description.trim() || null,
        scope_of_works: form.scope_of_works.trim() || null,
        line_items: cleanLines, subtotal, tax_rate: parseFloat(form.tax_rate) || 0, tax_amount: taxAmount, total: grandTotal,
        validity_date: form.validity_date || null, notes: form.notes.trim() || null,
        inclusions: form.inclusions, exclusions: form.exclusions,
      },
    };
  };

  const persist = async (status: QuoteStatus, opts?: { close?: boolean; message?: string }) => {
    if (!profile?.company_id) return null;
    if (!form.client_id) { setErr('Please select a client'); return null; }
    const { cleanLines, payload } = buildPayload(status);
    if (cleanLines.length === 0) { setErr('Add at least one line item'); return null; }
    setSaving(true); setErr('');
    const id = savedId ?? quote?.id;
    if (id) {
      const { error } = await supabase.from('quotes').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id);
      setSaving(false);
      if (error) { setErr(error.message); return null; }
      setForm(f => ({ ...f, status }));
      onSaved({ close: opts?.close ?? false, message: opts?.message ?? 'Quote updated' });
      return id;
    }
    const { data, error } = await supabase.from('quotes')
      .insert({ ...payload, company_id: profile.company_id, created_by: profile.id })
      .select('id')
      .single();
    setSaving(false);
    if (error) { setErr(error.message); return null; }
    setSavedId(data.id as string);
    setForm(f => ({ ...f, status }));
    onSaved({ close: opts?.close ?? true, message: opts?.message ?? 'Quote created' });
    return data.id as string;
  };

  const handleInvoice = async () => {
    const id = savedId ?? quote?.id;
    if (!id || form.status !== 'accepted' || !profile?.id) return;
    setInvoicing(true); setErr('');
    try {
      const result = await convertQuoteToInvoice(
        id,
        profile.id,
        Number(company?.default_tax_rate) || DEFAULT_TAX_RATE,
      );
      setInvoiceId(result.id);
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['job-invoices'] });
      navigate(invoiceLandingPath(form.job_id || quote?.job_id, result.id));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Could not create invoice');
    } finally {
      setInvoicing(false);
    }
  };

  const handleConvert = async () => {
    const id = savedId ?? quote?.id;
    if (!id || form.status !== 'accepted' || !profile?.id) return;
    setConverting(true); setErr('');
    try {
      const jobId = await convertQuoteToJob({
        id,
        company_id: quote?.company_id || profile.company_id,
        quote_number: quote?.quote_number ?? null,
        client_id: form.client_id || null,
        job_id: form.job_id || null,
        description: form.description,
        scope_of_works: form.scope_of_works,
        line_items: buildPayload('accepted').payload.line_items,
        total: grandTotal,
      }, profile.id);
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      navigate(`/jobs/${jobId}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Conversion failed');
    } finally {
      setConverting(false);
    }
  };

  const selectedJob = jobs.find(j => j.id === form.job_id);
  const heading = quote?.quote_number != null
    ? `QUOTE #${padQuoteNumber(quote.quote_number)}`
    : 'NEW QUOTE';

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-xl" onClick={e => e.stopPropagation()}>
        <div className="ops-card-header ops-card-header-lg">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="ops-card-kicker ops-card-kicker-lg">{heading}</p>
              <h2 className="text-lg font-semibold tracking-tight truncate">
                {form.description.trim() || selectedClient?.name || 'Quote'}
              </h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <OpsStatus className={QUOTE_STATUS_STYLES[form.status]}>
                {QUOTE_STATUS_LABELS[form.status]}
              </OpsStatus>
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-white/70">
                <X size={18} />
              </button>
            </div>
          </div>
          <p className="ops-hub-site">
            <MapPin size={16} className="ops-card-site-icon mt-0.5" />
            <span className="truncate">{opsSiteLabel(selectedJob?.address, selectedJob?.title, selectedClient?.address)}</span>
          </p>
          {selectedClient && (
            <p className="mt-2 flex items-center gap-2 text-sm text-white/80 truncate">
              <User size={14} className="text-[#93C5FD] shrink-0" />
              {selectedClient.name}
            </p>
          )}
          <p className="mt-3 text-xl font-bold">{formatMoney(grandTotal)} <span className="text-sm font-medium text-white/70">inc GST</span></p>
        </div>

        <div className="px-5 py-3 border-b border-[#F3F4F6] space-y-3">
          <NextBanner detail={next.detail} />
          <div className="flex flex-wrap gap-2">
            {next.key === 'send' && (
              <ActionButton recommended onClick={() => void persist('sent', { close: false, message: 'Quote marked as sent' })} disabled={saving}>
                <Send size={14} /> {saving ? 'Saving...' : 'Send'}
              </ActionButton>
            )}
            {next.key === 'accept' && (
              <ActionButton recommended onClick={() => void persist('accepted', { close: false, message: 'Quote accepted' })} disabled={saving}>
                <Check size={14} /> {saving ? 'Saving...' : 'Mark accepted'}
              </ActionButton>
            )}
            {form.status === 'accepted' && !form.job_id && (
              <ActionButton recommended={next.key === 'convert_job'} onClick={() => void handleConvert()} disabled={converting}>
                <ArrowRight size={14} /> {converting ? 'Converting...' : 'Convert to job'}
              </ActionButton>
            )}
            {form.status === 'accepted' && form.job_id && (
              <ActionButton recommended={next.key === 'open_job'} onClick={() => navigate(`/jobs/${form.job_id}`)}>
                <ArrowRight size={14} /> Open job
              </ActionButton>
            )}
            {form.status === 'accepted' && !invoiceId && (
              <ActionButton recommended={next.key === 'invoice'} onClick={() => void handleInvoice()} disabled={invoicing}>
                <Receipt size={14} /> {invoicing ? 'Creating...' : 'Create invoice'}
              </ActionButton>
            )}
            {form.status === 'accepted' && invoiceId && (
              <ActionButton recommended={false} onClick={() => navigate(invoiceHref(invoiceId))}>
                <Receipt size={14} /> Open invoice
              </ActionButton>
            )}
            {form.status === 'sent' && (
              <button
                type="button"
                onClick={() => void persist('declined', { close: false, message: 'Quote declined' })}
                disabled={saving}
                className="btn-ghost"
              >
                Decline
              </button>
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Client" required>
              <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value, job_id: '' }))} className="form-input cursor-pointer">
                <option value="">Select a client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Linked Job">
              <select value={form.job_id} onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))} className="form-input cursor-pointer">
                <option value="">No linked job</option>
                {clientJobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Description">
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="form-input"
              placeholder="Short summary shown on the quotes list…"
              maxLength={200}
            />
          </Field>

          <Field label="Scope of works">
            <textarea
              value={form.scope_of_works}
              onChange={e => setForm(f => ({ ...f, scope_of_works: e.target.value }))}
              className="form-input min-h-[100px] resize-y"
              placeholder="Detailed scope for the client — appears on the quote PDF…"
            />
          </Field>

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
              <input type="number" min={0} step="0.01" value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))} className="form-input" placeholder="0" />
            </Field>
            <Field label="Valid Until">
              <input type="date" value={form.validity_date} onChange={e => setForm(f => ({ ...f, validity_date: e.target.value }))} className="form-input" />
            </Field>
          </div>

          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="form-input min-h-[60px] resize-y" placeholder="Notes for the client..." />
          </Field>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={() => void persist(form.status, { close: true })} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : quote || savedId ? 'Save Changes' : 'Save draft'}
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
