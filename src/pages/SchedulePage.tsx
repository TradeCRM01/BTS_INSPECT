import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import type { Job, JobWithClient, Client } from '../types/crm';
import { JobFormModal } from '../components/crm/JobFormModal';
import {
  DayBoardView, WeekBoardView, NeedsDateRail, PhoneDayList,
  type TeamMember,
} from '../components/crm/BoardViews';
import { pickEmployeeColor } from '../lib/jobColors';
import { rescheduleJobPatch, type JobDropPayload } from '../lib/dispatch';
import { persistLivingJobOnBoundJhas } from '../lib/persistLivingJobJha';
import { partitionScheduleJobs } from '../lib/jobNextAction';
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

function attachClients(jobs: Job[], clientMap: Map<string, Client>): JobWithClient[] {
  return jobs.map(j => ({
    ...j,
    client_name: j.client_id ? clientMap.get(j.client_id)?.name ?? null : null,
    client_phone: j.client_id ? clientMap.get(j.client_id)?.phone ?? null : null,
    client_address: j.client_id ? clientMap.get(j.client_id)?.address ?? null : null,
  }));
}

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

      return attachClients(jobs, clientMap);
    },
    enabled: !!profile,
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
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['job'] });
      queryClient.invalidateQueries({ queryKey: ['jobs-all'] });
      queryClient.invalidateQueries({ queryKey: ['jha-documents'] });
    },
  });

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

  const handleRailDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData('text/plain', jobId);
    e.dataTransfer.effectAllowed = 'move';
  };

  if (error) return <AppShell><PageError message="Could not load schedule" /></AppShell>;

  return (
    <AppShell>
      <div className="ops-page">
        <div className="ops-page-head">
          <div>
            <h1 className="ops-page-title">Schedule</h1>
            <p className="ops-meta mt-0.5">
              {onBoard.length} on the board
              {unassignedOnBoard > 0 ? ` · ${unassignedOnBoard} unassigned` : ''}
              {needsDate.length > 0 ? ` · ${needsDate.length} without a date` : ''}
              {viewMode === 'day' && ` · ${format(currentDate, 'EEEE, d MMMM yyyy')}`}
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedDate(format(currentDate, 'yyyy-MM-dd'));
              setPresetEmployeeId(undefined);
              setShowForm(true);
            }}
            className="btn-primary"
          >
            <Plus size={16} /> New Job
          </button>
        </div>

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
                    onJobDrop={drop => rescheduleJob.mutate(drop)}
                    filteredEmployeeIds={filteredEmployeeIds}
                  />
                ) : (
                  <WeekBoardView
                    jobs={onBoard}
                    teamMembers={teamMembers ?? []}
                    currentDate={currentDate}
                    onJobClick={job => navigate(`/jobs/${job.id}`)}
                    onDayClick={handleDayClick}
                    onJobDrop={drop => rescheduleJob.mutate(drop)}
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
