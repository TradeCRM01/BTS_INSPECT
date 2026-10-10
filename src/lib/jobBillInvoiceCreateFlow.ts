export type JobBillInvoiceCreateGuard = { inFlight: boolean };

export function shouldSkipZeroLabourBeforeJobBillInvoice(input: {
  hasAcceptedQuote: boolean;
  includeLoggedHoursExtra: boolean;
}): boolean {
  return input.hasAcceptedQuote && !input.includeLoggedHoursExtra;
}

export type JobBillInvoiceCreateFlowResult =
  | 'skipped_in_flight'
  | 'zero_blocked'
  | 'created'
  | 'create_failed';

/** Successful create keeps controls held until this page unmounts. */
export function holdJobInvoiceCreateUntilUnmount(
  result: JobBillInvoiceCreateFlowResult,
): boolean {
  return result === 'created';
}

/** A second tap before unmount must not Share, remind, or hit Jobs. */
export function jobInvoiceSecondTapBeforeUnmount(input: {
  heldUntilUnmount: boolean;
  nextKey: string;
}): { jobReminderPosts: number; sendParam: string | null; jobsPath: boolean } {
  if (input.heldUntilUnmount) {
    return { jobReminderPosts: 0, sendParam: null, jobsPath: false };
  }
  if (input.nextKey === 'send') {
    return { jobReminderPosts: 0, sendParam: 'send=1', jobsPath: false };
  }
  if (input.nextKey === 'arriving') {
    return { jobReminderPosts: 1, sendParam: null, jobsPath: false };
  }
  return { jobReminderPosts: 0, sendParam: null, jobsPath: true };
}

/**
 * One create path for header Invoice and quoted sheet — ref guard blocks double tap.
 */
export async function runJobBillInvoiceCreateFlow(input: {
  guard: JobBillInvoiceCreateGuard;
  skipZeroCheck: boolean;
  countZeroLabour: () => Promise<number>;
  onZeroLabour: (count: number) => void;
  createInvoice: () => Promise<boolean>;
}): Promise<JobBillInvoiceCreateFlowResult> {
  if (input.guard.inFlight) return 'skipped_in_flight';
  input.guard.inFlight = true;
  try {
    if (!input.skipZeroCheck) {
      const zeroCount = await input.countZeroLabour();
      if (zeroCount > 0) {
        input.onZeroLabour(zeroCount);
        return 'zero_blocked';
      }
    }
    const created = await input.createInvoice();
    return created ? 'created' : 'create_failed';
  } finally {
    input.guard.inFlight = false;
  }
}
