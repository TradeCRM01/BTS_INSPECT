import type { JobStatus } from '../types/crm';
import { jobNeedsCrew } from './needCrew';

export const JOB_PILL_READY = 'Ready to invoice';
export const JOB_PILL_DONE = 'Done';
export const JOB_PILL_IN_PROGRESS = 'In progress';
export const JOB_PILL_NEEDS_CREW = 'Needs crew';
export const JOB_PILL_SCHEDULED = 'Scheduled';
export const JOB_PILL_NO_DATE = 'No date';
export const JOB_PILL_CANCELLED = 'Cancelled';
export const JOB_PILL_SET_A_DATE = 'Set a date';

export type JobPillKind =
  | 'ready_to_invoice'
  | 'done'
  | 'in_progress'
  | 'needs_crew'
  | 'scheduled'
  | 'no_date'
  | 'cancelled';

export type JobPillTone = 'ok' | 'draft' | 'live' | 'warn' | 'sched' | 'bad';

export type JobStatusPill = {
  kind: JobPillKind;
  label: string;
  tone: JobPillTone;
};

export type JobInvoiceHint = {
  status?: string | null;
};

export type JobStatusPillInput = {
  status: JobStatus | string;
  scheduled_date?: string | null;
  assigned_team?: string[] | null;
  invoices?: readonly JobInvoiceHint[] | null;
  parentInvoices?: readonly JobInvoiceHint[] | null;
  children?: readonly { status?: string | null }[] | null;
  invoiceReadError?: boolean;
};

function hasNonVoidInvoice(rows: readonly JobInvoiceHint[] | null | undefined): boolean {
  return (rows ?? []).some((row) => (row.status ?? '').trim() !== '' && row.status !== 'void');
}

function parentChildrenBlockReady(children: readonly { status?: string | null }[] | null | undefined): boolean {
  if (!children || children.length === 0) return false;
  return children.some((child) => child.status !== 'completed');
}

function completedPill(input: JobStatusPillInput): JobStatusPill {
  if (input.invoiceReadError) {
    return { kind: 'done', label: JOB_PILL_DONE, tone: 'draft' };
  }
  if (
    hasNonVoidInvoice(input.invoices)
    || hasNonVoidInvoice(input.parentInvoices)
    || parentChildrenBlockReady(input.children)
  ) {
    return { kind: 'done', label: JOB_PILL_DONE, tone: 'draft' };
  }
  return { kind: 'ready_to_invoice', label: JOB_PILL_READY, tone: 'ok' };
}

export function jobStatusPill(input: JobStatusPillInput): JobStatusPill {
  if (input.status === 'cancelled') {
    return { kind: 'cancelled', label: JOB_PILL_CANCELLED, tone: 'bad' };
  }
  if (input.status === 'completed') return completedPill(input);
  if (input.status === 'in_progress') {
    return { kind: 'in_progress', label: JOB_PILL_IN_PROGRESS, tone: 'live' };
  }
  const dated = !!(input.scheduled_date ?? '').trim();
  if (!dated) {
    return { kind: 'no_date', label: JOB_PILL_NO_DATE, tone: 'draft' };
  }
  if (jobNeedsCrew({ status: 'scheduled', assigned_team: input.assigned_team })) {
    return { kind: 'needs_crew', label: JOB_PILL_NEEDS_CREW, tone: 'warn' };
  }
  return { kind: 'scheduled', label: JOB_PILL_SCHEDULED, tone: 'sched' };
}

export const JOBS_LIST_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'need_crew', label: 'Need crew' },
  { key: 'ready_to_invoice', label: 'Ready to invoice' },
] as const;

export type JobsListFilterKey = (typeof JOBS_LIST_FILTERS)[number]['key'];

export function jobMatchesListFilter(
  job: JobStatusPillInput,
  filter: JobsListFilterKey,
): boolean {
  if (filter === 'all') return true;
  if (filter === 'need_crew') return jobNeedsCrew(job);
  if (filter === 'ready_to_invoice') return jobStatusPill(job).kind === 'ready_to_invoice';
  return job.status === filter;
}

export function countJobsListFilter<T extends JobStatusPillInput>(
  jobs: readonly T[],
  filter: JobsListFilterKey,
): number {
  return jobs.reduce((n, job) => n + (jobMatchesListFilter(job, filter) ? 1 : 0), 0);
}
