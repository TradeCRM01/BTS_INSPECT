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

export type PersistableDocumentMoney = {
  subtotal: number;
  tax_amount: number;
  total: number;
  tax_rate: number;
};

export function persistDocumentMoney(
  status: string | null | undefined,
  live: PersistableDocumentMoney,
  stored?: { subtotal?: number | null; tax_amount?: number | null; total?: number | null; tax_rate?: number | null } | null,
): PersistableDocumentMoney {
  if (issuedDocumentKeepsStoredTotals(status) && stored) {
    return {
      subtotal: Number(stored.subtotal) || 0,
      tax_amount: Number(stored.tax_amount) || 0,
      total: Number(stored.total) || 0,
      tax_rate: stored.tax_rate == null ? live.tax_rate : Number(stored.tax_rate) || 0,
    };
  }
  return live;
}

export function persistIssuedClientId(
  status: string | null | undefined,
  liveClientId: string,
  storedClientId?: string | null,
): string | null {
  if (issuedDocumentLocksLines(status) && storedClientId) return storedClientId;
  return liveClientId || null;
}
