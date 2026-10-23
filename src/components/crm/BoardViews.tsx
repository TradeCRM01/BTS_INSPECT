import { useState, useMemo, useRef, memo, useEffect, Fragment, type ReactNode } from 'react';
import type { JobWithClient } from '../../types/crm';
import {
  PHONE_UNSCHEDULED_EXPANDED_DEFAULT,
  phoneUnscheduledChipLabel,
} from '../../lib/schedulePhoneUnscheduled';
import {
  startTimeFromDropOffset,
  placeDayRowJobs,
  dayRowHeightPx,
  UNASSIGNED_ROW_ID,
  DAY_START_HOUR,
  DAY_END_HOUR,
  HOUR_WIDTH_PX,
  dayBoardHourWidthPx,
  dayBoardHoursFit,
  dayBoardOpenScrollLeft,
  dayBoardStartHour,
  dayChipPinInset,
  asTeamIds,
  timeToMinutes,
  resizeJobTimes,
  rememberDraggedJob,
  readDroppedJobId,
  type JobDropPayload,
  type ResizeEdge,
} from '../../lib/dispatch';
import { format, isToday, parseISO } from 'date-fns';
import { Users } from 'lucide-react';
import { JobCalendarOverflow } from '../jobs/JobCalendarOverflow';
import { calendarSite } from '../../lib/jobCalendar';
import { formatJobRef } from '../../lib/jobRef';
import {
  jobsOnScheduleDay,
  scheduleAgendaClock,
  scheduleChipClock,
  scheduleClockLabel,
  scheduleCrewLabel,
  scheduleDateKey,
  scheduleJobHref,
  schedulePlotTimes,
  scheduleWeekAgenda,
  scheduleWeekDays,
  weekBoardChip,
  weekBoardCrewLabel,
  weekBoardRows,
  WEEK_UNASSIGNED_CREW_ID,
  scheduleLaneColor,
  scheduleLaneCountLabel,
  scheduleLaneJobCount,
  scheduleNowMark,
  scheduleTimeTrack,
  weekHasWeekendJobs,
} from '../../lib/scheduleBoard';
import { schedulePill } from '../../lib/scheduleInvoiceStatus';
import { jobsListSite, jobsListSuburbFromSite } from '../../lib/jobsListRow';

export interface TeamMember {
  id: string;
  name: string;
  email?: string;
  /** Explicit schedule colour (#RRGGBB); null/undefined = auto palette */
  schedule_color?: string | null;
}

export interface BoardProps {
  jobs: JobWithClient[];
  teamMembers: TeamMember[];
  currentDate: Date;
  onJobClick: (job: JobWithClient) => void;
  onDayClick: (dateStr: string, employeeId?: string | null) => void;
  onJobDrop?: (drop: JobDropPayload) => void;
  onJobResize?: (jobId: string, startTime: string, endTime: string) => void;
  filteredEmployeeIds: Set<string>;
  onSelectDay?: (date: Date) => void;
  invoicedJobIds?: Set<string>;
}

const DAY_START = DAY_START_HOUR;
const DAY_END = DAY_END_HOUR;
const ALL_DAY_H = 112;
const TIMED_H = 120;
const ROW_PAD = 6;
const ROW_MIN = 112;
const NO_INVOICED: Set<string> = new Set();

function dateKey(d: Date): string {
  return scheduleDateKey(d);
}

function formatHourLabel(h: number): string {
  if (h === 12) return '12 PM';
  if (h > 12) return `${h - 12} PM`;
  return `${h} AM`;
}

// ── Job Block ────────────────────────────────────────────────────

interface JobBlockProps {
  job: JobWithClient;
  teamMembers?: TeamMember[];
  onClick: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  compact?: boolean;
  dragging?: boolean;
  fill?: boolean;
  detail?: boolean;
  laneColor?: string;
  invoicedJobIds?: Set<string>;
}

const JobBlock = memo(function JobBlock({
  job, onClick, onDragStart, dragging, laneColor, invoicedJobIds = NO_INVOICED,
}: JobBlockProps) {
  const chip = weekBoardChip(job);
  const clock = scheduleClockLabel(job.start_time, job.end_time)
    ?? scheduleChipClock(job.start_time, job.end_time, job.scheduled_date);
  const suburb = jobsListSuburbFromSite(jobsListSite(job.address, job.client_address));
  const pill = schedulePill(job, invoicedJobIds);
  const track = scheduleTimeTrack(job.start_time, job.end_time);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onClick={e => { e.stopPropagation(); onClick(); }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
      data-schedule-job={job.id}
      data-chip-clock={clock}
      className={`hub-week-chip cursor-pointer w-full h-full ${
        dragging ? 'is-dragging' : ''
      }`}
      style={{ ['--hub-lane' as string]: laneColor ?? scheduleLaneColor(WEEK_UNASSIGNED_CREW_ID) }}
    >
      <span className="hub-week-chip-rail" aria-hidden />
      <span className="hub-day-chip-pin" data-day-chip-pin="1">
        <span className="hub-week-chip-line1">
          <span className="hub-week-chip-clock">{clock}</span>
          {' · '}
          <span className="hub-week-chip-ref">{chip.ref}</span>
        </span>
        {chip.description ? <span className="hub-week-chip-desc">{chip.description}</span> : null}
        {suburb ? <span className="hub-week-chip-suburb">{suburb}</span> : null}
        <span className="hub-schedule-pill" data-kind={pill.kind}>{pill.label}</span>
        <span className="hub-week-chip-track" data-stored={track.stored ? '1' : '0'}>
          {track.stored ? (
            <span
              className="hub-week-chip-span"
              style={{ left: `${track.left * 100}%`, width: `${track.width * 100}%` }}
            />
          ) : null}
        </span>
      </span>
    </div>
  );
});

// ── Unscheduled tray (jobs that would otherwise vanish) ──────────

type UnscheduledRailProps = {
  jobs: JobWithClient[];
  teamMembers?: TeamMember[];
  onJobClick: (job: JobWithClient) => void;
  onDragStart: (e: React.DragEvent, jobId: string) => void;
  selectedId?: string | null;
  onOpenJob?: (job: JobWithClient) => void;
  onSetScheduleDate?: (job: JobWithClient) => void;
  invoicedJobIds?: Set<string>;
};

function UnscheduledJobCards({
  jobs, teamMembers, onJobClick, onDragStart, selectedId = null, onOpenJob, onSetScheduleDate,
  invoicedJobIds = NO_INVOICED,
}: UnscheduledRailProps) {
  return (
    <>
      {jobs.map(job => {
        const selected = selectedId === job.id;
        const pill = schedulePill(job, invoicedJobIds);
        const suburb = jobsListSuburbFromSite(jobsListSite(job.address, job.client_address));
        const meta = [formatJobRef(job), job.client_name, suburb].filter(Boolean).join(' · ');
        return (
          <div
            key={job.id}
            role="button"
            tabIndex={0}
            draggable
            aria-pressed={selected}
            onDragStart={e => onDragStart(e, job.id)}
            onClick={() => onJobClick(job)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onJobClick(job);
              }
            }}
            data-schedule-job={job.id}
            data-schedule-rail-job={job.id}
            className={`ops-card job-cal-host ops-card-hover w-full text-left active:scale-[0.98] cursor-pointer ${
              selected ? 'is-on' : ''
            }`}
          >
            <div className="ops-card-body">
              {job.title ? <p className="hub-week-chip-desc">{job.title}</p> : null}
              <p className="hub-schedule-ref">{meta}</p>
              <span className="hub-schedule-pill" data-kind={pill.kind}>{pill.label}</span>
              <div className="ops-card-footer">
                <button
                  type="button"
                  className="hub-schedule-set-date hub-schedule-next"
                  data-schedule-set-date={job.id}
                  onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    onSetScheduleDate?.(job);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onSetScheduleDate?.(job);
                    }
                  }}
                  onPointerDown={e => e.stopPropagation()}
                >
                  Set a date
                </button>
                {onOpenJob ? (
                  <a
                    href={scheduleJobHref(job.id)}
                    data-schedule-open-job={job.id}
                    className="hub-schedule-next"
                    onClick={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      onOpenJob(job);
                    }}
                    onPointerDown={e => e.stopPropagation()}
                  >
                    Open
                  </a>
                ) : null}
                <JobCalendarOverflow
                  job={job}
                  site={calendarSite(job.address, job.client_address)}
                  members={teamMembers}
                />
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}

export const NeedsDateRail = memo(function NeedsDateRail({
  jobs, teamMembers, onJobClick, onDragStart, alwaysShow = false, className = '',
  selectedId = null, onOpenJob, onSetScheduleDate, invoicedJobIds,
}: UnscheduledRailProps & {
  alwaysShow?: boolean;
  className?: string;
}) {
  if (jobs.length === 0 && !alwaysShow) return null;

  return (
    <div className={`ops-tray ${className}`.trim()} data-schedule-rail="1">
      <div className="ops-tray-head">
        <p className="ops-card-kicker">Unscheduled</p>
        <span className="ops-meta">{jobs.length}</span>
      </div>
      <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
        {jobs.length === 0 ? (
          <p className="ops-meta ops-tray-empty px-1 py-2">No unscheduled jobs.</p>
        ) : (
          <UnscheduledJobCards
            jobs={jobs}
            teamMembers={teamMembers}
            onJobClick={onJobClick}
            onDragStart={onDragStart}
            selectedId={selectedId}
            onOpenJob={onOpenJob}
            onSetScheduleDate={onSetScheduleDate}
            invoicedJobIds={invoicedJobIds}
          />
        )}
      </div>
    </div>
  );
});

export const PhoneUnscheduledTray = memo(function PhoneUnscheduledTray({
  jobs, teamMembers, onJobClick, onDragStart, selectedId = null, onOpenJob, onSetScheduleDate,
  invoicedJobIds,
}: UnscheduledRailProps) {
  const [expanded, setExpanded] = useState(PHONE_UNSCHEDULED_EXPANDED_DEFAULT);
  if (jobs.length === 0) return null;

  return (
    <div
      className="hub-phone-unscheduled"
      data-schedule-phone-unscheduled="1"
      data-schedule-phone-section="unscheduled"
    >
      <button
        type="button"
        className="hub-phone-unscheduled-chip"
        data-schedule-unscheduled-chip="1"
        aria-expanded={expanded}
        onClick={e => {
          e.stopPropagation();
          setExpanded(open => !open);
        }}
      >
        {phoneUnscheduledChipLabel(jobs.length)}
      </button>
      {expanded ? (
        <div
          className="hub-phone-unscheduled-list p-2 space-y-2"
          data-schedule-unscheduled-list="1"
        >
          <UnscheduledJobCards
            jobs={jobs}
            teamMembers={teamMembers}
            onJobClick={onJobClick}
            onDragStart={onDragStart}
            selectedId={selectedId}
            onOpenJob={onOpenJob}
            onSetScheduleDate={onSetScheduleDate}
            invoicedJobIds={invoicedJobIds}
          />
        </div>
      ) : null}
    </div>
  );
});

function WeekJobChip({
  job,
  familyJobs,
  dragging,
  onClick,
  onDragStart,
  laneColor,
  invoicedJobIds = NO_INVOICED,
}: {
  job: JobWithClient;
  familyJobs: JobWithClient[];
  dragging?: boolean;
  onClick: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  laneColor: string;
  invoicedJobIds?: Set<string>;
}) {
  const chip = weekBoardChip(job, familyJobs);
  const clock = scheduleClockLabel(job.start_time, job.end_time)
    ?? scheduleChipClock(job.start_time, job.end_time, job.scheduled_date);
  const suburb = jobsListSuburbFromSite(jobsListSite(job.address, job.client_address));
  const pill = schedulePill(job, invoicedJobIds);
  const track = scheduleTimeTrack(job.start_time, job.end_time);
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onClick={e => { e.stopPropagation(); onClick(); }}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        }
      }}
      data-schedule-job={job.id}
      data-week-chip={job.id}
      data-chip-clock={clock}
      className={`hub-week-chip ${dragging ? 'is-dragging' : ''}`}
      style={{ ['--hub-lane' as string]: laneColor }}
    >
      <span className="hub-week-chip-rail" aria-hidden />
      <span className="hub-week-chip-line1">
        <span className="hub-week-chip-clock">{clock}</span>
        {' · '}
        <span className="hub-week-chip-ref">{chip.ref}</span>
      </span>
      {chip.description ? (
        <span className="hub-week-chip-desc">{chip.description}</span>
      ) : null}
      {suburb ? <span className="hub-week-chip-suburb">{suburb}</span> : null}
      <span className="hub-schedule-pill" data-kind={pill.kind}>{pill.label}</span>
      <span className="hub-week-chip-track" data-stored={track.stored ? '1' : '0'}>
        {track.stored ? (
          <span
            className="hub-week-chip-span"
            style={{ left: `${track.left * 100}%`, width: `${track.width * 100}%` }}
          />
        ) : null}
      </span>
    </div>
  );
}

export const PhoneDayList = memo(function PhoneDayList({
  jobs, teamMembers, currentDate, onJobClick, onDayClick, onJobDrop, onJobResize,
  invoicedJobIds,
}: {
  jobs: JobWithClient[];
  teamMembers?: TeamMember[];
  currentDate: Date;
  onJobClick: (job: JobWithClient) => void;
  onDayClick: (dateStr: string, employeeId?: string | null) => void;
  onJobDrop?: (drop: JobDropPayload) => void;
  onJobResize?: (jobId: string, startTime: string, endTime: string) => void;
  invoicedJobIds?: Set<string>;
}) {
  return (
    <DayBoardView
      jobs={jobs}
      teamMembers={teamMembers ?? []}
      currentDate={currentDate}
      onJobClick={onJobClick}
      onDayClick={onDayClick}
      onJobDrop={onJobDrop}
      onJobResize={onJobResize}
      filteredEmployeeIds={new Set()}
      invoicedJobIds={invoicedJobIds}
      phone
    />
  );
});

export const PhoneWeekList = memo(function PhoneWeekList({
  jobs, teamMembers, currentDate, onJobClick, agendaFooter = null, unscheduledCount = 0,
  onDayClick, invoicedJobIds = NO_INVOICED,
}: {
  jobs: JobWithClient[];
  teamMembers?: TeamMember[];
  currentDate: Date;
  onJobClick: (job: JobWithClient) => void;
  onDayClick?: (dateStr: string, employeeId?: string | null) => void;
  invoicedJobIds?: Set<string>;
  agendaFooter?: ReactNode;
  unscheduledCount?: number;
}) {
  const days = useMemo(
    () => scheduleWeekAgenda(jobs, currentDate),
    [jobs, currentDate],
  );

  return (
    <div className="hub-phone-week-list" data-schedule-week="1">
      <div className="hub-week-agenda" data-week-agenda="1">
      {days.map(day => {
        const date = parseISO(`${day.date}T00:00:00`);
        return (
          <section
            key={day.date}
            data-agenda-day={day.date}
            className={`hub-week-agenda-day${day.isToday ? ' is-today' : ''}`}
          >
            <h2 className="hub-week-agenda-head">
              {format(date, 'EEE d MMM')}
              {day.isToday ? <span className="hub-week-agenda-today">Today</span> : null}
            </h2>
            {day.jobs.length === 0 ? (
              <div className="hub-week-agenda-empty-day" data-agenda-empty={day.date}>
                <p className="hub-week-agenda-empty">Nothing booked</p>
                <button
                  type="button"
                  className="hub-week-agenda-book"
                  data-agenda-book={day.date}
                  onClick={() => onDayClick?.(day.date)}
                  onDragOver={e => { e.preventDefault(); }}
                  onDrop={e => {
                    e.preventDefault();
                    onDayClick?.(day.date);
                  }}
                >
                  Tap to book
                </button>
              </div>
            ) : (
              <ul className="hub-week-agenda-list">
                {day.jobs.map(job => {
                  const suburb = jobsListSuburbFromSite(jobsListSite(job.address, job.client_address));
                  const pill = schedulePill(job, invoicedJobIds);
                  const clock = scheduleAgendaClock(job.start_time, job.end_time, job.scheduled_date);
                  return (
                    <li key={job.id}>
                      <button
                        type="button"
                        data-schedule-job={job.id}
                        className="hub-week-agenda-row"
                        onClick={() => onJobClick(job)}
                      >
                        <span className="hub-week-agenda-time">
                          {clock} · {formatJobRef(job)}
                        </span>
                        <span className="hub-week-agenda-copy">
                          <span className="hub-week-agenda-title">{job.title}</span>
                          <span className="hub-week-agenda-meta hub-week-agenda-crew">
                            {[suburb, scheduleCrewLabel(job.assigned_team, teamMembers)].filter(Boolean).join(' · ')}
                          </span>
                          <span className="hub-jobs-phone-status hub-schedule-pill" data-kind={pill.kind}>
                            {pill.label}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
      </div>
      {unscheduledCount > 0 && agendaFooter ? (
        <div
          className="hub-phone-unscheduled-footer"
          data-schedule-unscheduled-after-week="1"
        >
          {agendaFooter}
        </div>
      ) : null}
    </div>
  );
});

// ── Day Board View ───────────────────────────────────────────────

export const DayBoardView = memo(function DayBoardView({
  jobs, teamMembers, currentDate, onJobClick, onDayClick, onJobDrop, onJobResize, filteredEmployeeIds,
  phone = false, invoicedJobIds,
}: BoardProps & { phone?: boolean }) {
  const [dragJobId, setDragJobId] = useState<string | null>(null);
  const [dropHoverId, setDropHoverId] = useState<string | null>(null);
  const [resizePreview, setResizePreview] = useState<{ jobId: string; start_time: string; end_time: string } | null>(null);
  const [hourWidth, setHourWidth] = useState(HOUR_WIDTH_PX);
  const dateStr = dateKey(currentDate);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dayJobs = useMemo(() => jobsOnScheduleDay(jobs, dateStr), [jobs, dateStr]);
  const dayStart = phone ? dayBoardStartHour(dayJobs) : DAY_START;
  const hours = useMemo(
    () => Array.from({ length: DAY_END - dayStart + 1 }, (_, i) => dayStart + i),
    [dayStart],
  );

  const rows = useMemo(() => {
    const r: { id: string; name: string; schedule_color?: string | null }[] = [];
    for (const m of teamMembers) {
      if (filteredEmployeeIds.size === 0 || filteredEmployeeIds.has(m.id)) {
        r.push({ id: m.id, name: weekBoardCrewLabel(m.name), schedule_color: m.schedule_color });
      }
    }
    r.push({ id: UNASSIGNED_ROW_ID, name: weekBoardCrewLabel('Unassigned') });
    return r;
  }, [teamMembers, filteredEmployeeIds]);

  const jobsByRow = useMemo(() => {
    const map = new Map<string, JobWithClient[]>();
    for (const row of rows) map.set(row.id, []);
    for (const job of jobsOnScheduleDay(jobs, dateStr)) {
      const assigned = asTeamIds(job.assigned_team);
      if (assigned.length === 0) {
        map.get(UNASSIGNED_ROW_ID)?.push(job);
      } else {
        for (const empId of assigned) {
          map.get(empId)?.push(job);
        }
      }
    }
    for (const [, list] of map) {
      list.sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'));
    }
    return map;
  }, [jobs, rows, dateStr]);


  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const apply = () => {
      const crewW = Number.parseFloat(getComputedStyle(el).getPropertyValue('--hub-day-crew')) || 104;
      const hoursW = Math.max(0, el.clientWidth - crewW);
      const next = dayBoardHourWidthPx(hoursW);
      setHourWidth(next);
      el.scrollLeft = dayBoardOpenScrollLeft({
        hoursFit: dayBoardHoursFit(hoursW),
        jobs: dayJobs,
        dayStart,
        hourWidth: next,
        isToday: isToday(currentDate),
      });
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [currentDate, dayJobs, dayStart]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const pin = () => {
      const scrollLeft = el.scrollLeft;
      const board = el.closest('.hub-day-board');
      board?.classList.toggle('is-track-end', scrollLeft + el.clientWidth >= el.scrollWidth - 1);
      for (const pinEl of el.querySelectorAll<HTMLElement>('[data-day-chip-pin="1"]')) {
        const bar = pinEl.closest('.absolute');
        if (!(bar instanceof HTMLElement)) continue;
        const left = Number.parseFloat(bar.style.left) || 0;
        const width = Number.parseFloat(bar.style.width) || 0;
        const inset = dayChipPinInset(scrollLeft, left, width);
        pinEl.style.transform = inset > 0 ? `translateX(${Math.round(inset)}px)` : '';
      }
    };
    pin();
    el.addEventListener('scroll', pin, { passive: true });
    return () => el.removeEventListener('scroll', pin);
  }, [hourWidth, jobs, dateStr, dayStart]);

  useEffect(() => {
    const clear = () => { setDragJobId(null); setDropHoverId(null); };
    window.addEventListener('dragend', clear);
    return () => window.removeEventListener('dragend', clear);
  }, []);

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData('text/plain', jobId);
    e.dataTransfer.effectAllowed = 'move';
    rememberDraggedJob(jobId);
    setDragJobId(jobId);
  };

  const assignmentForRow = (empId: string): string | null =>
    empId === UNASSIGNED_ROW_ID ? null : empId;

  const handleDrop = (e: React.DragEvent, empId: string, startTime?: string) => {
    e.preventDefault();
    const jobId = readDroppedJobId(e.dataTransfer);
    if (jobId && onJobDrop) {
      onJobDrop({
        jobId,
        date: dateStr,
        employeeId: assignmentForRow(empId),
        startTime,
      });
    }
    setDragJobId(null);
    setDropHoverId(null);
  };

  const handleTimeDrop = (e: React.DragEvent, empId: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const startTime = startTimeFromDropOffset(e.clientX - rect.left, {
      hourWidth,
      dayStart,
      dayEnd: DAY_END,
    });
    handleDrop(e, empId, startTime);
  };

  const beginResize = (e: React.PointerEvent, job: JobWithClient, edge: ResizeEdge, gridEl: HTMLElement) => {
    if (!onJobResize || !job.start_time) return;
    e.preventDefault();
    e.stopPropagation();
    const gridLeft = gridEl.getBoundingClientRect().left;
    const originStart = job.start_time;
    const originEnd = job.end_time;
    const pointerId = e.pointerId;

    const minutesAt = (clientX: number) => {
      const start = startTimeFromDropOffset(clientX - gridLeft, {
        hourWidth,
        dayStart,
        dayEnd: DAY_END,
      });
      return timeToMinutes(start) ?? dayStart * 60;
    };

    const applyPreview = (clientX: number) => {
      const next = resizeJobTimes(originStart, originEnd, edge, minutesAt(clientX));
      setResizePreview({ jobId: job.id, ...next });
    };

    applyPreview(e.clientX);
    e.currentTarget.setPointerCapture(pointerId);

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      applyPreview(ev.clientX);
    };
    const finish = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', finish);
      try { e.currentTarget.releasePointerCapture(pointerId); } catch { /* already released */ }
      const next = resizeJobTimes(originStart, originEnd, edge, minutesAt(ev.clientX));
      setResizePreview(null);
      onJobResize(job.id, next.start_time, next.end_time);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', finish);
  };

  const gridWidth = hours.length * hourWidth;
  const paintedRows = rows.map((row, rowIdx) => {
    const isUnassigned = row.id === UNASSIGNED_ROW_ID;
    const color = scheduleLaneColor(row.id, row.schedule_color);
    const rowJobs = jobsByRow.get(row.id) ?? [];
    const layout = placeDayRowJobs(rowJobs.map(job => ({
      id: job.id,
      start_time: job.start_time,
      end_time: job.end_time,
    })));
    const placementById = new Map(layout.placements.map(p => [p.id, p]));
    const height = dayRowHeightPx(layout.allDayCount, layout.timedLaneCount, {
      min: ROW_MIN, allDayH: ALL_DAY_H, timedH: TIMED_H, pad: ROW_PAD,
    });
    return {
      row,
      rowIdx,
      isUnassigned,
      color,
      rowJobs,
      layout,
      placementById,
      height,
      hovering: dropHoverId === row.id,
    };
  });

  return (
    <div className="ops-board hub-day-board" data-schedule-track="day" data-day-board="1" data-day-start={dayStart} data-day-phone={phone ? '1' : undefined}>
      <div
        ref={scrollRef}
        className="hub-day-track hub-day-crew-rail hub-day-hours job-cal-board-scroll"
        data-day-hours="1"
        style={{
          ['--hub-day-rows' as string]: paintedRows.map(p => `${p.height}px`).join(' '),
          gridTemplateColumns: `var(--hub-day-crew, 104px) ${gridWidth}px`,
        }}
      >
          <div className="hub-day-crew-lock hub-day-crew-head border-r border-b border-rule">
            <div className="px-3 flex items-center gap-1.5 h-full">
              <Users size={13} />
              <span className="hub-schedule-label">Crew</span>
            </div>
          </div>
          <div className="hub-day-hours-head flex border-b border-rule">
            {hours.map(h => (
              <div key={h} className="text-center border-r border-rule last:border-r-0"
                style={{ width: hourWidth }}>
                <div className="px-1 flex items-center justify-center h-full">
                  <span className="hub-schedule-label">{formatHourLabel(h)}</span>
                </div>
              </div>
            ))}
          </div>

          {paintedRows.map(painted => {
            const row = painted.row;
            return (
            <Fragment key={row.id}>
            <div
              data-crew-drop={row.id}
              data-unassigned-lock={painted.isUnassigned ? '1' : undefined}
              className={`hub-day-crew-lock border-r border-rule cursor-pointer hover:bg-zebra transition-colors flex items-start gap-2 px-3 ${
                painted.rowIdx < paintedRows.length - 1 ? 'border-b' : ''
              } ${painted.isUnassigned || painted.rowIdx % 2 !== 0 || painted.hovering ? 'bg-zebra' : 'bg-white'}`}
              style={{
                borderLeft: painted.isUnassigned ? '3px dashed var(--g-line-strong)' : `3px solid ${painted.color}`,
              }}
              onClick={() => onDayClick(dateStr, painted.isUnassigned ? null : row.id)}
              onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropHoverId(row.id); }}
              onDrop={e => { e.stopPropagation(); handleDrop(e, row.id); }}
            >
              <span
                className="ops-crew-mark"
                style={{
                  background: painted.isUnassigned ? 'transparent' : painted.color,
                  outline: painted.isUnassigned ? '1px solid var(--g-ink-muted)' : undefined,
                }}
              />
              <div className="min-w-0">
                <p className="hub-schedule-crew-name">{row.name}</p>
                <p className="ops-meta">{scheduleLaneCountLabel(row.id, painted.rowJobs.length)}</p>
                {painted.isUnassigned && painted.rowJobs.length === 0 ? (
                  <p className="ops-meta hub-day-drop-hint">Drop here — date stays</p>
                ) : null}
              </div>
            </div>
            <div
              data-crew-lane={painted.row.id}
              className={`${painted.rowIdx < paintedRows.length - 1 ? 'border-b border-rule' : ''} ${
                painted.isUnassigned || painted.rowIdx % 2 !== 0 || painted.hovering ? 'bg-zebra' : 'bg-white'
              }`}
              onDragOver={e => { e.preventDefault(); setDropHoverId(painted.row.id); }}
              onDrop={e => handleDrop(e, painted.row.id)}
            >
              <div
                data-day-grid="1"
                data-day-empty="1"
                className="relative cursor-pointer h-full"
                style={{ width: gridWidth }}
                onClick={() => onDayClick(dateStr, painted.isUnassigned ? null : painted.row.id)}
                onDragOver={e => { e.preventDefault(); setDropHoverId(painted.row.id); }}
                onDrop={e => handleTimeDrop(e, painted.row.id)}
              >
                {hours.map(h => (
                  <div
                    key={h}
                    className="absolute top-0 bottom-0 border-r border-rule last:border-r-0"
                    style={{ left: (h - dayStart) * hourWidth, width: hourWidth }}
                  />
                ))}

                {isToday(currentDate) && <CurrentTimeVerticalIndicator hourWidth={hourWidth} dayStart={dayStart} />}

                {painted.rowJobs.map(job => {
                  const placed = painted.placementById.get(job.id);
                  if (!placed) return null;
                  if (placed.allDay) {
                    return (
                      <div
                        key={job.id}
                        className="absolute"
                        data-untimed-chip={job.id}
                        style={{
                          left: 2,
                          width: gridWidth - 4,
                          top: ROW_PAD + placed.lane * ALL_DAY_H,
                          height: ALL_DAY_H - 4,
                        }}
                      >
                        <JobBlock
                          job={job}
                          teamMembers={teamMembers}
                          compact
                          dragging={dragJobId === job.id}
                          laneColor={painted.color}
                          invoicedJobIds={invoicedJobIds}
                          onClick={() => onJobClick(job)}
                          onDragStart={e => handleDragStart(e, job.id)}
                        />
                      </div>
                    );
                  }
                  const plot = schedulePlotTimes(job);
                  const preview = resizePreview?.jobId === job.id ? resizePreview : null;
                  const startM = timeToMinutes(preview?.start_time ?? plot.start_time);
                  const endM = timeToMinutes(preview?.end_time ?? plot.end_time) ?? (startM ?? dayStart * 60) + 60;
                  if (startM == null) return null;
                  const left = Math.max(0, (startM / 60 - dayStart) * hourWidth + 2);
                  const width = Math.max(60, ((endM - startM) / 60) * hourWidth - 4);
                  const top = ROW_PAD + painted.layout.allDayCount * ALL_DAY_H + placed.lane * TIMED_H;
                  const displayJob = preview
                    ? { ...job, start_time: preview.start_time, end_time: preview.end_time }
                    : job;
                  return (
                    <div
                      key={job.id}
                      className="absolute"
                      style={{ left, width, top, height: TIMED_H - 4 }}
                    >
                      {onJobResize && plot.stored && (
                        <>
                          <div
                            role="separator"
                            aria-label="Drag to change start time"
                            className="hub-day-resize hub-day-resize-start absolute left-0 top-0 bottom-0 w-2 z-10 cursor-ew-resize rounded-l"
                            onPointerDown={e => {
                              const grid = (e.currentTarget as HTMLElement).closest('[data-day-grid]');
                              if (grid instanceof HTMLElement) beginResize(e, job, 'start', grid);
                            }}
                            onClick={e => e.stopPropagation()}
                            onDragStart={e => e.preventDefault()}
                          />
                          <div
                            role="separator"
                            aria-label="Drag to change finish time"
                            className="hub-day-resize hub-day-resize-end absolute right-0 top-0 bottom-0 w-2 z-10 cursor-ew-resize rounded-r"
                            onPointerDown={e => {
                              const grid = (e.currentTarget as HTMLElement).closest('[data-day-grid]');
                              if (grid instanceof HTMLElement) beginResize(e, job, 'end', grid);
                            }}
                            onClick={e => e.stopPropagation()}
                            onDragStart={e => e.preventDefault()}
                          />
                        </>
                      )}
                      <JobBlock
                        job={displayJob}
                        teamMembers={teamMembers}
                        compact={width < 120}
                        dragging={dragJobId === job.id}
                        laneColor={painted.color}
                        invoicedJobIds={invoicedJobIds}
                        onClick={() => onJobClick(job)}
                        onDragStart={e => handleDragStart(e, job.id)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            </Fragment>
            );
          })}
      </div>
    </div>
  );
});

function useScheduleNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function CurrentTimeVerticalIndicator({ hourWidth, dayStart }: { hourWidth: number; dayStart: number }) {
  const now = useScheduleNow();
  const h = now.getHours() + now.getMinutes() / 60;
  if (h < dayStart || h > DAY_END) return null;
  const left = (h - dayStart) * hourWidth;
  return (
    <div className="absolute top-0 bottom-0 z-20 pointer-events-none" style={{ left }}>
      <div className="flex flex-col items-center h-full">
        <div className="hub-day-now-dot w-2 h-2 rounded-full -mt-1" />
        <div className="hub-day-now-line flex-1" />
      </div>
    </div>
  );
}

// ── Week Board View ──────────────────────────────────────────────

export const WeekBoardView = memo(function WeekBoardView({
  jobs, teamMembers, currentDate, onJobClick, onDayClick, onJobDrop, filteredEmployeeIds, onSelectDay,
  invoicedJobIds,
}: BoardProps) {
  const [dragJobId, setDragJobId] = useState<string | null>(null);
  const [dropHoverKey, setDropHoverKey] = useState<string | null>(null);
  const days = scheduleWeekDays(currentDate);
  const rows = useMemo(
    () => weekBoardRows(jobs, teamMembers, currentDate, filteredEmployeeIds),
    [jobs, teamMembers, currentDate, filteredEmployeeIds],
  );

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData('text/plain', jobId);
    e.dataTransfer.effectAllowed = 'move';
    rememberDraggedJob(jobId);
    setDragJobId(jobId);
  };

  useEffect(() => {
    const clear = () => { setDragJobId(null); setDropHoverKey(null); };
    window.addEventListener('dragend', clear);
    return () => window.removeEventListener('dragend', clear);
  }, []);

  const handleDrop = (e: React.DragEvent, date: string, crewId: string) => {
    e.preventDefault();
    const jobId = readDroppedJobId(e.dataTransfer);
    if (jobId && onJobDrop) {
      onJobDrop({
        jobId,
        date,
        employeeId: crewId === WEEK_UNASSIGNED_CREW_ID ? null : crewId,
      });
    }
    setDragJobId(null);
    setDropHoverKey(null);
  };

  const openDay = (dateStr: string) => {
    if (onSelectDay) onSelectDay(parseISO(`${dateStr}T00:00:00`));
    else onDayClick(dateStr);
  };

  const weekendJobs = weekHasWeekendJobs(rows);
  const now = useScheduleNow();

  return (
    <div className="ops-board hub-week-board" data-schedule-week="1" data-week-board="1">
      <div className="hub-week-grid" data-weekend-jobs={weekendJobs ? '1' : '0'}>
        <div className="hub-week-corner">
          <span className="hub-schedule-label">Crew</span>
        </div>
        {days.map(day => {
          const ds = dateKey(day);
          const today = isToday(day);
          const weekend = day.getDay() === 0 || day.getDay() === 6;
          return (
            <button
              key={ds}
              type="button"
              data-week-day={ds}
              onClick={() => openDay(ds)}
              className={`hub-week-head ${today ? 'is-today' : ''} ${weekend ? 'is-weekend' : ''}`}
            >
              <span className="hub-week-head-full">{format(day, 'EEE d MMM')}</span>
              <span className="hub-week-head-short">
                <span className="hub-week-head-dow">{format(day, 'EEE')}</span>
                <span className="hub-week-head-dom">{format(day, 'd')}</span>
              </span>
              {today ? <span className="hub-week-now">Now {scheduleNowMark(now)}</span> : null}
            </button>
          );
        })}
        {rows.map(row => {
          const member = teamMembers.find(item => item.id === row.crewId);
          const laneColor = scheduleLaneColor(row.crewId, member?.schedule_color);
          return (
          <div key={row.crewId} className="contents">
            <div className="hub-week-crew" data-week-crew={row.crewId}>
              <span
                className="ops-crew-mark"
                style={{
                  background: row.crewId === WEEK_UNASSIGNED_CREW_ID ? 'transparent' : laneColor,
                  outline: row.crewId === WEEK_UNASSIGNED_CREW_ID ? '1px solid var(--g-ink-muted)' : undefined,
                }}
              />
              <div className="min-w-0">
                <p className="hub-schedule-crew-name" data-week-crew-label={row.crewName}>{row.crewName}</p>
                <p className="ops-meta">{scheduleLaneCountLabel(row.crewId, scheduleLaneJobCount(row))}</p>
              </div>
            </div>
            {row.cells.map((cell, index) => {
              const hoverKey = `${row.crewId}:${cell.date}`;
              const hovering = dropHoverKey === hoverKey;
              const crewId = row.crewId === WEEK_UNASSIGNED_CREW_ID ? null : row.crewId;
              const weekend = index >= 5;
              return (
                <div
                  key={hoverKey}
                  data-week-cell={`${row.crewId}:${cell.date}`}
                  onDragOver={e => { e.preventDefault(); setDropHoverKey(hoverKey); }}
                  onDrop={e => handleDrop(e, cell.date, row.crewId)}
                  onClick={() => onDayClick(cell.date, crewId)}
                  className={`hub-week-cell ${hovering ? 'is-hover' : ''} ${cell.chips.length === 0 ? 'is-empty' : ''} ${weekend ? 'is-weekend' : ''}`}
                >
                  {cell.jobs.map(job => (
                    <WeekJobChip
                      key={job.id}
                      job={job}
                      familyJobs={jobs}
                      dragging={dragJobId === job.id}
                      laneColor={laneColor}
                      invoicedJobIds={invoicedJobIds}
                      onClick={() => onJobClick(job)}
                      onDragStart={e => handleDragStart(e, job.id)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
          );
        })}
      </div>
    </div>
  );
});
