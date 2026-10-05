import { formatJobRef } from './jobRef';

export const JOBS_LIST_NO_CLIENT = 'No client';
export const JOB_CLIENT_ATTACH_PLACEHOLDER = 'Add client…';

/** Visible job name on list rows. Title first — not only #0001. */
export function jobsListTitle(job: {
  title?: string | null;
  job_number?: number | null;
  cost_code?: string | null;
  parent_job_number?: number | null;
}): string {
  const title = (job.title ?? '').trim();
  return title || formatJobRef(job);
}

/** Customer cell. Blank client_name becomes No client, never an empty cell. */
export function jobsListCustomer(job: { client_name?: string | null }): string {
  return (job.client_name ?? '').trim() || JOBS_LIST_NO_CLIENT;
}
