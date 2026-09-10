import { endOfDay, startOfDay } from '../time';
import type { DateKey, GrafterYesterday } from '../types';

type Company = { id: string; name: string | null; created_at: string; billing_status: string | null };
type Stamped = { company_id: string | null };

/**
 * Reads the Grafter Supabase project directly with the service role key.
 * Read only. Three small selects, no writes, no RPC.
 */
export async function fetchGrafterYesterday(
  baseUrl: string,
  serviceKey: string,
  yesterday: DateKey,
  tz: string,
): Promise<GrafterYesterday> {
  const from = startOfDay(yesterday, tz).toISOString();
  const to = endOfDay(yesterday, tz).toISOString();
  const rest = async <T>(path: string): Promise<T> => {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/rest/v1/${path}`, {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` },
    });
    if (!res.ok) throw new Error(`Supabase ${res.status} for ${path.split('?')[0]}`);
    return (await res.json()) as T;
  };
  const range = `created_at=gte.${from}&created_at=lt.${to}`;
  const [companies, quotes, jobs] = await Promise.all([
    rest<Company[]>('companies?select=id,name,created_at,billing_status&order=created_at.desc'),
    rest<Stamped[]>(`quotes?select=company_id&${range}`),
    rest<Stamped[]>(`jobs?select=company_id&${range}`),
  ]);
  return summariseGrafter(companies, quotes, jobs, from, to);
}

export function summariseGrafter(
  companies: Company[],
  quotes: Stamped[],
  jobs: Stamped[],
  fromIso: string,
  toIso: string,
): GrafterYesterday {
  const active = new Set<string>();
  for (const row of [...quotes, ...jobs]) if (row.company_id) active.add(row.company_id);
  return {
    signups: companies
      .filter(c => c.created_at >= fromIso && c.created_at < toIso)
      .map(c => c.name?.trim() || 'Unnamed company'),
    companiesTotal: companies.length,
    activeCompanies: active.size,
    quotesCreated: quotes.length,
    jobsCreated: jobs.length,
    paying: companies.filter(c => c.billing_status === 'active').length,
    trial: companies.filter(c => c.billing_status === 'trial').length,
    pastDue: companies.filter(c => c.billing_status === 'past_due').length,
  };
}
