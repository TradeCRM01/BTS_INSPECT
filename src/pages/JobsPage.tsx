import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, EmptyState, ViewToggle, useViewMode, OpsPhotoStamp, OpsSiteRow, OpsStatus, opsSiteLabel } from '../components/ui';
import { JobFormModal } from '../components/crm/JobFormModal';
import type { Job, JobWithClient, JobStatus, Client } from '../types/crm';
import {
  JOB_STATUS_LABELS, JOB_STATUS_STYLES, JOB_STATUS_RAIL, JOB_PRIORITY_LABELS,
  JOB_PRIORITY_DOT,
} from '../types/crm';
import { jobCardHint, jobListBucket } from '../lib/jobNextAction';
import { loadJobCardExtras, type JobDocChip } from '../lib/jobCardExtras';
import { Plus, Briefcase, Search, Calendar, Clock } from 'lucide-react';
import { format, parseISO } from 'date-fns';

type JobCardModel = JobWithClient & {
  cover_photo_url: string | null;
  docs: JobDocChip[];
};

type StatusFilter = 'all' | JobStatus;

const STATUS_FILTERS: StatusFilter[] = ['all', 'scheduled', 'in_progress', 'completed', 'cancelled'];

export function JobsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [viewMode, setViewMode] = useViewMode('jobs');

  const { data: jobs, isLoading, error } = useQuery<JobCardModel[]>({
    queryKey: ['jobs-all', profile?.company_id],
    queryFn: async () => {
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

      const withClients: JobWithClient[] = jobs.map(j => ({
        ...j,
        client_name: j.client_id ? clientMap.get(j.client_id)?.name ?? null : null,
        client_phone: j.client_id ? clientMap.get(j.client_id)?.phone ?? null : null,
        client_address: j.client_id ? clientMap.get(j.client_id)?.address ?? null : null,
      }));
      let photoByJob = new Map<string, string>();
      let docsByJob = new Map<string, JobDocChip[]>();
      try {
        const extras = await loadJobCardExtras(withClients);
        photoByJob = extras.photoByJob;
        docsByJob = extras.docsByJob;
      } catch {
        // Evidence photos / attached docs are optional on the card.
      }
      return withClients.map(j => ({
        ...j,
        cover_photo_url: photoByJob.get(j.id) ?? null,
        docs: docsByJob.get(j.id) ?? [],
      }));
    },
    enabled: !!profile,
  });

  const filtered = useMemo(() => {
    if (!jobs) return [];
    let result = jobs;
    if (statusFilter !== 'all') {
      result = result.filter(j => j.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(j =>
        j.title.toLowerCase().includes(q) ||
        j.client_name?.toLowerCase().includes(q) ||
        j.address?.toLowerCase().includes(q) ||
        (j.job_number != null && String(j.job_number).includes(q))
      );
    }
    return result;
  }, [jobs, statusFilter, search]);

  const counts = useMemo(() => {
    if (!jobs) return { all: 0, scheduled: 0, in_progress: 0, completed: 0, cancelled: 0 };
    return {
      all: jobs.length,
      scheduled: jobs.filter(j => j.status === 'scheduled').length,
      in_progress: jobs.filter(j => j.status === 'in_progress').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      cancelled: jobs.filter(j => j.status === 'cancelled').length,
    };
  }, [jobs]);

  const needsDateJobs = filtered.filter(j => jobListBucket(j) === 'needs_date');
  const onBoardJobs = filtered.filter(j => jobListBucket(j) === 'on_board');
  const upcomingJobs = filtered.filter(j => jobListBucket(j) === 'upcoming');
  const closedJobs = filtered.filter(j => jobListBucket(j) === 'closed');

  function handleCloseForm() {
    setShowForm(false);
  }

  function handleSaved(jobId: string) {
    handleCloseForm();
    queryClient.invalidateQueries({ queryKey: ['jobs-all'] });
    queryClient.invalidateQueries({ queryKey: ['jobs'] });
    navigate(`/jobs/${jobId}`);
  }

  if (error) return <AppShell><PageError message="Could not load jobs" /></AppShell>;

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h1 className="ops-page-title">Jobs</h1>
            <p className="ops-meta mt-0.5">
              {filtered.length} of {jobs?.length ?? 0} jobs
            </p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="btn-primary"
          >
            <Plus size={16} /> New Job
          </button>
        </div>

        {/* Search + Status filter bar */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search jobs, clients, addresses..."
              className="form-input pl-9"
            />
          </div>
          <div className="ops-tabs flex-1">
            {STATUS_FILTERS.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`ops-tab ${statusFilter === s ? 'ops-tab-active' : ''}`}
              >
                {s === 'all' ? 'All' : JOB_STATUS_LABELS[s as JobStatus]}
                <span className="ml-1.5">{counts[s as keyof typeof counts]}</span>
              </button>
            ))}
          </div>
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>

        {/* Job cards */}
        {isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title={search || statusFilter !== 'all' ? 'No matching jobs' : 'No jobs yet'}
            message={search || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Create a job, add the site, then put it on the board so the crew can see it.'}
            action={!search && statusFilter === 'all' ? (
              <button onClick={() => setShowForm(true)} className="btn-primary mt-4">
                <Plus size={16} /> Create Job
              </button>
            ) : undefined}
          />
        ) : viewMode === 'grid' ? (
          <div className="space-y-4">
            <JobGroup title="Needs a date" icon={Calendar} jobs={needsDateJobs} />
            <JobGroup title="On the board" icon={Briefcase} jobs={onBoardJobs} />
            <JobGroup title="Upcoming" icon={Calendar} jobs={upcomingJobs} />
            <JobGroup title="Closed" icon={Clock} jobs={closedJobs} />
          </div>
        ) : (
          <div className="bg-white rounded border border-[#E5E7EB] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9FAFB] text-left ops-meta font-medium uppercase tracking-wide">
                    <th className="px-3 py-2">Job #</th>
                    <th className="px-3 py-2">Site</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Priority</th>
                    <th className="px-3 py-2">Scheduled</th>
                    <th className="px-3 py-2">Next</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {filtered.map(job => {
                    const rail = JOB_STATUS_RAIL[job.status];
                    const jobDate = job.scheduled_date ? parseISO(job.scheduled_date) : null;
                    return (
                      <tr key={job.id} onClick={() => navigate(`/jobs/${job.id}`)}
                        className="hover:bg-[#F9FAFB] cursor-pointer transition-colors" style={{ borderLeft: `3px solid ${rail}` }}>
                        <td className="px-3 py-2 font-medium" style={{ color: rail }}>{job.job_number != null ? `#${String(job.job_number).padStart(4, '0')}` : '—'}</td>
                        <td className="px-3 py-2">
                          <p className="text-sm font-semibold text-navy truncate">{opsSiteLabel(job.address, job.client_address)}</p>
                          <p className="ops-meta truncate">{job.title}</p>
                        </td>
                        <td className="px-3 py-2 ops-meta">{job.client_name ?? '—'}</td>
                        <td className="px-3 py-2"><OpsStatus className={JOB_STATUS_STYLES[job.status]}>{JOB_STATUS_LABELS[job.status]}</OpsStatus></td>
                        <td className="px-3 py-2"><span className="flex items-center gap-1 text-xs font-medium" style={{ color: JOB_PRIORITY_DOT[job.priority] }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: JOB_PRIORITY_DOT[job.priority] }} />{JOB_PRIORITY_LABELS[job.priority]}</span></td>
                        <td className="px-3 py-2 ops-meta">{jobDate ? format(jobDate, 'd MMM yyyy') : 'No date'}{job.start_time && <span className="block">{job.start_time.slice(0, 5)}{job.end_time ? `–${job.end_time.slice(0, 5)}` : ''}</span>}</td>
                        <td className="px-3 py-2"><span className="ops-next-hint">{jobCardHint(job)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <JobFormModal
          job={null}
          presetDate={null}
          presetClientId={null}
          onClose={handleCloseForm}
          onSaved={handleSaved}
        />
      )}
    </AppShell>
  );
}

function JobGroup({
  title, icon: Icon, jobs,
}: {
  title: string;
  icon: typeof Calendar;
  jobs: JobCardModel[];
}) {
  if (jobs.length === 0) return null;
  return (
    <div>
      <h2 className="ops-group-title flex items-center gap-1.5">
        <Icon size={13} /> {title}
        <span className="ops-meta normal-case font-normal">({jobs.length})</span>
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
        {jobs.map(job => (
          <JobCard key={job.id} job={job} />
        ))}
      </div>
    </div>
  );
}

function JobCard({ job }: { job: JobCardModel }) {
  const navigate = useNavigate();
  const hint = jobCardHint(job);
  const site = opsSiteLabel(job.address, job.client_address);
  const mapsQuery = (job.address || job.client_address)?.trim() || null;
  const jobNo = job.job_number != null ? `#${String(job.job_number).padStart(4, '0')}` : 'JOB';
  const money = job.docs.find(d => d.kind === 'invoice')?.amount
    ?? job.docs.find(d => d.kind === 'quote')?.amount;

  return (
    <div
      role="link"
      tabIndex={0}
      onClick={() => navigate(`/jobs/${job.id}`)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/jobs/${job.id}`); } }}
      className="ops-card ops-card-hover group cursor-pointer"
    >
      <OpsPhotoStamp
        src={job.cover_photo_url}
        status={<OpsStatus className={JOB_STATUS_STYLES[job.status]}>{JOB_STATUS_LABELS[job.status]}</OpsStatus>}
        identity={`${jobNo} | ${site}`}
        money={money}
      />
      <div className="ops-card-body">
        <OpsSiteRow site={site} phone={job.client_phone} mapsQuery={mapsQuery} />
        <div className="ops-card-footer">
          <span className="ops-next-control-block">{hint}</span>
        </div>
        {job.docs.length > 0 && (
          <div className="ops-attach">
            {job.docs.map(doc => (
              <Link key={doc.id} to={doc.href} className="ops-attach-chip" onClick={e => e.stopPropagation()}>
                <span className="truncate">{doc.label}</span>
                <span className="tabular-nums shrink-0">{doc.amount}</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
