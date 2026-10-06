import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  applyInvoicePayment,
  defaultRecordPaymentDraft,
  INVOICE_PAYMENT_METHODS,
  previewInvoicePayment,
} from './invoicePayments';
import { INVOICE_STATUS_LABELS } from '../types/fsm';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

describe('MONEY-4 invoice part payments', () => {
  it('M1 — record sheet defaults to remaining balance, today AU, and bank method', () => {
    const draft = defaultRecordPaymentDraft(836, 200, new Date(2026, 9, 6));
    expect(draft.amount).toBe('636');
    expect(draft.paid_at).toBe('2026-10-06');
    expect(draft.method).toBe('bank');
    expect(INVOICE_PAYMENT_METHODS).toEqual(['cash', 'card', 'bank', 'other']);
    const page = src('src/pages/InvoicesPage.tsx');
    expect(page).toContain('InvoiceRecordPaymentSheet');
    expect(page).toContain('Payment reference');
    expect(page).toContain('INVOICE_PAYMENT_METHOD_LABELS');
  });

  it('M2 — full payment marks paid; partial marks part paid', () => {
    expect(applyInvoicePayment(0, 836, 836).statusAfter).toBe('paid');
    expect(applyInvoicePayment(0, 836, 400).statusAfter).toBe('part_paid');
    expect(previewInvoicePayment(836, 400, 436).statusAfter).toBe('paid');
  });

  it('M3 — list and detail show Part paid with paid/balance copy', () => {
    expect(INVOICE_STATUS_LABELS.part_paid).toBe('Part paid');
    const page = src('src/pages/InvoicesPage.tsx');
    expect(page).toContain('invoicePaidBalanceLabel');
    expect(page).toContain('hub-invoices-paid-meta');
    expect(page).toContain('`hub-invoices-pill is-${status}`');
  });

  it('M4 — customer PDF and portal surface payments to date', () => {
    const pdf = src('src/reports/commercial/CommercialDocumentPdf.tsx');
    expect(pdf).toContain('Payments to date');
    expect(pdf).toContain('Balance due');
    const send = src('src/lib/sendInvoice.ts');
    expect(send).toContain('paymentsToDate');
    const portal = src('src/pages/ClientPortalPublicPage.tsx');
    expect(portal).toContain('Paid {formatMoney(Number(inv.amount_paid))}');
    const edge = src('supabase/functions/client-portal/index.ts');
    expect(edge).toContain('amount_paid');
  });

  it('keeps migration 086 and does not add send/email/SMS paths', () => {
    const mig = src('supabase/migrations/20261006170000_086_invoice_part_payments.sql');
    expect(mig).toContain('part_paid');
    expect(mig).toContain("'void'");
    expect(mig).toContain('invoice_payments_legacy_pre_money4');
    const page = src('src/pages/InvoicesPage.tsx');
    expect(page).not.toContain('Partial payments are not available');
    expect(page).not.toMatch(/deposit-as-quote|invite client/i);
  });
});
