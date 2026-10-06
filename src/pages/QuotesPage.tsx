import { useState, useMemo, useEffect, useRef, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import {
  DEV_AUDIT_COMPANY,
  DEV_AUDIT_PROFILE,
  isDevFieldAuditAuth,
  pageQueryBlocked,
} from '../lib/devFieldAuditAuth';
import {
  AUDIT_DOC_CLIENT_ID,
  AUDIT_QUOTE_ID,
  getAuditClients,
  getAuditTeamMembers,
} from '../lib/devFieldAuditDocs';
import { AppShell } from '../components/layout/AppShell';
import { AppDialog, EditorStickyFooter, PageError, EmptyState, SearchBar, useToast, OpsSiteRow, LoadingSpinner } from '../components/ui';
import type { QuoteWithDetails, QuoteLineItem, QuoteStatus, StockItem, PriceBookItem } from '../types/fsm';
import type { Client, Job } from '../types/crm';
import { convertQuoteToJob } from '../lib/convertQuoteToJob';
import { afterDialogInitialFocus } from '../lib/dialogFocus';
import {
  CONVERT_QUOTE_BLOCKED,
  CONVERT_QUOTE_NEED_DATE_CREW,
  assignedTeamFromQuote,
  focusQuoteConvertDate,
  quoteConvertTap,
  releaseQuoteConvertLock,
  takeQuoteConvertLock,
} from '../lib/quoteJobFields';
import { convertQuoteToInvoice } from '../lib/convertQuoteToInvoice';
import {
  invoiceHref,
  invoiceLandingPath,
  invoiceReuseOpen,
  quoteListInvoiceId,
} from '../lib/invoiceFromQuote';
import { calcLineDocumentTotals, DEFAULT_TAX_RATE, gstDocumentLabel } from '../lib/gst';
import { LineItemEditor, emptyLineItem, toEditLine, type EditLineItem } from '../components/invoicing/LineItemEditor';
import { DocumentVariationsEditor } from '../components/invoicing/DocumentVariationsEditor';
import { DocumentGstTotals } from '../components/invoicing/DocumentGstTotals';
import { CommercialPdfPreviewModal } from '../components/invoicing/CommercialPdfPreviewModal';
import { QuoteChaseDialog } from '../components/invoicing/QuoteChaseDialog';
import { QuoteSendDialog } from '../components/invoicing/QuoteSendDialog';
import { quoteSendCompanyFrom } from '../lib/sendQuote';
import {
  documentShareCopyErrorToast,
  documentShareOrigin,
  documentShareManualCopyToast,
} from '../lib/documentShare';
import { DocumentShareManualLink } from '../components/invoicing/DocumentShareManualLink';
import { copyShareText, prepareDocumentShareLink } from '../lib/documentShareDeliver';
import { commercialPdfPreviewData, linesFromQuoteItems } from '../reports/commercial/CommercialDocumentPdf';
import type { CommercialPdfData } from '../reports/commercial/CommercialDocumentPdf';
import { asStringList } from '../lib/asStringList';
import { checkPriceSendBlock, quoteListMoney } from '../lib/checkPriceGate';
import { listQueryBusy } from '../lib/listQueryReady';
import { padQuoteNumber } from '../lib/quoteJobFields';
import {
  commercialPdfCompanyFrom,
  companyDocumentLogoUrl,
  companyWithLetterheadLookMark,
  LETTERHEAD_LOOK,
} from '../lib/companyLogo';
import { CompanyLetterheadMark } from '../lib/CompanyLetterheadMark';
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
  QUOTES_LIST_QUERY_KEY,
  quoteActionContext,
  quoteMarkAcceptedWrite,
  quotesAfterSave,
  recommendQuoteAction,
  type QuoteActionKey,
  type QuotesListSavePatch,
} from '../lib/quoteNextAction';
import {
  QUOTE_CHASE_FILTER,
  quoteChase,
  quoteChaseChipLabel,
  quoteChaseFilterLabel,
  quoteChasePatch,
  quoteOnChaseList,
} from '../lib/nudges';
import { QUOTE_STATUS_LABELS, formatMoney } from '../types/fsm';
import { Plus, FileText, Mail, Phone, User, X, MoreHorizontal, Mic } from 'lucide-react';
import {
  browserSpeechRecognition,
  insertQuickQuoteDraft,
  QUICK_QUOTE_CHECK_PRICE,
  quickQuoteInsertRow,
  transcriptFromSpeechEvent,
  type QuickSpeechRecognition,
} from '../lib/quickQuote';
import { format, parseISO, addDays } from 'date-fns';

type StatusFilter = 'all' | typeof QUOTE_CHASE_FILTER | QuoteStatus;

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

function fieldAuditConvertQuote(): QuoteListItem | null {
  if (!isDevFieldAuditAuth()) return null;
  return {
    id: 'audit-quote-convert',
    company_id: DEV_AUDIT_COMPANY.id,
    quote_number: 2002,
    client_id: AUDIT_DOC_CLIENT_ID,
    job_id: null,
    status: 'accepted',
    description: 'Quoted site works',
    scope_of_works: 'Labour and materials on site.',
    line_items: [{ description: 'Site labour', quantity: 8, unit_price: 95 }],
    subtotal: 760,
    tax_rate: 10,
    tax_amount: 76,
    total: 836,
    validity_date: '2026-09-07',
    notes: null,
    inclusions: [],
    exclusions: [],
    scheduled_date: '2026-09-03',
    assigned_team: [DEV_AUDIT_PROFILE.id],
    created_by: DEV_AUDIT_PROFILE.id,
    created_at: '2026-08-24T00:00:00.000Z',
    updated_at: '2026-08-24T00:00:00.000Z',
    client_name: 'Northside Electrical',
    client_email: 'accounts@northside.example',
    job_title: null,
    job_address: null,
    invoice_id: null,
  };
}

function fieldAuditGstQuote(): QuoteListItem | null {
  if (!isDevFieldAuditAuth()) return null;
  return {
    id: 'audit-quote-gst',
    company_id: DEV_AUDIT_COMPANY.id,
    quote_number: 2003,
    client_id: AUDIT_DOC_CLIENT_ID,
    job_id: null,
    status: 'draft',
    description: 'Mixed GST rates',
    scope_of_works: 'One taxed line and one GST-free line.',
    line_items: [
      { description: 'mystery widgets', quantity: 2, unit_price: 0, check_price: true },
      { description: 'Taxed labour', quantity: 1, unit_price: 100, gst_rate: 10 },
      { description: 'GST-free fitting delete ok', quantity: 1, unit_price: 50, gst_rate: 0 },
    ],
    subtotal: 150,
    tax_rate: 10,
    tax_amount: 10,
    total: 160,
    validity_date: '2026-09-07',
    notes: null,
    inclusions: [],
    exclusions: [],
    scheduled_date: null,
    assigned_team: [],
    created_by: DEV_AUDIT_PROFILE.id,
    created_at: '2026-08-24T00:00:00.000Z',
    updated_at: '2026-08-24T00:00:00.000Z',
    client_name: 'Northside Electrical',
    client_email: 'accounts@northside.example',
    job_title: null,
    job_address: null,
    invoice_id: null,
  };
}

function fieldAuditChaseQuotes(): QuoteListItem[] {
  if (!isDevFieldAuditAuth()) return [];
  const base = {
    company_id: DEV_AUDIT_COMPANY.id,
    client_id: AUDIT_DOC_CLIENT_ID,
    job_id: null,
    scope_of_works: 'Complete the agreed site works.',
    line_items: [{ description: 'Site labour', quantity: 8, unit_price: 95 }],
    subtotal: 760,
    tax_rate: 10,
    tax_amount: 76,
    total: 836,
    validity_date: '2026-10-20',
    notes: null,
    inclusions: [] as string[],
    exclusions: [] as string[],
    scheduled_date: null,
    assigned_team: [] as string[],
    created_by: DEV_AUDIT_PROFILE.id,
    created_at: '2026-09-28T00:00:00.000Z',
    updated_at: '2026-10-05T00:00:00.000Z',
    client_name: 'Northside Electrical',
    client_email: 'accounts@northside.example',
    job_title: null,
    job_address: null,
    invoice_id: null,
    chased_at: null as string | null,
  };
  return [
    {
      ...base,
      id: 'audit-quote-chase',
      quote_number: 2004,
      status: 'sent',
      description: 'Workshop follow-up',
      sent_at: '2026-09-28T00:00:00.000Z',
    },
    {
      ...base,
      id: 'audit-quote-chase-two',
      quote_number: 2006,
      status: 'sent',
      description: 'Second quiet quote',
      sent_at: '2026-09-30T00:00:00.000Z',
    },
    {
      ...base,
      id: 'audit-quote-fresh-sent',
      quote_number: 2005,
      status: 'sent',
      description: 'Sent yesterday',
      sent_at: '2026-10-04T00:00:00.000Z',
    },
  ];
}

function fieldAuditShareQuote(): QuoteListItem | null {
  if (!isDevFieldAuditAuth()) return null;
  return {
    id: AUDIT_QUOTE_ID,
    company_id: DEV_AUDIT_COMPANY.id,
    quote_number: 2001,
    client_id: AUDIT_DOC_CLIENT_ID,
    job_id: null,
    status: 'draft',
    description: 'Workshop fit-out',
    scope_of_works: 'Complete the agreed site works.',
    line_items: [{ description: 'Site labour', quantity: 8, unit_price: 95 }],
    subtotal: 760,
    tax_rate: 10,
    tax_amount: 76,
    total: 836,
    validity_date: '2026-09-07',
    notes: null,
    inclusions: [],
    exclusions: [],
    scheduled_date: null,
    assigned_team: [],
    created_by: DEV_AUDIT_PROFILE.id,
    created_at: '2026-08-24T00:00:00.000Z',
    updated_at: '2026-08-24T00:00:00.000Z',
    client_name: 'Northside Electrical',
    client_email: 'accounts@northside.example',
    job_title: null,
    job_address: null,
    invoice_id: null,
  };
}

function quoteTitle(quote: { quote_number?: number | null } | null): string {
  return quote?.quote_number != null ? `Quote ${quoteRef(quote)}` : 'New quote';
}

function quoteMoney(total: number | string | null | undefined): string | null {
  return quoteListMoney(total);
}

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'sent', label: 'Sent' },
  { key: QUOTE_CHASE_FILTER, label: 'Chase' },
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
  const [focusConvert, setFocusConvert] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const lookLetterhead = searchParams.get('look') === LETTERHEAD_LOOK;
  const [presetClientId, setPresetClientId] = useState<string | null>(null);
  const [sendingQuoteId, setSendingQuoteId] = useState<string | null>(null);
  const [chasingQuoteId, setChasingQuoteId] = useState<string | null>(null);
  const [quickText, setQuickText] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickListening, setQuickListening] = useState(false);
  const quickSpeechRef = useRef<QuickSpeechRecognition | null>(null);
  const sendCompany = quoteSendCompanyFrom(company);
  const Speech = browserSpeechRecognition();

  const { data: quotes, isLoading, isPending, error } = useQuery<QuoteListItem[]>({
    queryKey: ['quotes'],
    queryFn: async () => {
      const convertQuote = fieldAuditConvertQuote();
      if (convertQuote) {
        if (lookLetterhead) return [convertQuote];
        const shareQuote = fieldAuditShareQuote();
        const gstQuote = fieldAuditGstQuote();
        return [convertQuote, shareQuote, gstQuote, ...fieldAuditChaseQuotes()]
          .filter((row): row is QuoteListItem => !!row);
      }
      const { data, error } = await supabase
        .from('quotes')
        .select('id, company_id, quote_number, client_id, job_id, status, description, scope_of_works, line_items, subtotal, tax_rate, tax_amount, total, validity_date, notes, inclusions, exclusions, scheduled_date, assigned_team, created_by, created_at, updated_at, sent_at, chased_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as QuoteWithDetails[];
      const clientIds = [...new Set(list.map(q => q.client_id).filter(Boolean))] as string[];
      const jobIds = [...new Set(list.map(q => q.job_id).filter(Boolean))] as string[];
      const quoteIds = list.map(q => q.id);
      const [clientsRes, jobsRes, quoteInvoicesRes, jobInvoicesRes] = await Promise.all([
        clientIds.length ? supabase.from('clients').select('id, name, email, contact_person').in('id', clientIds) : Promise.resolve({ data: [] as { id: string; name: string; email: string | null; contact_person: string | null }[] }),
        jobIds.length ? supabase.from('jobs').select('id, title, address').in('id', jobIds) : Promise.resolve({ data: [] as { id: string; title: string; address: string | null }[] }),
        quoteIds.length
          ? supabase.from('invoices').select('id, quote_id, job_id, status').in('quote_id', quoteIds)
          : Promise.resolve({ data: [] as { id: string; quote_id: string | null; job_id: string | null; status: string }[] }),
        jobIds.length
          ? supabase.from('invoices').select('id, quote_id, job_id, status').in('job_id', jobIds)
          : Promise.resolve({ data: [] as { id: string; quote_id: string | null; job_id: string | null; status: string }[] }),
      ]);
      const clientMap = new Map((clientsRes.data ?? []).map(c => [c.id, c]));
      const jobMap = new Map((jobsRes.data ?? []).map(j => [j.id, j]));
      const quoteInvoices = quoteInvoicesRes.data ?? [];
      const jobInvoices = jobInvoicesRes.data ?? [];
      return list.map(q => ({
        ...q,
        inclusions: asStringList(q.inclusions),
        exclusions: asStringList(q.exclusions),
        client_name: q.client_id ? clientMap.get(q.client_id)?.name ?? null : null,
        client_contact_person: q.client_id ? clientMap.get(q.client_id)?.contact_person ?? null : null,
        client_email: q.client_id ? clientMap.get(q.client_id)?.email ?? null : null,
        job_title: q.job_id ? jobMap.get(q.job_id)?.title ?? null : null,
        job_address: q.job_id ? jobMap.get(q.job_id)?.address ?? null : null,
        invoice_id: quoteListInvoiceId(
          quoteInvoices.filter(inv => inv.quote_id === q.id),
          q.job_id ? jobInvoices.filter(inv => inv.job_id === q.job_id) : [],
        ),
      }));
    },
    enabled: !!profile,
  });

  const filtered = useMemo(() => {
    const list = quotes ?? [];
    const now = new Date();
    return list.filter(q => {
      if (statusFilter === QUOTE_CHASE_FILTER) {
        if (!quoteOnChaseList(q, now)) return false;
      } else if (statusFilter !== 'all' && q.status !== statusFilter) return false;
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
    const status = searchParams.get('status');
    if (status) {
      if (status === QUOTE_CHASE_FILTER) setStatusFilter(QUOTE_CHASE_FILTER);
      else if (status in QUOTE_STATUS_LABELS) setStatusFilter(status as QuoteStatus);
      const next = new URLSearchParams(searchParams);
      next.delete('status');
      setSearchParams(next, { replace: true });
      return;
    }
    const quoteId = searchParams.get('id');
    const clientId = searchParams.get('client');
    if (quoteId) {
      if (!quotes) return;
      const q = quotes.find(item => item.id === quoteId);
      if (!q) return;
      if (searchParams.get('chase') === '1') {
        if (quoteChase(q, new Date())?.state === 'lapsed') {
          setEditingQuote(q);
          setPresetClientId(null);
          setShowForm(true);
        } else {
          setChasingQuoteId(quoteId);
        }
      } else if (searchParams.get('send') === '1') {
        setSendingQuoteId(quoteId);
      } else {
        setEditingQuote(q);
        setPresetClientId(null);
        setShowForm(true);
      }
      const next = new URLSearchParams(searchParams);
      next.delete('id');
      next.delete('send');
      next.delete('chase');
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

  useEffect(() => {
    if (!lookLetterhead || !quotes?.length || showForm) return;
    setEditingQuote(quotes[0]);
    setPresetClientId(null);
    setShowForm(true);
  }, [lookLetterhead, quotes, showForm]);

  function openQuote(q: QuoteListItem | null, opts?: { focusConvert?: boolean }) {
    setEditingQuote(q);
    setPresetClientId(null);
    setShowForm(true);
    setFocusConvert(!!opts?.focusConvert);
  }

  async function submitQuickQuote(event: FormEvent) {
    event.preventDefault();
    if (!profile?.company_id || !profile.id) return;
    const text = quickText.trim();
    if (!text || quickBusy) return;
    setQuickBusy(true);
    try {
      const [clientsRes, bookRes] = await Promise.all([
        supabase.from('clients').select('id, name').eq('archived', false),
        supabase.from('price_book_items').select('*').eq('is_active', true),
      ]);
      if (clientsRes.error) throw clientsRes.error;
      if (bookRes.error) throw bookRes.error;
      const row = quickQuoteInsertRow({
        companyId: profile.company_id,
        createdBy: profile.id,
        taxRate: Number(company?.default_tax_rate) || DEFAULT_TAX_RATE,
        text,
        items: (bookRes.data ?? []) as { id: string; code: string | null; description: string; unit_price: number; cost_price?: number | null; gst_rate?: number | null }[],
        clients: clientsRes.data ?? [],
      });
      await insertQuickQuoteDraft(async draft => {
        const { data, error } = await supabase
          .from('quotes')
          .insert(draft)
          .select('id, company_id, quote_number, client_id, job_id, status, description, scope_of_works, line_items, subtotal, tax_rate, tax_amount, total, validity_date, notes, inclusions, exclusions, scheduled_date, assigned_team, created_by, created_at, updated_at, sent_at, chased_at')
          .single();
        if (error || !data?.id) throw new Error(error?.message || 'Could not save draft quote');
        const clientName = (clientsRes.data ?? []).find(c => c.id === data.client_id)?.name ?? null;
        openQuote({
          ...(data as QuoteWithDetails),
          inclusions: asStringList(data.inclusions),
          exclusions: asStringList(data.exclusions),
          client_name: clientName,
          client_email: null,
          job_title: null,
          job_address: null,
          invoice_id: null,
        });
        return { id: data.id as string };
      }, row);
      setQuickText('');
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['client-quotes'] });
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Could not save draft quote');
    } finally {
      setQuickBusy(false);
    }
  }

  function startQuickVoice() {
    if (!Speech) return;
    quickSpeechRef.current?.stop();
    const rec = new Speech();
    rec.lang = 'en-AU';
    rec.interimResults = false;
    rec.continuous = false;
    rec.onresult = ev => {
      const spoken = transcriptFromSpeechEvent(ev);
      if (spoken) setQuickText(current => (current.trim() ? `${current.trim()} ${spoken}` : spoken));
    };
    rec.onend = () => setQuickListening(false);
    rec.onerror = () => setQuickListening(false);
    quickSpeechRef.current = rec;
    setQuickListening(true);
    rec.start();
  }

  function handleSaved(opts?: { close?: boolean; message?: string; listRow?: QuotesListSavePatch }) {
    if (opts?.close !== false) {
      setShowForm(false);
      setPresetClientId(null);
    }
    const listRow = opts?.listRow;
    if (listRow) {
      queryClient.setQueryData<QuoteListItem[]>(QUOTES_LIST_QUERY_KEY, prev =>
        quotesAfterSave(prev, listRow),
      );
    }
    queryClient.invalidateQueries({ queryKey: QUOTES_LIST_QUERY_KEY });
    queryClient.invalidateQueries({ queryKey: ['client-quotes'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    if (opts?.message !== '') {
      showToast(opts?.message ?? (editingQuote ? 'Quote updated' : 'Quote created'));
    }
  }

  if (pageQueryBlocked(error)) return <AppShell><PageError message="Could not load quotes" /></AppShell>;

  const filteredEmpty = !search && statusFilter === 'all';
  const busy = listQueryBusy({ isPending, isLoading, data: quotes });
  const chaseCount = (quotes ?? []).filter(q => quoteOnChaseList(q, new Date())).length;
  const chasingQuote = quotes?.find(q => q.id === chasingQuoteId) ?? null;

  return (
    <AppShell>
      <div className="ops-page hub-quotes">
        <div className="ops-page-head">
          <div>
            <p className="hub-look-eyebrow hub-quote-kicker">Quotations</p>
            <h1 className="ops-page-title">Quotes</h1>
          </div>
          <form className="hub-quick-quote" onSubmit={event => void submitQuickQuote(event)}>
            <label className="hub-quick-quote-label" htmlFor="hub-quick-quote-text">Quick quote</label>
            <input
              id="hub-quick-quote-text"
              value={quickText}
              onChange={e => setQuickText(e.target.value)}
              className="form-input"
              placeholder="e.g. 2 hr labour and 1 call-out for Jane Smith"
              disabled={quickBusy}
            />
            {Speech ? (
              <button
                type="button"
                className={`hub-quick-quote-mic${quickListening ? ' is-on' : ''}`}
                aria-label="Voice note"
                onClick={startQuickVoice}
                disabled={quickBusy}
              >
                <Mic size={16} />
              </button>
            ) : null}
            <button type="submit" className="hub-quick-quote-go" disabled={quickBusy || !quickText.trim()}>
              {quickBusy ? 'Saving…' : 'Make draft'}
            </button>
          </form>
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
                {tab.key === QUOTE_CHASE_FILTER ? quoteChaseFilterLabel(busy, chaseCount) : tab.label}
              </button>
            ))}
          </div>
          <SearchBar value={search} onChange={setSearch} placeholder="Search quotes or clients..." className="max-w-sm" />
        </div>

        {busy ? (
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
              <QuoteRow
                key={q.id}
                quote={q}
                onOpen={opts => openQuote(q, opts)}
                onSend={setSendingQuoteId}
                onChase={setChasingQuoteId}
              />
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
          focusConvert={focusConvert}
          onFocusedConvert={() => setFocusConvert(false)}
          onClose={() => { setShowForm(false); setPresetClientId(null); setFocusConvert(false); }}
          onSaved={handleSaved}
          onRequestSend={setSendingQuoteId}
        />
      )}

      {chasingQuote && company?.id && quoteChase(chasingQuote, new Date())?.state !== 'lapsed' && (
        <QuoteChaseDialog
          quote={chasingQuote}
          company={{ id: company.id, name: company.name ?? sendCompany?.name ?? '' }}
          onClose={() => setChasingQuoteId(null)}
          onChased={() => {
            setChasingQuoteId(null);
            queryClient.invalidateQueries({ queryKey: ['quotes'] });
            queryClient.invalidateQueries({ queryKey: ['client-quotes'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-nudges'] });
            showToast('Marked chased');
          }}
        />
      )}

      {sendingQuoteId && sendCompany && (
        <QuoteSendDialog
          quoteId={sendingQuoteId}
          company={sendCompany}
          onClose={() => setSendingQuoteId(null)}
          onSent={async (to, message) => {
            const patch = quoteChasePatch(quotes?.find(q => q.id === sendingQuoteId) ?? { status: 'draft' }, new Date());
            if (patch) {
              const { error } = await supabase.from('quotes').update(patch).eq('id', sendingQuoteId).eq('status', 'sent');
              if (error) showToast(error.message);
            }
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

function QuoteRow({ quote, onOpen, onSend, onChase }: { quote: QuoteListItem; onOpen: (opts?: { focusConvert?: boolean }) => void; onSend: (quoteId: string) => void; onChase: (quoteId: string) => void }) {
  const { showToast } = useToast();
  const requestSend = (quoteId: string) => {
    const block = checkPriceSendBlock(quote.line_items);
    if (block) {
      showToast(block, 'error');
      return;
    }
    onSend(quoteId);
  };
  const next = recommendQuoteAction(quoteActionContext(quote));
  const chase = quoteChase(quote, new Date());
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
        {chase && (
          <button
            type="button"
            className="hub-quotes-chase"
            data-chase-state={chase.state}
            onClick={() => chase.state === 'lapsed' ? onOpen() : onChase(quote.id)}
          >
            {quoteChaseChipLabel(chase)}
          </button>
        )}
        {next.key === 'none' ? (
          <span className="hub-quotes-muted">{next.label}</span>
        ) : (
          <QuoteNextControl quote={quote} onOpen={onOpen} onSend={requestSend} />
        )}
      </span>
    </div>
  );
}

function QuoteNextControl({ quote, onOpen, onSend }: { quote: QuoteListItem; onOpen: (opts?: { focusConvert?: boolean }) => void; onSend: (quoteId: string) => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile, company } = useAuth();
  const { showToast } = useToast();
  const [busy, setBusy] = useState<QuoteActionKey | null>(null);
  const convertLock = useRef(false);
  const next = recommendQuoteAction(quoteActionContext(quote));
  if (next.key === 'none') return null;

  const run = async (key: QuoteActionKey, fn: () => Promise<void>) => {
    if (key === 'convert_job' && !takeQuoteConvertLock(convertLock)) return;
    setBusy(key);
    if (!profile?.id) {
      showToast(key === 'convert_job' ? CONVERT_QUOTE_BLOCKED : 'Unknown error');
      setBusy(null);
      if (key === 'convert_job') releaseQuoteConvertLock(convertLock);
      return;
    }
    try {
      await fn();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      showToast(message);
    } finally {
      setBusy(null);
      if (key === 'convert_job') releaseQuoteConvertLock(convertLock);
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
      const tap = quoteConvertTap({
        id: quote.id,
        status: quote.status,
        profileId: profile?.id,
        scheduled_date: quote.scheduled_date,
        assigned_team: quote.assigned_team,
      });
      if (tap.action === 'focus_convert') {
        onOpen({ focusConvert: true });
        return;
      }
      void run('convert_job', async () => {
        const jobId = await convertQuoteToJob({
          ...quote,
          scheduled_date: quote.scheduled_date ?? null,
          assigned_team: assignedTeamFromQuote(quote.assigned_team),
        }, profile!.id);
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
        if (result.existing) {
          const reuse = invoiceReuseOpen(result.id);
          showToast(reuse.toast);
          navigate(reuse.href);
          return;
        }
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
  assigned_team: string[];
}

function QuoteEditorModal({ quote, presetClientId, defaultTaxRate, focusConvert, onFocusedConvert, onClose, onSaved, onRequestSend }: {
  quote: QuoteListItem | null;
  presetClientId?: string | null;
  defaultTaxRate: number;
  focusConvert?: boolean;
  onFocusedConvert?: () => void;
  onClose: () => void;
  onSaved: (opts?: { close?: boolean; message?: string; listRow?: QuotesListSavePatch }) => void;
  onRequestSend: (quoteId: string) => void;
}) {
  const { profile, company: authCompany } = useAuth();
  const [searchParams] = useSearchParams();
  const company = companyWithLetterheadLookMark(authCompany, searchParams.get('look')) ?? authCompany;
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
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [priceBookItems, setPriceBookItems] = useState<PriceBookItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState(false);
  const [invoicing, setInvoicing] = useState(false);
  const [showPreview, setShowPreview] = useState(searchParams.get('print') === '1');
  const [showEdit, setShowEdit] = useState(!quote);
  const [err, setErr] = useState('');
  const [savedId, setSavedId] = useState<string | null>(quote?.id ?? null);
  const [invoiceId, setInvoiceId] = useState<string | null>(quote?.invoice_id ?? null);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const [copyConfirm, setCopyConfirm] = useState(false);
  const [manualCopyUrl, setManualCopyUrl] = useState('');
  const [copyingLink, setCopyingLink] = useState(false);
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
    scheduled_date: quote?.scheduled_date?.slice(0, 10) ?? '',
    assigned_team: assignedTeamFromQuote(quote?.assigned_team),
  });

  useEffect(() => {
    if (!profile?.company_id) return;
    const auditClients = getAuditClients();
    const auditTeam = getAuditTeamMembers();
    if (auditClients) {
      setClients(auditClients as Client[]);
      setClientsLoaded(true);
      if (auditTeam) setTeamMembers(auditTeam.map(m => ({ id: m.id, name: m.name })));
      return;
    }
    (async () => {
      const [c, j, s, pb, team] = await Promise.all([
        supabase.from('clients').select('*').eq('archived', false).order('name'),
        supabase.from('jobs').select('id, company_id, client_id, title, address').order('created_at', { ascending: false }),
        supabase.from('stock_items').select('*').eq('archived', false).order('name'),
        supabase.from('price_book_items').select('*').eq('is_active', true).order('description'),
        supabase.rpc('get_company_members', { p_company_id: profile.company_id }),
      ]);
      if (c.data) setClients(c.data as Client[]);
      setClientsLoaded(true);
      if (j.data) setJobs(j.data as Job[]);
      if (s.data) setStockItems(s.data as StockItem[]);
      if (pb.data) setPriceBookItems(pb.data as PriceBookItem[]);
      if (team.data) setTeamMembers((team.data as { id: string; name: string }[]).map(m => ({ id: m.id, name: m.name })));
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
  const fallbackTaxRate = parseFloat(form.tax_rate) || 0;
  const gst = useMemo(
    () => calcLineDocumentTotals(form.line_items, fallbackTaxRate),
    [form.line_items, fallbackTaxRate],
  );
  const { subtotal, taxAmount, total: grandTotal } = gst;
  const gstHeading = gstDocumentLabel(form.line_items, fallbackTaxRate);

  const next = recommendQuoteAction(quoteActionContext({
    status: form.status,
    client_id: form.client_id || null,
    client_email: emailClient?.email,
    line_items: form.line_items,
    job_id: form.job_id || null,
    invoice_id: invoiceId,
  }));

  const convertSectionRef = useRef<HTMLDivElement | null>(null);
  const convertFocusDoneRef = useRef(false);
  const convertingLock = useRef(false);
  const stopConvertFocusRef = useRef<(() => void) | null>(null);
  const focusConvertRef = useRef(focusConvert);
  const onFocusedConvertRef = useRef(onFocusedConvert);
  focusConvertRef.current = focusConvert;
  onFocusedConvertRef.current = onFocusedConvert;

  const startConvertFocus = () => {
    if (!focusConvertRef.current || convertFocusDoneRef.current) return;
    stopConvertFocusRef.current?.();
    stopConvertFocusRef.current = afterDialogInitialFocus(() => {
      const section = convertSectionRef.current;
      if (!section) return false;
      const date = focusQuoteConvertDate(section);
      if (!date) return false;
      convertFocusDoneRef.current = true;
      onFocusedConvertRef.current?.();
      return true;
    });
  };

  useEffect(() => {
    convertFocusDoneRef.current = false;
    if (!focusConvert || next.key !== 'convert_job') return undefined;
    startConvertFocus();
    return () => stopConvertFocusRef.current?.();
  }, [focusConvert, next.key, quote?.id]);

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
        gst_rate: li.gst_rate,
        check_price: li.check_price,
      }));
    return commercialPdfPreviewData({
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
    }, cleanLines);
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
        gst_rate: li.gst_rate,
        check_price: li.check_price || undefined,
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
        scheduled_date: form.scheduled_date || null,
        assigned_team: form.assigned_team,
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
      onSaved({
        close: opts?.close ?? false,
        message: opts?.message ?? 'Quote updated',
        listRow: {
          id,
          total: grandTotal,
          status,
          client_id: payload.client_id,
          line_items: cleanLines,
        },
      });
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
    onSaved({
      close: opts?.close ?? true,
      message: opts?.message ?? 'Quote created',
    });
    return data.id as string;
  };

  const startSend = async () => {
    const block = checkPriceSendBlock(form.line_items);
    if (block) { setErr(block); return; }
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
      if (result.existing) {
        const reuse = invoiceReuseOpen(result.id);
        showToast(reuse.toast);
        navigate(reuse.href);
        return;
      }
      navigate(invoiceLandingPath(form.job_id || quote?.job_id, result.id));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Could not create invoice');
    } finally {
      setInvoicing(false);
    }
  };

  const handleConvert = async () => {
    if (!takeQuoteConvertLock(convertingLock)) return;
    const tap = quoteConvertTap({
      id: savedId ?? quote?.id,
      status: form.status,
      profileId: profile?.id,
      scheduled_date: form.scheduled_date,
      assigned_team: form.assigned_team,
    });
    if (tap.action === 'focus_convert') {
      setErr(CONVERT_QUOTE_NEED_DATE_CREW);
      focusQuoteConvertDate(convertSectionRef.current ?? document);
      releaseQuoteConvertLock(convertingLock);
      return;
    }
    setConverting(true);
    if (tap.action === 'blocked') {
      setErr(tap.message);
      setConverting(false);
      releaseQuoteConvertLock(convertingLock);
      return;
    }
    setErr('');
    const id = savedId ?? quote?.id ?? '';
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
        assigned_team: form.assigned_team,
      }, profile.id);
      queryClient.invalidateQueries({ queryKey: ['quotes'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      navigate(`/jobs/${jobId}`);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Conversion failed');
    } finally {
      setConverting(false);
      releaseQuoteConvertLock(convertingLock);
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

  const handleCopyLink = async () => {
    const block = checkPriceSendBlock(form.line_items);
    if (block) {
      showToast(block, 'error');
      return;
    }
    if (!form.client_id || !profile?.company_id) {
      showToast('Pick a client before you can copy a link.', 'error');
      return;
    }
    setCopyingLink(true);
    try {
      let toast = '';
      let markedSent = false;
      const result = await copyShareText(async () => {
        const id = savedId ?? quote?.id ?? await persist('draft', { close: false, message: '' });
        if (!id) throw new Error('Save the quote before you copy a link.');
        const prepared = await prepareDocumentShareLink({
          kind: 'quote',
          documentId: id,
          status: form.status,
          companyId: profile.company_id,
          clientId: form.client_id,
          origin: documentShareOrigin(window.location.origin),
        });
        toast = prepared.toast;
        markedSent = prepared.markedSent;
        if (prepared.markedSent) {
          setForm(f => ({ ...f, status: 'sent' }));
          void queryClient.invalidateQueries({ queryKey: ['quotes'] });
          void queryClient.invalidateQueries({ queryKey: ['client-quotes'] });
          void queryClient.invalidateQueries({ queryKey: ['job-quotes'] });
        }
        return prepared.url;
      });
      closeMore();
      if (result.kind === 'manual') {
        setManualCopyUrl(result.text);
        const manualToast = documentShareManualCopyToast('quote', markedSent);
        if (manualToast) showToast(manualToast);
      } else {
        setManualCopyUrl('');
        setCopyConfirm(true);
        showToast(toast || 'Link copied');
        window.setTimeout(() => setCopyConfirm(false), 2500);
      }
    } catch (e) {
      closeMore();
      showToast(documentShareCopyErrorToast(e), 'error');
    } finally {
      setCopyingLink(false);
    }
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
    <>
    <AppDialog
      open
      onClose={onClose}
      title="Quote"
      panelClassName="overlay-panel-xl hub-quote-editor"
      footer={(
        <EditorStickyFooter
          onCancel={onClose}
          onSave={() => { void persist(form.status, { close: true }); }}
          saveLabel={quote || savedId ? 'Save' : 'Save draft'}
          saving={saving}
        />
      )}
    >
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
                {form.status === 'draft' && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      closeMore();
                      const write = quoteMarkAcceptedWrite();
                      void persist(write.status, { close: write.close, message: write.message });
                    }}
                    disabled={saving}
                  >
                    Mark accepted
                  </button>
                )}
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
                  data-quote-copy-link="1"
                  onClick={() => { void handleCopyLink(); }}
                  disabled={!form.client_id || !profile?.company_id || copyingLink}
                >
                  {copyingLink ? 'Copying…' : copyConfirm ? 'Copied' : 'Copy link'}
                </button>
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
            {copyConfirm ? (
              <p className="hub-quote-copy-confirm" role="status">Link copied</p>
            ) : null}
            <button type="button" onClick={onClose} className="hub-quote-close" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>
        {manualCopyUrl ? <DocumentShareManualLink url={manualCopyUrl} /> : null}
        {err && err !== CONVERT_QUOTE_NEED_DATE_CREW ? <p className="hub-quote-err">{err}</p> : null}

        <div className="hub-quote-sheet">
          <header className="hub-quote-masthead">
            <div className="hub-quote-masthead-brand">
              {sheetLogo ? (
                <CompanyLetterheadMark src={sheetLogo} company={company} />
              ) : null}
            </div>
            <div className="hub-quote-banner">
              <p className="hub-quote-kicker">Quotation</p>
              <h2 className="hub-quote-editor-title">{editorTitle}</h2>
              <p className="hub-quote-banner-meta">
                {QUOTE_STATUS_LABELS[form.status]}
                {form.validity_date ? ` · Valid ${format(parseISO(form.validity_date), 'd MMM yyyy')}` : ''}
              </p>
            </div>
          </header>

          <div className="hub-quote-letterhead">
            <div className="min-w-0">
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

          <div className="hub-quote-table" data-quote-lines="1">
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
                      <td>
                        {li.description}
                        {li.check_price ? (
                          <>
                            {' '}
                            <span className="hub-quote-check-price">{QUICK_QUOTE_CHECK_PRICE}</span>
                          </>
                        ) : null}
                      </td>
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
            <span>{gstHeading}</span>
            <span className="hub-quote-num">{formatMoney(taxAmount)}</span>
          </div>
          {editorMoney ? (
            <div className="hub-quote-totalbar">
              <span>Total (inc GST)</span>
              <span className="hub-quote-display-total">{editorMoney}</span>
            </div>
          ) : null}

          {next.key === 'convert_job' && (
            <div
              className="hub-quote-convert"
              ref={node => {
                convertSectionRef.current = node;
                if (node) startConvertFocus();
              }}
            >
              <p className="hub-quote-convert-label">Convert</p>
              <div className="hub-quote-convert-fields">
                <Field label="Job date">
                  <input id="quote-convert-date" type="date" value={form.scheduled_date} onChange={e => setForm(f => ({ ...f, scheduled_date: e.target.value }))} className="form-input" />
                </Field>
                <Field label="Crew">
                  <select
                    value={form.assigned_team[0] ?? ''}
                    onChange={e => setForm(f => ({ ...f, assigned_team: e.target.value ? [e.target.value] : [] }))}
                    className="form-input cursor-pointer"
                  >
                    <option value="">No crew yet</option>
                    {teamMembers.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </Field>
              </div>
              {err === CONVERT_QUOTE_NEED_DATE_CREW
                ? <p className="hub-quote-convert-miss">{CONVERT_QUOTE_NEED_DATE_CREW}</p>
                : <p className="hub-quote-convert-whisper">Date and crew on this tap.</p>}
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleConvert()}
                disabled={converting}
              >
                {converting ? 'Converting...' : 'Convert to job'}
              </button>
            </div>
          )}
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
              taxRate={fallbackTaxRate}
              taxAmount={taxAmount}
              total={grandTotal}
              taxLabel={gstHeading}
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

          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="form-input min-h-[60px] resize-y" placeholder="Notes for the client..." />
          </Field>
        </div>
        </div>
        ) : null}

    </AppDialog>
      {showPreview && previewData && (
        <CommercialPdfPreviewModal data={previewData} onClose={() => setShowPreview(false)} />
      )}
    </>
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
