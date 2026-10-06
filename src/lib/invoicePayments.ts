import type { InvoiceStatus } from '../types/fsm';
import { formatMoney } from '../types/fsm';
import { todayIsoDate } from './invoiceStatus';
import { isDevFieldAuditAuth } from './devFieldAuditAuth';
import { supabase } from './supabase';

export type InvoicePaymentMethod = 'cash' | 'card' | 'bank' | 'other';

export const INVOICE_PAYMENT_METHOD_LABELS: Record<InvoicePaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  bank: 'Bank transfer',
  other: 'Other',
};

export const INVOICE_PAYMENT_METHODS: InvoicePaymentMethod[] = ['cash', 'card', 'bank', 'other'];

export type InvoiceRecordPaymentInput = {
  amount: number;
  paid_at: string;
  method: InvoicePaymentMethod;
  reference?: string | null;
};

export type InvoicePaymentPreview = {
  invoiceTotal: number;
  amountPaidBefore: number;
  paymentReceived: number;
  amountPaidAfter: number;
  balanceAfter: number;
  statusAfter: InvoiceStatus;
};

const auditPayState = new Map<string, { amount_paid: number; status: InvoiceStatus }>();

export function resetAuditInvoicePayments(): void {
  auditPayState.clear();
}

export function mergeAuditInvoicePaymentRow<
  T extends { id: string; total: number | string; status: string; amount_paid?: number | null; due_date?: string | null },
>(row: T): T {
  const hit = auditPayState.get(row.id);
  if (!hit) {
    return { ...row, amount_paid: Number(row.amount_paid ?? 0) || 0 };
  }
  return { ...row, amount_paid: hit.amount_paid, status: hit.status };
}

export function roundInvoiceMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function honestInvoiceTotal(total: number | string | null | undefined): number {
  const n = Number(total);
  return Number.isFinite(n) && n > 0 ? roundInvoiceMoney(n) : 0;
}

export function honestAmountPaid(amountPaid: number | string | null | undefined): number {
  const n = Number(amountPaid);
  return Number.isFinite(n) && n > 0 ? roundInvoiceMoney(n) : 0;
}

export function invoiceBalanceRemaining(
  total: number | string | null | undefined,
  amountPaid: number | string | null | undefined,
): number {
  const invoiceTotal = honestInvoiceTotal(total);
  const paid = honestAmountPaid(amountPaid);
  return roundInvoiceMoney(Math.max(0, invoiceTotal - paid));
}

export function defaultRecordPaymentDraft(
  total: number | string | null | undefined,
  amountPaid: number | string | null | undefined,
  now = new Date(),
): { amount: string; paid_at: string; method: InvoicePaymentMethod; reference: string } {
  const balance = invoiceBalanceRemaining(total, amountPaid);
  return {
    amount: balance > 0 ? String(balance) : '',
    paid_at: todayIsoDate(now),
    method: 'bank',
    reference: '',
  };
}

export function applyInvoicePayment(
  amountPaidBefore: number | string | null | undefined,
  invoiceTotal: number | string | null | undefined,
  paymentAmount: number | string | null | undefined,
): InvoicePaymentPreview {
  const total = honestInvoiceTotal(invoiceTotal);
  const before = honestAmountPaid(amountPaidBefore);
  const pay = roundInvoiceMoney(Number(paymentAmount) || 0);
  const cappedPay = total > 0 ? Math.min(pay, invoiceBalanceRemaining(total, before)) : 0;
  const amountPaidAfter = roundInvoiceMoney(before + cappedPay);
  const balanceAfter = invoiceBalanceRemaining(total, amountPaidAfter);
  let statusAfter: InvoiceStatus = 'sent';
  if (total > 0 && amountPaidAfter >= total) statusAfter = 'paid';
  else if (amountPaidAfter > 0) statusAfter = 'part_paid';
  return {
    invoiceTotal: total,
    amountPaidBefore: before,
    paymentReceived: cappedPay,
    amountPaidAfter,
    balanceAfter,
    statusAfter,
  };
}

export function previewInvoicePayment(
  total: number | string | null | undefined,
  amountPaidBefore: number | string | null | undefined,
  paymentAmount?: number | string | null,
): InvoicePaymentPreview {
  const balance = invoiceBalanceRemaining(total, amountPaidBefore);
  const pay = paymentAmount == null ? balance : Number(paymentAmount) || 0;
  return applyInvoicePayment(amountPaidBefore, total, pay);
}

/** Full remaining balance when paymentAmount is omitted. */
export function fullInvoicePayment(
  total: number | string | null | undefined,
  amountPaidBefore?: number | string | null,
  paymentAmount?: number | string | null,
): InvoicePaymentPreview {
  return previewInvoicePayment(total, amountPaidBefore ?? 0, paymentAmount);
}

export function parseRecordPaymentAmount(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n <= 0) return null;
  return roundInvoiceMoney(n);
}

export function invoicePaidBalanceLabel(
  total: number | string | null | undefined,
  amountPaid: number | string | null | undefined,
): string | null {
  const invoiceTotal = honestInvoiceTotal(total);
  const paid = honestAmountPaid(amountPaid);
  if (paid <= 0 || paid >= invoiceTotal) return null;
  return `Paid ${formatMoney(paid)} · Balance ${formatMoney(invoiceBalanceRemaining(total, paid))}`;
}

export async function persistInvoicePayment(args: {
  companyId: string;
  invoiceId: string;
  invoiceTotal: number;
  amountPaidBefore: number;
  payment: InvoiceRecordPaymentInput;
}): Promise<{ ok: true; preview: InvoicePaymentPreview } | { ok: false; message: string }> {
  const preview = applyInvoicePayment(args.amountPaidBefore, args.invoiceTotal, args.payment.amount);
  if (preview.paymentReceived <= 0) {
    return { ok: false, message: 'Enter a payment amount greater than zero.' };
  }
  const paidAt = args.payment.paid_at.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
    return { ok: false, message: 'Pick a valid payment date.' };
  }
  if (!INVOICE_PAYMENT_METHODS.includes(args.payment.method)) {
    return { ok: false, message: 'Pick a payment method.' };
  }

  if (isDevFieldAuditAuth()) {
    auditPayState.set(args.invoiceId, {
      amount_paid: preview.amountPaidAfter,
      status: preview.statusAfter,
    });
    return { ok: true, preview };
  }

  const reference = args.payment.reference?.trim() || null;
  const { error: payErr } = await supabase.from('invoice_payments').insert({
    company_id: args.companyId,
    invoice_id: args.invoiceId,
    amount: preview.paymentReceived,
    paid_at: paidAt,
    method: args.payment.method,
    reference,
  });
  if (payErr) return { ok: false, message: payErr.message };

  const { error: invErr } = await supabase
    .from('invoices')
    .update({
      amount_paid: preview.amountPaidAfter,
      status: preview.statusAfter,
      updated_at: new Date().toISOString(),
    })
    .eq('id', args.invoiceId)
    .eq('company_id', args.companyId);
  if (invErr) return { ok: false, message: invErr.message };

  return { ok: true, preview };
}
