import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { AppShell } from '../components/layout/AppShell';
import { PageError, EmptyState, SearchBar, useToast, OpsSiteRow, LoadingSpinner } from '../components/ui';
import type { QuoteWithDetails, QuoteLineItem, QuoteStatus, StockItem, PriceBookItem } from '../types/fsm';
import type { Client, Job } from '../types/crm';
import { convertQuoteToJob } from '../lib/convertQuoteToJob';
import { convertQuoteToInvoice } from '../lib/convertQuoteToInvoice';
import { invoiceHref, invoiceLandingPath, pickReusableInvoice } from '../lib/invoiceFromQuote';
import { calcDocumentTotals, DEFAULT_TAX_RATE, gstLabel } from '../lib/gst';
import { LineItemEditor, emptyLineItem, toEditLine, calcSubtotal, type EditLineItem } from '../components/invoicing/LineItemEditor';
import { DocumentVariationsEditor } from '../components/invoicing/DocumentVariationsEditor';
import { DocumentGstTotals } from '../components/invoicing/DocumentGstTotals';
import { CommercialPdfPreviewModal } from '../components/invoicing/CommercialPdfPreviewModal';
import { QuoteSendDialog } from '../components/invoicing/QuoteSendDialog';
import { quoteSendCompanyFrom } from '../lib/sendQuote';
import { linesFromQuoteItems } from '../reports/commercial/CommercialDocumentPdf';
import type { CommercialPdfData } from '../reports/commercial/CommercialDocumentPdf';
import { asStringList } from '../lib/asStringList';
import { padQuoteNumber } from '../lib/quoteJobFields';
import { commercialPdfCompanyFrom, companyDocumentLogoUrl } from '../lib/companyLogo';
import { quoteClientDetailFromClient } from '../lib/clientRecords';
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
  QUOTE_CLIENT_ATTACH_NO_CLIENTS,
  attachQuoteClient,
  quoteClientAttachRow,
  quoteClientAttachToast,
} from '../lib/attachQuoteClient';
import {
  quoteActionContext,
  recommendQuoteAction,
  type QuoteActionKey,
} from '../lib/quoteNextAction';
import { QUOTE_STATUS_LABELS, formatMoney } from '../types/fsm';
import { Plus, FileText, Mail, Phone, User, X, MoreHorizontal } from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';

type StatusFilter = 'all' | QuoteStatus;

type QuoteListItem = QuoteWithDetails & { invoice_id: string | null; client_email?: string | null };

function visibleSite(...parts: Array<string | null | undefined>): string {
  for (const part of parts) {
    const trimmed = part?.trim();
    if (trimmed && trimmed !== 'No site address') return trimmed;
  }
  return '';
}

function suburbFromSite(site: string): string {
  const parts = site.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return site;
  const loc = parts[1].replace(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b.*$/i, '').trim();
  return loc || parts[1];
}

function quoteRef(quote: { quote_number?: number | null }): string {
  return quote.quote_number != null ? `#${padQuoteNumber(quote.quote_number)}` : 'Quote';
}

function quoteTitle(quote: { quote_number?: number | null } | null): string {
  return quote?.quote_number != null ? `Quote ${quoteRef(quote)}` : 'New quote';
}

function quoteMoney(total: number | string | null | undefined): string | null {
  const n = Number(total ?? 0);
  return n > 0 ? formatMoney(n) : null;
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
  const [searchParams, setSearchParams] = useSearchParams();
  const [presetClientId, setPresetClientId] = useState<string | null>(null);
  const [sendingQuoteId, setSendingQuoteId] = useState<string | null>(null);
  const sendCompany = quoteSendCompanyFrom(company);

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

  function handleSaved(opts?: { close?: boolean; message?: string }) {
    if (opts?.close !== false) {
      setShowForm(false);
      setPresetClientId(null);
    }
    queryClient.invalidateQueries({ queryKey: ['quotes'] });
    queryClient.invalidateQueries({ queryKey: ['client-quotes'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    if (opts?.message !== '') {
      showToast(opts?.message ?? (editingQuote ? 'Quote updated' : 'Quote created'));
    }
  }

  if (pageQueryBlocked(error)) return <AppShell><PageError message="Could not load quotes" /></AppShell>;

  const filteredEmpty = !search && statusFilter === 'all';

  return (
    <AppShell>
      <div className="ops-page hub-quotes">
        <div className="ops-page-head">
          <div>
            <p className="hub-quote-kicker">Quotations</p>
            <h1 className="ops-page-title">Quotes</h1>
          </div>
          <button onClick={() => openQuote(null)} className="btn-primary">
            <Plus size={16} /> New quote
          </button>
        </div>

        <div className="hub-quotes-chrome">
          <div className="hub-quotes-filters">
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
          <SearchBar value={search} onChange={setSearch} placeholder="Search quotes or clients..." className="max-w-sm" />
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
                <Plus size={16} /> Write a quote
              </button>
            ) : undefined}
          />
        ) : (
          <div className="hub-quotes-sheet">
            <div className="hub-quotes-thead">
              <span>#</span>
              <span>Customer</span>
              <span>Suburb</span>
              <span>Status</span>
              <span>Total inc GST</span>
              <span />
            </div>
            {filtered.map(q => (
              <QuoteRow key={q.id} quote={q} onOpen={() => openQuote(q)} onSend={setSendingQuoteId} />
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
        />
      )}

      {sendingQuoteId && sendCompany && (
        <QuoteSendDialog
          quoteId={sendingQuoteId}
          company={sendCompany}
          onClose={() => setSendingQuoteId(null)}
          onSent={(to, message) => {
            setSendingQuoteId(null);
            queryClient.invalidateQueries({ queryKey: ['quotes'] });
            queryClient.invalidateQueries({ queryKey: ['client-quotes'] });
            if (editingQuote?.id === sendingQuoteId) {
              setEditingQuote(q => q ? { ...q, status: 'sent' } : q);
            }
            showToast(message ?? `Quote sent to ${to}`);
          }}
        />
      )}
    </AppShell>
  );
}

function QuoteRow({ quote, onOpen, onSend }: { quote: QuoteListItem; onOpen: () => void; onSend: (quoteId: string) => void }) {
  const next = recommendQuoteAction(quoteActionContext(quote));
  const site = visibleSite(quote.job_address);
  const suburb = site ? suburbFromSite(site) : '';
  const money = quoteMoney(quote.total);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="hub-quotes-row"
    >
      <span className="hub-quotes-ref">{quoteRef(quote)}</span>
      <span className="truncate">{quote.client_name || ''}</span>
      <span className="truncate hub-quotes-muted">{suburb}</span>
      <span className={`hub-quotes-pill is-${quote.status}`}>{QUOTE_STATUS_LABELS[quote.status]}</span>
      <span className="hub-quotes-total">{money ?? ''}</span>
      <span className="hub-quotes-row-next" onClick={e => e.stopPropagation()}>
        {next.key === 'none' ? (
          <span className="hub-quotes-muted">{next.label}</span>
        ) : (
          <QuoteNextControl quote={quote} onOpen={onOpen} onSend={onSend} />
        )}
      </span>
    </div>
  );
}

function QuoteNextControl({ quote, onOpen, onSend }: { quote: QuoteListItem; onOpen: () => void; onSend: (quoteId: string) => void }) {
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
    if (next.key === 'add_email') {
      onOpen();
      return;
    }
    if (next.key === 'send') {
      onSend(quote.id);
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
      className={next.key === 'send' ? 'btn-primary' : 'hub-next'}
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

function QuoteEditorModal({ quote, presetClientId, defaultTaxRate, onClose, onSaved, onRequestSend }: {
  quote: QuoteListItem | null;
  presetClientId?: string | null;
  defaultTaxRate: number;
  onClose: () => void;
  onSaved: (opts?: { close?: boolean; message?: string }) => void;
  onRequestSend: (quoteId: string) => void;
}) {
  const { profile, company } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [writtenClientEmail, setWrittenClientEmail] = useState<{ clientId: string; email: string | null } | null>(null);
  const [clientEmailDraft, setClientEmailDraft] = useState('');
  const [writtenClientPhone, setWrittenClientPhone] = useState<{ clientId: string; phone: string | null } | null>(null);
  const [clientPhoneDraft, setClientPhoneDraft] = useState('');
  const [clientAttachDraft, setClientAttachDraft] = useState('');
  const [jobs, setJobs] = useState<Job[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [priceBookItems, setPriceBookItems] = useState<PriceBookItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showEdit, setShowEdit] = useState(!quote);
  const [err, setErr] = useState('');
  const [savedId, setSavedId] = useState<string | null>(quote?.id ?? null);
  const [invoiceId, setInvoiceId] = useState<string | null>(quote?.invoice_id ?? null);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);

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
      setClientsLoaded(true);
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
  const quoteId = savedId ?? quote?.id ?? null;
  const attachRow = quoteClientAttachRow({
    quoteClientId: form.client_id || null,
    companyClients: form.client_id
      ? []
      : (!quoteId || !clientsLoaded)
        ? null
        : clients,
  });
  const rawSubtotal = useMemo(() => calcSubtotal(form.line_items), [form.line_items]);
  const gst = useMemo(
    () => calcDocumentTotals(rawSubtotal, parseFloat(form.tax_rate) || 0),
    [rawSubtotal, form.tax_rate],
  );
  const { subtotal, taxAmount, total: grandTotal } = gst;

  const next = recommendQuoteAction(quoteActionContext({
    status: form.status,
    client_id: form.client_id || null,
    client_email: emailClient?.email,
    line_items: form.line_items,
    job_id: form.job_id || null,
    invoice_id: invoiceId,
  }));

  useEffect(() => {
    setClientEmailDraft(emailClient?.email ?? '');
  }, [emailClient?.id, emailClient?.email]);

  useEffect(() => {
    setClientPhoneDraft(phoneClient?.phone ?? '');
  }, [phoneClient?.id, phoneClient?.phone]);

  useEffect(() => {
    if (quote?.status === 'sent' && form.status === 'draft') {
      setForm(f => ({ ...f, status: 'sent' }));
    }
  }, [quote?.status, form.status]);

  const attachClient = useMutation({
    mutationFn: async () => {
      return attachQuoteClient({
        quoteId: savedId ?? quote?.id,
        quoteClientId: form.client_id || null,
        clientId: clientAttachDraft,
        companyClients: clients,
      });
    },
    onSuccess: (result) => {
      setForm(f => ({ ...f, client_id: result.clientId, job_id: '' }));
      setClientAttachDraft('');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      const toast = quoteClientAttachToast();
      showToast(toast.message, toast.kind);
    },
    onError: (e: Error) => showToast(e.message, 'info'),
  });

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

  const startSend = async () => {
    const id = await persist('draft', { close: false, message: '' });
    if (id) onRequestSend(id);
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
  const editorTitle = quoteTitle(quote);
  const sheetLogo = companyDocumentLogoUrl(company);
  const docLines = form.line_items.filter(li => li.description.trim() && (parseFloat(li.quantity) || 0) > 0);

  const closeMore = () => {
    if (moreRef.current) moreRef.current.open = false;
  };

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!moreRef.current?.open) return;
      if (!moreRef.current.contains(event.target as Node)) closeMore();
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, []);

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-xl hub-quote-editor" onClick={e => e.stopPropagation()}>
        <div className="hub-quote-toolbar">
          <div className="hub-quote-editor-act">
            {next.key === 'add_email' && (
              <button
                type="button"
                className="btn-primary"
                title={next.detail}
                onClick={() => emailInputRef.current?.focus()}
              >
                {next.label}
              </button>
            )}
            {next.key === 'send' && (
              <button type="button" onClick={() => void startSend()} disabled={saving} className="btn-primary">
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
            <details ref={moreRef} className="hub-quote-more">
              <summary aria-label="More actions">
                <MoreHorizontal size={18} />
              </summary>
              <div className="hub-quote-more-menu" role="menu">
                {form.status === 'sent' && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { closeMore(); void persist('declined', { close: false, message: 'Quote declined' }); }}
                    disabled={saving}
                  >
                    Decline
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { closeMore(); setShowPreview(true); }}
                  disabled={!previewData}
                >
                  Preview PDF
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { closeMore(); void persist(form.status, { close: true }); }}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : quote || savedId ? 'Save' : 'Save draft'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { closeMore(); setShowEdit(true); }}
                >
                  Edit quote
                </button>
                {next.key === 'convert_job' && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { closeMore(); void handleConvert(); }}
                    disabled={converting}
                  >
                    {converting ? 'Converting...' : 'Convert to job'}
                  </button>
                )}
                {next.key === 'open_job' && form.job_id && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { closeMore(); navigate(`/jobs/${form.job_id}`); }}
                  >
                    Open job
                  </button>
                )}
                {next.key === 'invoice' && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { closeMore(); void handleInvoice(); }}
                    disabled={invoicing}
                  >
                    {invoicing ? 'Creating...' : 'Create invoice'}
                  </button>
                )}
                {form.status === 'accepted' && invoiceId && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { closeMore(); navigate(invoiceHref(invoiceId)); }}
                  >
                    Open invoice
                  </button>
                )}
              </div>
            </details>
            <button type="button" onClick={onClose} className="hub-quote-close" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>
        {err ? <p className="hub-quote-err">{err}</p> : null}

        <div className="hub-quote-sheet">
          <div className="hub-quote-banner">
            <p className="hub-quote-kicker">Quotation</p>
            <h2 className="hub-quote-editor-title">{editorTitle}</h2>
            <p className="hub-quote-banner-meta">
              {QUOTE_STATUS_LABELS[form.status]}
              {form.validity_date ? ` · Valid ${format(parseISO(form.validity_date), 'd MMM yyyy')}` : ''}
            </p>
          </div>

          <div className="hub-quote-letterhead">
            <div className="min-w-0">
              {sheetLogo ? (
                <img src={sheetLogo} alt="" className="hub-quote-letterhead-mark" />
              ) : null}
              <p className="hub-quote-kicker">From</p>
              <p className="hub-quote-from-name">{company?.name ?? 'Your company'}</p>
              {company?.abn ? <p className="hub-quote-muted">ABN {company.abn}</p> : null}
              {company?.licence_number ? <p className="hub-quote-muted">Lic {company.licence_number}</p> : null}
            </div>
            <div className="min-w-0">
              <p className="hub-quote-kicker">To</p>
              {attachRow.kind === 'pick' ? (
                <form
                  className="job-client-attach"
                  onSubmit={e => {
                    e.preventDefault();
                    attachClient.mutate();
                  }}
                >
                  <User size={13} />
                  <select
                    value={clientAttachDraft}
                    onChange={e => setClientAttachDraft(e.target.value)}
                    className="form-input-sm"
                    aria-label="Attach client"
                  >
                    <option value="">Client</option>
                    {attachRow.clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="job-client-attach-save"
                    disabled={attachClient.isPending || !clientAttachDraft}
                  >
                    Save
                  </button>
                </form>
              ) : attachRow.kind === 'miss' ? (
                <p className="hub-quote-muted">{QUOTE_CLIENT_ATTACH_NO_CLIENTS}</p>
              ) : (
                <>
                  {selectedClient?.name ? <p className="hub-quote-to-name">{selectedClient.name}</p> : <p className="hub-quote-muted">Select a client</p>}
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
                        ref={emailInputRef}
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
                </>
              )}
              <OpsSiteRow
                hub
                site={editorSite}
                mapsQuery={selectedJob?.address || selectedClient?.address}
              />
            </div>
          </div>

          {form.description.trim() ? (
            <p className="hub-quote-scope">{form.description.trim()}</p>
          ) : null}

          <div className="hub-quote-table">
            <table className="hub-quote-lines">
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {docLines.map((li, idx) => {
                  const qty = parseFloat(li.quantity) || 0;
                  const unit = parseFloat(li.unit_price) || 0;
                  return (
                    <tr key={`${li.description}-${idx}`}>
                      <td>{li.description}</td>
                      <td className="hub-quote-num">{qty}</td>
                      <td className="hub-quote-num">{formatMoney(unit)}</td>
                      <td className="hub-quote-num">{formatMoney(qty * unit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="hub-quote-gst">
            <span>Subtotal (ex GST)</span>
            <span className="hub-quote-num">{formatMoney(subtotal)}</span>
            <span>{gstLabel(parseFloat(form.tax_rate) || 0)}</span>
            <span className="hub-quote-num">{formatMoney(taxAmount)}</span>
          </div>
          {editorMoney ? (
            <div className="hub-quote-totalbar">
              <span>Total (inc GST)</span>
              <span className="hub-quote-display-total">{editorMoney}</span>
            </div>
          ) : null}
        </div>

        {showEdit ? (
        <div className="hub-quote-edit">
        <div className="overlay-body hub-quote-editor-body">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="GST rate (%)">
              <input type="number" min={0} step="0.01" value={form.tax_rate} onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))} className="form-input" placeholder="0" />
            </Field>
            <Field label="Valid Until">
              <input type="date" value={form.validity_date} onChange={e => setForm(f => ({ ...f, validity_date: e.target.value }))} className="form-input" />
            </Field>
          </div>

          <Field label="Job date">
            <input type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} className="form-input" />
            <p className="hub-quote-muted mt-1">Optional. Convert to job puts this on the board. Leave blank if there is no date yet.</p>
          </Field>

          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="form-input min-h-[60px] resize-y" placeholder="Notes for the client..." />
          </Field>
        </div>
        </div>
        ) : null}
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
