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

/** Overdue is computed from due date — never persist it as a chosen status. */
export function persistableInvoiceStatus(status: InvoiceStatus): InvoiceStatus {
  return status === 'overdue' ? 'sent' : status;
}
