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

export type InvoicePaymentRow = {
  id: string;
  amount: number;
  paid_at: string;
  method: InvoicePaymentMethod;
  reference: string | null;
};

type AuditInvoicePayState = {
  amount_paid: number;
  status: InvoiceStatus;
  payments: InvoicePaymentRow[];
};

const auditPayState = new Map<string, AuditInvoicePayState>();

export function resetAuditInvoicePayments(): void {
  auditPayState.clear();
}

/** LOOK harness: one recorded payment on the audit invoice. */
export function seedAuditInvoicePaymentsList(invoiceId: string, _total: number): void {
  if (!isDevFieldAuditAuth()) return;
  auditPayState.set(invoiceId, {
    amount_paid: 200,
    status: 'part_paid',
    payments: [{
      id: 'audit-pay-1',
      amount: 200,
      paid_at: '2026-10-07',
      method: 'bank',
      reference: 'EFT-42',
    }],
  });
}

export function mergeAuditInvoicePaymentRow<T extends { id: string; total?: number | string | null; status: string; amount_paid?: number | null; due_date?: string | null }>(
  row: T,
): T {
  const hit = auditPayState.get(row.id);
  if (!hit) {
    return { ...row, amount_paid: Number(row.amount_paid ?? 0) || 0 };
  }
  return { ...row, amount_paid: hit.amount_paid, status: hit.status };
}

export function getAuditInvoicePayments(invoiceId: string): InvoicePaymentRow[] {
  return auditPayState.get(invoiceId)?.payments ?? [];
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
  const cappedPay = pay;
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

export function recordPaymentOverpayMessage(
  amount: number | string | null | undefined,
  total: number | string | null | undefined,
  amountPaidBefore: number | string | null | undefined,
): string | null {
  const balance = invoiceBalanceRemaining(total, amountPaidBefore);
  const pay = roundInvoiceMoney(Number(amount) || 0);
  if (pay > balance && balance > 0) {
    return `That's more than the ${formatMoney(balance)} balance owing`;
  }
  if (pay > balance && balance === 0) {
    return 'This invoice has no balance left to pay';
  }
  return null;
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

export async function fetchInvoicePayments(invoiceId: string, companyId: string): Promise<InvoicePaymentRow[]> {
  if (isDevFieldAuditAuth()) return getAuditInvoicePayments(invoiceId);
  const { data, error } = await supabase
    .from('invoice_payments')
    .select('id, amount, paid_at, method, reference')
    .eq('invoice_id', invoiceId)
    .eq('company_id', companyId)
    .order('paid_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(row => ({
    id: row.id as string,
    amount: Number(row.amount) || 0,
    paid_at: String(row.paid_at).slice(0, 10),
    method: row.method as InvoicePaymentMethod,
    reference: (row.reference as string | null) ?? null,
  }));
}

export async function persistInvoicePayment(args: {
  companyId: string;
  invoiceId: string;
  invoiceTotal: number;
  amountPaidBefore: number;
  payment: InvoiceRecordPaymentInput;
}): Promise<{ ok: true; preview: InvoicePaymentPreview } | { ok: false; message: string }> {
  const overpay = recordPaymentOverpayMessage(args.payment.amount, args.invoiceTotal, args.amountPaidBefore);
  if (overpay) return { ok: false, message: overpay };
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
    const prev = auditPayState.get(args.invoiceId);
    const payments = [...(prev?.payments ?? [])];
    payments.unshift({
      id: `audit-pay-${payments.length + 1}`,
      amount: preview.paymentReceived,
      paid_at: paidAt,
      method: args.payment.method,
      reference: args.payment.reference?.trim() || null,
    });
    auditPayState.set(args.invoiceId, {
      amount_paid: preview.amountPaidAfter,
      status: preview.statusAfter,
      payments,
    });
    return { ok: true, preview };
  }

  const { error } = await supabase.rpc('record_invoice_payment', {
    p_invoice_id: args.invoiceId,
    p_amount: preview.paymentReceived,
    p_paid_at: paidAt,
    p_method: args.payment.method,
    p_reference: args.payment.reference?.trim() || null,
  });
  if (error) return { ok: false, message: error.message };

  return { ok: true, preview };
}

export async function removeInvoicePayment(args: {
  companyId: string;
  invoiceId: string;
  paymentId: string;
  invoiceTotal: number;
}): Promise<{ ok: true; amount_paid: number; status: InvoiceStatus } | { ok: false; message: string }> {
  if (isDevFieldAuditAuth()) {
    const prev = auditPayState.get(args.invoiceId);
    if (!prev) return { ok: false, message: 'No payments on this invoice' };
    const payments = prev.payments.filter(p => p.id !== args.paymentId);
    const amount_paid = roundInvoiceMoney(payments.reduce((s, p) => s + p.amount, 0));
    const total = honestInvoiceTotal(args.invoiceTotal);
    let status: InvoiceStatus = 'sent';
    if (total > 0 && amount_paid >= total) status = 'paid';
    else if (amount_paid > 0) status = 'part_paid';
    auditPayState.set(args.invoiceId, { amount_paid, status, payments });
    return { ok: true, amount_paid, status };
  }
  const { data, error } = await supabase.rpc('remove_invoice_payment', { p_payment_id: args.paymentId });
  if (error) return { ok: false, message: error.message };
  const row = data as { amount_paid?: number; status?: string };
  return {
    ok: true,
    amount_paid: Number(row.amount_paid) || 0,
    status: (row.status as InvoiceStatus) || 'sent',
  };
}
