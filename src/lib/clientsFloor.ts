import { format, parseISO } from 'date-fns';
import { JOB_STATUS_LABELS, type JobStatus } from '../types/crm';
import type { HubQueryScope } from './clientRecords';
import { clientRecordHref, jobRecordHref } from './clientRecords';

/** Extra job fields the /clients list needs to find a client by their work. */
export const CLIENT_LIST_FLOOR_JOB_COLUMNS =
  'client_id, status, scheduled_date, address, title, job_number';

export function clientListFloorJobScope(scope: HubQueryScope): HubQueryScope {
  return { ...scope, columns: CLIENT_LIST_FLOOR_JOB_COLUMNS };
}

export function clientOpenHref(clientId: string): string {
  return clientRecordHref(clientId);
}

export function clientJobOpenHref(jobId: string): string {
  return jobRecordHref(jobId);
}

export function padClientJobNumber(n: number | null | undefined): string {
  return String(n ?? 0).padStart(4, '0');
}

export function normalizeClientSearch(raw: string): string {
  return raw.replace(/^#+/, '').trim().toLowerCase();
}

export type ClientSearchJob = {
  title?: string | null;
  address?: string | null;
  job_number?: number | null;
};

/** Job title, site, and number so “Smith St” or “#0042” finds the client. */
export function clientJobSearchBits(job: ClientSearchJob): string[] {
  const bits: string[] = [];
  const title = job.title?.trim();
  const site = job.address?.trim();
  if (title) bits.push(title);
  if (site) bits.push(site);
  if (job.job_number != null) {
    const raw = String(job.job_number);
    const padded = padClientJobNumber(job.job_number);
    bits.push(raw, padded, `#${padded}`);
  }
  return bits;
}

export function collectJobSearchBitsByClient(
  jobs: Array<ClientSearchJob & { client_id?: string | null }>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const job of jobs) {
    if (!job.client_id) continue;
    const bits = clientJobSearchBits(job);
    if (bits.length === 0) continue;
    const existing = map.get(job.client_id) ?? [];
    existing.push(...bits);
    map.set(job.client_id, existing);
  }
  return map;
}

export type ClientSearchRow = {
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  jobSearchBits?: string[];
};

export function clientSearchHaystack(client: ClientSearchRow): string {
  return [
    client.name,
    client.contact_person,
    client.phone,
    client.email,
    client.address,
    client.notes,
    ...(client.jobSearchBits ?? []),
  ]
    .filter((part): part is string => !!part && part.trim().length > 0)
    .join(' ')
    .toLowerCase();
}

export function clientMatchesSearch(client: ClientSearchRow, query: string): boolean {
  const q = normalizeClientSearch(query);
  if (!q) return true;
  return clientSearchHaystack(client).includes(q);
}

export function filterClientsForSearch<T extends ClientSearchRow>(
  clients: T[],
  query: string,
): T[] {
  if (!normalizeClientSearch(query)) return clients;
  return clients.filter(client => clientMatchesSearch(client, query));
}

export function formatClientJobCount(count: number): string | null {
  if (count <= 0) return null;
  return count === 1 ? '1 job' : `${count} jobs`;
}

export function clientJobStatusLabel(status: string | null | undefined): string | null {
  const raw = (status ?? '').trim();
  if (!raw) return null;
  return JOB_STATUS_LABELS[raw as JobStatus] ?? raw;
}

function visibleSite(address?: string | null): string {
  const trimmed = address?.trim();
  if (!trimmed || trimmed === 'No site address') return '';
  return trimmed;
}

export function clientJobFloorTitle(job: {
  address?: string | null;
  title?: string | null;
  job_number?: number | null;
}): string {
  const site = visibleSite(job.address);
  if (site) return site;
  const title = job.title?.trim();
  if (title) return title;
  if (job.job_number != null) return `#${padClientJobNumber(job.job_number)}`;
  return '';
}

export function formatClientJobDate(iso: string | null | undefined): string | null {
  const raw = iso?.trim();
  if (!raw) return null;
  const parsed = parseISO(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, 'd MMM yyyy');
}

export function formatClientJobTime(time: string | null | undefined): string | null {
  const raw = time?.trim();
  if (!raw) return null;
  return raw.slice(0, 5);
}

export function clientJobFloorMeta(job: {
  address?: string | null;
  title?: string | null;
  job_number?: number | null;
  status?: string | null;
  scheduled_date?: string | null;
  start_time?: string | null;
}): string {
  const title = clientJobFloorTitle(job);
  const number = job.job_number != null ? `#${padClientJobNumber(job.job_number)}` : null;
  return [
    number && title !== number ? number : null,
    job.title?.trim() && job.title.trim() !== title ? job.title.trim() : null,
    clientJobStatusLabel(job.status),
    formatClientJobDate(job.scheduled_date),
    formatClientJobTime(job.start_time),
  ].filter(Boolean).join(' · ');
}

function clientJobFloorRank(job: {
  status?: string | null;
  scheduled_date?: string | null;
}): number {
  if (job.status === 'in_progress') return 0;
  if (job.status === 'scheduled' && !job.scheduled_date) return 1;
  if (job.status === 'scheduled') return 2;
  if (job.status === 'completed') return 3;
  if (job.status === 'cancelled') return 4;
  return 5;
}

/** Live work first, then dated scheduled, then closed. Newest date within a rank. */
export function sortClientJobsForFloor<T extends {
  status?: string | null;
  scheduled_date?: string | null;
  job_number?: number | null;
}>(jobs: T[]): T[] {
  return [...jobs].sort((a, b) => {
    const rank = clientJobFloorRank(a) - clientJobFloorRank(b);
    if (rank !== 0) return rank;
    const da = a.scheduled_date ?? '';
    const db = b.scheduled_date ?? '';
    if (da !== db) return db.localeCompare(da);
    return (b.job_number ?? 0) - (a.job_number ?? 0);
  });
}

export function clientJobsEmptyTitle(args: { error?: boolean; count: number }): string {
  if (args.error) return 'Could not load jobs';
  if (args.count === 0) return 'No jobs yet';
  return '';
}
