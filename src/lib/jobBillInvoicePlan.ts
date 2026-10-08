import type { InvoiceLineItem, QuoteLineItem } from '../types/fsm';
import { formatMoney } from '../types/fsm';
import type { TimesheetEntryForBill } from './hoursToJobBill';
import {
  closedBillableEntries,
  formatLabourHoursOneDecimal,
  invoiceLinesWithLabourPriceBook,
  lineNeedsLabourRate,
  type LabourSellResolution,
} from './hoursToJobBill';
import { entryMinutes } from './timesheetJob';
import { invoiceLinesFromQuote } from './invoiceFromQuote';
import { invoiceLinesFromJobCosts, jobBillInvoiceNextDetail, type JobBillCostLine } from './invoiceFromJobBill';

export const JOB_BILL_ADD_LOGGED_HOURS_EXTRA_LABEL = 'Add logged hours as extra';

export function totalLoggedBillableHoursOnJob(
  entries: TimesheetEntryForBill[],
  jobId: string,
): number {
  let minutes = 0;
  for (const entry of closedBillableEntries(entries)) {
    if (entry.job_id !== jobId) continue;
    minutes += entryMinutes(entry.start_time, entry.end_time);
  }
  return minutes / 60;
}

/** Exact copy for quoted-job invoice flow when hours exist and quote covers labour. */
export function jobBillLoggedHoursNotBilledNote(totalHours: number): string | null {
  if (totalHours <= 0) return null;
  return `${formatLabourHoursOneDecimal(totalHours)} h logged on this job, not billed (quote covers labour)`;
}

export function isJobCostLabourLine(cost: JobBillCostLine): boolean {
  if (cost.cost_type === 'labor') return true;
  if (cost.timesheet_entry_id) return true;
  const nature = (cost.charge_type ?? '').trim().toLowerCase();
  return nature === 'labour' || nature === 'labor';
}

export function jobBillInvoiceLineSubtotal(lines: InvoiceLineItem[]): number {
  return lines.reduce((sum, li) => sum + li.quantity * li.unit_price, 0);
}

export function labourInvoiceLinesFromJobCosts(
  costs: JobBillCostLine[],
  labourSell: LabourSellResolution,
): InvoiceLineItem[] {
  const labourCosts = costs.filter(isJobCostLabourLine);
  return invoiceLinesWithLabourPriceBook(
    invoiceLinesFromJobCosts(labourCosts),
    labourSell,
  );
}

export function planJobBillInvoiceLinesFromCosts(input: {
  quoteLineItems: QuoteLineItem[] | null | undefined;
  costs: JobBillCostLine[];
  includeLoggedHoursExtra: boolean;
  labourSell: LabourSellResolution;
}): InvoiceLineItem[] {
  const quoteLines = invoiceLinesFromQuote(input.quoteLineItems);
  if (quoteLines.length > 0) {
    if (!input.includeLoggedHoursExtra) return quoteLines;
    return [...quoteLines, ...labourInvoiceLinesFromJobCosts(input.costs, input.labourSell)];
  }
  return invoiceLinesWithLabourPriceBook(
    invoiceLinesFromJobCosts(input.costs),
    input.labourSell,
  );
}

export function jobBillInvoicePreviewFromLines(lines: InvoiceLineItem[]): {
  lineCount: number;
  subtotal: number;
  detail: string;
} {
  const lineCount = lines.length;
  const subtotal = jobBillInvoiceLineSubtotal(lines);
  return {
    lineCount,
    subtotal,
    detail: jobBillInvoiceNextDetail(lineCount, subtotal),
  };
}

/** Quoted-job invoice sheet — quote-only wording, or full plan detail when extra hours are on. */
export function jobBillQuotedInvoiceSheetMoneyLine(input: {
  quoteLineItems: QuoteLineItem[] | null | undefined;
  costs: JobBillCostLine[];
  includeLoggedHoursExtra: boolean;
  labourSell: LabourSellResolution;
}): string {
  const quoteLines = invoiceLinesFromQuote(input.quoteLineItems);
  const quoteCount = quoteLines.length;
  const quoteSubtotal = jobBillInvoiceLineSubtotal(quoteLines);
  if (!input.includeLoggedHoursExtra) {
    return `${quoteCount} quote ${quoteCount === 1 ? 'line' : 'lines'} · ${formatMoney(quoteSubtotal)}`;
  }
  const lines = planJobBillInvoiceLinesFromCosts(input);
  return jobBillInvoicePreviewFromLines(lines).detail;
}

export function quotedJobBillInvoiceHasLines(
  quoteLineItems: QuoteLineItem[] | null | undefined,
  costs: JobBillCostLine[],
  includeLoggedHoursExtra: boolean,
): boolean {
  const quoteLines = invoiceLinesFromQuote(quoteLineItems);
  if (quoteLines.length > 0) return true;
  if (includeLoggedHoursExtra && costs.some(isJobCostLabourLine)) return true;
  return invoiceLinesFromJobCosts(costs).length > 0;
}

export function zeroLabourLineCountForInvoicePlan(input: {
  hasAcceptedQuote: boolean;
  includeLoggedHoursExtra: boolean;
  fullZeroCount: number;
}): number {
  if (input.hasAcceptedQuote && !input.includeLoggedHoursExtra) return 0;
  return input.fullZeroCount;
}

export function invoiceLineLooksLikeZeroLabour(line: InvoiceLineItem): boolean {
  return lineNeedsLabourRate(line) || (
    ((line.charge_type ?? '').trim().toLowerCase() === 'labour'
      || (line.charge_type ?? '').trim().toLowerCase() === 'labor')
    && (Number(line.unit_price) || 0) === 0
  );
}
