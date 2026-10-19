import { describe, expect, it } from 'vitest';
import { issuedLinesLockCopy, persistDocumentMoney, persistIssuedLines } from './documentPersist';

const live = { subtotal: 311.52, tax_amount: 31.15, total: 342.67, tax_rate: 0 };
const stored = { subtotal: 311.51, tax_amount: 31.15, total: 342.66, tax_rate: 10 };

describe('persistDocumentMoney locks issued totals', () => {
  it('keeps stored totals on sent, paid, part_paid, accepted and overdue', () => {
    for (const status of ['sent', 'paid', 'part_paid', 'accepted', 'overdue']) {
      expect(persistDocumentMoney(status, live, stored)).toEqual({
        subtotal: 311.51,
        tax_amount: 31.15,
        total: 342.66,
        tax_rate: 10,
      });
    }
  });

  it('rewrites live totals on draft only', () => {
    expect(persistDocumentMoney('draft', live, stored)).toEqual(live);
    expect(persistDocumentMoney(null, live, stored)).toEqual(live);
  });

  it('shows stored $342.66 when live lines sum to $342.67 on a sent invoice', () => {
    const shown = persistDocumentMoney('sent', live, stored);
    expect(shown.total).toBe(342.66);
    expect(shown.total).not.toBe(342.67);
    expect(shown.tax_rate).toBe(10);
    expect(shown.tax_rate).not.toBe(0);
    expect(persistIssuedLines('sent', [{ unit_price: 200 }], [{ unit_price: 100 }])).toEqual([{ unit_price: 100 }]);
    expect(persistIssuedLines('draft', [{ unit_price: 200 }], [{ unit_price: 100 }])).toEqual([{ unit_price: 200 }]);
  });

  it('keeps stored tax_rate 10 when the live GST field is 0 on a sent invoice', () => {
    expect(persistDocumentMoney('sent', { ...live, tax_rate: 0 }, stored).tax_rate).toBe(10);
    expect(persistDocumentMoney('draft', { ...live, tax_rate: 0 }, stored).tax_rate).toBe(0);
  });
});

describe('issuedLinesLockCopy does not promise void or re-issue', () => {
  it('names a sent invoice and a sent or accepted quote', () => {
    expect(issuedLinesLockCopy('invoice', 'sent')).toBe(
      'This invoice has been sent, so its lines and totals are locked. To change it, create a new invoice.',
    );
    expect(issuedLinesLockCopy('invoice', 'paid')).toBe(
      'This invoice has been sent, so its lines and totals are locked. To change it, create a new invoice.',
    );
    expect(issuedLinesLockCopy('quote', 'sent')).toBe(
      'This quote has been sent, so its lines and totals are locked. To change it, create a new quote.',
    );
    expect(issuedLinesLockCopy('quote', 'accepted')).toBe(
      'This quote has been accepted, so its lines and totals are locked. To change it, create a new quote.',
    );
    expect(issuedLinesLockCopy('invoice', 'sent')).not.toMatch(/void|re-issue|credit note/i);
    expect(issuedLinesLockCopy('quote', 'accepted')).not.toMatch(/void|re-issue|credit note/i);
  });
});
