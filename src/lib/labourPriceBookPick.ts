const STORAGE_PREFIX = 'grafter:labour-price-book:';

export function labourPriceBookStorageKey(companyId: string): string {
  return `${STORAGE_PREFIX}${companyId}`;
}

export function readPickedLabourPriceBookId(companyId: string): string | null {
  try {
    const raw = localStorage.getItem(labourPriceBookStorageKey(companyId));
    return raw?.trim() || null;
  } catch {
    return null;
  }
}

export function writePickedLabourPriceBookId(companyId: string, itemId: string): void {
  try {
    localStorage.setItem(labourPriceBookStorageKey(companyId), itemId);
  } catch {
    /* ignore quota / private mode */
  }
}
