import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { calcLineDocumentTotals, lineExGstAmount, moneyRound } from './gst';
import { calcSubtotal, type EditLineItem } from '../components/invoicing/LineItemEditor';
import { formatMoney } from '../types/fsm';

/** Fractional qty × unit lines that split line-level vs total-level rounding. */
export const CENTS_SPLIT_LINES = [
  { description: 'Labour', quantity: 2.5, unit_price: 41.535 },
  { description: 'Fitting', quantity: 3.3, unit_price: 31.466 },
  { description: 'Consumables', quantity: 4.7, unit_price: 22.093 },
] as const;

function asEditLines(): EditLineItem[] {
  return CENTS_SPLIT_LINES.map(line => ({
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

describe('quote/invoice totals share one cents path', () => {
  it('pins $311.52: round each line to cents, then sum, including GST', () => {
    const raw = CENTS_SPLIT_LINES.reduce((sum, line) => sum + line.quantity * line.unit_price, 0);
    expect(Number(raw.toFixed(2))).toBe(311.51);
    expect(CENTS_SPLIT_LINES.reduce((sum, line) => sum + moneyRound(line.quantity * line.unit_price), 0)).toBe(311.52);

    const editor = calcLineDocumentTotals([...CENTS_SPLIT_LINES], 10);
    const preview = calcLineDocumentTotals([...CENTS_SPLIT_LINES], 10);
    const pdf = calcLineDocumentTotals([...CENTS_SPLIT_LINES], 10);
    const lineEditor = calcSubtotal(asEditLines());

    expect(editor).toEqual({ subtotal: 311.52, taxAmount: 31.15, total: 342.67 });
    expect(preview).toEqual(editor);
    expect(pdf).toEqual(editor);
    expect(lineEditor).toBe(editor.subtotal);
    expect(CENTS_SPLIT_LINES.map(line => lineExGstAmount(line))).toEqual([103.84, 103.84, 103.84]);
    const pdfSrc = readFileSync(resolve(process.cwd(), 'src/reports/commercial/CommercialDocumentPdf.tsx'), 'utf8');
    expect(pdfSrc).toContain('lineExGstAmount(');
    const editorSrc = readFileSync(resolve(process.cwd(), 'src/components/invoicing/LineItemEditor.tsx'), 'utf8');
    expect(editorSrc).toContain('calcLineDocumentTotals(');
    expect(formatMoney(editor.subtotal)).toBe('$311.52');
    expect(formatMoney(editor.taxAmount)).toBe('$31.15');
    expect(formatMoney(editor.total)).toBe('$342.67');
  });
});
