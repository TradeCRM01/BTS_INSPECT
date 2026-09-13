import { jobListBucket } from './jobNextAction';
import { overdueInvoiceCount } from './invoiceStatus';
import type { JobStatus } from '../types/crm';

export type CommandJob = {
  status: JobStatus;
  scheduled_date: string | null | undefined;
  assigned_team?: string[] | null;
};

export type CommandInvoice = {
  status: string;
  due_date?: string | null;
};

export type TodayCommandStats = {
  todayOpen: number;
  unassignedDated: number;
  needsDate: number;
  overdueInvoices: number;
};

function todayYmd(now: Date): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Dashboard command strip — only open work and invoice exceptions. */
export function todayCommandStats(
  jobs: CommandJob[],
  invoices: CommandInvoice[],
  now = new Date(),
): TodayCommandStats {
  const today = todayYmd(now);
  let todayOpen = 0;
  let unassignedDated = 0;
  let needsDate = 0;
  for (const job of jobs) {
    const bucket = jobListBucket(job, now);
    if (bucket === 'needs_date') needsDate += 1;
    if (bucket === 'closed') continue;
    const day = job.scheduled_date?.slice(0, 10);
    if (day === today) todayOpen += 1;
    if (day && !(job.assigned_team ?? []).length && bucket !== 'needs_date') unassignedDated += 1;
  }
  return {
    todayOpen,
    unassignedDated,
    needsDate,
    overdueInvoices: overdueInvoiceCount(invoices, now),
  };
}
