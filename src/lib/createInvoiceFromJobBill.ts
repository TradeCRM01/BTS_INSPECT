import { supabase } from './supabase';
import {
  JOB_COST_INVOICE_SELECT,
  buildInvoiceFromJobBill,
  decideJobBillInvoice,
  invoiceLinesFromJobCosts,
  reuseAfterUniqueConflict,
  type JobBillCostLine,
} from './invoiceFromJobBill';

export type CreateInvoiceFromJobBillResult = {
  id: string;
  existing: boolean;
};

/**
 * Draft invoice from this job's bill lines. Does not send, stamp overdue,
 * or chase. Quote convert stays on its own path.
 */
export async function createInvoiceFromJobBill(input: {
  jobId: string;
  companyId: string;
  profileId: string;
  taxRate: number;
}): Promise<CreateInvoiceFromJobBillResult> {
  if (!input.companyId || !input.profileId) throw new Error('No company context');
  if (!input.jobId) throw new Error('Missing job');

  const { data: job, error: jobErr } = await supabase
    .from('jobs')
    .select('id, client_id')
    .eq('id', input.jobId)
    .maybeSingle();
  if (jobErr) throw jobErr;
  if (!job) throw new Error('Job not found');

  const { data: costs, error: costErr } = await supabase
    .from('job_costs')
    .select(JOB_COST_INVOICE_SELECT)
    .eq('job_id', input.jobId)
    .order('created_at', { ascending: true });
  if (costErr) throw costErr;

  const { data: existing, error: existingErr } = await supabase
    .from('invoices')
    .select('id, status, source, notes, quote_id')
    .eq('job_id', input.jobId)
    .order('created_at', { ascending: false });
  if (existingErr) throw existingErr;

  const lines = invoiceLinesFromJobCosts((costs ?? []) as JobBillCostLine[]);
  const decision = decideJobBillInvoice({
    clientId: job.client_id as string | null,
    lines,
    existing: existing ?? [],
  });
  if (decision.action === 'miss') throw new Error(decision.message);
  if (decision.action === 'reuse') return { id: decision.invoiceId, existing: true };

  const payload = buildInvoiceFromJobBill({
    clientId: job.client_id as string,
    jobId: input.jobId,
    taxRate: input.taxRate,
    lines,
  });

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      ...payload,
      company_id: input.companyId,
      created_by: input.profileId,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('invoices')
        .select('id, status')
        .eq('job_id', input.jobId)
        .order('created_at', { ascending: false });
      const reuse = reuseAfterUniqueConflict(error.code, raced ?? []);
      if (reuse) return { id: reuse.id as string, existing: true };
    }
    throw error;
  }

  return { id: data.id as string, existing: false };
}
