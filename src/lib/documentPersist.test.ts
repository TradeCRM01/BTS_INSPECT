import { describe, expect, it } from 'vitest';
import { persistDocumentMoney } from './documentPersist';

const live = { subtotal: 311.52, tax_amount: 31.15, total: 342.67 };
const stored = { subtotal: 311.51, tax_amount: 31.15, total: 342.66 };

describe('persistDocumentMoney locks issued totals', () => {
  it('keeps stored totals on sent, paid, part_paid, accepted and overdue', () => {
    for (const status of ['sent', 'paid', 'part_paid', 'accepted', 'overdue']) {
      expect(persistDocumentMoney(status, live, stored)).toEqual({
        subtotal: 311.51,
        tax_amount: 31.15,
        total: 342.66,
      });
    }
  });

  it('rewrites live totals on draft only', () => {
    expect(persistDocumentMoney('draft', live, stored)).toEqual(live);
    expect(persistDocumentMoney(null, live, stored)).toEqual(live);
  });
});
