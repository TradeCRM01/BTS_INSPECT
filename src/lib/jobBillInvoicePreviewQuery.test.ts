import { describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  invalidateJobBillInvoicePreview,
  JOB_BILL_INVOICE_PREVIEW_QUERY_PREFIX,
  jobBillInvoicePreviewPlaceholderData,
  jobBillInvoicePreviewQueryKey,
  jobBillInvoicePreviewQueryKeyWithDims,
  jobBillInvoicePreviewQueryLoading,
  resolveJobBillInvoicePreviewState,
} from './jobBillInvoicePreviewQuery';
import { invalidateJobBillAfterHoursChange } from './hoursToJobBill';

describe('jobBillInvoicePreviewQuery', () => {
  it('uses a stable per-job query key prefix', () => {
    expect(jobBillInvoicePreviewQueryKey('job-abc')).toEqual([
      JOB_BILL_INVOICE_PREVIEW_QUERY_PREFIX,
      'job-abc',
    ]);
  });

  it('builds the full preview query key with bill dimensions', () => {
    expect(jobBillInvoicePreviewQueryKeyWithDims('job-abc', {
      addLoggedHoursExtra: true,
      hasAcceptedQuoteLines: false,
      jobBillTaxRate: 10,
    })).toEqual([
      JOB_BILL_INVOICE_PREVIEW_QUERY_PREFIX,
      'job-abc',
      true,
      false,
      10,
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

  it('does not keep placeholder preview from a different job id', () => {
    const prev = { lineCount: 2, moneyLine: '$100 inc GST' };
    const fromJobA = jobBillInvoicePreviewQueryKeyWithDims('job-a', {
      addLoggedHoursExtra: false,
      hasAcceptedQuoteLines: true,
      jobBillTaxRate: 10,
    });
    expect(jobBillInvoicePreviewPlaceholderData('job-b', prev, { queryKey: fromJobA })).toBeUndefined();
    expect(jobBillInvoicePreviewPlaceholderData('job-a', prev, { queryKey: fromJobA })).toBe(prev);
  });

  it('treats isPlaceholderData as loading for sheet and skip decisions', () => {
    expect(jobBillInvoicePreviewQueryLoading({
      queryEnabled: true,
      isPending: false,
      isPlaceholderData: true,
    })).toBe(true);
    expect(resolveJobBillInvoicePreviewState({
      devHoldPreview: false,
      quotedLookOn: false,
      fix2MemoPreviewOn: false,
      queryEnabled: true,
      isPending: false,
      isPlaceholderData: true,
      isError: false,
    })).toBe('loading');
  });

  it('opt-in key change with placeholder blocks ready money line', () => {
    const withoutOptIn = jobBillInvoicePreviewQueryKeyWithDims('job-1', {
      addLoggedHoursExtra: false,
      hasAcceptedQuoteLines: true,
      jobBillTaxRate: 10,
    });
    const stale = { lineCount: 2, moneyLine: 'Quote #0002 · 2 lines · $898.00 inc GST' };
    const held = jobBillInvoicePreviewPlaceholderData('job-1', stale, { queryKey: withoutOptIn });
    expect(held).toBe(stale);
    expect(jobBillInvoicePreviewQueryLoading({
      queryEnabled: true,
      isPending: false,
      isPlaceholderData: true,
    })).toBe(true);
    expect(resolveJobBillInvoicePreviewState({
      devHoldPreview: false,
      quotedLookOn: false,
      fix2MemoPreviewOn: false,
      queryEnabled: true,
      isPending: false,
      isPlaceholderData: true,
      isError: false,
    })).toBe('loading');
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
