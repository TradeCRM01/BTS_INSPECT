import { describe, expect, it } from 'vitest';
import { jobBillInvoiceMoneyLineIncGst, planJobBillInvoiceLines, jobBillInvoicePreviewFromLines } from './jobBillInvoicePlan';
import { jobOpenNext, recommendJobAction } from './jobNextAction';
import type { LabourSellResolution } from './hoursToJobBill';

const labourSell: LabourSellResolution = {
  unitPrice: 95,
  priceBookItemId: 'pb-1',
  needsRate: false,
  needsPicker: false,
  pickerItems: [],
};

describe('invoice header and sheet money line', () => {
  const quoteLines = [
    { description: 'Call-out fee', quantity: 1, unit_price: 180, gst_rate: 10 },
    { description: 'Re-pipe kitchen', quantity: 1, unit_price: 700, gst_rate: 0 },
  ];

  it('uses the same inc-GST string for recommendJobAction and the sheet formatter', () => {
    const moneyInput = {
      quoteNumber: 2,
      quoteLineItems: quoteLines,
      costs: [],
      plannedLabourPull: [],
      includeLoggedHoursExtra: false,
      labourSell,
      taxRate: 10,
    };
    const sheetLine = jobBillInvoiceMoneyLineIncGst(moneyInput);
    const lines = planJobBillInvoiceLines({
      quoteLineItems: quoteLines,
      costs: [],
      plannedLabourPull: [],
      includeLoggedHoursExtra: false,
      labourSell,
    });
    const preview = jobBillInvoicePreviewFromLines(lines, 10, moneyInput);
    expect(preview.moneyLine).toBe(sheetLine);

    const action = recommendJobAction({
      status: 'completed',
      scheduledDate: '2026-10-01',
      crewCount: 1,
      jhaCount: 1,
      inspectionCount: 1,
      invoiceCount: 0,
      hasAcceptedQuote: true,
      hasBillLines: true,
      billLineCount: preview.lineCount,
      billTotal: preview.totalIncGst,
      billInvoiceMoneyLine: preview.moneyLine,
      clockedOn: false,
      clockedOff: true,
    });
    expect(action.detail).toBe(sheetLine);

    const open = jobOpenNext(
      { id: 'job-1', status: 'completed', scheduled_date: '2026-10-01', assigned_team: ['a'] },
      {
        jhaCount: 1,
        inspectionCount: 1,
        invoiceCount: 0,
        hasAcceptedQuote: true,
        hasBillLines: true,
        billLineCount: preview.lineCount,
        billTotal: preview.totalIncGst,
        billInvoiceMoneyLine: preview.moneyLine,
        clockedOn: false,
        clockedOff: true,
      },
    );
    expect(open.action.detail).toBe(sheetLine);
  });
});
