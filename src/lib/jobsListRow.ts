import type { JobStatus } from '../types/crm';
import { formatJobRef } from './jobRef';
import {
  JOB_PILL_SET_A_DATE,
  jobStatusPill,
  type JobStatusPill,
  type JobStatusPillInput,
} from './jobStatusPill';

export const JOBS_LIST_NO_CLIENT = 'No client';
export const JOBS_LIST_NO_CREW = 'No crew yet';
export const JOB_CLIENT_ATTACH_PLACEHOLDER = 'Add client…';
const PHONE_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function jobsListTitle(job: {
  title?: string | null;
  job_number?: number | null;
  cost_code?: string | null;
  parent_job_number?: number | null;
}): string {
  const title = (job.title ?? '').trim();
  return title || formatJobRef(job);
}

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

export function jobsListCrewLabel(
  assignedTeam: string[] | null | undefined,
  members: ReadonlyArray<{ id: string; name?: string | null }> | null | undefined,
): string {
  const names: string[] = [];
  for (const id of assignedTeam ?? []) {
    const name = (members ?? []).find((member) => member.id === id)?.name?.trim();
    if (name) names.push(name);
  }
  return names.length > 0 ? names.join(', ') : JOBS_LIST_NO_CREW;
}

export function jobsListPhoneLine2(input: {
  ref: string;
  suburb: string;
  crew: string;
}): string {
  return [input.ref, input.suburb, input.crew].filter(Boolean).join(' · ');
}

export function jobsListPhoneLine3(input: {
  client: string;
  date: string;
}): string {
  return [input.client, input.date].filter(Boolean).join(' · ');
}

export function jobsListStatusPill(input: JobStatusPillInput): JobStatusPill {
  return jobStatusPill(input);
}

export function jobsListPhoneRow(job: {
  title?: string | null;
  job_number?: number | null;
  cost_code?: string | null;
  parent_job_number?: number | null;
  client_name?: string | null;
  address?: string | null;
  client_address?: string | null;
  status: JobStatus | string;
  scheduled_date?: string | null;
  assigned_team?: string[] | null;
  invoices?: JobStatusPillInput['invoices'];
  parentInvoices?: JobStatusPillInput['parentInvoices'];
  children?: JobStatusPillInput['children'];
  invoiceReadError?: boolean;
}, crewLabel?: string): {
  title: string;
  ref: string;
  meta: string;
  line2: string;
  line3: string;
  status: string;
  statusClass: string;
  date: string;
  pill: JobStatusPill;
} {
  const suburb = jobsListSuburbFromSite(jobsListSite(job.address, job.client_address));
  const crew = crewLabel ?? jobsListCrewLabel(job.assigned_team, []);
  const ref = formatJobRef(job);
  const date = jobsListPhoneDate(job.scheduled_date);
  const pill = jobsListStatusPill(job);
  const line2 = jobsListPhoneLine2({ ref, suburb, crew });
  const line3 = jobsListPhoneLine3({ client: jobsListCustomer(job), date });
  return {
    title: jobsListTitle(job),
    ref,
    meta: line2,
    line2,
    line3,
    status: pill.label,
    statusClass: `hub-jobs-pill is-${pill.tone}`,
    date,
    pill,
  };
}

export function jobsListPhoneNextLabel(next: { actionable: boolean; label: string }): string | null {
  if (!next.actionable) return null;
  return next.label;
}

export function jobsListUndatedNextLabel(pillKind: string, nextLabel: string | null): string | null {
  if (pillKind === 'no_date') return JOB_PILL_SET_A_DATE;
  return nextLabel;
}
