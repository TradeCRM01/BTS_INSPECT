import { useState, useMemo, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { isDevFieldAuditAuth, pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { getAuditClients, getAuditJobs, getAuditTeamMembers } from '../lib/devFieldAuditDocs';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import type { Job, JobWithClient, Client } from '../types/crm';
import { JobFormModal } from '../components/crm/JobFormModal';
import { ScheduleJobSearch } from '../components/crm/ScheduleJobSearch';
import {
  DayBoardView, WeekBoardView, NeedsDateRail, PhoneDayList,
  type TeamMember,
} from '../components/crm/BoardViews';
import { pickEmployeeColor } from '../lib/jobColors';
import { DEFAULT_SLOT_START, rememberDraggedJob, rescheduleJobPatch, type JobDropPayload } from '../lib/dispatch';
import { persistLivingJobOnBoundJhas } from '../lib/persistLivingJobJha';
import { partitionScheduleJobs } from '../lib/jobNextAction';
import { attachJobClients, mergeScheduleJobPatch, searchScheduleJobs, withScheduleJobPatches } from '../lib/scheduleJobSearch';
import { EmployeeColorSwatch } from '../components/crm/EmployeeColorSwatch';
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalIcon,
  Columns3, Users, X,
} from 'lucide-react';
import {
  format, startOfWeek, endOfWeek,
  addDays, addWeeks,
} from 'date-fns';

type ViewMode = 'day' | 'week';

export function SchedulePage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [showForm, setShowForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [presetClientId, setPresetClientId] = useState<string | null>(null);
  const [presetEmployeeId, setPresetEmployeeId] = useState<string | undefined>(undefined);
  const [filteredEmployeeIds, setFilteredEmployeeIds] = useState<Set<string>>(new Set());
  const [colorSavingId, setColorSavingId] = useState<string | null>(null);
  const [jobQuery, setJobQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [pickedJob, setPickedJob] = useState<JobWithClient | null>(null);

  const preselectClient = searchParams.get('client');
  const preselectJob = searchParams.get('job');
  const preselectDate = searchParams.get('date');

  useEffect(() => {
    if (preselectJob) navigate(`/jobs/${preselectJob}`, { replace: true });
  }, [preselectJob, navigate]);

  useEffect(() => {
    if (!preselectDate) return;
    const parsed = new Date(`${preselectDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    setCurrentDate(parsed);
    setViewMode('day');
    const next = new URLSearchParams(searchParams);
    next.delete('date');
    setSearchParams(next, { replace: true });
  }, [preselectDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: teamMembers } = useQuery<TeamMember[]>({
    queryKey: ['team-members-schedule'],
    queryFn: async () => {
      const mock = getAuditTeamMembers();
      if (mock) {
        return mock.map(m => ({
          id: m.id,
          name: m.name,
          email: m.email,
          schedule_color: null,
        }));
      }
      if (!profile?.company_id) return [];
      const { data, error } = await supabase.rpc('get_company_members', {
        p_company_id: profile.company_id,
      });
      if (error) throw error;
      return (data ?? []).map((m: {
        id: string; name: string; email: string; schedule_color?: string | null;
      }) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        schedule_color: m.schedule_color ?? null,
      }));
    },
    enabled: !!profile,
  });

  const setScheduleColor = async (memberId: string, color: string | null) => {
    setColorSavingId(memberId);
    try {
      const { error } = await supabase.rpc('set_member_schedule_color', {
        p_member_id: memberId,
        p_color: color,
      });
      if (error) throw error;
      queryClient.setQueryData<TeamMember[]>(['team-members-schedule'], prev =>
        (prev ?? []).map(m => (m.id === memberId ? { ...m, schedule_color: color } : m)),
      );
      queryClient.invalidateQueries({ queryKey: ['team-members-schedule'] });
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : 'Could not save colour');
    } finally {
      setColorSavingId(null);
    }
  };

  const rangeStart = useMemo(() => {
    if (viewMode === 'day') return format(currentDate, 'yyyy-MM-dd');
    return format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  }, [currentDate, viewMode]);

  const rangeEnd = useMemo(() => {
    if (viewMode === 'day') return format(currentDate, 'yyyy-MM-dd');
    return format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');
  }, [currentDate, viewMode]);

  const { data: jobs, isLoading, error } = useQuery<JobWithClient[]>({
    queryKey: ['jobs', rangeStart, rangeEnd],
    queryFn: async () => {
      const mock = getAuditJobs();
      if (mock) {
        return withScheduleJobPatches(attachJobClients(mock as Job[], getAuditClients() ?? []));
      }
      const [rangedRes, undatedRes] = await Promise.all([
        supabase
          .from('jobs')
          .select('*')
          .gte('scheduled_date', rangeStart)
          .lte('scheduled_date', rangeEnd)
          .order('start_time', { ascending: true, nullsFirst: false }),
        supabase
          .from('jobs')
          .select('*')
          .is('scheduled_date', null)
          .in('status', ['scheduled', 'in_progress']),
      ]);
      if (rangedRes.error) throw rangedRes.error;
      if (undatedRes.error) throw undatedRes.error;

      const byId = new Map<string, Job>();
      for (const row of [...(rangedRes.data ?? []), ...(undatedRes.data ?? [])]) {
        byId.set(row.id, row as Job);
      }
      const jobs = [...byId.values()];

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

      return attachJobClients(jobs, [...clientMap.values()]);
    },
    enabled: !!profile,
  });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(jobQuery.trim()), 200);
    return () => window.clearTimeout(t);
  }, [jobQuery]);

  const { data: searchHits = [], isFetching: searchLoading } = useQuery({
    queryKey: ['schedule-job-search', debouncedQuery],
    queryFn: () => searchScheduleJobs(debouncedQuery),
    enabled: !!profile && debouncedQuery.length > 0,
  });

  useEffect(() => {
    if (preselectClient) {
      setPresetClientId(preselectClient);
      setShowForm(true);
      setSearchParams({}, { replace: true });
    }
  }, [preselectClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const rescheduleJob = useMutation({
    mutationFn: async ({ jobId, date, employeeId, startTime }: JobDropPayload) => {
      if (isDevFieldAuditAuth()) {
        queryClient.setQueryData<JobWithClient[]>(['jobs', rangeStart, rangeEnd], prev => {
          const list = prev ?? [];
          const fromAudit = withScheduleJobPatches(attachJobClients(
            ((getAuditJobs() as Job[] | null) ?? []).filter(j => j.id === jobId),
            getAuditClients() ?? [],
          ))[0];
          const current = list.find(j => j.id === jobId)
            ?? searchHits.find(j => j.id === jobId)
            ?? fromAudit;
          if (!current) return list;
          const patch = rescheduleJobPatch({
            assigned_team: current.assigned_team,
            start_time: current.start_time,
            end_time: current.end_time,
          }, { date, employeeId, startTime });
          const next = { ...current, ...patch };
          mergeScheduleJobPatch(jobId, next);
          return [...list.filter(j => j.id !== jobId), next];
        });
        return;
      }
      const { data: current, error: loadError } = await supabase
        .from('jobs')
        .select('assigned_team, start_time, end_time')
        .eq('id', jobId)
        .maybeSingle();
      if (loadError) throw loadError;
      if (!current) throw new Error('Job not found');

      const updates = {
        ...rescheduleJobPatch({
          assigned_team: current.assigned_team,
          start_time: current.start_time,
          end_time: current.end_time,
        }, { date, employeeId, startTime }),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('jobs').update(updates).eq('id', jobId);
      if (error) throw error;
      if (updates.assigned_team) {
        await persistLivingJobOnBoundJhas(jobId);
      }
    },
    onSuccess: () => {
      if (isDevFieldAuditAuth()) return;
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['job'] });
      queryClient.invalidateQueries({ queryKey: ['jobs-all'] });
      queryClient.invalidateQueries({ queryKey: ['jha-documents'] });
      queryClient.invalidateQueries({ queryKey: ['job-take5s'] });
      queryClient.invalidateQueries({ queryKey: ['jha-take5-all'] });
      queryClient.invalidateQueries({ queryKey: ['jha-take5-list'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-job-search'] });
    },
  });

  const resizeJob = useMutation({
    mutationFn: async ({ jobId, startTime, endTime }: { jobId: string; startTime: string; endTime: string }) => {
      if (isDevFieldAuditAuth()) {
        queryClient.setQueryData<JobWithClient[]>(['jobs', rangeStart, rangeEnd], prev =>
          (prev ?? []).map(j => {
            if (j.id !== jobId) return j;
            const next = { ...j, start_time: startTime, end_time: endTime };
            mergeScheduleJobPatch(jobId, next);
            return next;
          }),
        );
        return;
      }
      const { error } = await supabase.from('jobs').update({
        start_time: startTime,
        end_time: endTime,
        updated_at: new Date().toISOString(),
      }).eq('id', jobId);
      if (error) throw error;
    },
    onSuccess: () => {
      if (isDevFieldAuditAuth()) return;
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['job'] });
      queryClient.invalidateQueries({ queryKey: ['jobs-all'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-job-search'] });
    },
  });

  const handlePickJob = useCallback((job: JobWithClient | null) => {
    setPickedJob(job);
  }, []);

  const handleRailDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData('text/plain', jobId);
    e.dataTransfer.effectAllowed = 'move';
    rememberDraggedJob(jobId);
  };

  const placePickedOnPerson = (employeeId: string) => {
    if (!pickedJob) return;
    rescheduleJob.mutate({
      jobId: pickedJob.id,
      date: format(currentDate, 'yyyy-MM-dd'),
      employeeId,
      startTime: pickedJob.start_time ? undefined : DEFAULT_SLOT_START,
    });
    setPickedJob(null);
    setJobQuery('');
  };

  const handleDayClick = (dateStr: string, employeeId?: string) => {
    setSelectedDate(dateStr);
    setPresetEmployeeId(employeeId);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setSelectedDate(null);
    setPresetClientId(null);
    setPresetEmployeeId(undefined);
  };

  const toggleEmployeeFilter = (id: string) => {
    setFilteredEmployeeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearEmployeeFilters = () => setFilteredEmployeeIds(new Set());

  const { needsDate, onBoard } = useMemo(
    () => partitionScheduleJobs(jobs ?? []),
    [jobs],
  );

  const unassignedOnBoard = onBoard.filter(j => !(j.assigned_team ?? []).length).length;

  if (pageQueryBlocked(error)) return <AppShell><PageError message="Could not load schedule" /></AppShell>;

  return (
    <AppShell>
      <div className="ops-page hub-board-cal">
        <div className="ops-page-head">
          <div className="min-w-0">
            <h1 className="ops-page-title">Schedule</h1>
            <p className="ops-meta mt-0.5">
              {onBoard.length} on the board
              {unassignedOnBoard > 0 ? ` · ${unassignedOnBoard} unassigned` : ''}
              {needsDate.length > 0 ? ` · ${needsDate.length} without a date` : ''}
              {viewMode === 'day' && ` · ${format(currentDate, 'EEEE, d MMMM yyyy')}`}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap min-w-0 w-full lg:w-auto lg:flex-1 lg:justify-end">
            <ScheduleJobSearch
              query={jobQuery}
              onQuery={setJobQuery}
              results={searchHits}
              loading={searchLoading && debouncedQuery.length > 0}
              selectedId={pickedJob?.id ?? null}
              onSelect={handlePickJob}
              onDragStart={handleRailDragStart}
            />
            <button
              onClick={() => {
                setSelectedDate(format(currentDate, 'yyyy-MM-dd'));
                setPresetEmployeeId(undefined);
                setShowForm(true);
              }}
              className="btn-primary shrink-0"
            >
              <Plus size={16} /> New Job
            </button>
          </div>
        </div>

        {pickedJob && (teamMembers ?? []).length > 0 && (
          <div className="lg:hidden ops-card p-3 mb-3">
            <p className="text-sm font-medium text-navy">
              {pickedJob.title} — tap a person to place it today at 8:00
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {(teamMembers ?? []).map(m => (
                <button
                  key={m.id}
                  type="button"
                  className="btn-secondary"
                  onClick={() => placePickedOnPerson(m.id)}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentDate(new Date())}
              className="btn-secondary">
              Today
            </button>
            <div className="flex items-center">
              <button
                onClick={() => setCurrentDate(d =>
                  viewMode === 'day' ? addDays(d, -1) : addWeeks(d, -1)
                )}
                className="w-11 h-11 flex items-center justify-center rounded-l-md border border-rule hover:bg-zebra text-muted"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentDate(d =>
                  viewMode === 'day' ? addDays(d, 1) : addWeeks(d, 1)
                )}
                className="w-11 h-11 flex items-center justify-center rounded-r-md border-y border-r border-rule hover:bg-zebra text-muted"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <h2 className="ops-section-title ml-1">
              {viewMode === 'day' && format(currentDate, 'd MMMM yyyy')}
              {viewMode === 'week' && `${format(startOfWeek(currentDate, { weekStartsOn: 1 }), 'd MMM')} – ${format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'd MMM yyyy')}`}
            </h2>
          </div>

          <div className="hidden lg:flex ops-seg">
            {([
              { mode: 'day' as const, label: 'Day', Icon: Columns3 },
              { mode: 'week' as const, label: 'Week', Icon: CalIcon },
            ]).map(({ mode, label, Icon }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`ops-seg-btn ${viewMode === mode ? 'ops-seg-btn-on' : 'ops-seg-btn-off'}`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {viewMode === 'day' && teamMembers && teamMembers.length > 0 && (
          <div className="hidden lg:flex items-center gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-1.5 ops-meta font-medium">
              <Users size={13} /> Crew
            </div>
            {filteredEmployeeIds.size > 0 && (
              <button onClick={clearEmployeeFilters}
                className="ops-link text-xs">
                <X size={11} /> Show all
              </button>
            )}
            <div className="flex items-center gap-1.5 flex-wrap">
              {teamMembers.map(m => {
                const active = filteredEmployeeIds.size === 0 || filteredEmployeeIds.has(m.id);
                const color = pickEmployeeColor(m.id, m.schedule_color);
                return (
                  <div
                    key={m.id}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border transition-all ${
                      active
                        ? 'border-transparent bg-white'
                        : 'border-rule bg-zebra opacity-50 hover:opacity-80'
                    }`}
                  >
                    <EmployeeColorSwatch
                      name={m.name}
                      color={color}
                      savedColor={m.schedule_color}
                      disabled={colorSavingId === m.id}
                      onPick={hex => void setScheduleColor(m.id, hex)}
                    />
                    <button
                      type="button"
                      onClick={() => toggleEmployeeFilter(m.id)}
                      className="hover:underline"
                      title={active && filteredEmployeeIds.size > 0 ? 'Hide from board' : 'Filter to this person'}
                    >
                      {m.name}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : (
          <>
            <div className="lg:hidden space-y-3">
              <NeedsDateRail
                jobs={needsDate}
                teamMembers={teamMembers ?? []}
                onJobClick={job => navigate(`/jobs/${job.id}`)}
                onDragStart={handleRailDragStart}
              />
              <PhoneDayList
                jobs={onBoard}
                teamMembers={teamMembers ?? []}
                currentDate={currentDate}
                onJobClick={job => navigate(`/jobs/${job.id}`)}
                onDragStart={handleRailDragStart}
              />
            </div>

            <div className="hidden lg:flex items-start gap-3">
              <div className="min-w-0 flex-1">
                {viewMode === 'day' ? (
                  <DayBoardView
                    jobs={onBoard}
                    teamMembers={teamMembers ?? []}
                    currentDate={currentDate}
                    onJobClick={job => navigate(`/jobs/${job.id}`)}
                    onDayClick={handleDayClick}
                    onJobDrop={drop => {
                      rescheduleJob.mutate(drop);
                      setJobQuery('');
                      setPickedJob(null);
                    }}
                    onJobResize={(jobId, startTime, endTime) => resizeJob.mutate({ jobId, startTime, endTime })}
                    filteredEmployeeIds={filteredEmployeeIds}
                  />
                ) : (
                  <WeekBoardView
                    jobs={onBoard}
                    teamMembers={teamMembers ?? []}
                    currentDate={currentDate}
                    onJobClick={job => navigate(`/jobs/${job.id}`)}
                    onDayClick={handleDayClick}
                    onJobDrop={drop => {
                      rescheduleJob.mutate(drop);
                      setJobQuery('');
                      setPickedJob(null);
                    }}
                    filteredEmployeeIds={filteredEmployeeIds}
                  />
                )}
              </div>
              <NeedsDateRail
                className="w-72 shrink-0 sticky top-3"
                alwaysShow
                jobs={needsDate}
                teamMembers={teamMembers ?? []}
                onJobClick={job => navigate(`/jobs/${job.id}`)}
                onDragStart={handleRailDragStart}
              />
            </div>
          </>
        )}
      </div>

      {showForm && (
        <JobFormModal
          job={null}
          presetDate={selectedDate}
          presetClientId={presetClientId}
          presetEmployeeId={presetEmployeeId}
          onClose={handleCloseForm}
          onSaved={(jobId) => {
            handleCloseForm();
            queryClient.invalidateQueries({ queryKey: ['jobs'] });
            queryClient.invalidateQueries({ queryKey: ['jobs-all'] });
            navigate(`/jobs/${jobId}`);
          }}
        />
      )}
    </AppShell>
  );
}
