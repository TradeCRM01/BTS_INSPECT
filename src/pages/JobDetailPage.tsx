import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, Breadcrumbs, useToast, ActionButton, actionClass, OpsStatus, OpsSiteRow, OpsPhotoStamp } from '../components/ui';
import { JobFormModal } from '../components/crm/JobFormModal';
import { JobCostingPanel } from '../components/jobs/JobCostingPanel';
import { JobDispatchPanel } from '../components/jobs/JobDispatchPanel';
import { JobRelatedSection, JobRelatedRow } from '../components/jobs/JobRelatedSection';
import { TimeEntryForm } from '../components/timesheets/TimeEntryForm';
import type { Client, Job, JobStatus } from '../types/crm';
import { JOB_STATUS_LABELS, JOB_STATUS_STYLES, JOB_STATUS_RAIL, JOB_PRIORITY_LABELS, JOB_PRIORITY_DOT } from '../types/crm';
import { formatMoney, INVOICE_STATUS_LABELS, INVOICE_STATUS_STYLES, QUOTE_STATUS_LABELS, QUOTE_STATUS_STYLES, formatDuration } from '../types/fsm';
import type { InvoiceStatus, Timesheet } from '../types/fsm';
import { convertQuoteToInvoice } from '../lib/convertQuoteToInvoice';
import { DEFAULT_TAX_RATE } from '../lib/gst';
import { effectiveInvoiceStatus } from '../lib/invoiceStatus';
import { recommendJobAction } from '../lib/jobNextAction';
import {
  Calendar, Clock, User, Phone, Mail, Edit3, ChevronDown,
  FileText, ShieldCheck, Receipt, DollarSign, Plus, ClipboardList, GitBranch, Users,
  Play, Square,
} from 'lucide-react';
import {
  buildJobClockOnEntry,
  buildOpenTimesheetInsert,
  entryMinutes,
  localDateIso,
} from '../lib/timesheetJob';
import { format, parseISO, addDays } from 'date-fns';

type JobInspection = {
  id: string;
  status: string;
  started_at: string;
  template_snapshot: { name?: string } | null;
};

type JobJha = {
  id: string;
  status: string;
  report_number: string | null;
  created_at: string;
  template_snapshot: { name?: string } | null;
  meta: Record<string, string> | null;
};

type JobQuote = {
  id: string;
  quote_number: number | null;
  status: string;
  total: number;
  created_at: string;
};

type JobInvoice = {
  id: string;
  invoice_number: number | null;
  status: InvoiceStatus;
  total: number;
  due_date: string | null;
  created_at: string;
  quote_id: string | null;
};

type JobTimesheet = {
  id: string;
  timesheet_id: string;
  job_id: string | null;
  start_time: string;
  end_time: string | null;
  work_type: string | null;
  billable: boolean;
  notes: string | null;
};

type ChildJob = { id: string; title: string; status: string; job_number: number | null };
type TeamMember = { id: string; name: string };

function padNum(n: number | null | undefined): string {
  return String(n ?? 0).padStart(4, '0');
}

function inspectionHref(status: string, id: string): string {
  return status === 'completed' || status === 'issued'
    ? `/inspections/${id}/report`
    : `/inspections/${id}`;
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile, company } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showEdit, setShowEdit] = useState(false);
  const [showStage, setShowStage] = useState(false);
  const [showTimeEntry, setShowTimeEntry] = useState(false);
  const [showJhaPicker, setShowJhaPicker] = useState(false);
  const [billOpen, setBillOpen] = useState(false);

  const { data: job, isLoading, error } = useQuery<Job>({
    queryKey: ['job', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('jobs').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Job not found');
      return data as Job;
    },
    enabled: !!id && !!profile,
  });

  const { data: client } = useQuery<Client | null>({
    queryKey: ['job-client', job?.client_id],
    queryFn: async () => {
      if (!job?.client_id) return null;
      const { data, error } = await supabase.from('clients').select('*').eq('id', job.client_id).maybeSingle();
      if (error) throw error;
      return (data as Client) ?? null;
    },
    enabled: !!job?.client_id,
  });

  const { data: parentJob } = useQuery<{ id: string; title: string; job_number: number | null } | null>({
    queryKey: ['job-parent', job?.parent_job_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs').select('id, title, job_number').eq('id', job!.parent_job_id!).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!job?.parent_job_id,
  });

  const { data: childJobs } = useQuery<ChildJob[]>({
    queryKey: ['job-children', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jobs').select('id, title, status, job_number').eq('parent_job_id', id!).order('created_at');
      if (error) throw error;
      return (data ?? []) as ChildJob[];
    },
    enabled: !!id && !!profile,
  });

  const { data: teamMembers } = useQuery<TeamMember[]>({
    queryKey: ['team-members-job-detail'],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data, error } = await supabase.rpc('get_company_members', { p_company_id: profile.company_id });
      if (error) throw error;
      return (data ?? []).map((m: { id: string; name: string }) => ({ id: m.id, name: m.name }));
    },
    enabled: !!profile,
  });

  const { data: jhaTemplates } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['jha-templates-picker'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jha_templates').select('id, name').eq('archived', false).order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile,
  });

  const { data: inspections } = useQuery<JobInspection[]>({
    queryKey: ['job-inspections', id, job?.inspection_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inspections')
        .select('id, status, started_at, template_snapshot')
        .eq('crm_job_id', id!)
        .order('started_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as JobInspection[];
      const linkedId = job?.inspection_id;
      if (linkedId && !list.some(i => i.id === linkedId)) {
        const { data: extra } = await supabase
          .from('inspections')
          .select('id, status, started_at, template_snapshot')
          .eq('id', linkedId)
          .maybeSingle();
        if (extra) list.push(extra as JobInspection);
      }
      return list;
    },
    enabled: !!id && !!profile && !!job,
  });

  const { data: coverPhotoUrl } = useQuery<string | null>({
    queryKey: ['job-cover-photo', id, (inspections ?? []).map(i => i.id).join(',')],
    queryFn: async () => {
      const ids = [...(inspections ?? []).map(i => i.id)];
      if (job?.inspection_id && !ids.includes(job.inspection_id)) ids.push(job.inspection_id);
      if (ids.length === 0) return null;
      const { data: photos } = await supabase
        .from('photos')
        .select('storage_path')
        .in('inspection_id', ids)
        .order('uploaded_at', { ascending: false })
        .limit(1);
      const path = photos?.[0]?.storage_path;
      if (!path) return null;
      const { data } = await supabase.storage.from('photos').createSignedUrl(path, 3600);
      return data?.signedUrl ?? null;
    },
    enabled: !!id && !!inspections,
  });

  const { data: jhas } = useQuery<JobJha[]>({
    queryKey: ['job-jhas', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('jha_documents')
        .select('id, status, report_number, created_at, template_snapshot, meta')
        .eq('job_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as JobJha[];
    },
    enabled: !!id && !!profile,
  });

  const { data: quotes } = useQuery<JobQuote[]>({
    queryKey: ['job-quotes', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('quotes')
        .select('id, quote_number, status, total, created_at')
        .eq('job_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as JobQuote[];
    },
    enabled: !!id && !!profile,
  });

  const { data: invoices } = useQuery<JobInvoice[]>({
    queryKey: ['job-invoices', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invoices')
        .select('id, invoice_number, status, total, due_date, created_at, quote_id')
        .eq('job_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as JobInvoice[];
    },
    enabled: !!id && !!profile,
  });

  const { data: timesheets } = useQuery<JobTimesheet[]>({
    queryKey: ['job-timesheets', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('timesheet_entries')
        .select('id, timesheet_id, job_id, start_time, end_time, work_type, billable, notes')
        .eq('job_id', id!)
        .order('start_time', { ascending: false });
      if (error) throw error;
      return (data ?? []) as JobTimesheet[];
    },
    enabled: !!id && !!profile,
  });

  const { data: myTimesheets } = useQuery<Timesheet[]>({
    queryKey: ['timesheets-job-clock', profile?.id],
    queryFn: async () => {
      const from = format(addDays(new Date(), -14), 'yyyy-MM-dd');
      const to = format(addDays(new Date(), 14), 'yyyy-MM-dd');
      const { data, error } = await supabase
        .from('timesheets')
        .select('*')
        .eq('employee_id', profile!.id)
        .gte('date', from)
        .lte('date', to)
        .order('date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Timesheet[];
    },
    enabled: !!profile,
  });

  const { data: costTotals } = useQuery<{ cost: number; charge: number; lines: number }>({
    queryKey: ['job-cost-totals', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('job_costs')
        .select('total_cost, total_price')
        .eq('job_id', id!);
      if (error) throw error;
      const rows = data ?? [];
      return {
        cost: rows.reduce((s, r) => s + Number(r.total_cost || 0), 0),
        charge: rows.reduce((s, r) => s + Number(r.total_price || r.total_cost || 0), 0),
        lines: rows.length,
      };
    },
    enabled: !!id && !!profile,
  });

  const invoiceFromQuote = useMutation({
    mutationFn: async (quoteId: string) => {
      if (!profile?.id) throw new Error('Not signed in');
      return convertQuoteToInvoice(quoteId, profile.id, Number(company?.default_tax_rate) || DEFAULT_TAX_RATE);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['job-invoices', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      showToast(result.existing
        ? 'Invoice already exists for this quote'
        : 'Draft invoice created from quote');
    },
    onError: (e: Error) => showToast(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async (status: JobStatus) => {
      const { error } = await supabase
        .from('jobs').update({ status, updated_at: new Date().toISOString() }).eq('id', id!);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['job', id] });
      queryClient.invalidateQueries({ queryKey: ['jobs-all'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  const invalidateTime = () => {
    queryClient.invalidateQueries({ queryKey: ['job-timesheets', id] });
    queryClient.invalidateQueries({ queryKey: ['timesheets-job-clock', profile?.id] });
    queryClient.invalidateQueries({ queryKey: ['timesheets'] });
    queryClient.invalidateQueries({ queryKey: ['timesheet-entries'] });
  };

  const myTimesheetIds = new Set((myTimesheets ?? []).map(t => t.id));
  const runningEntry = (timesheets ?? []).find(e => e.end_time == null && myTimesheetIds.has(e.timesheet_id));

  const clockOnJob = useMutation({
    mutationFn: async () => {
      if (!profile?.company_id || !id) throw new Error('Not signed in');
      const now = new Date();
      const date = localDateIso(now);
      const { data: existingTs, error: tsLoadErr } = await supabase
        .from('timesheets')
        .select('id, clock_in')
        .eq('company_id', profile.company_id)
        .eq('employee_id', profile.id)
        .eq('date', date)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (tsLoadErr) throw tsLoadErr;

      if (existingTs?.id) {
        const { data: openRows, error: openErr } = await supabase
          .from('timesheet_entries')
          .select('id')
          .eq('job_id', id)
          .eq('timesheet_id', existingTs.id)
          .is('end_time', null)
          .limit(1);
        if (openErr) throw openErr;
        if ((openRows ?? []).length > 0) return { alreadyRunning: true };
      }

      let timesheetId = existingTs?.id as string | undefined;
      if (!timesheetId) {
        const { data: created, error: createErr } = await supabase.from('timesheets')
          .insert(buildOpenTimesheetInsert({
            companyId: profile.company_id,
            employeeId: profile.id,
            date,
            clockInIso: now.toISOString(),
          }))
          .select('id')
          .single();
        if (createErr) throw createErr;
        timesheetId = created.id as string;
      } else if (!existingTs?.clock_in) {
        const { error: clockErr } = await supabase.from('timesheets')
          .update({ clock_in: now.toISOString(), status: 'open' })
          .eq('id', timesheetId);
        if (clockErr) throw clockErr;
      }

      const { error: entryErr } = await supabase.from('timesheet_entries').insert(buildJobClockOnEntry({
        timesheetId,
        companyId: profile.company_id,
        jobId: id,
        start: now,
      }));
      if (entryErr) throw entryErr;
      return { alreadyRunning: false };
    },
    onSuccess: (result) => {
      invalidateTime();
      showToast(result.alreadyRunning ? 'Already clocked on this job' : 'Clocked on');
    },
    onError: (e: Error) => showToast(e.message),
  });

  const clockOffJob = useMutation({
    mutationFn: async () => {
      if (!id) throw new Error('Missing job');
      const running = (timesheets ?? []).find(e => e.end_time == null && myTimesheetIds.has(e.timesheet_id));
      if (!running) throw new Error('No running time on this job');
      const end = new Date();
      const { error } = await supabase.from('timesheet_entries')
        .update({ end_time: end.toISOString() })
        .eq('id', running.id);
      if (error) throw error;
      const mins = entryMinutes(running.start_time, end.toISOString());
      const ts = (myTimesheets ?? []).find(t => t.id === running.timesheet_id);
      const { error: tsErr } = await supabase.from('timesheets')
        .update({ total_minutes: (ts?.total_minutes ?? 0) + mins })
        .eq('id', running.timesheet_id);
      if (tsErr) throw tsErr;
    },
    onSuccess: () => {
      invalidateTime();
      showToast('Clocked off');
    },
    onError: (e: Error) => showToast(e.message),
  });

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><LoadingSpinner /></div></AppShell>;
  if (error || !job) return <AppShell><PageError message="Could not load this job" /></AppShell>;

  const color = JOB_STATUS_RAIL[job.status];
  const assigned = (job.assigned_team ?? [])
    .map(tid => teamMembers?.find(m => m.id === tid)?.name)
    .filter(Boolean) as string[];
  const budget = job.budget != null ? Number(job.budget) : null;
  const actualCost = costTotals?.cost ?? 0;
  const chargeTotal = costTotals?.charge ?? 0;
  const site = job.address || client?.address || null;
  const acceptedQuote = (quotes ?? []).find(q => q.status === 'accepted');
  const stages = childJobs ?? [];

  const jhaStartHref = (templateId: string) => {
    const params = new URLSearchParams({ templateId, jobId: job.id });
    if (job.client_id) params.set('clientId', job.client_id);
    return `/jha/new?${params.toString()}`;
  };

  const startJha = () => {
    const templates = jhaTemplates ?? [];
    if (templates.length === 0) {
      showToast('Add a JHA template first');
      navigate('/templates');
      return;
    }
    if (templates.length === 1) {
      navigate(jhaStartHref(templates[0].id));
      return;
    }
    setShowJhaPicker(open => !open);
  };

  const handleInvoice = () => {
    if (acceptedQuote && !(invoices ?? []).some(inv => inv.quote_id === acceptedQuote.id)) {
      invoiceFromQuote.mutate(acceptedQuote.id);
      return;
    }
    setBillOpen(true);
    setTimeout(() => scrollToId('job-bill'), 50);
    if ((costTotals?.lines ?? 0) > 0) {
      showToast('Invoice from the job bill below');
    } else {
      showToast('Add bill lines, or invoice from an accepted quote');
    }
  };

  const next = recommendJobAction({
    status: job.status,
    scheduledDate: job.scheduled_date,
    crewCount: (job.assigned_team ?? []).length,
    jhaCount: (jhas ?? []).length,
    inspectionCount: (inspections ?? []).length,
    invoiceCount: (invoices ?? []).length,
    hasAcceptedQuote: !!acceptedQuote,
    hasBillLines: (costTotals?.lines ?? 0) > 0,
    clockedOn: !!runningEntry,
  });

  const inspectHref = `/inspections/new?crmJobId=${job.id}`;

  return (
    <AppShell>
      <div className="page-shell-narrow">
        <Breadcrumbs items={[
          { label: 'Jobs', to: '/jobs' },
          { label: job.job_number != null ? `#${padNum(job.job_number)} ${job.title}` : job.title },
        ]} />

        <article className="ops-card overflow-hidden mb-4" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
          <OpsPhotoStamp src={coverPhotoUrl} hub />
          <div className="ops-card-header ops-card-header-lg">
            <div className="flex items-center justify-between gap-2">
              <p className="ops-card-kicker ops-card-kicker-lg">
                {job.job_number != null ? `JOB #${padNum(job.job_number)}` : 'JOB'}
              </p>
              <select
                value={job.status}
                onChange={e => updateStatus.mutate(e.target.value as JobStatus)}
                className={`ops-status cursor-pointer border-0 ${JOB_STATUS_STYLES[job.status]}`}
                aria-label="Job status"
              >
                {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map(s => (
                  <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="ops-card-body">
            <OpsSiteRow
              hub
              site={site ? site : 'No site address yet — add it in job details'}
              phone={client?.phone}
              mapsQuery={site}
            />
            {job.title && <p className="ops-hub-title mt-1">{job.title}</p>}
            {parentJob && (
              <Link to={`/jobs/${parentJob.id}`} className="mt-1 inline-flex items-center gap-1 ops-meta text-accent hover:underline">
                <GitBranch size={12} />
                Stage of {parentJob.job_number != null ? `#${padNum(parentJob.job_number)} ` : ''}{parentJob.title}
              </Link>
            )}

            <div className="mt-2">
              {next.key === 'inspect' ? (
                <Link to={inspectHref} className="ops-next-control-block">{next.label}</Link>
              ) : next.key !== 'none' ? (
                <button
                  type="button"
                  className="ops-next-control-block"
                  onClick={() => {
                    if (next.key === 'schedule' || next.key === 'crew') scrollToId('job-schedule');
                    else if (next.key === 'jha') startJha();
                    else if (next.key === 'invoice') handleInvoice();
                    else if (next.key === 'clock') clockOnJob.mutate();
                  }}
                >
                  {next.label}
                </button>
              ) : (
                <span className="ops-next-control-done">{next.label}</span>
              )}
            </div>

            {((quotes ?? []).length > 0 || (invoices ?? []).length > 0) && (
              <div className="ops-attach">
                {(quotes ?? []).map(q => (
                  <Link key={q.id} to={`/quotes?id=${q.id}`} className="ops-attach-chip">
                    <span className="truncate">QT #{padNum(q.quote_number)} · {QUOTE_STATUS_LABELS[q.status as keyof typeof QUOTE_STATUS_LABELS] ?? q.status}</span>
                    <span className="tabular-nums shrink-0">{formatMoney(Number(q.total))}</span>
                  </Link>
                ))}
                {(invoices ?? []).map(inv => {
                  const status = effectiveInvoiceStatus(inv);
                  return (
                    <Link key={inv.id} to={`/invoices?id=${inv.id}`} className="ops-attach-chip">
                      <span className="truncate">INV #{padNum(inv.invoice_number)} · {INVOICE_STATUS_LABELS[status]}</span>
                      <span className="tabular-nums shrink-0">{formatMoney(Number(inv.total))}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 ops-meta">
              {client ? (
                <Link to={`/clients/${client.id}`} className="flex items-center gap-1.5 text-[#2E75B6] hover:underline">
                  <User size={13} /> {client.name}
                </Link>
              ) : (
                <span className="flex items-center gap-1.5 ops-meta">
                  <User size={13} /> No client
                </span>
              )}
              {client?.phone && (
                <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 text-[#2E75B6] hover:underline">
                  <Phone size={13} /> {client.phone}
                </a>
              )}
              {client?.email && (
                <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 text-[#2E75B6] hover:underline">
                  <Mail size={13} /> {client.email}
                </a>
              )}
              <span className="flex items-center gap-1.5">
                <Users size={13} />
                {assigned.length > 0 ? assigned.join(', ') : 'Unassigned'}
              </span>
            {job.scheduled_date && (
              <span className="flex items-center gap-1.5">
                <Calendar size={13} />
                {format(parseISO(job.scheduled_date), 'EEE d MMM yyyy')}
                {job.start_time && (
                  <span>{job.start_time.slice(0, 5)}{job.end_time ? `–${job.end_time.slice(0, 5)}` : ''}</span>
                )}
              </span>
            )}
            {job.priority !== 'medium' && (
                <span className="flex items-center gap-1 text-xs font-medium" style={{ color: JOB_PRIORITY_DOT[job.priority] }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: JOB_PRIORITY_DOT[job.priority] }} />
                  {JOB_PRIORITY_LABELS[job.priority]} priority
                </span>
              )}
            </div>

            {job.description && (
              <p className="mt-2 ops-meta whitespace-pre-wrap line-clamp-4">{job.description}</p>
            )}

            <div className="mt-2 flex flex-wrap gap-2">
              <ActionButton
                recommended={false}
                onClick={() => scrollToId('job-schedule')}
              >
                <Calendar size={14} /> Schedule / crew
              </ActionButton>
              <div className="relative">
                <ActionButton recommended={false} onClick={startJha}>
                  <ShieldCheck size={14} /> Start JHA
                </ActionButton>
                {showJhaPicker && (jhaTemplates ?? []).length > 1 && (
                  <div className="absolute z-20 mt-1 w-64 bg-white border border-[#E5E7EB] rounded-lg shadow-lg py-1">
                    {(jhaTemplates ?? []).map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => navigate(jhaStartHref(t.id))}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-[#F0F7FF]"
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Link to={inspectHref} className={actionClass(false)}>
                <ClipboardList size={14} /> Start inspection
              </Link>
              <ActionButton
                recommended={false}
                onClick={handleInvoice}
                disabled={invoiceFromQuote.isPending}
              >
                <Receipt size={14} /> Invoice
              </ActionButton>
              {runningEntry ? (
                <button
                  type="button"
                  onClick={() => clockOffJob.mutate()}
                  disabled={clockOffJob.isPending}
                  className="btn-danger"
                >
                  <Square size={14} /> Clock off
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => clockOnJob.mutate()}
                  disabled={clockOnJob.isPending || job.status === 'cancelled'}
                  className="btn-secondary"
                >
                  <Play size={14} /> Clock on
                </button>
              )}
              <button type="button" onClick={() => setShowEdit(true)} className="btn-ghost ml-auto">
                <Edit3 size={14} /> Details
              </button>
            </div>
          </div>
        </article>

        <div id="job-schedule">
          <JobDispatchPanel job={job} teamMembers={teamMembers ?? []} />
        </div>

        {stages.length > 0 && (
          <div className="mb-5">
            <JobRelatedSection
              title="Project stages"
              icon={GitBranch}
              count={stages.length}
              action={!job.parent_job_id ? (
                <button type="button" onClick={() => setShowStage(true)} className="flex items-center gap-1 text-xs font-medium text-[#2E75B6] hover:underline">
                  <Plus size={12} /> Add stage
                </button>
              ) : undefined}
              emptyTitle="No stages on this job."
            >
              {stages.map(child => (
                <JobRelatedRow
                  key={child.id}
                  href={`/jobs/${child.id}`}
                  icon={GitBranch}
                  title={`${child.job_number != null ? `#${padNum(child.job_number)} ` : ''}${child.title}`}
                  trailing={<OpsStatus className={JOB_STATUS_STYLES[child.status as JobStatus] ?? 'ops-status-wait'}>{JOB_STATUS_LABELS[child.status as JobStatus] ?? child.status}</OpsStatus>}
                />
              ))}
            </JobRelatedSection>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
          <JobRelatedSection
            title="Inspections"
            icon={ClipboardList}
            count={(inspections ?? []).length}
            emptyTitle="No inspection on this job yet."
            emptyAction={<Link to={inspectHref} className="text-sm font-medium text-[#2E75B6] hover:underline">Start inspection</Link>}
          >
            {(inspections ?? []).map(insp => (
              <JobRelatedRow
                key={insp.id}
                href={inspectionHref(insp.status, insp.id)}
                icon={FileText}
                title={insp.template_snapshot?.name ?? 'Inspection'}
                meta={format(new Date(insp.started_at), 'd MMM yyyy')}
                trailing={
                  <span className={`text-xs px-2 py-0.5 rounded-full ${insp.status === 'completed' || insp.status === 'issued' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                    {insp.status}
                  </span>
                }
              />
            ))}
          </JobRelatedSection>

          <JobRelatedSection
            title="JHAs"
            icon={ShieldCheck}
            count={(jhas ?? []).length}
            emptyTitle="Do the JHA before anyone starts on site."
            emptyAction={
              <button type="button" onClick={startJha} className="text-sm font-medium text-[#2E75B6] hover:underline">
                Start JHA
              </button>
            }
          >
            {(jhas ?? []).map(doc => {
              const title = doc.meta?.taskName || doc.template_snapshot?.name || 'JHA';
              return (
                <JobRelatedRow
                  key={doc.id}
                  href={`/jha/new?docId=${doc.id}`}
                  icon={ShieldCheck}
                  title={title}
                  meta={[doc.report_number, format(new Date(doc.created_at), 'd MMM yyyy')].filter(Boolean).join(' · ')}
                  trailing={<span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-[#4A5568]">{doc.status}</span>}
                />
              );
            })}
          </JobRelatedSection>

          <JobRelatedSection
            title="Quotes"
            icon={FileText}
            count={(quotes ?? []).length}
            emptyTitle="No quote on this job. That’s fine for do-and-charge — invoice from the bill."
          >
            {(quotes ?? []).map(q => (
              <div key={q.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                <Link to={`/quotes?id=${q.id}`} className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-80">
                  <FileText size={15} className="text-[#2E75B6] shrink-0" />
                  <p className="text-sm font-medium text-[#1A1A1A] truncate">Quote #{padNum(q.quote_number)}</p>
                  <OpsStatus className={QUOTE_STATUS_STYLES[q.status as keyof typeof QUOTE_STATUS_STYLES] ?? 'ops-status-wait'}>
                    {QUOTE_STATUS_LABELS[q.status as keyof typeof QUOTE_STATUS_LABELS] ?? q.status}
                  </OpsStatus>
                  <span className={`text-sm font-semibold text-navy`}>{formatMoney(Number(q.total))}</span>
                </Link>
                {q.status === 'accepted' && !(invoices ?? []).some(inv => inv.quote_id === q.id) && (
                  <button
                    type="button"
                    onClick={() => invoiceFromQuote.mutate(q.id)}
                    disabled={invoiceFromQuote.isPending}
                    className="shrink-0 text-xs font-medium text-navy border border-[#E5E7EB] px-2 py-1 rounded-md hover:bg-[#F9FAFB] disabled:opacity-50"
                  >
                    Invoice
                  </button>
                )}
              </div>
            ))}
          </JobRelatedSection>

          <JobRelatedSection
            title="Invoices"
            icon={Receipt}
            count={(invoices ?? []).length}
            emptyTitle="Nothing invoiced yet. Invoice an accepted quote, or from the job bill."
            emptyAction={
              <button type="button" onClick={handleInvoice} className="text-sm font-medium text-[#2E75B6] hover:underline">
                Invoice this job
              </button>
            }
          >
            {(invoices ?? []).map(inv => {
              const status = effectiveInvoiceStatus(inv);
              return (
                <JobRelatedRow
                  key={inv.id}
                  href={`/invoices?id=${inv.id}`}
                  icon={Receipt}
                  title={`Invoice #${padNum(inv.invoice_number)}`}
                  meta={formatMoney(Number(inv.total))}
                  trailing={
                    <OpsStatus className={INVOICE_STATUS_STYLES[status]}>
                      {INVOICE_STATUS_LABELS[status]}
                    </OpsStatus>
                  }
                />
              );
            })}
          </JobRelatedSection>
        </div>

        <JobRelatedSection
          title="Time on this job"
          icon={Clock}
          count={(timesheets ?? []).length}
          action={
            <div className="flex items-center gap-3">
              <button type="button" onClick={() => setShowTimeEntry(true)} className="flex items-center gap-1 text-xs font-medium text-[#2E75B6] hover:underline">
                <Plus size={12} /> Add entry
              </button>
              <Link to={`/timesheets?job=${job.id}`} className="text-xs text-[#2E75B6] hover:underline">All timesheets</Link>
            </div>
          }
          emptyTitle="Nobody has clocked onto this job yet."
          emptyAction={
            runningEntry ? undefined : (
              <button type="button" onClick={() => clockOnJob.mutate()} className="text-sm font-medium text-pass hover:underline">
                Clock on
              </button>
            )
          }
        >
          {(timesheets ?? []).slice(0, 5).map(entry => {
            const duration = entry.end_time
              ? Math.round((new Date(entry.end_time).getTime() - new Date(entry.start_time).getTime()) / 60000)
              : 0;
            return (
              <div key={entry.id} className="flex items-center gap-2.5 px-3.5 py-2.5">
                <Clock size={15} className="text-[#0A2540] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#1A1A1A]">
                    {format(new Date(entry.start_time), 'd MMM yyyy')}
                    {' · '}
                    {format(new Date(entry.start_time), 'HH:mm')}
                    {entry.end_time ? `–${format(new Date(entry.end_time), 'HH:mm')}` : ' · running'}
                  </p>
                  <p className="text-xs text-[#9CA3AF]">{[entry.work_type, entry.billable ? 'Billable' : 'Non-billable'].filter(Boolean).join(' · ')}</p>
                </div>
                {duration > 0 && <span className="text-sm text-[#4A5568]">{formatDuration(duration)}</span>}
              </div>
            );
          })}
        </JobRelatedSection>
        {(timesheets ?? []).length > 5 && (
          <p className="text-xs text-[#6B7280] mt-1.5 mb-5 px-1">
            Showing 5 of {(timesheets ?? []).length}. <Link to={`/timesheets?job=${job.id}`} className="text-[#2E75B6] hover:underline">See all</Link>
          </p>
        )}

        <div id="job-bill" className="mt-5 mb-6">
          <button
            type="button"
            onClick={() => setBillOpen(o => !o)}
            className="w-full card px-4 py-3 flex items-center gap-3 text-left hover:bg-[#F9FAFB]"
          >
            <DollarSign size={16} className="text-[#0A2540] shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[#1A1A1A]">Job bill</p>
              <p className="text-xs text-[#6B7280]">
                {budget != null ? `Budget ${formatMoney(budget)} · ` : ''}
                Cost {formatMoney(actualCost)} · Charge {formatMoney(chargeTotal)}
                {(costTotals?.lines ?? 0) === 0 ? ' · No lines yet' : ''}
              </p>
            </div>
            <ChevronDown size={16} className={`text-[#9CA3AF] transition-transform ${billOpen ? 'rotate-180' : ''}`} />
          </button>
          {billOpen && (
            <div className="mt-3">
              <JobCostingPanel
                jobId={job.id}
                clientId={job.client_id}
                onInvoiceCreated={() => {
                  queryClient.invalidateQueries({ queryKey: ['job-invoices', id] });
                  queryClient.invalidateQueries({ queryKey: ['job-cost-totals', id] });
                  showToast('Invoice ready — see Invoices on this job');
                }}
              />
            </div>
          )}
        </div>

        {next.key !== 'none' && (
          <div className="ops-sticky -mx-4 sm:mx-0">
            {next.key === 'inspect' ? (
              <Link to={inspectHref} className="ops-next-control-block">{next.label}</Link>
            ) : (
              <button
                type="button"
                className="ops-next-control-block"
                onClick={() => {
                  if (next.key === 'schedule' || next.key === 'crew') scrollToId('job-schedule');
                  else if (next.key === 'jha') startJha();
                  else if (next.key === 'invoice') handleInvoice();
                  else if (next.key === 'clock') clockOnJob.mutate();
                }}
              >
                {next.label}
              </button>
            )}
          </div>
        )}
      </div>
        <JobFormModal
          job={job}
          presetDate={null}
          presetClientId={null}
          fields="details"
          onAddStage={!job.parent_job_id ? () => { setShowEdit(false); setShowStage(true); } : undefined}
          onClose={() => setShowEdit(false)}
          onSaved={(_jobId, opts) => {
            if (opts?.deleted) {
              navigate('/jobs');
              return;
            }
            setShowEdit(false);
            queryClient.invalidateQueries({ queryKey: ['job', id] });
            queryClient.invalidateQueries({ queryKey: ['jobs-all'] });
            queryClient.invalidateQueries({ queryKey: ['jobs'] });
            queryClient.invalidateQueries({ queryKey: ['job-children', id] });
            showToast('Job updated');
          }}
        />
      )}
      {showStage && (
        <JobFormModal
          job={null}
          presetDate={job.scheduled_date}
          presetClientId={job.client_id}
          presetParentJobId={job.id}
          presetAddress={job.address}
          onClose={() => setShowStage(false)}
          onSaved={(stageId) => {
            setShowStage(false);
            queryClient.invalidateQueries({ queryKey: ['job-children', id] });
            navigate(`/jobs/${stageId}`);
          }}
        />
      )}
      {showTimeEntry && profile && (
        <TimeEntryForm
          timesheets={myTimesheets ?? []}
          jobs={[{ id: job.id, title: job.title, job_number: job.job_number }]}
          employeeId={profile.id}
          presetJobId={job.id}
          lockJob
          onClose={() => setShowTimeEntry(false)}
          onSaved={() => {
            setShowTimeEntry(false);
            invalidateTime();
            showToast('Time entry saved');
          }}
        />
      )}
    </AppShell>
  );
}
