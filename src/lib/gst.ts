/** Australian GST default — companies.default_tax_rate also defaults to 10. */
export const DEFAULT_TAX_RATE = 10;

export type DocumentTotals = {
  subtotal: number;
  taxAmount: number;
  total: number;
};

/** Round money the same way on quote, invoice, and job-bill so GST cannot drift. */
export function moneyRound(n: number): number {
  return Number((Number(n) || 0).toFixed(2));
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

export function lineExGstAmount(line: LineForGst): number {
  return (Number(line.quantity) || 0) * (Number(line.unit_price) || 0);
}

/** Per-line GST. Lines with no rate use the quote tax rate so old quotes match calcDocumentTotals. */
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
