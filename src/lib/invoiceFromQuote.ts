import type { InvoiceLineItem, QuoteLineItem } from '../types/fsm';
import { asStringList } from './asStringList';
import { calcDocumentTotals } from './gst';
import { padQuoteNumber } from './quoteJobFields';

export const INVOICE_SOURCE_QUOTE = 'quote';
export const INVOICE_SOURCE_JOB_BILL = 'job_bill';

export type InvoiceSource = typeof INVOICE_SOURCE_QUOTE | typeof INVOICE_SOURCE_JOB_BILL;

export type QuoteForInvoice = {
  id: string;
  quote_number: number | null;
  client_id: string | null;
  job_id: string | null;
  line_items: QuoteLineItem[] | null;
  notes: string | null;
  inclusions?: unknown;
  exclusions?: unknown;
};

export function invoiceLinesFromQuote(lineItems: QuoteLineItem[] | null | undefined): InvoiceLineItem[] {
  return (lineItems ?? [])
    .map((li): InvoiceLineItem => ({
      description: (li.description ?? '').trim(),
      quantity: Number(li.quantity) || 0,
      unit_price: Number(li.unit_price) || 0,
      stock_item_id: li.stock_item_id ?? null,
      price_book_item_id: li.price_book_item_id ?? null,
      charge_type: li.charge_type ?? null,
      unit_cost: li.unit_cost != null ? Number(li.unit_cost) : null,
      markup_percent: li.markup_percent != null ? Number(li.markup_percent) : null,
      cost_model_id: li.cost_model_id ?? null,
    }))
    .filter(li => li.description && li.quantity > 0);
}

export function buildInvoiceFromQuote(quote: QuoteForInvoice, taxRate: number, dueDate: string) {
  const line_items = invoiceLinesFromQuote(quote.line_items);
  const rawSubtotal = line_items.reduce((s, li) => s + li.quantity * li.unit_price, 0);
  const { subtotal, taxAmount, total } = calcDocumentTotals(rawSubtotal, taxRate);
  return {
    client_id: quote.client_id,
    job_id: quote.job_id,
    quote_id: quote.id,
    status: 'draft' as const,
    line_items,
    subtotal,
    tax_rate: Number(taxRate) || 0,
    tax_amount: taxAmount,
    total,
    payment_terms: 'Net 30',
    due_date: dueDate,
    notes: `From quote #${padQuoteNumber(quote.quote_number)}`,
    inclusions: asStringList(quote.inclusions),
    exclusions: asStringList(quote.exclusions),
    source: INVOICE_SOURCE_QUOTE,
  };
}

export function isoDatePlusDays(days: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export type ExistingInvoiceRow = {
  id: string;
  status: string;
  quote_id?: string | null;
  source?: string | null;
  notes?: string | null;
};

export function isJobBillInvoice(
  inv: { source?: string | null; notes?: string | null; quote_id?: string | null },
  linkedQuoteId?: string | null,
): boolean {
  if (linkedQuoteId && inv.quote_id === linkedQuoteId) return true;
  if (inv.source === INVOICE_SOURCE_JOB_BILL) return true;
  const notes = (inv.notes ?? '').trim();
  return /^From job bill/i.test(notes);
}

export function pickReusableInvoice<T extends { status: string }>(rows: T[]): T | null {
  if (rows.length === 0) return null;
  return rows.find(i => i.status === 'draft') ?? rows[0];
}

export function invoiceHref(invoiceId: string): string {
  return `/invoices?id=${invoiceId}`;
}

/** Job hub when the quote is already linked; otherwise open the invoice editor. */
export function invoiceLandingPath(jobId: string | null | undefined, invoiceId: string): string {
  return jobId ? `/jobs/${jobId}` : invoiceHref(invoiceId);
}
