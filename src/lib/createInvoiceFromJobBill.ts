import { supabase } from './supabase';
import { readPickedLabourPriceBookId } from './labourPriceBookPick';
import {
  loadCompanyDefaultLabourRate,
  loadUnbilledLabourPullPlan,
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
import {
  jobBillInvoicePreviewFromLines,
  planJobBillInvoiceLines,
} from './jobBillInvoicePlan';
import { isJobBillQuoted, pickMostRecentlyAcceptedQuote } from './acceptedQuotePick';
import {
  JOB_INVOICE_LIST_COLUMNS,
  asJobInvoiceListRow,
  type JobInvoiceListRow,
} from './invoiceFromQuote';
import type { QuoteLineItem } from '../types/fsm';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isDevFieldAuditAuth } from './devFieldAuditAuth';
import {
  AUDIT_DOC_CLIENT_ID,
  AUDIT_DOC_JOB_ID,
  fix2LookActive,
  getAuditFix2AcceptedQuote,
  getAuditFix2PlannedLabourPull,
  getAuditJobBillCosts,
} from './devFieldAuditDocs';

export type AcceptedQuoteForJobBill = {
  quoteId: string | null;
  quoteNumber: number | null;
  quoteLineItems: QuoteLineItem[] | null;
  isQuoted: boolean;
};

export async function loadAcceptedQuoteForJobBill(
  client: SupabaseClient,
  jobId: string,
): Promise<AcceptedQuoteForJobBill> {
  if (import.meta.env.DEV && isDevFieldAuditAuth() && jobId === AUDIT_DOC_JOB_ID && fix2LookActive()) {
    const mock = getAuditFix2AcceptedQuote();
    if (mock) {
      return {
        quoteId: mock.isQuoted ? mock.quoteId : null,
        quoteNumber: mock.isQuoted ? mock.quoteNumber : null,
        quoteLineItems: mock.isQuoted ? mock.quoteLineItems : null,
        isQuoted: mock.isQuoted,
      };
    }
  }
  const { data: rows, error: quoteErr } = await client
    .from('quotes')
    .select('id, quote_number, line_items, status, created_at')
    .eq('job_id', jobId)
    .eq('status', 'accepted');
  if (quoteErr) throw quoteErr;
  const picked = pickMostRecentlyAcceptedQuote(rows ?? []);
  const quoteLineItems = (picked?.line_items ?? null) as QuoteLineItem[] | null;
  const isQuoted = isJobBillQuoted(quoteLineItems);
  return {
    quoteId: isQuoted ? picked?.id ?? null : null,
    quoteNumber: isQuoted ? picked?.quote_number ?? null : null,
    quoteLineItems: isQuoted ? quoteLineItems : null,
    isQuoted,
  };
}

async function resolveLabourSellForJobBill(
  client: SupabaseClient,
  companyId: string,
) {
  const pickedPb = readPickedLabourPriceBookId(companyId);
  const { data: pbItems, error: pbErr } = await client
    .from('price_book_items')
    .select('id, category, unit_price, is_active')
    .eq('company_id', companyId)
    .eq('is_active', true);
  if (pbErr) throw pbErr;
  const { rate: companyDefaultLabourRate } = await loadCompanyDefaultLabourRate(client, companyId);
  return resolveLabourSell({
    staffRate: null,
    companyDefaultLabourRate,
    labourItems: pbItems ?? [],
    pickedPriceBookItemId: pickedPb,
  });
}

async function loadJobBillCosts(
  client: SupabaseClient,
  jobId: string,
): Promise<JobBillCostLine[]> {
  const { data: costs, error: costErr } = await client
    .from('job_costs')
    .select(JOB_COST_INVOICE_SELECT)
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });
  if (costErr) throw costErr;
  return (costs ?? []) as JobBillCostLine[];
}

export async function loadJobBillInvoiceLinePlan(
  client: SupabaseClient,
  input: {
    jobId: string;
    companyId: string;
    profileId: string;
    taxRate: number;
    includeLoggedHoursExtra: boolean;
    quote: AcceptedQuoteForJobBill;
    costs?: JobBillCostLine[];
    skipPullPlan?: boolean;
  },
) {
  const auditFix2 = import.meta.env.DEV
    && isDevFieldAuditAuth()
    && input.jobId === AUDIT_DOC_JOB_ID
    && fix2LookActive();
  const costs = input.costs ?? (auditFix2
    ? ((getAuditJobBillCosts() ?? []) as JobBillCostLine[])
    : await loadJobBillCosts(client, input.jobId));
  const pickedPb = readPickedLabourPriceBookId(input.companyId);
  const pullPlan = input.skipPullPlan
    ? null
    : auditFix2
      ? {
        planned: getAuditFix2PlannedLabourPull() ?? [],
        pickerCheck: { needsPicker: false, pickerItems: [] },
      }
      : await loadUnbilledLabourPullPlan(client, {
      jobId: input.jobId,
      companyId: input.companyId,
      profileId: input.profileId,
      pickedPriceBookItemId: pickedPb,
    });
  const labourSell = await resolveLabourSellForJobBill(client, input.companyId);
  const lines = planJobBillInvoiceLines({
    quoteLineItems: input.quote.quoteLineItems,
    costs,
    plannedLabourPull: pullPlan?.planned ?? [],
    includeLoggedHoursExtra: input.includeLoggedHoursExtra,
    labourSell,
  });
  const preview = jobBillInvoicePreviewFromLines(lines, input.taxRate, {
    quoteNumber: input.quote.quoteNumber,
    quoteLineItems: input.quote.quoteLineItems,
    costs,
    plannedLabourPull: pullPlan?.planned ?? [],
    includeLoggedHoursExtra: input.includeLoggedHoursExtra,
    labourSell,
  });
  return {
    lines,
    labourSell,
    costs,
    plannedLabourPull: pullPlan?.planned ?? [],
    preview,
    pullPlan,
  };
}

export async function loadJobBillInvoicePreview(input: {
  jobId: string;
  companyId: string;
  profileId: string;
  taxRate: number;
  includeLoggedHoursExtra?: boolean;
}) {
  const quote = await loadAcceptedQuoteForJobBill(supabase, input.jobId);
  const { preview } = await loadJobBillInvoiceLinePlan(supabase, {
    jobId: input.jobId,
    companyId: input.companyId,
    profileId: input.profileId,
    taxRate: input.taxRate,
    includeLoggedHoursExtra: input.includeLoggedHoursExtra === true,
    quote,
  });
  return preview;
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

  const auditFix2Create = import.meta.env.DEV
    && isDevFieldAuditAuth()
    && input.jobId === AUDIT_DOC_JOB_ID
    && fix2LookActive();

  let job: { id: string; client_id: string | null } | null = null;
  if (auditFix2Create) {
    job = { id: input.jobId, client_id: AUDIT_DOC_CLIENT_ID };
  } else {
    const { data, error: jobErr } = await supabase
      .from('jobs')
      .select('id, client_id')
      .eq('id', input.jobId)
      .maybeSingle();
    if (jobErr) throw jobErr;
    job = data;
  }
  if (!job) throw new Error('Job not found');

  const quote = await loadAcceptedQuoteForJobBill(supabase, input.jobId);
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
  if (!auditFix2Create && (!quote.isQuoted || includeLoggedHoursExtra)) {
    pull = await pullUnbilledHoursToJobBill(supabase, {
      jobId: input.jobId,
      companyId: input.companyId,
      profileId: input.profileId,
      pickedPriceBookItemId: pickedPb,
    });
  }

  const { lines } = await loadJobBillInvoiceLinePlan(supabase, {
    jobId: input.jobId,
    companyId: input.companyId,
    profileId: input.profileId,
    taxRate: input.taxRate,
    includeLoggedHoursExtra,
    quote,
    skipPullPlan: false,
  });

  if (auditFix2Create) {
    const payload = buildInvoiceFromJobBill({
      clientId: job.client_id as string,
      jobId: input.jobId,
      taxRate: input.taxRate,
      lines,
      quoteId: quote.isQuoted ? quote.quoteId : null,
    });
    const auditRow = {
      id: 'audit-fix2-invoice',
      company_id: input.companyId,
      invoice_number: 9102,
      client_id: job.client_id,
      job_id: input.jobId,
      quote_id: quote.quoteId,
      source: payload.source,
      status: 'draft' as const,
      line_items: payload.line_items,
      subtotal: payload.subtotal,
      tax_rate: payload.tax_rate,
      tax_amount: payload.tax_amount,
      total: payload.total,
      amount_paid: 0,
      payment_terms: payload.payment_terms,
      due_date: payload.due_date,
      notes: payload.notes,
      inclusions: payload.inclusions,
      exclusions: payload.exclusions,
      created_by: input.profileId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    try {
      sessionStorage.setItem('audit-fix2-invoice-row', JSON.stringify(auditRow));
    } catch {
      /* ignore */
    }
    return {
      id: auditRow.id,
      existing: false,
      invoice: asJobInvoiceListRow(auditRow),
      labourToast: pull.toast,
    };
  }

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
    quoteId: quote.isQuoted ? quote.quoteId : null,
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
