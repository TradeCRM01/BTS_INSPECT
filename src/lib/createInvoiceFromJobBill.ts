import { supabase } from './supabase';
import { readPickedLabourPriceBookId } from './labourPriceBookPick';
import {
  invoiceLinesWithLabourPriceBook,
  loadCompanyDefaultLabourRate,
  pullUnbilledHoursToJobBill,
  resolveLabourSell,
} from './hoursToJobBill';
import {
  JOB_COST_INVOICE_SELECT,
  buildInvoiceFromJobBill,
  decideJobBillInvoice,
  invoiceLinesFromJobCosts,
  reuseAfterUniqueConflict,
  type JobBillCostLine,
} from './invoiceFromJobBill';
import {
  JOB_INVOICE_LIST_COLUMNS,
  asJobInvoiceListRow,
  type JobInvoiceListRow,
} from './invoiceFromQuote';

export type CreateInvoiceFromJobBillResult = {
  id: string;
  existing: boolean;
  invoice: JobInvoiceListRow | null;
  labourToast?: string | null;
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

  const pickedPb = readPickedLabourPriceBookId(input.companyId);
  const pull = await pullUnbilledHoursToJobBill(supabase, {
    jobId: input.jobId,
    companyId: input.companyId,
    profileId: input.profileId,
    pickedPriceBookItemId: pickedPb,
  });

  const { data: costs, error: costErr } = await supabase
    .from('job_costs')
    .select(JOB_COST_INVOICE_SELECT)
    .eq('job_id', input.jobId)
    .order('created_at', { ascending: true });
  if (costErr) throw costErr;

  const { data: pbItems, error: pbErr } = await supabase
    .from('price_book_items')
    .select('id, category, unit_price, is_active')
    .eq('company_id', input.companyId)
    .eq('is_active', true);
  if (pbErr) throw pbErr;
  const { rate: companyDefaultLabourRate } = await loadCompanyDefaultLabourRate(supabase, input.companyId);
  const labourSell = resolveLabourSell({
    staffRate: null,
    companyDefaultLabourRate,
    labourItems: pbItems ?? [],
    pickedPriceBookItemId: pickedPb,
  });

  const { data: existing, error: existingErr } = await supabase
    .from('invoices')
    .select(`${JOB_INVOICE_LIST_COLUMNS}, source, notes`)
    .eq('job_id', input.jobId)
    .order('created_at', { ascending: false });
  if (existingErr) throw existingErr;

  const lines = invoiceLinesWithLabourPriceBook(
    invoiceLinesFromJobCosts((costs ?? []) as JobBillCostLine[]),
    labourSell,
  );
  const decision = decideJobBillInvoice({
    clientId: job.client_id as string | null,
    lines,
    existing: existing ?? [],
  });
  if (decision.action === 'miss') throw new Error(decision.message);
  if (decision.action === 'reuse') {
    const reused = (existing ?? []).find(row => row.id === decision.invoiceId);
    return {
      id: decision.invoiceId,
      existing: true,
      invoice: asJobInvoiceListRow(reused),
      labourToast: pull.toast,
    };
  }

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
    .select(JOB_INVOICE_LIST_COLUMNS)
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: raced } = await supabase
        .from('invoices')
        .select(JOB_INVOICE_LIST_COLUMNS)
        .eq('job_id', input.jobId)
        .order('created_at', { ascending: false });
      const reuse = reuseAfterUniqueConflict(error.code, raced ?? []);
      if (reuse) {
        return {
          id: reuse.id as string,
          existing: true,
          invoice: asJobInvoiceListRow(reuse),
          labourToast: pull.toast,
        };
      }
    }
    throw error;
  }

  const invoice = asJobInvoiceListRow(data);
  if (!invoice) throw new Error('Invoice was not saved.');
  return { id: invoice.id, existing: false, invoice, labourToast: pull.toast };
}
