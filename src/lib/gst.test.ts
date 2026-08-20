import { describe, expect, it } from 'vitest';
import { DEFAULT_TAX_RATE, calcDocumentTotals, gstLabel, moneyRound } from './gst';

describe('calcDocumentTotals', () => {
  it('applies 10% GST on a clean subtotal', () => {
    expect(calcDocumentTotals(1000, DEFAULT_TAX_RATE)).toEqual({
      subtotal: 1000,
      taxAmount: 100,
      total: 1100,
    });
  });

  it('rounds GST to cents so total does not drift', () => {
    expect(calcDocumentTotals(33.33, 10)).toEqual({
      subtotal: 33.33,
      taxAmount: 3.33,
      total: 36.66,
    });
  });

  it('rounds the subtotal before GST', () => {
    expect(calcDocumentTotals(10.004, 10).subtotal).toBe(10);
    expect(calcDocumentTotals(10.006, 10).subtotal).toBe(10.01);
  });

  it('treats missing tax rate as 0', () => {
    expect(calcDocumentTotals(50, Number.NaN)).toEqual({
      subtotal: 50,
      taxAmount: 0,
      total: 50,
    });
  });
});

describe('gstLabel', () => {
  it('names GST with the rate', () => {
    expect(gstLabel(10)).toBe('GST (10%)');
    expect(gstLabel(0)).toBe('GST (0%)');
  });
});

describe('moneyRound', () => {
  it('stores two decimal places', () => {
    expect(moneyRound(1.239)).toBe(1.24);
    expect(moneyRound(0)).toBe(0);
  });
});
