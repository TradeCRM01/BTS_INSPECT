export type SchedulePillKind =
  | 'ready'
  | 'done'
  | 'progress'
  | 'scheduled'
  | 'cancelled'
  | 'nodate';

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
  status?: string | null;
  scheduled_date?: string | null;
  parent_job_id?: string | null;
};

export function scheduleInvoicedQueryIds(jobs: SchedulePillJob[]): string[] {
  const ids = new Set<string>();
  for (const job of jobs) {
    if (job.status !== 'completed') continue;
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
  if (!job.scheduled_date) return { label: 'No date', kind: 'nodate' };
  if (job.status === 'cancelled') return { label: 'Cancelled', kind: 'cancelled' };
  if (job.status === 'in_progress') return { label: 'In progress', kind: 'progress' };
  if (job.status === 'completed') {
    const invoiced = invoicedJobIds.has(job.id)
      || (!!job.parent_job_id && invoicedJobIds.has(job.parent_job_id));
    return invoiced
      ? { label: 'Done', kind: 'done' }
      : { label: 'Ready to invoice', kind: 'ready' };
  }
  return { label: 'Scheduled', kind: 'scheduled' };
}
