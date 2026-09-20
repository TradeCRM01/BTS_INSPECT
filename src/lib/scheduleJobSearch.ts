import { supabase } from './supabase';
import { getAuditClients, getAuditJobs } from './devFieldAuditDocs';
import type { Client, Job, JobWithClient } from '../types/crm';
import { formatJobRef, withParentJobNumbers } from './jobRef';

export const SCHEDULE_SEARCH_LIMIT = 15;

export function normalizeJobSearch(raw: string): string {
  return raw.replace(/^#+/, '').trim();
}

export function jobMatchesSearch(job: JobWithClient, raw: string): boolean {
  const q = normalizeJobSearch(raw).toLowerCase();
  if (!q) return false;
  const number = job.job_number != null ? String(job.job_number) : '';
  const padded = number ? number.padStart(4, '0') : '';
  const ref = formatJobRef(job).toLowerCase();
  return [
    job.title,
    job.description,
    job.address,
    job.client_name,
    job.client_address,
    job.cost_code,
    ref,
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
  return withParentJobNumbers(jobs.map(j => ({
    ...j,
    client_name: j.client_id ? map.get(j.client_id)?.name ?? null : null,
    client_phone: j.client_id ? map.get(j.client_id)?.phone ?? null : null,
    client_address: j.client_id ? map.get(j.client_id)?.address ?? null : null,
  })));
}

const scheduleJobPatches = new Map<string, Partial<JobWithClient>>();

export function mergeScheduleJobPatch(jobId: string, patch: Partial<JobWithClient>) {
  scheduleJobPatches.set(jobId, { ...(scheduleJobPatches.get(jobId) ?? {}), ...patch });
}

export function withScheduleJobPatches<T extends { id: string }>(jobs: T[]): T[] {
  if (scheduleJobPatches.size === 0) return jobs;
  return jobs.map(j => {
    const patch = scheduleJobPatches.get(j.id);
    return patch ? { ...j, ...patch } : j;
  });
}

export async function hydrateJobParentNumbers(jobs: JobWithClient[]): Promise<JobWithClient[]> {
  const parentIds = [...new Set(jobs.map(j => j.parent_job_id).filter(Boolean))] as string[];
  const missing = parentIds.filter(id => !jobs.some(j => j.id === id));
  if (missing.length === 0) return withParentJobNumbers(jobs);
  const { data, error } = await supabase.from('jobs').select('id, job_number').in('id', missing);
  if (error) throw error;
  return withParentJobNumbers(jobs, (data ?? []) as { id: string; job_number: number | null }[]);
}

function orFilter(columns: string[], value: string): string {
  const v = value.replace(/'/g, "''").replace(/[(),]/g, '');
  return columns.map(c => `${c}.ilike.%${v}%`).join(',');
}

/** `#0042` / `42.01` → parent job number, optional cost code. */
export function parseJobRefQuery(raw: string): { jobNumber: number; costCode: string | null } | null {
  const q = normalizeJobSearch(raw);
  const m = q.match(/^(\d+)(?:\.([A-Za-z0-9][A-Za-z0-9_-]{0,11}))?$/);
  if (!m) return null;
  return { jobNumber: Number(m[1]), costCode: m[2] ?? null };
}

export async function searchScheduleJobs(raw: string): Promise<JobWithClient[]> {
  const query = normalizeJobSearch(raw);
  if (!query) return [];

  const mockJobs = getAuditJobs();
  if (mockJobs) {
    return withScheduleJobPatches(
      attachJobClients(mockJobs as Job[], getAuditClients() ?? []),
    )
      .filter(j => j.status !== 'cancelled' && jobMatchesSearch(j, query))
      .slice(0, SCHEDULE_SEARCH_LIMIT);
  }

  const safe = query.replace(/'/g, "''").replace(/[(),]/g, '');
  const ref = parseJobRefQuery(query);
  const jobOr = orFilter(['title', 'description', 'address', 'cost_code'], safe);
  const jobFilter = ref ? `${jobOr},job_number.eq.${ref.jobNumber}` : jobOr;

  const fetchJobs = (filter: string) =>
    supabase.from('jobs').select('*').neq('status', 'cancelled').or(filter).limit(SCHEDULE_SEARCH_LIMIT);

  const [jobsFirst, clientsRes] = await Promise.all([
    fetchJobs(jobFilter),
    supabase.from('clients').select('id, name, phone, address').ilike('name', `%${safe}%`).limit(SCHEDULE_SEARCH_LIMIT),
  ]);
  let jobsRes = jobsFirst;
  if (jobsRes.error && /cost_code/.test(jobsRes.error.message)) {
    const fallbackOr = orFilter(['title', 'description', 'address'], safe);
    const fallbackFilter = ref ? `${fallbackOr},job_number.eq.${ref.jobNumber}` : fallbackOr;
    jobsRes = await fetchJobs(fallbackFilter);
  }
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

  if (ref) {
    const { data: parents, error: parentErr } = await supabase
      .from('jobs')
      .select('id')
      .eq('job_number', ref.jobNumber)
      .limit(SCHEDULE_SEARCH_LIMIT);
    if (parentErr) throw parentErr;
    const parentIds = (parents ?? []).map(p => p.id);
    if (parentIds.length > 0) {
      const { data: children, error: childErr } = await supabase
        .from('jobs')
        .select('*')
        .neq('status', 'cancelled')
        .in('parent_job_id', parentIds)
        .limit(SCHEDULE_SEARCH_LIMIT);
      if (childErr) throw childErr;
      for (const row of children ?? []) byId.set(row.id, row as Job);
    }
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

  return (await hydrateJobParentNumbers(attachJobClients(jobs, [...known.values()])))
    .filter(j => jobMatchesSearch(j, query))
    .slice(0, SCHEDULE_SEARCH_LIMIT);
}
