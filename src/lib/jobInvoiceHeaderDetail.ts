import type { JobBillInvoicePreviewState } from './invoiceFromJobBill';

/** Two lines of 12px detail + line gap — matches ops-next-detail in the invoice card. */
export const JOB_INVOICE_HEADER_DETAIL_MIN_HEIGHT_PX = 44;

export function jobInvoiceHeaderDetailContent(input: {
  nextKey: string;
  headerPrimaryHeld: boolean;
  previewState: JobBillInvoicePreviewState;
  detail: string;
}): { text: string; reserveHeight: boolean; showSkeleton: boolean } {
  if (input.headerPrimaryHeld) {
    return { text: '', reserveHeight: true, showSkeleton: true };
  }
  if (input.nextKey !== 'invoice') {
    return { text: input.detail, reserveHeight: false, showSkeleton: false };
  }
  if (input.previewState === 'loading') {
    return { text: '', reserveHeight: true, showSkeleton: true };
  }
  const text = input.detail.trim() ? input.detail : '\u00a0';
  return { text, reserveHeight: true, showSkeleton: false };
}
