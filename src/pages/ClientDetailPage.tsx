import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, Breadcrumbs, useToast, OpsStatus } from '../components/ui';
import { JobRelatedSection, JobRelatedRow } from '../components/jobs/JobRelatedSection';
import type { Client, JobWithClient } from '../types/crm';
import { JOB_STATUS_LABELS, JOB_STATUS_STYLES } from '../types/crm';
import {
  QUOTE_STATUS_LABELS, QUOTE_STATUS_STYLES, INVOICE_STATUS_LABELS, INVOICE_STATUS_STYLES,
  formatMoney,
} from '../types/fsm';
import type { QuoteStatus } from '../types/fsm';
import { Phone, Mail, MapPin, Users, CreditCard as Edit3, Briefcase, Plus, FileText, ShieldCheck, Bell, Receipt } from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { ClientForm } from './ClientsPage';
import type { ComplianceItem } from '../types/compliance';
import { COMPLIANCE_STATUS_LABELS, COMPLIANCE_STATUS_STYLES } from '../types/compliance';
import { jobListNext } from '../lib/jobNextAction';
import { quoteActionContext, recommendQuoteAction } from '../lib/quoteNextAction';
import { recommendInvoiceAction } from '../lib/invoiceNextAction';
import { effectiveInvoiceStatus } from '../lib/invoiceStatus';
import { pickReusableInvoice } from '../lib/invoiceFromQuote';
import { padQuoteNumber } from '../lib/quoteJobFields';
import {
  invoiceRecordHref,
  jobRecordHref,
  newJobFromClientHref,
  newQuoteFromClientHref,
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
  template_snapshot: { name?: string } | null;
};

function padNum(n: number | null | undefined): string {
  return String(n ?? 0).padStart(4, '0');
}

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
        .maybeSingle();
      if (error) throw error;
      return data as Client;
    },
    enabled: !!id && !!profile,
  });

  const { data: jobs } = useQuery<JobWithClient[]>({
    queryKey: ['client-jobs', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('client_id', id!)
        .order('scheduled_date', { ascending: false, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as JobWithClient[];
    },
    enabled: !!id && !!profile,
  });

  const { data: quotes } = useQuery<ClientQuote[]>({
    queryKey: ['client-quotes', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, quote_number, status, total, description, job_id, client_id, line_items')
        .eq('client_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientQuote[];
    },
    enabled: !!id && !!profile,
  });

  const { data: invoices } = useQuery<ClientInvoice[]>({
    queryKey: ['client-invoices', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, total, due_date, quote_id')
        .eq('client_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientInvoice[];
    },
    enabled: !!id && !!profile,
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

  const { data: inspections } = useQuery<ClientInspection[]>({
    queryKey: ['client-inspections', id],
    queryFn: async () => {
      const jobIds = (jobs ?? []).map(j => j.inspection_id).filter(Boolean) as string[];
      if (jobIds.length === 0) return [];
      const { data, error } = await supabase
        .from('inspections')
        .select('id, status, started_at, template_snapshot')
        .in('id', jobIds)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientInspection[];
    },
    enabled: !!id && !!profile && (jobs?.length ?? 0) > 0,
  });

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><LoadingSpinner /></div></AppShell>;
  if (error || !client) return <AppShell><PageError message="Could not load this client" /></AppShell>;

  const newQuoteHref = newQuoteFromClientHref(client.id);
  const newJobHref = newJobFromClientHref(client.id);

  return (
    <AppShell>
      <div className="page-shell">
        <Breadcrumbs items={[{ label: 'Clients', to: '/clients' }, { label: client.name }]} />

        <div className="ops-card p-5 mb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-14 h-14 rounded-xl bg-navy/10 flex items-center justify-center shrink-0">
                <Users size={26} className="text-navy" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-navy">{client.name}</h1>
                {client.contact_person && (
                  <p className="ops-meta mt-0.5">{client.contact_person}</p>
                )}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                  {client.phone && (
                    <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 text-sm text-accent hover:underline">
                      <Phone size={13} /> {client.phone}
                    </a>
                  )}
                  {client.email && (
                    <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 text-sm text-accent hover:underline">
                      <Mail size={13} /> {client.email}
                    </a>
                  )}
                  {client.address && (
                    <div className="flex items-center gap-1.5 text-sm text-muted">
                      <MapPin size={13} /> {client.address}
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
              <Link to={newQuoteHref} className="btn-secondary">
                <FileText size={14} /> New quote
              </Link>
              <Link to={newJobHref} className="btn-primary">
                <Plus size={14} /> New job
              </Link>
              <button onClick={() => setShowEdit(true)} className="btn-secondary">
                <Edit3 size={14} /> Edit
              </button>
            </div>
          </div>

          {client.notes && (
            <div className="mt-4 pt-4 border-t border-rule">
              <p className="ops-meta font-medium mb-1">Notes</p>
              <p className="text-sm text-navy whitespace-pre-wrap">{client.notes}</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3 mb-6">
          <StatCard label="Jobs" value={jobs?.length ?? 0} icon={Briefcase} />
          <StatCard label="Quotes" value={quotes?.length ?? 0} icon={FileText} />
          <StatCard label="Invoices" value={invoices?.length ?? 0} icon={Receipt} />
        </div>

        <div className="space-y-3 mb-6">
          <JobRelatedSection
            title="Jobs"
            icon={Briefcase}
            count={(jobs ?? []).length}
            action={
              <Link to={newJobHref} className="ops-link text-xs">
                <Plus size={12} /> New job
              </Link>
            }
            emptyTitle="No jobs yet"
            emptyAction={<Link to={newJobHref} className="ops-link">New job</Link>}
          >
            {(jobs ?? []).map(job => {
              const next = jobListNext(job);
              return (
                <JobRelatedRow
                  key={job.id}
                  href={jobRecordHref(job.id)}
                  icon={Briefcase}
                  title={`${job.job_number != null ? `#${padNum(job.job_number)} ` : ''}${job.title}`}
                  meta={[
                    job.scheduled_date ? format(parseISO(job.scheduled_date), 'd MMM yyyy') : null,
                    job.start_time ? job.start_time.slice(0, 5) : null,
                    job.address?.trim() || null,
                  ].filter(Boolean).join(' · ')}
                  trailing={
                    <OpsStatus className={JOB_STATUS_STYLES[job.status]}>{JOB_STATUS_LABELS[job.status]}</OpsStatus>
                  }
                  action={
                    next.actionable ? (
                      <Link to={next.href} className="ops-next-control-sm w-auto px-3 shrink-0">{next.label}</Link>
                    ) : (
                      <span className="ops-next-control-done">{next.label}</span>
                    )
                  }
                />
              );
            })}
          </JobRelatedSection>

          <JobRelatedSection
            title="Quotes"
            icon={FileText}
            count={(quotes ?? []).length}
            action={
              <Link to={newQuoteHref} className="ops-link text-xs">
                <Plus size={12} /> New quote
              </Link>
            }
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
                  trailing={
                    <OpsStatus className={QUOTE_STATUS_STYLES[quote.status]}>{QUOTE_STATUS_LABELS[quote.status]}</OpsStatus>
                  }
                  action={
                    next.key === 'none' ? (
                      <span className="ops-next-control-done">{next.label}</span>
                    ) : (
                      <Link to={quoteRecordHref(quote.id)} className="ops-next-control-sm w-auto px-3 shrink-0">{next.label}</Link>
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
            emptyTitle="No invoices yet"
          >
            {(invoices ?? []).map(inv => {
              const next = recommendInvoiceAction(inv);
              const status = effectiveInvoiceStatus(inv);
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
                  trailing={
                    <OpsStatus className={INVOICE_STATUS_STYLES[status]}>{INVOICE_STATUS_LABELS[status]}</OpsStatus>
                  }
                  action={
                    next.key === 'none' ? (
                      <span className="ops-next-control-done">{next.label}</span>
                    ) : (
                      <Link to={invoiceRecordHref(inv.id)} className="ops-next-control-sm w-auto px-3 shrink-0">{next.label}</Link>
                    )
                  }
                />
              );
            })}
          </JobRelatedSection>
        </div>

        {(complianceItems ?? []).length > 0 && (
          <div className="mb-6">
            <JobRelatedSection
              title="Compliance"
              icon={ShieldCheck}
              count={(complianceItems ?? []).length}
              action={
                <Link to="/compliance" className="ops-link text-xs">
                  <ShieldCheck size={12} /> View all
                </Link>
              }
              emptyTitle="No compliance items"
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
                    trailing={
                      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${COMPLIANCE_STATUS_STYLES[ci.status]}`}>
                        {COMPLIANCE_STATUS_LABELS[ci.status]}
                      </span>
                    }
                    action={ci.reminder_sent_at ? <Bell size={12} className="text-muted shrink-0" /> : undefined}
                  />
                );
              })}
            </JobRelatedSection>
          </div>
        )}

        {(inspections ?? []).length > 0 && (
          <div className="mb-6">
            <JobRelatedSection
              title="Linked inspections"
              icon={FileText}
              count={(inspections ?? []).length}
              emptyTitle="No linked inspections"
            >
              {(inspections ?? []).map(insp => {
                const to = insp.status === 'completed' || insp.status === 'issued'
                  ? `/inspections/${insp.id}/report`
                  : `/inspections/${insp.id}`;
                return (
                  <JobRelatedRow
                    key={insp.id}
                    href={to}
                    icon={FileText}
                    title={insp.template_snapshot?.name ?? 'Inspection'}
                    meta={format(new Date(insp.started_at), 'd MMM yyyy')}
                    trailing={
                      <span className={`text-xs px-2 py-0.5 rounded-full ${insp.status === 'completed' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                        {insp.status}
                      </span>
                    }
                  />
                );
              })}
            </JobRelatedSection>
          </div>
        )}
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

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Briefcase }) {
  return (
    <div className="ops-card p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className="text-muted" />
        <span className="ops-meta font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold text-navy">{value}</p>
    </div>
  );
}
