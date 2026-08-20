import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { PageError, EmptyState, SearchBar, useToast, ViewToggle, useViewMode, OpsSiteRow, LoadingSpinner } from '../components/ui';
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
import { QuoteSendDialog } from '../components/invoicing/QuoteSendDialog';
import { linesFromQuoteItems } from '../reports/commercial/CommercialDocumentPdf';
import type { CommercialPdfData } from '../reports/commercial/CommercialDocumentPdf';
import { asStringList } from '../lib/asStringList';
import { padQuoteNumber } from '../lib/quoteJobFields';
import { quoteClientDetailFromClient } from '../lib/clientRecords';
import {
  quoteActionContext,
  quoteListBucket,
  recommendQuoteAction,
  type QuoteActionKey,
} from '../lib/quoteNextAction';
import { COMPANY_EMAIL_SETTINGS_HREF, isSmtpReady } from '../lib/sendQuote';
import { QUOTE_STATUS_LABELS, formatMoney } from '../types/fsm';
import { Plus, FileText, X } from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';

type StatusFilter = 'all' | QuoteStatus;

type QuoteListItem = QuoteWithDetails & { invoice_id: string | null; client_email: string | null };

function visibleSite(...parts: Array<string | null | undefined>): string {
  for (const part of parts) {
    const trimmed = part?.trim();
    if (trimmed && trimmed !== 'No site address') return trimmed;
  }
  return '';
}

function quoteTitle(quote: { quote_number?: number | null }): string {
  return quote.quote_number != null ? `Quote #${padQuoteNumber(quote.quote_number)}` : 'Quote';
}

function quoteMoney(total: number | string | null | undefined): string | null {
  const n = Number(total ?? 0);
  return n > 0 ? formatMoney(n) : null;
}

function useCompanySmtpReady(companyId: string | null | undefined) {
  return useQuery({
    queryKey: ['email-settings-ready', companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_settings')
        .select('smtp_host, smtp_pass, from_email')
        .eq('company_id', companyId!)
        .maybeSingle();
      if (error) throw error;
      return isSmtpReady(data);
    },
    enabled: !!companyId,
  });
}

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
  const [presetClientId, setPresetClientId] = useState<string | null>(null);
  const [sendingQuoteId, setSendingQuoteId] = useState<string | null>(null);
  const [sentQuoteId, setSentQuoteId] = useState<string | null>(null);

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
        clientIds.length ? supabase.from('clients').select('id, name, email').in('id', clientIds) : Promise.resolve({ data: [] as { id: string; name: string; email: string | null }[] }),
        jobIds.length ? supabase.from('jobs').select('id, title, address').in('id', jobIds) : Promise.resolve({ data: [] as { id: string; title: string; address: string | null }[] }),
        quoteIds.length
          ? supabase.from('invoices').select('id, quote_id, status').in('quote_id', quoteIds)
          : Promise.resolve({ data: [] as { id: string; quote_id: string; status: string }[] }),
      ]);
      const clientMap = new Map((clientsRes.data ?? []).map(c => [c.id, c]));
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
        client_name: q.client_id ? clientMap.get(q.client_id)?.name ?? null : null,
        client_email: q.client_id ? clientMap.get(q.client_id)?.email ?? null : null,
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
    const quoteId = searchParams.get('id');
    const clientId = searchParams.get('client');
    if (quoteId) {
      if (!quotes) return;
      const q = quotes.find(item => item.id === quoteId);
      if (!q) return;
      setEditingQuote(q);
      setPresetClientId(null);
      setShowForm(true);
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      next.delete('client');
      setSearchParams(next, { replace: true });
      return;
    }
    if (!clientId) return;
    setEditingQuote(null);
    setPresetClientId(clientId);
    setShowForm(true);
    const next = new URLSearchParams(searchParams);
    next.delete('client');
    setSearchParams(next, { replace: true });
  }, [searchParams, quotes, setSearchParams]);

  function openQuote(q: QuoteListItem | null) {
    setEditingQuote(q);
    setPresetClientId(null);
    setShowForm(true);
  }

  function handleSaved(opts?: { close?: boolean; message?: string; quiet?: boolean }) {
    if (opts?.close !== false) {
      setShowForm(false);
      setPresetClientId(null);
    }
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
    queryClient.invalidateQueries({ queryKey: ['client-quotes'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    if (!opts?.quiet) {
      showToast(opts?.message ?? (editingQuote ? 'Quote updated' : 'Quote created'));
    }
  }

  function handleQuoteSent(to: string) {
    setSentQuoteId(sendingQuoteId);
    setSendingQuoteId(null);
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
    queryClient.invalidateQueries({ queryKey: ['client-quotes'] });
    showToast(`Quote sent to ${to}`);
  }

  if (error) return <AppShell><PageError message="Could not load quotes" /></AppShell>;

  const filteredEmpty = !search && statusFilter === 'all';

  return (
    <AppShell>
      <div className="ops-page hub-quotes">
        <div className="ops-page-head">
          <div>
            <h1 className="ops-page-title">Quotes</h1>
          </div>
          <button onClick={() => openQuote(null)} className="btn-primary">
            <Plus size={16} /> New Quote
          </button>
        </div>

        <div className="hub-quotes-chrome">
          <SearchBar value={search} onChange={setSearch} placeholder="Search quotes, clients..." className="max-w-sm flex-1" />
          <ViewToggle mode={viewMode} onChange={setViewMode} />
          {STATUS_FILTERS.map(tab => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`hub-chrome-filter ${statusFilter === tab.key ? 'hub-chrome-filter-on' : ''}`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={filteredEmpty ? 'No quotes yet' : 'No matching quotes'}
            message={filteredEmpty
              ? 'Write a quote, send it to the client, then convert it to a job when they accept.'
              : 'Try another status or search.'}
            action={filteredEmpty ? (
              <button onClick={() => openQuote(null)} className="btn-primary">
                <Plus size={16} /> New Quote
              </button>
            ) : undefined}
          />
        ) : viewMode === 'grid' ? (
          <div className="hub-trays">
            <QuoteGroup title="Drafts" quotes={draftQuotes} onOpen={openQuote} onSend={setSendingQuoteId} />
            <QuoteGroup title="Sent — waiting" quotes={sentQuotes} onOpen={openQuote} onSend={setSendingQuoteId} />
            <QuoteGroup title="Accepted" quotes={acceptedQuotes} onOpen={openQuote} onSend={setSendingQuoteId} />
            <QuoteGroup title="Closed" quotes={closedQuotes} onOpen={openQuote} onSend={setSendingQuoteId} />
          </div>
        ) : (
          <div className="hub-stack hub-stack-tight">
            {filtered.map(q => (
              <QuoteHit key={q.id} quote={q} onOpen={() => openQuote(q)} onSend={() => setSendingQuoteId(q.id)} />
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <QuoteEditorModal
          key={editingQuote?.id ?? presetClientId ?? 'new'}
          quote={editingQuote}
          presetClientId={presetClientId}
          defaultTaxRate={company?.default_tax_rate ?? DEFAULT_TAX_RATE}
          onClose={() => { setShowForm(false); setPresetClientId(null); }}
          onSaved={handleSaved}
          onRequestSend={setSendingQuoteId}
          sentQuoteId={sentQuoteId}
        />
      )}

      {sendingQuoteId && company?.id && (
        <QuoteSendDialog
          quoteId={sendingQuoteId}
          company={{
            id: company.id,
            name: company.name,
            abn: company.abn,
            licence_number: company.licence_number,
            phone: company.phone,
            email: company.email,
            website: company.website,
            logo_url: company.logo_url,
          }}
          onClose={() => setSendingQuoteId(null)}
          onSent={handleQuoteSent}
        />
      )}
    </AppShell>
  );
}

function QuoteGroup({
  title, quotes, onOpen, onSend,
}: {
  title: string;
  quotes: QuoteListItem[];
  onOpen: (q: QuoteListItem) => void;
  onSend: (quoteId: string) => void;
}) {
  if (quotes.length === 0) return null;
  return (
    <div>
      <h2 className="hub-quotes-group">{title}</h2>
      <div className="hub-stack">
        {quotes.map(q => (
          <QuoteHit key={q.id} quote={q} onOpen={() => onOpen(q)} onSend={() => onSend(q.id)} />
        ))}
      </div>
    </div>
  );
}

function QuoteHit({ quote, onOpen, onSend }: { quote: QuoteListItem; onOpen: () => void; onSend: () => void }) {
  const site = visibleSite(quote.job_address);
  const description = quote.description?.trim() ?? '';
  const money = quoteMoney(quote.total);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="hub-row"
    >
      <div className="min-w-0 flex-1">
        <p className="hub-row-name">{quoteTitle(quote)}</p>
        {quote.client_name ? <p className="ops-meta truncate">{quote.client_name}</p> : null}
        {site ? <p className="ops-meta truncate">{site}</p> : null}
        {description ? <p className="ops-meta truncate">{description}</p> : null}
      </div>
      <div className="hub-row-signal">
        {money ? <p className="hub-signal-amount">{money}</p> : null}
        <p className="ops-meta">{QUOTE_STATUS_LABELS[quote.status]}</p>
        <div onClick={e => e.stopPropagation()}>
          <QuoteNextControl quote={quote} onSend={onSend} />
        </div>
      </div>
    </div>
  );
}

function QuoteNextControl({ quote, onSend }: { quote: QuoteListItem; onSend: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, company } = useAuth();
  const { data: smtpReady } = useCompanySmtpReady(profile?.company_id);
  const { showToast } = useToast();
  const [busy, setBusy] = useState<QuoteActionKey | null>(null);
  const next = recommendQuoteAction(quoteActionContext(quote, { smtpReady: smtpReady ?? null }));
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
    if (next.key === 'setup_email') {
      navigate(COMPANY_EMAIL_SETTINGS_HREF);
      return;
    }
    if (next.key === 'add_email' && quote.client_id) {
      navigate(`/clients/${quote.client_id}`);
      return;
    }
    if (next.key === 'send') {
      onSend();
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
      className="hub-next"
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
  scheduled_date: string;
}

function QuoteEditorModal({ quote, presetClientId, defaultTaxRate, onClose, onSaved, onRequestSend, sentQuoteId }: {
  quote: QuoteListItem | null;
  presetClientId?: string | null;
  defaultTaxRate: number;
  onClose: () => void;
  onSaved: (opts?: { close?: boolean; message?: string; quiet?: boolean }) => void;
  onRequestSend: (quoteId: string) => void;
  sentQuoteId?: string | null;
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
    client_id: quote?.client_id ?? presetClientId ?? '',
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
    scheduled_date: '',
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
  const selectedJob = jobs.find(j => j.id === form.job_id);
  const rawSubtotal = useMemo(() => calcSubtotal(form.line_items), [form.line_items]);
  const gst = useMemo(
    () => calcDocumentTotals(rawSubtotal, parseFloat(form.tax_rate) || 0),
    [rawSubtotal, form.tax_rate],
  );
  const { subtotal, taxAmount, total: grandTotal } = gst;

  const { data: smtpReady } = useCompanySmtpReady(profile?.company_id);
  const next = recommendQuoteAction({
    status: form.status,
    hasClient: !!form.client_id,
    hasLines: form.line_items.some(li => li.description.trim() && (parseFloat(li.quantity) || 0) > 0),
    hasClientEmail: !!selectedClient?.email && selectedClient.email.includes('@'),
    smtpReady: smtpReady ?? null,
    jobId: form.job_id || null,
    invoiceId,
    clientId: form.client_id || null,
  });

  useEffect(() => {
    const id = savedId ?? quote?.id;
    if (sentQuoteId && id && sentQuoteId === id) {
      setForm(f => (f.status === 'sent' ? f : { ...f, status: 'sent' }));
    }
  }, [sentQuoteId, savedId, quote?.id]);

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
      clientDetail: quoteClientDetailFromClient(selectedClient, selectedJob?.address),
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
  }, [company, form, quote, selectedClient, selectedJob, subtotal, taxAmount, grandTotal]);

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

  const persist = async (status: QuoteStatus, opts?: { close?: boolean; message?: string; quiet?: boolean }) => {
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
      onSaved({ close: opts?.close ?? false, message: opts?.message ?? 'Quote updated', quiet: opts?.quiet });
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
    onSaved({ close: opts?.close ?? true, message: opts?.message ?? 'Quote created', quiet: opts?.quiet });
    return data.id as string;
  };

  const handleSend = async () => {
    const id = await persist(form.status === 'draft' ? 'draft' : form.status, { close: false, quiet: true });
    if (!id) return;
    onRequestSend(id);
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
        scheduled_date: form.scheduled_date || null,
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

  const editorMoney = quoteMoney(grandTotal);
  const editorSite = visibleSite(selectedJob?.address, selectedClient?.address);
  const editorTitle = quote?.quote_number != null ? quoteTitle(quote) : 'New quote';

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-xl hub-quote-editor" onClick={e => e.stopPropagation()}>
        <div className="hub-quote-editor-room">
        <div className="hub-quote-editor-head">
          <div className="min-w-0">
            <h2 className="hub-quote-editor-title">{editorTitle}</h2>
            <p className="ops-meta">{QUOTE_STATUS_LABELS[form.status]}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="hub-quote-close"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="hub-quote-editor-identity">
          <div className="min-w-0">
            {selectedClient?.name ? (
              <>
                <p className="hub-quote-to-label">To</p>
                <p className="hub-quote-to-name">{selectedClient.name}</p>
              </>
            ) : null}
            <OpsSiteRow
              hub
              site={editorSite}
              phone={selectedClient?.phone}
              email={selectedClient?.email}
              mapsQuery={selectedJob?.address || selectedClient?.address}
            />
            {form.validity_date ? (
              <p className="ops-meta mt-2">Valid {format(parseISO(form.validity_date), 'd MMM yyyy')}</p>
            ) : null}
            <div className="hub-quote-editor-tools">
              {form.status === 'sent' && (
                <button
                  type="button"
                  onClick={() => void persist('declined', { close: false, message: 'Quote declined' })}
                  disabled={saving}
                  className="ops-link"
                >
                  Decline
                </button>
              )}
              {form.status === 'accepted' && invoiceId && (
                <button type="button" onClick={() => navigate(invoiceHref(invoiceId))} className="ops-link">
                  Open invoice
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                disabled={!previewData}
                className="ops-link"
              >
                Preview PDF
              </button>
            </div>
          </div>
          {editorMoney ? (
            <div className="hub-row-signal">
              <p className="hub-signal-amount">{editorMoney}</p>
              <p className="ops-meta">inc GST</p>
            </div>
          ) : null}
        </div>

        <div className="hub-quote-editor-act">
          {next.key === 'setup_email' && (
            <button type="button" onClick={() => navigate(COMPANY_EMAIL_SETTINGS_HREF)} className="btn-primary">
              Set up email
            </button>
          )}
          {next.key === 'add_email' && form.client_id && (
            <button type="button" onClick={() => navigate(`/clients/${form.client_id}`)} className="btn-primary">
              Add client email
            </button>
          )}
          {next.key === 'send' && (
            <button type="button" onClick={() => void handleSend()} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Send'}
            </button>
          )}
          {next.key === 'accept' && (
            <button
              type="button"
              onClick={() => void persist('accepted', { close: false, message: 'Quote accepted' })}
              disabled={saving}
              className="btn-primary"
            >
              {saving ? 'Saving...' : 'Mark accepted'}
            </button>
          )}
          {next.key === 'convert_job' && (
            <button type="button" onClick={() => void handleConvert()} disabled={converting} className="btn-primary">
              {converting ? 'Converting...' : 'Convert to job'}
            </button>
          )}
          {next.key === 'open_job' && (
            <button type="button" onClick={() => navigate(`/jobs/${form.job_id}`)} className="btn-primary">
              Open job
            </button>
          )}
          {next.key === 'invoice' && (
            <button type="button" onClick={() => void handleInvoice()} disabled={invoicing} className="btn-primary">
              {invoicing ? 'Creating...' : 'Create invoice'}
            </button>
          )}
        </div>
        </div>

        <div className="overlay-body hub-quote-editor-body">
          <div className="grid grid-cols-2 gap-6">
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

          <div className="hub-quote-editor-math">
            <DocumentGstTotals
              subtotal={subtotal}
              taxRate={parseFloat(form.tax_rate) || 0}
              taxAmount={taxAmount}
              total={grandTotal}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="GST rate (%)">
              <input type="number" min={0} step="0.01" value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))} className="form-input" placeholder="0" />
            </Field>
            <Field label="Valid Until">
              <input type="date" value={form.validity_date} onChange={e => setForm(f => ({ ...f, validity_date: e.target.value }))} className="form-input" />
            </Field>
          </div>

          <Field label="Job date">
            <input type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} className="form-input" />
            <p className="ops-meta mt-1">Optional. Convert to job puts this on the board. Leave blank if there is no date yet.</p>
          </Field>

          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="form-input min-h-[60px] resize-y" placeholder="Notes for the client..." />
          </Field>

          {err && <p className="text-sm text-fail">{err}</p>}
          <button type="button" onClick={() => void persist(form.status, { close: true })} disabled={saving} className="ops-link">
            {saving ? 'Saving...' : quote || savedId ? 'Save' : 'Save draft'}
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
      <label className="block ops-meta font-medium mb-1">{label}{required && <span className="text-red-500"> *</span>}</label>
      {children}
    </div>
  );
}
