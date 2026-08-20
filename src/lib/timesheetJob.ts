export function findRunningJobEntry<T extends { job_id: string | null; end_time: string | null }>(
  entries: T[],
  jobId: string,
): T | undefined {
  return entries.find(e => e.job_id === jobId && e.end_time == null);
}

export function entryMinutes(startIso: string, endIso: string): number {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round((end - start) / 60000));
}

export function localDateIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
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
