import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, ContextMenu, useToast, OpsSiteRow } from '../components/ui';
import type { MenuEntry } from '../components/ui';
import { JobRelatedSection, JobRelatedRow } from '../components/jobs/JobRelatedSection';
import type { Client, JobWithClient } from '../types/crm';
import {
  formatMoney,
} from '../types/fsm';
import type { QuoteStatus } from '../types/fsm';
import { Plus, FileText, ShieldCheck, Receipt, ClipboardList, Mail, Phone, CreditCard as Edit3 } from 'lucide-react';
import { getAuditClient, getAuditEmptyList, getAuditJobs } from '../lib/devFieldAuditDocs';
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
import { format, parseISO, differenceInDays } from 'date-fns';
import { ClientForm } from './ClientsPage';
import type { ComplianceItem } from '../types/compliance';
import { jobListNext } from '../lib/jobNextAction';
import { withReminderNext } from '../lib/jobReminder';
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
} from '../lib/clientRecords';
import {
  clientJobFloorMeta,
  clientJobFloorTitle,
  clientJobOpenHref,
  clientJobStatusLabel,
  clientJobsEmptyTitle,
  formatClientJobDate,
  padClientJobNumber,
  sortClientJobsForFloor,
} from '../lib/clientsFloor';

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
  const { profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showEdit, setShowEdit] = useState(false);
  const [clientEmailDraft, setClientEmailDraft] = useState('');
  const [clientPhoneDraft, setClientPhoneDraft] = useState('');

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

  const { data: jobs, isError: jobsError } = useQuery<JobWithClient[]>({
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

  const { data: quotes } = useQuery<ClientQuote[]>({
    queryKey: ['client-quotes', id, profile?.company_id],
    queryFn: async () => {
      const empty = getAuditEmptyList();
      if (empty) return empty as ClientQuote[];
      const { data, error } = await applyHubScope(supabase.from('quotes'), hubScopes!.quotes)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientQuote[];
    },
    enabled: !!hubScopes,
  });

  const { data: invoices } = useQuery<ClientInvoice[]>({
    queryKey: ['client-invoices', id, profile?.company_id],
    queryFn: async () => {
      const empty = getAuditEmptyList();
      if (empty) return empty as ClientInvoice[];
      const { data, error } = await applyHubScope(supabase.from('invoices'), hubScopes!.invoices)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientInvoice[];
    },
    enabled: !!hubScopes,
  });

  const { data: complianceItems } = useQuery<ComplianceItem[]>({
    queryKey: ['client-compliance', id],
    queryFn: async () => {
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

  const { data: inspections } = useQuery<ClientInspection[]>({
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
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
      setClientEmailDraft(result.email ?? '');
      const toast = jobClientEmailSaveToast(result.email);
      showToast(toast.message, toast.kind);
    },
    onError: (e: Error) => showToast(e.message, 'info'),
  });

  const saveClientPhone = useMutation({
    mutationFn: async () => {
      return saveJobClientPhone({
        clientId: client?.id,
        phone: clientPhoneDraft,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['client', id] });
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
      setClientPhoneDraft(result.phone ?? '');
      const toast = jobClientPhoneSaveToast(result.phone);
      showToast(toast.message, toast.kind);
    },
    onError: (e: Error) => showToast(e.message, 'info'),
  });

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><LoadingSpinner /></div></AppShell>;
  if (error || !client) return <AppShell><PageError message="Could not load this client" /></AppShell>;

  const newQuoteHref = clientHubStartAction('quote', client.id).href;
  const newJobHref = clientHubStartAction('job', client.id).href;
  const newInvoiceHref = clientHubStartAction('invoice', client.id).href;
  const moneyReady = quotes !== undefined && invoices !== undefined;
  const money = clientMoneySummary(quotes ?? [], invoices ?? []);
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
              {client.notes ? (
                <p className="hub-clients-ledger-row">
                  <span className="hub-clients-muted">{client.notes}</span>
                </p>
              ) : null}
              <HubMoney ready={moneyReady} overdue={money.overdue} outstanding={money.outstanding} />
              {floorJobs.length === 0 ? (
                <div className="hub-clients-ledger-row hub-clients-jobs-empty">
                  <p>{clientJobsEmptyTitle({ error: jobsError, count: floorJobs.length }) || 'No jobs yet'}</p>
                  {jobsError ? null : <Link to={newJobHref} className="hub-clients-next">New job</Link>}
                </div>
              ) : floorJobs.map(job => {
                const next = withReminderNext(job, jobListNext(job));
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
            action={<Link to={newQuoteHref} className="ops-link">New quote</Link>}
            emptyTitle="No quotes yet"
            emptyAction={<Link to={newQuoteHref} className="ops-link">New quote</Link>}
          >
            {(quotes ?? []).map(quote => {
              const invoiceId = pickReusableInvoice(
                (invoices ?? []).filter(inv => inv.quote_id === quote.id),
              )?.id ?? null;
              const next = recommendQuoteAction(quoteActionContext({ ...quote, invoice_id: invoiceId }));
              return (
                <JobRelatedRow
                  key={quote.id}
                  href={quoteRecordHref(quote.id)}
                  icon={FileText}
                  title={`Quote #${padQuoteNumber(quote.quote_number)}`}
                  meta={[quote.description?.trim() || null, formatMoney(Number(quote.total))].filter(Boolean).join(' · ')}
                  action={
                    next.key === 'none' ? null : (
                      <Link to={quoteRecordHref(quote.id)} className={nextQuiet}>{next.label}</Link>
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
            action={<Link to={newInvoiceHref} className="ops-link">New invoice</Link>}
            emptyTitle="No invoices yet"
            emptyAction={<Link to={newInvoiceHref} className="ops-link">New invoice</Link>}
          >
            {(invoices ?? []).map(inv => {
              const next = recommendInvoiceAction(inv);
              return (
                <JobRelatedRow
                  key={inv.id}
                  href={invoiceRecordHref(inv.id)}
                  icon={Receipt}
                  title={`Invoice #${padNum(inv.invoice_number)}`}
                  meta={[
                    formatMoney(Number(inv.total)),
                    inv.due_date ? `Due ${format(parseISO(inv.due_date), 'd MMM yyyy')}` : null,
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
                    format(new Date(insp.started_at), 'd MMM yyyy'),
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
            action={<Link to="/compliance" className="ops-link">View all</Link>}
            emptyTitle="No compliance items on this client yet."
            emptyAction={<Link to="/compliance" className="ops-link">View all</Link>}
          >
            {(complianceItems ?? []).map(ci => {
              const daysUntil = differenceInDays(parseISO(ci.next_due_date), new Date());
              return (
                <JobRelatedRow
                  key={ci.id}
                  href="/compliance"
                  icon={ShieldCheck}
                  title={ci.title}
                  meta={[
                    `Due ${format(parseISO(ci.next_due_date), 'd MMM yyyy')}`,
                    daysUntil < 0 ? `${Math.abs(daysUntil)} days overdue` : daysUntil <= 30 ? `in ${daysUntil} days` : null,
                    ci.reminder_sent_at ? `Reminded ${format(new Date(ci.reminder_sent_at), 'd MMM')}` : null,
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
