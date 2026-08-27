/** Simpro-style job ref: #0042 or #0042.01 when a cost code is assigned. */

export function padJobNumber(n: number): string {
  return String(n).padStart(4, '0');
}

export function normalizeCostCode(raw: string | null | undefined): string {
  return (raw ?? '').trim().replace(/^\.+/, '').slice(0, 12);
}

export function nextCostCode(existing: (string | null | undefined)[]): string {
  const used = new Set(existing.map(c => normalizeCostCode(c)).filter(Boolean).map(c => c.toLowerCase()));
  for (let i = 1; i <= 99; i++) {
    const code = String(i).padStart(2, '0');
    if (!used.has(code)) return code;
  }
  return String(existing.length + 1).padStart(2, '0');
}

export function formatJobRef(job: {
  job_number?: number | null;
  cost_code?: string | null;
  parent_job_number?: number | null;
}): string {
  const base = job.parent_job_number ?? job.job_number;
  const num = base != null ? `#${padJobNumber(base)}` : 'JOB';
  const code = normalizeCostCode(job.cost_code);
  return code ? `${num}.${code}` : num;
}

export function withParentJobNumbers<T extends {
  id: string;
  parent_job_id?: string | null;
  job_number?: number | null;
}>(
  jobs: T[],
  extraParents?: { id: string; job_number: number | null }[],
): (T & { parent_job_number: number | null })[] {
  const known = new Map<string, number | null>();
  for (const j of jobs) known.set(j.id, j.job_number ?? null);
  for (const p of extraParents ?? []) known.set(p.id, p.job_number);
  return jobs.map(j => ({
    ...j,
    parent_job_number: j.parent_job_id ? known.get(j.parent_job_id) ?? null : null,
  }));
}
