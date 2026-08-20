import { invoiceHref } from './invoiceFromQuote';

export function clientRecordHref(clientId: string): string {
  return `/clients/${clientId}`;
}

export function jobRecordHref(jobId: string): string {
  return `/jobs/${jobId}`;
}

export function quoteRecordHref(quoteId: string): string {
  return `/quotes?id=${encodeURIComponent(quoteId)}`;
}

export function invoiceRecordHref(invoiceId: string): string {
  return invoiceHref(invoiceId);
}

/** Opens the existing quote editor with this client already selected. */
export function newQuoteFromClientHref(clientId: string): string {
  return `/quotes?client=${encodeURIComponent(clientId)}`;
}

/** Opens the existing job create flow with this client already selected. */
export function newJobFromClientHref(clientId: string): string {
  return `/jobs?client=${encodeURIComponent(clientId)}`;
}

/** Copy the client's site onto a new job when the address field is still empty. */
export function jobSiteAddressFromClient(
  currentAddress: string,
  clientAddress: string | null | undefined,
): string {
  if (currentAddress.trim()) return currentAddress;
  return (clientAddress ?? '').trim();
}
