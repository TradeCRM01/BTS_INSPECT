import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  invalidateJobBillInvoicePreview,
  JOB_BILL_INVOICE_PREVIEW_QUERY_PREFIX,
  jobBillInvoicePreviewQueryKey,
} from './jobBillInvoicePreviewQuery';
import { invalidateJobBillAfterHoursChange } from './hoursToJobBill';

describe('jobBillInvoicePreviewQuery', () => {
  it('uses a stable per-job query key prefix', () => {
    expect(jobBillInvoicePreviewQueryKey('job-abc')).toEqual([
      JOB_BILL_INVOICE_PREVIEW_QUERY_PREFIX,
      'job-abc',
    ]);
  });

  it('invalidates the preview query for a job', () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    invalidateJobBillInvoicePreview(queryClient, 'job-1');
    expect(spy).toHaveBeenCalledWith({
      queryKey: [JOB_BILL_INVOICE_PREVIEW_QUERY_PREFIX, 'job-1'],
    });
  });

  it('invalidates preview when bill hours refresh runs', () => {
    const queryClient = new QueryClient();
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    invalidateJobBillAfterHoursChange(queryClient, 'job-9');
    expect(spy).toHaveBeenCalledWith({
      queryKey: [JOB_BILL_INVOICE_PREVIEW_QUERY_PREFIX, 'job-9'],
    });
  });
});
