import { useState, useMemo, useEffect, useCallback, useRef, type ReactNode } from 'react';
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
import { placePickedHint, placePickedOnCell, rememberDraggedJob, rescheduleJobPatch, type JobDropPayload } from '../lib/dispatch';
import { persistLivingJobOnBoundJhas } from '../lib/persistLivingJobJha';
import { partitionScheduleJobs } from '../lib/jobNextAction';
import { attachJobClients, hydrateJobParentNumbers, mergeScheduleJobPatch, searchScheduleJobs, withScheduleJobPatches } from '../lib/scheduleJobSearch';
import { parseScheduleView, scheduleDayKey, scheduleJobHref, SCHEDULE_WEEK_STARTS_ON, type ScheduleViewMode } from '../lib/scheduleBoard';
import {
  ChevronLeft, ChevronRight, MoreHorizontal, Plus,
} from 'lucide-react';
import {
  format, startOfWeek, endOfWeek,
  addDays, addWeeks,
} from 'date-fns';

/** Signed week-board frame seed — Schedule look only, not a live company. */
const WEEK_BOARD_LOOK = 'week-board';
const WEEK_BOARD_LOOK_ANCHOR = new Date(2025, 2, 31);
const WEEK_BOARD_LOOK_DAY_ANCHOR = new Date(2025, 3, 1);
const WEEK_LOOK_DAVE = 'look-crew-dave';
const WEEK_LOOK_JACK = 'look-crew-jack';
const WEEK_LOOK_SAM = 'look-crew-sam';
const WEEK_LOOK_FAMILY = '#F7931A';
const WEEK_LOOK_OTHER = '#7C3AED';
const WEEK_LOOK_WATER = '#0891B2';
const WEEK_LOOK_FIT = '#DB2777';
const WEEK_LOOK_MEASURE = '#CA8A04';
const WEEK_LOOK_CALLBACK = '#2E75B6';
const WEEK_LOOK_INK = '#0A2540';

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
      id: 'look-job-0039',
      title: 'Site measure',
      scheduled_date: '2025-03-31',
      assigned_team: [WEEK_LOOK_SAM],
      job_number: 39,
      start_time: '08:00',
      end_time: '11:00',
      color: WEEK_LOOK_MEASURE,
    }),
    weekBoardLookJob({
      id: 'look-job-0042-01',
      title: 'Switchboard',
      scheduled_date: '2025-04-01',
      assigned_team: [WEEK_LOOK_DAVE],
      job_number: 42,
      cost_code: '01',
      parent_job_id: 'look-job-0042',
      parent_job_number: 42,
      start_time: '08:00',
      end_time: '12:00',
      color: WEEK_LOOK_FAMILY,
    }),
    weekBoardLookJob({
      id: 'look-job-0051',
      title: 'Hot water',
      scheduled_date: '2025-04-01',
      assigned_team: [WEEK_LOOK_JACK],
      job_number: 51,
      start_time: null,
      end_time: null,
      color: WEEK_LOOK_WATER,
    }),
    weekBoardLookJob({
      id: 'look-job-0052',
      title: 'Kitchen fit',
      scheduled_date: '2025-04-01',
      assigned_team: [WEEK_LOOK_SAM],
      job_number: 52,
      start_time: '10:00',
      end_time: '15:00',
      address: null,
      color: WEEK_LOOK_FIT,
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
      start_time: '08:00',
      end_time: '16:00',
      color: WEEK_LOOK_FAMILY,
    }),
    weekBoardLookJob({
      id: 'look-job-0048',
      title: 'Warehouse lights',
      scheduled_date: '2025-04-03',
      assigned_team: [WEEK_LOOK_JACK],
      job_number: 48,
      start_time: '08:00',
      end_time: '16:00',
      color: WEEK_LOOK_OTHER,
    }),
    weekBoardLookJob({
      id: 'look-job-0055',
      title: 'Install 2x new switchboards',
      scheduled_date: '2025-04-04',
      assigned_team: [WEEK_LOOK_DAVE],
      job_number: 55,
      start_time: '08:00',
      end_time: '10:00',
      color: WEEK_LOOK_CALLBACK,
    }),
  ];
}

function WeekBoardMore({
  viewMode,
  setView,
  onToday,
  onPrev,
  onNext,
  rangeLabel,
  search,
  filtered,
  onClearCrew,
}: {
  viewMode: ScheduleViewMode;
  setView: (mode: ScheduleViewMode) => void;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  rangeLabel: string;
  search: ReactNode;
  filtered: boolean;
  onClearCrew: () => void;
}) {
  const moreRef = useRef<HTMLDetailsElement>(null);

  const closeMore = () => {
    if (moreRef.current) moreRef.current.open = false;
  };

  const placeMoreMenu = () => {
    const more = moreRef.current;
    const menu = more?.querySelector('.hub-week-more-menu') as HTMLElement | null;
    const paper = more?.closest('.hub-week-document') as HTMLElement | null;
    if (!more || !menu || !paper) return;
    more.classList.remove('is-flip', 'is-shift');
    menu.style.removeProperty('--hub-week-more-shift');
    if (!more.open) return;
    const pad = 8;
    const paperRect = paper.getBoundingClientRect();
    const viewBottom = window.innerHeight - pad;
    const menuRect = menu.getBoundingClientRect();
    if (menuRect.bottom > Math.min(paperRect.bottom - pad, viewBottom)) {
      more.classList.add('is-flip');
    }
    const after = menu.getBoundingClientRect();
    let shift = 0;
    if (after.right > paperRect.right - pad) shift = paperRect.right - pad - after.right;
    if (after.left + shift < paperRect.left + pad) shift = paperRect.left + pad - after.left;
    if (shift !== 0) {
      more.classList.add('is-shift');
      menu.style.setProperty('--hub-week-more-shift', `${Math.round(shift)}px`);
    }
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
    <details ref={moreRef} className="hub-week-crews hub-week-more">
      <summary className="hub-week-quiet" aria-label="More">
        <MoreHorizontal size={18} />
      </summary>
      <div className="hub-week-crews-menu hub-week-more-menu" role="menu">
        <div className="hub-week-search hub-schedule-chrome">
          {search}
        </div>
        <p className="hub-week-more-range">{rangeLabel}</p>
        <button
          type="button"
          role="menuitem"
          className="hub-week-crew-opt"
          onClick={() => { onToday(); closeMore(); }}
        >
          Today
        </button>
        <button
          type="button"
          role="menuitem"
          className="hub-week-crew-opt"
          onClick={() => { onPrev(); closeMore(); }}
        >
          Previous week
        </button>
        <button
          type="button"
          role="menuitem"
          className="hub-week-crew-opt"
          onClick={() => { onNext(); closeMore(); }}
        >
          Next week
        </button>
        <div className="hub-week-seg" data-week-seg="1">
          <button
            type="button"
            role="menuitem"
            className={`hub-week-crew-opt ${viewMode === 'day' ? 'is-on' : ''}`}
            onClick={() => { setView('day'); closeMore(); }}
          >
            Day
          </button>
          <button
            type="button"
            role="menuitem"
            className={`hub-week-crew-opt ${viewMode === 'week' ? 'is-on' : ''}`}
            onClick={() => { setView('week'); closeMore(); }}
          >
            Week
          </button>
        </div>
        {filtered && (
          <button
            type="button"
            role="menuitem"
            className="hub-week-crew-opt"
            onClick={() => { onClearCrew(); closeMore(); }}
          >
            All crews
          </button>
        )}
      </div>
    </details>
  );
}

function WeekBoardChrome() {
  return <div className="hub-week-chrome hub-week-identity" hidden style={{ color: WEEK_LOOK_INK }} />;
}

function WeekBoardDocument({
  mark,
  whisper,
  rangeLabel,
  onNewJob,
  crews,
  track,
  children,
}: {
  mark: string;
  whisper: string;
  rangeLabel: string;
  onNewJob: () => void;
  crews: ReactNode;
  track: ReactNode;
  children: ReactNode;
}) {
  return (
    <article className="hub-week-sheet hub-week-document" data-week-sheet="1">
      <WeekBoardChrome />
      <header className="hub-week-sheet-bar">
        {mark === 'Day'
          ? <span className="hub-week-sheet-mark">Day</span>
          : <span className="hub-week-sheet-mark">Week</span>}
        <p className="hub-week-range">{rangeLabel}</p>
      </header>
      <div className="hub-week-sheet-body">
        <div className="hub-week-identity-row">
          <div className="hub-week-identity-col">
            <h1 className="hub-week-hero">Schedule</h1>
            <p className="hub-week-status-whisper">{whisper}</p>
          </div>
          <div className="hub-week-page-tools">
            <button type="button" onClick={onNewJob} className="btn-primary">
              <Plus size={16} /> New job
            </button>
            <div className="hub-week-tools-overflow">
              {crews}
            </div>
          </div>
        </div>
        {track}
        {children}
      </div>
    </article>
  );
}

export function SchedulePage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const lookWeekBoard = searchParams.get('look') === WEEK_BOARD_LOOK;
  const [currentDate, setCurrentDate] = useState(() => {
    if (!lookWeekBoard) return new Date();
    return parseScheduleView(searchParams.get('view')) === 'day'
      ? WEEK_BOARD_LOOK_DAY_ANCHOR
      : WEEK_BOARD_LOOK_ANCHOR;
  });
  const [viewMode, setViewMode] = useState<ScheduleViewMode>(() => parseScheduleView(searchParams.get('view')));
  const [showForm, setShowForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [presetClientId, setPresetClientId] = useState<string | null>(null);
  const [presetEmployeeId, setPresetEmployeeId] = useState<string | undefined>(undefined);
  const [filteredEmployeeIds, setFilteredEmployeeIds] = useState<Set<string>>(new Set());
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
        return [
          ...mock.map(m => ({
            id: m.id,
            name: m.name,
            email: m.email,
            schedule_color: null,
          })),
          { id: 'audit-crew-sam', name: 'Sam', email: 'sam@field-audit.example.com', schedule_color: null },
        ];
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
    rememberDraggedJob(jobId);
  };

  const placeExisting = (drop: JobDropPayload) => {
    rescheduleJob.mutate(drop);
    setJobQuery('');
    setPickedJob(null);
  };

  const placePickedOnPerson = (employeeId: string) => {
    if (!pickedJob) return;
    placeExisting(placePickedOnCell(pickedJob, format(currentDate, 'yyyy-MM-dd'), employeeId));
  };

  const handleDayClick = (dateStr: string, employeeId?: string | null) => {
    if (pickedJob) {
      placeExisting(placePickedOnCell(pickedJob, dateStr, employeeId ?? null));
      return;
    }
    setSelectedDate(dateStr);
    setPresetEmployeeId(employeeId ?? undefined);
    setShowForm(true);
  };

  const handleCloseForm = () => {
    setShowForm(false);
    setSelectedDate(null);
    setPresetClientId(null);
    setPresetEmployeeId(undefined);
  };

  const clearEmployeeFilters = () => setFilteredEmployeeIds(new Set());

  const boardJobs = useMemo(
    () => (lookWeekBoard ? weekBoardLookJobs() : (jobs ?? [])),
    [lookWeekBoard, jobs],
  );
  const boardCrew = lookWeekBoard ? WEEK_BOARD_LOOK_CREW : (teamMembers ?? []);

  useEffect(() => {
    if (!lookWeekBoard) return;
    setCurrentDate(viewMode === 'day' ? WEEK_BOARD_LOOK_DAY_ANCHOR : WEEK_BOARD_LOOK_ANCHOR);
  }, [lookWeekBoard, viewMode]);

  const { needsDate, onBoard } = useMemo(
    () => partitionScheduleJobs(boardJobs),
    [boardJobs],
  );

  const weekRangeLabel = `${format(startOfWeek(currentDate, { weekStartsOn: SCHEDULE_WEEK_STARTS_ON }), 'EEE d MMM')} – ${format(endOfWeek(currentDate, { weekStartsOn: SCHEDULE_WEEK_STARTS_ON }), 'EEE d MMM yyyy')}`;
  const dayRangeLabel = format(currentDate, 'EEE d MMM yyyy');
  const unassignedOnBoard = onBoard.filter(j => !(j.assigned_team ?? []).length).length;
  const weekWhisper = [
    `${onBoard.length} on the board`,
    unassignedOnBoard > 0 ? `${unassignedOnBoard} unassigned` : '',
    needsDate.length > 0 ? `${needsDate.length} without a date` : '',
    `week of ${format(startOfWeek(currentDate, { weekStartsOn: SCHEDULE_WEEK_STARTS_ON }), 'd MMM')}`,
  ].filter(Boolean).join(' · ');
  const dayOnBoard = onBoard.filter(job => (
    scheduleDayKey(job.scheduled_date) === format(currentDate, 'yyyy-MM-dd')
  )).length;
  const dayWhisper = [
    `${dayOnBoard} on the board`,
    format(currentDate, 'EEEE, d MMMM yyyy'),
  ].join(' · ');
  const boardWhisper = viewMode === 'day' ? dayWhisper : weekWhisper;
  const boardRangeLabel = viewMode === 'day' ? dayRangeLabel : weekRangeLabel;

  const openNewJob = () => {
    setSelectedDate(format(currentDate, 'yyyy-MM-dd'));
    setPresetEmployeeId(undefined);
    setShowForm(true);
  };

  const weekSearch = (
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
  );

  const weekCrews = (
    <WeekBoardMore
      viewMode={viewMode}
      setView={setView}
      onToday={() => setCurrentDate(new Date())}
      onPrev={() => setCurrentDate(d => (viewMode === 'day' ? addDays(d, -1) : addWeeks(d, -1)))}
      onNext={() => setCurrentDate(d => (viewMode === 'day' ? addDays(d, 1) : addWeeks(d, 1)))}
      rangeLabel={boardRangeLabel}
      search={weekSearch}
      filtered={filteredEmployeeIds.size > 0}
      onClearCrew={clearEmployeeFilters}
    />
  );

  const boardTrack = (
    <div className="hub-week-track" data-week-track="1">
      <div className="hub-week-seg" data-week-seg="1">
        <button
          type="button"
          className={`hub-week-seg-btn ${viewMode === 'week' ? 'is-on' : ''}`}
          onClick={() => setView('week')}
        >
          Week
        </button>
        <button
          type="button"
          className={`hub-week-seg-btn ${viewMode === 'day' ? 'is-on' : ''}`}
          onClick={() => setView('day')}
        >
          Day
        </button>
      </div>
      <div className="hub-week-tools">
        <button type="button" className="hub-week-quiet" onClick={() => setCurrentDate(new Date())}>
          Today
        </button>
        <button
          type="button"
          className="hub-week-quiet"
          aria-label={viewMode === 'day' ? 'Previous day' : 'Previous week'}
          onClick={() => setCurrentDate(d => (viewMode === 'day' ? addDays(d, -1) : addWeeks(d, -1)))}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          type="button"
          className="hub-week-quiet"
          aria-label={viewMode === 'day' ? 'Next day' : 'Next week'}
          onClick={() => setCurrentDate(d => (viewMode === 'day' ? addDays(d, 1) : addWeeks(d, 1)))}
        >
          <ChevronRight size={16} />
        </button>
        <p className="hub-week-range">{boardRangeLabel}</p>
      </div>
    </div>
  );

  if (pageQueryBlocked(error)) return <AppShell><PageError message="Could not load schedule" /></AppShell>;

  return (
    <AppShell>
      <div className="ops-page hub-board-cal is-week-doc" data-schedule-view={viewMode}>
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
            onClick={openNewJob}
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
              {placePickedHint(pickedJob.title, currentDate, pickedJob.start_time)}
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

        {!lookWeekBoard && isLoading ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : (
          <>
            <div className="hub-schedule-desk hub-schedule-phone">
              <WeekBoardDocument
                mark={viewMode === 'day' ? 'Day' : 'Week'}
                whisper={boardWhisper}
                rangeLabel={boardRangeLabel}
                onNewJob={openNewJob}
                crews={weekCrews}
                track={boardTrack}
              >
                {pickedJob && boardCrew.length > 0 && (
                  <div className="hub-week-place hub-schedule-place">
                    <p>
                      {placePickedHint(pickedJob.title, currentDate, pickedJob.start_time)}
                    </p>
                    <div className="hub-week-place-crew">
                      {boardCrew.map(m => (
                        <button
                          key={m.id}
                          type="button"
                          className="hub-week-quiet"
                          onClick={() => placePickedOnPerson(m.id)}
                        >
                          {m.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {viewMode === 'week' ? (
                  <>
                    <div className="lg:hidden">
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
                        onJobDrop={placeExisting}
                      />
                    </div>
                    <div className="hidden lg:block">
                      <WeekBoardView
                        jobs={onBoard}
                        teamMembers={boardCrew}
                        currentDate={currentDate}
                        onJobClick={job => openJob(job.id)}
                        onDayClick={handleDayClick}
                        onSelectDay={date => {
                          setCurrentDate(date);
                          setView('day');
                        }}
                        onJobDrop={placeExisting}
                        filteredEmployeeIds={filteredEmployeeIds}
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="lg:hidden">
                      <PhoneDayList
                        jobs={onBoard}
                        teamMembers={boardCrew}
                        currentDate={currentDate}
                        onJobClick={job => openJob(job.id)}
                        onDayClick={handleDayClick}
                        onJobDrop={placeExisting}
                        onJobResize={(jobId, startTime, endTime) => resizeJob.mutate({ jobId, startTime, endTime })}
                      />
                    </div>
                    <div className="hidden lg:block">
                      <DayBoardView
                        jobs={onBoard}
                        teamMembers={boardCrew}
                        currentDate={currentDate}
                        onJobClick={job => openJob(job.id)}
                        onDayClick={handleDayClick}
                        onJobDrop={placeExisting}
                        onJobResize={(jobId, startTime, endTime) => resizeJob.mutate({ jobId, startTime, endTime })}
                        filteredEmployeeIds={filteredEmployeeIds}
                      />
                    </div>
                  </>
                )}
                <NeedsDateRail
                  jobs={needsDate}
                  teamMembers={boardCrew}
                  selectedId={pickedJob?.id ?? null}
                  onJobClick={handlePickJob}
                  onOpenJob={job => openJob(job.id)}
                  onDragStart={handleRailDragStart}
                  alwaysShow
                />
              </WeekBoardDocument>
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
