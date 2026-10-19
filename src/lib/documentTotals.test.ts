import { describe, expect, it } from 'vitest';
import { calcLineDocumentTotals, commercialPdfLineAmount, lineExGstAmount, moneyRound } from './gst';
import { calcSubtotal, type EditLineItem } from '../components/invoicing/LineItemEditor';
import { formatMoney } from '../types/fsm';

/** Prod sweep quote/invoice lines: 1.5×87.35 + 3×33.33 + 7×11.5. */
export const SWEEP_PROD_LINES = [
  { description: 'Labour', quantity: 1.5, unit_price: 87.35 },
  { description: 'Fitting', quantity: 3, unit_price: 33.33 },
  { description: 'Consumables', quantity: 7, unit_price: 11.5 },
] as const;

function asEditLines(): EditLineItem[] {
  return SWEEP_PROD_LINES.map(line => ({
    description: line.description,
    quantity: String(line.quantity),
    unit_price: String(line.unit_price),
    stock_item_id: null,
    price_book_item_id: null,
    charge_type: 'Labour',
    unit_cost: null,
    markup_percent: null,
    cost_model_id: null,
    gst_rate: null,
    check_price: false,
  }));
}

function toFixedHalfDown(n: number): number {
  return Number(n.toFixed(2));
}

describe('quote/invoice totals half-up on integer cents', () => {
  it('pins 1.5 × 87.35 = 131.03 and the prod sweep $311.52 / $342.67', () => {
    const rawLine = 1.5 * 87.35;
    expect(toFixedHalfDown(rawLine)).toBe(131.02);
    expect(moneyRound(rawLine)).toBe(131.03);
    expect(lineExGstAmount(SWEEP_PROD_LINES[0])).toBe(131.03);
    expect(lineExGstAmount(SWEEP_PROD_LINES[1])).toBe(99.99);
    expect(lineExGstAmount(SWEEP_PROD_LINES[2])).toBe(80.5);

    const totals = calcLineDocumentTotals([...SWEEP_PROD_LINES], 10);
    expect(totals).toEqual({ subtotal: 311.52, taxAmount: 31.15, total: 342.67 });
    expect(calcSubtotal(asEditLines())).toBe(311.52);
    expect(formatMoney(totals.subtotal)).toBe('$311.52');
    expect(formatMoney(totals.total)).toBe('$342.67');
    expect(commercialPdfLineAmount(SWEEP_PROD_LINES[0])).toBe(131.03);
    expect(commercialPdfLineAmount(SWEEP_PROD_LINES[0])).not.toBe(1.5 * 87.35);
  });

  it('kills a toFixed / half-down moneyRound mutant', () => {
    const raw = 1.5 * 87.35;
    expect(moneyRound(raw)).not.toBe(toFixedHalfDown(raw));
    expect(moneyRound(raw)).not.toBe(Math.round(raw * 100) / 100);
    const mutantTotals = SWEEP_PROD_LINES.reduce((sum, line) => sum + toFixedHalfDown(line.quantity * line.unit_price), 0);
    expect(mutantTotals).toBe(311.51);
    expect(calcLineDocumentTotals([...SWEEP_PROD_LINES], 10).subtotal).not.toBe(mutantTotals);
  });
});
