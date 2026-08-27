import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { getAuditClients, getAuditJobs } from '../lib/devFieldAuditDocs';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, EmptyState, SearchBar } from '../components/ui';
import { JobFormModal } from '../components/crm/JobFormModal';
import type { Job, JobWithClient, JobStatus, Client } from '../types/crm';
import { JOB_STATUS_LABELS } from '../types/crm';
import { jobListNext } from '../lib/jobNextAction';
import { formatJobRef, withParentJobNumbers } from '../lib/jobRef';
import { withReminderNext } from '../lib/jobReminder';
import { loadJobCardExtras, type JobDocChip } from '../lib/jobCardExtras';
import { Plus, Briefcase } from 'lucide-react';

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

export function JobsPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
        formatJobRef(j).toLowerCase().includes(q) ||
        (j.cost_code ?? '').toLowerCase().includes(q) ||
        (j.job_number != null && String(j.job_number).includes(q))
      );
    }
    return result;
  }, [jobs, statusFilter, search]);

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
      <div className="ops-page hub-jobs">
        <div className="ops-page-head">
          <div>
            <p className="hub-jobs-label">Jobs</p>
            <h1 className="ops-page-title">Jobs</h1>
          </div>
          <button
            onClick={() => { setPresetClientId(null); setShowForm(true); }}
            className="btn-primary"
          >
            <Plus size={16} /> New job
          </button>
        </div>

        <div className="hub-jobs-chrome">
          <div className="hub-jobs-filters">
            {STATUS_FILTERS.map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={`hub-chrome-filter ${statusFilter === tab.key ? 'hub-chrome-filter-on' : ''}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <SearchBar value={search} onChange={setSearch} placeholder="Search jobs or clients..." className="max-w-sm" />
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : filtered.length === 0 ? (
          <div className="hub-jobs-sheet">
            <EmptyState
              icon={Briefcase}
              title={filteredEmpty ? 'No jobs yet' : 'No matching jobs'}
              message={filteredEmpty
                ? 'Create a job, add the site, then put it on the board so the crew can see it.'
                : 'Try another status or search.'}
              action={filteredEmpty ? (
                <button onClick={() => setShowForm(true)} className="btn-primary">
                  <Plus size={16} /> Create job
                </button>
              ) : undefined}
            />
          </div>
        ) : (
          <div className="hub-jobs-sheet">
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
          </div>
        )}
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

function JobRow({ job }: { job: JobRowModel }) {
  const navigate = useNavigate();
  const next = withReminderNext(job, jobListNext(job));
  const site = visibleSite(job.address, job.client_address);
  const suburb = site ? suburbFromSite(site) : '';
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(next.href)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(next.href); } }}
      className="hub-jobs-row"
    >
      <span className="hub-jobs-ref">{formatJobRef(job)}</span>
      <span className="truncate">{job.client_name || ''}</span>
      <span className="truncate hub-jobs-muted">{suburb}</span>
      <span className={`hub-jobs-pill is-${job.status}`}>{JOB_STATUS_LABELS[job.status]}</span>
      <span className="hub-jobs-row-next" onClick={e => e.stopPropagation()}>
        {next.actionable ? (
          <Link to={next.href} className="hub-next">{next.label}</Link>
        ) : (
          <span className="hub-jobs-muted">{next.label}</span>
        )}
      </span>
    </div>
  );
}
