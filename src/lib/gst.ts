import { committedMoneyOrZero, committedNumber } from './parseDecimal';

/** Australian GST default — companies.default_tax_rate also defaults to 10. */
export const DEFAULT_TAX_RATE = 10;

export type DocumentTotals = {
  subtotal: number;
  taxAmount: number;
  total: number;
};

/** Half-up on integer cents. 1e-8 lifts binary 131.02499… so 1.5 × 87.35 is 131.03. */
export function moneyRound(n: number): number {
  const x = Number(n) || 0;
  return Math.round(x * 100 + 1e-8) / 100;
}

export function calcDocumentTotals(subtotal: number, taxRate: number): DocumentTotals {
  const roundedSub = moneyRound(subtotal);
  const rate = Number(taxRate) || 0;
  const taxAmount = moneyRound(roundedSub * rate / 100);
  const total = moneyRound(roundedSub + taxAmount);
  return { subtotal: roundedSub, taxAmount, total };
}

export type LineForGst = {
  quantity?: number | string | null;
  unit_price?: number | string | null;
  gst_rate?: number | string | null;
};

export function lineHasOwnGstRate(line: LineForGst): boolean {
  return line.gst_rate != null && String(line.gst_rate) !== '';
}

export function lineGstRate(line: LineForGst, fallbackRate: number): number {
  if (!lineHasOwnGstRate(line)) return Number(fallbackRate) || 0;
  const value = Number(line.gst_rate);
  return Number.isFinite(value) ? value : (Number(fallbackRate) || 0);
}

function lineQty(raw: LineForGst['quantity']): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const text = String(raw ?? '').trim();
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return committedNumber(text) ?? 0;
}

function lineUnitPrice(raw: LineForGst['unit_price']): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
  const text = String(raw ?? '').trim();
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return committedMoneyOrZero(text);
}

/** Line amount in cents. AU invoices round each line, then sum. */
export function lineExGstAmount(line: LineForGst): number {
  return moneyRound(lineQty(line.quantity) * lineUnitPrice(line.unit_price));
}

export function commercialPdfLineAmount(line: LineForGst): number {
  return lineExGstAmount(line);
}

/** Per-line GST. Lines with no rate use the document tax rate so old quotes and invoices match calcDocumentTotals. */
export function calcLineDocumentTotals(lines: LineForGst[], fallbackRate: number): DocumentTotals {
  const rawSubtotal = lines.reduce((sum, line) => sum + lineExGstAmount(line), 0);
  if (!lines.some(lineHasOwnGstRate)) {
    return calcDocumentTotals(rawSubtotal, fallbackRate);
  }
  const subtotal = moneyRound(rawSubtotal);
  const taxAmount = moneyRound(lines.reduce((sum, line) => {
    const rate = lineGstRate(line, fallbackRate);
    return sum + moneyRound(lineExGstAmount(line) * rate / 100);
  }, 0));
  return { subtotal, taxAmount, total: moneyRound(subtotal + taxAmount) };
}

export function gstLabel(taxRate: number): string {
  return `GST (${Number(taxRate) || 0}%)`;
}

export function gstDocumentLabel(lines: LineForGst[], fallbackRate: number): string {
  return lines.some(lineHasOwnGstRate) ? 'GST' : gstLabel(fallbackRate);
}
