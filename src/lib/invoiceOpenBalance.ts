import type { InvoiceStatus } from '../types/fsm';
import { INVOICE_STATUS_LABELS } from '../types/fsm';
import { invoiceBalanceRemaining } from './invoicePayments';

function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function displayStatusKey(inv: InvoiceBalanceRow, now: Date): InvoiceStatus | string {
  const status = inv.status;
  if (status === 'paid' || status === 'draft' || status === 'part_paid' || status === 'void') return status;
  if (status === 'overdue') return 'overdue';
  const due = (inv.due_date ?? '').slice(0, 10);
  if (status === 'sent' && due && due < todayIsoDate(now)) return 'overdue';
  return status;
}

export type InvoiceBalanceRow = {
  status: string;
  total?: number | string | null;
  amount_paid?: number | string | null;
  due_date?: string | null;
};

/** Invoice still owes money (any open status, balance > 0). */
export function invoiceBalanceOwed(inv: InvoiceBalanceRow): number {
  const status = inv.status;
  if (status === 'paid' || status === 'draft' || status === 'void') return 0;
  return invoiceBalanceRemaining(inv.total, inv.amount_paid);
}

export function invoiceStatusIsOpenForOwing(status: string): boolean {
  return status === 'sent' || status === 'overdue' || status === 'part_paid';
}

export function invoiceIsPastDue(inv: InvoiceBalanceRow, now = new Date()): boolean {
  const due = (inv.due_date ?? '').slice(0, 10);
  if (!due) return false;
  return due < todayIsoDate(now);
}

/** Past-due with balance — includes part_paid (stored status stays part_paid). */
export function invoiceCountsAsOverdueMoney(inv: InvoiceBalanceRow, now = new Date()): boolean {
  if (invoiceBalanceOwed(inv) <= 0) return false;
  if (inv.status === 'overdue') return true;
  if (inv.status === 'part_paid' && invoiceIsPastDue(inv, now)) return true;
  if (inv.status === 'sent' && invoiceIsPastDue(inv, now)) return true;
  return false;
}

export function invoiceCountsAsOutstandingMoney(inv: InvoiceBalanceRow, now = new Date()): boolean {
  if (invoiceBalanceOwed(inv) <= 0) return false;
  if (invoiceStatusIsOpenForOwing(inv.status)) return true;
  if (inv.status === 'sent' && invoiceIsPastDue(inv, now)) return true;
  return false;
}

export function invoiceListStatusLabel(inv: InvoiceBalanceRow, now = new Date()): string {
  if (inv.status === 'part_paid' && invoiceCountsAsOverdueMoney(inv, now)) {
    return 'Part paid · Overdue';
  }
  const key = displayStatusKey(inv, now);
  return INVOICE_STATUS_LABELS[key as InvoiceStatus] ?? String(inv.status);
}

export function invoiceMatchesOverdueFilter(inv: InvoiceBalanceRow, now = new Date()): boolean {
  return invoiceCountsAsOverdueMoney(inv, now);
}
