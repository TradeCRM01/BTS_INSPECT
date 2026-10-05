import { JOB_STATUS_LABELS, type JobStatus } from '../types/crm';
import { formatJobRef } from './jobRef';

export const JOBS_LIST_NO_CLIENT = 'No client';
export const JOB_CLIENT_ATTACH_PLACEHOLDER = 'Add client…';
const PHONE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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

export function jobsListSite(...parts: Array<string | null | undefined>): string {
  for (const part of parts) {
    const trimmed = part?.trim();
    if (trimmed && trimmed !== 'No site address') return trimmed;
  }
  return '';
}

export function jobsListSuburbFromSite(site: string): string {
  const parts = site.split(',').map(part => part.trim()).filter(Boolean);
  if (parts.length < 2) return site;
  const loc = parts[1].replace(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b.*$/i, '').trim();
  return loc || parts[1];
}

export function jobsListPhoneDate(ymd: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec((ymd ?? '').trim());
  if (!match) return '';
  const month = PHONE_MONTHS[Number(match[2]) - 1];
  if (!month) return '';
  return `${Number(match[3])} ${month}`;
}

export function jobsListPhoneRow(job: {
  title?: string | null;
  job_number?: number | null;
  cost_code?: string | null;
  parent_job_number?: number | null;
  client_name?: string | null;
  address?: string | null;
  client_address?: string | null;
  status: JobStatus;
  scheduled_date?: string | null;
}): {
  title: string;
  ref: string;
  meta: string;
  status: string;
  date: string;
} {
  const suburb = jobsListSuburbFromSite(jobsListSite(job.address, job.client_address));
  const bits = [jobsListCustomer(job), suburb].filter(Boolean);
  return {
    title: jobsListTitle(job),
    ref: formatJobRef(job),
    meta: bits.join(' · '),
    status: JOB_STATUS_LABELS[job.status],
    date: jobsListPhoneDate(job.scheduled_date),
  };
}
