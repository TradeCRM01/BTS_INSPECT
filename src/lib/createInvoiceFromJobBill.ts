import { supabase } from './supabase';
import { readPickedLabourPriceBookId } from './labourPriceBookPick';
import {
  loadCompanyDefaultLabourRate,
  pullUnbilledHoursToJobBill,
  resolveLabourSell,
} from './hoursToJobBill';
import {
  JOB_COST_INVOICE_SELECT,
  buildInvoiceFromJobBill,
  decideJobBillInvoice,
  reuseAfterUniqueConflict,
  type JobBillCostLine,
} from './invoiceFromJobBill';
import { jobBillInvoicePreviewFromLines, planJobBillInvoiceLinesFromCosts } from './jobBillInvoicePlan';
import {
  JOB_INVOICE_LIST_COLUMNS,
  asJobInvoiceListRow,
  invoiceLinesFromQuote,
  type JobInvoiceListRow,
} from './invoiceFromQuote';
import type { QuoteLineItem } from '../types/fsm';
import type { SupabaseClient } from '@supabase/supabase-js';

async function loadAcceptedQuoteLineItems(
  client: SupabaseClient,
  jobId: string,
): Promise<{ quoteId: string | null; quoteLineItems: QuoteLineItem[] | null }> {
  const { data: acceptedQuote, error: quoteErr } = await client
    .from('quotes')
    .select('id, line_items, status')
    .eq('job_id', jobId)
    .eq('status', 'accepted')
    .maybeSingle();
  if (quoteErr) throw quoteErr;
  const quoteLineItems = (acceptedQuote?.line_items ?? null) as QuoteLineItem[] | null;
  const hasLines = invoiceLinesFromQuote(quoteLineItems).length > 0;
  return {
    quoteId: hasLines ? acceptedQuote?.id ?? null : null,
    quoteLineItems: hasLines ? quoteLineItems : null,
  };
}

async function loadJobBillInvoiceLines(
  client: SupabaseClient,
  input: {
    jobId: string;
    companyId: string;
    quoteLineItems: QuoteLineItem[] | null;
    includeLoggedHoursExtra: boolean;
  },
) {
  const { data: costs, error: costErr } = await client
    .from('job_costs')
    .select(JOB_COST_INVOICE_SELECT)
    .eq('job_id', input.jobId)
    .order('created_at', { ascending: true });
  if (costErr) throw costErr;

  const pickedPb = readPickedLabourPriceBookId(input.companyId);
  const { data: pbItems, error: pbErr } = await client
    .from('price_book_items')
    .select('id, category, unit_price, is_active')
    .eq('company_id', input.companyId)
    .eq('is_active', true);
  if (pbErr) throw pbErr;
  const { rate: companyDefaultLabourRate } = await loadCompanyDefaultLabourRate(client, input.companyId);
  const labourSell = resolveLabourSell({
    staffRate: null,
    companyDefaultLabourRate,
    labourItems: pbItems ?? [],
    pickedPriceBookItemId: pickedPb,
  });

  const lines = planJobBillInvoiceLinesFromCosts({
    quoteLineItems: input.quoteLineItems,
    costs: (costs ?? []) as JobBillCostLine[],
    includeLoggedHoursExtra: input.includeLoggedHoursExtra,
    labourSell,
  });
  return { lines, labourSell };
}

export async function loadJobBillInvoicePreview(input: {
  jobId: string;
  companyId: string;
  includeLoggedHoursExtra?: boolean;
}) {
  const { quoteLineItems } = await loadAcceptedQuoteLineItems(supabase, input.jobId);
  const { lines } = await loadJobBillInvoiceLines(supabase, {
    jobId: input.jobId,
    companyId: input.companyId,
    quoteLineItems,
    includeLoggedHoursExtra: input.includeLoggedHoursExtra === true,
  });
  return jobBillInvoicePreviewFromLines(lines);
}

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
  includeLoggedHoursExtra?: boolean;
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

  const { quoteId, quoteLineItems } = await loadAcceptedQuoteLineItems(supabase, input.jobId);
  const hasAcceptedQuote = quoteId != null;
  const includeLoggedHoursExtra = input.includeLoggedHoursExtra === true;

  const pickedPb = readPickedLabourPriceBookId(input.companyId);
  let pull: Awaited<ReturnType<typeof pullUnbilledHoursToJobBill>> = {
    inserted: 0,
    hours: 0,
    columnMissing: false,
    toast: null,
    needsPicker: false,
    pickerItems: [],
  };
  if (!hasAcceptedQuote || includeLoggedHoursExtra) {
    pull = await pullUnbilledHoursToJobBill(supabase, {
      jobId: input.jobId,
      companyId: input.companyId,
      profileId: input.profileId,
      pickedPriceBookItemId: pickedPb,
    });
  }

  const { lines } = await loadJobBillInvoiceLines(supabase, {
    jobId: input.jobId,
    companyId: input.companyId,
    quoteLineItems,
    includeLoggedHoursExtra,
  });

  const { data: existing, error: existingErr } = await supabase
    .from('invoices')
    .select(`${JOB_INVOICE_LIST_COLUMNS}, source, notes`)
    .eq('job_id', input.jobId)
    .order('created_at', { ascending: false });
  if (existingErr) throw existingErr;

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
    quoteId: hasAcceptedQuote ? quoteId : null,
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
