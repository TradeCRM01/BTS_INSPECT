import { supabase } from './supabase';
import type { QuoteLineItem } from '../types/fsm';
import { jobFieldsFromQuote } from './quoteJobFields';

export { jobFieldsFromQuote, padQuoteNumber, scheduledDateFromQuote } from './quoteJobFields';

function costTypeFromLine(li: QuoteLineItem): 'labor' | 'materials' {
  if (li.cost_model_id) return 'labor';
  const charge = (li.charge_type || '').toLowerCase();
  if (charge.includes('labour') || charge.includes('labor')) return 'labor';
  return 'materials';
}

export type ConvertibleQuote = {
  id: string;
  company_id: string;
  quote_number: number | null;
  client_id: string | null;
  job_id: string | null;
  description: string | null;
  scope_of_works: string | null;
  line_items: QuoteLineItem[] | null;
  total: number | null;
  /** Job board date. Copied onto jobs.scheduled_date when present; never invented. */
  scheduled_date?: string | null;
};

/** Creates a job from an accepted quote, or returns the existing job if already converted. */
export async function convertQuoteToJob(quote: ConvertibleQuote, profileId: string): Promise<string> {
  const { data: latest, error: latestErr } = await supabase
    .from('quotes')
    .select('job_id')
    .eq('id', quote.id)
    .maybeSingle();
  if (latestErr) throw latestErr;
  if (latest?.job_id) return latest.job_id as string;

  let clientAddress: string | null = null;
  if (quote.client_id) {
    const { data: client } = await supabase
      .from('clients')
      .select('address')
      .eq('id', quote.client_id)
      .maybeSingle();
    clientAddress = client?.address ?? null;
  }

  const fields = jobFieldsFromQuote(quote, clientAddress);
  const { data: jobData, error: jobErr } = await supabase
    .from('jobs')
    .insert({
      company_id: quote.company_id,
      ...fields,
      created_by: profileId,
    })
    .select('id')
    .single();
  if (jobErr) throw jobErr;
  const jobId = jobData.id as string;

  const costRows = (quote.line_items ?? []).map((li: QuoteLineItem) => {
    const qty = Number(li.quantity) || 0;
    const unitCost = li.unit_cost != null ? Number(li.unit_cost) : 0;
    const unitPrice = Number(li.unit_price) || 0;
    const markup = li.markup_percent != null
      ? Number(li.markup_percent)
      : (unitCost > 0 ? Number((((unitPrice / unitCost) - 1) * 100).toFixed(1)) : 0);
    return {
      company_id: quote.company_id,
      job_id: jobId,
      cost_type: costTypeFromLine(li),
      description: li.description,
      quantity: qty,
      unit_cost: unitCost,
      total_cost: Number((qty * unitCost).toFixed(2)),
      markup_percent: markup,
      unit_price: unitPrice,
      total_price: Number((qty * unitPrice).toFixed(2)),
      charge_type: li.charge_type ?? null,
      stock_item_id: li.stock_item_id ?? null,
      purchase_order_id: null,
      cost_model_id: li.cost_model_id ?? null,
      created_by: profileId,
    };
  });
  if (costRows.length) {
    const { error: cErr } = await supabase.from('job_costs').insert(costRows);
    if (cErr) throw cErr;
  }

  const { data: linked, error: linkErr } = await supabase
    .from('quotes')
    .update({ job_id: jobId, updated_at: new Date().toISOString() })
    .eq('id', quote.id)
    .is('job_id', null)
    .select('id')
    .maybeSingle();
  if (linkErr) throw linkErr;

  // Lost the race — another convert already linked a job. Use that one.
  if (!linked) {
    const { data: raced } = await supabase
      .from('quotes')
      .select('job_id')
      .eq('id', quote.id)
      .maybeSingle();
    if (raced?.job_id && raced.job_id !== jobId) {
      await supabase.from('job_costs').delete().eq('job_id', jobId);
      await supabase.from('jobs').delete().eq('id', jobId);
      return raced.job_id as string;
    }
  }

  return jobId;
}
