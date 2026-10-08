import type { QueryClient } from '@tanstack/react-query';

export const JOB_BILL_INVOICE_PREVIEW_QUERY_PREFIX = 'job-bill-invoice-preview';

export function jobBillInvoicePreviewQueryKey(jobId: string) {
  return [JOB_BILL_INVOICE_PREVIEW_QUERY_PREFIX, jobId] as const;
}

export function invalidateJobBillInvoicePreview(queryClient: QueryClient, jobId: string): void {
  void queryClient.invalidateQueries({ queryKey: jobBillInvoicePreviewQueryKey(jobId) });
}
