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

export function gstLabel(taxRate: number): string {
  return `GST (${Number(taxRate) || 0}%)`;
}
