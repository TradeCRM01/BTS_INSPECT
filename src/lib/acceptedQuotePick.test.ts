import { describe, expect, it } from 'vitest';
import { isJobBillQuoted, pickMostRecentlyAcceptedQuote } from './acceptedQuotePick';

describe('pickMostRecentlyAcceptedQuote', () => {
  it('picks the newest accepted quote by created_at then id', () => {
    const older = {
      id: 'q-old',
      created_at: '2026-01-01T00:00:00.000Z',
      line_items: [{ description: 'Old', quantity: 1, unit_price: 10 }],
    };
    const newer = {
      id: 'q-new',
      created_at: '2026-06-01T00:00:00.000Z',
      line_items: [{ description: 'New', quantity: 1, unit_price: 20 }],
    };
    expect(pickMostRecentlyAcceptedQuote([older, newer])?.id).toBe('q-new');
    expect(pickMostRecentlyAcceptedQuote([newer, older])?.id).toBe('q-new');
  });
});

describe('isJobBillQuoted', () => {
  it('is false when no line has qty > 0', () => {
    expect(isJobBillQuoted([{ description: 'Labour', quantity: 0, unit_price: 95 }])).toBe(false);
    expect(isJobBillQuoted(null)).toBe(false);
  });

  it('is true when an accepted quote line has qty > 0', () => {
    expect(isJobBillQuoted([{ description: 'Call-out', quantity: 1, unit_price: 180 }])).toBe(true);
  });
});
