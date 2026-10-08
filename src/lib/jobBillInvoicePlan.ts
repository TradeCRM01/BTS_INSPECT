import type { InvoiceLineItem, QuoteLineItem } from '../types/fsm';
import { formatMoney } from '../types/fsm';
import type { JobCostFromHoursInsert, TimesheetEntryForBill } from './hoursToJobBill';
import {
  closedBillableEntries,
  formatLabourHoursOneDecimal,
  invoiceLinesWithLabourPriceBook,
  lineNeedsLabourRate,
  type LabourSellResolution,
} from './hoursToJobBill';
import { entryMinutes } from './timesheetJob';
import { invoiceLinesFromQuote } from './invoiceFromQuote';
import { padQuoteNumber } from './quoteJobFields';
import { calcLineDocumentTotals } from './gst';
import { invoiceLinesFromJobCosts, type JobBillCostLine } from './invoiceFromJobBill';

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

/** Hide note when logged hours round to 0.0 h (S1). */
export function jobBillLoggedHoursNotBilledNote(
  totalHours: number,
  includeLoggedHoursExtra = false,
): string | null {
  const label = formatLabourHoursOneDecimal(totalHours);
  if (label === '0.0' || totalHours <= 0) return null;
  if (includeLoggedHoursExtra) {
    return `${label} h logged on this job, added as extra`;
  }
  return `${label} h logged on this job, not billed (quote covers labour)`;
}

export function isJobCostLabourLine(cost: JobBillCostLine): boolean {
  if (cost.cost_type === 'labor') return true;
  if (cost.timesheet_entry_id) return true;
  const nature = (cost.charge_type ?? '').trim().toLowerCase();
  return nature === 'labour' || nature === 'labor';
}

export function jobCostFromHoursInsertToBillLine(row: JobCostFromHoursInsert): JobBillCostLine {
  return {
    description: row.description,
    quantity: row.quantity,
    unit_price: row.unit_price,
    unit_cost: row.unit_cost,
    markup_percent: row.markup_percent,
    charge_type: row.charge_type,
    stock_item_id: row.stock_item_id,
    cost_model_id: row.cost_model_id,
    cost_type: row.cost_type,
    timesheet_entry_id: row.timesheet_entry_id ?? null,
  };
}

/** Timesheet pull rows + pulled labour on the bill — never quote-copied labour without a timesheet link. */
export function quotedOptInExtraLabourCosts(
  costs: JobBillCostLine[],
  planned: JobCostFromHoursInsert[],
): JobBillCostLine[] {
  const byEntry = new Map<string, JobBillCostLine>();
  for (const row of planned) {
    const line = jobCostFromHoursInsertToBillLine(row);
    const entryId = line.timesheet_entry_id;
    if (entryId) byEntry.set(entryId, line);
    else byEntry.set(`planned-${row.description}-${row.quantity}`, line);
  }
  for (const cost of costs) {
    if (!isJobCostLabourLine(cost)) continue;
    const entryId = cost.timesheet_entry_id;
    if (!entryId) continue;
    byEntry.set(entryId, cost);
  }
  return [...byEntry.values()];
}

export function unquotedInvoiceCostLines(
  costs: JobBillCostLine[],
  planned: JobCostFromHoursInsert[],
): JobBillCostLine[] {
  const billedEntryIds = new Set(
    costs.map(c => c.timesheet_entry_id).filter((id): id is string => Boolean(id)),
  );
  const virtual = planned
    .filter(p => !p.timesheet_entry_id || !billedEntryIds.has(p.timesheet_entry_id))
    .map(jobCostFromHoursInsertToBillLine);
  return [...costs, ...virtual];
}

export function extraTimesheetHoursForQuotedOptIn(
  costs: JobBillCostLine[],
  planned: JobCostFromHoursInsert[],
): number {
  return quotedOptInExtraLabourCosts(costs, planned).reduce(
    (sum, c) => sum + (Number(c.quantity) || 0),
    0,
  );
}

export function planJobBillInvoiceLines(input: {
  quoteLineItems: QuoteLineItem[] | null | undefined;
  costs: JobBillCostLine[];
  plannedLabourPull: JobCostFromHoursInsert[];
  includeLoggedHoursExtra: boolean;
  labourSell: LabourSellResolution;
}): InvoiceLineItem[] {
  const quoteLines = invoiceLinesFromQuote(input.quoteLineItems);
  if (quoteLines.length > 0) {
    if (!input.includeLoggedHoursExtra) return quoteLines;
    const extraCosts = quotedOptInExtraLabourCosts(input.costs, input.plannedLabourPull);
    const extraLines = invoiceLinesWithLabourPriceBook(
      invoiceLinesFromJobCosts(extraCosts),
      input.labourSell,
    );
    return [...quoteLines, ...extraLines];
  }
  const merged = unquotedInvoiceCostLines(input.costs, input.plannedLabourPull);
  return invoiceLinesWithLabourPriceBook(
    invoiceLinesFromJobCosts(merged),
    input.labourSell,
  );
}

/** @deprecated use planJobBillInvoiceLines */
export function planJobBillInvoiceLinesFromCosts(input: {
  quoteLineItems: QuoteLineItem[] | null | undefined;
  costs: JobBillCostLine[];
  includeLoggedHoursExtra: boolean;
  labourSell: LabourSellResolution;
  plannedLabourPull?: JobCostFromHoursInsert[];
}): InvoiceLineItem[] {
  return planJobBillInvoiceLines({
    quoteLineItems: input.quoteLineItems,
    costs: input.costs,
    plannedLabourPull: input.plannedLabourPull ?? [],
    includeLoggedHoursExtra: input.includeLoggedHoursExtra,
    labourSell: input.labourSell,
  });
}

export function quotedOptInHasUnpricedExtraLabour(input: {
  costs: JobBillCostLine[];
  plannedLabourPull: JobCostFromHoursInsert[];
  includeLoggedHoursExtra: boolean;
  labourSell: LabourSellResolution;
}): boolean {
  if (!input.includeLoggedHoursExtra) return false;
  const extraCosts = quotedOptInExtraLabourCosts(input.costs, input.plannedLabourPull);
  if (extraCosts.length === 0) return false;
  if (input.labourSell.needsRate || input.labourSell.needsPicker) return true;
  return extraCosts.some(c => (Number(c.unit_price) || 0) === 0);
}

export function jobBillInvoiceMoneyLineIncGst(input: {
  quoteNumber: number | null | undefined;
  quoteLineItems: QuoteLineItem[] | null | undefined;
  costs: JobBillCostLine[];
  plannedLabourPull: JobCostFromHoursInsert[];
  includeLoggedHoursExtra: boolean;
  labourSell: LabourSellResolution;
  taxRate: number;
  hasUnpricedExtraLabour?: boolean;
}): string {
  const lines = planJobBillInvoiceLines({
    quoteLineItems: input.quoteLineItems,
    costs: input.costs,
    plannedLabourPull: input.plannedLabourPull,
    includeLoggedHoursExtra: input.includeLoggedHoursExtra,
    labourSell: input.labourSell,
  });
  const { total } = calcLineDocumentTotals(lines, input.taxRate);
  const lineCount = lines.length;
  const lineLabel = `${lineCount} ${lineCount === 1 ? 'line' : 'lines'}`;
  const money = `${formatMoney(total)} inc GST`;
  const quoteLines = invoiceLinesFromQuote(input.quoteLineItems);
  if (quoteLines.length > 0) {
    const quoteNo = padQuoteNumber(input.quoteNumber);
    if (input.includeLoggedHoursExtra) {
      const extraH = formatLabourHoursOneDecimal(
        extraTimesheetHoursForQuotedOptIn(input.costs, input.plannedLabourPull),
      );
      if (input.hasUnpricedExtraLabour) {
        return `Quote #${quoteNo} + ${extraH} h extra · no rate set · ${lineLabel} · ${money}`;
      }
      return `Quote #${quoteNo} + ${extraH} h extra · ${lineLabel} · ${money}`;
    }
    return `Quote #${quoteNo} · ${lineLabel} · ${money}`;
  }
  return `From job · ${lineLabel} · ${money}`;
}

export function jobBillInvoicePreviewFromLines(
  lines: InvoiceLineItem[],
  taxRate: number,
  moneyLineInput?: Omit<
    Parameters<typeof jobBillInvoiceMoneyLineIncGst>[0],
    'taxRate'
  > & { taxRate?: number },
): {
  lineCount: number;
  subtotal: number;
  taxAmount: number;
  totalIncGst: number;
  moneyLine: string;
  unpricedExtraLabour: boolean;
  /** @deprecated use moneyLine */
  detail: string;
} {
  const { subtotal, taxAmount, total } = calcLineDocumentTotals(lines, taxRate);
  const hasUnpricedExtraLabour = moneyLineInput
    ? quotedOptInHasUnpricedExtraLabour({
      costs: moneyLineInput.costs,
      plannedLabourPull: moneyLineInput.plannedLabourPull,
      includeLoggedHoursExtra: moneyLineInput.includeLoggedHoursExtra,
      labourSell: moneyLineInput.labourSell,
    })
    : false;
  const moneyLine = moneyLineInput
    ? jobBillInvoiceMoneyLineIncGst({
      ...moneyLineInput,
      taxRate,
      hasUnpricedExtraLabour,
    })
    : `From job · ${lines.length} ${lines.length === 1 ? 'line' : 'lines'} · ${formatMoney(total)} inc GST`;
  return {
    lineCount: lines.length,
    subtotal,
    taxAmount,
    totalIncGst: total,
    moneyLine,
    unpricedExtraLabour: hasUnpricedExtraLabour,
    detail: moneyLine,
  };
}

/** @deprecated use jobBillInvoiceMoneyLineIncGst */
export function jobBillQuotedInvoiceSheetMoneyLine(input: {
  quoteLineItems: QuoteLineItem[] | null | undefined;
  costs: JobBillCostLine[];
  includeLoggedHoursExtra: boolean;
  labourSell: LabourSellResolution;
  plannedLabourPull?: JobCostFromHoursInsert[];
  quoteNumber?: number | null;
  taxRate?: number;
}): string {
  return jobBillInvoiceMoneyLineIncGst({
    quoteNumber: input.quoteNumber ?? null,
    quoteLineItems: input.quoteLineItems,
    costs: input.costs,
    plannedLabourPull: input.plannedLabourPull ?? [],
    includeLoggedHoursExtra: input.includeLoggedHoursExtra,
    labourSell: input.labourSell,
    taxRate: input.taxRate ?? 10,
  });
}

export function quotedJobBillInvoiceHasLines(
  quoteLineItems: QuoteLineItem[] | null | undefined,
  costs: JobBillCostLine[],
  plannedLabourPull: JobCostFromHoursInsert[],
  includeLoggedHoursExtra: boolean,
): boolean {
  const lines = planJobBillInvoiceLines({
    quoteLineItems,
    costs,
    plannedLabourPull,
    includeLoggedHoursExtra,
    labourSell: {
      unitPrice: 0,
      priceBookItemId: null,
      needsRate: false,
      needsPicker: false,
      pickerItems: [],
    },
  });
  return lines.length > 0;
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
