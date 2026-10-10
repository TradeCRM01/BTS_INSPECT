import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  holdJobInvoiceCreateUntilUnmount,
  jobInvoiceSecondTapBeforeUnmount,
  runJobBillInvoiceCreateFlow,
  shouldSkipZeroLabourBeforeJobBillInvoice,
} from './jobBillInvoiceCreateFlow';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

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

  it('a second click before unmount makes 0 job-reminder calls and 0 send=1', () => {
    expect(holdJobInvoiceCreateUntilUnmount('created')).toBe(true);
    expect(holdJobInvoiceCreateUntilUnmount('zero_blocked')).toBe(false);
    expect(holdJobInvoiceCreateUntilUnmount('create_failed')).toBe(false);
    expect(holdJobInvoiceCreateUntilUnmount('skipped_in_flight')).toBe(true);
    expect(src('src/pages/JobDetailPage.tsx')).toContain(
      'if (!holdJobInvoiceCreateUntilUnmount(flowResult))',
    );
    expect(jobInvoiceSecondTapBeforeUnmount({
      heldUntilUnmount: true,
      nextKey: 'send',
    })).toEqual({ jobReminderPosts: 0, sendParam: null, jobsPath: false });
    expect(jobInvoiceSecondTapBeforeUnmount({
      heldUntilUnmount: true,
      nextKey: 'arriving',
    })).toEqual({ jobReminderPosts: 0, sendParam: null, jobsPath: false });
    expect(jobInvoiceSecondTapBeforeUnmount({
      heldUntilUnmount: false,
      nextKey: 'send',
    })).toEqual({ jobReminderPosts: 0, sendParam: 'send=1', jobsPath: false });
    expect(jobInvoiceSecondTapBeforeUnmount({
      heldUntilUnmount: false,
      nextKey: 'arriving',
    })).toEqual({ jobReminderPosts: 1, sendParam: null, jobsPath: false });
  });

  it('keeps the quoted sheet covering Jobs until create navigation commits', () => {
    expect(holdJobInvoiceCreateUntilUnmount('created')).toBe(true);
    const job = src('src/pages/JobDetailPage.tsx');
    const sheet = src('src/components/jobs/JobBillQuotedInvoiceSheet.tsx');
    const success = job.slice(
      job.indexOf('const invoiceFromJobBill'),
      job.indexOf('const attachClient = useMutation'),
    );
    const run = job.slice(
      job.indexOf('const runInvoiceFromJobBill'),
      job.indexOf('const handleInvoice'),
    );
    expect(success).not.toContain('setQuotedInvoiceSheetOpen(false)');
    expect(success).toContain('navigate(jobInvoiceCreateLanding(result.id))');
    expect(run).toContain('holdJobInvoiceCreateUntilUnmount(flowResult)');
    expect(run).not.toContain('finally');
    expect(run).toContain('setJobInvoiceCreateHold(true)');
    expect(src('src/App.tsx')).toContain('JobInvoiceCreateHoldOverlay');
    expect(sheet).toContain('backdropClose={!pending}');
    expect(sheet).toContain('swipeDownClose={!pending}');
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
