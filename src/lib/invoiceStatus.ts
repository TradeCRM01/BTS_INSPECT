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

/** List tabs, dashboard KPIs and money widgets must share this rule. */
export function overdueInvoiceRows<T extends { status: InvoiceStatus | string; due_date?: string | null }>(
  invoices: T[],
  now = new Date(),
): T[] {
  return invoices.filter(inv => effectiveInvoiceStatus(inv, now) === 'overdue');
}

export function overdueInvoiceCount(
  invoices: { status: InvoiceStatus | string; due_date?: string | null }[],
  now = new Date(),
): number {
  return overdueInvoiceRows(invoices, now).length;
}

export function overdueInvoiceTotal(
  invoices: { status: InvoiceStatus | string; due_date?: string | null; total?: number | string | null }[],
  now = new Date(),
): number {
  return overdueInvoiceRows(invoices, now).reduce((sum, inv) => sum + Number(inv.total ?? 0), 0);
}
