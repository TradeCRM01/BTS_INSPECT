import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { getAuditClients, getAuditJobs } from '../lib/devFieldAuditDocs';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, EmptyState, SearchBar } from '../components/ui';
import { JobFormModal } from '../components/crm/JobFormModal';
import type { Job, JobWithClient, JobStatus, Client } from '../types/crm';
import { JOB_STATUS_LABELS } from '../types/crm';
import { jobOpenNext } from '../lib/jobNextAction';
import { ARRIVING_NEXT_LABEL, CLOCK_IN_NEXT_LABEL } from '../lib/jobReminder';
import { formatJobRef, withParentJobNumbers } from '../lib/jobRef';
import { loadJobCardExtras, type JobDocChip } from '../lib/jobCardExtras';
import { Plus, Briefcase, MoreHorizontal } from 'lucide-react';

type JobRowModel = JobWithClient & {
  cover_photo_url: string | null;
  docs: JobDocChip[];
};

type StatusFilter = 'all' | JobStatus;

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'scheduled', label: JOB_STATUS_LABELS.scheduled },
  { key: 'in_progress', label: JOB_STATUS_LABELS.in_progress },
  { key: 'completed', label: JOB_STATUS_LABELS.completed },
  { key: 'cancelled', label: JOB_STATUS_LABELS.cancelled },
];

/** Signed jobs-list frame seed — list look only, not a live company. */
const JOBS_LIST_LOOK = 'jobs-list';

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
  ];
}

export function JobsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const lookJobsList = searchParams.get('look') === JOBS_LIST_LOOK;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [presetClientId, setPresetClientId] = useState<string | null>(null);

  const { data: jobs, isLoading, error } = useQuery<JobRowModel[]>({
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
        const { data: clientsData } = await supabase
          .from('clients')
          .select('*')
          .in('id', clientIds);
        for (const c of clientsData ?? []) {
          clientMap.set(c.id, c as Client);
        }
      }

      const withClients: JobWithClient[] = withParentJobNumbers(jobs.map(j => ({
        ...j,
        client_name: j.client_id ? clientMap.get(j.client_id)?.name ?? null : null,
        client_phone: j.client_id ? clientMap.get(j.client_id)?.phone ?? null : null,
        client_address: j.client_id ? clientMap.get(j.client_id)?.address ?? null : null,
      })));
      let photoByJob = new Map<string, string>();
      let docsByJob = new Map<string, JobDocChip[]>();
      try {
        const extras = await loadJobCardExtras(withClients);
        photoByJob = extras.photoByJob;
        docsByJob = extras.docsByJob;
      } catch {
        // Evidence photos / attached docs stay optional. The list is rows, not posters.
      }
      return withClients.map(j => ({
        ...j,
        cover_photo_url: photoByJob.get(j.id) ?? null,
        docs: docsByJob.get(j.id) ?? [],
      }));
    },
    enabled: !!profile && !lookJobsList,
  });

  const listRows = lookJobsList ? jobsListLookRows() : (jobs ?? []);
  const filtered = useMemo(() => {
    let result = listRows;
    if (statusFilter !== 'all') {
      result = result.filter(j => j.status === statusFilter);
    }
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

  const filterLabel = STATUS_FILTERS.find(tab => tab.key === statusFilter)?.label ?? 'All';
  const whisper = [
    filterLabel,
    filtered.length === 1 ? '1 job' : `${filtered.length} jobs`,
  ].join(' · ');

  useEffect(() => {
    const clientId = searchParams.get('client');
    if (!clientId) return;
    setPresetClientId(clientId);
    setShowForm(true);
    const next = new URLSearchParams(searchParams);
    next.delete('client');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  function handleCloseForm() {
    setShowForm(false);
    setPresetClientId(null);
  }

  function handleSaved(jobId: string) {
    handleCloseForm();
    queryClient.invalidateQueries({ queryKey: ['jobs-all'] });
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
    queryClient.invalidateQueries({ queryKey: ['client-jobs'] });
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    navigate(`/jobs/${jobId}`);
  }

  if (pageQueryBlocked(error)) return <AppShell><PageError message="Could not load jobs" /></AppShell>;

  const filteredEmpty = !search && statusFilter === 'all';

  return (
    <AppShell>
      <div className="ops-page hub-jobs hub-jobs-list-doc">
        <div className="hub-jobs-sheet">
          <header className="hub-jobs-list-bar">
            <span className="hub-jobs-list-mark">List</span>
          </header>
          <div className="hub-jobs-list-body">
            <h1 className="ops-page-title">Jobs</h1>
            <p className="hub-jobs-list-whisper">{whisper}</p>
            <div className="hub-jobs-list-tools">
              <button
                type="button"
                onClick={() => { setPresetClientId(null); setShowForm(true); }}
                className="btn-primary"
              >
                <Plus size={16} /> New job
              </button>
              <div className="hub-jobs-list-tools-overflow">
                <JobsListFind
                  statusFilter={statusFilter}
                  onStatusFilter={setStatusFilter}
                  search={search}
                  onSearch={setSearch}
                />
              </div>
            </div>
            {isLoading ? (
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
                <div className="hub-jobs-thead">
                  <span>#</span>
                  <span>Customer</span>
                  <span>Suburb</span>
                  <span>Status</span>
                  <span />
                </div>
                {filtered.map(job => (
                  <JobRow key={job.id} job={job} />
                ))}
              </>
            )}
          </div>
        </div>
      </div>

      {showForm && (
        <JobFormModal
          key={presetClientId ?? 'new'}
          job={null}
          presetDate={null}
          presetClientId={presetClientId}
          onClose={handleCloseForm}
          onSaved={handleSaved}
        />
      )}
    </AppShell>
  );
}

function placeJobsListMore(more: HTMLDetailsElement) {
  const menu = more.querySelector('.hub-jobs-list-more-menu') as HTMLElement | null;
  const paper = more.closest('.hub-jobs-sheet') as HTMLElement | null;
  if (!menu || !paper) return;
  more.classList.remove('is-flip', 'is-shift');
  menu.style.removeProperty('--hub-jobs-list-more-shift');
  if (!more.open) return;
  const pad = 8;
  const paperRect = paper.getBoundingClientRect();
  const bar = paper.querySelector('.hub-jobs-list-bar');
  const inkFloor = (bar?.getBoundingClientRect().bottom ?? paperRect.top) + pad;
  const viewBottom = window.innerHeight - pad;
  const menuRect = menu.getBoundingClientRect();
  const trigger = more.querySelector('summary') as HTMLElement | null;
  const triggerRect = trigger?.getBoundingClientRect() ?? menuRect;
  const flippedTop = triggerRect.top - pad - menuRect.height;
  const overflowsBottom = menuRect.bottom > Math.min(paperRect.bottom - pad, viewBottom);
  if (overflowsBottom && flippedTop >= inkFloor) {
    more.classList.add('is-flip');
  }
  const after = menu.getBoundingClientRect();
  let shift = 0;
  if (after.right > paperRect.right - pad) shift = paperRect.right - pad - after.right;
  if (after.left + shift < paperRect.left + pad) shift = paperRect.left + pad - after.left;
  if (shift !== 0) {
    more.classList.add('is-shift');
    menu.style.setProperty('--hub-jobs-list-more-shift', `${Math.round(shift)}px`);
  }
}

function JobsListFind({
  statusFilter,
  onStatusFilter,
  search,
  onSearch,
}: {
  statusFilter: StatusFilter;
  onStatusFilter: (key: StatusFilter) => void;
  search: string;
  onSearch: (value: string) => void;
}) {
  const moreRef = useRef<HTMLDetailsElement>(null);

  const closeMore = () => {
    if (moreRef.current) moreRef.current.open = false;
  };

  const placeMoreMenu = () => {
    if (moreRef.current) placeJobsListMore(moreRef.current);
  };

  useEffect(() => {
    const more = moreRef.current;
    const onPointer = (event: PointerEvent) => {
      if (!moreRef.current?.open) return;
      if (!moreRef.current.contains(event.target as Node)) closeMore();
    };
    more?.addEventListener('toggle', placeMoreMenu);
    window.addEventListener('resize', placeMoreMenu);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      more?.removeEventListener('toggle', placeMoreMenu);
      window.removeEventListener('resize', placeMoreMenu);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  return (
    <details ref={moreRef} className="hub-jobs-list-more hub-jobs-list-find">
      <summary aria-label="Find">
        <MoreHorizontal size={18} />
      </summary>
      <div className="hub-jobs-list-more-menu" role="menu">
        <div className="hub-jobs-chrome">
          <div className="hub-jobs-filters">
            {STATUS_FILTERS.map(tab => (
              <button
                key={tab.key}
                type="button"
                role="menuitem"
                onClick={() => onStatusFilter(tab.key)}
                className={`hub-chrome-filter ${statusFilter === tab.key ? 'hub-chrome-filter-on' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <SearchBar value={search} onChange={onSearch} placeholder="Search jobs or clients..." />
        </div>
      </div>
    </details>
  );
}

function JobRowMore({
  label,
  href,
}: {
  label: string;
  href: string;
}) {
  const navigate = useNavigate();
  const moreRef = useRef<HTMLDetailsElement>(null);

  const closeMore = () => {
    if (moreRef.current) moreRef.current.open = false;
  };

  const placeMoreMenu = () => {
    if (moreRef.current) placeJobsListMore(moreRef.current);
  };

  useEffect(() => {
    const more = moreRef.current;
    const onPointer = (event: PointerEvent) => {
      if (!moreRef.current?.open) return;
      if (!moreRef.current.contains(event.target as Node)) closeMore();
    };
    more?.addEventListener('toggle', placeMoreMenu);
    window.addEventListener('resize', placeMoreMenu);
    document.addEventListener('pointerdown', onPointer);
    return () => {
      more?.removeEventListener('toggle', placeMoreMenu);
      window.removeEventListener('resize', placeMoreMenu);
      document.removeEventListener('pointerdown', onPointer);
    };
  }, []);

  return (
    <details ref={moreRef} className="hub-jobs-list-more">
      <summary aria-label="More">
        <MoreHorizontal size={18} />
      </summary>
      <div className="hub-jobs-list-more-menu" role="menu">
        <button
          type="button"
          role="menuitem"
          onClick={() => { navigate(href); closeMore(); }}
        >
          {label}
        </button>
      </div>
    </details>
  );
}

function JobRow({ job }: { job: JobRowModel }) {
  const navigate = useNavigate();
  const next = jobOpenNext(job);
  const site = visibleSite(job.address, job.client_address);
  const suburb = site ? suburbFromSite(site) : '';
  const primaryNext = next.label === ARRIVING_NEXT_LABEL || next.label === CLOCK_IN_NEXT_LABEL;
  const openHref = next.href;
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label="Open"
      onClick={() => navigate(openHref)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(openHref); } }}
      className="hub-jobs-row"
    >
      <span className="hub-jobs-ref">{formatJobRef(job)}</span>
      <span className="truncate hub-jobs-name">{job.client_name || ''}</span>
      <span className="truncate hub-jobs-muted">{suburb}</span>
      <span className="hub-jobs-status">{JOB_STATUS_LABELS[job.status]}</span>
      <span className="hub-jobs-row-next" onClick={e => e.stopPropagation()}>
        <JobRowMore label={primaryNext ? next.label : next.label} href={next.href} />
      </span>
    </div>
  );
}
