import { useState, useMemo, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
import { StaffHoursPanel } from '../components/jobs/StaffHoursPanel';
import { ScheduleJobsTray } from '../components/jobs/ScheduleJobsTray';
import { ScheduleOverrideDialog } from '../components/jobs/ScheduleOverrideDialog';
import { SchedulePlacementEditor } from '../components/jobs/SchedulePlacementEditor';
import {
  countJobsOutsideVisibleWindow,
  placePickedHint,
  placePickedOnCell,
  rememberDraggedJob,
  rescheduleJobPatch,
  visibleDayHours,
  type JobDropPayload,
} from '../lib/dispatch';
import {
  isMissingRelation,
  memberNameMap,
  staffHoursFromRow,
  type StaffHours,
} from '../lib/booking';
import { cardBadge, evaluateDispatch, jobNeedsAttention, NEEDS_RESOURCES_EMPTY } from '../lib/dispatchResources';
import { loadDispatchPack, snapshotForJob } from '../lib/loadDispatchSnapshot';
import { DISPATCH_UNAVAILABLE, saveJobDispatch, type SaveJobDispatchInput } from '../lib/saveJobDispatch';
import { scheduleBoardSummary } from '../lib/scheduleBoardSummary';
import { partitionScheduleJobs } from '../lib/jobNextAction';
import { attachJobClients, hydrateJobParentNumbers, jobMatchesSearch, listCompanyScheduleJobs, mergeScheduleJobPatch, mergeScheduleSearchHits, searchScheduleJobs, withScheduleJobPatches } from '../lib/scheduleJobSearch';
import {
  decideExistingJobPlacement,
  draftFromJobDrop,
  isRetryableDispatchFailure,
  nextPlacementIdempotencyKey,
  placementSummary,
  type PlacementDecision,
  type PlacementDraft,
} from '../lib/schedulePlacement';
import { parseScheduleDateParam, parseScheduleView, scheduleDayKey, scheduleJobHref, SCHEDULE_WEEK_STARTS_ON, type ScheduleViewMode } from '../lib/scheduleBoard';
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
  { id: WEEK_LOOK_DAVE, name: 'Dave Hale', email: 'dave@look.example', schedule_color: null },
  { id: WEEK_LOOK_JACK, name: 'Jack Wieland', email: 'jack@look.example', schedule_color: null },
  { id: WEEK_LOOK_SAM, name: 'Sam Ortiz', email: 'sam@look.example', schedule_color: null },
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
  filtered,
  onClearCrew,
}: {
  viewMode: ScheduleViewMode;
  setView: (mode: ScheduleViewMode) => void;
  onToday: () => void;
  onPrev: () => void;
  onNext: () => void;
  rangeLabel: string;
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

function ScheduleJobActions({
  onAddExisting,
  onNewJob,
  hideAddExisting = false,
}: {
  onAddExisting: () => void;
  onNewJob: () => void;
  hideAddExisting?: boolean;
}) {
  return (
    <div className="hub-schedule-job-actions">
      {!hideAddExisting && (
      <button
        type="button"
        className="btn-secondary min-h-11"
        data-schedule-add-existing="1"
        onClick={onAddExisting}
      >
        Add existing job
      </button>
      )}
      <button
        type="button"
        className="btn-primary"
        data-schedule-new-job="1"
        onClick={onNewJob}
      >
        <Plus size={16} /> New job
      </button>
    </div>
  );
}

function WeekBoardDocument({
  mark,
  whisper,
  rangeLabel,
  onAddExisting,
  onNewJob,
  hideAddExisting = false,
  crews,
  track,
  children,
}: {
  mark: string;
  whisper: string;
  rangeLabel: string;
  onAddExisting: () => void;
  onNewJob: () => void;
  hideAddExisting?: boolean;
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
            <ScheduleJobActions
              hideAddExisting={hideAddExisting}
              onAddExisting={onAddExisting}
              onNewJob={onNewJob}
            />
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
    if (lookWeekBoard) {
      return parseScheduleView(searchParams.get('view')) === 'day'
        ? WEEK_BOARD_LOOK_DAY_ANCHOR
        : WEEK_BOARD_LOOK_ANCHOR;
    }
    return parseScheduleDateParam(searchParams.get('date')) ?? new Date();
  });
  const [viewMode, setViewMode] = useState<ScheduleViewMode>(() => parseScheduleView(searchParams.get('view')));
  const [showForm, setShowForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [presetClientId, setPresetClientId] = useState<string | null>(null);
  const [presetEmployeeId, setPresetEmployeeId] = useState<string | undefined>(undefined);
  const [filteredEmployeeIds, setFilteredEmployeeIds] = useState<Set<string>>(new Set());
  const [jobQuery, setJobQuery] = useState('');
  const [addExistingOpen, setAddExistingOpen] = useState(false);
  const [trayScope, setTrayScope] = useState<'unscheduled' | 'all'>('unscheduled');
  const [placementDraft, setPlacementDraft] = useState<PlacementDraft | null>(null);
  const [placementDialog, setPlacementDialog] = useState<Extract<PlacementDecision, { status: 'need_override' | 'need_time' | 'member_blocked' | 'hard_blocked' | 'invalid_interval' }> | null>(null);
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [pickedJob, setPickedJob] = useState<JobWithClient | null>(null);
  const [extendedHours, setExtendedHours] = useState(true);
  const [hoursOpen, setHoursOpen] = useState(false);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [dispatchSave, setDispatchSave] = useState<{
    status: 'idle' | 'saving' | 'saved' | 'failed';
    message: string;
  }>({ status: 'idle', message: '' });
  const lastDispatchRef = useRef<SaveJobDispatchInput | null>(null);
  const placementKeyRef = useRef<{ fingerprint: string; key: string } | null>(null);
  const lastResultRetryable = useRef(false);

  const preselectClient = searchParams.get('client');
  const preselectJob = searchParams.get('job');

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
    if (lookWeekBoard) return;
    const fromUrl = parseScheduleDateParam(searchParams.get('date'));
    const view = parseScheduleView(searchParams.get('view'));
    if (fromUrl && format(fromUrl, 'yyyy-MM-dd') !== format(currentDate, 'yyyy-MM-dd')) {
      setCurrentDate(fromUrl);
    }
    if (view !== viewMode) setViewMode(view);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (lookWeekBoard) return;
    const next = new URLSearchParams(searchParams);
    next.set('date', format(currentDate, 'yyyy-MM-dd'));
    if (viewMode === 'day') next.set('view', 'day');
    else next.delete('view');
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true });
    }
  }, [currentDate, viewMode, lookWeekBoard]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const { data: jobs, isLoading, isFetching, isPlaceholderData, error } = useQuery<JobWithClient[]>({
    queryKey: ['jobs', rangeStart, rangeEnd],
    placeholderData: keepPreviousData,
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

  const jobIds = (jobs ?? []).map(j => j.id);
  const { data: dispatchPack } = useQuery({
    queryKey: ['dispatch-pack', rangeStart, rangeEnd, jobIds.join(',')],
    queryFn: () => loadDispatchPack(jobIds),
    enabled: !!profile && !lookWeekBoard,
  });

  const { data: hours = [], isError: hoursMissing } = useQuery({
    queryKey: ['staff-hours', rangeStart, rangeEnd],
    queryFn: async () => {
      const { data, error: hoursError } = await supabase
        .from('staff_hours')
        .select('member_id, date, working, start_time, end_time, reason')
        .gte('date', rangeStart)
        .lte('date', rangeEnd);
      if (hoursError) {
        if (isMissingRelation(hoursError)) return [];
        throw hoursError;
      }
      return (data ?? []).map(staffHoursFromRow);
    },
    enabled: !!profile && !lookWeekBoard,
  });

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(jobQuery.trim()), 200);
    return () => window.clearTimeout(t);
  }, [jobQuery]);

  const { data: searchHits = [], isFetching: searchLoading } = useQuery({
    queryKey: ['schedule-job-search', addExistingOpen ? 'picker' : 'type', debouncedQuery],
    queryFn: () => (
      debouncedQuery.length > 0
        ? searchScheduleJobs(debouncedQuery)
        : listCompanyScheduleJobs()
    ),
    enabled: !!profile && (debouncedQuery.length > 0 || addExistingOpen),
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
      if (!dispatchPack || dispatchPack.missing) {
        throw new Error(DISPATCH_UNAVAILABLE);
      }
      const current = (jobs ?? []).find(j => j.id === jobId);
      if (!current) throw new Error('Job not found');
      const names = memberNameMap(teamMembers ?? []);
      const proposed = { ...current, start_time: startTime, end_time: endTime };
      const snap = snapshotForJob({
        job: proposed,
        pack: dispatchPack,
        siblings: jobs ?? [],
        hours,
        names,
      });
      const result = await saveJobDispatch({
        jobId,
        expectedUpdatedAt: current.updated_at,
        assignedTeam: current.assigned_team ?? [],
        resourceIds: snap.allocations.map(a => a.resourceId),
        skillRequirements: snap.skillRequirements,
        resourceRequirements: snap.resourceRequirements,
        requiredCrewCount: snap.requiredCrewCount,
        dispatchReady: snap.dispatchReady,
        role: profile?.role === 'admin' ? 'admin' : 'member',
        reschedule: true,
        snapshot: { ...snap, assignedTeam: current.assigned_team ?? [] },
      });
      if (!result.ok) throw new Error(result.message);
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

  const runDispatchSave = (input: SaveJobDispatchInput) => {
    lastDispatchRef.current = input;
    lastResultRetryable.current = false;
    setDispatchSave({ status: 'saving', message: 'Saving assignment…' });
    void saveJobDispatch(input).then(result => {
      if (!result.ok) {
        lastResultRetryable.current = isRetryableDispatchFailure(result);
        setDispatchSave({ status: 'failed', message: result.message });
        return;
      }
      lastResultRetryable.current = false;
      if (result.replayed) {
        setDispatchSave({ status: 'saved', message: 'Assignment already saved — no extra write.' });
      } else {
        setDispatchSave({ status: 'saved', message: 'Assignment saved.' });
        placementKeyRef.current = null;
      }
      setPlacementDialog(null);
      setPlacementDraft(null);
      setPickedJob(null);
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['job'] });
      queryClient.invalidateQueries({ queryKey: ['dispatch-pack'] });
      queryClient.invalidateQueries({ queryKey: ['schedule-job-search'] });
    }).catch(() => {
      lastResultRetryable.current = true;
      setDispatchSave({ status: 'failed', message: 'Could not save assignment. Retry when you are back online.' });
    });
  };

  const saveHours = useMutation({
    mutationFn: async (row: StaffHours) => {
      const { error: writeError } = await supabase.from('staff_hours').upsert({
        company_id: profile?.company_id,
        member_id: row.memberId,
        date: row.date,
        working: row.working,
        start_time: row.working ? row.start : null,
        end_time: row.working ? row.end : null,
        reason: row.reason ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'company_id,member_id,date' });
      if (writeError) throw writeError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff-hours'] }),
    onError: (e: Error) => alert(e.message),
  });

  const clearHours = useMutation({
    mutationFn: async ({ memberId, date }: { memberId: string; date: string }) => {
      const { error: writeError } = await supabase
        .from('staff_hours')
        .delete()
        .eq('member_id', memberId)
        .eq('date', date);
      if (writeError) throw writeError;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff-hours'] }),
    onError: (e: Error) => alert(e.message),
  });

  const findPlaceableJob = (jobId: string) => {
    const liveJobs = lookWeekBoard ? [] : (jobs ?? []);
    return [...liveJobs, ...(searchHits ?? [])].find(j => j.id === jobId)
      ?? (pickedJob?.id === jobId ? pickedJob : undefined);
  };

  const resolvePlacement = (
    drop: JobDropPayload,
    overrideReason?: string | null,
    times?: { start_time: string | null; end_time: string | null },
  ) => {
    const liveJobs = lookWeekBoard ? [] : (jobs ?? []);
    const liveCrew = teamMembers ?? [];
    const current = findPlaceableJob(drop.jobId);
    if (lookWeekBoard) return;
    if (isDevFieldAuditAuth()) {
      applyDropToCache(drop);
      setPickedJob(null);
      return;
    }
    if (!current) {
      setDispatchSave({ status: 'failed', message: 'That job is not loaded. Search again.' });
      return;
    }
    const names = memberNameMap(liveCrew);
    const packMissing = !dispatchPack || dispatchPack.missing;
    const proposedPatch = rescheduleJobPatch({
      assigned_team: current.assigned_team,
      start_time: current.start_time,
      end_time: current.end_time,
    }, drop);
    const proposed = {
      ...current,
      scheduled_date: proposedPatch.scheduled_date,
      assigned_team: proposedPatch.assigned_team ?? current.assigned_team,
      start_time: proposedPatch.start_time ?? current.start_time,
      end_time: proposedPatch.end_time === undefined ? current.end_time : proposedPatch.end_time,
    };
    const snap = !packMissing && dispatchPack
      ? snapshotForJob({
        job: proposed,
        pack: dispatchPack,
        siblings: liveJobs,
        hours,
        names,
      })
      : null;
    const draftInput = {
      jobId: current.id,
      expectedUpdatedAt: current.updated_at,
      assignedTeam: proposed.assigned_team ?? [],
      resourceIds: snap?.allocations.map(a => a.resourceId) ?? [],
      skillRequirements: snap?.skillRequirements ?? [],
      resourceRequirements: snap?.resourceRequirements ?? [],
      requiredCrewCount: snap?.requiredCrewCount ?? 0,
      dispatchReady: snap?.dispatchReady ?? false,
      role: profile?.role === 'admin' ? 'admin' as const : 'member' as const,
      overrideReason: overrideReason ?? null,
      reschedule: true,
      snapshot: snap ?? {
        job: proposed,
        dispatchReady: false,
        requiredCrewCount: 0,
        assignedTeam: proposed.assigned_team ?? [],
        skillRequirements: [],
        resourceRequirements: [],
        allocations: [],
        skills: [],
        qualifications: [],
        resources: [],
        siblingJobs: [],
        siblingAllocations: [],
        hours,
        names,
      },
    };
    const key = nextPlacementIdempotencyKey(placementKeyRef.current, draftInput);
    const decision = decideExistingJobPlacement({
      job: current,
      drop,
      role: profile?.role === 'admin' ? 'admin' : 'member',
      packMissing,
      snapshot: snap,
      crewLabel: drop.employeeId
        ? (liveCrew.find(m => m.id === drop.employeeId)?.name ?? 'Crew')
        : 'Unassigned',
      overrideReason,
      idempotencyKey: key,
      times,
    });
    if (decision.status === 'save') {
      placementKeyRef.current = { fingerprint: decision.prepared.fingerprint, key };
      void runDispatchSave(decision.prepared.input);
      return;
    }
    if (decision.status === 'unavailable' || decision.status === 'missing_job') {
      lastResultRetryable.current = decision.status === 'unavailable';
      setDispatchSave({ status: 'failed', message: decision.message });
      return;
    }
    if (decision.status === 'hard_blocked') {
      lastResultRetryable.current = false;
      setDispatchSave({ status: 'failed', message: decision.message });
      setPlacementDialog(decision);
      return;
    }
    setPlacementDialog(decision);
  };

  const placeExisting = (drop: JobDropPayload) => {
    const current = findPlaceableJob(drop.jobId);
    if (!current) {
      setDispatchSave({ status: 'failed', message: 'That job is not loaded. Search again.' });
      return;
    }
    setPlacementDialog(null);
    setPlacementDraft(draftFromJobDrop(current, drop));
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

  const jobsWithBadges = useMemo(() => {
    if (!dispatchPack || dispatchPack.missing) return boardJobs;
    const names = memberNameMap(boardCrew);
    return boardJobs.map(job => {
      const snap = snapshotForJob({
        job,
        pack: dispatchPack,
        siblings: boardJobs,
        hours,
        names,
      });
      const conflicts = evaluateDispatch(snap);
      return {
        ...job,
        dispatchBadge: cardBadge(conflicts, !!job.last_dispatch_override_at),
        needsAttention: jobNeedsAttention(conflicts),
      };
    });
  }, [boardJobs, boardCrew, dispatchPack, hours]);

  const { needsDate, onBoard } = useMemo(
    () => partitionScheduleJobs(jobsWithBadges),
    [jobsWithBadges],
  );
  const attentionBoard = attentionOnly
    ? onBoard.filter(j => 'needsAttention' in j && j.needsAttention)
    : onBoard;
  const attentionCount = onBoard.filter(j => 'needsAttention' in j && j.needsAttention).length;
  const attentionEmpty = attentionOnly && attentionBoard.length === 0
    ? NEEDS_RESOURCES_EMPTY
    : null;

  const weekStart = startOfWeek(currentDate, { weekStartsOn: SCHEDULE_WEEK_STARTS_ON });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: SCHEDULE_WEEK_STARTS_ON });
  const weekRangeLabel = `${format(weekStart, 'EEE d MMM')} – ${format(weekEnd, 'EEE d MMM yyyy')}`;
  const weekRangeShort = `${format(weekStart, 'd MMM')} – ${format(weekEnd, 'd MMM')}`;
  const dayRangeLabel = format(currentDate, 'EEE d MMM yyyy');
  const dayRangeShort = format(currentDate, 'EEE d MMM');
  const unassignedOnBoard = onBoard.filter(j => !(j.assigned_team ?? []).length).length;
  const visibleHours = visibleDayHours(extendedHours);
  const outsideWorkdayCount = countJobsOutsideVisibleWindow(onBoard, visibleHours.start, visibleHours.end);
  const summaryStatus = isLoading && jobs == null
    ? 'loading'
    : isPlaceholderData && isFetching
      ? 'retained'
      : 'ready';
  const summary = scheduleBoardSummary({
    status: summaryStatus,
    onBoardCount: onBoard.length,
    unassignedOnBoard,
    needsDateCount: needsDate.length,
    attentionCount,
  });
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
    setAddExistingOpen(false);
    setSelectedDate(format(currentDate, 'yyyy-MM-dd'));
    setPresetEmployeeId(undefined);
    setShowForm(true);
  };

  const openAddExisting = () => {
    setShowForm(false);
    setJobQuery('');
    setAddExistingOpen(true);
  };

  const closeAddExisting = () => {
    setAddExistingOpen(false);
    setJobQuery('');
  };

  const searchResults = useMemo(
    () => mergeScheduleSearchHits(jobs ?? [], searchHits, jobQuery),
    [jobs, searchHits, jobQuery],
  );

  const trayJobs = useMemo(() => {
    const byId = new Map<string, JobWithClient>();
    for (const row of [...(jobs ?? []), ...searchHits]) byId.set(row.id, row);
    const list = [...byId.values()].filter(row => row.status !== 'cancelled');
    if (!jobQuery.trim()) return list;
    return list.filter(row => jobMatchesSearch(row, jobQuery));
  }, [jobs, searchHits, jobQuery]);

  const weekSearch = addExistingOpen ? null : (
    <ScheduleJobSearch
      query={jobQuery}
      onQuery={setJobQuery}
      results={searchResults}
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
        <div className="dc-nav-cluster" role="group" aria-label="Date">
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
        </div>
        {!lookWeekBoard && (
          <div className="dc-filter-cluster" role="group" aria-label="Board filters">
            <button
              type="button"
              className="hub-week-quiet"
              aria-pressed={attentionOnly}
              onClick={() => setAttentionOnly(v => !v)}
            >
              Attention
              {attentionCount > 0 ? ` · ${attentionCount}` : ''}
            </button>
            <button
              type="button"
              className="hub-week-quiet"
              aria-pressed={hoursOpen}
              onClick={() => setHoursOpen(v => !v)}
            >
              Hours & leave
            </button>
            <button
              type="button"
              className="hub-week-quiet"
              aria-pressed={extendedHours}
              onClick={() => setExtendedHours(v => !v)}
            >
              {extendedHours ? '6am–8pm' : '7am–5pm'}
              {outsideWorkdayCount > 0 ? ` · ${outsideWorkdayCount}` : ''}
            </button>
          </div>
        )}
        <p className="hub-week-range">
          <span className="hub-week-range-full">{boardRangeLabel}</span>
          <span className="hub-week-range-short">{viewMode === 'day' ? dayRangeShort : weekRangeShort}</span>
        </p>
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
            <p className="ops-meta mt-2" data-testid="schedule-board-summary">
              {lookWeekBoard ? (
                <>
                  {onBoard.length} on the board
                  {unassignedOnBoard > 0 ? ` · ${unassignedOnBoard} unassigned` : ''}
                  {needsDate.length > 0 ? ` · ${needsDate.length} without a date` : ''}
                  {viewMode === 'day'
                    ? ` · ${format(currentDate, 'EEEE, d MMMM yyyy')}`
                    : ` · week of ${format(startOfWeek(currentDate, { weekStartsOn: SCHEDULE_WEEK_STARTS_ON }), 'd MMM')}`}
                </>
              ) : summary}
            </p>
          </div>
          <ScheduleJobActions
            hideAddExisting={lookWeekBoard}
            onAddExisting={openAddExisting}
            onNewJob={openNewJob}
          />
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

        {!lookWeekBoard && dispatchSave.status !== 'idle' && !addExistingOpen && (
          <p className="ops-meta mb-3 dc-place-feedback" role="status" data-testid="schedule-dispatch-save-status">
            {dispatchSave.message}
            {dispatchSave.status === 'failed' && lastResultRetryable.current && lastDispatchRef.current && (
              <button
                type="button"
                className="ops-link ml-2 min-h-11"
                onClick={() => lastDispatchRef.current && runDispatchSave(lastDispatchRef.current)}
              >
                Retry
              </button>
            )}
          </p>
        )}

        <AttentionEmpty emptyMessage={attentionEmpty} />

        {!lookWeekBoard && (
          <StaffHoursPanel
            date={format(currentDate, 'yyyy-MM-dd')}
            members={boardCrew}
            hours={hours}
            saving={saveHours.isPending || clearHours.isPending}
            unavailable={hoursMissing}
            open={hoursOpen}
            onSave={row => saveHours.mutate(row)}
            onClear={(memberId, date) => clearHours.mutate({ memberId, date })}
          />
        )}

        {!lookWeekBoard && isLoading && jobs == null ? (
          <div className="flex justify-center py-20"><LoadingSpinner /></div>
        ) : (
          <>
            <div className={`hub-schedule-desk hub-schedule-phone dc-schedule-workspace ${addExistingOpen ? 'has-tray' : ''}`}>
              {addExistingOpen && !lookWeekBoard && (
                <ScheduleJobsTray
                  jobs={trayJobs}
                  query={jobQuery}
                  onQuery={setJobQuery}
                  scope={trayScope}
                  onScope={setTrayScope}
                  selectedId={pickedJob?.id ?? null}
                  onSelect={handlePickJob}
                  onSchedule={job => {
                    handlePickJob(job);
                    placeExisting(placePickedOnCell(
                      job,
                      format(currentDate, 'yyyy-MM-dd'),
                      job.assigned_team?.[0] ?? null,
                    ));
                  }}
                  onDragStart={handleRailDragStart}
                  onClose={closeAddExisting}
                  feedback={dispatchSave.status === 'idle' ? null : {
                    message: dispatchSave.message,
                    retryable: lastResultRetryable.current,
                    onRetry: () => lastDispatchRef.current && runDispatchSave(lastDispatchRef.current),
                  }}
                />
              )}
              <WeekBoardDocument
                mark={viewMode === 'day' ? 'Day' : 'Week'}
                whisper={boardWhisper}
                rangeLabel={boardRangeLabel}
                hideAddExisting={lookWeekBoard}
                onAddExisting={openAddExisting}
                onNewJob={openNewJob}
                crews={weekCrews}
                track={boardTrack}
              >
                <div className="hub-week-search" data-schedule-search="1">
                  {weekSearch}
                </div>
                {pickedJob && boardCrew.length > 0 && (
                  <div className="hub-week-place hub-schedule-place" data-schedule-place="1">
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
                    <div className="lg:hidden hub-week-mount">
                      <PhoneWeekList
                        jobs={attentionBoard}
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
                        onPlaceJob={job => placeExisting(placePickedOnCell(
                          job,
                          job.scheduled_date?.slice(0, 10) || format(currentDate, 'yyyy-MM-dd'),
                          job.assigned_team?.[0] ?? null,
                        ))}
                      />
                    </div>
                    <div className="hidden lg:block hub-week-mount">
                      <WeekBoardView
                        jobs={attentionBoard}
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
                    <div className="lg:hidden hub-week-mount">
                      <PhoneDayList
                        jobs={attentionBoard}
                        teamMembers={boardCrew}
                        currentDate={currentDate}
                        onJobClick={job => openJob(job.id)}
                        onDayClick={handleDayClick}
                        onJobDrop={placeExisting}
                        onJobResize={(jobId, startTime, endTime) => resizeJob.mutate({ jobId, startTime, endTime })}
                        onPlaceJob={job => placeExisting(placePickedOnCell(
                          job,
                          format(currentDate, 'yyyy-MM-dd'),
                          job.assigned_team?.[0] ?? null,
                        ))}
                        extendedHours={extendedHours}
                      />
                    </div>
                    <div className="hidden lg:block hub-week-mount">
                      <DayBoardView
                        jobs={attentionBoard}
                        teamMembers={boardCrew}
                        currentDate={currentDate}
                        onJobClick={job => openJob(job.id)}
                        onDayClick={handleDayClick}
                        onJobDrop={placeExisting}
                        onJobResize={(jobId, startTime, endTime) => resizeJob.mutate({ jobId, startTime, endTime })}
                        filteredEmployeeIds={filteredEmployeeIds}
                        extendedHours={extendedHours}
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

      {placementDraft && (() => {
        const draftJob = findPlaceableJob(placementDraft.jobId);
        const editorSummary = draftJob
          ? placementSummary({
            job: draftJob,
            proposed: {
              scheduled_date: placementDraft.date,
              start_time: placementDraft.startTime,
              end_time: placementDraft.endTime,
            },
            crewLabel: placementDraft.employeeId
              ? ((teamMembers ?? []).find(m => m.id === placementDraft.employeeId)?.name ?? 'Crew')
              : 'Unassigned',
          })
          : placementDialog && 'summary' in placementDialog
            ? placementDialog.summary
            : placementDialog && placementDialog.status === 'need_override'
              ? placementDialog.prepared.summary
              : {
                jobId: placementDraft.jobId,
                jobLabel: 'Job',
                crewLabel: 'Unassigned',
                whenLabel: placementDraft.date,
                movingExisting: false,
                previousWhen: null,
              };
        return (
          <SchedulePlacementEditor
            summary={editorSummary}
            crew={teamMembers ?? []}
            draft={placementDraft}
            conflicts={
              placementDialog?.status === 'need_override'
                ? placementDialog.prepared.conflicts
                : placementDialog && 'conflicts' in placementDialog
                  ? placementDialog.conflicts
                  : []
            }
            statusMessage={
              placementDialog?.status === 'invalid_interval'
                ? placementDialog.message
                : dispatchSave.status === 'failed'
                  ? dispatchSave.message
                  : null
            }
            saving={dispatchSave.status === 'saving'}
            reasonRequired={placementDialog?.status === 'need_override'}
            blocked={placementDialog?.status === 'member_blocked' || placementDialog?.status === 'hard_blocked'}
            nextAction={
              placementDialog && 'nextAction' in placementDialog
                ? placementDialog.nextAction
                : null
            }
            onCancel={() => {
              setPlacementDraft(null);
              setPlacementDialog(null);
            }}
            onChange={setPlacementDraft}
            onSave={reason => {
              const drop: JobDropPayload = {
                jobId: placementDraft.jobId,
                date: placementDraft.date,
                employeeId: placementDraft.employeeId,
                startTime: placementDraft.startTime ?? undefined,
              };
              resolvePlacement(drop, reason || null, {
                start_time: placementDraft.startTime,
                end_time: placementDraft.endTime,
              });
            }}
          />
        );
      })()}
      {placementDialog?.status === 'member_blocked' && (
        <ScheduleOverrideDialog
          summary={placementDialog.summary}
          conflicts={placementDialog.conflicts}
          memberBlocked
          nextAction={placementDialog.nextAction}
          onCancel={() => setPlacementDialog(null)}
        />
      )}
      {placementDialog?.status === 'hard_blocked' && (
        <ScheduleOverrideDialog
          summary={placementDialog.summary}
          conflicts={placementDialog.conflicts}
          memberBlocked
          nextAction="The card stays in its previous place. Pick another crew or time."
          onCancel={() => setPlacementDialog(null)}
        />
      )}

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

function AttentionEmpty({ emptyMessage }: { emptyMessage: string | null }) {
  if (!emptyMessage) return null;
  return <p className="ops-meta mb-3">{emptyMessage}</p>;
}
