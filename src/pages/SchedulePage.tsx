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
  DayBoardView, WeekBoardView, NeedsDateRail, PhoneDayList, PhoneWeekList,
  type TeamMember,
} from '../components/crm/BoardViews';
import { pickEmployeeColor } from '../lib/jobColors';
import { DEFAULT_SLOT_START, rememberDraggedJob, rescheduleJobPatch, type JobDropPayload } from '../lib/dispatch';
import { persistLivingJobOnBoundJhas } from '../lib/persistLivingJobJha';
import { partitionScheduleJobs } from '../lib/jobNextAction';
import { attachJobClients, hydrateJobParentNumbers, mergeScheduleJobPatch, searchScheduleJobs, withScheduleJobPatches } from '../lib/scheduleJobSearch';
import { parseScheduleView, scheduleJobHref, SCHEDULE_WEEK_STARTS_ON, type ScheduleViewMode } from '../lib/scheduleBoard';
import { EmployeeColorSwatch } from '../components/crm/EmployeeColorSwatch';
import {
  ChevronDown, ChevronLeft, ChevronRight, Plus, Users, X,
} from 'lucide-react';
import {
  format, startOfWeek, endOfWeek,
  addDays, addWeeks,
} from 'date-fns';

/** Signed week-board frame seed — Schedule look only, not a live company. */
const WEEK_BOARD_LOOK = 'week-board';
const WEEK_BOARD_LOOK_ANCHOR = new Date(2025, 2, 31);
const WEEK_LOOK_DAVE = 'look-crew-dave';
const WEEK_LOOK_JACK = 'look-crew-jack';
const WEEK_LOOK_SAM = 'look-crew-sam';
const WEEK_LOOK_RUST = '#C45C38';
const WEEK_LOOK_NAVY = '#0A2540';

const WEEK_BOARD_LOOK_CREW: TeamMember[] = [
  { id: WEEK_LOOK_DAVE, name: 'Dave', email: 'dave@look.example', schedule_color: null },
  { id: WEEK_LOOK_JACK, name: 'Jack', email: 'jack@look.example', schedule_color: null },
  { id: WEEK_LOOK_SAM, name: 'Sam', email: 'sam@look.example', schedule_color: null },
];

function weekBoardLookJob(
  over: Partial<JobWithClient> & Pick<JobWithClient, 'id' | 'title' | 'scheduled_date' | 'assigned_team' | 'job_number'>,
): JobWithClient {
  return {
    company_id: 'look-week-board',
    client_id: null,
    description: null,
    status: 'scheduled',
    priority: 'medium',
    start_time: '08:00',
    end_time: '16:00',
    address: null,
    inspection_id: null,
    created_by: 'look-week-board',
    created_at: '2025-03-31T00:00:00.000Z',
    updated_at: '2025-03-31T00:00:00.000Z',
    color: null,
    budget: null,
    parent_job_id: null,
    cost_code: null,
    parent_job_number: null,
    ...over,
  };
}

function weekBoardLookJobs(): JobWithClient[] {
  return [
    weekBoardLookJob({
      id: 'look-job-0042-01',
      title: 'Switchboard',
      scheduled_date: '2025-04-01',
      assigned_team: [WEEK_LOOK_DAVE],
      job_number: 42,
      cost_code: '01',
      parent_job_id: 'look-job-0042',
      parent_job_number: 42,
      color: WEEK_LOOK_RUST,
    }),
    weekBoardLookJob({
      id: 'look-job-0042-02',
      title: 'Testing',
      scheduled_date: '2025-04-02',
      assigned_team: [WEEK_LOOK_DAVE],
      job_number: 42,
      cost_code: '02',
      parent_job_id: 'look-job-0042',
      parent_job_number: 42,
      color: WEEK_LOOK_RUST,
    }),
    weekBoardLookJob({
      id: 'look-job-0048',
      title: 'Warehouse lights',
      scheduled_date: '2025-04-03',
      assigned_team: [WEEK_LOOK_JACK],
      job_number: 48,
      color: WEEK_LOOK_NAVY,
    }),
  ];
}

function WeekBoardChrome({
  viewMode,
  setView,
  onToday,
  onPrev,
  onNext,
  rangeLabel,
  crew,
  filteredEmployeeIds,
  onToggleCrew,
  onClearCrew,
}: {
  viewMode: ScheduleViewMode;
  setView: (mode: ScheduleViewMode) => void;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  rangeLabel: string;
  crew: TeamMember[];
  filteredEmployeeIds: Set<string>;
  onToggleCrew: (id: string) => void;
  onClearCrew: () => void;
}) {
  const allCrews = filteredEmployeeIds.size === 0;
  const selectedNames = crew
    .filter(member => filteredEmployeeIds.has(member.id))
    .map(member => member.name)
    .join(', ');

  return (
    <div className="hub-week-chrome">
      <div className="hub-week-seg" data-week-seg="1">
        {([
          { mode: 'day' as const, label: 'Day' },
          { mode: 'week' as const, label: 'Week' },
        ]).map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            onClick={() => setView(mode)}
            className={`hub-week-seg-btn ${viewMode === mode ? 'is-on' : ''}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="hub-week-tools">
        <button type="button" onClick={onToday} className="hub-week-quiet">
          Today
        </button>
        <button
          type="button"
          onClick={onPrev}
          className="hub-week-quiet hub-week-nav"
          aria-label="Previous week"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          onClick={onNext}
          className="hub-week-quiet hub-week-nav"
          aria-label="Next week"
        >
          <ChevronRight size={16} />
        </button>
        <details className="hub-week-crews">
          <summary className="hub-week-quiet">
            <span>{allCrews ? 'All crews' : selectedNames || 'All crews'}</span>
            <ChevronDown size={14} />
          </summary>
          <div className="hub-week-crews-menu">
            {!allCrews && (
              <button type="button" onClick={onClearCrew} className="hub-week-crew-opt">
                All crews
              </button>
            )}
            {crew.map(member => {
              const active = allCrews || filteredEmployeeIds.has(member.id);
              return (
                <button
                  key={member.id}
                  type="button"
                  className={`hub-week-crew-opt ${active ? 'is-on' : ''}`}
                  onClick={() => onToggleCrew(member.id)}
                >
                  {member.name}
                </button>
              );
            })}
          </div>
        </details>
      </div>
      <p className="hub-week-range">{rangeLabel}</p>
    </div>
  );
}

export function SchedulePage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const lookWeekBoard = searchParams.get('look') === WEEK_BOARD_LOOK;
  const [currentDate, setCurrentDate] = useState(() => (
    lookWeekBoard ? WEEK_BOARD_LOOK_ANCHOR : new Date()
  ));
  const [viewMode, setViewMode] = useState<ScheduleViewMode>(() => parseScheduleView(searchParams.get('view')));
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

  const openJob = useCallback((jobId: string) => {
    navigate(scheduleJobHref(jobId));
  }, [navigate]);

  const setView = useCallback((mode: ScheduleViewMode) => {
    setViewMode(mode);
    const next = new URLSearchParams(searchParams);
    if (mode === 'week') next.delete('view');
    else next.set('view', 'day');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (preselectJob) navigate(scheduleJobHref(preselectJob), { replace: true });
  }, [preselectJob, navigate]);

  useEffect(() => {
    if (!preselectDate) return;
    const parsed = new Date(`${preselectDate}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return;
    setCurrentDate(parsed);
    setViewMode('day');
    const next = new URLSearchParams(searchParams);
    next.delete('date');
    next.set('view', 'day');
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

      return hydrateJobParentNumbers(attachJobClients(jobs, [...clientMap.values()]));
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
      const next = new URLSearchParams(searchParams);
      next.delete('client');
      setSearchParams(next, { replace: true });
    }
  }, [preselectClient]); // eslint-disable-line react-hooks/exhaustive-deps

  const applyDropToCache = (drop: JobDropPayload) => {
    queryClient.setQueryData<JobWithClient[]>(['jobs', rangeStart, rangeEnd], prev => {
      const list = prev ?? [];
      const fromAudit = withScheduleJobPatches(attachJobClients(
        (getAuditJobs() as Job[] | null) ?? [],
        getAuditClients() ?? [],
      )).find(j => j.id === drop.jobId);
      const current = list.find(j => j.id === drop.jobId)
        ?? searchHits.find(j => j.id === drop.jobId)
        ?? (pickedJob?.id === drop.jobId ? pickedJob : undefined)
        ?? fromAudit;
      if (!current) return list;
      const patch = rescheduleJobPatch({
        assigned_team: current.assigned_team,
        start_time: current.start_time,
        end_time: current.end_time,
      }, drop);
      const next = { ...current, ...patch };
      mergeScheduleJobPatch(drop.jobId, next);
      return [...list.filter(j => j.id !== drop.jobId), next];
    });
  };

  const rescheduleJob = useMutation({
    mutationFn: async (drop: JobDropPayload) => {
      applyDropToCache(drop);
      if (isDevFieldAuditAuth()) return;

      const { data: current, error: loadError } = await supabase
        .from('jobs')
        .select('assigned_team, start_time, end_time')
        .eq('id', drop.jobId)
        .maybeSingle();
      if (loadError) throw loadError;
      if (!current) throw new Error('Job not found');

      const updates = {
        ...rescheduleJobPatch({
          assigned_team: current.assigned_team,
          start_time: current.start_time,
          end_time: current.end_time,
        }, drop),
        updated_at: new Date().toISOString(),
      };
      const { error } = await supabase.from('jobs').update(updates).eq('id', drop.jobId);
      if (error) throw error;
      if (updates.assigned_team) {
        await persistLivingJobOnBoundJhas(drop.jobId);
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
    rememberDraggedJob(jobId, { exclusiveAssign: true });
  };

  const placePickedOnPerson = (employeeId: string) => {
    if (!pickedJob) return;
    rescheduleJob.mutate({
      jobId: pickedJob.id,
      date: format(currentDate, 'yyyy-MM-dd'),
      employeeId,
      startTime: pickedJob.start_time ? undefined : DEFAULT_SLOT_START,
      exclusiveAssign: true,
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

  const lookJobs = useMemo(() => (lookWeekBoard ? weekBoardLookJobs() : null), [lookWeekBoard]);
  const boardJobs = lookJobs ?? jobs ?? [];
  const boardCrew = lookWeekBoard ? WEEK_BOARD_LOOK_CREW : (teamMembers ?? []);

  useEffect(() => {
    if (lookWeekBoard) setCurrentDate(WEEK_BOARD_LOOK_ANCHOR);
  }, [lookWeekBoard]);

  const { needsDate, onBoard } = useMemo(
    () => partitionScheduleJobs(boardJobs),
    [boardJobs],
  );

  const weekRangeLabel = `${format(startOfWeek(currentDate, { weekStartsOn: SCHEDULE_WEEK_STARTS_ON }), 'EEE d MMM')} – ${format(endOfWeek(currentDate, { weekStartsOn: SCHEDULE_WEEK_STARTS_ON }), 'EEE d MMM yyyy')}`;

  const unassignedOnBoard = onBoard.filter(j => !(j.assigned_team ?? []).length).length;

  if (pageQueryBlocked(error)) return <AppShell><PageError message="Could not load schedule" /></AppShell>;

  return (
    <AppShell>
      <div className="ops-page hub-board-cal" data-schedule-view={viewMode}>
        <div className="ops-page-head">
          <div className="min-w-0">
            <h1 className="ops-page-title">Schedule</h1>
            <p className="ops-meta mt-2">
              {onBoard.length} on the board
              {unassignedOnBoard > 0 ? ` · ${unassignedOnBoard} unassigned` : ''}
              {needsDate.length > 0 ? ` · ${needsDate.length} without a date` : ''}
              {viewMode === 'day'
                ? ` · ${format(currentDate, 'EEEE, d MMMM yyyy')}`
                : ` · week of ${format(startOfWeek(currentDate, { weekStartsOn: SCHEDULE_WEEK_STARTS_ON }), 'd MMM')}`}
            </p>
          </div>
          <button
            onClick={() => {
              setSelectedDate(format(currentDate, 'yyyy-MM-dd'));
              setPresetEmployeeId(undefined);
              setShowForm(true);
            }}
            className="btn-primary shrink-0"
          >
            <Plus size={16} /> New job
          </button>
        </div>

        <div className="hub-schedule-chrome">
          {viewMode === 'day' && (
            <div className="hub-schedule-filters" data-schedule-view={viewMode}>
              {([
                { mode: 'week' as const, label: 'Week' },
                { mode: 'day' as const, label: 'Day' },
              ]).map(({ mode, label }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setView(mode)}
                  className={`hub-chrome-filter ${viewMode === mode ? 'hub-chrome-filter-on' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          <ScheduleJobSearch
            query={jobQuery}
            onQuery={setJobQuery}
            results={searchHits}
            loading={searchLoading && debouncedQuery.length > 0}
            selectedId={pickedJob?.id ?? null}
            onSelect={handlePickJob}
            onOpenJob={job => openJob(job.id)}
            onDragStart={handleRailDragStart}
          />
        </div>

        {pickedJob && boardCrew.length > 0 && (
          <div className="lg:hidden hub-schedule-sheet hub-schedule-place mb-4">
            <p className="text-sm font-medium">
              {pickedJob.title} — tap a person to place it today at 8:00
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {boardCrew.map(m => (
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

        {viewMode === 'day' && (
          <>
            <div className="hub-schedule-toolbar">
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <button onClick={() => setCurrentDate(new Date())}
                  className="btn-secondary">
                  Today
                </button>
                <div className="hub-schedule-stepper">
                  <button
                    type="button"
                    onClick={() => setCurrentDate(d => addDays(d, -1))}
                    className="hub-schedule-step"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentDate(d => addDays(d, 1))}
                    className="hub-schedule-step"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <h2 className="hub-schedule-range">
                  {format(currentDate, 'd MMMM yyyy')}
                </h2>
              </div>
            </div>

            {boardCrew.length > 0 && (
              <div className="hidden lg:flex items-center gap-2 mb-4 flex-wrap hub-schedule-crew-row">
                <div className="hub-schedule-label flex items-center gap-1.5">
                  <Users size={13} /> Crew
                </div>
                {filteredEmployeeIds.size > 0 && (
                  <button onClick={clearEmployeeFilters}
                    className="ops-link text-xs">
                    <X size={11} /> Show all
                  </button>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  {boardCrew.map(m => {
                    const active = filteredEmployeeIds.size === 0 || filteredEmployeeIds.has(m.id);
                    const color = pickEmployeeColor(m.id, m.schedule_color);
                    return (
                      <div
                        key={m.id}
                        className={`hub-schedule-crew ${active ? 'is-on' : 'is-off'}`}
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
          </>
        )}

        {!lookWeekBoard && isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : viewMode === 'week' ? (
          <>
            <div className="lg:hidden space-y-4 hub-schedule-phone">
              <NeedsDateRail
                jobs={needsDate}
                teamMembers={boardCrew}
                onJobClick={job => openJob(job.id)}
                onDragStart={handleRailDragStart}
              />
              <div className="hub-week-sheet" data-week-sheet="1">
                <WeekBoardChrome
                  viewMode={viewMode}
                  setView={setView}
                  onToday={() => setCurrentDate(new Date())}
                  onPrev={() => setCurrentDate(d => addWeeks(d, -1))}
                  onNext={() => setCurrentDate(d => addWeeks(d, 1))}
                  rangeLabel={weekRangeLabel}
                  crew={boardCrew}
                  filteredEmployeeIds={filteredEmployeeIds}
                  onToggleCrew={toggleEmployeeFilter}
                  onClearCrew={clearEmployeeFilters}
                />
                <PhoneWeekList
                  jobs={onBoard}
                  teamMembers={boardCrew}
                  currentDate={currentDate}
                  onJobClick={job => openJob(job.id)}
                  onDragStart={handleRailDragStart}
                  onSelectDay={date => {
                    setCurrentDate(date);
                    setView('day');
                  }}
                  onDayClick={handleDayClick}
                  onJobDrop={drop => {
                    rescheduleJob.mutate(drop);
                    setJobQuery('');
                    setPickedJob(null);
                  }}
                />
              </div>
            </div>

            <div className="hidden lg:flex items-start gap-3 hub-schedule-desk">
              <div className="hub-week-sheet min-w-0 flex-1" data-week-sheet="1">
                <WeekBoardChrome
                  viewMode={viewMode}
                  setView={setView}
                  onToday={() => setCurrentDate(new Date())}
                  onPrev={() => setCurrentDate(d => addWeeks(d, -1))}
                  onNext={() => setCurrentDate(d => addWeeks(d, 1))}
                  rangeLabel={weekRangeLabel}
                  crew={boardCrew}
                  filteredEmployeeIds={filteredEmployeeIds}
                  onToggleCrew={toggleEmployeeFilter}
                  onClearCrew={clearEmployeeFilters}
                />
                <WeekBoardView
                  jobs={onBoard}
                  teamMembers={boardCrew}
                  currentDate={currentDate}
                  onJobClick={job => openJob(job.id)}
                  onDayClick={handleDayClick}
                  onJobDrop={drop => {
                    rescheduleJob.mutate(drop);
                    setJobQuery('');
                    setPickedJob(null);
                  }}
                  filteredEmployeeIds={filteredEmployeeIds}
                />
              </div>
              <NeedsDateRail
                className="w-72 shrink-0 sticky top-3"
                jobs={needsDate}
                teamMembers={boardCrew}
                onJobClick={job => openJob(job.id)}
                onDragStart={handleRailDragStart}
              />
            </div>
          </>
        ) : (
          <>
            <div className="lg:hidden space-y-4 hub-schedule-phone">
              <NeedsDateRail
                jobs={needsDate}
                teamMembers={boardCrew}
                onJobClick={job => openJob(job.id)}
                onDragStart={handleRailDragStart}
              />
              <div className="hub-schedule-sheet">
                <PhoneDayList
                  jobs={onBoard}
                  teamMembers={boardCrew}
                  currentDate={currentDate}
                  onJobClick={job => openJob(job.id)}
                  onDragStart={handleRailDragStart}
                />
              </div>
            </div>

            <div className="hidden lg:flex items-start gap-3 hub-schedule-desk">
              <div className="min-w-0 flex-1">
                <DayBoardView
                  jobs={onBoard}
                  teamMembers={boardCrew}
                  currentDate={currentDate}
                  onJobClick={job => openJob(job.id)}
                  onDayClick={handleDayClick}
                  onJobDrop={drop => {
                    rescheduleJob.mutate(drop);
                    setJobQuery('');
                    setPickedJob(null);
                  }}
                  onJobResize={(jobId, startTime, endTime) => resizeJob.mutate({ jobId, startTime, endTime })}
                  filteredEmployeeIds={filteredEmployeeIds}
                />
              </div>
              <NeedsDateRail
                className="w-72 shrink-0 sticky top-3"
                alwaysShow
                jobs={needsDate}
                teamMembers={boardCrew}
                onJobClick={job => openJob(job.id)}
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
            navigate(scheduleJobHref(jobId));
          }}
        />
      )}
    </AppShell>
  );
}
