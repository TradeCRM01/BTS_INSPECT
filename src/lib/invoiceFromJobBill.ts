import type { InvoiceLineItem } from '../types/fsm';
import { calcLineDocumentTotals } from './gst';
import { INVOICE_SOURCE_JOB_BILL, invoiceHref, pickReusableInvoice } from './invoiceFromQuote';
import { VAN_TIME_ZONE, todayYmd } from './jobReminder';

export const JOB_BILL_INVOICE_NO_CLIENT = 'Assign a client before invoicing this job';
export const JOB_BILL_INVOICE_NO_LINES = 'Add bill lines before invoicing this job';
export const JOB_BILL_INVOICE_EMPTY = 'Job bill is empty — add lines before invoicing';
export const JOB_BILL_INVOICE_PREVIEW_LOADING_DETAIL = '';
export const JOB_BILL_INVOICE_PREVIEW_ERROR_DETAIL =
  'Could not load the invoice preview. Tap Invoice to continue.';
export const JOB_BILL_INVOICE_CREATED = 'Draft invoice created from this job bill';
export const JOB_BILL_INVOICE_READY_TOAST = 'Invoice ready — see Invoices on this job';
export const JOB_BILL_INVOICE_EXISTS = 'Invoice already exists for this job';
export const JOB_BILL_INVOICE_NOTES = 'From job bill';
/** Job-bill due is issue date + 7 days so unpaid hit the existing Overdue tab. */
export const JOB_BILL_DUE_DAYS = 7;
/** Existing invoice-face copy — PDF/sheet prints this next to due_date. */
export const JOB_BILL_PAYMENT_TERMS = '7 days';

export type JobBillInvoicePreviewState = 'loading' | 'error' | 'ready';

/** Empty-bill block only after the invoice plan has resolved. Loading/error must not block. */
export function jobBillInvoiceBlocked(
  costTotals: { lines: number } | null | undefined,
  invoicePreview?: { lineCount: number } | null,
  previewState: JobBillInvoicePreviewState = 'ready',
): boolean {
  if (previewState === 'loading' || previewState === 'error') return false;
  if (invoicePreview != null) return invoicePreview.lineCount === 0;
  return costTotals != null && costTotals.lines === 0;
}

export const JOB_COST_INVOICE_SELECT =
  'description, quantity, unit_price, unit_cost, markup_percent, charge_type, stock_item_id, cost_model_id, created_at, cost_type, timesheet_entry_id';

export type JobBillCostLine = {
  description?: string | null;
  quantity?: number | string | null;
  unit_price?: number | string | null;
  unit_cost?: number | string | null;
  markup_percent?: number | string | null;
  charge_type?: string | null;
  stock_item_id?: string | null;
  cost_model_id?: string | null;
  cost_type?: string | null;
  timesheet_entry_id?: string | null;
};

export type JobBillInvoiceDecision =
  | { action: 'miss'; reason: 'no_client'; message: typeof JOB_BILL_INVOICE_NO_CLIENT }
  | { action: 'miss'; reason: 'no_lines'; message: typeof JOB_BILL_INVOICE_NO_LINES }
  | { action: 'reuse'; invoiceId: string; existing: true }
  | { action: 'insert' };

/** Copy chargeable job-bill lines. Drops empty descriptions and zero qty. Does not invent amounts. */
export function invoiceLinesFromJobCosts(
  costs: JobBillCostLine[] | null | undefined,
): InvoiceLineItem[] {
  return (costs ?? [])
    .map((c): InvoiceLineItem => {
      const description = (c.description ?? '').trim() || (c.charge_type ?? '').trim();
      const quantity = Number(c.quantity) || 0;
      const unitCost = Number(c.unit_cost) || 0;
      const unitPrice = c.unit_price != null && c.unit_price !== ''
        ? Number(c.unit_price)
        : unitCost;
      return {
        description,
        quantity,
        unit_price: unitPrice,
        unit_cost: unitCost,
        markup_percent: Number(c.markup_percent) || 0,
        charge_type: c.charge_type ?? null,
        stock_item_id: c.stock_item_id ?? null,
        price_book_item_id: null,
        cost_model_id: c.cost_model_id ?? null,
      };
    })
    .filter(li => li.description && li.quantity > 0);
}

/** Company/van issue day (Australia/Brisbane) + 7 — not leftover Perth, not null. */
export function jobBillDueDate(now = new Date()): string {
  const issue = todayYmd(now, VAN_TIME_ZONE);
  const [y, m, d] = issue.split('-').map(Number);
  const due = new Date(Date.UTC(y, m - 1, d + JOB_BILL_DUE_DAYS));
  return `${due.getUTCFullYear()}-${String(due.getUTCMonth() + 1).padStart(2, '0')}-${String(due.getUTCDate()).padStart(2, '0')}`;
}

export function buildInvoiceFromJobBill(input: {
  clientId: string;
  jobId: string;
  taxRate: number;
  lines: InvoiceLineItem[];
  quoteId?: string | null;
  now?: Date;
}) {
  const { subtotal, taxAmount, total } = calcLineDocumentTotals(input.lines, input.taxRate);
  return {
    client_id: input.clientId,
    job_id: input.jobId,
    quote_id: input.quoteId ?? null,
    source: INVOICE_SOURCE_JOB_BILL,
    status: 'draft' as const,
    line_items: input.lines,
    subtotal,
    tax_rate: Number(input.taxRate) || 0,
    tax_amount: taxAmount,
    total,
    payment_terms: JOB_BILL_PAYMENT_TERMS,
    due_date: jobBillDueDate(input.now),
    notes: JOB_BILL_INVOICE_NOTES,
    inclusions: [] as string[],
    exclusions: [] as string[],
  };
}

/**
 * Honest miss before any write. Reuse any invoice already on this job
 * (invoiceCount > 0 means Next is not Invoice). Prefer a draft if several exist.
 */
export function decideJobBillInvoice(input: {
  clientId: string | null | undefined;
  lines: InvoiceLineItem[];
  existing: { id: string; status: string }[];
}): JobBillInvoiceDecision {
  if (!input.clientId) {
    return { action: 'miss', reason: 'no_client', message: JOB_BILL_INVOICE_NO_CLIENT };
  }
  if (input.lines.length === 0) {
    return { action: 'miss', reason: 'no_lines', message: JOB_BILL_INVOICE_NO_LINES };
  }
  const reuse = pickReusableInvoice(input.existing);
  if (reuse) {
    return { action: 'reuse', invoiceId: reuse.id, existing: true };
  }
  return { action: 'insert' };
}

/** Unique job_bill-per-job (or quote) race — return the winner instead of inserting again. */
export function reuseAfterUniqueConflict<T extends { id: string; status: string }>(
  errorCode: string | undefined,
  rows: T[],
): T | null {
  if (errorCode !== '23505') return null;
  return pickReusableInvoice(rows);
}

/** After Invoice this job succeeds, open the invoice. Never send=1. */
export function jobInvoiceCreateLanding(invoiceId: string): string {
  return invoiceHref(invoiceId);
}

/** Share on the invoice editor stays quiet for one double-tap after create lands. */
export const INVOICE_EDITOR_SHARE_ARM_MS = 400;

export function invoiceEditorShareArmed(openedAtMs: number, nowMs: number): boolean {
  if (openedAtMs <= 0) return true;
  return nowMs - openedAtMs >= INVOICE_EDITOR_SHARE_ARM_MS;
}

export function invoiceLandingOpensSend(
  sendParam: string | null,
  openedAtMs: number,
  nowMs: number,
): boolean {
  return sendParam === '1' && invoiceEditorShareArmed(openedAtMs, nowMs);
}
