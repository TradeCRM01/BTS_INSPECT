export function issuedDocumentKeepsStoredTotals(status: string | null | undefined): boolean {
  return status === 'sent' || status === 'paid' || status === 'part_paid' || status === 'accepted' || status === 'overdue';
}

export function issuedDocumentLocksLines(status: string | null | undefined): boolean {
  return issuedDocumentKeepsStoredTotals(status);
}

export function persistIssuedLines<T>(
  status: string | null | undefined,
  liveLines: T[],
  storedLines: T[] | null | undefined,
): T[] {
  if (issuedDocumentLocksLines(status) && storedLines) return storedLines;
  return liveLines;
}

export function persistDocumentMoney(
  status: string | null | undefined,
  live: { subtotal: number; tax_amount: number; total: number },
  stored?: { subtotal?: number | null; tax_amount?: number | null; total?: number | null } | null,
): { subtotal: number; tax_amount: number; total: number } {
  if (issuedDocumentKeepsStoredTotals(status) && stored) {
    return {
      subtotal: Number(stored.subtotal) || 0,
      tax_amount: Number(stored.tax_amount) || 0,
      total: Number(stored.total) || 0,
    };
  }
  return live;
}
