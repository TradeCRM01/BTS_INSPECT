import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, ContextMenu, useToast, OpsSiteRow } from '../components/ui';
import type { MenuEntry } from '../components/ui';
import { EnquiryConversation, useEnquiryConversation } from '../components/crm/EnquiryConversation';
import { conversationLookClientPhone } from '../lib/enquiryConversation';
import { lookParam } from '../lib/lookParam';
import { JobRelatedSection, JobRelatedRow } from '../components/jobs/JobRelatedSection';
import { resolveTenantTimeZone } from '../lib/tenantTimeZone';
import type { Client, JobWithClient } from '../types/crm';
import {
  formatMoney,
} from '../types/fsm';
import type { QuoteStatus } from '../types/fsm';
import { Plus, FileText, ShieldCheck, Receipt, ClipboardList, Mail, Phone, CreditCard as Edit3 } from 'lucide-react';
import { getAuditClient, getAuditClientInvoices, getAuditClientQuotes, getAuditEmptyList, getAuditJobs } from '../lib/devFieldAuditDocs';
import { FIELD_AU_PHONE, FIELD_EMAIL } from '../lib/fieldValidation';
import {
  decideJobClientEmailSave,
  jobClientEmailRow,
  jobClientEmailSaveToast,
  saveJobClientEmail,
} from '../lib/saveJobClientEmail';
import {
  decideJobClientPhoneSave,
  jobClientPhoneRow,
  jobClientPhoneSaveToast,
  saveJobClientPhone,
} from '../lib/saveJobClientPhone';
import { differenceInDays } from 'date-fns';
import { HOTFIX_BAD_DATE_ISO, parseToDate, safeFormatDate } from '../lib/safeDate';
import { ClientForm } from './ClientsPage';
import type { ComplianceItem } from '../types/compliance';
import { jobOpenNext } from '../lib/jobNextAction';
import { quoteActionContext, recommendQuoteAction } from '../lib/quoteNextAction';
import { recommendInvoiceAction } from '../lib/invoiceNextAction';
import { pickReusableInvoice } from '../lib/invoiceFromQuote';
import { padQuoteNumber } from '../lib/quoteJobFields';
import {
  inspectionListContext,
  inspectionOpenPath,
  recommendInspectionListAction,
} from '../lib/inspectionNextAction';
import { withInspectionDueNext } from '../lib/inspectionDueReminder';
import type { TemplateSchema } from '../types/template';
import {
  applyHubScope,
  clientHubRecordQueries,
  clientHubStartAction,
  clientInspectionQuery,
  clientMoneySummary,
  invoiceRecordHref,
  quoteRecordHref,
  quoteTrayActionHref,
} from '../lib/clientRecords';
import {
  clientJobFloorMeta,
  clientJobFloorTitle,
  clientInvoiceJobRef,
  clientJobOpenHref,
  clientJobStatusLabel,
  clientJobsEmptyTitle,
  formatClientJobDate,
  padClientJobNumber,
  sortClientJobsForFloor,
} from '../lib/clientsFloor';
import { listQueryBusy } from '../lib/listQueryReady';

type ClientQuote = {
  id: string;
  quote_number: number | null;
  status: QuoteStatus;
  total: number;
  description: string | null;
  job_id: string | null;
  client_id: string | null;
  line_items: { description?: string | null; quantity?: number | string | null }[] | null;
};

type ClientInvoice = {
  id: string;
  invoice_number: number | null;
  status: string;
  total: number;
  due_date: string | null;
  quote_id: string | null;
  job_id: string | null;
};

type ClientInspection = {
  id: string;
  status: string;
  started_at: string;
  crm_job_id: string | null;
  meta: Record<string, string> | null;
  responses: Record<string, unknown> | null;
  template_snapshot: { name?: string; schema?: TemplateSchema } | null;
  due_on?: string | null;
};

function padNum(n: number | null | undefined): string {
  return String(n ?? 0).padStart(4, '0');
}

function visibleSite(...parts: Array<string | null | undefined>): string {
  for (const part of parts) {
    const trimmed = part?.trim();
    if (trimmed && trimmed !== 'No site address') return trimmed;
  }
  return '';
}

const nextQuiet = 'hub-next shrink-0';

function clientRecordMenu(
  navigate: ReturnType<typeof useNavigate>,
  quoteHref: string,
  invoiceHref: string,
  onEdit: () => void,
): MenuEntry[] {
  return [
    { label: 'New quote', icon: FileText, onClick: () => navigate(quoteHref) },
    { label: 'New invoice', icon: Receipt, onClick: () => navigate(invoiceHref) },
    { divider: true },
    { label: 'Edit', icon: Edit3, onClick: onEdit },
  ];
}

/** Honest no-email miss on this card — write the address below. Not a send line. */
export const CLIENT_SHEET_NO_EMAIL =
  'This client has no email. Add one below.';
/** Honest no-phone miss on this card — write the number below. Not a send line. */
export const CLIENT_SHEET_NO_PHONE =
  'This client has no phone. Add one below.';

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile, company } = useAuth();
  const [searchParams] = useSearchParams();
  const look = lookParam(searchParams);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showEdit, setShowEdit] = useState(false);
  const [clientEmailDraft, setClientEmailDraft] = useState('');
  const [clientPhoneDraft, setClientPhoneDraft] = useState('');
  const [clientEmailError, setClientEmailError] = useState('');
  const [clientPhoneError, setClientPhoneError] = useState('');

  const { data: client, isLoading, error } = useQuery<Client>({
    queryKey: ['client', id],
    queryFn: async () => {
      const mock = getAuditClient(id!);
      if (mock) return mock as Client;
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id!)
        .eq('company_id', profile!.company_id)
        .maybeSingle();
      if (error) throw error;
      return data as Client;
    },
    enabled: !!id && !!profile?.company_id,
  });

  const hubScopes = id && profile?.company_id
    ? clientHubRecordQueries({ companyId: profile.company_id, clientId: id })
    : null;

  const { data: jobs, isPending: jobsPending, isError: jobsError, refetch: refetchJobs } = useQuery<JobWithClient[]>({
    queryKey: ['client-jobs', id, profile?.company_id],
    queryFn: async () => {
      const mock = getAuditJobs();
      if (mock) {
        return mock.filter(job => !id || job.client_id === id) as JobWithClient[];
      }
      const { data, error } = await applyHubScope(supabase.from('jobs'), hubScopes!.jobs)
        .order('scheduled_date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as JobWithClient[];
    },
    enabled: !!hubScopes,
  });

  const { data: quotes, isPending: quotesPending, isError: quotesError, refetch: refetchQuotes } = useQuery<ClientQuote[]>({
    queryKey: ['client-quotes', id, profile?.company_id],
    queryFn: async () => {
      const auditQuotes = getAuditClientQuotes();
      if (auditQuotes) return auditQuotes as ClientQuote[];
      const empty = getAuditEmptyList();
      if (empty) return empty as ClientQuote[];
      const { data, error } = await applyHubScope(supabase.from('quotes'), hubScopes!.quotes)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientQuote[];
    },
    enabled: !!hubScopes,
  });

  const { data: invoices, isPending: invoicesPending, isError: invoicesError, refetch: refetchInvoices } = useQuery<ClientInvoice[]>({
    queryKey: ['client-invoices', id, profile?.company_id],
    queryFn: async () => {
      const auditInvoices = getAuditClientInvoices();
      if (auditInvoices) return auditInvoices as ClientInvoice[];
      const empty = getAuditEmptyList();
      if (empty) return empty as ClientInvoice[];
      const { data, error } = await applyHubScope(supabase.from('invoices'), hubScopes!.invoices)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientInvoice[];
    },
    enabled: !!hubScopes,
  });

  const { data: complianceItems, isPending: compliancePending, isError: complianceError, refetch: refetchCompliance } = useQuery<ComplianceItem[]>({
    queryKey: ['client-compliance', id],
    queryFn: async () => {
      if (look === 'hotfix-date-bad') {
        return [{
          id: 'hotfix-date-bad',
          company_id: profile!.company_id,
          client_id: id!,
          title: 'Backflow test delete ok',
          description: null,
          standard_or_regulation: null,
          recurrence_interval: 12,
          recurrence_unit: 'months' as const,
          first_due_date: HOTFIX_BAD_DATE_ISO,
          last_completed_date: null,
          next_due_date: HOTFIX_BAD_DATE_ISO,
          reminder_days_before: 30,
          reminder_sent_at: null,
          status: 'upcoming' as const,
          linked_job_id: null,
          notes: null,
          created_at: '2026-10-19T00:00:00.000Z',
          updated_at: '2026-10-19T00:00:00.000Z',
        }] as ComplianceItem[];
      }
      const empty = getAuditEmptyList();
      if (empty) return empty as ComplianceItem[];
      const { data, error } = await supabase
        .from('compliance_items')
        .select('*')
        .eq('client_id', id!)
        .order('next_due_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ComplianceItem[];
    },
    enabled: !!id && !!profile,
  });

  const jobIds = (jobs ?? []).map(job => job.id);
  const inspectionScope = clientInspectionQuery(jobIds);

  const { data: inspections, isPending: inspectionsPending, isError: inspectionsError, refetch: refetchInspections } = useQuery<ClientInspection[]>({
    queryKey: ['client-inspections', id, jobIds.join(',')],
    queryFn: async () => {
      const empty = getAuditEmptyList();
      if (empty) return empty as ClientInspection[];
      if (!inspectionScope) return [];
      const { data, error } = await applyHubScope(supabase.from('inspections'), inspectionScope)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientInspection[];
    },
    enabled: !!id && !!profile && jobs !== undefined,
  });

  useEffect(() => {
    setClientEmailDraft(client?.email ?? '');
  }, [client?.id, client?.email]);

  useEffect(() => {
    setClientPhoneDraft(client?.phone ?? '');
  }, [client?.id, client?.phone]);

  const saveClientEmail = useMutation({
    mutationFn: async () => {
      return saveJobClientEmail({
        clientId: client?.id,
        email: clientEmailDraft,
      });
    },
    retry: 0,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
      setClientEmailDraft(result.email ?? '');
      const toast = jobClientEmailSaveToast(result.email);
      showToast(toast.message, toast.kind);
    },
    onError: (e: Error) => setClientEmailError(e.message),
  });

  const saveClientPhone = useMutation({
    mutationFn: async () => {
      return saveJobClientPhone({
        clientId: client?.id,
        phone: clientPhoneDraft,
      });
    },
    retry: 0,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
      setClientPhoneDraft(result.phone ?? '');
      const toast = jobClientPhoneSaveToast(result.phone);
      showToast(toast.message, toast.kind);
    },
    onError: (e: Error) => setClientPhoneError(e.message),
  });

  const conversationMessages = useEnquiryConversation({
    look,
    companyId: profile?.company_id,
    callerPhone: conversationLookClientPhone(look, client?.phone),
  });
  const tenantTimeZone = resolveTenantTimeZone(
    (company as { time_zone?: string | null } | null)?.time_zone,
  );

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><LoadingSpinner /></div></AppShell>;
  if (error || !client) return <AppShell><PageError message="Could not load this client" /></AppShell>;

  const newQuoteHref = clientHubStartAction('quote', client.id).href;
  const newJobHref = clientHubStartAction('job', client.id).href;
  const newInvoiceHref = clientHubStartAction('invoice', client.id).href;
  const moneyReady = quotes !== undefined && invoices !== undefined;
  const money = clientMoneySummary(quotes ?? [], invoices ?? []);
  const jobsBusy = listQueryBusy({ isPending: jobsPending, isError: jobsError, data: jobs });
  const quotesBusy = listQueryBusy({ isPending: quotesPending, isError: quotesError, data: quotes });
  const invoicesBusy = listQueryBusy({ isPending: invoicesPending, isError: invoicesError, data: invoices });
  const complianceBusy = listQueryBusy({ isPending: compliancePending, isError: complianceError, data: complianceItems });
  const inspectionsBusy = listQueryBusy({
    isPending: inspectionsPending,
    isError: jobsError || inspectionsError,
    data: inspections,
  });
  const inspectionsFailed = jobsError || inspectionsError;
  const floorJobs = sortClientJobsForFloor(jobs ?? []);
  const jobById = new Map(floorJobs.map(job => [job.id, job]));
  const emailRow = jobClientEmailRow({ clientId: client.id, client });
  const phoneRow = jobClientPhoneRow({ clientId: client.id, client });
  const site = visibleSite(client.address);
  const when = formatClientJobDate(client.created_at);
  const jobline = client.contact_person?.trim() || '';

  return (
    <AppShell>
      <div className="ops-page hub-clients is-record-open">
        <div className="hub-clients-open-chrome">
          <Link to="/clients" className="hub-clients-label">Clients</Link>
        </div>

        <article className="hub-clients-document">
          <header className="hub-clients-sheet-bar">
            <span className="hub-clients-hours">{when || 'Client'}</span>
            <span className="hub-clients-pill">{client.archived ? 'Archived' : 'Active'}</span>
          </header>
          <div className="hub-clients-sheet-body">
            <h1 className="hub-clients-hero">{client.name}</h1>
            {jobline ? <p className="hub-clients-jobline">{jobline}</p> : null}

            <div className="hub-clients-tools">
              <Link to={newJobHref} className="btn-primary">
                <Plus size={16} /> New job
              </Link>
              <button type="button" className="hub-clients-sub" onClick={() => setShowEdit(true)}>
                Edit
              </button>
              <div className="hub-clients-more">
                <ContextMenu items={clientRecordMenu(navigate, newQuoteHref, newInvoiceHref, () => setShowEdit(true))} />
              </div>
            </div>

            <div className="hub-clients-ledger">
              {site ? (
                <div className="hub-clients-ledger-row">
                  <OpsSiteRow
                    hub
                    site={site}
                    mapsQuery={client.address}
                  />
                </div>
              ) : null}
              <div className="client-sheet-contact">
                {phoneRow.kind === 'edit' && (
                  <p className="client-sheet-miss">{CLIENT_SHEET_NO_PHONE}</p>
                )}
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
                      const phoneDecision = decideJobClientPhoneSave({
                        clientId: client.id,
                        phone: clientPhoneDraft,
                      });
                      if (phoneDecision.action === 'miss') {
                        setClientPhoneError(FIELD_AU_PHONE);
                        return;
                      }
                      setClientPhoneError('');
                      saveClientPhone.mutate();
                    }}
                  >
                    <Phone size={13} />
                    <input
                      type="tel"
                      value={clientPhoneDraft}
                      onChange={e => {
                        setClientPhoneDraft(e.target.value);
                        setClientPhoneError('');
                      }}
                      placeholder="Phone"
                      className={clientPhoneError ? 'form-input-sm field-inline-invalid' : 'form-input-sm'}
                      aria-label="Client phone"
                      autoComplete="tel"
                      inputMode="tel"
                      aria-invalid={clientPhoneError ? true : undefined}
                      aria-describedby={clientPhoneError ? 'client-card-phone-error' : undefined}
                    />
                    <button
                      type="submit"
                      className="job-client-phone-save"
                      disabled={saveClientPhone.isPending}
                    >
                      Save
                    </button>
                    {clientPhoneError ? <p id="client-card-phone-error" className="field-inline-error text-fail">{clientPhoneError}</p> : null}
                  </form>
                )}
                {emailRow.kind === 'edit' && (
                  <p className="client-sheet-miss">{CLIENT_SHEET_NO_EMAIL}</p>
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
                      const emailDecision = decideJobClientEmailSave({
                        clientId: client.id,
                        email: clientEmailDraft,
                      });
                      if (emailDecision.action === 'miss') {
                        setClientEmailError(FIELD_EMAIL);
                        return;
                      }
                      setClientEmailError('');
                      saveClientEmail.mutate();
                    }}
                  >
                    <Mail size={13} />
                    <input
                      type="text"
                      inputMode="email"
                      value={clientEmailDraft}
                      onChange={e => {
                        setClientEmailDraft(e.target.value);
                        setClientEmailError('');
                      }}
                      placeholder="Email"
                      className={clientEmailError ? 'form-input-sm field-inline-invalid' : 'form-input-sm'}
                      aria-label="Client email"
                      autoComplete="email"
                      aria-invalid={clientEmailError ? true : undefined}
                      aria-describedby={clientEmailError ? 'client-card-email-error' : undefined}
                    />
                    <button
                      type="submit"
                      className="job-client-email-save"
                      disabled={saveClientEmail.isPending}
                    >
                      Save
                    </button>
                    {clientEmailError ? <p id="client-card-email-error" className="field-inline-error text-fail">{clientEmailError}</p> : null}
                  </form>
                )}
              </div>
              <EnquiryConversation messages={conversationMessages} timeZone={tenantTimeZone} />
              {client.notes ? (
                <p className="hub-clients-ledger-row">
                  <span className="hub-clients-muted">{client.notes}</span>
                </p>
              ) : null}
              <HubMoney ready={moneyReady} overdue={money.overdue} outstanding={money.outstanding} />
              {jobsBusy ? (
                <div className="hub-clients-ledger-row" aria-busy="true" data-jobs-loading="1">
                  <div className="skeleton h-4 w-2/3 rounded" />
                </div>
              ) : jobsError ? (
                <div className="hub-clients-ledger-row hub-clients-jobs-empty">
                  <p className="hub-clients-muted">
                    {clientJobsEmptyTitle({ error: jobsError, count: floorJobs.length }) || "Couldn't load jobs."}
                    {' '}
                    <button type="button" className="hub-clients-next" onClick={() => { void refetchJobs(); }}>Retry</button>
                  </p>
                </div>
              ) : floorJobs.length === 0 ? (
                <div className="hub-clients-ledger-row hub-clients-jobs-empty">
                  <p>{clientJobsEmptyTitle({ error: jobsError, count: floorJobs.length }) || 'No jobs yet'}</p>
                  <Link to={newJobHref} className="hub-clients-next">New job</Link>
                </div>
              ) : floorJobs.map(job => {
                const next = jobOpenNext(job);
                const href = clientJobOpenHref(job.id);
                const status = clientJobStatusLabel(job.status) ?? '';
                const title = clientJobFloorTitle(job);
                const ref = job.job_number != null ? `#${padClientJobNumber(job.job_number)}` : '';
                return (
                  <div
                    key={job.id}
                    role="link"
                    tabIndex={0}
                    onClick={() => navigate(href)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(href); } }}
                    className="hub-clients-ledger-row hub-clients-job-row"
                    title={clientJobFloorMeta(job)}
                  >
                    <span className="min-w-0">
                      {ref ? <span className="hub-clients-ref">{ref}</span> : null}
                      {ref && title ? ' ' : null}
                      <span className="truncate">{title}</span>
                      {status ? <span className="hub-clients-muted"> · {status}</span> : null}
                    </span>
                    <span className="hub-clients-row-next" onClick={e => e.stopPropagation()}>
                      {next.actionable ? (
                        <Link to={next.href} className={nextQuiet}>{next.label}</Link>
                      ) : (
                        <span className="hub-clients-muted">{next.label}</span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="hub-trays hub-clients-more-trays">
          <JobRelatedSection
            title="Quotes"
            icon={FileText}
            count={(quotes ?? []).length}
            loading={quotesBusy}
            error={quotesError}
            errorThing="quotes"
            onRetry={() => { void refetchQuotes(); }}
            action={<Link to={newQuoteHref} className="ops-link">New quote</Link>}
            emptyTitle="No quotes yet"
            emptyAction={<Link to={newQuoteHref} className="ops-link">New quote</Link>}
          >
            {(quotes ?? []).map(quote => {
              const invoiceId = pickReusableInvoice(
                (invoices ?? []).filter(inv => inv.quote_id === quote.id),
              )?.id ?? null;
              const jobStatus = quote.job_id
                ? floorJobs.find(job => job.id === quote.job_id)?.status ?? null
                : null;
              const next = recommendQuoteAction(quoteActionContext({
                ...quote,
                invoice_id: invoiceId,
                job_status: jobStatus,
              }));
              const actionHref = quoteTrayActionHref({
                key: next.key,
                quoteId: quote.id,
                jobId: quote.job_id,
              });
              return (
                <JobRelatedRow
                  key={quote.id}
                  href={quoteRecordHref(quote.id)}
                  icon={FileText}
                  title={`Quote #${padQuoteNumber(quote.quote_number)}`}
                  meta={[quote.description?.trim() || null, formatMoney(Number(quote.total))].filter(Boolean).join(' · ')}
                  action={
                    next.key === 'none' ? null : (
                      <Link
                        to={actionHref}
                        className={nextQuiet}
                        data-quote-tray-action={next.key}
                      >
                        {next.label}
                      </Link>
                    )
                  }
                />
              );
            })}
          </JobRelatedSection>

          <JobRelatedSection
            title="Invoices"
            icon={Receipt}
            count={(invoices ?? []).length}
            loading={invoicesBusy}
            error={invoicesError}
            errorThing="invoices"
            onRetry={() => { void refetchInvoices(); }}
            action={<Link to={newInvoiceHref} className="ops-link">New invoice</Link>}
            emptyTitle="No invoices yet"
            emptyAction={<Link to={newInvoiceHref} className="ops-link">New invoice</Link>}
          >
            {(invoices ?? []).map(inv => {
              const next = recommendInvoiceAction(inv);
              const jobRef = clientInvoiceJobRef({
                jobId: inv.job_id,
                quoteId: inv.quote_id,
                jobs: floorJobs,
                quotes: quotes ?? [],
              });
              return (
                <JobRelatedRow
                  key={inv.id}
                  href={invoiceRecordHref(inv.id)}
                  icon={Receipt}
                  title={`Invoice #${padNum(inv.invoice_number)}`}
                  meta={[
                    jobRef ? `Job ${jobRef}` : null,
                    formatMoney(Number(inv.total)),
                    inv.due_date ? `Due ${safeFormatDate(inv.due_date, 'd MMM yyyy')}` : null,
                  ].filter(Boolean).join(' · ')}
                  action={
                    next.key === 'none' ? null : (
                      <Link to={invoiceRecordHref(inv.id)} className={nextQuiet}>{next.label}</Link>
                    )
                  }
                />
              );
            })}
          </JobRelatedSection>

          <JobRelatedSection
            title="Inspections"
            icon={ClipboardList}
            count={(inspections ?? []).length}
            loading={inspectionsBusy}
            error={inspectionsFailed}
            errorThing="inspections"
            onRetry={() => {
              if (jobsError) void refetchJobs();
              void refetchInspections();
            }}
            emptyTitle={jobIds.length === 0
              ? 'Inspections attach to jobs. Add a job first.'
              : 'No inspections on this client\'s jobs yet.'}
            emptyAction={jobIds.length === 0
              ? <Link to={newJobHref} className="ops-link">New job</Link>
              : undefined}
          >
            {(inspections ?? []).map(insp => {
              const job = insp.crm_job_id ? jobById.get(insp.crm_job_id) : undefined;
              const recommended = recommendInspectionListAction(inspectionListContext({
                status: insp.status,
                meta: insp.meta,
                job_title: job?.title ?? null,
                job_address: job?.address ?? null,
                template_snapshot: insp.template_snapshot,
                responses: insp.responses,
              }));
              const next = withInspectionDueNext(
                insp,
                job ? {
                  id: job.id,
                  company_id: job.company_id,
                  client_id: job.client_id,
                  scheduled_date: job.scheduled_date,
                  job_number: job.job_number,
                  title: job.title,
                  address: job.address,
                } : null,
                { href: inspectionOpenPath(insp.id, recommended.key), label: recommended.label, actionable: true },
              );
              return (
                <JobRelatedRow
                  key={insp.id}
                  href={next.href}
                  icon={ClipboardList}
                  title={insp.template_snapshot?.name ?? 'Inspection'}
                  meta={[
                    job ? visibleSite(job.address, job.title) || null : null,
                    safeFormatDate(insp.started_at, 'd MMM yyyy'),
                  ].filter(Boolean).join(' · ')}
                  action={
                    <Link to={next.href} className={nextQuiet}>
                      {next.label}
                    </Link>
                  }
                />
              );
            })}
          </JobRelatedSection>

          <JobRelatedSection
            title="Compliance"
            icon={ShieldCheck}
            count={(complianceItems ?? []).length}
            loading={complianceBusy}
            error={complianceError}
            errorThing="compliance"
            onRetry={() => { void refetchCompliance(); }}
            action={<Link to="/compliance" className="ops-link">View all</Link>}
            emptyTitle="No compliance items on this client yet."
            emptyAction={<Link to="/compliance" className="ops-link">View all</Link>}
          >
            {(complianceItems ?? []).map(ci => {
              const due = parseToDate(ci.next_due_date);
              const daysUntil = due ? differenceInDays(due, new Date()) : null;
              return (
                <JobRelatedRow
                  key={ci.id}
                  href="/compliance"
                  icon={ShieldCheck}
                  title={ci.title}
                  meta={[
                    `Due ${safeFormatDate(ci.next_due_date, 'd MMM yyyy')}`,
                    daysUntil == null ? null : daysUntil < 0 ? `${Math.abs(daysUntil)} days overdue` : daysUntil <= 30 ? `in ${daysUntil} days` : null,
                    ci.reminder_sent_at ? `Reminded ${safeFormatDate(ci.reminder_sent_at, 'd MMM')}` : null,
                  ].filter(Boolean).join(' · ')}
                  action={null}
                />
              );
            })}
          </JobRelatedSection>
            </div>
          </div>
        </article>
      </div>

      {showEdit && (
        <ClientForm
          client={client}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false);
            queryClient.invalidateQueries({ queryKey: ['client', id] });
            queryClient.invalidateQueries({ queryKey: ['clients'] });
            showToast('Client updated');
          }}
        />
      )}
    </AppShell>
  );
}

function HubMoney({
  ready,
  overdue,
  outstanding,
}: {
  ready: boolean;
  overdue: number;
  outstanding: number;
}) {
  if (!ready) return null;
  if (overdue > 0) {
    return (
      <p className="hub-clients-ledger-row">
        <span className="hub-clients-muted">Overdue</span>
        <span className="hub-clients-hours text-fail">{formatMoney(overdue)}</span>
      </p>
    );
  }
  if (outstanding > 0) {
    return (
      <p className="hub-clients-ledger-row">
        <span className="hub-clients-muted">Outstanding</span>
        <span className="hub-clients-hours">{formatMoney(outstanding)}</span>
      </p>
    );
  }
  return null;
}
