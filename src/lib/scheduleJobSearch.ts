import { supabase } from './supabase';
import { getAuditClients, getAuditJobs } from './devFieldAuditDocs';
import type { Client, Job, JobWithClient } from '../types/crm';

export const SCHEDULE_SEARCH_LIMIT = 15;

export function normalizeJobSearch(raw: string): string {
  return raw.replace(/^#+/, '').trim();
}

export function jobMatchesSearch(job: JobWithClient, raw: string): boolean {
  const q = normalizeJobSearch(raw).toLowerCase();
  if (!q) return false;
  const number = job.job_number != null ? String(job.job_number) : '';
  const padded = number ? number.padStart(4, '0') : '';
  return [
    job.title,
    job.description,
    job.address,
    job.client_name,
    job.client_address,
    number,
    padded,
    number ? `#${padded}` : '',
  ].some(v => (v ?? '').toLowerCase().includes(q));
}

export function attachJobClients(
  jobs: Job[],
  clients: Pick<Client, 'id' | 'name' | 'phone' | 'address'>[],
): JobWithClient[] {
  const map = new Map(clients.map(c => [c.id, c]));
  return jobs.map(j => ({
    ...j,
    client_name: j.client_id ? map.get(j.client_id)?.name ?? null : null,
    client_phone: j.client_id ? map.get(j.client_id)?.phone ?? null : null,
    client_address: j.client_id ? map.get(j.client_id)?.address ?? null : null,
  }));
}

function orFilter(columns: string[], value: string): string {
  const v = value.replace(/'/g, "''").replace(/[(),]/g, '');
  return columns.map(c => `${c}.ilike.%${v}%`).join(',');
}

export async function searchScheduleJobs(raw: string): Promise<JobWithClient[]> {
  const query = normalizeJobSearch(raw);
  if (!query) return [];

  const mockJobs = getAuditJobs();
  if (mockJobs) {
    return attachJobClients(mockJobs as Job[], getAuditClients() ?? [])
      .filter(j => j.status !== 'cancelled' && jobMatchesSearch(j, query))
      .slice(0, SCHEDULE_SEARCH_LIMIT);
  }

  const safe = query.replace(/'/g, "''").replace(/[(),]/g, '');
  const jobOr = orFilter(['title', 'description', 'address'], safe);
  const jobFilter = /^\d+$/.test(safe) ? `${jobOr},job_number.eq.${Number(safe)}` : jobOr;

  const [jobsRes, clientsRes] = await Promise.all([
    supabase.from('jobs').select('*').neq('status', 'cancelled').or(jobFilter).limit(SCHEDULE_SEARCH_LIMIT),
    supabase.from('clients').select('id, name, phone, address').ilike('name', `%${safe}%`).limit(SCHEDULE_SEARCH_LIMIT),
  ]);
  if (jobsRes.error) throw jobsRes.error;
  if (clientsRes.error) throw clientsRes.error;

  const byId = new Map<string, Job>();
  for (const row of jobsRes.data ?? []) byId.set(row.id, row as Job);

  const matchedClients = clientsRes.data ?? [];
  const clientIds = matchedClients.map(c => c.id);
  if (clientIds.length > 0) {
    const { data: clientJobs, error } = await supabase
      .from('jobs')
      .select('*')
      .neq('status', 'cancelled')
      .in('client_id', clientIds)
      .limit(SCHEDULE_SEARCH_LIMIT);
    if (error) throw error;
    for (const row of clientJobs ?? []) byId.set(row.id, row as Job);
  }

  const jobs = [...byId.values()];
  const extraClientIds = [...new Set(jobs.map(j => j.client_id).filter(Boolean))] as string[];
  const known = new Map(matchedClients.map(c => [c.id, c]));
  const missing = extraClientIds.filter(id => !known.has(id));
  if (missing.length > 0) {
    const { data, error } = await supabase.from('clients').select('id, name, phone, address').in('id', missing);
    if (error) throw error;
    for (const c of data ?? []) known.set(c.id, c);
  }

  return attachJobClients(jobs, [...known.values()])
    .filter(j => jobMatchesSearch(j, query))
    .slice(0, SCHEDULE_SEARCH_LIMIT);
}
