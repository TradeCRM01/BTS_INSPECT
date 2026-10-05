import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TAX_RATE,
  calcDocumentTotals,
  calcLineDocumentTotals,
  gstDocumentLabel,
  gstLabel,
  moneyRound,
} from './gst';

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

describe('calcLineDocumentTotals', () => {
  it('charges GST on a 10% line only when the other line is GST-free', () => {
    expect(calcLineDocumentTotals([
      { quantity: 1, unit_price: 100, gst_rate: 10 },
      { quantity: 1, unit_price: 50, gst_rate: 0 },
    ], 10)).toEqual({
      subtotal: 150,
      taxAmount: 10,
      total: 160,
    });
  });

  it('uses the quote rate when lines have no gst_rate and matches the old document total', () => {
    const lines = [
      { quantity: 8, unit_price: 95 },
      { quantity: 2, unit_price: 12.5, gst_rate: null },
    ];
    const fallback = calcDocumentTotals(8 * 95 + 2 * 12.5, 10);
    expect(calcLineDocumentTotals(lines, 10)).toEqual(fallback);
    expect(calcLineDocumentTotals(lines, 10)).toEqual({
      subtotal: 785,
      taxAmount: 78.5,
      total: 863.5,
    });
  });
});

describe('gstDocumentLabel', () => {
  it('keeps the quote rate label when every line falls back', () => {
    expect(gstDocumentLabel([{ unit_price: 95, quantity: 8 }], 10)).toBe('GST (10%)');
  });

  it('drops the single-rate label when a line carries its own GST', () => {
    expect(gstDocumentLabel([{ unit_price: 100, quantity: 1, gst_rate: 0 }], 10)).toBe('GST');
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
