import { useState } from 'react';
import type { ReactNode } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, Breadcrumbs, useToast } from '../components/ui';
import { JobFormModal } from '../components/crm/JobFormModal';
import { JobCostingPanel } from '../components/jobs/JobCostingPanel';
import { JobDispatchPanel } from '../components/jobs/JobDispatchPanel';
import { TimeEntryForm } from '../components/timesheets/TimeEntryForm';
import type { Client, Job, JobStatus } from '../types/crm';
import { JOB_STATUS_LABELS, JOB_STATUS_STYLES, JOB_PRIORITY_LABELS, JOB_PRIORITY_DOT } from '../types/crm';
import { formatMoney, INVOICE_STATUS_LABELS, INVOICE_STATUS_STYLES, QUOTE_STATUS_LABELS, QUOTE_STATUS_STYLES, formatDuration } from '../types/fsm';
import type { InvoiceStatus, Timesheet } from '../types/fsm';
import { pickJobColor } from '../lib/jobColors';
import { convertQuoteToInvoice } from '../lib/convertQuoteToInvoice';
import { DEFAULT_TAX_RATE } from '../lib/gst';
import { effectiveInvoiceStatus } from '../lib/invoiceStatus';
import {
  Briefcase, Calendar, Clock, MapPin, User, Phone, Mail, Edit3, ChevronRight,
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

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { profile, company } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showEdit, setShowEdit] = useState(false);
  const [showTimeEntry, setShowTimeEntry] = useState(false);

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
        .select('id, invoice_number, status, total, due_date, created_at')
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

  const { data: costTotals } = useQuery<{ cost: number; charge: number }>({
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

  const color = pickJobColor(job.id, job.color);
  const assigned = (job.assigned_team ?? [])
    .map(tid => teamMembers?.find(m => m.id === tid)?.name)
    .filter(Boolean) as string[];
  const budget = job.budget != null ? Number(job.budget) : null;
  const actualCost = costTotals?.cost ?? 0;
  const chargeTotal = costTotals?.charge ?? 0;
  const variance = budget != null ? budget - actualCost : null;
  const jhaStartHref = (templateId: string) => {
    const params = new URLSearchParams({ templateId, jobId: job.id });
    if (job.client_id) params.set('clientId', job.client_id);
    return `/jha/new?${params.toString()}`;
  };

  return (
    <AppShell>
      <div className="page-shell">
        <Breadcrumbs items={[
          { label: 'Jobs', to: '/jobs' },
          { label: job.job_number != null ? `#${padNum(job.job_number)} ${job.title}` : job.title },
        ]} />

        <div className="card p-5 mb-6" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0">
              <div className="w-14 h-14 rounded-xl bg-[#0A2540]/10 flex items-center justify-center shrink-0">
                <Briefcase size={26} className="text-[#0A2540]" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {job.job_number != null && (
                    <span className="text-xs font-bold" style={{ color }}>#{padNum(job.job_number)}</span>
                  )}
                  <h1 className="text-lg font-semibold text-[#1A1A1A]">{job.title}</h1>
                </div>
                {parentJob && (
                  <Link to={`/jobs/${parentJob.id}`} className="mt-1 inline-flex items-center gap-1 text-xs text-[#2E75B6] hover:underline">
                    <GitBranch size={12} />
                    Stage of {parentJob.job_number != null ? `#${padNum(parentJob.job_number)} ` : ''}{parentJob.title}
                  </Link>
                )}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
                  {client && (
                    <Link to={`/clients/${client.id}`} className="flex items-center gap-1.5 text-sm text-[#2E75B6] hover:underline">
                      <User size={13} /> {client.name}
                    </Link>
                  )}
                  {client?.phone && (
                    <a href={`tel:${client.phone}`} className="flex items-center gap-1.5 text-sm text-[#2E75B6] hover:underline">
                      <Phone size={13} /> {client.phone}
                    </a>
                  )}
                  {client?.email && (
                    <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 text-sm text-[#2E75B6] hover:underline">
                      <Mail size={13} /> {client.email}
                    </a>
                  )}
                  {(job.address || client?.address) && (
                    <div className="flex items-center gap-1.5 text-sm text-[#4A5568]">
                      <MapPin size={13} /> {job.address || client?.address}
                    </div>
                  )}
                  {job.scheduled_date && (
                    <div className="flex items-center gap-1.5 text-sm text-[#4A5568]">
                      <Calendar size={13} /> {format(parseISO(job.scheduled_date), 'd MMM yyyy')}
                      {job.start_time && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} /> {job.start_time.slice(0, 5)}{job.end_time ? `–${job.end_time.slice(0, 5)}` : ''}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {assigned.length > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-sm text-[#4A5568]">
                    <Users size={13} /> {assigned.join(', ')}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              <select
                value={job.status}
                onChange={e => updateStatus.mutate(e.target.value as JobStatus)}
                className={`form-input-sm text-xs font-medium cursor-pointer ${JOB_STATUS_STYLES[job.status]}`}
              >
                {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map(s => (
                  <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>
                ))}
              </select>
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
                  disabled={clockOnJob.isPending}
                  className="inline-flex items-center gap-1.5 bg-[#16A34A] text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-[#15803D] transition-all duration-200 active:scale-[0.98] disabled:opacity-50"
                >
                  <Play size={14} /> Clock on
                </button>
              )}
              <button onClick={() => setShowEdit(true)} className="btn-secondary">
                <Edit3 size={14} /> Edit
              </button>
            </div>
          </div>

          {job.description && (
            <div className="mt-4 pt-4 border-t border-[#F3F4F6]">
              <p className="text-xs font-medium text-[#4A5568] mb-1">Scope / notes</p>
              <p className="text-sm text-[#1A1A1A] whitespace-pre-wrap">{job.description}</p>
            </div>
          )}

          <div className="mt-4 pt-4 border-t border-[#F3F4F6] flex flex-wrap items-center gap-2">
            <Link
              to={`/inspections/new?crmJobId=${job.id}`}
              className="flex items-center gap-1.5 text-sm font-medium text-[#0A2540] bg-[#F0F7FF] border border-[#BFDBFE] px-3 py-1.5 rounded-md hover:bg-[#E0EFFF]"
            >
              <ClipboardList size={14} /> Start inspection
            </Link>
            {(jhaTemplates ?? []).length > 0 ? (
              <select
                className="form-input-sm text-sm"
                defaultValue=""
                onChange={e => {
                  const templateId = e.target.value;
                  if (templateId) navigate(jhaStartHref(templateId));
                }}
              >
                <option value="">Start JHA from template…</option>
                {(jhaTemplates ?? []).map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            ) : (
              <Link to="/templates" className="text-sm text-[#2E75B6] hover:underline">
                Add a JHA template to start safety docs
              </Link>
            )}
            {job.priority !== 'medium' && (
              <span className="ml-auto flex items-center gap-1 text-xs font-medium" style={{ color: JOB_PRIORITY_DOT[job.priority] }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: JOB_PRIORITY_DOT[job.priority] }} />
                {JOB_PRIORITY_LABELS[job.priority]} priority
              </span>
            )}
          </div>
        </div>

        <JobDispatchPanel job={job} teamMembers={teamMembers ?? []} />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Budget" value={budget != null ? formatMoney(budget) : '—'} icon={DollarSign} />
          <StatCard label="Actual cost" value={formatMoney(actualCost)} icon={DollarSign} color="text-[#4A5568]" />
          <StatCard label="Charge" value={formatMoney(chargeTotal)} icon={Receipt} color="text-[#0A2540]" />
          <StatCard
            label="Budget vs cost"
            value={variance == null ? '—' : formatMoney(variance)}
            icon={DollarSign}
            color={variance == null ? undefined : variance >= 0 ? 'text-green-600' : 'text-red-600'}
          />
        </div>

        {(childJobs ?? []).length > 0 && (
          <RelatedSection title="Project stages" icon={GitBranch}>
            {(childJobs ?? []).map(child => (
              <Link key={child.id} to={`/jobs/${child.id}`}
                className="flex items-center gap-3 bg-white rounded-lg border border-[#E5E7EB] p-3 hover:shadow-sm transition-shadow">
                <GitBranch size={16} className="text-[#0A2540] shrink-0" />
                <p className="text-sm font-medium text-[#1A1A1A] truncate flex-1">
                  {child.job_number != null ? `#${padNum(child.job_number)} ` : ''}{child.title}
                </p>
                <span className="text-xs text-[#6B7280] capitalize">{child.status.replace('_', ' ')}</span>
                <ChevronRight size={15} className="text-[#D1D5DB]" />
              </Link>
            ))}
          </RelatedSection>
        )}

        <RelatedSection
          title="Inspections"
          icon={ClipboardList}
          action={<Link to={`/inspections/new?crmJobId=${job.id}`} className="flex items-center gap-1 text-sm text-[#2E75B6] hover:underline"><Plus size={14} /> New</Link>}
          empty="No inspections linked to this job yet"
        >
          {(inspections ?? []).map(insp => (
            <Link key={insp.id} to={inspectionHref(insp.status, insp.id)}
              className="flex items-center gap-3 bg-white rounded-lg border border-[#E5E7EB] p-3 hover:shadow-sm transition-shadow">
              <FileText size={16} className="text-[#2E75B6] shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[#1A1A1A] truncate">{insp.template_snapshot?.name ?? 'Inspection'}</p>
                <p className="text-xs text-[#9CA3AF]">{format(new Date(insp.started_at), 'd MMM yyyy')}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${insp.status === 'completed' || insp.status === 'issued' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                {insp.status}
              </span>
              <ChevronRight size={15} className="text-[#D1D5DB]" />
            </Link>
          ))}
        </RelatedSection>

        <RelatedSection
          title="JHAs"
          icon={ShieldCheck}
          empty="No JHAs for this job yet — start one from a template above"
        >
          {(jhas ?? []).map(doc => {
            const title = doc.meta?.taskName || doc.template_snapshot?.name || 'JHA';
            return (
              <Link key={doc.id} to={`/jha/new?docId=${doc.id}`}
                className="flex items-center gap-3 bg-white rounded-lg border border-[#E5E7EB] p-3 hover:shadow-sm transition-shadow">
                <ShieldCheck size={16} className="text-[#0A2540] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#1A1A1A] truncate">{title}</p>
                  <p className="text-xs text-[#9CA3AF]">
                    {[doc.report_number, format(new Date(doc.created_at), 'd MMM yyyy')].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-[#4A5568]">{doc.status}</span>
                <ChevronRight size={15} className="text-[#D1D5DB]" />
              </Link>
            );
          })}
        </RelatedSection>

        <RelatedSection title="Quotes" icon={FileText} action={<Link to="/quotes" className="text-sm text-[#2E75B6] hover:underline">View all</Link>} empty="No quotes linked to this job">
          {(quotes ?? []).map(q => (
            <div key={q.id} className="flex items-center gap-3 bg-white rounded-lg border border-[#E5E7EB] p-3">
              <Link to={`/quotes?id=${q.id}`} className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-80">
                <FileText size={16} className="text-[#2E75B6] shrink-0" />
                <p className="text-sm font-medium text-[#1A1A1A] truncate">Quote #{padNum(q.quote_number)}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${QUOTE_STATUS_STYLES[q.status as keyof typeof QUOTE_STATUS_STYLES] ?? 'bg-gray-100 text-gray-700'}`}>
                  {QUOTE_STATUS_LABELS[q.status as keyof typeof QUOTE_STATUS_LABELS] ?? q.status}
                </span>
                <span className="text-sm font-semibold text-[#1A1A1A]">{formatMoney(Number(q.total))}</span>
              </Link>
              {q.status === 'accepted' && (
                <button
                  type="button"
                  onClick={() => invoiceFromQuote.mutate(q.id)}
                  disabled={invoiceFromQuote.isPending}
                  className="shrink-0 flex items-center gap-1 text-xs font-medium text-[#0A2540] bg-[#F0F7FF] border border-[#BFDBFE] px-2 py-1 rounded-md hover:bg-[#E0EFFF] disabled:opacity-50"
                >
                  <Receipt size={12} /> Invoice
                </button>
              )}
            </div>
          ))}
        </RelatedSection>

        <RelatedSection title="Invoices" icon={Receipt} action={<Link to="/invoices" className="text-sm text-[#2E75B6] hover:underline">View all</Link>} empty="No invoices yet — invoice from a quote above or from the job bill below">
          {(invoices ?? []).map(inv => {
            const status = effectiveInvoiceStatus(inv);
            return (
            <Link key={inv.id} to={`/invoices?id=${inv.id}`}
              className="flex items-center gap-3 bg-white rounded-lg border border-[#E5E7EB] p-3 hover:shadow-sm transition-shadow">
              <Receipt size={16} className="text-[#F7931A] shrink-0" />
              <p className="text-sm font-medium text-[#1A1A1A] flex-1">Invoice #{padNum(inv.invoice_number)}</p>
              <span className={`text-xs px-2 py-0.5 rounded-full ${INVOICE_STATUS_STYLES[status]}`}>
                {INVOICE_STATUS_LABELS[status]}
              </span>
              <span className="text-sm font-semibold text-[#1A1A1A]">{formatMoney(Number(inv.total))}</span>
              <ChevronRight size={15} className="text-[#D1D5DB]" />
            </Link>
            );
          })}
        </RelatedSection>

        <RelatedSection
          title="Timesheets"
          icon={Clock}
          action={
            <div className="flex items-center gap-3">
              {runningEntry ? (
                <button type="button" onClick={() => clockOffJob.mutate()} disabled={clockOffJob.isPending}
                  className="flex items-center gap-1 text-sm text-red-600 hover:underline">
                  <Square size={14} /> Clock off
                </button>
              ) : (
                <button type="button" onClick={() => clockOnJob.mutate()} disabled={clockOnJob.isPending}
                  className="flex items-center gap-1 text-sm text-[#16A34A] hover:underline">
                  <Play size={14} /> Clock on
                </button>
              )}
              <button type="button" onClick={() => setShowTimeEntry(true)}
                className="flex items-center gap-1 text-sm text-[#2E75B6] hover:underline">
                <Plus size={14} /> Add entry
              </button>
              <Link to={`/timesheets?job=${job.id}`} className="text-sm text-[#2E75B6] hover:underline">All timesheets</Link>
            </div>
          }
          empty="No timesheet entries attached to this job"
        >
          {(timesheets ?? []).map(entry => {
            const duration = entry.end_time
              ? Math.round((new Date(entry.end_time).getTime() - new Date(entry.start_time).getTime()) / 60000)
              : 0;
            return (
              <div key={entry.id} className="flex items-center gap-3 bg-white rounded-lg border border-[#E5E7EB] p-3">
                <Clock size={16} className="text-[#0A2540] shrink-0" />
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
        </RelatedSection>

        <div className="mb-6">
          <h2 className="text-sm font-semibold text-[#1A1A1A] uppercase tracking-wide mb-3 flex items-center gap-1.5">
            <DollarSign size={14} className="text-[#0A2540]" /> Job bill / costs
          </h2>
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
      </div>

      {showEdit && (
        <JobFormModal
          job={job}
          presetDate={null}
          presetClientId={null}
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

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: typeof DollarSign; color?: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4">
      <div className="flex items-center gap-2 mb-1">
        <Icon size={14} className={color ?? 'text-[#9CA3AF]'} />
        <span className="text-xs text-[#4A5568] font-medium">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color ?? 'text-[#1A1A1A]'}`}>{value}</p>
    </div>
  );
}

function RelatedSection({
  title, icon: Icon, action, empty, children,
}: {
  title: string;
  icon: typeof FileText;
  action?: ReactNode;
  empty?: string;
  children: ReactNode;
}) {
  const items = Array.isArray(children) ? children : children ? [children] : [];
  const visible = items.filter(Boolean);
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-[#1A1A1A] uppercase tracking-wide flex items-center gap-1.5">
          <Icon size={14} className="text-[#0A2540]" /> {title}
        </h2>
        {action}
      </div>
      {visible.length === 0 ? (
        <div className="bg-white rounded-xl border border-[#E5E7EB] p-6 text-center">
          <p className="text-sm text-gray-500">{empty ?? `No ${title.toLowerCase()} yet`}</p>
        </div>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}
