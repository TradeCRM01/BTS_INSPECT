import type { QueryClient } from '@tanstack/react-query';
import type { JobBillInvoicePreviewState } from './invoiceFromJobBill';

export const JOB_BILL_INVOICE_PREVIEW_QUERY_PREFIX = 'job-bill-invoice-preview';

export type JobBillInvoicePreviewQueryDims = {
  addLoggedHoursExtra: boolean;
  hasAcceptedQuoteLines: boolean;
  jobBillTaxRate: number;
};

/** Prefix key invalidates every cached variant for the job. */
export function jobBillInvoicePreviewQueryKey(jobId: string) {
  return [JOB_BILL_INVOICE_PREVIEW_QUERY_PREFIX, jobId] as const;
}

export function jobBillInvoicePreviewQueryKeyWithDims(
  jobId: string,
  dims: JobBillInvoicePreviewQueryDims,
) {
  return [
    JOB_BILL_INVOICE_PREVIEW_QUERY_PREFIX,
    jobId,
    dims.addLoggedHoursExtra,
    dims.hasAcceptedQuoteLines,
    dims.jobBillTaxRate,
  ] as const;
}

export function invalidateJobBillInvoicePreview(queryClient: QueryClient, jobId: string): void {
  void queryClient.invalidateQueries({ queryKey: jobBillInvoicePreviewQueryKey(jobId) });
}

/** Keep prior preview only when React Query is refetching the same job (not after /jobs/:id → :id). */
export function jobBillInvoicePreviewPlaceholderData<T>(
  jobId: string,
  previousData: T | undefined,
  previousQuery: { queryKey: readonly unknown[] } | undefined,
): T | undefined {
  if (previousData === undefined) return undefined;
  if (!previousQuery?.queryKey?.length) return undefined;
  return previousQuery.queryKey[1] === jobId ? previousData : undefined;
}

export function jobBillInvoicePreviewQueryLoading(input: {
  queryEnabled: boolean;
  isPending: boolean;
  isPlaceholderData: boolean;
  devHoldPreview?: boolean;
}): boolean {
  if (input.devHoldPreview) return true;
  if (!input.queryEnabled) return false;
  return input.isPending || input.isPlaceholderData;
}

export function resolveJobBillInvoicePreviewState(input: {
  devHoldPreview: boolean;
  quotedLookOn: boolean;
  fix2MemoPreviewOn: boolean;
  queryEnabled: boolean;
  isPending: boolean;
  isPlaceholderData: boolean;
  isError: boolean;
}): JobBillInvoicePreviewState {
  if (input.devHoldPreview) return 'loading';
  if (input.quotedLookOn || input.fix2MemoPreviewOn) return 'ready';
  if (!input.queryEnabled) return 'ready';
  if (jobBillInvoicePreviewQueryLoading({
    queryEnabled: input.queryEnabled,
    isPending: input.isPending,
    isPlaceholderData: input.isPlaceholderData,
  })) {
    return 'loading';
  }
  if (input.isError) return 'error';
  return 'ready';
}

/** Labour rates, tax, price books, and expense models can change any job preview. */
export function invalidateAllJobBillInvoicePreviews(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: [JOB_BILL_INVOICE_PREVIEW_QUERY_PREFIX] });
}
