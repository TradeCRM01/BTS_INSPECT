import { useState, useMemo, useRef, memo, useEffect } from 'react';
import type { JobWithClient, JobStatus } from '../../types/crm';
import {
  JOB_STATUS_LABELS, JOB_STATUS_STYLES,
} from '../../types/crm';
import {
  pickJobColor, pickEmployeeColor, hexToBg, hexToBorder, getReadableText,
} from '../../lib/jobColors';
import {
  format, isSameDay, isToday, parseISO, addDays, startOfWeek,
  endOfWeek, startOfMonth, endOfMonth, startOfWeek as startWeek,
  endOfWeek as endWeek, isSameMonth,
} from 'date-fns';
import { Clock, MapPin, User, Plus, Briefcase, Users } from 'lucide-react';

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
  onJobDrop?: (jobId: string, date: string, employeeId?: string) => void;
  filteredEmployeeIds: Set<string>;
}

const HOUR_WIDTH = 96; // px per hour column
const ROW_HEIGHT = 72; // px per employee row
const DAY_START = 6; // 6 AM
const DAY_END = 20; // 8 PM
const HOURS = Array.from({ length: DAY_END - DAY_START + 1 }, (_, i) => DAY_START + i);
const LABEL_WIDTH = 160; // px for employee name column

// Convert "HH:MM:SS" to decimal hours
function timeToHours(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h + m / 60;
}

function formatJobNumber(n: number | null | undefined): string {
  if (n == null) return '';
  return `#${String(n).padStart(4, '0')}`;
}

// ── Job Block (shared) ───────────────────────────────────────────

interface JobBlockProps {
  job: JobWithClient;
  onClick: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  compact?: boolean;
}

const JobBlock = memo(function JobBlock({ job, onClick, onDragStart, compact }: JobBlockProps) {
  const color = pickJobColor(job.id, job.color);
  const textColor = getReadableText(color);
  const bg = hexToBg(color, 0.15);
  const border = hexToBorder(color, 0.4);

  return (
    <button
      draggable={!!onDragStart}
      onDragStart={onDragStart}
      onClick={e => { e.stopPropagation(); onClick(); }}
      className="absolute left-1 right-1 rounded-lg border overflow-hidden cursor-pointer transition-all hover:shadow-md hover:brightness-105 active:scale-[0.98]"
      style={{
        background: bg,
        borderColor: border,
        borderLeftWidth: 3,
        borderLeftColor: color,
      }}
    >
      <div className="px-1.5 py-1 text-left" style={{ color: textColor === '#FFFFFF' ? color : '#1A1A1A' }}>
        <div className="flex items-center gap-1 mb-0.5">
          <span className="text-[10px] font-bold shrink-0" style={{ color }}>
            {formatJobNumber(job.job_number)}
          </span>
          {job.status === 'cancelled' && (
            <span className="text-[9px] px-1 rounded bg-red-100 text-red-600">CXL</span>
          )}
          {job.status === 'completed' && (
            <span className="text-[9px] px-1 rounded bg-green-100 text-green-600">DONE</span>
          )}
        </div>
        <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: '#1A1A1A' }}>
          {job.title}
        </p>
        {!compact && (
          <>
            {job.client_name && (
              <p className="text-[10px] leading-tight truncate text-[#4A5568] flex items-center gap-0.5 mt-0.5">
                <User size={8} /> {job.client_name}
              </p>
            )}
            {job.start_time && (
              <p className="text-[10px] leading-tight text-[#6B7280] flex items-center gap-0.5 mt-0.5">
                <Clock size={8} /> {job.start_time.slice(0, 5)}
                {job.end_time && ` – ${job.end_time.slice(0, 5)}`}
              </p>
            )}
            {job.address && (
              <p className="text-[10px] leading-tight truncate text-[#6B7280] flex items-center gap-0.5 mt-0.5">
                <MapPin size={8} /> {job.address}
              </p>
            )}
          </>
        )}
      </div>
    </button>
  );
});

// ── Day Board View ───────────────────────────────────────────────
// SimPRO/Gantt style: employees as rows (Y axis), time as columns (X axis).
// Job blocks are positioned horizontally based on start/end time.

export const DayBoardView = memo(function DayBoardView({
  jobs, teamMembers, currentDate, onJobClick, onDayClick, onJobDrop, filteredEmployeeIds,
}: BoardProps) {
  const [dragJobId, setDragJobId] = useState<string | null>(null);
  const dateStr = format(currentDate, 'yyyy-MM-dd');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Build rows: unassigned + each team member (filtered)
  const rows = useMemo(() => {
    const r: { id: string; name: string; schedule_color?: string | null }[] = [];
    if (filteredEmployeeIds.size === 0 || filteredEmployeeIds.has('__unassigned__')) {
      r.push({ id: '__unassigned__', name: 'Unassigned' });
    }
    for (const m of teamMembers) {
      if (filteredEmployeeIds.size === 0 || filteredEmployeeIds.has(m.id)) {
        r.push({ id: m.id, name: m.name, schedule_color: m.schedule_color });
      }
    }
    return r;
  }, [teamMembers, filteredEmployeeIds]);

  // Group jobs by row (employee)
  const jobsByRow = useMemo(() => {
    const map = new Map<string, JobWithClient[]>();
    for (const row of rows) map.set(row.id, []);
    for (const job of jobs) {
      if (!job.scheduled_date || !isSameDay(parseISO(job.scheduled_date), currentDate)) continue;
      const assigned = job.assigned_team ?? [];
      if (assigned.length === 0) {
        map.get('__unassigned__')?.push(job);
      } else {
        for (const empId of assigned) {
          if (map.has(empId)) map.get(empId)!.push(job);
        }
      }
    }
    for (const [, list] of map) {
      list.sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'));
    }
    return map;
  }, [jobs, rows, currentDate]);

  // Default scroll to left so employee names are visible
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = 0;
    }
  }, [currentDate]);

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData('text/plain', jobId);
    setDragJobId(jobId);
  };

  const handleDrop = (e: React.DragEvent, empId: string) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData('text/plain');
    if (jobId && onJobDrop) onJobDrop(jobId, dateStr, empId === '__unassigned__' ? undefined : empId);
    setDragJobId(null);
  };

  const gridWidth = HOURS.length * HOUR_WIDTH;

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
      {/* Date header */}
      <div className="px-4 py-2.5 border-b border-[#E5E7EB] bg-[#FAFBFC]">
        <p className="text-sm font-semibold text-[#1A1A1A]">
          {format(currentDate, 'EEEE, d MMMM yyyy')}
          {isToday(currentDate) && <span className="ml-2 text-[10px] text-[#2E75B6] bg-[#EFF6FF] px-1.5 py-0.5 rounded-full font-medium">TODAY</span>}
        </p>
      </div>

      <div ref={scrollRef} className="overflow-x-auto">
        {/* Time header row */}
        <div className="flex sticky top-0 z-20 bg-white border-b border-[#E5E7EB]">
          {/* Empty corner */}
          <div className="shrink-0 border-r border-[#E5E7EB] bg-[#FAFBRC]" style={{ width: LABEL_WIDTH }}>
            <div className="px-3 py-2 flex items-center gap-1.5">
              <Users size={13} className="text-[#9CA3AF]" />
              <span className="text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wide">Employee</span>
            </div>
          </div>
          {/* Hour columns */}
          <div className="flex" style={{ minWidth: gridWidth }}>
            {HOURS.map(h => (
              <div key={h} className="text-center border-r border-[#F3F4F6] last:border-r-0"
                style={{ width: HOUR_WIDTH }}>
                <div className="px-1 py-2">
                  <span className="text-[10px] font-medium text-[#6B7280]">
                    {h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Employee rows */}
        {rows.map((row, rowIdx) => {
          const isUnassigned = row.id === '__unassigned__';
          const color = isUnassigned
            ? '#9CA3AF'
            : pickEmployeeColor(row.id, row.schedule_color);
          const rowJobs = jobsByRow.get(row.id) ?? [];
          const timedJobs = rowJobs.filter(j => j.start_time);
          const allDayJobs = rowJobs.filter(j => !j.start_time);

          return (
            <div
              key={row.id}
              className={`flex ${rowIdx % 2 === 0 ? 'bg-white' : 'bg-[#FAFBFC]'} ${rowIdx < rows.length - 1 ? 'border-b border-[#F3F4F6]' : ''}`}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, row.id)}
            >
              {/* Employee label (sticky left) */}
              <div
                className="shrink-0 border-r border-[#E5E7EB] cursor-pointer hover:bg-blue-50/40 transition-colors flex items-center gap-2 px-3"
                style={{ width: LABEL_WIDTH, height: ROW_HEIGHT }}
                onClick={() => onDayClick(dateStr, isUnassigned ? undefined : row.id)}
              >
                <div
                  className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ background: color }}
                >
                  {isUnassigned ? '?' : row.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#1A1A1A] truncate">{row.name}</p>
                  <p className="text-[10px] text-[#9CA3AF]">{rowJobs.length} job{rowJobs.length !== 1 ? 's' : ''}</p>
                </div>
              </div>

              {/* Time grid for this row */}
              <div
                className={`relative cursor-pointer ${dragJobId ? 'hover:bg-blue-50/30' : ''}`}
                style={{ width: gridWidth, height: ROW_HEIGHT }}
                onClick={() => onDayClick(dateStr, isUnassigned ? undefined : row.id)}
              >
                {/* Hour grid lines */}
                {HOURS.map(h => (
                  <div
                    key={h}
                    className="absolute top-0 bottom-0 border-r border-[#F3F4F6] last:border-r-0"
                    style={{ left: (h - DAY_START) * HOUR_WIDTH, width: HOUR_WIDTH }}
                  />
                ))}

                {/* Current time vertical indicator */}
                {isToday(currentDate) && <CurrentTimeVerticalIndicator />}

                {/* All-day jobs (no start time) — rendered at left with full-width subtle bar */}
                {allDayJobs.map(job => {
                  const jc = pickJobColor(job.id, job.color);
                  return (
                    <div key={job.id} className="absolute left-1 right-1" style={{ top: 2, height: 18 }}>
                      <JobBlock
                        job={job}
                        compact
                        onClick={() => onJobClick(job)}
                        onDragStart={e => handleDragStart(e, job.id)}
                      />
                    </div>
                  );
                })}

                {/* Timed jobs — positioned horizontally by start/end */}
                {timedJobs.map(job => {
                  const startH = timeToHours(job.start_time);
                  const endH = timeToHours(job.end_time) ?? (startH ?? DAY_START) + 1;
                  if (startH == null) return null;
                  const left = Math.max(0, (startH - DAY_START) * HOUR_WIDTH + 2);
                  const width = Math.max(60, (endH - startH) * HOUR_WIDTH - 4);
                  const isShort = width < 120;
                  return (
                    <div key={job.id} className="absolute" style={{ left, width, top: allDayJobs.length > 0 ? 24 : 4, bottom: 2 }}>
                      <JobBlock
                        job={job}
                        compact={isShort}
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

// Current time vertical red line (for horizontal time grid)
function CurrentTimeVerticalIndicator() {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  if (h < DAY_START || h > DAY_END) return null;
  const left = (h - DAY_START) * HOUR_WIDTH;
  return (
    <div className="absolute top-0 bottom-0 z-20 pointer-events-none" style={{ left }}>
      <div className="flex flex-col items-center h-full">
        <div className="w-2 h-2 rounded-full bg-red-500 -mt-1" />
        <div className="flex-1 w-px bg-red-500" />
      </div>
    </div>
  );
}

// ── Week Board View ──────────────────────────────────────────────
// Day columns (Mon–Sun), colored job blocks stacked vertically

export const WeekBoardView = memo(function WeekBoardView({
  jobs, teamMembers, currentDate, onJobClick, onDayClick, onJobDrop, filteredEmployeeIds,
}: BoardProps) {
  const [dragJobId, setDragJobId] = useState<string | null>(null);
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const dateStrs = days.map(d => format(d, 'yyyy-MM-dd'));

  const jobsByDay = useMemo(() => {
    const map = new Map<string, JobWithClient[]>();
    for (const ds of dateStrs) map.set(ds, []);
    for (const job of jobs) {
      if (!job.scheduled_date) continue;
      const list = map.get(job.scheduled_date);
      if (list) list.push(job);
    }
    for (const [, list] of map) {
      list.sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'));
    }
    return map;
  }, [jobs, dateStrs]);

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData('text/plain', jobId);
    setDragJobId(jobId);
  };

  const handleDrop = (e: React.DragEvent, date: string) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData('text/plain');
    if (jobId && onJobDrop) onJobDrop(jobId, date);
    setDragJobId(null);
  };

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
      {/* Day headers */}
      <div className="flex border-b border-[#E5E7EB]">
        {days.map((day, i) => {
          const ds = format(day, 'yyyy-MM-dd');
          const dayJobs = jobsByDay.get(ds) ?? [];
          const today = isToday(day);
          return (
            <div key={i} className="flex-1 min-w-[120px] border-r border-[#E5E7EB] last:border-r-0 px-2 py-2 text-center">
              <p className="text-[10px] font-medium text-[#9CA3AF] uppercase">{format(day, 'EEE')}</p>
              <p className={`text-sm font-bold ${today ? 'text-white bg-[#0A2540] w-6 h-6 rounded-full flex items-center justify-center mx-auto' : 'text-[#1A1A1A]'}`}>
                {format(day, 'd')}
              </p>
              <p className="text-[10px] text-[#9CA3AF] mt-0.5">{dayJobs.length} job{dayJobs.length !== 1 ? 's' : ''}</p>
            </div>
          );
        })}
      </div>

      {/* Day columns with job blocks */}
      <div className="flex">
        {days.map((day, i) => {
          const ds = format(day, 'yyyy-MM-dd');
          const dayJobs = jobsByDay.get(ds) ?? [];
          return (
            <div
              key={i}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, ds)}
              onClick={() => onDayClick(ds)}
              className="flex-1 min-w-[120px] border-r border-[#E5E7EB] last:border-r-0 p-1 space-y-1 cursor-pointer min-h-[300px]"
            >
              {dayJobs.length === 0 ? (
                <div className="flex items-center justify-center h-20">
                  <Plus size={16} className="text-gray-200" />
                </div>
              ) : (
                dayJobs.map(job => {
                  const color = pickJobColor(job.id, job.color);
                  const textColor = getReadableText(color);
                  const assignedMembers = (job.assigned_team ?? [])
                    .map(id => teamMembers.find(m => m.id === id))
                    .filter(Boolean) as TeamMember[];
                  return (
                    <button
                      key={job.id}
                      draggable
                      onDragStart={e => handleDragStart(e, job.id)}
                      onClick={e => { e.stopPropagation(); onJobClick(job); }}
                      className="w-full text-left rounded-lg border overflow-hidden cursor-pointer transition-all hover:shadow-md hover:brightness-105 active:scale-[0.98]"
                      style={{
                        background: hexToBg(color, 0.12),
                        borderColor: hexToBorder(color, 0.35),
                        borderLeftWidth: 3,
                        borderLeftColor: color,
                      }}
                    >
                      <div className="px-1.5 py-1.5">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] font-bold" style={{ color }}>
                            {formatJobNumber(job.job_number)}
                          </span>
                          <span className={`text-[9px] px-1 rounded ${JOB_STATUS_STYLES[job.status]}`}>
                            {JOB_STATUS_LABELS[job.status].slice(0, 4)}
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold leading-tight text-[#1A1A1A]">
                          {job.title}
                        </p>
                        {job.client_name && (
                          <p className="text-[10px] text-[#4A5568] truncate mt-0.5 flex items-center gap-0.5">
                            <User size={8} /> {job.client_name}
                          </p>
                        )}
                        {job.start_time && (
                          <p className="text-[10px] text-[#6B7280] mt-0.5 flex items-center gap-0.5">
                            <Clock size={8} /> {job.start_time.slice(0, 5)}
                            {job.end_time && ` – ${job.end_time.slice(0, 5)}`}
                          </p>
                        )}
                        {/* Employee color dots */}
                        {assignedMembers.length > 0 && (
                          <div className="flex items-center gap-0.5 mt-1">
                            {assignedMembers.slice(0, 4).map(m => (
                              <div key={m.id}
                                className="w-3.5 h-3.5 rounded-full border border-white flex items-center justify-center text-[7px] font-bold text-white"
                                style={{ background: pickEmployeeColor(m.id, m.schedule_color) }}
                                title={m.name}
                              >
                                {m.name[0]?.toUpperCase()}
                              </div>
                            ))}
                            {assignedMembers.length > 4 && (
                              <span className="text-[9px] text-[#9CA3AF] ml-0.5">+{assignedMembers.length - 4}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ── Month Board View ─────────────────────────────────────────────
// Enhanced calendar with colored job blocks and job numbers

export const MonthBoardView = memo(function MonthBoardView({
  jobs, currentDate, onJobClick, onDayClick, onJobDrop,
}: BoardProps) {
  const [dragJobId, setDragJobId] = useState<string | null>(null);
  const monthStart = startOfMonth(currentDate);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  const jobsByDate = useMemo(() => {
    const map = new Map<string, JobWithClient[]>();
    for (const job of jobs) {
      if (!job.scheduled_date) continue;
      const list = map.get(job.scheduled_date) ?? [];
      list.push(job);
      map.set(job.scheduled_date, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => (a.start_time ?? '99').localeCompare(b.start_time ?? '99'));
    }
    return map;
  }, [jobs]);

  const handleDragStart = (e: React.DragEvent, jobId: string) => {
    e.dataTransfer.setData('text/plain', jobId);
    setDragJobId(jobId);
  };

  const handleDrop = (e: React.DragEvent, date: string) => {
    e.preventDefault();
    const jobId = e.dataTransfer.getData('text/plain');
    if (jobId && onJobDrop) onJobDrop(jobId, date);
    setDragJobId(null);
  };

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-[#E5E7EB]">
        {weekdays.map(day => (
          <div key={day} className="px-2 py-2 text-center text-xs font-semibold text-[#4A5568] uppercase tracking-wide">
            {day}
          </div>
        ))}
      </div>

      {/* Days grid */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const dayJobs = jobsByDate.get(dateStr) ?? [];
          const inMonth = isSameMonth(day, currentDate);
          const today = isToday(day);

          return (
            <div
              key={i}
              onClick={() => onDayClick(dateStr)}
              onDragOver={e => e.preventDefault()}
              onDrop={e => handleDrop(e, dateStr)}
              className={`relative border-r border-b border-[#F3F4F6] cursor-pointer transition-colors group min-h-[110px] ${
                inMonth ? 'bg-white' : 'bg-gray-50/50'
              } ${dragJobId ? 'hover:bg-blue-50/40' : ''} ${(i + 1) % 7 === 0 ? 'border-r-0' : ''}`}
            >
              <div className="flex items-center justify-between px-1.5 pt-1.5">
                <span className={`text-xs font-medium ${
                  !inMonth ? 'text-gray-300' : today
                    ? 'bg-[#0A2540] text-white w-5 h-5 rounded-full flex items-center justify-center'
                    : 'text-[#4A5568]'
                }`}>
                  {format(day, 'd')}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); onDayClick(dateStr); }}
                  className="opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center rounded hover:bg-blue-100 text-[#2E75B6] transition-opacity"
                >
                  <Plus size={12} />
                </button>
              </div>

              <div className="px-1 pb-1 space-y-0.5 mt-0.5">
                {dayJobs.slice(0, 4).map(job => {
                  const color = pickJobColor(job.id, job.color);
                  return (
                    <button
                      key={job.id}
                      draggable
                      onDragStart={e => handleDragStart(e, job.id)}
                      onClick={e => { e.stopPropagation(); onJobClick(job); }}
                      className={`w-full text-left text-xs px-1.5 py-1 rounded truncate flex items-center gap-1 transition-colors hover:brightness-95 ${
                        job.status === 'cancelled' ? 'opacity-50 line-through' : ''
                      }`}
                      style={{
                        background: hexToBg(color, 0.12),
                        borderLeft: `2px solid ${color}`,
                      }}
                    >
                      <span className="text-[9px] font-bold shrink-0" style={{ color }}>
                        {formatJobNumber(job.job_number)}
                      </span>
                      {job.start_time && (
                        <span className="text-[9px] text-[#6B7280] shrink-0 font-medium">
                          {job.start_time.slice(0, 5)}
                        </span>
                      )}
                      <span className="truncate text-[#1A1A1A]">{job.title}</span>
                    </button>
                  );
                })}
                {dayJobs.length > 4 && (
                  <p className="text-[10px] text-[#9CA3AF] px-1.5 font-medium">+{dayJobs.length - 4} more</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

// ── List View (enhanced with job numbers + colors) ───────────────

export const JobListView = memo(function JobListView({
  jobs, teamMembers, onEdit, onStatusChange,
}: {
  jobs: JobWithClient[];
  teamMembers: TeamMember[];
  onEdit: (job: JobWithClient) => void;
  onStatusChange: (id: string, status: JobStatus) => void;
}) {
  const sorted = [...jobs].sort((a, b) => {
    const da = a.scheduled_date ?? '';
    const db = b.scheduled_date ?? '';
    if (da !== db) return da < db ? -1 : 1;
    return (a.start_time ?? '').localeCompare(b.start_time ?? '');
  });

  if (sorted.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-[#E5E7EB] p-12 text-center">
        <Briefcase size={36} className="text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">No jobs scheduled in this range</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {sorted.map(job => {
        const color = pickJobColor(job.id, job.color);
        const assignedMembers = (job.assigned_team ?? [])
          .map(id => teamMembers.find(m => m.id === id))
          .filter(Boolean) as TeamMember[];
        return (
          <div key={job.id} className="bg-white rounded-lg border border-[#E5E7EB] p-3 flex items-center gap-3 hover:shadow-sm transition-shadow">
            <div className="w-1.5 h-12 rounded-full shrink-0" style={{ background: color }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold" style={{ color }}>{formatJobNumber(job.job_number)}</span>
                <p className="text-sm font-medium text-[#1A1A1A] truncate">{job.title}</p>
              </div>
              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                {job.client_name && (
                  <span className="flex items-center gap-1 text-xs text-[#6B7280]">
                    <User size={11} /> {job.client_name}
                  </span>
                )}
                {job.scheduled_date && (
                  <span className="flex items-center gap-1 text-xs text-[#6B7280]">
                    {format(parseISO(job.scheduled_date), 'd MMM yyyy')}
                  </span>
                )}
                {job.start_time && (
                  <span className="flex items-center gap-1 text-xs text-[#6B7280]">
                    <Clock size={11} /> {job.start_time.slice(0, 5)}
                    {job.end_time && ` – ${job.end_time.slice(0, 5)}`}
                  </span>
                )}
                {job.address && (
                  <span className="flex items-center gap-1 text-xs text-[#6B7280] truncate">
                    <MapPin size={11} /> {job.address}
                  </span>
                )}
                {assignedMembers.length > 0 && (
                  <div className="flex items-center gap-0.5">
                    {assignedMembers.slice(0, 3).map(m => (
                      <div key={m.id} className="w-4 h-4 rounded-full border border-white flex items-center justify-center text-[7px] font-bold text-white"
                        style={{ background: pickEmployeeColor(m.id, m.schedule_color) }} title={m.name}>
                        {m.name[0]?.toUpperCase()}
                      </div>
                    ))}
                    {assignedMembers.length > 3 && (
                      <span className="text-[9px] text-[#9CA3AF] ml-0.5">+{assignedMembers.length - 3}</span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <select
              value={job.status}
              onChange={e => { e.stopPropagation(); onStatusChange(job.id, e.target.value as JobStatus); }}
              className={`text-xs px-2 py-1 rounded-full border-0 cursor-pointer font-medium ${JOB_STATUS_STYLES[job.status]}`}
            >
              {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map(s => (
                <option key={s} value={s}>{JOB_STATUS_LABELS[s]}</option>
              ))}
            </select>
          </div>
        );
      })}
    </div>
  );
});
