import { describe, expect, it } from 'vitest';
import {
  invoiceBalanceOwed,
  invoiceCountsAsOutstandingMoney,
  invoiceCountsAsOverdueMoney,
  invoiceListStatusLabel,
  invoiceStatusIsOpenForOwing,
} from './invoiceOpenBalance';

describe('invoiceOpenBalance', () => {
  const now = new Date(2026, 9, 7);

  it('treats part_paid as open and uses balance not total', () => {
    const inv = { status: 'part_paid', total: 836, amount_paid: 400, due_date: '2099-01-01' };
    expect(invoiceStatusIsOpenForOwing('part_paid')).toBe(true);
    expect(invoiceBalanceOwed(inv)).toBe(436);
    expect(invoiceCountsAsOutstandingMoney(inv, now)).toBe(true);
  });

  it('part_paid past due counts as overdue money and list label', () => {
    const inv = { status: 'part_paid', total: 836, amount_paid: 200, due_date: '2026-09-01' };
    expect(invoiceCountsAsOverdueMoney(inv, now)).toBe(true);
    expect(invoiceListStatusLabel(inv, now)).toBe('Part paid · Overdue');
  });

  it('paid and draft owe zero', () => {
    expect(invoiceBalanceOwed({ status: 'paid', total: 100, amount_paid: 100 })).toBe(0);
    expect(invoiceBalanceOwed({ status: 'draft', total: 100 })).toBe(0);
  });
});
