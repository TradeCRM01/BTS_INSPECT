import { supabase } from './supabase';

export const JOB_PARENT_INVOICED_KEY = 'job-parent-invoiced';
export const JOB_PARENT_INVOICED_SELECT = 'id, job_id, status';
export const JOB_PARENT_INVOICED_COLUMNS = ['id', 'job_id', 'status'] as const;

export type JobParentInvoiceRow = {
  id: string;
  job_id: string;
  status: string;
};

type ParentInvoiceClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          neq: (column: string, value: string) => Promise<{
            data: JobParentInvoiceRow[] | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

export function jobParentInvoicedQueryKey(parentId: string): [string, string] {
  return [JOB_PARENT_INVOICED_KEY, parentId];
}

export function jobParentInvoicedEnabled(job: {
  status?: string | null;
  parent_job_id?: string | null;
}): boolean {
  return job.status === 'completed' && !!(job.parent_job_id ?? '').trim();
}

export async function loadParentInvoiced(
  input: { companyId: string; parentJobId: string },
  client: ParentInvoiceClient = supabase as unknown as ParentInvoiceClient,
): Promise<JobParentInvoiceRow[]> {
  const { data, error } = await client
    .from('invoices')
    .select(JOB_PARENT_INVOICED_SELECT)
    .eq('company_id', input.companyId)
    .eq('job_id', input.parentJobId)
    .neq('status', 'void');
  if (error) throw error;
  return data ?? [];
}
