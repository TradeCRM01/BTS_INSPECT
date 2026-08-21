import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, Breadcrumbs, useToast, OpsSiteRow } from '../components/ui';
import { JobRelatedSection, JobRelatedRow } from '../components/jobs/JobRelatedSection';
import type { Client, JobWithClient } from '../types/crm';
import {
  formatMoney,
} from '../types/fsm';
import type { QuoteStatus } from '../types/fsm';
import { Briefcase, Plus, FileText, ShieldCheck, Receipt, ClipboardList } from 'lucide-react';
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
  jobRecordHref,
  quoteRecordHref,
} from '../lib/clientRecords';

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

function jobRowTitle(job: { address?: string | null; title?: string | null; job_number?: number | null }): string {
  const site = visibleSite(job.address);
  if (site) return site;
  const title = job.title?.trim();
  if (title) return title;
  if (job.job_number != null) return `#${padNum(job.job_number)}`;
  return '';
}

const nextQuiet = 'hub-next shrink-0';

export function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showEdit, setShowEdit] = useState(false);

  const { data: client, isLoading, error } = useQuery<Client>({
    queryKey: ['client', id],
    queryFn: async () => {
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

  const { data: jobs } = useQuery<JobWithClient[]>({
    queryKey: ['client-jobs', id, profile?.company_id],
    queryFn: async () => {
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
      if (!inspectionScope) return [];
      const { data, error } = await applyHubScope(supabase.from('inspections'), inspectionScope)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientInspection[];
    },
    enabled: !!id && !!profile && jobs !== undefined,
  });

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><LoadingSpinner /></div></AppShell>;
  if (error || !client) return <AppShell><PageError message="Could not load this client" /></AppShell>;

  const newQuoteHref = clientHubStartAction('quote', client.id).href;
  const newJobHref = clientHubStartAction('job', client.id).href;
  const newInvoiceHref = clientHubStartAction('invoice', client.id).href;
  const moneyReady = quotes !== undefined && invoices !== undefined;
  const money = clientMoneySummary(quotes ?? [], invoices ?? []);
  const jobById = new Map((jobs ?? []).map(job => [job.id, job]));

  return (
    <AppShell>
      <div className="ops-page hub-clients">
        <Breadcrumbs items={[{ label: 'Clients', to: '/clients' }, { label: client.name }]} />

        <div className="ops-page-head">
          <div className="min-w-0">
            <h1 className="ops-page-title">{client.name}</h1>
            {client.contact_person ? (
              <p className="ops-meta mt-1">{client.contact_person}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3 shrink-0">
            <Link to={newQuoteHref} className="ops-link">New quote</Link>
            <Link to={newInvoiceHref} className="ops-link">New invoice</Link>
            <button type="button" onClick={() => setShowEdit(true)} className="ops-link">
              Edit
            </button>
            <Link to={newJobHref} className="btn-primary">
              <Plus size={16} /> New job
            </Link>
          </div>
        </div>

        <div className="mb-6">
          <OpsSiteRow
            hub
            site={visibleSite(client.address)}
            phone={client.phone}
            email={client.email}
            mapsQuery={client.address}
          />
          {client.notes ? (
            <p className="text-sm text-navy whitespace-pre-wrap mt-3">{client.notes}</p>
          ) : null}
        </div>

        <HubMoney ready={moneyReady} overdue={money.overdue} outstanding={money.outstanding} />

        <div className="hub-trays">
          <JobRelatedSection
            title="Jobs"
            icon={Briefcase}
            count={(jobs ?? []).length}
            emptyTitle="No jobs yet"
            emptyAction={<Link to={newJobHref} className="ops-link">New job</Link>}
          >
            {(jobs ?? []).map(job => {
              const next = withReminderNext(job, jobListNext(job));
              const title = jobRowTitle(job);
              return (
                <JobRelatedRow
                  key={job.id}
                  href={jobRecordHref(job.id)}
                  icon={Briefcase}
                  title={title}
                  meta={[
                    job.job_number != null && title !== `#${padNum(job.job_number)}` ? `#${padNum(job.job_number)}` : null,
                    job.title && job.title !== title ? job.title : null,
                    job.scheduled_date ? format(parseISO(job.scheduled_date), 'd MMM yyyy') : null,
                    job.start_time ? job.start_time.slice(0, 5) : null,
                  ].filter(Boolean).join(' · ')}
                  action={
                    next.actionable ? (
                      <Link to={next.href} className={nextQuiet}>{next.label}</Link>
                    ) : null
                  }
                />
              );
            })}
          </JobRelatedSection>

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
      <div className="hub-signal">
        <p className="hub-signal-amount text-fail">{formatMoney(overdue)}</p>
        <p className="ops-meta">Overdue</p>
      </div>
    );
  }
  if (outstanding > 0) {
    return (
      <div className="hub-signal">
        <p className="hub-signal-amount">{formatMoney(outstanding)}</p>
        <p className="ops-meta">Outstanding</p>
      </div>
    );
  }
  return null;
}
