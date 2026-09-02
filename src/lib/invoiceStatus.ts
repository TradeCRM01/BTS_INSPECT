import type { InvoiceStatus } from '../types/fsm';

export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Schema is draft / sent / paid / overdue (no partial). Sent past due_date displays as overdue. */
export function effectiveInvoiceStatus(
  inv: { status: InvoiceStatus | string; due_date?: string | null },
  now = new Date(),
): InvoiceStatus {
  const status = inv.status as InvoiceStatus;
  if (status === 'paid' || status === 'draft') return status;
  if (status === 'overdue') return 'overdue';
  const due = (inv.due_date ?? '').slice(0, 10);
  if (status === 'sent' && due && due < todayIsoDate(now)) return 'overdue';
  return status === 'sent' ? 'sent' : status;
}

/**
 * UI form save: overdue is not a chosen status.
 * The Perth hop stamps sent + past-due onto invoices.status separately.
 */
export function persistableInvoiceStatus(status: InvoiceStatus): InvoiceStatus {
  return status === 'overdue' ? 'sent' : status;
}

/** Existing /invoices tabs — default is the money that needs chasing. */
export type InvoiceListStatusFilter = 'all' | InvoiceStatus;

export const INVOICE_LIST_DEFAULT_FILTER: InvoiceListStatusFilter = 'overdue';

export function invoiceMatchesListFilter(
  inv: { status: InvoiceStatus | string; due_date?: string | null },
  filter: InvoiceListStatusFilter,
  now = new Date(),
): boolean {
  if (filter === 'all') return true;
  return effectiveInvoiceStatus(inv, now) === filter;
}

export function invoiceListIsNoneYet(args: { search: string; invoiceCount: number }): boolean {
  return !args.search.trim() && args.invoiceCount === 0;
}

export function invoiceListEmptyTitle(args: { noneYet: boolean }): string {
  return args.noneYet ? 'No invoices yet' : 'No matching invoices';
}

export function invoiceListEmptyMessage(args: { noneYet: boolean }): string {
  return args.noneYet
    ? 'Invoice from an accepted quote, or open a job and invoice the bill.'
    : 'Try another status or search.';
}
