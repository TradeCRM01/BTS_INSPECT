import { supabase } from './supabase';
import {
  JOB_INVOICE_LIST_COLUMNS,
  asJobInvoiceListRow,
  buildInvoiceFromQuote,
  invoicesForOneJob,
  isoDatePlusDays,
  pickReusableInvoice,
  type JobInvoiceListRow,
  type QuoteForInvoice,
} from './invoiceFromQuote';

export { invoiceHref, invoiceLandingPath } from './invoiceFromQuote';

const QUOTE_SELECT =
  'id, company_id, quote_number, client_id, job_id, status, line_items, notes, inclusions, exclusions';

export type ConvertQuoteToInvoiceResult = {
  id: string;
  existing: boolean;
  jobId: string | null;
  invoice: JobInvoiceListRow | null;
};

async function invoicesOnQuoteOrJob(quoteId: string, jobId: string | null) {
  const { data: quoteRows, error: quoteErr } = await supabase
    .from('invoices')
    .select(JOB_INVOICE_LIST_COLUMNS)
    .eq('quote_id', quoteId)
    .order('created_at', { ascending: false });
  if (quoteErr) throw quoteErr;

  if (!jobId) return quoteRows ?? [];

  const { data: jobRows, error: jobErr } = await supabase
    .from('invoices')
    .select(JOB_INVOICE_LIST_COLUMNS)
    .eq('job_id', jobId)
    .order('created_at', { ascending: false });
  if (jobErr) throw jobErr;
  return invoicesForOneJob(quoteRows, jobRows);
}

/** Creates a draft invoice from an accepted quote, or reuses the job's existing invoice (any source). */
export async function convertQuoteToInvoice(
  quoteId: string,
  profileId: string,
  taxRate: number,
): Promise<ConvertQuoteToInvoiceResult> {
  const { data: quote, error: quoteErr } = await supabase
    .from('quotes')
    .select(QUOTE_SELECT)
    .eq('id', quoteId)
    .maybeSingle();
  if (quoteErr) throw quoteErr;
  if (!quote) throw new Error('Quote not found');

  const existingRows = await invoicesOnQuoteOrJob(quoteId, (quote.job_id as string | null) ?? null);
  const reuse = pickReusableInvoice(existingRows);
  if (reuse) {
    return {
      id: reuse.id,
      existing: true,
      jobId: (quote.job_id as string | null) ?? null,
      invoice: asJobInvoiceListRow(reuse),
    };
  }

  if (quote.status !== 'accepted') throw new Error('Only accepted quotes can be invoiced');
  if (!quote.client_id) throw new Error('Quote has no client');

  const payload = buildInvoiceFromQuote(quote as QuoteForInvoice, taxRate, isoDatePlusDays(30));
  if (payload.line_items.length === 0) throw new Error('Quote has no line items to invoice');

  const { data, error } = await supabase
    .from('invoices')
    .insert({
      ...payload,
      company_id: quote.company_id,
      created_by: profileId,
    })
    .select(JOB_INVOICE_LIST_COLUMNS)
    .single();

  if (error) {
    // Unique quote_id or job_bill-per-job — another convert / Invoice won the race.
    if (error.code === '23505') {
      const raced = pickReusableInvoice(
        await invoicesOnQuoteOrJob(quoteId, (quote.job_id as string | null) ?? null),
      );
      if (raced?.id) {
        return {
          id: raced.id as string,
          existing: true,
          jobId: (quote.job_id as string | null) ?? null,
          invoice: asJobInvoiceListRow(raced),
        };
      }
    }
    throw error;
  }

  const invoice = asJobInvoiceListRow(data);
  if (!invoice) throw new Error('Invoice was not saved.');
  return {
    id: invoice.id,
    existing: false,
    jobId: (quote.job_id as string | null) ?? null,
    invoice,
  };
}
