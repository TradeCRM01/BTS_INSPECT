import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, Breadcrumbs, useToast, OpsStatus, OpsSiteRow, OpsPhotoStamp } from '../components/ui';
import { JobFormModal } from '../components/crm/JobFormModal';
import { JobCostingPanel } from '../components/jobs/JobCostingPanel';
import { JobDispatchPanel } from '../components/jobs/JobDispatchPanel';
import { JobClientReminder, type JobClientReminderHandle } from '../components/jobs/JobClientReminder';
import { JobCalendarOverflow } from '../components/jobs/JobCalendarOverflow';
import { calendarSite } from '../lib/jobCalendar';
import { formatJobRef } from '../lib/jobRef';
import { JobRelatedSection, JobRelatedRow } from '../components/jobs/JobRelatedSection';
import { TimeEntryForm } from '../components/timesheets/TimeEntryForm';
import type { Client, Job, JobStatus } from '../types/crm';
import { JOB_STATUS_LABELS, JOB_STATUS_STYLES, JOB_PRIORITY_LABELS, JOB_PRIORITY_DOT } from '../types/crm';
import { formatMoney, INVOICE_STATUS_LABELS, INVOICE_STATUS_STYLES, QUOTE_STATUS_LABELS, QUOTE_STATUS_STYLES, formatDuration } from '../types/fsm';
import type { InvoiceStatus, Timesheet } from '../types/fsm';
import { convertQuoteToInvoice } from '../lib/convertQuoteToInvoice';
import { getAuditClient, getAuditEmptyList, getAuditJob, getAuditTeamMembers } from '../lib/devFieldAuditDocs';
import { createInvoiceFromJobBill } from '../lib/createInvoiceFromJobBill';
import {
  JOB_BILL_INVOICE_CREATED,
  JOB_BILL_INVOICE_EXISTS,
  JOB_BILL_INVOICE_NO_LINES,
} from '../lib/invoiceFromJobBill';
import { DEFAULT_TAX_RATE } from '../lib/gst';
import { effectiveInvoiceStatus } from '../lib/invoiceStatus';
import { jobInvoiceActionFlags, recommendJobAction } from '../lib/jobNextAction';
import { jobDraftSendToast, sendJobDraftInvoice } from '../lib/sendJobDraftInvoice';
import {
  JOB_CLIENT_ATTACH_NO_CLIENTS,
  attachJobClient,
  jobClientAttachRow,
  jobClientAttachToast,
} from '../lib/attachJobClient';
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
  ARRIVING_NEXT_LABEL,
  isJobArrivingWindow,
  isJobRescheduleQuery,
  jobOfficeRescheduleBanner,
  withReminderNext,
} from '../lib/jobReminder';
import { jhaCardHint, jhaListContext, jhaStatusClass, jhaStatusLabel, recommendJhaListAction } from '../lib/jhaNextAction';
import { livingInspectionSummary, livingSwmsSummary, livingTake5Summary } from '../lib/livingJha';
import { take5CardHint, take5FillPath, take5ListContext, take5StatusClass, take5StatusLabel, recommendTake5ListAction } from '../lib/take5NextAction';
import { inspectionStatusClass, inspectionStatusLabel } from '../lib/inspectionNextAction';
import { withInspectionDueNext } from '../lib/inspectionDueReminder';
import { ReportSendDialog } from '../components/inspection/ReportSendDialog';
import { inspectionDisplayStatus, reportSendSurface } from '../lib/sendReport';
import type { TemplateSchema } from '../types/template';
import { clientRecordHref } from '../lib/clientRecords';
import {
  Calendar, Clock, User, Phone, Mail, ChevronDown,
  FileText, ShieldCheck, ShieldAlert, Receipt, DollarSign, Plus, ClipboardList, GitBranch, Users,
  MoreHorizontal,
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
  template_snapshot: { name?: string; schema?: TemplateSchema } | null;
  meta?: Record<string, string> | null;
  responses?: Record<string, unknown> | null;
  crm_job_id?: string | null;
  due_on?: string | null;
  archived?: boolean | null;
};

type JobJha = {
  id: string;
  status: string;
  report_number: string | null;
  created_at: string;
  template_snapshot: { name?: string } | null;
  meta: Record<string, string> | null;
  steps?: Array<{ hazards?: string | null; description?: string | null }> | null;
};

type JobTake5 = {
  id: string;
  jha_document_id: string;
  status: string;
  meta: Record<string, string> | null;
  stop_think: string | null;
  identify_hazards: string | null;
  control_actions: string | null;
  signature: string | null;
  signed_name: string | null;
  go_no_go: string | null;
  created_at: string;
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

type ChildJob = { id: string; title: string; status: string; job_number: number | null; cost_code?: string | null };
type TeamMember = { id: string; name: string };

function padNum(n: number | null | undefined): string {
  return String(n ?? 0).padStart(4, '0');
}

function inspectionHref(status: string, id: string): string {
  return status === 'completed' || status === 'issued' || status === 'sent'
    ? `/inspections/${id}/report`
    : `/inspections/${id}`;
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const rescheduleAsked = isJobRescheduleQuery(searchParams);
  const { profile, company } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [showEdit, setShowEdit] = useState(false);
  const [showStage, setShowStage] = useState(false);
  const [showTimeEntry, setShowTimeEntry] = useState(false);
  const [showJhaPicker, setShowJhaPicker] = useState(false);
  const [billOpen, setBillOpen] = useState(true);
  const [sendingReportId, setSendingReportId] = useState<string | null>(null);
  const [clientEmailDraft, setClientEmailDraft] = useState('');
  const [clientPhoneDraft, setClientPhoneDraft] = useState('');
  const [clientAttachDraft, setClientAttachDraft] = useState('');
  const [arrivingSent, setArrivingSent] = useState(false);
  const [arrivingBusy, setArrivingBusy] = useState(false);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const reminderRef = useRef<JobClientReminderHandle>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  const { data: job, isLoading, error } = useQuery<Job>({
    queryKey: ['job', id],
    queryFn: async () => {
      const mock = getAuditJob(id!);
      if (mock) return mock as Job;
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
      const mock = getAuditClient(job.client_id);
      if (mock) return mock as Client;
      const { data, error } = await supabase.from('clients').select('*').eq('id', job.client_id).maybeSingle();
      if (error) throw error;
      return (data as Client) ?? null;
    },
    enabled: !!job?.client_id,
  });

  const attachClientsQuery = useQuery<{ id: string; name: string }[]>({
    queryKey: ['job-attach-clients', profile?.company_id],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const { data, error } = await supabase
        .from('clients')
        .select('id, name')
        .eq('archived', false)
        .eq('company_id', profile.company_id)
        .order('name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
    enabled: !!job && !job.client_id && !!profile?.company_id,
  });

  useEffect(() => {
    setClientEmailDraft(client?.email ?? '');
  }, [client?.id, client?.email]);

  useEffect(() => {
    setClientPhoneDraft(client?.phone ?? '');
  }, [client?.id, client?.phone]);

  useEffect(() => {
    setClientAttachDraft('');
    setArrivingSent(false);
  }, [job?.id]);

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
      const empty = getAuditEmptyList();
      if (empty) return empty as ChildJob[];
      const { data, error } = await supabase
        .from('jobs').select('id, title, status, job_number, cost_code').eq('parent_job_id', id!).order('created_at');
      if (error) throw error;
      return (data ?? []) as ChildJob[];
    },
    enabled: !!id && !!profile,
  });

  const { data: teamMembers } = useQuery<TeamMember[]>({
    queryKey: ['team-members-job-detail'],
    queryFn: async () => {
      if (!profile?.company_id) return [];
      const mock = getAuditTeamMembers();
      if (mock) return mock.map(m => ({ id: m.id, name: m.name }));
      const { data, error } = await supabase.rpc('get_company_members', { p_company_id: profile.company_id });
      if (error) throw error;
      return (data ?? []).map((m: { id: string; name: string }) => ({ id: m.id, name: m.name }));
    },
    enabled: !!profile,
  });

  const { data: jhaTemplates } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['jha-templates-picker'],
    queryFn: async () => {
      const empty = getAuditEmptyList();
      if (empty) return empty as { id: string; name: string }[];
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
      const empty = getAuditEmptyList();
      if (empty) return empty as JobInspection[];
      const { data, error } = await supabase
        .from('inspections')
        .select('id, status, started_at, template_snapshot, meta, responses, crm_job_id, due_on, archived')
        .eq('crm_job_id', id!)
        .order('started_at', { ascending: false });
      if (error) throw error;
      const list = (data ?? []) as JobInspection[];
      const linkedId = job?.inspection_id;
      if (linkedId && !list.some(i => i.id === linkedId)) {
        const { data: extra } = await supabase
          .from('inspections')
          .select('id, status, started_at, template_snapshot, meta, responses, crm_job_id, due_on, archived')
          .eq('id', linkedId)
          .maybeSingle();
        if (extra) list.push(extra as JobInspection);
      }
      return list;
    },
    enabled: !!id && !!profile && !!job,
  });

  const { data: jobReports } = useQuery<Array<{ id: string; inspection_id: string; report_number: string | null; sent_at: string | null }>>({
    queryKey: ['job-reports', id, (inspections ?? []).map(i => i.id).join(',')],
    queryFn: async () => {
      const ids = (inspections ?? []).map(i => i.id);
      if (ids.length === 0 || !profile?.company_id) return [];
      const { data, error } = await supabase
        .from('reports')
        .select('id, inspection_id, report_number, sent_at')
        .in('inspection_id', ids)
        .eq('company_id', profile.company_id);
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; inspection_id: string; report_number: string | null; sent_at: string | null }>;
    },
    enabled: !!id && !!profile?.company_id && !!inspections && inspections.length > 0,
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
      const empty = getAuditEmptyList();
      if (empty) return empty as JobJha[];
      const { data, error } = await supabase
        .from('jha_documents')
        .select('id, status, report_number, created_at, template_snapshot, meta, steps')
        .eq('job_id', id!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as JobJha[];
    },
    enabled: !!id && !!profile,
  });

  const { data: take5s } = useQuery<JobTake5[]>({
    queryKey: ['job-take5s', id, (jhas ?? []).map(doc => doc.id).join(',')],
    queryFn: async () => {
      const jhaIds = (jhas ?? []).map(doc => doc.id);
      if (jhaIds.length === 0) return [];
      const { data, error } = await supabase
        .from('jha_take5')
        .select('id, jha_document_id, status, meta, stop_think, identify_hazards, control_actions, signature, signed_name, go_no_go, created_at')
        .in('jha_document_id', jhaIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as JobTake5[];
    },
    enabled: !!id && !!profile && !!jhas,
  });

  const { data: quotes } = useQuery<JobQuote[]>({
    queryKey: ['job-quotes', id],
    queryFn: async () => {
      const empty = getAuditEmptyList();
      if (empty) return empty as JobQuote[];
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
      const empty = getAuditEmptyList();
      if (empty) return empty as JobInvoice[];
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
      const empty = getAuditEmptyList();
      if (empty) return empty as JobTimesheet[];
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
      const empty = getAuditEmptyList();
      if (empty) return empty as Timesheet[];
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
      const empty = getAuditEmptyList();
      if (empty) return { cost: 0, charge: 0, lines: 0 };
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

  const invoiceFromJobBill = useMutation({
    mutationFn: async () => {
      if (!profile?.id || !profile.company_id || !id) throw new Error('Not signed in');
      return createInvoiceFromJobBill({
        jobId: id,
        companyId: profile.company_id,
        profileId: profile.id,
        taxRate: Number(company?.default_tax_rate) || DEFAULT_TAX_RATE,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['job-invoices', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      showToast(result.existing ? JOB_BILL_INVOICE_EXISTS : JOB_BILL_INVOICE_CREATED);
    },
    onError: (e: Error) => {
      showToast(e.message, 'info');
      if (e.message === JOB_BILL_INVOICE_NO_LINES) {
        setBillOpen(true);
        setTimeout(() => scrollToId('job-bill'), 50);
      }
    },
  });

  const sendJobDraft = useMutation({
    mutationFn: async () => {
      return sendJobDraftInvoice({
        invoices: invoices ?? [],
        company,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['job-invoices', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      const toast = jobDraftSendToast(result);
      showToast(toast.message, toast.kind);
    },
    onError: (e: Error) => showToast(e.message, 'info'),
  });

  const attachClient = useMutation({
    mutationFn: async () => {
      return attachJobClient({
        jobId: job?.id,
        jobClientId: job?.client_id,
        clientId: clientAttachDraft,
        companyClients: attachClientsQuery.data ?? [],
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['job', id] });
      queryClient.invalidateQueries({ queryKey: ['job-client', result.clientId] });
      queryClient.invalidateQueries({ queryKey: ['jobs-all'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      setClientAttachDraft('');
      const toast = jobClientAttachToast();
      showToast(toast.message, toast.kind);
    },
    onError: (e: Error) => showToast(e.message, 'info'),
  });

  const saveClientEmail = useMutation({
    mutationFn: async () => {
      return saveJobClientEmail({
        clientId: job?.client_id,
        email: clientEmailDraft,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['job-client', job?.client_id] });
      setClientEmailDraft(result.email ?? '');
      const toast = jobClientEmailSaveToast(result.email);
      showToast(toast.message, toast.kind);
    },
    onError: (e: Error) => showToast(e.message, 'info'),
  });

  const saveClientPhone = useMutation({
    mutationFn: async () => {
      return saveJobClientPhone({
        clientId: job?.client_id,
        phone: clientPhoneDraft,
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['job-client', job?.client_id] });
      setClientPhoneDraft(result.phone ?? '');
      const toast = jobClientPhoneSaveToast(result.phone);
      showToast(toast.message, toast.kind);
    },
    onError: (e: Error) => showToast(e.message, 'info'),
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

  useEffect(() => {
    if (!job) return;
    const hash = window.location.hash.replace(/^#/, '');
    const target = hash || (rescheduleAsked ? 'job-schedule' : '');
    if (!target) return;
    const t = window.setTimeout(() => {
      document.getElementById(target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => window.clearTimeout(t);
  }, [job, rescheduleAsked]);

  if (isLoading) return <AppShell><div className="flex justify-center py-20"><LoadingSpinner /></div></AppShell>;
  if (error || !job) return <AppShell><PageError message="Could not load this job" /></AppShell>;

  const assigned = (job.assigned_team ?? [])
    .map(tid => teamMembers?.find(m => m.id === tid)?.name)
    .filter(Boolean) as string[];
  const budget = job.budget != null ? Number(job.budget) : null;
  const actualCost = costTotals?.cost ?? 0;
  const chargeTotal = costTotals?.charge ?? 0;
  const site = job.address || client?.address || null;
  const jobRef = formatJobRef({
    job_number: job.job_number,
    cost_code: job.cost_code,
    parent_job_number: parentJob?.job_number ?? null,
  });
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
    scrollToId('job-swms');
  };

  const startTake5 = () => {
    if (jhas === undefined) return;
    const parent = jhas[0];
    if (!parent) {
      showToast('Start a JHA / SWMS first, then Start Take 5');
      startJha();
      return;
    }
    navigate(take5FillPath(parent.id));
  };

  const handleInvoice = () => {
    invoiceFromJobBill.mutate();
  };

  const handleSend = () => {
    sendJobDraft.mutate();
  };

  const emailRow = jobClientEmailRow({ clientId: job.client_id, client: client ?? null });
  const phoneRow = jobClientPhoneRow({ clientId: job.client_id, client: client ?? null });
  const attachRow = jobClientAttachRow({
    jobClientId: job.client_id,
    companyClients: job.client_id
      ? []
      : attachClientsQuery.isFetched
        ? (attachClientsQuery.data ?? [])
        : null,
  });

  const next = recommendJobAction({
    status: job.status,
    scheduledDate: job.scheduled_date,
    crewCount: (job.assigned_team ?? []).length,
    jhaCount: (jhas ?? []).length,
    inspectionCount: (inspections ?? []).length,
    ...jobInvoiceActionFlags(invoices ?? []),
    hasAcceptedQuote: !!acceptedQuote,
    hasBillLines: (costTotals?.lines ?? 0) > 0,
    clockedOn: !!runningEntry,
    arrivingWindow: isJobArrivingWindow(job),
    arrivingSent,
    phoneRowKind: phoneRow.kind,
    phoneStored: phoneRow.kind === 'none' ? '' : phoneRow.phone,
  });
  const sheetNext = withReminderNext(job, {
    href: `/jobs/${job.id}`,
    label: next.label,
    actionable: next.key !== 'none',
  });
  const arrivingPrimary = sheetNext.label === ARRIVING_NEXT_LABEL;

  const nextBusy =
    (next.key === 'invoice' && invoiceFromJobBill.isPending) ||
    (next.key === 'send' && sendJobDraft.isPending) ||
    (arrivingPrimary && arrivingBusy) ||
    (next.key === 'clock' && clockOnJob.isPending) ||
    (next.key === 'phone' && saveClientPhone.isPending);

  const writeClientPhone = () => {
    if (clientPhoneDraft.trim()) {
      saveClientPhone.mutate();
      return;
    }
    phoneInputRef.current?.focus();
    phoneInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const runNext = () => {
    if (arrivingPrimary) {
      reminderRef.current?.sendArriving();
      return;
    }
    if (next.key === 'phone') writeClientPhone();
    else if (next.key === 'schedule' || next.key === 'crew') scrollToId('job-schedule');
    else if (next.key === 'jha') startJha();
    else if (next.key === 'invoice') handleInvoice();
    else if (next.key === 'send') handleSend();
    else if (next.key === 'clock') clockOnJob.mutate();
  };

  const inspectHref = `/inspections/new?jobId=${job.id}`;

  return (
    <AppShell>
      <div className="ops-page hub-jobs hub-job-cal is-record-open">
        <Breadcrumbs items={[
          { label: 'Jobs', to: '/jobs' },
          { label: `${jobRef} ${job.title}` },
        ]} />

        <div className="hub-jobs-open-chrome">
          <Link to="/jobs" className="hub-jobs-label">Jobs</Link>
        </div>

        <article className="hub-jobs-document job-cal-host">
          <header className="hub-jobs-sheet-bar">
            <span className="hub-jobs-hours">{jobRef}</span>
            <select
              value={job.status}
              onChange={e => updateStatus.mutate(e.target.value as JobStatus)}
              className={`hub-jobs-pill is-${job.status} hub-job-status`}
              aria-label="Job status"
            >
              {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map(s => (
                <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </header>
          <div className="hub-jobs-sheet-body">
            <h1 className="hub-jobs-hero">{job.title}</h1>
            {site ? <p className="hub-jobs-jobline">{site}</p> : null}

            <div className="hub-jobs-tools">
              {next.key === 'inspect' && !arrivingPrimary ? (
                <Link to={inspectHref} className="btn-primary ops-next-control-block">{sheetNext.label}</Link>
              ) : next.key !== 'none' || arrivingPrimary ? (
                <button
                  type="button"
                  className="btn-primary ops-next-control-block"
                  disabled={nextBusy}
                  onClick={runNext}
                >
                  {sheetNext.label}
                </button>
              ) : (
                <span className="ops-next-control-done">{sheetNext.label}</span>
              )}
              <details ref={moreRef} className="hub-job-more">
                <summary aria-label="More actions">
                  <MoreHorizontal size={18} />
                </summary>
                <div className="hub-job-more-menu" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { closeMore(); scrollToId('job-schedule'); }}
                  >
                    Schedule / crew
                  </button>
                  {(jhaTemplates ?? []).length <= 1 ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { closeMore(); startJha(); }}
                    >
                      {(jhas ?? []).length > 0 ? 'Another JHA' : 'Start JHA / SWMS'}
                    </button>
                  ) : (
                    (jhaTemplates ?? []).map(t => (
                      <button
                        key={t.id}
                        type="button"
                        role="menuitem"
                        onClick={() => { closeMore(); navigate(jhaStartHref(t.id)); }}
                      >
                        {t.name}
                      </button>
                    ))
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { closeMore(); navigate(inspectHref); }}
                  >
                    Start inspection
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { closeMore(); handleInvoice(); }}
                    disabled={invoiceFromJobBill.isPending}
                  >
                    Invoice
                  </button>
                  {runningEntry ? (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { closeMore(); clockOffJob.mutate(); }}
                      disabled={clockOffJob.isPending}
                    >
                      Clock off
                    </button>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { closeMore(); clockOnJob.mutate(); }}
                      disabled={clockOnJob.isPending || job.status === 'cancelled'}
                    >
                      Clock on
                    </button>
                  )}
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => { closeMore(); setShowEdit(true); }}
                  >
                    Details
                  </button>
                </div>
              </details>
              <div className="job-cal-quiet">
                <JobCalendarOverflow
                  job={job}
                  site={calendarSite(job.address, client?.address)}
                  crewNames={assigned}
                />
              </div>
            </div>

            {coverPhotoUrl ? (
              <OpsPhotoStamp src={coverPhotoUrl} hub />
            ) : null}

            <div className="hub-jobs-ledger">
              <div className="hub-jobs-ledger-row">
                <OpsSiteRow
                  hub
                  site={site ? site : 'No site address yet — add it in job details'}
                  mapsQuery={site}
                />
                {parentJob && (
                  <Link to={`/jobs/${parentJob.id}`} className="inline-flex items-center gap-1 ops-meta text-accent hover:underline">
                    <GitBranch size={12} />
                    Stage of {parentJob.job_number != null ? `#${padNum(parentJob.job_number)} ` : ''}{parentJob.title}
                  </Link>
                )}
              </div>
              <div className="hub-jobs-contact">
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
                <span className="flex items-center gap-1.5 ops-meta">
                  <User size={13} /> {JOB_CLIENT_ATTACH_NO_CLIENTS}
                </span>
              ) : client ? (
                <Link to={clientRecordHref(client.id)} className="flex items-center gap-1.5 text-accent hover:underline">
                  <User size={13} /> {client.name}
                </Link>
              ) : (
                <span className="flex items-center gap-1.5 ops-meta">
                  <User size={13} /> No client
                </span>
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
                    ref={phoneInputRef}
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

              <p className="hub-jobs-ledger-row">
                <span className="flex items-center gap-1.5">
                  <Users size={13} />
                  {assigned.length > 0 ? assigned.join(', ') : 'Unassigned'}
                </span>
              </p>
            {job.scheduled_date && (
              <p className="hub-jobs-ledger-row">
                <span className="flex items-center gap-1.5">
                  <Calendar size={13} />
                  {format(parseISO(job.scheduled_date), 'EEE d MMM yyyy')}
                  {job.start_time && (
                    <span className="hub-jobs-hours">{job.start_time.slice(0, 5)}{job.end_time ? `–${job.end_time.slice(0, 5)}` : ''}</span>
                  )}
                </span>
              </p>
            )}
            {job.priority !== 'medium' && (
                <p className="hub-jobs-ledger-row">
                  <span className="flex items-center gap-1 text-xs font-medium" style={{ color: JOB_PRIORITY_DOT[job.priority] }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: JOB_PRIORITY_DOT[job.priority] }} />
                    {JOB_PRIORITY_LABELS[job.priority]} priority
                  </span>
                </p>
              )}

            {((quotes ?? []).length > 0 || (invoices ?? []).length > 0) && (
              <>
                {(quotes ?? []).map(q => (
                  <Link key={q.id} to={`/quotes?id=${q.id}`} className="hub-jobs-ledger-row">
                    <span className="truncate">QT #{padNum(q.quote_number)} · {QUOTE_STATUS_LABELS[q.status as keyof typeof QUOTE_STATUS_LABELS] ?? q.status}</span>
                    <span className="hub-jobs-hours">{formatMoney(Number(q.total))}</span>
                  </Link>
                ))}
                {(invoices ?? []).map(inv => {
                  const status = effectiveInvoiceStatus(inv);
                  return (
                    <Link key={inv.id} to={`/invoices?id=${inv.id}`} className="hub-jobs-ledger-row">
                      <span className="truncate">INV #{padNum(inv.invoice_number)} · {INVOICE_STATUS_LABELS[status]}</span>
                      <span className="hub-jobs-hours">{formatMoney(Number(inv.total))}</span>
                    </Link>
                  );
                })}
              </>
            )}

            {job.description && (
              <p className="hub-jobs-ledger-row hub-jobs-muted whitespace-pre-wrap">{job.description}</p>
            )}
            </div>

            <div className="hub-trays hub-jobs-more-trays">
        {stages.length > 0 && (
            <JobRelatedSection
              title="Project stages"
              icon={GitBranch}
              count={stages.length}
              action={!job.parent_job_id ? (
                <button type="button" onClick={() => setShowStage(true)} className="ops-link text-xs">
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
                  title={`${formatJobRef({
                    job_number: job.job_number,
                    cost_code: child.cost_code,
                    parent_job_number: job.job_number,
                  })} ${child.title}`}
                  trailing={<OpsStatus className={JOB_STATUS_STYLES[child.status as JobStatus] ?? 'ops-status-wait'}>{JOB_STATUS_LABELS[child.status as JobStatus] ?? child.status}</OpsStatus>}
                />
              ))}
            </JobRelatedSection>
        )}

          <div id="job-insp">
          <JobRelatedSection
            title="Inspections"
            icon={ClipboardList}
            count={(inspections ?? []).length}
            action={
              <Link to={inspectHref} className="ops-link text-xs">
                <Plus size={12} className="inline" /> Add inspection
              </Link>
            }
            emptyTitle="No inspection on this job yet."
            emptyAction={<Link to={inspectHref} className="ops-link">Start inspection</Link>}
          >
            {(inspections ?? []).map(insp => {
              const next = withInspectionDueNext(
                { ...insp, crm_job_id: insp.crm_job_id ?? job.id },
                {
                  id: job.id,
                  company_id: job.company_id,
                  client_id: job.client_id,
                  scheduled_date: job.scheduled_date,
                  job_number: job.job_number,
                  title: job.title,
                  address: job.address,
                },
                { href: inspectionHref(insp.status, insp.id), label: 'Open', actionable: true },
              );
              const report = (jobReports ?? []).find(r => r.inspection_id === insp.id) ?? null;
              const sendSurface = reportSendSurface(report);
              const displayStatus = inspectionDisplayStatus(insp.status, report?.sent_at);
              const done = insp.status === 'completed' || insp.status === 'issued' || insp.status === 'sent';
              const living = livingInspectionSummary({
                meta: insp.meta,
                job: {
                  id: job.id,
                  title: job.title,
                  address: job.address,
                  client_id: job.client_id,
                  client_name: client?.name ?? '',
                },
                skipClient: !!job.client_id && !client,
              });
              return (
              <JobRelatedRow
                key={insp.id}
                href={next.href}
                icon={FileText}
                title={insp.template_snapshot?.name ?? 'Inspection'}
                meta={[
                  living.site || 'Site follows this job',
                  living.clientName || 'Client follows this job',
                  format(new Date(insp.started_at), 'd MMM yyyy'),
                ].filter(Boolean).join(' · ')}
                trailing={
                  <OpsStatus className={inspectionStatusClass(displayStatus)}>{inspectionStatusLabel(displayStatus)}</OpsStatus>
                }
                action={
                  next.label === 'Remind client' ? (
                    <Link to={next.href} className="ops-link text-xs">{next.label}</Link>
                  ) : sendSurface.kind === 'send' ? (
                    <button type="button" className="ops-link text-xs" onClick={() => setSendingReportId(sendSurface.reportId)}>
                      Send
                    </button>
                  ) : done ? (
                    <span className="ops-meta text-xs">No report yet</span>
                  ) : undefined
                }
              />
              );
            })}
          </JobRelatedSection>
          </div>

          <div id="job-swms">
          <JobRelatedSection
            title="JHA / SWMS"
            icon={ShieldCheck}
            count={(jhas ?? []).length}
            action={(jhas ?? []).length > 0 ? (
              <details className="job-swms-more">
                <summary aria-label="More">
                  <MoreHorizontal size={16} />
                </summary>
                <div className="job-swms-more-menu">
                  {(jhaTemplates ?? []).length <= 1 ? (
                    <button type="button" onClick={startJha}>Another JHA</button>
                  ) : (
                    (jhaTemplates ?? []).map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => navigate(jhaStartHref(t.id))}
                      >
                        {t.name}
                      </button>
                    ))
                  )}
                </div>
              </details>
            ) : undefined}
            emptyTitle="No JHA/SWMS on this job"
            emptyAction={
              <div className="relative">
                <button
                  type="button"
                  onClick={startJha}
                  className="btn-primary"
                >
                  Start JHA / SWMS
                </button>
                {showJhaPicker && (jhaTemplates ?? []).length > 1 && (jhas ?? []).length === 0 && (
                  <div className="job-swms-picker">
                    {(jhaTemplates ?? []).map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => navigate(jhaStartHref(t.id))}
                      >
                        {t.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            }
          >
            {(jhas ?? []).map((doc, index) => {
              const living = livingSwmsSummary({
                meta: doc.meta,
                steps: doc.steps,
                job,
                members: teamMembers ?? [],
              });
              const href = `/jha/new?docId=${doc.id}`;
              const ctx = jhaListContext({
                status: doc.status,
                meta: living.meta,
                job_title: job.title,
                job_address: job.address,
                livingSite: living.site,
                livingCrew: living.crew,
              });
              const nextOnDoc = recommendJhaListAction(ctx);
              const title = doc.meta?.documentTitle || doc.meta?.taskName || doc.template_snapshot?.name || 'JHA / SWMS';
              const metaBits = [
                living.site || 'Site follows this job',
                living.crewLabel || 'Crew follows this job',
                living.hazardLabel || 'No hazards on this document',
                doc.report_number,
                format(new Date(doc.created_at), 'd MMM yyyy'),
              ];
              return (
                <JobRelatedRow
                  key={doc.id}
                  href={href}
                  icon={ShieldCheck}
                  title={title}
                  meta={metaBits.filter(Boolean).join(' · ')}
                  trailing={<OpsStatus className={jhaStatusClass(doc.status)}>{jhaStatusLabel(doc.status)}</OpsStatus>}
                  action={
                    index === 0 ? (
                      <Link to={href} className="btn-primary shrink-0">
                        {jhaCardHint(ctx) === 'Open' ? 'Open SWMS' : nextOnDoc.label}
                      </Link>
                    ) : undefined
                  }
                />
              );
            })}
          </JobRelatedSection>

          <JobRelatedSection
            title="Take 5"
            icon={ShieldAlert}
            count={(take5s ?? []).length}
            action={(take5s ?? []).length > 0 ? (
              <button type="button" onClick={startTake5} className="ops-link">
                Another Take 5
              </button>
            ) : undefined}
            emptyTitle="No Take 5 on this job"
            emptyAction={
              <button type="button" onClick={startTake5} className="btn-primary">
                Start Take 5
              </button>
            }
          >
            {(take5s ?? []).map((row, index) => {
              const living = livingTake5Summary({
                meta: row.meta,
                identify_hazards: row.identify_hazards,
                stop_think: row.stop_think,
                control_actions: row.control_actions,
                job,
                members: teamMembers ?? [],
              });
              const href = take5FillPath(row.jha_document_id, row.id);
              const ctx = take5ListContext({
                status: row.status,
                meta: living.meta,
                stop_think: row.stop_think,
                identify_hazards: row.identify_hazards,
                control_actions: row.control_actions,
                signature: row.signature,
                job_title: job.title,
                job_address: job.address,
                livingSite: living.site,
              });
              const nextOnDoc = recommendTake5ListAction(ctx);
              const parent = (jhas ?? []).find(doc => doc.id === row.jha_document_id);
              const title = row.signed_name || 'Take 5';
              const metaBits = [
                living.site || 'Site follows this job',
                living.crewLabel || 'Crew follows this job',
                living.hazardLabel || 'No hazards on this Take 5',
                row.go_no_go === 'stop' ? 'STOP' : 'GO',
                parent?.report_number,
                format(new Date(row.created_at), 'd MMM yyyy'),
              ];
              return (
                <JobRelatedRow
                  key={row.id}
                  href={href}
                  icon={ShieldAlert}
                  title={title}
                  meta={metaBits.filter(Boolean).join(' · ')}
                  trailing={<OpsStatus className={take5StatusClass(row.status)}>{take5StatusLabel(row.status)}</OpsStatus>}
                  action={
                    index === 0 ? (
                      <Link to={href} className="btn-primary shrink-0">
                        {take5CardHint(ctx) === 'Open' ? 'Open Take 5' : nextOnDoc.label}
                      </Link>
                    ) : undefined
                  }
                />
              );
            })}
          </JobRelatedSection>
          </div>

          <JobRelatedSection
            title="Quotes"
            icon={FileText}
            count={(quotes ?? []).length}
            emptyTitle="No quote on this job. That’s fine for do-and-charge — invoice from the bill."
          >
            {(quotes ?? []).map(q => (
              <JobRelatedRow
                key={q.id}
                href={`/quotes?id=${q.id}`}
                icon={FileText}
                title={`Quote #${padNum(q.quote_number)}`}
                meta={formatMoney(Number(q.total))}
                trailing={
                  <OpsStatus className={QUOTE_STATUS_STYLES[q.status as keyof typeof QUOTE_STATUS_STYLES] ?? 'ops-status-wait'}>
                    {QUOTE_STATUS_LABELS[q.status as keyof typeof QUOTE_STATUS_LABELS] ?? q.status}
                  </OpsStatus>
                }
                action={
                  q.status === 'accepted' && !(invoices ?? []).some(inv => inv.quote_id === q.id) ? (
                    <button
                      type="button"
                      onClick={() => invoiceFromQuote.mutate(q.id)}
                      disabled={invoiceFromQuote.isPending}
                      className="ops-next-control-sm w-auto px-3 shrink-0"
                    >
                      Invoice
                    </button>
                  ) : undefined
                }
              />
            ))}
          </JobRelatedSection>

          <JobRelatedSection
            title="Invoices"
            icon={Receipt}
            count={(invoices ?? []).length}
            emptyTitle="Nothing invoiced yet. Invoice an accepted quote, or from the job bill."
            emptyAction={
              <button type="button" onClick={handleInvoice} disabled={invoiceFromJobBill.isPending} className="ops-link">
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

        <div id="job-hours">
        <JobRelatedSection
          title="Time on this job"
          icon={Clock}
          count={(timesheets ?? []).length}
          action={
            <div className="flex items-center gap-3">
              {runningEntry ? (
                <button type="button" onClick={() => clockOffJob.mutate()} disabled={clockOffJob.isPending} className="ops-link text-xs">
                  Clock off
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => clockOnJob.mutate()}
                  disabled={clockOnJob.isPending || job.status === 'cancelled'}
                  className="ops-link text-xs"
                >
                  Clock on
                </button>
              )}
              <button type="button" onClick={() => setShowTimeEntry(true)} className="ops-link text-xs">
                <Plus size={12} className="inline" /> Add hours
              </button>
            </div>
          }
          emptyTitle="Nobody has clocked onto this job yet."
          emptyAction={
            runningEntry ? undefined : (
              <button type="button" onClick={() => clockOnJob.mutate()} className="ops-link">
                Clock on
              </button>
            )
          }
        >
          {(timesheets ?? []).map(entry => {
            const duration = entry.end_time
              ? Math.round((new Date(entry.end_time).getTime() - new Date(entry.start_time).getTime()) / 60000)
              : 0;
            return (
              <JobRelatedRow
                key={entry.id}
                icon={Clock}
                title={`${format(new Date(entry.start_time), 'd MMM yyyy')} · ${format(new Date(entry.start_time), 'HH:mm')}${entry.end_time ? `–${format(new Date(entry.end_time), 'HH:mm')}` : ' · running'}`}
                meta={[entry.work_type, entry.billable ? 'Billable' : 'Non-billable'].filter(Boolean).join(' · ')}
                trailing={duration > 0 ? <span className="ops-meta">{formatDuration(duration)}</span> : undefined}
              />
            );
          })}
        </JobRelatedSection>
        </div>

        <div id="job-bill">
          <button
            type="button"
            onClick={() => setBillOpen(o => !o)}
            className="hub-jobs-bill-head"
          >
            <DollarSign size={16} className="text-navy shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="ops-section-title">Job bill</p>
              <p className="ops-meta">
                {budget != null ? `Budget ${formatMoney(budget)} · ` : ''}
                Cost {formatMoney(actualCost)} · Charge {formatMoney(chargeTotal)}
                {(costTotals?.lines ?? 0) === 0 ? ' · Add materials on this job' : ''}
              </p>
            </div>
            <ChevronDown size={16} className={`text-muted transition-transform ${billOpen ? 'rotate-180' : ''}`} />
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
            </div>
          </div>
        </article>

        <div id="job-schedule">
          <JobDispatchPanel
            job={job}
            teamMembers={teamMembers ?? []}
            rescheduleBanner={rescheduleAsked ? jobOfficeRescheduleBanner(job).message : null}
          />
          <JobClientReminder
            ref={reminderRef}
            job={job}
            client={client ?? null}
            company={company}
            rescheduleAsked={rescheduleAsked}
            onArrivingSent={() => setArrivingSent(true)}
            onArrivingBusy={setArrivingBusy}
          />
        </div>
      </div>
      {showEdit && (
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
            queryClient.invalidateQueries({ queryKey: ['job-jhas', id] });
            queryClient.invalidateQueries({ queryKey: ['job-take5s', id] });
            queryClient.invalidateQueries({ queryKey: ['jha-documents'] });
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
      {sendingReportId && company?.id && (
        <ReportSendDialog
          reportId={sendingReportId}
          company={{
            id: company.id,
            name: company.name,
            abn: (company as { abn?: string | null }).abn ?? null,
            licence_number: (company as { licence_number?: string | null }).licence_number ?? null,
            phone: (company as { phone?: string | null }).phone ?? null,
            email: (company as { email?: string | null }).email ?? null,
            website: (company as { website?: string | null }).website ?? null,
            logo_url: (company as { logo_url?: string | null }).logo_url ?? null,
          }}
          onClose={() => setSendingReportId(null)}
          onSent={(_to, message) => {
            setSendingReportId(null);
            queryClient.invalidateQueries({ queryKey: ['job-reports', id] });
            queryClient.invalidateQueries({ queryKey: ['job-inspections', id] });
            showToast(message ?? 'Report sent.');
          }}
        />
      )}
    </AppShell>
  );
}
