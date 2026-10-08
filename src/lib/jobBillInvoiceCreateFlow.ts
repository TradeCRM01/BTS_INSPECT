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
