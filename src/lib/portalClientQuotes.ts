export function portalClientQuotes<T extends { status: string }>(quotes: T[]): T[] {
  return quotes.filter((quote) => quote.status !== 'draft');
}

export function portalClientInvoices<T extends { status: string }>(invoices: T[]): T[] {
  return invoices.filter((invoice) => invoice.status !== 'draft');
}

const PORTAL_STATUS_LABELS: Record<string, string> = {
  sent: 'Sent',
  paid: 'Paid',
  accepted: 'Accepted',
  overdue: 'Overdue',
  part_paid: 'Part paid',
  declined: 'Declined',
  expired: 'Expired',
};

/** Client-visible status. Draft is hidden, not labelled. */
export function portalVisibleStatus(status: string): string | null {
  const key = status.trim().toLowerCase();
  if (!key || key === 'draft') return null;
  return PORTAL_STATUS_LABELS[key] ?? `${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

export function portalStatusKey(status: string): string {
  return status.trim().toLowerCase();
}
