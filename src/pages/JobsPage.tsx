import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { AUDIT_DOC_JOB_ID, getAuditClients, getAuditJobs } from '../lib/devFieldAuditDocs';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, EmptyState, SearchBar, useToast } from '../components/ui';
import { OverlayPortal } from '../components/ui/OverlayPortal';
import { JobFormModal } from '../components/crm/JobFormModal';
import type { Job, JobWithClient, Client } from '../types/crm';
import { jobInvoiceActionFlags, jobOpenNext } from '../lib/jobNextAction';
import { formatJobRef, withParentJobNumbers } from '../lib/jobRef';
import {
  jobsListCrewLabel,
  jobsListCustomer,
  jobsListPhoneDate,
  jobsListPhoneNextLabel,
  jobsListPhoneRow,
  jobsListTitle,
  jobsListUndatedNextLabel,
} from '../lib/jobsListRow';
import { countNeedsCrew } from '../lib/needCrew';
import { loadJobCardExtras, type JobDocChip } from '../lib/jobCardExtras';
import { chunkIds } from '../lib/jobIdBatch';
import { countJobsNeedCrew, withNeedCrewWhisper } from '../lib/needCrew';
import {
  JOBS_LIST_FILTERS,
  countJobsListFilter,
  jobMatchesListFilter,
  jobStatusPill,
  type JobsListFilterKey,
  type JobStatusPillInput,
} from '../lib/jobStatusPill';
import { listCountWhisper, listQueryBusy } from '../lib/listQueryReady';
import { Plus, Briefcase, MessageSquare } from 'lucide-react';
import {
  ALREADY_APPROVED_TOAST,
  DISMISS_REASONS,
  ENQUIRIES_VIEW,
  ENQUIRY_STATE_LABELS,
  type DismissReason,
  type EnquiryRow,
  approveMissedCallEnquiry,
  countEnquiriesToReview,
  countEnquiriesToday,
  dismissMissedCallEnquiry,
  enquiryCallback,
  enquiryCallerLabel,
  enquiryExcerpt,
  enquiryJobPath,
  ENQUIRY_EMPTY_LOOK,
  ENQUIRY_LOOK,
  ENQUIRY_ONE_LOOK,
  enquiryLookKind,
  enquiryState,
  enquirySurfaceOpen,
  enquiryTitle,
  enquiryWhisper,
  formatEnquiryRowTime,
  isEnquiriesView,
  matchEnquiryClient,
  shouldQueryLiveEnquiries,
} from '../lib/missedCallEnquiry';
import { resolveTenantTimeZone } from '../lib/tenantTimeZone';

type JobRowModel = JobWithClient & {
  cover_photo_url: string | null;
  docs: JobDocChip[];
  extrasError?: boolean;
};

const LOOK_CREW = [
  { id: 'look-jobs-dave', name: 'Dave' },
  { id: 'look-jobs-jack', name: 'Jack' },
];

function listJobFacts(job: JobRowModel, rows: JobRowModel[]): JobStatusPillInput {
  const invoices = job.docs
    .filter((doc) => doc.kind === 'invoice')
    .map((doc) => ({ status: doc.status }));
  const parent = job.parent_job_id ? rows.find((row) => row.id === job.parent_job_id) : undefined;
  const parentInvoices = parent
    ? parent.docs.filter((doc) => doc.kind === 'invoice').map((doc) => ({ status: doc.status }))
    : undefined;
  const children = rows
    .filter((row) => row.parent_job_id === job.id)
    .map((row) => ({ status: row.status }));
  return {
    status: job.status,
    scheduled_date: job.scheduled_date,
    assigned_team: job.assigned_team,
    invoices,
    parentInvoices,
    children: children.length ? children : undefined,
    invoiceReadError: job.extrasError,
  };
}

/** Signed jobs-list frame seed — list look only, not a live company. */
const JOBS_LIST_LOOK = 'jobs-list';
/** Playwright: /jobs?look=p307 — completed, no crew, Invoice. */
const JOBS_P307_LOOK = 'p307';
/** Playwright: /jobs?look=crew-s8d-needs-crew | crew-s8d-booked | crew-s8d-not-scheduled */
const CREW_S8D_LOOK_NEEDS = 'crew-s8d-needs-crew';
const CREW_S8D_LOOK_BOOKED = 'crew-s8d-booked';
const CREW_S8D_LOOK_NOT = 'crew-s8d-not-scheduled';

function crewS8dLookRows(look: string): JobRowModel[] {
  const stamp = '2026-09-03T00:00:00.000Z';
  const base = {
    company_id: 'look-jobs-list',
    client_id: 'look-client-northside',
    title: 'Crew status frame',
    description: null as string | null,
    priority: 'medium' as const,
    status: 'scheduled' as const,
    start_time: '08:00',
    end_time: '12:00',
    address: '12 Workshop Rd, Perth WA 6000',
    inspection_id: null as string | null,
    created_by: 'look-jobs-dave',
    created_at: stamp,
    updated_at: stamp,
    color: null as string | null,
    budget: null as number | null,
    parent_job_id: null as string | null,
    cost_code: null as string | null,
    cover_photo_url: null as string | null,
    docs: [] as JobDocChip[],
    job_number: 88,
    client_name: 'Northside Electrical',
    client_address: '12 Workshop Rd, Perth WA 6000',
    client_phone: null as string | null,
  };
  if (look === CREW_S8D_LOOK_BOOKED) {
    return [{ ...base, id: 'crew-s8d-booked', scheduled_date: '2026-09-03', assigned_team: ['look-jobs-dave'] }];
  }
  if (look === CREW_S8D_LOOK_NOT) {
    return [{ ...base, id: 'crew-s8d-not', scheduled_date: null, assigned_team: [] }];
  }
  return [{ ...base, id: 'crew-s8d-needs', scheduled_date: '2026-09-03', assigned_team: [] }];
}

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

function jobsListLookRows(): JobRowModel[] {
  const stamp = '2026-09-03T00:00:00.000Z';
  const base = {
    company_id: 'look-jobs-list',
    description: null as string | null,
    priority: 'medium' as const,
    inspection_id: null as string | null,
    created_by: 'look-jobs-dave',
    created_at: stamp,
    updated_at: stamp,
    color: null as string | null,
    budget: null as number | null,
    parent_job_id: null as string | null,
    cost_code: null as string | null,
    cover_photo_url: null as string | null,
    docs: [] as JobDocChip[],
    client_phone: null as string | null,
  };
  return [
    {
      ...base,
      id: 'look-job-northside',
      client_id: 'look-client-northside',
      title: 'Site labour',
      status: 'scheduled',
      scheduled_date: '2026-09-03',
      start_time: '07:30',
      end_time: '16:00',
      address: '12 Workshop Rd, Perth WA 6000',
      assigned_team: ['look-jobs-dave'],
      job_number: 42,
      client_name: 'Northside Electrical',
      client_address: '12 Workshop Rd, Perth WA 6000',
    },
    {
      ...base,
      id: 'look-job-harbour',
      client_id: 'look-client-harbour',
      title: 'Warehouse lights',
      status: 'in_progress',
      scheduled_date: '2026-09-03',
      start_time: '09:00',
      end_time: '12:00',
      address: '8 Wharf St, Fremantle WA 6160',
      assigned_team: ['look-jobs-jack'],
      job_number: 43,
      client_name: 'Harbour Lights',
      client_address: '8 Wharf St, Fremantle WA 6160',
    },
    {
      ...base,
      id: 'look-job-midland',
      client_id: 'look-client-midland',
      title: 'Switchboard upgrade',
      status: 'scheduled',
      scheduled_date: '2026-09-07',
      start_time: '08:00',
      end_time: '15:00',
      address: '44 Helena St, Midland WA 6056',
      assigned_team: ['look-jobs-dave'],
      job_number: 44,
      client_name: 'Midland Workshops',
      client_address: '44 Helena St, Midland WA 6056',
    },
    {
      ...base,
      id: 'look-job-bayswater',
      client_id: 'look-client-bayswater',
      title: 'Hot water swap',
      status: 'completed',
      scheduled_date: '2026-09-01',
      start_time: '07:00',
      end_time: '11:00',
      address: '3 Guildford Rd, Bayswater WA 6053',
      assigned_team: ['look-jobs-jack'],
      job_number: 45,
      client_name: 'Bayswater Body Corporate',
      client_address: '3 Guildford Rd, Bayswater WA 6053',
    },
    {
      ...base,
      id: 'look-job-scarborough',
      client_id: 'look-client-scarborough',
      title: 'Deck repair',
      status: 'scheduled',
      scheduled_date: '2026-09-09',
      start_time: '08:00',
      end_time: '14:00',
      address: '21 The Esplanade, Scarborough WA 6019',
      assigned_team: ['look-jobs-dave'],
      job_number: 46,
      client_name: 'Coastal Holiday Rentals',
      client_address: '21 The Esplanade, Scarborough WA 6019',
    },
    {
      ...base,
      id: 'look-job-osborne',
      client_id: 'look-client-osborne',
      title: 'Rooftop unit service',
      status: 'cancelled',
      scheduled_date: '2026-08-28',
      start_time: '09:30',
      end_time: '12:30',
      address: '9 Hutton St, Osborne Park WA 6017',
      assigned_team: ['look-jobs-jack'],
      job_number: 47,
      client_name: 'Osborne Park Medical',
      client_address: '9 Hutton St, Osborne Park WA 6017',
    },
    {
      ...base,
      id: 'look-job-prove-a',
      client_id: null,
      title: '290 data prove A — delete ok',
      status: 'scheduled',
      scheduled_date: '2026-09-10',
      start_time: '08:00',
      end_time: '12:00',
      address: '1 Prove St, Perth WA 6000',
      assigned_team: ['look-jobs-dave'],
      job_number: 290,
      client_name: null,
      client_address: null,
    },
    {
      ...base,
      id: 'look-job-prove-phone',
      client_id: 'look-client-phone',
      title: '291 prove switchboard and after-hours commissioning on a live site',
      status: 'scheduled',
      scheduled_date: '2026-09-11',
      start_time: '08:00',
      end_time: '16:00',
      address: '18 William St, Perth WA 6000',
      assigned_team: ['look-jobs-dave'],
      job_number: 291,
      client_name: 'Client Services Northside Body Corporate',
      client_address: '18 William St, Perth WA 6000',
    },
  ];
}

function jobsP307LookRows(): JobRowModel[] {
  const stamp = '2026-09-03T00:00:00.000Z';
  return [{
    id: 'look-job-p307',
    company_id: 'look-jobs-list',
    client_id: 'look-client-p307',
    title: 'Hot water swap',
    description: null,
    status: 'completed',
    priority: 'medium',
    scheduled_date: '2026-09-01',
    start_time: '07:00',
    end_time: '11:00',
    address: '3 Guildford Rd, Bayswater WA 6053',
    assigned_team: [],
    inspection_id: null,
    created_by: 'look-jobs-dave',
    created_at: stamp,
    updated_at: stamp,
    color: null,
    budget: null,
    parent_job_id: null,
    cost_code: null,
    cover_photo_url: null,
    docs: [],
    job_number: 45,
    client_name: 'Bayswater Body Corporate',
    client_phone: null,
    client_address: '3 Guildford Rd, Bayswater WA 6053',
  }];
}

function enquiryLookRows(): EnquiryRow[] {
  return [
    {
      id: 'look-enquiry-today',
      callerPhone: '0400000000',
      clientId: 'look-client-northside',
      clientName: 'Northside Mechanical',
      missedCallAt: '2026-10-09T22:15:00.000Z',
      excerpt: 'Hot water is out, Paddington',
      suburb: 'Paddington',
      transcript: 'Hot water is out, Paddington',
      state: 'draft',
      enquiryStatus: 'draft',
      approvedJobId: null,
    },
    {
      id: 'look-enquiry-noreply',
      callerPhone: '0400000000',
      clientId: null,
      clientName: null,
      missedCallAt: '2026-10-09T06:40:00.000Z',
      excerpt: '',
      suburb: '',
      transcript: '',
      state: 'no_reply',
      enquiryStatus: 'draft',
      approvedJobId: null,
    },
    {
      id: 'look-enquiry-week',
      callerPhone: '',
      clientId: null,
      clientName: null,
      missedCallAt: '2026-10-07T01:05:00.000Z',
      excerpt: 'Blocked drain at the shop',
      suburb: 'Fortitude Valley',
      transcript: 'Blocked drain at the shop. Fortitude Valley.',
      state: 'draft',
      enquiryStatus: 'draft',
      approvedJobId: null,
    },
    {
      id: 'look-enquiry-approved',
      callerPhone: '0400000000',
      clientId: 'look-client-northside',
      clientName: 'Northside Mechanical',
      missedCallAt: '2026-10-05T23:00:00.000Z',
      excerpt: 'Oven sparking, West End',
      suburb: 'West End',
      transcript: 'Oven sparking, West End',
      state: 'approved',
      enquiryStatus: 'approved',
      approvedJobId: AUDIT_DOC_JOB_ID,
    },
  ];
}

function enquiryLookOneDraftRows(): EnquiryRow[] {
  return enquiryLookRows().filter((row) => row.id === 'look-enquiry-today' || row.id === 'look-enquiry-approved');
}

function mapEnquiryThreads(
  threads: Array<{
    id: string;
    caller_phone_e164: string | null;
    job_service: string | null;
    contact_name: string | null;
    service_area: string | null;
    enquiry_status: string | null;
    approved_job_id: string | null;
    latest_inbound_message_id: string | null;
    missed_call_id: string | null;
    created_at: string;
  }>,
  calls: Array<{ id: string; received_at: string | null }>,
  messages: Array<{ id: string; body: string | null }>,
  clients: Array<{ id: string; name: string | null; phone: string | null }>,
): EnquiryRow[] {
  const callAt = new Map(calls.map((call) => [call.id, call.received_at]));
  const bodies = new Map(messages.map((message) => [message.id, message.body]));
  return threads.map((thread) => {
    const matched = matchEnquiryClient(thread.caller_phone_e164, clients);
    const excerpt = enquiryExcerpt({
      replyBody: thread.latest_inbound_message_id
        ? bodies.get(thread.latest_inbound_message_id)
        : null,
      jobService: thread.job_service,
    });
    const suburb = (thread.service_area ?? '').trim();
    return {
      id: thread.id,
      callerPhone: thread.caller_phone_e164 ?? '',
      clientId: matched?.id ?? null,
      clientName: matched?.name ?? thread.contact_name ?? null,
      missedCallAt: callAt.get(thread.missed_call_id ?? '') || thread.created_at,
      excerpt,
      suburb,
      transcript: excerpt,
      state: enquiryState({
        enquiryStatus: thread.enquiry_status,
        hasReply: Boolean(excerpt),
      }),
      enquiryStatus: (thread.enquiry_status === 'approved' || thread.enquiry_status === 'dismissed')
        ? thread.enquiry_status
        : 'draft',
      approvedJobId: thread.approved_job_id,
    };
  });
}

export function JobsPage() {
  const { profile, company } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const lookParam = (import.meta.env.DEV || import.meta.env.VITE_LOOK_PROOF === '1') ? searchParams.get('look') : null;
  const lookJobsList = (import.meta.env.DEV || import.meta.env.VITE_LOOK_PROOF === '1') && searchParams.get('look') === JOBS_LIST_LOOK;
  const lookP307 = lookParam === JOBS_P307_LOOK;
  const lookCrewS8d = lookParam;
  const lookCrewS8dSeed = lookCrewS8d === CREW_S8D_LOOK_NEEDS
    || lookCrewS8d === CREW_S8D_LOOK_BOOKED
    || lookCrewS8d === CREW_S8D_LOOK_NOT;
  const enquiryLook = (import.meta.env.DEV || import.meta.env.VITE_LOOK_PROOF === '1')
    ? (lookParam === ENQUIRY_LOOK
      ? 'list'
      : lookParam === ENQUIRY_EMPTY_LOOK
        ? 'empty'
        : lookParam === ENQUIRY_ONE_LOOK
          ? 'one'
          : null)
    : enquiryLookKind(lookParam);
  const lookEnquirySeed = enquiryLook != null;
  const enquirySurface = lookEnquirySeed || enquirySurfaceOpen(lookParam);
  const tenantTimeZone = resolveTenantTimeZone(
    (company as { time_zone?: string | null } | null)?.time_zone,
  );
  const [statusFilter, setStatusFilter] = useState<JobsListFilterKey>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [presetClientId, setPresetClientId] = useState<string | null>(null);
  const [lookEnquiryRows, setLookEnquiryRows] = useState<EnquiryRow[]>(
    enquiryLook === 'empty' ? [] : enquiryLook === 'one' ? enquiryLookOneDraftRows() : enquiryLook === 'list' ? enquiryLookRows() : [],
  );
  const [approving, setApproving] = useState<EnquiryRow | null>(null);
  const [dismissing, setDismissing] = useState<EnquiryRow | null>(null);
  const [dismissError, setDismissError] = useState('');
  const [flight, setFlight] = useState<{
    id: string;
    kind: 'approve' | 'dismiss';
    reason?: DismissReason;
  } | null>(null);
  const viewParam = searchParams.get('view');
  const showEnquiries = enquirySurface && (
    lookEnquirySeed
      ? viewParam !== 'jobs'
      : isEnquiriesView(viewParam)
  );

  const { data: jobs, isLoading, isPending, error } = useQuery<JobRowModel[]>({
    queryKey: ['jobs-all', profile?.company_id],
    queryFn: async () => {
      const mock = getAuditJobs();
      if (mock) {
        const clientMap = new Map((getAuditClients() ?? []).map(c => [c.id, c as Client]));
        return withParentJobNumbers(mock.map(j => ({
          ...j,
          client_name: j.client_id ? clientMap.get(j.client_id)?.name ?? null : null,
          client_phone: j.client_id ? clientMap.get(j.client_id)?.phone ?? null : null,
          client_address: j.client_id ? clientMap.get(j.client_id)?.address ?? null : null,
          cover_photo_url: null,
          docs: [],
        })));
      }

      const { data: jobsData, error } = await supabase
        .from('jobs')
        .select('*')
        .order('scheduled_date', { ascending: false, nullsFirst: false })
        .order('start_time', { ascending: true, nullsFirst: false });

      if (error) throw error;
      const jobs = (jobsData ?? []) as Job[];

      const clientIds = [...new Set(jobs.map(j => j.client_id).filter(Boolean))] as string[];
      const clientMap = new Map<string, Client>();
      if (clientIds.length > 0) {
        for (const batch of chunkIds(clientIds)) {
          const { data: clientsData, error: clientsError } = await supabase
            .from('clients')
            .select('*')
            .in('id', batch);
          if (clientsError) throw clientsError;
          for (const c of clientsData ?? []) {
            clientMap.set(c.id, c as Client);
          }
        }
      }

      const withClients: JobWithClient[] = withParentJobNumbers(jobs.map(j => ({
        ...j,
        client_name: j.client_id ? clientMap.get(j.client_id)?.name ?? null : null,
        client_phone: j.client_id ? clientMap.get(j.client_id)?.phone ?? null : null,
        client_address: j.client_id ? clientMap.get(j.client_id)?.address ?? null : null,
      })));
      let docsByJob = new Map<string, JobDocChip[]>();
      let extrasError = false;
      try {
        const extras = await loadJobCardExtras(withClients);
        docsByJob = extras.docsByJob;
      } catch {
        extrasError = true;
      }
      return withClients.map(j => ({
        ...j,
        cover_photo_url: null,
        docs: extrasError ? [] : docsByJob.get(j.id) ?? [],
        extrasError,
      }));
    },
    enabled: !!profile && !lookJobsList && !lookP307 && !lookCrewS8dSeed && !lookEnquirySeed,
  });

  const { data: liveMembers } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['team-members-jobs-list', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_company_members', {
        p_company_id: profile!.company_id,
      });
      if (error) throw error;
      return (data ?? []).map((member: { id: string; name: string }) => ({
        id: member.id,
        name: member.name,
      }));
    },
    enabled: !!profile?.company_id && !lookJobsList && !lookP307 && !lookCrewS8dSeed && !lookEnquirySeed,
  });
  const crewMembers = lookJobsList || lookP307 || lookCrewS8dSeed || lookEnquirySeed
    ? LOOK_CREW
    : (liveMembers ?? []);

  const queryLiveEnquiries = !!profile
    && shouldQueryLiveEnquiries({ look: lookParam, view: viewParam })
    && !lookJobsList
    && !lookP307
    && !lookCrewS8dSeed
    && !lookEnquirySeed;

  const { data: liveEnquiries, isLoading: enquiriesLoading, isPending: enquiriesPending } = useQuery<EnquiryRow[]>({
    queryKey: ['missed-call-enquiries', profile?.company_id],
    queryFn: async () => {
      const { data: threads, error: threadError } = await supabase
        .from('missed_call_sms_threads')
        .select('id, caller_phone_e164, job_service, contact_name, service_area, enquiry_status, approved_job_id, latest_inbound_message_id, missed_call_id, created_at')
        .order('created_at', { ascending: false });
      if (threadError) throw threadError;
      const list = threads ?? [];
      const callIds = [...new Set(list.map((thread) => thread.missed_call_id).filter(Boolean))] as string[];
      const messageIds = [...new Set(list.map((thread) => thread.latest_inbound_message_id).filter(Boolean))] as string[];
      const phones = [...new Set(list.map((thread) => thread.caller_phone_e164).filter(Boolean))] as string[];
      const [callsRes, messagesRes, clientsRes] = await Promise.all([
        callIds.length
          ? supabase.from('missed_calls').select('id, received_at').in('id', callIds)
          : Promise.resolve({ data: [] as { id: string; received_at: string | null }[] }),
        messageIds.length
          ? supabase.from('sms_messages').select('id, body').in('id', messageIds)
          : Promise.resolve({ data: [] as { id: string; body: string | null }[] }),
        phones.length
          ? supabase.from('clients').select('id, name, phone').in('phone', phones)
          : Promise.resolve({ data: [] as { id: string; name: string | null; phone: string | null }[] }),
      ]);
      return mapEnquiryThreads(
        list,
        callsRes.data ?? [],
        messagesRes.data ?? [],
        clientsRes.data ?? [],
      );
    },
    enabled: queryLiveEnquiries,
    retry: false,
  });

  const listRows = lookCrewS8dSeed && lookCrewS8d
    ? crewS8dLookRows(lookCrewS8d)
    : lookP307
      ? jobsP307LookRows()
      : lookJobsList
        ? jobsListLookRows()
        : (jobs ?? []);
  const filtered = useMemo(() => {
    let result = listRows.filter((job) => jobMatchesListFilter(listJobFacts(job, listRows), statusFilter));
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(j =>
        j.title.toLowerCase().includes(q) ||
        j.client_name?.toLowerCase().includes(q) ||
        j.address?.toLowerCase().includes(q) ||
        formatJobRef(j).toLowerCase().includes(q) ||
        (j.cost_code ?? '').toLowerCase().includes(q) ||
        (j.job_number != null && String(j.job_number).includes(q))
      );
    }
    return result;
  }, [listRows, statusFilter, search]);
  const needCrewCount = countNeedsCrew(filtered);

  const enquiryRows = lookEnquirySeed ? lookEnquiryRows : (liveEnquiries ?? []);
  const filteredEnquiries = useMemo(() => {
    if (!search.trim()) return enquiryRows;
    const q = search.toLowerCase();
    return enquiryRows.filter((row) =>
      enquiryCallerLabel(row).toLowerCase().includes(q)
      || row.excerpt.toLowerCase().includes(q)
      || row.suburb.toLowerCase().includes(q)
      || formatEnquiryRowTime(row.missedCallAt, tenantTimeZone).toLowerCase().includes(q)
    );
  }, [enquiryRows, search, tenantTimeZone]);
  const todayCount = countEnquiriesToday(enquiryRows, new Date(), tenantTimeZone);
  const reviewCount = countEnquiriesToReview(enquiryRows);

  const filterLabel = JOBS_LIST_FILTERS.find(tab => tab.key === statusFilter)?.label ?? 'All';
  const busy = listQueryBusy({ isPending, isLoading, data: jobs, seeded: lookJobsList || lookP307 || lookCrewS8dSeed });
  const enquiriesBusy = lookEnquirySeed
    ? false
    : listQueryBusy({ isPending: enquiriesPending, isLoading: enquiriesLoading, data: liveEnquiries, seeded: false });
  const whisper = showEnquiries
    ? enquiryWhisper({ busy: enquiriesBusy, reviewCount, todayCount })
    : withNeedCrewWhisper(listCountWhisper({
      busy,
      filterLabel,
      count: filtered.length,
      singular: 'job',
      plural: 'jobs',
    }), countJobsNeedCrew(listRows));

  useEffect(() => {
    const clientId = searchParams.get('client');
    if (!clientId) return;
    setPresetClientId(clientId);
    setShowForm(true);
    const next = new URLSearchParams(searchParams);
    next.delete('client');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  function setJobsView(next: 'jobs' | 'enquiries') {
    const params = new URLSearchParams(searchParams);
    if (next === 'enquiries') params.set('view', ENQUIRIES_VIEW);
    else if (lookEnquirySeed) params.set('view', 'jobs');
    else params.delete('view');
    setSearchParams(params, { replace: true });
  }

  function handleCloseForm() {
    setShowForm(false);
    setPresetClientId(null);
    setApproving(null);
    if (flight?.kind === 'approve') setFlight(null);
  }

  function handleSaved(jobId: string) {
    handleCloseForm();
    queryClient.invalidateQueries({ queryKey: ['jobs-all'] });
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
    queryClient.invalidateQueries({ queryKey: ['client-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    queryClient.invalidateQueries({ queryKey: ['missed-call-enquiries'] });
    if (lookEnquirySeed) return;
    const href = enquiryJobPath(jobId);
    if (href) navigate(href);
  }

  async function startApprove(row: EnquiryRow) {
    if (flight || row.enquiryStatus !== 'draft') return;
    setFlight({ id: row.id, kind: 'approve' });
    setApproving(row);
  }

  async function startDismiss(row: EnquiryRow) {
    if (flight || row.enquiryStatus !== 'draft') return;
    setDismissError('');
    setDismissing(row);
  }

  async function confirmDismiss(reason: DismissReason) {
    const row = dismissing;
    if (!row || flight) return;
    setDismissError('');
    setFlight({ id: row.id, kind: 'dismiss', reason });
    try {
      if (lookEnquirySeed) {
        await new Promise((resolve) => window.setTimeout(resolve, 400));
        setLookEnquiryRows((rows) => rows.map((item) => (
          item.id === row.id
            ? { ...item, state: 'dismissed', enquiryStatus: 'dismissed' }
            : item
        )));
      } else {
        await dismissMissedCallEnquiry(row.id, reason);
        queryClient.invalidateQueries({ queryKey: ['missed-call-enquiries'] });
      }
      setDismissing(null);
    } catch (err) {
      setDismissError(err instanceof Error ? err.message : 'Could not dismiss this enquiry.');
    } finally {
      setFlight(null);
    }
  }

  useEffect(() => {
    if (!dismissing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      if (flight) return;
      setDismissing(null);
      setDismissError('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dismissing, flight]);

  if (pageQueryBlocked(error)) return <AppShell><PageError message="Could not load jobs" /></AppShell>;

  const filteredEmpty = !search && statusFilter === 'all';

  return (
    <AppShell>
      <div className="ops-page hub-jobs hub-jobs-list-doc">
        <div className="hub-jobs-sheet">
          <div className="hub-jobs-list-body">
            <div className="hub-jobs-list-head">
              {showEnquiries ? (
                <h1 className="ops-page-title">Enquiries</h1>
              ) : (
                <h1 className="ops-page-title">Jobs</h1>
              )}
              {showEnquiries ? null : (
                <button
                  type="button"
                  onClick={() => { setPresetClientId(null); setShowForm(true); }}
                  className="btn-primary"
                  data-jobs-new="1"
                >
                  <Plus size={16} /> New job
                </button>
              )}
            </div>
            <p className="hub-jobs-list-whisper" data-need-crew-count={needCrewCount}>{whisper}</p>
            {lookJobsList || lookP307 || lookCrewS8dSeed || !enquirySurface ? null : (
            <div className="hub-jobs-list-views" role="tablist" aria-label="Jobs or enquiries">
              <button
                type="button"
                role="tab"
                aria-selected={!showEnquiries}
                data-jobs-view="jobs"
                className={`hub-jobs-list-filter ${showEnquiries ? '' : 'is-on'}`}
                onClick={() => setJobsView('jobs')}
              >
                Jobs
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={showEnquiries}
                data-jobs-view="enquiries"
                className={`hub-jobs-list-filter ${showEnquiries ? 'is-on' : ''}`}
                onClick={() => setJobsView('enquiries')}
              >
                Enquiries
                {reviewCount > 0 ? (
                  <span className="hub-jobs-enquiry-count" data-enquiry-review={reviewCount}>
                    {reviewCount}
                  </span>
                ) : null}
              </button>
            </div>
            )}
            <div className="hub-jobs-list-search">
              <SearchBar
                value={search}
                onChange={setSearch}
                placeholder={showEnquiries ? 'Search name, suburb or phone' : 'Search jobs or clients'}
              />
            </div>
            {showEnquiries ? null : (
            <div className="hub-jobs-list-filters" role="tablist" aria-label="Job status">
              {JOBS_LIST_FILTERS.map(tab => {
                const count = countJobsListFilter(
                  listRows.map((job) => listJobFacts(job, listRows)),
                  tab.key,
                );
                return (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={statusFilter === tab.key}
                    data-jobs-filter={tab.key}
                    onClick={() => setStatusFilter(tab.key)}
                    className={`hub-jobs-list-filter ${statusFilter === tab.key ? 'is-on' : ''}`}
                  >
                    {tab.label}
                    <span className="hub-jobs-list-filter-count">{count}</span>
                  </button>
                );
              })}
            </div>
            )}
            {showEnquiries ? (
              enquiriesBusy ? (
                <div className="flex justify-center py-20"><LoadingSpinner /></div>
              ) : filteredEnquiries.length === 0 ? (
                <EmptyState
                  icon={MessageSquare}
                  title={search.trim() ? 'No matching enquiries' : 'No enquiries yet'}
                  message={search.trim()
                    ? 'Try another search.'
                    : 'Missed calls land here as drafts. Approve one to make a job, or dismiss it.'}
                />
              ) : (
                <div className="hub-jobs-enquiry-list" data-enquiries-list="1">
                  {filteredEnquiries.map((row) => (
                    <EnquiryListRow
                      key={row.id}
                      row={row}
                      timeZone={tenantTimeZone}
                      busy={flight?.id === row.id}
                      flightKind={flight?.id === row.id ? flight.kind : null}
                      disabled={Boolean(flight)}
                      onApprove={() => { void startApprove(row); }}
                      onDismiss={() => { void startDismiss(row); }}
                    />
                  ))}
                </div>
              )
            ) : busy ? (
              <div className="flex justify-center py-20"><LoadingSpinner /></div>
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title={filteredEmpty ? 'No jobs yet' : 'No matching jobs'}
                message={filteredEmpty
                  ? 'Create a job, add the site, then put it on the board so the crew can see it.'
                  : 'Try another status or search.'}
              />
            ) : (
              <>
                <div className="hub-jobs-phone-list" data-jobs-phone-list="1">
                  {filtered.map(job => (
                    <JobPhoneRow key={job.id} job={job} rows={listRows} members={crewMembers} />
                  ))}
                </div>
                <div className="hub-jobs-desktop-list">
                  <div className="hub-jobs-thead">
                    <span>Job</span>
                    <span>Client</span>
                    <span>Suburb</span>
                    <span className="hub-jobs-col-crew">Crew</span>
                    <span className="hub-jobs-col-date">Date</span>
                    <span>Status</span>
                    <span>Next</span>
                  </div>
                  {filtered.map(job => (
                    <JobRow key={job.id} job={job} rows={listRows} members={crewMembers} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {(showForm || approving) && (
        <JobFormModal
          key={approving?.id ?? presetClientId ?? 'new'}
          job={null}
          presetDate={null}
          presetClientId={approving?.clientId ?? presetClientId}
          presetClientName={approving?.clientName ?? null}
          presetTitle={approving ? enquiryTitle(approving) : null}
          presetDescription={approving?.transcript ?? null}
          presetAddress={approving?.suburb || null}
          unscheduledOnly={Boolean(approving)}
          createJob={approving ? async (payload) => {
            if (lookEnquirySeed) {
              await new Promise((resolve) => window.setTimeout(resolve, 800));
              const jobId = AUDIT_DOC_JOB_ID;
              setLookEnquiryRows((rows) => rows.map((item) => (
                item.id === approving.id
                  ? {
                    ...item,
                    state: 'approved',
                    enquiryStatus: 'approved',
                    approvedJobId: jobId,
                    excerpt: payload.title,
                  }
                  : item
              )));
              return jobId;
            }
            const result = await approveMissedCallEnquiry(approving.id, payload);
            if (result.alreadyDecided) {
              const href = enquiryJobPath(result.jobId);
              if (href) {
                showToast(ALREADY_APPROVED_TOAST);
                navigate(href);
              }
              return result.jobId;
            }
            return result.jobId;
          } : undefined}
          onClose={handleCloseForm}
          onSaved={handleSaved}
        />
      )}
      {dismissing ? (
        <OverlayPortal>
          <div
            className="hub-jobs-enquiry-dismiss"
            role="dialog"
            aria-label="Dismiss enquiry"
            onClick={() => {
              if (flight) return;
              setDismissing(null);
              setDismissError('');
            }}
          >
            <div
              className="hub-jobs-enquiry-dismiss-sheet"
              onClick={(event) => event.stopPropagation()}
            >
              <p className="hub-jobs-enquiry-dismiss-title">Dismiss this enquiry?</p>
              <p className="hub-jobs-enquiry-dismiss-copy">No job is created. The office can still see it as dismissed.</p>
              {dismissError ? (
                <p className="hub-jobs-enquiry-dismiss-error" data-dismiss-error="1">{dismissError}</p>
              ) : null}
              <div className="hub-jobs-enquiry-dismiss-reasons">
                {DISMISS_REASONS.map((reason) => (
                  <button
                    key={reason.key}
                    type="button"
                    className="btn-secondary hub-jobs-enquiry-tap"
                    disabled={Boolean(flight)}
                    data-dismiss-reason={reason.key}
                    onClick={() => { void confirmDismiss(reason.key); }}
                  >
                    {flight?.kind === 'dismiss' && flight.reason === reason.key ? (
                      <span className="inline-flex items-center gap-2">
                        <LoadingSpinner size="sm" />
                        Dismissing…
                      </span>
                    ) : reason.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="btn-secondary hub-jobs-enquiry-tap"
                data-dismiss-cancel="1"
                disabled={Boolean(flight)}
                onClick={() => {
                  setDismissing(null);
                  setDismissError('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </OverlayPortal>
      ) : null}
    </AppShell>
  );
}

function JobPhoneRow({
  job,
  rows,
  members,
}: {
  job: JobRowModel;
  rows: JobRowModel[];
  members: Array<{ id: string; name: string }>;
}) {
  const navigate = useNavigate();
  const facts = listJobFacts(job, rows);
  const invoiceFlags = jobInvoiceActionFlags(
    job.docs
      .filter(doc => doc.kind === 'invoice')
      .map(doc => ({ status: doc.status ?? 'draft', due_date: doc.due_date })),
  );
  const next = jobOpenNext({ ...job, ...invoiceFlags });
  const crew = jobsListCrewLabel(job.assigned_team, members);
  const row = jobsListPhoneRow({ ...job, ...facts }, crew);
  const phoneNext = jobsListUndatedNextLabel(row.pill.kind, jobsListPhoneNextLabel(next));
  const nextHref = row.pill.kind === 'no_date' ? `/jobs/${job.id}?tab=schedule` : next.href;
  const jobHref = `/jobs/${job.id}`;
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open job ${row.title}`}
      data-jobs-phone-row={job.id}
      onClick={() => navigate(jobHref)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(jobHref); } }}
      className="hub-jobs-phone-row"
    >
      <div className="hub-jobs-phone-copy">
        <p className="hub-jobs-phone-title-row">
          <span className="hub-jobs-phone-title">{row.title}</span>
          <span className={row.statusClass} data-jobs-pill={row.pill.kind}>{row.status}</span>
        </p>
        <p className="hub-jobs-phone-meta">{row.line2}</p>
        <p className="hub-jobs-phone-facts">
          <span>{row.line3}</span>
        </p>
      </div>
      {phoneNext ? (
        <span className="hub-jobs-phone-next-wrap" onClick={e => e.stopPropagation()}>
          <Link
            to={nextHref}
            className="hub-next hub-jobs-phone-next"
            data-job-list-next={phoneNext}
            data-jobs-phone-next="1"
          >
            {phoneNext}
          </Link>
        </span>
      ) : null}
    </div>
  );
}

function JobRow({
  job,
  rows,
  members,
}: {
  job: JobRowModel;
  rows: JobRowModel[];
  members: Array<{ id: string; name: string }>;
}) {
  const navigate = useNavigate();
  const facts = listJobFacts(job, rows);
  const pill = jobStatusPill(facts);
  const invoiceFlags = jobInvoiceActionFlags(
    job.docs
      .filter(doc => doc.kind === 'invoice')
      .map(doc => ({ status: doc.status ?? 'draft', due_date: doc.due_date })),
  );
  const next = jobOpenNext({ ...job, ...invoiceFlags });
  const site = visibleSite(job.address, job.client_address);
  const suburb = site ? suburbFromSite(site) : '';
  const crew = jobsListCrewLabel(job.assigned_team, members);
  const date = jobsListPhoneDate(job.scheduled_date);
  const jobHref = `/jobs/${job.id}`;
  const nextLabel = jobsListUndatedNextLabel(pill.kind, next.actionable ? next.label : null);
  const nextHref = pill.kind === 'no_date' ? `/jobs/${job.id}?tab=schedule` : next.href;
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label="Open"
      onClick={() => navigate(jobHref)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(jobHref); } }}
      className="hub-jobs-row"
    >
      <span className="hub-jobs-job">
        <span className="hub-jobs-title">{jobsListTitle(job)}</span>
        <span className="hub-jobs-ref">{formatJobRef(job)}</span>
        <span className="hub-jobs-row-mid-meta">{crew}{date ? ` · ${date}` : ''}</span>
      </span>
      <span className="truncate hub-jobs-name">{jobsListCustomer(job)}</span>
      <span className="truncate hub-jobs-muted">{suburb}</span>
      <span className="truncate hub-jobs-col-crew">{crew}</span>
      <span className="truncate hub-jobs-col-date">{date}</span>
      <span className={`hub-jobs-status ${rowStatusClass(pill.tone)}`} data-jobs-pill={pill.kind}>
        {pill.label}
      </span>
      <span className="hub-jobs-row-next" onClick={e => e.stopPropagation()}>
        {nextLabel ? (
          <Link
            to={nextHref}
            className="hub-next shrink-0"
            data-job-list-next={nextLabel}
          >
            {nextLabel}
          </Link>
        ) : null}
      </span>
    </div>
  );
}

function rowStatusClass(tone: string): string {
  return `hub-jobs-pill is-${tone}`;
}

function EnquiryListRow({
  row,
  timeZone,
  busy,
  flightKind,
  disabled,
  onApprove,
  onDismiss,
}: {
  row: EnquiryRow;
  timeZone: string;
  busy: boolean;
  flightKind: 'approve' | 'dismiss' | null;
  disabled: boolean;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  const canDecide = row.enquiryStatus === 'draft';
  const jobHref = enquiryJobPath(row.approvedJobId);
  const callback = enquiryCallback(row.callerPhone);
  return (
    <article
      className="hub-jobs-enquiry-row"
      data-enquiry-id={row.id}
      data-enquiry-state={row.state}
    >
      <div className="hub-jobs-enquiry-copy">
        <p className="hub-jobs-enquiry-who">{enquiryCallerLabel(row)}</p>
        <p className="hub-jobs-enquiry-time">{formatEnquiryRowTime(row.missedCallAt, timeZone)}</p>
        {row.excerpt ? <p className="hub-jobs-enquiry-excerpt">{row.excerpt}</p> : null}
        <p className="hub-jobs-enquiry-facts">
          <span className="hub-jobs-enquiry-tag">From missed call</span>
          <span className="hub-jobs-enquiry-state">{ENQUIRY_STATE_LABELS[row.state]}</span>
        </p>
      </div>
      <div className="hub-jobs-enquiry-actions">
        {callback ? (
          <a
            href={callback.href}
            className="btn-secondary hub-jobs-enquiry-tap hub-jobs-enquiry-call"
            data-enquiry-call={row.id}
          >
            <span>Call back</span>
            <span className="hub-jobs-enquiry-call-num">{callback.label}</span>
          </a>
        ) : null}
        {canDecide ? (
          <>
            <button
              type="button"
              className="btn-primary hub-jobs-enquiry-tap"
              data-enquiry-approve={row.id}
              disabled={disabled}
              onClick={onApprove}
            >
              {busy && flightKind === 'approve' ? (
                <span className="inline-flex items-center gap-2">
                  <LoadingSpinner size="sm" />
                  Approving…
                </span>
              ) : 'Approve'}
            </button>
            <button
              type="button"
              className="btn-secondary hub-jobs-enquiry-tap"
              data-enquiry-dismiss={row.id}
              disabled={disabled}
              onClick={onDismiss}
            >
              {busy && flightKind === 'dismiss' ? (
                <span className="inline-flex items-center gap-2">
                  <LoadingSpinner size="sm" />
                  Dismissing…
                </span>
              ) : 'Dismiss'}
            </button>
          </>
        ) : jobHref ? (
          <Link
            to={jobHref}
            className="hub-next hub-jobs-enquiry-tap"
          >
            Open job
          </Link>
        ) : null}
      </div>
    </article>
  );
}
