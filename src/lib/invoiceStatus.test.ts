import { describe, expect, it } from 'vitest';
import { effectiveInvoiceStatus, persistableInvoiceStatus, todayIsoDate } from './invoiceStatus';

describe('effectiveInvoiceStatus', () => {
  const now = new Date(2026, 7, 20); // 20 Aug 2026 local

  it('keeps paid and draft even when the due date has passed', () => {
    expect(effectiveInvoiceStatus({ status: 'paid', due_date: '2020-01-01' }, now)).toBe('paid');
    expect(effectiveInvoiceStatus({ status: 'draft', due_date: '2020-01-01' }, now)).toBe('draft');
  });

  it('treats sent past due as overdue', () => {
    expect(effectiveInvoiceStatus({ status: 'sent', due_date: '2026-08-19' }, now)).toBe('overdue');
  });

  it('keeps sent when due today or in the future', () => {
    expect(effectiveInvoiceStatus({ status: 'sent', due_date: '2026-08-20' }, now)).toBe('sent');
    expect(effectiveInvoiceStatus({ status: 'sent', due_date: '2026-08-21' }, now)).toBe('sent');
  });

  it('keeps sent when there is no due date', () => {
    expect(effectiveInvoiceStatus({ status: 'sent', due_date: null }, now)).toBe('sent');
  });

  it('keeps an explicit overdue status', () => {
    expect(effectiveInvoiceStatus({ status: 'overdue', due_date: '2026-12-01' }, now)).toBe('overdue');
  });
});

describe('persistableInvoiceStatus', () => {
  it('stores sent instead of overdue so due date can compute it', () => {
    expect(persistableInvoiceStatus('overdue')).toBe('sent');
    expect(persistableInvoiceStatus('sent')).toBe('sent');
    expect(persistableInvoiceStatus('paid')).toBe('paid');
    expect(persistableInvoiceStatus('draft')).toBe('draft');
  });
});

describe('todayIsoDate', () => {
  it('formats local YYYY-MM-DD', () => {
    expect(todayIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
