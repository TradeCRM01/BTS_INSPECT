import { describe, expect, it, vi } from 'vitest';
import {
  runJobBillInvoiceCreateFlow,
  shouldSkipZeroLabourBeforeJobBillInvoice,
} from './jobBillInvoiceCreateFlow';

describe('jobBillInvoiceCreateFlow', () => {
  it('skips zero-labour reads for quoted jobs without opt-in', () => {
    expect(shouldSkipZeroLabourBeforeJobBillInvoice({
      hasAcceptedQuote: true,
      includeLoggedHoursExtra: false,
    })).toBe(true);
    expect(shouldSkipZeroLabourBeforeJobBillInvoice({
      hasAcceptedQuote: true,
      includeLoggedHoursExtra: true,
    })).toBe(false);
  });

  it('blocks a second in-flight create (double tap)', async () => {
    const guard = { inFlight: false };
    const create = vi.fn(async () => 'ok');
    const first = runJobBillInvoiceCreateFlow({
      guard,
      skipZeroCheck: true,
      countZeroLabour: async () => 0,
      onZeroLabour: () => {},
      createInvoice: async () => {
        const second = await runJobBillInvoiceCreateFlow({
          guard,
          skipZeroCheck: true,
          countZeroLabour: async () => 0,
          onZeroLabour: () => {},
          createInvoice: async () => {
            await create();
            return true;
          },
        });
        expect(second).toBe('skipped_in_flight');
        return true;
      },
    });
    await first;
    expect(create).not.toHaveBeenCalled();
  });

  it('surfaces zero-labour count without creating', async () => {
    const onZero = vi.fn();
    const create = vi.fn(async () => true);
    const result = await runJobBillInvoiceCreateFlow({
      guard: { inFlight: false },
      skipZeroCheck: false,
      countZeroLabour: async () => 2,
      onZeroLabour: onZero,
      createInvoice: create,
    });
    expect(result).toBe('zero_blocked');
    expect(onZero).toHaveBeenCalledWith(2);
    expect(create).not.toHaveBeenCalled();
  });

  it('returns create_failed when createInvoice reports failure', async () => {
    const result = await runJobBillInvoiceCreateFlow({
      guard: { inFlight: false },
      skipZeroCheck: true,
      countZeroLabour: async () => 0,
      onZeroLabour: () => {},
      createInvoice: async () => false,
    });
    expect(result).toBe('create_failed');
  });
});
