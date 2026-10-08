import type { QueryClient } from '@tanstack/react-query';

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

/** Labour rates, tax, price books, and expense models can change any job preview. */
export function invalidateAllJobBillInvoicePreviews(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({ queryKey: [JOB_BILL_INVOICE_PREVIEW_QUERY_PREFIX] });
}
