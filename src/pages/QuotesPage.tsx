import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { PageError, EmptyState, SearchBar, useToast, ViewToggle, useViewMode, OpsDocHead, OpsFromTo, OpsSiteRow, OpsStatus, opsSiteLabel } from '../components/ui';
import { SkeletonRow } from '../components/ui/Skeletons';
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
import { ActionButton } from '../components/invoicing/DocNextAction';
import { linesFromQuoteItems } from '../reports/commercial/CommercialDocumentPdf';
import type { CommercialPdfData } from '../reports/commercial/CommercialDocumentPdf';
import { asStringList } from '../lib/asStringList';
import { padQuoteNumber } from '../lib/quoteJobFields';
import { commercialPdfCompanyFrom } from '../lib/companyLogo';
import { quoteClientDetailFromClient, visibleClientContacts } from '../lib/clientRecords';
import {
  jobClientEmailRow,
  jobClientEmailSaveToast,
  saveJobClientEmail,
} from '../lib/saveJobClientEmail';
import {
  jobClientPhoneRow,
  jobClientPhoneSaveToast,
  saveJobClientPhone,
} from '../lib/saveJobClientPhone';
import {
  quoteActionContext,
  quoteListBucket,
  recommendQuoteAction,
  type QuoteActionKey,
} from '../lib/quoteNextAction';
import { QUOTE_STATUS_LABELS, QUOTE_STATUS_STYLES, formatMoney } from '../types/fsm';
import { Plus, FileText, ArrowRight, Eye, Receipt, Send, Check, Mail, Phone } from 'lucide-react';
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
  const [presetClientId, setPresetClientId] = useState<string | null>(null);

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
    setPresetClientId(null);
    setShowForm(true);
  }

  function handleSaved(opts?: { close?: boolean; message?: string }) {
    if (opts?.close !== false) {
      setShowForm(false);
      setPresetClientId(null);
    }
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
    queryClient.invalidateQueries({ queryKey: ['client-quotes'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    showToast(opts?.message ?? (editingQuote ? 'Quote updated' : 'Quote created'));
  }

  if (error) return <AppShell><PageError message="Could not load quotes" /></AppShell>;

  const filteredEmpty = !search && statusFilter === 'all';

  return (
    <AppShell>
      <div className="ops-page">
        <div className="ops-page-head">
          <div>
            <h1 className="ops-page-title">Quotes</h1>
            <p className="ops-meta mt-0.5">
              {filtered.length} of {quotes?.length ?? 0} quotes
            </p>
          </div>
          <button onClick={() => openQuote(null)} className="btn-primary">
            <Plus size={16} /> New Quote
          </button>
        </div>

        <div className="ops-due-box mb-3">
          <span className="ops-meta font-semibold uppercase tracking-wide">Amount pending</span>
          <span className="ops-money text-lg">{isLoading ? '—' : formatMoney(totals.pendingValue)}</span>
        </div>

        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Search quotes, clients..." className="max-w-sm flex-1" />
          <div className="ops-tabs flex-1">
            {STATUS_FILTERS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`ops-tab ${statusFilter === tab.key ? 'ops-tab-active' : ''}`}
              >
                {tab.label}
                <span className="ml-1.5">{counts[tab.key]}</span>
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
          <div className="space-y-4">
            <QuoteGroup title="Drafts" quotes={draftQuotes} onOpen={openQuote} />
            <QuoteGroup title="Sent — waiting" quotes={sentQuotes} onOpen={openQuote} />
            <QuoteGroup title="Accepted" quotes={acceptedQuotes} onOpen={openQuote} />
            <QuoteGroup title="Closed" quotes={closedQuotes} onOpen={openQuote} />
          </div>
        ) : (
          <div className="ops-table">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-zebra text-left ops-meta font-medium uppercase tracking-wide">
                    <th className="px-3 py-2">Quote #</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Site</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Total (inc GST)</th>
                    <th className="px-3 py-2">Next</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rule">
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
          key={editingQuote?.id ?? presetClientId ?? 'new'}
          quote={editingQuote}
          presetClientId={presetClientId}
          defaultTaxRate={company?.default_tax_rate ?? DEFAULT_TAX_RATE}
          onClose={() => { setShowForm(false); setPresetClientId(null); }}
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
        <span className="ops-meta normal-case font-normal"> ({quotes.length})</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
    >
      <OpsDocHead
        kind="Quotation"
        id={`QT-${padQuoteNumber(quote.quote_number)}`}
        trailing={<OpsStatus className={QUOTE_STATUS_STYLES[quote.status]}>{QUOTE_STATUS_LABELS[quote.status]}</OpsStatus>}
      />
      <div className="ops-card-body">
        <div className="flex items-start justify-between gap-2">
          <OpsSiteRow site={opsSiteLabel(quote.job_address)} />
          <div className="shrink-0">
            <p className="ops-money">{formatMoney(Number(quote.total))}</p>
            <p className="ops-meta text-right">inc GST</p>
          </div>
        </div>
        <div className="ops-card-footer" onClick={e => e.stopPropagation()}>
          <QuoteNextControl quote={quote} />
          {next.key === 'none' && (
            <span className="ops-next-control-done">{next.label}</span>
          )}
        </div>
        {quote.client_name && (
          <p className="ops-meta mt-2 truncate">{quote.client_name}</p>
        )}
        {quote.description?.trim() && (
          <p className="ops-meta mt-0.5 truncate">{quote.description}</p>
        )}
        {quote.validity_date && (
          <p className="ops-meta mt-0.5">Valid {format(parseISO(quote.validity_date), 'd MMM yyyy')}</p>
        )}
      </div>
    </div>
  );
}

function QuoteRow({ quote, onOpen }: { quote: QuoteListItem; onOpen: () => void }) {
  const next = recommendQuoteAction(quoteActionContext(quote));
  return (
    <tr onClick={onOpen} className="hover:bg-zebra cursor-pointer transition-colors">
      <td className="px-3 py-2 font-medium text-accent">#{padQuoteNumber(quote.quote_number)}</td>
      <td className="px-3 py-2">{quote.client_name ?? <span className="ops-meta">—</span>}</td>
      <td className="px-3 py-2 max-w-[220px]">
        <p className="text-sm font-semibold text-navy truncate">{opsSiteLabel(quote.job_address)}</p>
        <p className="ops-meta truncate">{quote.description?.trim() || quote.job_title || '—'}</p>
      </td>
      <td className="px-3 py-2">
        <OpsStatus className={QUOTE_STATUS_STYLES[quote.status]}>{QUOTE_STATUS_LABELS[quote.status]}</OpsStatus>
      </td>
      <td className="px-3 py-2 text-right">
        <span className="ops-money text-base">{formatMoney(Number(quote.total))}</span>
        <span className="block ops-meta">inc GST</span>
      </td>
      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
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
      className="ops-next-control-block"
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

function QuoteEditorModal({ quote, presetClientId, defaultTaxRate, onClose, onSaved }: {
  quote: QuoteListItem | null;
  presetClientId?: string | null;
  defaultTaxRate: number;
  onClose: () => void;
  onSaved: (opts?: { close?: boolean; message?: string }) => void;
}) {
  const { profile, company } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [writtenClientEmail, setWrittenClientEmail] = useState<{ clientId: string; email: string | null } | null>(null);
  const [clientEmailDraft, setClientEmailDraft] = useState('');
  const [writtenClientPhone, setWrittenClientPhone] = useState<{ clientId: string; phone: string | null } | null>(null);
  const [clientPhoneDraft, setClientPhoneDraft] = useState('');
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
  const emailClientBase = selectedClient ?? null;
  const emailClient = emailClientBase && writtenClientEmail?.clientId === emailClientBase.id
    ? { ...emailClientBase, email: writtenClientEmail.email }
    : emailClientBase;
  const emailRow = jobClientEmailRow({ clientId: form.client_id || null, client: emailClient });
  const phoneClientBase = selectedClient ?? null;
  const phoneClient = phoneClientBase && writtenClientPhone?.clientId === phoneClientBase.id
    ? { ...phoneClientBase, phone: writtenClientPhone.phone }
    : phoneClientBase;
  const phoneRow = jobClientPhoneRow({ clientId: form.client_id || null, client: phoneClient });
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

  useEffect(() => {
    setClientEmailDraft(emailClient?.email ?? '');
  }, [emailClient?.id, emailClient?.email]);

  useEffect(() => {
    setClientPhoneDraft(phoneClient?.phone ?? '');
  }, [phoneClient?.id, phoneClient?.phone]);

  const saveClientEmail = useMutation({
    mutationFn: async () => {
      return saveJobClientEmail({
        clientId: form.client_id || null,
        email: clientEmailDraft,
      });
    },
    onSuccess: (result) => {
      setWrittenClientEmail({ clientId: result.clientId, email: result.email });
      setClients(cs => cs.map(c => c.id === result.clientId ? { ...c, email: result.email } : c));
      setClientEmailDraft(result.email ?? '');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      const toast = jobClientEmailSaveToast(result.email);
      showToast(toast.message, toast.kind);
    },
    onError: (e: Error) => showToast(e.message, 'info'),
  });

  const saveClientPhone = useMutation({
    mutationFn: async () => {
      return saveJobClientPhone({
        clientId: form.client_id || null,
        phone: clientPhoneDraft,
      });
    },
    onSuccess: (result) => {
      setWrittenClientPhone({ clientId: result.clientId, phone: result.phone });
      setClients(cs => cs.map(c => c.id === result.clientId ? { ...c, phone: result.phone } : c));
      setClientPhoneDraft(result.phone ?? '');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      const toast = jobClientPhoneSaveToast(result.phone);
      showToast(toast.message, toast.kind);
    },
    onError: (e: Error) => showToast(e.message, 'info'),
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
      clientDetail: quoteClientDetailFromClient(
        selectedClient
          ? { ...selectedClient, email: emailClient?.email ?? selectedClient.email, phone: phoneClient?.phone ?? selectedClient.phone }
          : selectedClient,
        selectedJob?.address,
      ),
      company: commercialPdfCompanyFrom(company),
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
  }, [company, form, quote, selectedClient, emailClient, phoneClient, selectedJob, subtotal, taxAmount, grandTotal]);

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

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-xl ops-doc-panel hub-quote-editor" onClick={e => e.stopPropagation()}>
        <OpsDocHead
          kind="Quotation"
          id={quote?.quote_number != null ? `QT-${padQuoteNumber(quote.quote_number)}` : 'QT-DRAFT'}
          meta={form.validity_date ? `Valid ${format(parseISO(form.validity_date), 'd MMM yyyy')}` : undefined}
          trailing={<OpsStatus className={QUOTE_STATUS_STYLES[form.status]}>{QUOTE_STATUS_LABELS[form.status]}</OpsStatus>}
          onClose={onClose}
        />

        <div className="px-4 border-b border-rule">
          <OpsFromTo
            fromName={company?.name ?? 'Your company'}
            fromDetail={[company?.abn ? `ABN ${company.abn}` : null, company?.licence_number ? `Licence ${company.licence_number}` : null].filter(Boolean).join(' · ') || null}
            toName={selectedClient?.name ?? 'Select a client'}
            toDetail={quoteClientDetailFromClient(
              selectedClient
                ? { ...selectedClient, email: emailClient?.email ?? selectedClient.email, phone: phoneClient?.phone ?? selectedClient.phone }
                : selectedClient,
              selectedJob?.address,
            )}
          />
          <div className="flex items-start justify-between gap-2 py-3">
            <OpsSiteRow
              hub
              site={opsSiteLabel(selectedJob?.address, selectedClient?.address)}
              phone={phoneClient?.phone}
              email={emailClient?.email}
              mapsQuery={selectedJob?.address || selectedClient?.address}
            />
            <div className="shrink-0">
              <p className="ops-money text-lg">{formatMoney(grandTotal)}</p>
              <p className="ops-meta text-right">inc GST</p>
            </div>
          </div>
          {form.description.trim() && <p className="ops-hub-title pb-3">{form.description.trim()}</p>}
          {next.key !== 'none' && next.key !== 'open_invoice' && (
            <div className="mt-2 pb-3">
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
              {next.key === 'convert_job' && (
                <ActionButton recommended onClick={() => void handleConvert()} disabled={converting}>
                  <ArrowRight size={14} /> {converting ? 'Converting...' : 'Convert to job'}
                </ActionButton>
              )}
              {next.key === 'open_job' && (
                <ActionButton recommended onClick={() => navigate(`/jobs/${form.job_id}`)}>
                  <ArrowRight size={14} /> Open job
                </ActionButton>
              )}
              {next.key === 'invoice' && (
                <ActionButton recommended onClick={() => void handleInvoice()} disabled={invoicing}>
                  <Receipt size={14} /> {invoicing ? 'Creating...' : 'Create invoice'}
                </ActionButton>
              )}
            </div>
          )}
        </div>

        <div className="px-3 py-2 border-b border-rule flex flex-wrap gap-2">
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
          {form.status === 'accepted' && invoiceId && (
            <ActionButton recommended={false} onClick={() => navigate(invoiceHref(invoiceId))}>
              <Receipt size={14} /> Open invoice
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
          <div className="grid grid-cols-2 gap-3">
            <Field label="Client" required>
              <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value, job_id: '' }))} className="form-input cursor-pointer">
                <option value="">Select a client...</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {selectedClient && (
                <div className="mt-2 flex flex-col gap-1">
                  {visibleClientContacts(emailClient ?? selectedClient).filter(line => line.kind !== 'mailto' && line.kind !== 'tel').map(line => (
                    <a
                      key={line.kind}
                      href={line.href}
                      className="ops-link text-xs truncate"
                      target={line.kind === 'map' ? '_blank' : undefined}
                      rel={line.kind === 'map' ? 'noreferrer' : undefined}
                    >
                      {line.label}
                    </a>
                  ))}
                  {phoneRow.kind === 'tel' && (
                    <a href={`tel:${phoneRow.phone}`} className="job-client-phone-num">
                      <Phone size={13} /> {phoneRow.phone}
                    </a>
                  )}
                  {phoneRow.kind === 'edit' && (
                    <form
                      className="job-client-phone"
                      onSubmit={e => {
                        e.preventDefault();
                        saveClientPhone.mutate();
                      }}
                    >
                      <Phone size={13} />
                      <input
                        type="tel"
                        value={clientPhoneDraft}
                        onChange={e => setClientPhoneDraft(e.target.value)}
                        placeholder="Phone"
                        className="form-input-sm"
                        aria-label="Client phone"
                        autoComplete="tel"
                        inputMode="tel"
                      />
                      <button
                        type="submit"
                        className="job-client-phone-save"
                        disabled={saveClientPhone.isPending}
                      >
                        Save
                      </button>
                    </form>
                  )}
                  {emailRow.kind === 'mailto' && (
                    <a href={`mailto:${emailRow.email}`} className="job-client-email-addr">
                      <Mail size={13} /> {emailRow.email}
                    </a>
                  )}
                  {emailRow.kind === 'edit' && (
                    <form
                      className="job-client-email"
                      onSubmit={e => {
                        e.preventDefault();
                        saveClientEmail.mutate();
                      }}
                    >
                      <Mail size={13} />
                      <input
                        type="email"
                        value={clientEmailDraft}
                        onChange={e => setClientEmailDraft(e.target.value)}
                        placeholder="Email"
                        className="form-input-sm"
                        aria-label="Client email"
                        autoComplete="email"
                      />
                      <button
                        type="submit"
                        className="job-client-email-save"
                        disabled={saveClientEmail.isPending}
                      >
                        Save
                      </button>
                    </form>
                  )}
                </div>
              )}
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

          <Field label="Job date">
            <input type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} className="form-input" />
            <p className="ops-meta mt-1">Optional. Convert to job puts this on the board. Leave blank if there is no date yet.</p>
          </Field>

          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="form-input min-h-[60px] resize-y" placeholder="Notes for the client..." />
          </Field>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="ops-sticky flex flex-col gap-2">
          {next.key === 'send' && (
            <ActionButton recommended onClick={() => void persist('sent', { close: false, message: 'Quote marked as sent' })} disabled={saving}>
              <Send size={14} /> {saving ? 'Saving...' : 'Send'}
            </ActionButton>
          )}
          <div className="flex items-center gap-2">
            <button onClick={() => void persist(form.status, { close: true })} disabled={saving} className="btn-secondary">
              {saving ? 'Saving...' : quote || savedId ? 'Save' : 'Save draft'}
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
