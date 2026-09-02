/** Grafter company calendar — not leftover Perth, not the runtime/UTC day. */
export const TIMESHEET_COMPANY_TZ = 'Australia/Brisbane';

export const TIMESHEET_CLOCK_OFF_STATUS = 'submitted' as const;

export function findRunningJobEntry<T extends { job_id: string | null; end_time: string | null }>(
  entries: T[],
  jobId: string,
): T | undefined {
  return entries.find(e => e.job_id === jobId && e.end_time == null);
}

/** Missing or equal timestamps are 0. A real interval rounds to minutes. */
export function entryMinutes(startIso?: string | null, endIso?: string | null): number {
  if (!startIso || !endIso) return 0;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

export function localDateIso(now = new Date(), timeZone = TIMESHEET_COMPANY_TZ): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  const d = parts.find(p => p.type === 'day')?.value;
  if (!y || !m || !d) {
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return `${y}-${m}-${d}`;
}

export function buildOpenTimesheetInsert(args: {
  companyId: string;
  employeeId: string;
  date: string;
  clockInIso?: string | null;
}): {
  company_id: string;
  employee_id: string;
  date: string;
  status: 'open';
  clock_in?: string;
} {
  const row: ReturnType<typeof buildOpenTimesheetInsert> = {
    company_id: args.companyId,
    employee_id: args.employeeId,
    date: args.date,
    status: 'open',
  };
  if (args.clockInIso) row.clock_in = args.clockInIso;
  return row;
}

export function buildTimesheetClockOnUpdate(args: {
  now: Date;
  existingClockIn?: string | null;
}): {
  clock_in: string;
  clock_out: null;
  status: 'open';
} {
  return {
    clock_in: args.existingClockIn || args.now.toISOString(),
    clock_out: null,
    status: 'open',
  };
}

export function buildJobClockOnEntry(args: {
  timesheetId: string;
  companyId: string;
  jobId: string;
  start: Date;
}): {
  timesheet_id: string;
  company_id: string;
  job_id: string;
  start_time: string;
  end_time: null;
  work_type: null;
  billable: true;
  notes: null;
} {
  return {
    timesheet_id: args.timesheetId,
    company_id: args.companyId,
    job_id: args.jobId,
    start_time: args.start.toISOString(),
    end_time: null,
    work_type: null,
    billable: true,
    notes: null,
  };
}

export function buildJobClockOffEntry(end: Date): { end_time: string } {
  return { end_time: end.toISOString() };
}

export function buildTimesheetClockOffUpdate(args: {
  clockOutIso: string;
  totalMinutes: number;
}): {
  clock_out: string;
  total_minutes: number;
  status: typeof TIMESHEET_CLOCK_OFF_STATUS;
} {
  return {
    clock_out: args.clockOutIso,
    total_minutes: Math.max(0, Math.round(args.totalMinutes)),
    status: TIMESHEET_CLOCK_OFF_STATUS,
  };
}

export function timesheetWorkedMinutes(args: {
  clockIn?: string | null;
  clockOut?: string | null;
  totalMinutes?: number | null;
  entryMinutes?: number | null;
}): number {
  const stamped = Math.max(0, Math.round(Number(args.totalMinutes) || 0));
  if (stamped > 0) return stamped;
  const fromEntries = Math.max(0, Math.round(Number(args.entryMinutes) || 0));
  if (fromEntries > 0) return fromEntries;
  return entryMinutes(args.clockIn, args.clockOut);
}

export function planTimesheetClockOff(args: {
  clockIn?: string | null;
  now?: Date;
  runningEntries?: Array<{ id: string; start_time?: string | null }>;
  priorTotalMinutes?: number | null;
}): {
  end: Date;
  endIso: string;
  entryUpdates: Array<{ id: string; end_time: string }>;
  timesheetUpdate: ReturnType<typeof buildTimesheetClockOffUpdate>;
  addedMinutes: number;
} {
  const end = args.now ?? new Date();
  const endIso = end.toISOString();
  const running = args.runningEntries ?? [];
  const fromEntries = running.reduce((sum, row) => sum + entryMinutes(row.start_time, endIso), 0);
  const fromClock = entryMinutes(args.clockIn, endIso);
  const addedMinutes = fromEntries > 0 ? fromEntries : fromClock;
  const totalMinutes = Math.max(0, (Number(args.priorTotalMinutes) || 0) + addedMinutes);
  return {
    end,
    endIso,
    entryUpdates: running.map(row => ({ id: row.id, end_time: endIso })),
    timesheetUpdate: buildTimesheetClockOffUpdate({ clockOutIso: endIso, totalMinutes }),
    addedMinutes,
  };
}

export function buildJobTimeEntry(args: {
  timesheetId: string;
  companyId: string;
  jobId?: string | null;
  start: Date;
  end: Date | null;
  workType?: string | null;
  billable?: boolean;
  notes?: string | null;
}): {
  timesheet_id: string;
  company_id: string;
  job_id: string | null;
  start_time: string;
  end_time: string | null;
  work_type: string | null;
  billable: boolean;
  notes: string | null;
} {
  return {
    timesheet_id: args.timesheetId,
    company_id: args.companyId,
    job_id: args.jobId || null,
    start_time: args.start.toISOString(),
    end_time: args.end?.toISOString() ?? null,
    work_type: args.workType || null,
    billable: args.billable ?? true,
    notes: args.notes || null,
  };
}
