import type { SupabaseClient } from '@supabase/supabase-js';
import { auditLookTag } from './devFieldAuditDocs';
import { isDevFieldAuditAuth } from './devFieldAuditAuth';
import { readPickedLabourPriceBookId } from './labourPriceBookPick';
import { countZeroLabourLinesForJobBillInvoice } from './hoursToJobBill';
import { zeroLabourLineCountForInvoicePlan } from './jobBillInvoicePlan';
import { shouldSkipZeroLabourBeforeJobBillInvoice } from './jobBillInvoiceCreateFlow';

export type RequestJobBillInvoiceInput = {
  client: SupabaseClient;
  jobId: string;
  companyId: string;
  profileId: string;
  hasAcceptedQuote: boolean;
  includeLoggedHoursExtra: boolean;
};

/**
 * Shared gate before createInvoiceFromJobBill — header Invoice and job bill panel.
 */
export async function countZeroLabourBeforeJobBillInvoice(
  input: RequestJobBillInvoiceInput,
): Promise<number> {
  if (shouldSkipZeroLabourBeforeJobBillInvoice({
    hasAcceptedQuote: input.hasAcceptedQuote,
    includeLoggedHoursExtra: input.includeLoggedHoursExtra,
  })) {
    return 0;
  }
  const look = auditLookTag();
  if (isDevFieldAuditAuth() && (look?.startsWith('fix2-') || look?.startsWith('fix2b-'))) {
    const fullZero = look === 'fix2-unquoted-zero' || look === 'fix2-zero-header' ? 1 : 0;
    return zeroLabourLineCountForInvoicePlan({
      hasAcceptedQuote: input.hasAcceptedQuote,
      includeLoggedHoursExtra: input.includeLoggedHoursExtra,
      fullZeroCount: fullZero,
    });
  }
  const picked = readPickedLabourPriceBookId(input.companyId);
  const full = await countZeroLabourLinesForJobBillInvoice(input.client, {
    jobId: input.jobId,
    companyId: input.companyId,
    profileId: input.profileId,
    pickedPriceBookItemId: picked,
  });
  return zeroLabourLineCountForInvoicePlan({
    hasAcceptedQuote: input.hasAcceptedQuote,
    includeLoggedHoursExtra: input.includeLoggedHoursExtra,
    fullZeroCount: full,
  });
}
