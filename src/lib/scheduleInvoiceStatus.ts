import { asDateText, asStatusText, isNeedCrewJob } from './scheduleNeedCrew';

export type SchedulePillKind =
  | 'ready'
  | 'done'
  | 'progress'
  | 'scheduled'
  | 'cancelled'
  | 'nodate'
  | 'needcrew'
  | 'status';

export type SchedulePill = {
  label: string;
  kind: SchedulePillKind;
};

export type ScheduleInvoiceRow = {
  id: string;
  job_id: string;
  status: string;
};

export type SchedulePillJob = {
  id: string;
  status?: unknown;
  scheduled_date?: unknown;
  parent_job_id?: string | null;
  assigned_team?: unknown;
};

const KNOWN_PILL_STATUS = new Set(['scheduled', 'in_progress', 'completed', 'Done', 'cancelled']);

/** Neutral fallback for empty, whitespace, or non-string status. Never 'Scheduled'. */
export const STATUS_FALLBACK = 'Status';

export function sentenceStatus(status: unknown): string {
  const raw = asStatusText(status);
  if (!raw) return STATUS_FALLBACK;
  const spaced = raw.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function isUnknownScheduleStatus(status: unknown): boolean {
  return !KNOWN_PILL_STATUS.has(asStatusText(status));
}

export function scheduleInvoicedQueryIds(jobs: SchedulePillJob[]): string[] {
  const ids = new Set<string>();
  for (const job of jobs) {
    if (asStatusText(job.status) !== 'completed') continue;
    ids.add(job.id);
    if (job.parent_job_id) ids.add(job.parent_job_id);
  }
  return [...ids];
}

export function scheduleInvoicedJobIds(
  invoices: ScheduleInvoiceRow[],
  jobs: SchedulePillJob[],
): Set<string> {
  const invoiced = new Set(
    invoices.filter(row => row.status !== 'void').map(row => row.job_id),
  );
  const result = new Set<string>();
  for (const job of jobs) {
    if (invoiced.has(job.id) || (job.parent_job_id && invoiced.has(job.parent_job_id))) {
      result.add(job.id);
    }
  }
  return result;
}

export function schedulePill(
  job: SchedulePillJob,
  invoicedJobIds: Set<string> = new Set(),
): SchedulePill {
  if (!asDateText(job.scheduled_date)) return { label: 'No date', kind: 'nodate' };
  const status = asStatusText(job.status);
  if (status === 'cancelled') return { label: 'Cancelled', kind: 'cancelled' };
  if (status === 'completed') {
    const invoiced = invoicedJobIds.has(job.id)
      || (!!job.parent_job_id && invoicedJobIds.has(job.parent_job_id));
    return invoiced
      ? { label: 'Done', kind: 'done' }
      : { label: 'Ready to invoice', kind: 'ready' };
  }
  if (isNeedCrewJob(job)) return { label: 'Needs crew', kind: 'needcrew' };
  if (status === 'in_progress') return { label: 'In progress', kind: 'progress' };
  if (status === 'scheduled') return { label: 'Scheduled', kind: 'scheduled' };
  return { label: sentenceStatus(job.status), kind: 'status' };
}
