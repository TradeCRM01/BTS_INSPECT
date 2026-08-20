import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner, PageError, EmptyState, ViewToggle, useViewMode } from '../components/ui';
import { JobFormModal } from '../components/crm/JobFormModal';
import type { Job, JobWithClient, JobStatus, Client } from '../types/crm';
import {
  JOB_STATUS_LABELS, JOB_STATUS_STYLES, JOB_PRIORITY_LABELS,
  JOB_PRIORITY_DOT,
} from '../types/crm';
import { pickJobColor } from '../lib/jobColors';
import { Plus, Briefcase, Search, Calendar, Clock, MapPin, User } from 'lucide-react';
import { format, parseISO, isToday, isPast, isFuture } from 'date-fns';

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

  const { data: jobs, isLoading, error } = useQuery<JobWithClient[]>({
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
      let clientMap = new Map<string, Client>();
      if (clientIds.length > 0) {
        const { data: clientsData } = await supabase
          .from('clients')
          .select('*')
          .in('id', clientIds);
        for (const c of clientsData ?? []) {
          clientMap.set(c.id, c as Client);
        }
      }

      return jobs.map(j => ({
        ...j,
        client_name: j.client_id ? clientMap.get(j.client_id)?.name ?? null : null,
        client_phone: j.client_id ? clientMap.get(j.client_id)?.phone ?? null : null,
        client_address: j.client_id ? clientMap.get(j.client_id)?.address ?? null : null,
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

  const upcomingJobs = filtered.filter(j =>
    j.status !== 'completed' && j.status !== 'cancelled' &&
    j.scheduled_date && (isToday(parseISO(j.scheduled_date)) || isFuture(parseISO(j.scheduled_date)))
  );
  const pastJobs = filtered.filter(j =>
    j.status === 'completed' || j.status === 'cancelled' ||
    (j.scheduled_date && isPast(parseISO(j.scheduled_date)) && !isToday(parseISO(j.scheduled_date)))
  );

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
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Jobs</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">
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
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 overflow-x-auto">
            {STATUS_FILTERS.map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap capitalize ${
                  statusFilter === s ? 'bg-white text-[#0A2540] shadow-sm' : 'text-[#6B7280] hover:text-[#374151]'
                }`}
              >
                {s === 'all' ? 'All' : JOB_STATUS_LABELS[s as JobStatus]}
                <span className="ml-1.5 text-xs text-[#9CA3AF]">
                  {counts[s as keyof typeof counts]}
                </span>
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
            message={search || statusFilter !== 'all' ? 'Try adjusting your filters' : 'Create your first job to get started'}
            action={!search && statusFilter === 'all' ? (
              <button onClick={() => setShowForm(true)} className="btn-primary mt-4">
                <Plus size={16} /> Create Job
              </button>
            ) : undefined}
          />
        ) : viewMode === 'grid' ? (
          <div className="space-y-6">
            {/* Upcoming / Active */}
            {upcomingJobs.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Calendar size={13} /> Upcoming & Active
                  <span className="text-[#9CA3AF] normal-case font-normal">({upcomingJobs.length})</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {upcomingJobs.map(job => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
              </div>
            )}

            {/* Past */}
            {pastJobs.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide mb-2 flex items-center gap-1.5">
                  <Clock size={13} /> Past Jobs
                  <span className="text-[#9CA3AF] normal-case font-normal">({pastJobs.length})</span>
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {pastJobs.map(job => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9FAFB] text-left text-xs font-medium text-[#4A5568] uppercase tracking-wide">
                    <th className="px-4 py-3">Job #</th>
                    <th className="px-4 py-3">Title</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Priority</th>
                    <th className="px-4 py-3">Scheduled</th>
                    <th className="px-4 py-3">Assigned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {filtered.map(job => {
                    const color = pickJobColor(job.id, job.color);
                    const jobDate = job.scheduled_date ? parseISO(job.scheduled_date) : null;
                    return (
                      <tr key={job.id} onClick={() => navigate(`/jobs/${job.id}`)}
                        className="hover:bg-[#F9FAFB] cursor-pointer transition-colors" style={{ borderLeft: `3px solid ${color}` }}>
                        <td className="px-4 py-3 font-medium" style={{ color }}>{job.job_number != null ? `#${String(job.job_number).padStart(4, '0')}` : '—'}</td>
                        <td className="px-4 py-3 font-medium text-[#1A1A1A]">{job.title}</td>
                        <td className="px-4 py-3 text-[#4A5568]">{job.client_name ?? <span className="text-[#9CA3AF]">—</span>}</td>
                        <td className="px-4 py-3"><span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${JOB_STATUS_STYLES[job.status]}`}>{JOB_STATUS_LABELS[job.status]}</span></td>
                        <td className="px-4 py-3"><span className="flex items-center gap-1 text-xs font-medium" style={{ color: JOB_PRIORITY_DOT[job.priority] }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: JOB_PRIORITY_DOT[job.priority] }} />{JOB_PRIORITY_LABELS[job.priority]}</span></td>
                        <td className="px-4 py-3 text-[#4A5568]">{jobDate ? format(jobDate, 'd MMM yyyy') : 'Unscheduled'}{job.start_time && <span className="text-[#6B7280] block text-xs">{job.start_time.slice(0, 5)}{job.end_time ? `–${job.end_time.slice(0, 5)}` : ''}</span>}</td>
                        <td className="px-4 py-3 text-[#4A5568]">{job.assigned_team && job.assigned_team.length > 0 ? `${job.assigned_team.length} assigned` : '—'}</td>
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

function JobCard({ job }: { job: JobWithClient }) {
  const color = pickJobColor(job.id, job.color);
  const jobDate = job.scheduled_date ? parseISO(job.scheduled_date) : null;
  const dateLabel = jobDate ? format(jobDate, 'd MMM yyyy') : 'Unscheduled';

  return (
    <Link
      to={`/jobs/${job.id}`}
      className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm hover:shadow-md transition-all text-left overflow-hidden group block"
      style={{ borderLeftWidth: 3, borderLeftColor: color }}
    >
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            {job.job_number != null && (
              <span className="text-[10px] font-bold" style={{ color }}>
                #{String(job.job_number).padStart(4, '0')}
              </span>
            )}
            <h3 className="text-sm font-semibold text-[#1A1A1A] truncate group-hover:text-[#0A2540] transition-colors">
              {job.title}
            </h3>
          </div>
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${JOB_STATUS_STYLES[job.status]}`}>
            {JOB_STATUS_LABELS[job.status]}
          </span>
        </div>

        <div className="space-y-1">
          {job.client_name && (
            <div className="flex items-center gap-1.5 text-xs text-[#4A5568]">
              <User size={12} className="text-[#9CA3AF] shrink-0" />
              <span className="truncate">{job.client_name}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-xs text-[#4A5568]">
            <Calendar size={12} className="text-[#9CA3AF] shrink-0" />
            <span>{dateLabel}</span>
            {job.start_time && (
              <span className="text-[#6B7280]">· {job.start_time.slice(0, 5)}{job.end_time ? `–${job.end_time.slice(0, 5)}` : ''}</span>
            )}
          </div>
          {job.address && (
            <div className="flex items-center gap-1.5 text-xs text-[#4A5568]">
              <MapPin size={12} className="text-[#9CA3AF] shrink-0" />
              <span className="truncate">{job.address}</span>
            </div>
          )}
        </div>

        {(job.priority !== 'medium' || (job.assigned_team && job.assigned_team.length > 0)) && (
          <div className="flex items-center gap-2 mt-2.5 pt-2.5 border-t border-[#F3F4F6]">
            {job.priority !== 'medium' && (
              <span className="flex items-center gap-1 text-[10px] font-medium" style={{ color: JOB_PRIORITY_DOT[job.priority] }}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: JOB_PRIORITY_DOT[job.priority] }} />
                {JOB_PRIORITY_LABELS[job.priority]} priority
              </span>
            )}
            {job.assigned_team && job.assigned_team.length > 0 && (
              <span className="text-[10px] text-[#6B7280] ml-auto">
                {job.assigned_team.length} assigned
              </span>
            )}
          </div>
        )}
      </div>
    </Link>
  );
}
