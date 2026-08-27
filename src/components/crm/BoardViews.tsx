import { useState, useMemo, useRef, memo, useEffect } from 'react';
import type { JobWithClient } from '../../types/crm';
import { JOB_STATUS_LABELS, JOB_STATUS_RAIL, JOB_STATUS_STYLES } from '../../types/crm';
import { getReadableText, pickEmployeeColor } from '../../lib/jobColors';
import { colors } from '../../lib/colors';
import { boardDispatchHint, jobCardHint } from '../../lib/jobNextAction';
import { OpsSiteRow, OpsStatus, opsSiteLabel } from '../ui/OpsCard';
import {
  startTimeFromDropOffset,
  placeDayRowJobs,
  dayRowHeightPx,
  UNASSIGNED_ROW_ID,
  DAY_START_HOUR,
  DAY_END_HOUR,
  HOUR_WIDTH_PX,
  timeToMinutes,
  resizeJobTimes,
  rememberDraggedJob,
  readDroppedJobId,
  consumeDragExclusiveAssign,
  type JobDropPayload,
  type ResizeEdge,
} from '../../lib/dispatch';
import { format, isToday, parseISO } from 'date-fns';
import { Clock, Users } from 'lucide-react';
import { JobCalendarOverflow } from '../jobs/JobCalendarOverflow';
import { calendarSite } from '../../lib/jobCalendar';
import { formatJobRef } from '../../lib/jobRef';
import {
  jobsOnScheduleDay,
  scheduleClockLabel,
  scheduleCrewLabel,
  scheduleDateKey,
  scheduleDayKey,
  scheduleWeekDays,
  weekBoardChip,
  weekBoardRows,
  WEEK_UNASSIGNED_CREW_ID,
} from '../../lib/scheduleBoard';

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
  onDayClick: (dateStr: string, employeeId?: string) => void;
  onJobDrop?: (drop: JobDropPayload) => void;
  onJobResize?: (jobId: string, startTime: string, endTime: string) => void;
  filteredEmployeeIds: Set<string>;
  onSelectDay?: (date: Date) => void;
}

const HOUR_WIDTH = HOUR_WIDTH_PX;
const DAY_START = DAY_START_HOUR;
const DAY_END = DAY_END_HOUR;
const HOURS = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);
const LABEL_WIDTH = 168;
const ALL_DAY_H = 56;
const TIMED_H = 72;
const ROW_PAD = 6;
const ROW_MIN = 72;

function dateKey(d: Date): string {
  return scheduleDateKey(d);
}

function jobDateKey(job: JobWithClient): string | null {
  return scheduleDayKey(job.scheduled_date);
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
}

const JobBlock = memo(function JobBlock({
  job, teamMembers, onClick, onDragStart, compact, dragging, fill = true, detail = false,
}: JobBlockProps) {
  const rail = JOB_STATUS_RAIL[job.status];
  const hint = boardDispatchHint(job);
  const next = hint ?? jobCardHint(job);
  const site = opsSiteLabel(job.address, job.client_address);
  const clock = scheduleClockLabel(job.start_time, job.end_time);
  const crew = scheduleCrewLabel(job.assigned_team, teamMembers);

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
      className={`${fill ? 'absolute left-1 right-1' : 'w-full'} ops-card job-cal-host ops-card-hover cursor-pointer active:scale-[0.98] ${
        dragging ? 'opacity-40' : ''
      }`}
      style={{ borderLeftWidth: 3, borderLeftColor: rail }}
    >
      <div className="px-1.5 py-1 text-left relative">
        {compact ? (
          <div className="absolute top-0 right-0 z-10">
            <JobCalendarOverflow
              job={job}
              site={calendarSite(job.address, job.client_address)}
              members={teamMembers}
            />
          </div>
        ) : (
          <div className="flex items-start justify-between gap-1 mb-1">
            <OpsStatus className={JOB_STATUS_STYLES[job.status]}>{JOB_STATUS_LABELS[job.status]}</OpsStatus>
            <JobCalendarOverflow
              job={job}
              site={calendarSite(job.address, job.client_address)}
              members={teamMembers}
            />
          </div>
        )}
        <p className={`${compact ? 'hub-schedule-ref pr-10' : 'hub-schedule-ref'} truncate`}>
          {compact && clock ? `${clock} · ` : ''}
          {formatJobRef(job)} | {site}
        </p>
        {!compact && job.title && (
          <p className="ops-meta mt-0.5 truncate">{job.title}</p>
        )}
        {!compact && clock && (
          <p className="ops-meta mt-0.5 flex items-center gap-0.5">
            <Clock size={12} /> {clock}
          </p>
        )}
        {!compact && (
          <p className="ops-meta mt-0.5 flex items-center gap-0.5 truncate">
            <Users size={12} /> {crew}
          </p>
        )}
        <span className={`mt-1 ${detail ? 'hub-schedule-next' : 'hub-schedule-next is-compact'}`}>{next}</span>
      </div>
    </div>
  );
});

// ── Unscheduled tray (jobs that would otherwise vanish) ──────────

export const NeedsDateRail = memo(function NeedsDateRail({
  jobs, teamMembers, onJobClick, onDragStart, alwaysShow = false, className = '',
}: {
  jobs: JobWithClient[];
  teamMembers?: TeamMember[];
  onJobClick: (job: JobWithClient) => void;
  onDragStart: (e: React.DragEvent, jobId: string) => void;
  alwaysShow?: boolean;
  className?: string;
}) {
  if (jobs.length === 0 && !alwaysShow) return null;

  return (
    <div className={`ops-tray ${className}`.trim()}>
      <div className="ops-tray-head">
        <p className="ops-card-kicker">Unscheduled</p>
        <span className="ops-meta">{jobs.length}</span>
      </div>
      <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
        {jobs.length === 0 ? (
          <p className="ops-meta px-1 py-2">No unscheduled jobs.</p>
        ) : (
          jobs.map(job => {
            const site = opsSiteLabel(job.address, job.client_address);
            return (
              <div
                key={job.id}
                role="button"
                tabIndex={0}
                draggable
                onDragStart={e => onDragStart(e, job.id)}
                onClick={() => onJobClick(job)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onJobClick(job);
                  }
                }}
                data-schedule-job={job.id}
                className="ops-card job-cal-host ops-card-hover w-full text-left active:scale-[0.98] cursor-pointer"
                style={{ borderLeftWidth: 3, borderLeftColor: JOB_STATUS_RAIL[job.status] }}
              >
                <div className="ops-card-body">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="hub-schedule-ref truncate">{formatJobRef(job)} | {site}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      <OpsStatus className={JOB_STATUS_STYLES[job.status]}>{JOB_STATUS_LABELS[job.status]}</OpsStatus>
                      <JobCalendarOverflow
                        job={job}
                        site={calendarSite(job.address, job.client_address)}
                        members={teamMembers}
                      />
                    </div>
                  </div>
                  <div className="ops-card-footer">
                    <span className="hub-schedule-next">Set a date</span>
                  </div>
                  {job.client_name && <p className="ops-meta mt-1.5 truncate">{job.client_name}</p>}
                  {job.title && <p className="ops-meta mt-0.5 truncate">{job.title}</p>}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
});

// ── Hour plot (empty days keep the tracker; never swap to copy) ──

function crewRowsForPlot(teamMembers?: TeamMember[]) {
  const rows: { id: string; name: string; schedule_color?: string | null }[] = [
    { id: UNASSIGNED_ROW_ID, name: 'Unassigned' },
  ];
  for (const member of teamMembers ?? []) {
    rows.push({ id: member.id, name: member.name, schedule_color: member.schedule_color });
  }
  return rows;
}

/** Same hour × crew track as an empty DayBoardView. */
function ScheduleDayHourPlot({ teamMembers }: { teamMembers?: TeamMember[] }) {
  const rows = crewRowsForPlot(teamMembers);
  const gridWidth = HOURS.length * HOUR_WIDTH;

  return (
    <div className="overflow-x-auto job-cal-board-scroll hub-schedule-track" data-day-grid="1" data-schedule-track="day">
      <div className="flex border-b border-rule">
        <div className="shrink-0 border-r border-rule bg-zebra" style={{ width: LABEL_WIDTH }}>
          <div className="px-3 py-2 flex items-center gap-1.5">
            <Users size={13} />
            <span className="hub-schedule-label">Crew</span>
          </div>
        </div>
        <div className="flex" style={{ minWidth: gridWidth }}>
          {HOURS.map(h => (
            <div
              key={h}
              className="text-center border-r border-rule last:border-r-0"
              style={{ width: HOUR_WIDTH }}
            >
              <div className="px-1 py-2">
                <span className="hub-schedule-label">{formatHourLabel(h)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      {rows.map((row, rowIdx) => {
        const isUnassigned = row.id === UNASSIGNED_ROW_ID;
        const color = isUnassigned ? colors.accent : pickEmployeeColor(row.id, row.schedule_color);
        return (
          <div
            key={row.id}
            className={`flex ${rowIdx < rows.length - 1 ? 'border-b border-rule' : ''} ${
              isUnassigned ? 'bg-zebra' : rowIdx % 2 === 0 ? 'bg-white' : 'bg-zebra'
            }`}
          >
            <div
              className="shrink-0 border-r border-rule flex items-center gap-2 px-3"
              style={{
                width: LABEL_WIDTH,
                height: ROW_MIN,
                borderLeft: isUnassigned ? `3px dashed ${colors.navy}` : `3px solid ${color}`,
              }}
            >
              <span
                className="ops-crew-mark"
                style={{
                  background: isUnassigned ? 'transparent' : color,
                  outline: isUnassigned ? `1px solid ${colors.navy}` : undefined,
                }}
              />
              <div className="min-w-0">
                <p className="hub-schedule-crew-name truncate">{row.name}</p>
              </div>
            </div>
            <div className="relative" style={{ width: gridWidth, height: ROW_MIN }}>
              {HOURS.map(h => (
                <div
                  key={h}
                  className="absolute top-0 bottom-0 border-r border-rule last:border-r-0"
                  style={{ left: (h - DAY_START) * HOUR_WIDTH, width: HOUR_WIDTH }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WeekJobChip({
  job,
  familyJobs,
  dragging,
  onClick,
  onDragStart,
}: {
  job: JobWithClient;
  familyJobs: JobWithClient[];
  dragging?: boolean;
  onClick: () => void;
  onDragStart?: (e: React.DragEvent) => void;
}) {
  const chip = weekBoardChip(job, familyJobs);
  const ink = getReadableText(chip.color);
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
      className={`hub-week-chip ${dragging ? 'is-dragging' : ''}`}
      style={{ background: chip.color, color: ink }}
    >
      <span className="hub-week-chip-ref">{chip.ref}</span>
      {chip.description ? <span className="hub-week-chip-desc">{chip.description}</span> : null}
    </div>
  );
}

// ── Phone day list ───────────────────────────────────────────────

function PhoneJobCard({
  job, teamMembers, onJobClick, onDragStart,
}: {
  job: JobWithClient;
  teamMembers?: TeamMember[];
  onJobClick: (job: JobWithClient) => void;
  onDragStart: (e: React.DragEvent, jobId: string) => void;
}) {
  const site = opsSiteLabel(job.address, job.client_address);
  const mapsQuery = (job.address || job.client_address)?.trim() || null;
  const next = boardDispatchHint(job) ?? jobCardHint(job);
  const clock = scheduleClockLabel(job.start_time, job.end_time);
  const crew = scheduleCrewLabel(job.assigned_team, teamMembers);
  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      data-schedule-job={job.id}
      onDragStart={e => onDragStart(e, job.id)}
      onClick={() => onJobClick(job)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onJobClick(job);
        }
      }}
      className="ops-card job-cal-host ops-card-hover w-full text-left cursor-pointer"
      style={{ borderLeftWidth: 4, borderLeftColor: JOB_STATUS_RAIL[job.status] }}
    >
      <div className="ops-card-body">
        <div className="flex items-start justify-between gap-2 mb-1">
          <p className="hub-schedule-ref truncate">{formatJobRef(job)} | {site}</p>
          <div className="flex items-center gap-1 shrink-0">
            <OpsStatus className={JOB_STATUS_STYLES[job.status]}>{JOB_STATUS_LABELS[job.status]}</OpsStatus>
            <JobCalendarOverflow
              job={job}
              site={calendarSite(job.address, job.client_address)}
              members={teamMembers}
            />
          </div>
        </div>
        <OpsSiteRow site={site} phone={job.client_phone} mapsQuery={mapsQuery} />
        <div className="ops-card-footer">
          <span className="hub-schedule-next">{next}</span>
        </div>
        <div className="mt-2 space-y-0.5">
          {clock && (
            <p className="ops-meta flex items-center gap-1">
              <Clock size={12} /> {clock}
            </p>
          )}
          <p className="ops-meta flex items-center gap-1 truncate">
            <Users size={12} /> {crew}
          </p>
          {job.client_name && <p className="ops-meta truncate">{job.client_name}</p>}
          {job.title && <p className="ops-meta truncate">{job.title}</p>}
        </div>
      </div>
    </div>
  );
}

export const PhoneDayList = memo(function PhoneDayList({
  jobs, teamMembers, currentDate, onJobClick, onDragStart,
}: {
  jobs: JobWithClient[];
  teamMembers?: TeamMember[];
  currentDate: Date;
  onJobClick: (job: JobWithClient) => void;
  onDragStart: (e: React.DragEvent, jobId: string) => void;
}) {
  const dateStr = dateKey(currentDate);
  const dayJobs = useMemo(() => jobsOnScheduleDay(jobs, dateStr), [jobs, dateStr]);

  return (
    <div className="space-y-2" data-schedule-day={dateStr}>
      <h2 className="hub-schedule-label">
        {format(currentDate, 'EEEE d MMM')}
        <span className="hub-schedule-count"> ({dayJobs.length})</span>
      </h2>
      {dayJobs.length === 0 ? (
        <ScheduleDayHourPlot teamMembers={teamMembers} />
      ) : (
        dayJobs.map(job => (
          <PhoneJobCard
            key={job.id}
            job={job}
            teamMembers={teamMembers}
            onJobClick={onJobClick}
            onDragStart={onDragStart}
          />
        ))
      )}
    </div>
  );
});

export const PhoneWeekList = memo(function PhoneWeekList({
  jobs, teamMembers, currentDate, onJobClick, onDragStart: _onDragStart, onSelectDay, onDayClick, onJobDrop,
}: {
  jobs: JobWithClient[];
  teamMembers?: TeamMember[];
  currentDate: Date;
  onJobClick: (job: JobWithClient) => void;
  onDragStart: (e: React.DragEvent, jobId: string) => void;
  onSelectDay: (date: Date) => void;
  onDayClick: (dateStr: string, employeeId?: string) => void;
  onJobDrop?: (drop: JobDropPayload) => void;
}) {
  return (
    <WeekBoardView
      jobs={jobs}
      teamMembers={teamMembers ?? []}
      currentDate={currentDate}
      onJobClick={onJobClick}
      onDayClick={onDayClick}
      onSelectDay={onSelectDay}
      onJobDrop={onJobDrop}
      filteredEmployeeIds={new Set()}
    />
  );
});

// ── Day Board View ───────────────────────────────────────────────

export const DayBoardView = memo(function DayBoardView({
  jobs, teamMembers, currentDate, onJobClick, onDayClick, onJobDrop, onJobResize, filteredEmployeeIds,
}: BoardProps) {
  const [dragJobId, setDragJobId] = useState<string | null>(null);
  const [dropHoverId, setDropHoverId] = useState<string | null>(null);
  const [resizePreview, setResizePreview] = useState<{ jobId: string; start_time: string; end_time: string } | null>(null);
  const dateStr = dateKey(currentDate);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const r: { id: string; name: string; schedule_color?: string | null }[] = [
      { id: UNASSIGNED_ROW_ID, name: 'Unassigned' },
    ];
    for (const m of teamMembers) {
      if (filteredEmployeeIds.size === 0 || filteredEmployeeIds.has(m.id)) {
        r.push({ id: m.id, name: m.name, schedule_color: m.schedule_color });
      }
    }
    return r;
  }, [teamMembers, filteredEmployeeIds]);

  const jobsByRow = useMemo(() => {
    const map = new Map<string, JobWithClient[]>();
    for (const row of rows) map.set(row.id, []);
    for (const job of jobs) {
      if (jobDateKey(job) !== dateStr) continue;
      const assigned = job.assigned_team ?? [];
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

  const unassignedCount = jobsByRow.get(UNASSIGNED_ROW_ID)?.length ?? 0;

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = 0;
  }, [currentDate]);

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
    const exclusiveAssign = consumeDragExclusiveAssign();
    const jobId = readDroppedJobId(e.dataTransfer);
    if (jobId && onJobDrop) {
      onJobDrop({
        jobId,
        date: dateStr,
        employeeId: assignmentForRow(empId),
        startTime,
        exclusiveAssign,
      });
    }
    setDragJobId(null);
    setDropHoverId(null);
  };

  const handleTimeDrop = (e: React.DragEvent, empId: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const startTime = startTimeFromDropOffset(e.clientX - rect.left, {
      hourWidth: HOUR_WIDTH,
      dayStart: DAY_START,
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
        hourWidth: HOUR_WIDTH,
        dayStart: DAY_START,
        dayEnd: DAY_END,
      });
      return timeToMinutes(start) ?? DAY_START * 60;
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

  const gridWidth = HOURS.length * HOUR_WIDTH;

  return (
    <div className="ops-board">
      <div className="hub-schedule-board-head">
        <p className="hub-schedule-range">
          {format(currentDate, 'EEEE, d MMMM yyyy')}
          {isToday(currentDate) && (
            <span className="ml-2 ops-status ops-status-info">
              TODAY
            </span>
          )}
        </p>
        <p className="ops-meta">
          {unassignedCount > 0
            ? `${unassignedCount} unassigned · drop on a person to add them`
            : 'Search a job, drop it on a person or a time · drag the ends to change duration'}
        </p>
      </div>

      <div ref={scrollRef} className="overflow-x-auto job-cal-board-scroll">
        <div className="flex sticky top-0 z-20 bg-white border-b border-rule">
          <div className="shrink-0 border-r border-rule bg-zebra" style={{ width: LABEL_WIDTH }}>
            <div className="px-3 py-2 flex items-center gap-1.5">
              <Users size={13} />
              <span className="hub-schedule-label">Crew</span>
            </div>
          </div>
          <div className="flex" style={{ minWidth: gridWidth }}>
            {HOURS.map(h => (
              <div key={h} className="text-center border-r border-rule last:border-r-0"
                style={{ width: HOUR_WIDTH }}>
                <div className="px-1 py-2">
                  <span className="hub-schedule-label">{formatHourLabel(h)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {rows.map((row, rowIdx) => {
          const isUnassigned = row.id === UNASSIGNED_ROW_ID;
          const color = isUnassigned ? colors.accent : pickEmployeeColor(row.id, row.schedule_color);
          const rowJobs = jobsByRow.get(row.id) ?? [];
          const layout = placeDayRowJobs(rowJobs);
          const placementById = new Map(layout.placements.map(p => [p.id, p]));
          const height = dayRowHeightPx(layout.allDayCount, layout.timedLaneCount, {
            min: ROW_MIN, allDayH: ALL_DAY_H, timedH: TIMED_H, pad: ROW_PAD,
          });
          const hovering = dropHoverId === row.id;

          return (
            <div
              key={row.id}
              className={`flex ${rowIdx < rows.length - 1 ? 'border-b border-rule' : ''} ${
                isUnassigned ? 'bg-zebra' : rowIdx % 2 === 0 ? 'bg-white' : 'bg-zebra'
              } ${hovering ? 'bg-zebra' : ''}`}
              onDragOver={e => { e.preventDefault(); setDropHoverId(row.id); }}
              onDrop={e => handleDrop(e, row.id)}
            >
              <div
                data-crew-drop={row.id}
                className="shrink-0 border-r border-rule cursor-pointer hover:bg-zebra transition-colors flex items-center gap-2 px-3"
                style={{
                  width: LABEL_WIDTH,
                  height,
                  borderLeft: isUnassigned ? `3px dashed ${colors.navy}` : `3px solid ${color}`,
                }}
                onClick={() => onDayClick(dateStr, isUnassigned ? undefined : row.id)}
                onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropHoverId(row.id); }}
                onDrop={e => { e.stopPropagation(); handleDrop(e, row.id); }}
              >
                <span
                  className="ops-crew-mark"
                  style={{
                    background: isUnassigned ? 'transparent' : color,
                    outline: isUnassigned ? `1px solid ${colors.navy}` : undefined,
                  }}
                />
                <div className="min-w-0">
                  <p className="hub-schedule-crew-name truncate">{row.name}</p>
                  <p className="ops-meta">
                    {isUnassigned
                      ? (rowJobs.length === 0 ? 'Drop here — date stays' : `${rowJobs.length} · needs crew`)
                      : `${rowJobs.length} job${rowJobs.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>

              <div
                data-day-grid="1"
                className="relative cursor-pointer"
                style={{ width: gridWidth, height }}
                onClick={() => onDayClick(dateStr, isUnassigned ? undefined : row.id)}
                onDragOver={e => { e.preventDefault(); setDropHoverId(row.id); }}
                onDrop={e => handleTimeDrop(e, row.id)}
              >
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute top-0 bottom-0 border-r border-rule last:border-r-0"
                    style={{ left: (h - DAY_START) * HOUR_WIDTH, width: HOUR_WIDTH }}
                  />
                ))}

                {isToday(currentDate) && <CurrentTimeVerticalIndicator />}

                {rowJobs.map(job => {
                  const placed = placementById.get(job.id);
                  if (!placed) return null;
                  if (placed.allDay) {
                    return (
                      <div
                        key={job.id}
                        className="absolute left-1 right-1"
                        style={{ top: ROW_PAD + placed.lane * ALL_DAY_H, height: ALL_DAY_H - 2 }}
                      >
                        <JobBlock
                          job={job}
                          teamMembers={teamMembers}
                          compact
                          dragging={dragJobId === job.id}
                          onClick={() => onJobClick(job)}
                          onDragStart={e => handleDragStart(e, job.id)}
                        />
                      </div>
                    );
                  }
                  const preview = resizePreview?.jobId === job.id ? resizePreview : null;
                  const startM = timeToMinutes(preview?.start_time ?? job.start_time);
                  const endM = timeToMinutes(preview?.end_time ?? job.end_time) ?? (startM ?? DAY_START * 60) + 60;
                  if (startM == null) return null;
                  const left = Math.max(0, (startM / 60 - DAY_START) * HOUR_WIDTH + 2);
                  const width = Math.max(60, ((endM - startM) / 60) * HOUR_WIDTH - 4);
                  const top = ROW_PAD + layout.allDayCount * ALL_DAY_H + placed.lane * TIMED_H;
                  const displayJob = preview
                    ? { ...job, start_time: preview.start_time, end_time: preview.end_time }
                    : job;
                  return (
                    <div
                      key={job.id}
                      className="absolute"
                      style={{ left, width, top, height: TIMED_H - 4 }}
                    >
                      {onJobResize && (
                        <>
                          <div
                            role="separator"
                            aria-label="Drag to change start time"
                            className="absolute left-0 top-0 bottom-0 w-2 z-10 cursor-ew-resize hover:bg-navy/25 rounded-l"
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
                            className="absolute right-0 top-0 bottom-0 w-2 z-10 cursor-ew-resize hover:bg-navy/25 rounded-r"
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
                        onClick={() => onJobClick(job)}
                        onDragStart={e => handleDragStart(e, job.id)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

function CurrentTimeVerticalIndicator() {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  if (h < DAY_START || h > DAY_END) return null;
  const left = (h - DAY_START) * HOUR_WIDTH;
  return (
    <div className="absolute top-0 bottom-0 z-20 pointer-events-none" style={{ left }}>
      <div className="flex flex-col items-center h-full">
        <div className="w-2 h-2 rounded-full bg-accent -mt-1" />
        <div className="flex-1 w-px bg-accent" />
      </div>
    </div>
  );
}

// ── Week Board View ──────────────────────────────────────────────

export const WeekBoardView = memo(function WeekBoardView({
  jobs, teamMembers, currentDate, onJobClick, onDayClick, onJobDrop, filteredEmployeeIds, onSelectDay,
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
    const exclusiveAssign = consumeDragExclusiveAssign();
    const jobId = readDroppedJobId(e.dataTransfer);
    if (jobId && onJobDrop) {
      onJobDrop({
        jobId,
        date,
        employeeId: crewId === WEEK_UNASSIGNED_CREW_ID ? null : crewId,
        exclusiveAssign,
      });
    }
    setDragJobId(null);
    setDropHoverKey(null);
  };

  const openDay = (dateStr: string) => {
    if (onSelectDay) onSelectDay(parseISO(`${dateStr}T00:00:00`));
    else onDayClick(dateStr);
  };

  return (
    <div className="ops-board hub-week-board" data-schedule-week="1" data-week-board="1">
      <div className="hub-schedule-board-head">
        <p className="hub-schedule-label">This week</p>
        <p className="ops-meta">
          Drag a chip onto a crew and day. Empty slots stay empty.
        </p>
      </div>
      <div className="hub-week-grid">
        <div className="hub-week-corner" />
        {days.map(day => {
          const ds = dateKey(day);
          const today = isToday(day);
          return (
            <button
              key={ds}
              type="button"
              data-week-day={ds}
              onClick={() => openDay(ds)}
              className={`hub-week-head ${today ? 'is-today' : ''}`}
            >
              {format(day, 'EEE d MMM')}
            </button>
          );
        })}
        {rows.map(row => (
          <div key={row.crewId} className="contents">
            <div className="hub-week-crew" data-week-crew={row.crewId}>
              <p className="hub-schedule-crew-name truncate">{row.crewName}</p>
            </div>
            {row.cells.map(cell => {
              const hoverKey = `${row.crewId}:${cell.date}`;
              const hovering = dropHoverKey === hoverKey;
              const crewId = row.crewId === WEEK_UNASSIGNED_CREW_ID ? undefined : row.crewId;
              return (
                <div
                  key={hoverKey}
                  data-week-cell={`${row.crewId}:${cell.date}`}
                  onDragOver={e => { e.preventDefault(); setDropHoverKey(hoverKey); }}
                  onDrop={e => handleDrop(e, cell.date, row.crewId)}
                  onClick={() => onDayClick(cell.date, crewId)}
                  className={`hub-week-cell ${hovering ? 'is-hover' : ''} ${cell.chips.length === 0 ? 'is-empty' : ''}`}
                >
                  {cell.jobs.map(job => (
                    <WeekJobChip
                      key={job.id}
                      job={job}
                      familyJobs={jobs}
                      dragging={dragJobId === job.id}
                      onClick={() => onJobClick(job)}
                      onDragStart={e => handleDragStart(e, job.id)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
});
