import { useState, useMemo, useRef, memo, useEffect } from 'react';
import type { JobWithClient } from '../../types/crm';
import { JOB_STATUS_LABELS, JOB_STATUS_RAIL, JOB_STATUS_STYLES } from '../../types/crm';
import { pickEmployeeColor } from '../../lib/jobColors';
import { boardDispatchHint, jobCardHint } from '../../lib/jobNextAction';
import { OpsCardHeader, OpsSiteRow, OpsStatus, opsSiteLabel } from '../ui/OpsCard';
import {
  startTimeFromDropOffset,
  placeDayRowJobs,
  dayRowHeightPx,
  UNASSIGNED_ROW_ID,
  DAY_START_HOUR,
  DAY_END_HOUR,
  HOUR_WIDTH_PX,
  timeToMinutes,
  type JobDropPayload,
} from '../../lib/dispatch';
import {
  format, isToday, addDays, startOfWeek,
} from 'date-fns';
import { Clock, Plus, Users } from 'lucide-react';

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
  filteredEmployeeIds: Set<string>;
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
  return format(d, 'yyyy-MM-dd');
}

function jobDateKey(job: JobWithClient): string | null {
  return job.scheduled_date ? job.scheduled_date.slice(0, 10) : null;
}

function formatJobNumber(n: number | null | undefined): string {
  if (n == null) return '';
  return `#${String(n).padStart(4, '0')}`;
}

function initials(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
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
  job, onClick, onDragStart, compact, dragging, fill = true, detail = false,
}: JobBlockProps) {
  const rail = JOB_STATUS_RAIL[job.status];
  const hint = boardDispatchHint(job);
  const next = hint ?? jobCardHint(job);
  const site = opsSiteLabel(job.address, job.client_address);

  return (
    <button
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onClick={e => { e.stopPropagation(); onClick(); }}
      className={`${fill ? 'absolute left-1 right-1' : 'w-full'} ops-card ops-card-hover cursor-pointer active:scale-[0.98] ${
        dragging ? 'opacity-40' : ''
      }`}
      style={{ borderLeftWidth: 3, borderLeftColor: rail }}
    >
      <div className={compact ? 'ops-card-header-sm' : 'ops-card-header px-2 py-1'}>
        <div className="flex items-center justify-between gap-1">
          <p className="ops-card-kicker truncate">
            {compact && job.start_time ? `${job.start_time.slice(0, 5)} · ` : ''}
            {formatJobNumber(job.job_number) || 'JOB'}
          </p>
          {!compact && (
            <OpsStatus className={JOB_STATUS_STYLES[job.status]}>{JOB_STATUS_LABELS[job.status]}</OpsStatus>
          )}
        </div>
      </div>
      <div className="px-1.5 py-1 text-left">
        <p className={compact ? 'ops-chip-site' : 'ops-card-site'}>{site}</p>
        {!compact && job.start_time && (
          <p className="ops-meta mt-0.5 flex items-center gap-0.5">
            <Clock size={12} /> {job.start_time.slice(0, 5)}
            {job.end_time && ` – ${job.end_time.slice(0, 5)}`}
          </p>
        )}
        <span className={`mt-1 ${detail ? 'ops-next-control-block' : 'ops-next-control-sm'}`}>{next}</span>
      </div>
    </button>
  );
});

// ── Unscheduled tray (jobs that would otherwise vanish) ──────────

export const NeedsDateRail = memo(function NeedsDateRail({
  jobs, onJobClick, onDragStart, alwaysShow = false, className = '',
}: {
  jobs: JobWithClient[];
  onJobClick: (job: JobWithClient) => void;
  onDragStart: (e: React.DragEvent, jobId: string) => void;
  alwaysShow?: boolean;
  className?: string;
}) {
  if (jobs.length === 0 && !alwaysShow) return null;

  return (
    <div className={`ops-tray ${className}`.trim()}>
      <div className="ops-tray-head">
        <p className="ops-card-kicker">Jobs</p>
        <span className="text-[10px] font-bold text-white/80">{jobs.length}</span>
      </div>
      <div className="p-2 space-y-2 max-h-[70vh] overflow-y-auto">
        {jobs.length === 0 ? (
          <p className="ops-meta px-1 py-2">No unscheduled jobs.</p>
        ) : (
          jobs.map(job => {
            const site = opsSiteLabel(job.address, job.client_address);
            return (
              <button
                key={job.id}
                type="button"
                draggable
                onDragStart={e => onDragStart(e, job.id)}
                onClick={() => onJobClick(job)}
                className="ops-card ops-card-hover w-full text-left active:scale-[0.98]"
                style={{ borderLeftWidth: 3, borderLeftColor: JOB_STATUS_RAIL[job.status] }}
              >
                <OpsCardHeader
                  kicker={formatJobNumber(job.job_number) || 'JOB'}
                  trailing={<OpsStatus className={JOB_STATUS_STYLES[job.status]}>{JOB_STATUS_LABELS[job.status]}</OpsStatus>}
                />
                <div className="ops-card-body">
                  <p className="ops-card-site">{site}</p>
                  <div className="ops-card-footer">
                    <span className="ops-next-control-block">Set a date</span>
                  </div>
                  {job.client_name && <p className="ops-meta mt-1.5 truncate">{job.client_name}</p>}
                  {job.title && <p className="ops-meta mt-0.5 truncate">{job.title}</p>}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
});

// ── Phone day list (no hour grid) ────────────────────────────────

export const PhoneDayList = memo(function PhoneDayList({
  jobs, currentDate, onJobClick, onDragStart,
}: {
  jobs: JobWithClient[];
  currentDate: Date;
  onJobClick: (job: JobWithClient) => void;
  onDragStart: (e: React.DragEvent, jobId: string) => void;
}) {
  const dateStr = dateKey(currentDate);
  const dayJobs = useMemo(() => {
    return jobs
      .filter(job => jobDateKey(job) === dateStr)
      .sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'));
  }, [jobs, dateStr]);

  return (
    <div className="space-y-2">
      <h2 className="ops-group-title">
        {format(currentDate, 'EEEE d MMM')}
        <span className="text-[rgba(0,0,0,0.7)] normal-case font-normal"> ({dayJobs.length})</span>
      </h2>
      {dayJobs.length === 0 ? (
        <p className="ops-meta px-1 py-3">No jobs on this day. Drag from the tray or add a job.</p>
      ) : (
        dayJobs.map(job => {
          const site = opsSiteLabel(job.address, job.client_address);
          const mapsQuery = (job.address || job.client_address)?.trim() || null;
          const next = boardDispatchHint(job) ?? jobCardHint(job);
          return (
            <button
              key={job.id}
              type="button"
              draggable
              onDragStart={e => onDragStart(e, job.id)}
              onClick={() => onJobClick(job)}
              className="ops-card ops-card-hover w-full text-left"
              style={{ borderLeftWidth: 4, borderLeftColor: JOB_STATUS_RAIL[job.status] }}
            >
              <OpsCardHeader
                kicker={formatJobNumber(job.job_number) || 'JOB'}
                trailing={<OpsStatus className={JOB_STATUS_STYLES[job.status]}>{JOB_STATUS_LABELS[job.status]}</OpsStatus>}
              />
              <div className="ops-card-body">
                <OpsSiteRow site={site} phone={job.client_phone} mapsQuery={mapsQuery} />
                <div className="ops-card-footer">
                  <span className="ops-next-control-block">{next}</span>
                </div>
                <div className="mt-2 space-y-0.5">
                  {job.start_time && (
                    <p className="ops-meta flex items-center gap-1">
                      <Clock size={12} /> {job.start_time.slice(0, 5)}
                      {job.end_time ? ` – ${job.end_time.slice(0, 5)}` : ''}
                    </p>
                  )}
                  {job.client_name && <p className="ops-meta truncate">{job.client_name}</p>}
                  {job.title && <p className="ops-meta truncate">{job.title}</p>}
                </div>
              </div>
            </button>
          );
        })
      )}
    </div>
  );
});

// ── Day Board View ───────────────────────────────────────────────

export const DayBoardView = memo(function DayBoardView({
  jobs, teamMembers, currentDate, onJobClick, onDayClick, onJobDrop, filteredEmployeeIds,
}: BoardProps) {
  const [dragJobId, setDragJobId] = useState<string | null>(null);
  const [dropHoverId, setDropHoverId] = useState<string | null>(null);
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
    setDragJobId(jobId);
  };

  const assignmentForRow = (empId: string): string | null =>
    empId === UNASSIGNED_ROW_ID ? null : empId;

  const handleDrop = (e: React.DragEvent, empId: string, startTime?: string) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData('text/plain');
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
      hourWidth: HOUR_WIDTH,
      dayStart: DAY_START,
      dayEnd: DAY_END,
    });
    handleDrop(e, empId, startTime);
  };

  const gridWidth = HOURS.length * HOUR_WIDTH;

  return (
    <div className="ops-board">
      <div className="px-3 py-2 bg-navy text-white flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold">
          {format(currentDate, 'EEEE, d MMMM yyyy')}
          {isToday(currentDate) && (
            <span className="ml-2 text-[10px] text-navy bg-white/90 px-1.5 py-0.5 rounded font-medium">
              TODAY
            </span>
          )}
        </p>
        <p className="ops-meta text-white/80">
          {unassignedCount > 0
            ? `${unassignedCount} unassigned · drop on a person to add them`
            : 'Drop on a person to add them · Unassigned keeps the date'}
        </p>
      </div>

      <div ref={scrollRef} className="overflow-x-auto">
        <div className="flex sticky top-0 z-20 bg-white border-b border-[#E5E7EB]">
          <div className="shrink-0 border-r border-[#E5E7EB] bg-[#FAFBFC]" style={{ width: LABEL_WIDTH }}>
            <div className="px-3 py-2 flex items-center gap-1.5">
              <Users size={13} className="text-[#2E75B6]" />
              <span className="text-[10px] font-semibold text-[#0A2540] uppercase tracking-wide">Crew</span>
            </div>
          </div>
          <div className="flex" style={{ minWidth: gridWidth }}>
            {HOURS.map(h => (
              <div key={h} className="text-center border-r border-[#F3F4F6] last:border-r-0"
                style={{ width: HOUR_WIDTH }}>
                <div className="px-1 py-2">
                  <span className="text-[10px] font-medium ops-meta">{formatHourLabel(h)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {rows.map((row, rowIdx) => {
          const isUnassigned = row.id === UNASSIGNED_ROW_ID;
          const color = isUnassigned ? '#2E75B6' : pickEmployeeColor(row.id, row.schedule_color);
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
              className={`flex ${rowIdx < rows.length - 1 ? 'border-b border-[#F3F4F6]' : ''} ${
                isUnassigned ? 'bg-[#F0F7FF]/70' : rowIdx % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFC]'
              } ${hovering ? 'bg-blue-50/70' : ''}`}
              onDragOver={e => { e.preventDefault(); setDropHoverId(row.id); }}
              onDrop={e => handleDrop(e, row.id)}
            >
              <div
                className="shrink-0 border-r border-[#E5E7EB] cursor-pointer hover:bg-blue-50/40 transition-colors flex items-center gap-2 px-3"
                style={{
                  width: LABEL_WIDTH,
                  height,
                  borderLeft: isUnassigned ? '3px dashed #2E75B6' : `3px solid ${color}`,
                }}
                onClick={() => onDayClick(dateStr, isUnassigned ? undefined : row.id)}
              >
                <div
                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
                  style={{
                    background: isUnassigned ? 'transparent' : color,
                    color: isUnassigned ? '#2E75B6' : undefined,
                    border: isUnassigned ? '2px dashed #2E75B6' : undefined,
                  }}
                >
                  {isUnassigned ? '?' : initials(row.name)}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#1A1A1A] truncate">{row.name}</p>
                  <p className="ops-meta">
                    {isUnassigned
                      ? (rowJobs.length === 0 ? 'Drop here — date stays' : `${rowJobs.length} · needs crew`)
                      : `${rowJobs.length} job${rowJobs.length !== 1 ? 's' : ''}`}
                  </p>
                </div>
              </div>

              <div
                className="relative cursor-pointer"
                style={{ width: gridWidth, height }}
                onClick={() => onDayClick(dateStr, isUnassigned ? undefined : row.id)}
                onDragOver={e => { e.preventDefault(); setDropHoverId(row.id); }}
                onDrop={e => handleTimeDrop(e, row.id)}
              >
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute top-0 bottom-0 border-r border-[#F3F4F6] last:border-r-0"
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
                  const startM = timeToMinutes(job.start_time);
                  const endM = timeToMinutes(job.end_time) ?? (startM ?? DAY_START * 60) + 60;
                  if (startM == null) return null;
                  const left = Math.max(0, (startM / 60 - DAY_START) * HOUR_WIDTH + 2);
                  const width = Math.max(60, ((endM - startM) / 60) * HOUR_WIDTH - 4);
                  const top = ROW_PAD + layout.allDayCount * ALL_DAY_H + placed.lane * TIMED_H;
                  return (
                    <div
                      key={job.id}
                      className="absolute"
                      style={{ left, width, top, height: TIMED_H - 4 }}
                    >
                      <JobBlock
                        job={job}
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
        <div className="w-2 h-2 rounded-full bg-[#2E75B6] -mt-1" />
        <div className="flex-1 w-px bg-[#2E75B6]" />
      </div>
    </div>
  );
}

// ── Week Board View ──────────────────────────────────────────────

export const WeekBoardView = memo(function WeekBoardView({
  jobs, teamMembers, currentDate, onJobClick, onDayClick, onJobDrop,
}: BoardProps) {
  const [dragJobId, setDragJobId] = useState<string | null>(null);
  const [dropHoverDate, setDropHoverDate] = useState<string | null>(null);
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dateStrs = days.map(d => dateKey(d));

  const jobsByDay = useMemo(() => {
    const map = new Map<string, JobWithClient[]>();
    for (const ds of dateStrs) map.set(ds, []);
    for (const job of jobs) {
      const key = jobDateKey(job);
      if (!key) continue;
      map.get(key)?.push(job);
    }
    for (const [, list] of map) {
      list.sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'));
    }
    return map;
  }, [jobs, dateStrs]);

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData('text/plain', jobId);
    e.dataTransfer.effectAllowed = 'move';
    setDragJobId(jobId);
  };

  useEffect(() => {
    const clear = () => { setDragJobId(null); setDropHoverDate(null); };
    window.addEventListener('dragend', clear);
    return () => window.removeEventListener('dragend', clear);
  }, []);

  const handleDrop = (e: React.DragEvent, date: string) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData('text/plain');
    if (jobId && onJobDrop) onJobDrop({ jobId, date });
    setDragJobId(null);
    setDropHoverDate(null);
  };

  return (
    <div className="ops-board">
      <div className="px-3 py-2 bg-navy text-white flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold">This week</p>
        <p className="ops-meta text-white/80">
          Drag to another day to move the date. Crew stays put.
        </p>
      </div>
      <div className="flex border-b border-[#E5E7EB]">
        {days.map((day, i) => {
          const ds = dateKey(day);
          const dayJobs = jobsByDay.get(ds) ?? [];
          const today = isToday(day);
          const needsCrew = dayJobs.filter(j => !(j.assigned_team ?? []).length).length;
          return (
            <div key={i} className="flex-1 min-w-[120px] border-r border-[#E5E7EB] last:border-r-0 px-2 py-2 text-center">
              <p className="ops-meta uppercase">{format(day, 'EEE')}</p>
              <p className={`text-sm font-bold ${today ? 'text-white bg-navy w-6 h-6 rounded-full flex items-center justify-center mx-auto' : 'text-[#1A1A1A]'}`}>
                {format(day, 'd')}
              </p>
              <p className="ops-meta mt-0.5">
                {dayJobs.length} job{dayJobs.length !== 1 ? 's' : ''}
                {needsCrew > 0 ? ` · ${needsCrew} unassigned` : ''}
              </p>
            </div>
          );
        })}
      </div>

      <div className="flex">
        {days.map((day, i) => {
          const ds = dateKey(day);
          const dayJobs = jobsByDay.get(ds) ?? [];
          const hovering = dropHoverDate === ds;
          return (
            <div
              key={i}
              onDragOver={e => { e.preventDefault(); setDropHoverDate(ds); }}
              onDrop={e => handleDrop(e, ds)}
              onClick={() => onDayClick(ds)}
              className={`flex-1 min-w-[120px] border-r border-[#E5E7EB] last:border-r-0 p-1 space-y-1 cursor-pointer min-h-[300px] ${
                hovering ? 'bg-blue-50/70' : ''
              }`}
            >
              {dayJobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-20 text-[#D1D5DB]">
                  <Plus size={16} />
                  <span className="text-[10px] mt-1">Add job</span>
                </div>
              ) : (
                dayJobs.map(job => (
                  <JobBlock
                    key={job.id}
                    job={job}
                    teamMembers={teamMembers}
                    fill={false}
                    detail
                    dragging={dragJobId === job.id}
                    onClick={() => onJobClick(job)}
                    onDragStart={e => handleDragStart(e, job.id)}
                  />
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
