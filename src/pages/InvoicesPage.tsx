import { useState, useMemo, useEffect, useRef, type ReactNode } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { PageError, EmptyState, SearchBar, useToast, OpsSiteRow, LoadingSpinner } from '../components/ui';
import type { InvoiceWithDetails, InvoiceLineItem, InvoiceStatus, JobCost, Quote, StockItem, PriceBookItem } from '../types/fsm';
import type { Client, Job } from '../types/crm';
import { LineItemEditor, emptyLineItem, toEditLine, calcSubtotal, type EditLineItem } from '../components/invoicing/LineItemEditor';
import { DocumentVariationsEditor } from '../components/invoicing/DocumentVariationsEditor';
import { DocumentGstTotals } from '../components/invoicing/DocumentGstTotals';
import { CommercialPdfPreviewModal } from '../components/invoicing/CommercialPdfPreviewModal';
import { InvoiceSendDialog } from '../components/invoicing/InvoiceSendDialog';
import { linesFromQuoteItems } from '../reports/commercial/CommercialDocumentPdf';
import type { CommercialPdfData } from '../reports/commercial/CommercialDocumentPdf';
import { asStringList } from '../lib/asStringList';
import { calcDocumentTotals, DEFAULT_TAX_RATE, gstLabel } from '../lib/gst';
import { effectiveInvoiceStatus, persistableInvoiceStatus } from '../lib/invoiceStatus';
import { invoiceActionContext, invoiceListBucket, invoiceOverflowPaidAction, recommendInvoiceAction, type InvoiceActionKey } from '../lib/invoiceNextAction';
import { INVOICE_SOURCE_QUOTE } from '../lib/invoiceFromQuote';
import { quoteClientDetailFromClient, visibleClientContacts } from '../lib/clientRecords';
import { invoiceSendCompanyFrom, isSmtpReady, type SmtpSettingsRow } from '../lib/sendInvoice';
import { commercialPdfCompanyFrom } from '../lib/companyLogo';
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
  INVOICE_CLIENT_ATTACH_NO_CLIENTS,
  attachInvoiceClient,
  invoiceClientAttachRow,
  invoiceClientAttachToast,
} from '../lib/attachInvoiceClient';
import {
  deliverInvoiceReceiptAfterMarkPaid,
  invoiceMarkPaidReceiptToast,
  invoiceMarkPaidSheetMissLine,
  loadInvoiceEditorRow,
} from '../lib/sendInvoiceDeliver';
import {
  attachXeroPaymentAfterMarkPaid,
  invoiceMarkPaidToast,
  invoiceMarkPaidXeroMissLine,
  INVOICE_MARKED_PAID_MESSAGE,
} from '../lib/xeroAccounting';
import { INVOICE_STATUS_LABELS, formatMoney } from '../types/fsm';
import { Plus, Receipt, Download, X, MoreHorizontal, Mail, Phone, User } from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';

const padInv = (n: number | null) => String(n ?? 0).padStart(4, '0');

type StatusFilter = 'all' | InvoiceStatus;

function visibleSite(...parts: Array<string | null | undefined>): string {
  for (const part of parts) {
    const trimmed = part?.trim();
    if (trimmed && trimmed !== 'No site address') return trimmed;
  }
  return '';
}

function invoiceTitle(invoice: { invoice_number?: number | null }): string {
  return invoice.invoice_number != null ? `Invoice #${padInv(invoice.invoice_number)}` : 'Invoice';
}

function invoiceRef(invoice: { invoice_number?: number | null }): string {
  return invoice.invoice_number != null ? `#${padInv(invoice.invoice_number)}` : 'Invoice';
}

function invoiceMoney(total: number | string | null | undefined): string | null {
  const n = Number(total ?? 0);
  return n > 0 ? formatMoney(n) : null;
}

function suburbFromSite(site: string): string {
  const parts = site.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return site;
  const loc = parts[1].replace(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b.*$/i, '').trim();
  return loc || parts[1];
}

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
  const [sendingInvoiceId, setSendingInvoiceId] = useState<string | null>(null);
  const invoiceIdParam = searchParams.get('id');

  const { data: smtpSettings } = useQuery<SmtpSettingsRow | null>({
    queryKey: ['email-settings', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('email_settings')
        .select('smtp_host, smtp_pass, from_name, from_email')
        .eq('company_id', profile!.company_id)
        .maybeSingle();
      if (error) throw error;
      return (data as SmtpSettingsRow) ?? null;
    },
    enabled: !!profile?.company_id,
  });
  const smtpReady = smtpSettings === undefined ? null : isSmtpReady(smtpSettings);

  const { data: openedInvoice } = useQuery<InvoiceWithDetails | null>({
    queryKey: ['invoice', invoiceIdParam, profile?.company_id],
    queryFn: async () => {
      if (!invoiceIdParam || !profile?.company_id) return null;
      return loadInvoiceEditorRow(invoiceIdParam, profile.company_id);
    },
    enabled: !!invoiceIdParam && !!profile?.company_id,
  });

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
        clientIds.length ? supabase.from('clients').select('id, name, email, phone').in('id', clientIds) : Promise.resolve({ data: [] as { id: string; name: string; email: string | null; phone: string | null }[] }),
        jobIds.length ? supabase.from('jobs').select('id, title, address').in('id', jobIds) : Promise.resolve({ data: [] as { id: string; title: string; address: string | null }[] }),
      ]);
      const clientMap = new Map((clientsRes.data ?? []).map(c => [c.id, c]));
      const jobMap = new Map((jobsRes.data ?? []).map(j => [j.id, j]));
      return list.map(i => ({
        ...i,
        inclusions: asStringList(i.inclusions),
        exclusions: asStringList(i.exclusions),
        client_name: i.client_id ? clientMap.get(i.client_id)?.name ?? null : null,
        client_email: i.client_id ? clientMap.get(i.client_id)?.email ?? null : null,
        client_phone: i.client_id ? clientMap.get(i.client_id)?.phone ?? null : null,
        job_title: i.job_id ? jobMap.get(i.job_id)?.title ?? null : null,
        job_address: i.job_id ? jobMap.get(i.job_id)?.address ?? null : null,
      }));
    },
    enabled: !!profile,
  });

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

  const listInvoices = useMemo(() => {
    const rank = (inv: InvoiceWithDetails) => {
      const bucket = invoiceListBucket(inv);
      if (bucket === 'overdue') return 0;
      if (bucket === 'draft') return 1;
      if (bucket === 'awaiting') return 2;
      return 3;
    };
    return [...filtered].sort((a, b) => rank(a) - rank(b));
  }, [filtered]);

  useEffect(() => {
    const invoiceId = searchParams.get('id');
    const clientId = searchParams.get('client');
    if (invoiceId) {
      if (openedInvoice === undefined) return;
      if (!openedInvoice) return;
      setEditingInvoice(openedInvoice);
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
  }, [searchParams, openedInvoice, setSearchParams]);

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
    queryClient.invalidateQueries({ queryKey: ['invoice'] });
    queryClient.invalidateQueries({ queryKey: ['client-invoices'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    if (opts?.message !== '') {
      showToast(opts?.message ?? (editingInvoice ? 'Invoice updated' : 'Invoice created'));
    }
  }

  if (error) return <AppShell><PageError message="Could not load invoices" /></AppShell>;

  const filteredEmpty = !search && statusFilter === 'all';

  return (
    <AppShell>
      <div className="ops-page hub-invoices">
        <div className="ops-page-head">
          <div>
            <h1 className="ops-page-title">Invoices</h1>
          </div>
          <button
            onClick={() => openInvoice(null)}
            className="btn-primary"
          >
            <Plus size={16} /> New invoice
          </button>
        </div>

        <div className="hub-invoices-chrome">
          <div className="hub-invoices-filters">
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
          <SearchBar value={search} onChange={setSearch} placeholder="Search invoices or clients..." className="max-w-sm" />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={filteredEmpty ? 'No invoices yet' : 'No matching invoices'}
            message={filteredEmpty
              ? 'Invoice from an accepted quote, or open a job and invoice the bill.'
              : 'Try another status or search.'}
            action={filteredEmpty ? (
              <button onClick={() => openInvoice(null)} className="btn-primary">
                <Plus size={16} /> New invoice
              </button>
            ) : undefined}
          />
        ) : (
          <div className="hub-invoices-sheet">
            <div className="hub-invoices-thead">
              <span>#</span>
              <span>Customer</span>
              <span>Suburb</span>
              <span>Status</span>
              <span>Total inc GST</span>
              <span />
            </div>
            {listInvoices.map(inv => (
              <InvoiceHit
                key={inv.id}
                invoice={inv}
                smtpReady={smtpReady}
                onOpen={() => openInvoice(inv)}
                onSend={setSendingInvoiceId}
              />
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <InvoiceEditorModal
          key={editingInvoice?.id ?? presetClientId ?? 'new'}
          invoice={editingInvoice}
          presetClientId={presetClientId}
          defaultTaxRate={company?.default_tax_rate ?? DEFAULT_TAX_RATE}
          smtpReady={smtpReady}
          onClose={() => { setShowForm(false); setPresetClientId(null); }}
          onSaved={handleSaved}
          onRequestSend={setSendingInvoiceId}
        />
      )}

      {sendingInvoiceId && company?.id && (
        <InvoiceSendDialog
          invoiceId={sendingInvoiceId}
          company={{
            id: company.id,
            name: company.name,
            abn: company.abn ?? null,
            licence_number: company.licence_number ?? null,
            phone: company.phone ?? null,
            email: company.email ?? null,
            website: company.website ?? null,
            logo_url: company.logo_url ?? null,
          }}
          onClose={() => setSendingInvoiceId(null)}
          onSent={(to, message, opts) => {
            if (!opts?.keepOpen) setSendingInvoiceId(null);
            queryClient.invalidateQueries({ queryKey: ['invoices'] });
            queryClient.invalidateQueries({ queryKey: ['invoice'] });
            queryClient.invalidateQueries({ queryKey: ['client-invoices'] });
            if (editingInvoice?.id === sendingInvoiceId) {
              setEditingInvoice(inv => inv ? { ...inv, status: 'sent' } : inv);
            }
            if (!opts?.keepOpen) showToast(message ?? `Invoice sent to ${to}`);
          }}
        />
      )}
    </AppShell>
  );
}

function InvoiceHit({
  invoice, smtpReady, onOpen, onSend,
}: {
  invoice: InvoiceWithDetails;
  smtpReady: boolean | null;
  onOpen: () => void;
  onSend: (invoiceId: string) => void;
}) {
  const status = effectiveInvoiceStatus(invoice);
  const site = visibleSite(invoice.job_address);
  const suburb = site ? suburbFromSite(site) : '';
  const money = invoiceMoney(invoice.total);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      className="hub-invoices-row"
    >
      <span className="hub-invoices-ref">{invoiceRef(invoice)}</span>
      <span className="truncate">{invoice.client_name || ''}</span>
      <span className="truncate hub-invoices-muted">{suburb}</span>
      <span className={`hub-invoices-pill is-${status}`}>{INVOICE_STATUS_LABELS[status]}</span>
      <span className="hub-invoices-total">{money ?? ''}</span>
      <span className="hub-invoices-row-next" onClick={e => e.stopPropagation()}>
        <InvoiceNextControl invoice={invoice} smtpReady={smtpReady} onOpen={onOpen} onSend={onSend} />
      </span>
    </div>
  );
}

function InvoiceNextControl({
  invoice, smtpReady, onOpen, onSend,
}: {
  invoice: InvoiceWithDetails;
  smtpReady: boolean | null;
  onOpen: () => void;
  onSend: (invoiceId: string) => void;
}) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { company } = useAuth();
  const [busy, setBusy] = useState<InvoiceActionKey | null>(null);
  const ctx = invoiceActionContext(invoice, { smtpReady });
  const next = recommendInvoiceAction(ctx);
  const overflowPaid = invoiceOverflowPaidAction(ctx);

  const patchPaid = async () => {
    setBusy('mark_paid');
    let paid = false;
    try {
      const { error } = await supabase.from('invoices')
        .update({ status: persistableInvoiceStatus('paid'), updated_at: new Date().toISOString() })
        .eq('id', invoice.id);
      if (error) throw error;
      paid = true;
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      const xero = await attachXeroPaymentAfterMarkPaid(
        (name, opts) => supabase.functions.invoke(name, opts),
        { paidSucceeded: true, invoiceId: invoice.id, status: 'paid' },
      );
      const receipt = await deliverInvoiceReceiptAfterMarkPaid(
        (name, opts) => supabase.functions.invoke(name, opts),
        {
          paidSucceeded: true,
          invoiceId: invoice.id,
          status: 'paid',
          company: invoiceSendCompanyFrom(company),
        },
      );
      showToast(invoiceMarkPaidReceiptToast({ xeroToast: invoiceMarkPaidToast(xero), receipt }));
    } catch (err: unknown) {
      showToast(paid
        ? INVOICE_MARKED_PAID_MESSAGE
        : (err instanceof Error ? err.message : 'Could not update invoice'));
    } finally {
      setBusy(null);
    }
  };

  let primary: ReactNode = null;
  if (next.key === 'setup_email') {
    primary = next.href ? (
      <Link
        to={next.href}
        className="hub-next"
        title={next.detail}
      >
        {next.label}
      </Link>
    ) : null;
  } else if (next.key === 'add_email' || next.label === 'Add a client') {
    primary = (
      <button
        type="button"
        onClick={onOpen}
        className="hub-next"
        title={next.detail}
      >
        {next.label}
      </button>
    );
  } else if (next.key === 'send' || next.key === 'mark_paid') {
    const chasePrimary = next.key === 'send' && next.status === 'overdue';
    primary = (
      <button
        type="button"
        onClick={() => {
          if (next.key === 'send') onSend(invoice.id);
          if (next.key === 'mark_paid') void patchPaid();
        }}
        disabled={!!busy}
        className={chasePrimary ? 'btn-primary' : 'hub-next'}
        title={next.detail}
      >
        {busy && next.key !== 'mark_paid' ? 'Working…' : next.label}
      </button>
    );
  }

  if (!primary && !overflowPaid) return null;

  return (
    <span className="hub-invoice-editor-act">
      {primary}
      {overflowPaid ? (
        <details className="hub-invoice-more">
          <summary aria-label="More actions">
            <MoreHorizontal size={18} />
          </summary>
          <div className="hub-invoice-more-menu" role="menu">
            <button
              type="button"
              role="menuitem"
              onClick={() => void patchPaid()}
              disabled={!!busy}
            >
              {busy === 'mark_paid' ? 'Working…' : overflowPaid.label}
            </button>
          </div>
        </details>
      ) : null}
    </span>
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

function InvoiceEditorModal({ invoice, presetClientId, defaultTaxRate, smtpReady, onClose, onSaved, onRequestSend }: {
  invoice: InvoiceWithDetails | null;
  presetClientId?: string | null;
  defaultTaxRate: number;
  smtpReady: boolean | null;
  onClose: () => void;
  onSaved: (opts?: { close?: boolean; message?: string }) => void;
  onRequestSend: (invoiceId: string) => void;
}) {
  const { profile, company } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [priceBookItems, setPriceBookItems] = useState<PriceBookItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const [err, setErr] = useState('');
  const [xeroMiss, setXeroMiss] = useState('');
  const [savedId, setSavedId] = useState<string | null>(invoice?.id ?? null);
  const [clientEmailDraft, setClientEmailDraft] = useState(invoice?.client_email ?? '');
  const [clientPhoneDraft, setClientPhoneDraft] = useState(invoice?.client_phone ?? '');
  const [clientAttachDraft, setClientAttachDraft] = useState('');
  const [clientsLoaded, setClientsLoaded] = useState(false);
  const [writtenClientEmail, setWrittenClientEmail] = useState<{ clientId: string; email: string | null } | null>(null);
  const [writtenClientPhone, setWrittenClientPhone] = useState<{ clientId: string; phone: string | null } | null>(null);

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
    if (!invoice) return;
    const stored = invoice.status === 'overdue' ? 'sent' : invoice.status;
    setForm(f => (f.status === stored ? f : { ...f, status: stored }));
  }, [invoice]);

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

  useEffect(() => {
    if (!form.client_id) { setQuotes([]); return; }
    (async () => {
      const { data } = await supabase.from('quotes').select('id, company_id, quote_number, client_id, status, total').eq('client_id', form.client_id).order('created_at', { ascending: false });
      setQuotes((data ?? []) as Quote[]);
    })();
  }, [form.client_id]);

  const clientJobs = useMemo(() => jobs.filter(j => form.client_id && j.client_id === form.client_id), [jobs, form.client_id]);
  const selectedClient = clients.find(c => c.id === form.client_id);
  const selectedJob = jobs.find(j => j.id === form.job_id);
  const emailClientBase = selectedClient ?? (
    form.client_id && invoice?.client_id === form.client_id
      ? { id: form.client_id, email: invoice.client_email ?? null }
      : null
  );
  const emailClient = emailClientBase && writtenClientEmail?.clientId === emailClientBase.id
    ? { ...emailClientBase, email: writtenClientEmail.email }
    : emailClientBase;
  const emailRow = jobClientEmailRow({ clientId: form.client_id || null, client: emailClient });
  const phoneClientBase = selectedClient
    ? { id: selectedClient.id, phone: selectedClient.phone ?? null }
    : (form.client_id && invoice?.client_id === form.client_id && invoice.client_phone !== undefined
      ? { id: form.client_id, phone: invoice.client_phone ?? null }
      : null);
  const phoneClient = phoneClientBase && writtenClientPhone?.clientId === phoneClientBase.id
    ? { ...phoneClientBase, phone: writtenClientPhone.phone }
    : phoneClientBase;
  const phoneRow = jobClientPhoneRow({ clientId: form.client_id || null, client: phoneClient });
  const invoiceId = savedId ?? invoice?.id ?? null;
  const attachRow = invoiceClientAttachRow({
    invoiceClientId: form.client_id || null,
    companyClients: form.client_id
      ? []
      : (!invoiceId || !clientsLoaded)
        ? null
        : clients,
  });

  useEffect(() => {
    setClientEmailDraft(emailClient?.email ?? '');
  }, [emailClient?.id, emailClient?.email]);

  useEffect(() => {
    setClientPhoneDraft(phoneClient?.phone ?? '');
  }, [phoneClient?.id, phoneClient?.phone]);

  const attachClient = useMutation({
    mutationFn: async () => {
      return attachInvoiceClient({
        invoiceId: savedId ?? invoice?.id,
        invoiceClientId: form.client_id || invoice?.client_id || null,
        clientId: clientAttachDraft,
        companyClients: clients,
      });
    },
    onSuccess: (result) => {
      setForm(f => ({ ...f, client_id: result.clientId }));
      setClientAttachDraft('');
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice'] });
      queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      const toast = invoiceClientAttachToast();
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
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice'] });
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
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['invoice'] });
      queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      const toast = jobClientPhoneSaveToast(result.phone);
      showToast(toast.message, toast.kind);
    },
    onError: (e: Error) => showToast(e.message, 'info'),
  });
  const rawSubtotal = useMemo(() => calcSubtotal(form.line_items), [form.line_items]);
  const gst = useMemo(
    () => calcDocumentTotals(rawSubtotal, parseFloat(form.tax_rate) || 0),
    [rawSubtotal, form.tax_rate],
  );
  const { subtotal, taxAmount, total: grandTotal } = gst;
  const next = recommendInvoiceAction(invoiceActionContext({
    status: form.status,
    due_date: form.due_date,
    client_id: form.client_id || null,
    client_email: emailClient?.email,
    line_items: form.line_items,
  }, { smtpReady }));
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
      clientDetail: quoteClientDetailFromClient(selectedClient, selectedJob?.address),
      company: commercialPdfCompanyFrom(company),
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
  }, [company, form, invoice, selectedClient, selectedJob, subtotal, taxAmount, grandTotal]);

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

  const persist = async (status: InvoiceStatus, opts?: {
    close?: boolean;
    message?: string;
    markPaid?: boolean;
  }): Promise<string | null> => {
    if (!profile?.company_id) return null;
    if (!form.client_id) { setErr('Please select a client'); return null; }
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
    if (cleanLines.length === 0) { setErr('Add at least one line item'); return null; }
    setSaving(true); setErr(''); setXeroMiss('');
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
    const finishPaid = async (savedInvoiceId: string): Promise<string | null> => {
      setForm(f => ({ ...f, status: storedStatus }));
      if (opts?.markPaid && storedStatus === 'paid') {
        const xero = await attachXeroPaymentAfterMarkPaid(
          (name, invokeOpts) => supabase.functions.invoke(name, invokeOpts),
          { paidSucceeded: true, invoiceId: savedInvoiceId, status: 'paid' },
        );
        const receipt = await deliverInvoiceReceiptAfterMarkPaid(
          (name, invokeOpts) => supabase.functions.invoke(name, invokeOpts),
          {
            paidSucceeded: true,
            invoiceId: savedInvoiceId,
            status: 'paid',
            company: invoiceSendCompanyFrom(company),
          },
        );
        const xeroLine = invoiceMarkPaidXeroMissLine(xero);
        setXeroMiss(invoiceMarkPaidSheetMissLine({ xeroLine, receipt }) ?? '');
        return invoiceMarkPaidReceiptToast({ xeroToast: invoiceMarkPaidToast(xero), receipt });
      }
      return null;
    };

    const id = savedId ?? invoice?.id;
    if (id) {
      const { error } = await supabase.from('invoices').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) {
        setSaving(false);
        if (error.code === '23505') {
          setErr('An invoice already exists for this quote');
          return null;
        }
        setErr(error.message);
        return null;
      }
      const paidToast = await finishPaid(id);
      setSaving(false);
      onSaved({ close: opts?.close ?? false, message: paidToast ?? opts?.message ?? 'Invoice updated' });
      return id;
    }
    const { data, error } = await supabase.from('invoices').insert({
      ...payload,
      source: form.quote_id ? INVOICE_SOURCE_QUOTE : null,
      company_id: profile.company_id,
      created_by: profile.id,
    }).select('id').single();
    if (error) {
      setSaving(false);
      if (error.code === '23505') {
        setErr('An invoice already exists for this quote');
        return null;
      }
      setErr(error.message);
      return null;
    }
    setSavedId(data.id as string);
    const paidToast = await finishPaid(data.id as string);
    setSaving(false);
    onSaved({ close: opts?.close ?? true, message: paidToast ?? opts?.message ?? 'Invoice created' });
    return data.id as string;
  };

  const startSend = async () => {
    const keep = form.status === 'paid' ? 'paid' : form.status === 'sent' ? 'sent' : 'draft';
    const id = await persist(keep, { close: false, message: '' });
    if (id) onRequestSend(id);
  };

  const editorMoney = invoiceMoney(grandTotal);
  const editorSite = visibleSite(selectedJob?.address, selectedClient?.address);
  const editorTitle = invoice?.invoice_number != null ? invoiceTitle(invoice) : 'New invoice';
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
      <div className="overlay-panel-xl hub-invoice-editor" onClick={e => e.stopPropagation()}>
        <div className="hub-invoice-toolbar">
          <div className="hub-invoice-editor-act">
            {next.key === 'setup_email' && next.href && (
              <Link to={next.href} className="btn-primary" title={next.detail}>
                Set up email
              </Link>
            )}
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
                {saving ? 'Saving...' : next.status === 'overdue' ? 'Send again' : 'Send invoice'}
              </button>
            )}
            {next.key === 'mark_paid' && (
              <button
                type="button"
                onClick={() => void persist('paid', {
                  close: false,
                  message: INVOICE_MARKED_PAID_MESSAGE,
                  markPaid: true,
                })}
                disabled={saving}
                className="btn-primary"
              >
                {saving ? 'Saving...' : 'Mark paid'}
              </button>
            )}
            <details ref={moreRef} className="hub-invoice-more">
              <summary aria-label="More actions">
                <MoreHorizontal size={18} />
              </summary>
              <div className="hub-invoice-more-menu" role="menu">
                {form.status !== 'paid' && next.key !== 'mark_paid' && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { closeMore(); void persist('paid', { close: false, message: INVOICE_MARKED_PAID_MESSAGE, markPaid: true }); }}
                    disabled={saving}
                  >
                    Mark paid
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
                  {saving ? 'Saving...' : invoice || savedId ? 'Save' : 'Save draft'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { closeMore(); setShowEdit(true); }}
                >
                  Edit invoice
                </button>
              </div>
            </details>
            <button type="button" onClick={onClose} className="hub-invoice-close" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        </div>
        {err ? <p className="hub-invoice-err">{err}</p> : null}
        {xeroMiss ? <p className="hub-invoice-send-xero-miss">{xeroMiss}</p> : null}

        <div className="hub-invoice-sheet">
          <div className="hub-invoice-banner">
            <div className="hub-invoice-banner-mark">
              <p className="hub-invoice-kicker">Invoice</p>
              <h2 className="hub-invoice-editor-title">{editorTitle}</h2>
              <p className="hub-invoice-banner-meta">
                {INVOICE_STATUS_LABELS[displayStatus]}
                {form.due_date ? ` · Due ${format(parseISO(form.due_date), 'd MMM yyyy')}` : ''}
              </p>
            </div>
          </div>

          <div className="hub-invoice-letterhead">
            <div className="min-w-0">
              <p className="hub-invoice-kicker">From</p>
              <p className="hub-invoice-from-name">{company?.name ?? 'Your company'}</p>
              {company?.abn ? <p className="hub-invoice-muted">ABN {company.abn}</p> : null}
              {company?.licence_number ? <p className="hub-invoice-muted">Lic {company.licence_number}</p> : null}
            </div>
            <div className="min-w-0">
              <p className="hub-invoice-kicker">Bill to</p>
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
                <p className="hub-invoice-muted">{INVOICE_CLIENT_ATTACH_NO_CLIENTS}</p>
              ) : (
                <>
                  {selectedClient?.name ? <p className="hub-invoice-to-name">{selectedClient.name}</p> : null}
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

          <div className="hub-invoice-table">
            <table className="hub-invoice-lines">
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
                      <td className="hub-invoice-num">{qty}</td>
                      <td className="hub-invoice-num">{formatMoney(unit)}</td>
                      <td className="hub-invoice-num">{formatMoney(qty * unit)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="hub-invoice-gst">
            <span>Subtotal (ex GST)</span>
            <span className="hub-invoice-num">{formatMoney(subtotal)}</span>
            <span>{gstLabel(parseFloat(form.tax_rate) || 0)}</span>
            <span className="hub-invoice-num">{formatMoney(taxAmount)}</span>
          </div>
          {editorMoney ? (
            <div className="hub-invoice-totalbar">
              <span>Total (inc GST)</span>
              <span className="hub-invoice-num">{editorMoney}</span>
            </div>
          ) : null}
        </div>

        {showEdit ? (
        <div className="hub-invoice-edit">
        <div className="overlay-body hub-invoice-editor-body">
          <Field label="Client" required>
            <select value={form.client_id} onChange={e => setForm(f => ({ ...f, client_id: e.target.value, job_id: '', quote_id: '' }))} className="form-input cursor-pointer">
              <option value="">Select a client...</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {selectedClient && (
              <div className="mt-2 flex flex-col gap-1">
                {visibleClientContacts(selectedClient).map(line => (
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
              </div>
            )}
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

          <div className="hub-invoice-editor-math">
            <DocumentGstTotals
              subtotal={subtotal}
              taxRate={parseFloat(form.tax_rate) || 0}
              taxAmount={taxAmount}
              total={grandTotal}
            />
          </div>

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

          {err && <p className="text-sm text-fail">{err}</p>}
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
      <label className="block ops-meta font-medium mb-1">{label}{required && <span className="hub-invoice-req"> *</span>}</label>
      {children}
    </div>
  );
}
