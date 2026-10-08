import { describe, expect, it, vi } from 'vitest';
import { jobBillInvoiceMutateSilentlyOnReject } from './jobBillInvoiceMutateStep';

describe('jobBillInvoiceMutateSilentlyOnReject', () => {
  it('failed create yields exactly one error-styled toast when mutation onError runs before reject', async () => {
    const toasts: Array<{ message: string; variant: 'error' | 'info' | 'success' }> = [];
    const mutateAsync = vi.fn(async () => {
      throw new Error('Could not create invoice');
    });
    const simulateTanStackMutateAsync = async () => {
      try {
        await mutateAsync();
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Could not create invoice';
        toasts.push({ message, variant: 'error' });
        throw e;
      }
    };
    const created = await jobBillInvoiceMutateSilentlyOnReject(simulateTanStackMutateAsync);
    expect(created).toBe(false);
    expect(toasts).toHaveLength(1);
    expect(toasts[0]).toEqual({ message: 'Could not create invoice', variant: 'error' });
  });
});
