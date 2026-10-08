import { describe, expect, it } from 'vitest';
import {
  JOB_BILL_ADD_LOGGED_HOURS_EXTRA_LABEL,
  jobBillInvoiceMoneyLineIncGst,
  jobBillInvoicePreviewFromLines,
  jobBillLoggedHoursNotBilledNote,
  planJobBillInvoiceLines,
  zeroLabourLineCountForInvoicePlan,
} from './jobBillInvoicePlan';
import { buildInvoiceFromJobBill } from './invoiceFromJobBill';
import type { LabourSellResolution } from './hoursToJobBill';
import type { JobCostFromHoursInsert } from './hoursToJobBill';

const labourSell: LabourSellResolution = {
  unitPrice: 95,
  priceBookItemId: 'pb-1',
  needsRate: false,
  needsPicker: false,
  pickerItems: [],
};

const quoteLines = [
  { description: 'Call-out fee', quantity: 1, unit_price: 180, gst_rate: 10 },
  { description: 'Re-pipe kitchen', quantity: 1, unit_price: 700, gst_rate: 0 },
];

const quoteCopiedLabourOnBill = {
  cost_type: 'labor',
  charge_type: 'Labour',
  description: 'Labour 4 h @ $95',
  quantity: 4,
  unit_price: 95,
  unit_cost: 45,
  markup_percent: 0,
};

const plannedTimesheetExtra: JobCostFromHoursInsert = {
  company_id: 'co',
  job_id: 'job',
  cost_type: 'labor',
  description: 'Labour 3.5 h @ $95',
  quantity: 3.5,
  unit_cost: 45,
  total_cost: 157.5,
  markup_percent: 0,
  unit_price: 95,
  total_price: 332.5,
  charge_type: 'Labour',
  stock_item_id: null,
  purchase_order_id: null,
  cost_model_id: null,
  created_by: 'user',
  timesheet_entry_id: 'ts-extra',
};

describe('quoted job invoice lines', () => {
  it('bills quote lines only without opt-in', () => {
    const lines = planJobBillInvoiceLines({
      quoteLineItems: quoteLines,
      costs: [quoteCopiedLabourOnBill],
      plannedLabourPull: [plannedTimesheetExtra],
      includeLoggedHoursExtra: false,
      labourSell,
    });
    expect(lines.map(li => li.description)).toEqual(['Call-out fee', 'Re-pipe kitchen']);
  });

  it('shows exact logged-hours note copy', () => {
    expect(jobBillLoggedHoursNotBilledNote(0)).toBeNull();
    expect(jobBillLoggedHoursNotBilledNote(0.04)).toBeNull();
    expect(jobBillLoggedHoursNotBilledNote(3.5))
      .toBe('3.5 h logged on this job, not billed (quote covers labour)');
    expect(jobBillLoggedHoursNotBilledNote(3.5, true))
      .toBe('3.5 h logged on this job, added as extra');
  });

  it('opt-in adds timesheet hours only — not quote-copied labour on the bill', () => {
    const lines = planJobBillInvoiceLines({
      quoteLineItems: quoteLines,
      costs: [quoteCopiedLabourOnBill],
      plannedLabourPull: [plannedTimesheetExtra],
      includeLoggedHoursExtra: true,
      labourSell,
    });
    expect(lines).toHaveLength(3);
    const labourLines = lines.filter(li => /labour/i.test(li.description));
    expect(labourLines).toHaveLength(1);
    expect(labourLines[0].quantity).toBe(3.5);
  });

  it('money line and created invoice total inc GST match with per-line GST', () => {
    const planInput = {
      quoteNumber: 2,
      quoteLineItems: quoteLines,
      costs: [] as typeof quoteCopiedLabourOnBill[],
      plannedLabourPull: [] as JobCostFromHoursInsert[],
      includeLoggedHoursExtra: false,
      labourSell,
      taxRate: 10,
    };
    const lines = planJobBillInvoiceLines({
      quoteLineItems: planInput.quoteLineItems,
      costs: planInput.costs,
      plannedLabourPull: planInput.plannedLabourPull,
      includeLoggedHoursExtra: false,
      labourSell,
    });
    const preview = jobBillInvoicePreviewFromLines(lines, 10, planInput);
    const moneyLine = jobBillInvoiceMoneyLineIncGst(planInput);
    expect(moneyLine).toBe('Quote #0002 · 2 lines · $898.00 inc GST');
    expect(preview.moneyLine).toBe(moneyLine);
    const inv = buildInvoiceFromJobBill({
      clientId: 'client-1',
      jobId: 'job-1',
      taxRate: 10,
      lines,
    });
    expect(inv.total).toBe(898);
    expect(preview.totalIncGst).toBe(898);
  });

  it('quoted opt-in with no rate sets unpriced flag and no rate set money line', () => {
    const needsRateSell: LabourSellResolution = {
      unitPrice: 0,
      priceBookItemId: null,
      needsRate: true,
      needsPicker: false,
      pickerItems: [],
    };
    const plannedZero: JobCostFromHoursInsert = {
      ...plannedTimesheetExtra,
      unit_price: 0,
      total_price: 0,
      description: 'Labour 3.5 h @ $0',
    };
    const lines = planJobBillInvoiceLines({
      quoteLineItems: quoteLines,
      costs: [],
      plannedLabourPull: [plannedZero],
      includeLoggedHoursExtra: true,
      labourSell: needsRateSell,
    });
    const preview = jobBillInvoicePreviewFromLines(lines, 10, {
      quoteNumber: 2,
      quoteLineItems: quoteLines,
      costs: [],
      plannedLabourPull: [plannedZero],
      includeLoggedHoursExtra: true,
      labourSell: needsRateSell,
    });
    expect(preview.unpricedExtraLabour).toBe(true);
    expect(preview.moneyLine).toContain('no rate set');
    expect(preview.moneyLine).toContain('$898.00 inc GST');
    expect(preview.moneyLine).toBe('Quote #0002 + 3.5 h extra · no rate set · 3 lines · $898.00 inc GST');
    const inv = buildInvoiceFromJobBill({
      clientId: 'c',
      jobId: 'j',
      taxRate: 10,
      lines,
    });
    expect(preview.totalIncGst).toBe(inv.total);
    expect(preview.totalIncGst).toBe(898);
  });

  it('quoted opt-in with price-book rate does not warn when bill labour row is $0', () => {
    const zeroOnBill = {
      cost_type: 'labor',
      charge_type: 'Labour',
      description: 'Labour 3.5 h @ $0',
      quantity: 3.5,
      unit_price: 0,
      unit_cost: 45,
      markup_percent: 0,
      timesheet_entry_id: 'ts-extra',
    };
    const lines = planJobBillInvoiceLines({
      quoteLineItems: quoteLines,
      costs: [zeroOnBill],
      plannedLabourPull: [],
      includeLoggedHoursExtra: true,
      labourSell,
    });
    const preview = jobBillInvoicePreviewFromLines(lines, 10, {
      quoteNumber: 2,
      quoteLineItems: quoteLines,
      costs: [zeroOnBill],
      plannedLabourPull: [],
      includeLoggedHoursExtra: true,
      labourSell,
    });
    expect(preview.unpricedExtraLabour).toBe(false);
    expect(preview.moneyLine).not.toContain('no rate set');
    expect(preview.totalIncGst).toBe(1263.75);
    const inv = buildInvoiceFromJobBill({
      clientId: 'c',
      jobId: 'j',
      taxRate: 10,
      lines,
    });
    expect(preview.totalIncGst).toBe(inv.total);
  });

  it('quoted + opt-in preview total matches create total', () => {
    const lines = planJobBillInvoiceLines({
      quoteLineItems: quoteLines,
      costs: [quoteCopiedLabourOnBill],
      plannedLabourPull: [plannedTimesheetExtra],
      includeLoggedHoursExtra: true,
      labourSell,
    });
    const preview = jobBillInvoicePreviewFromLines(lines, 10, {
      quoteNumber: 2,
      quoteLineItems: quoteLines,
      costs: [quoteCopiedLabourOnBill],
      plannedLabourPull: [plannedTimesheetExtra],
      includeLoggedHoursExtra: true,
      labourSell,
    });
    const inv = buildInvoiceFromJobBill({
      clientId: 'c',
      jobId: 'j',
      taxRate: 10,
      lines,
    });
    expect(preview.totalIncGst).toBe(inv.total);
    expect(preview.moneyLine).toContain('+ 3.5 h extra');
  });

  it('unquoted builds lines from timesheets only before pull', () => {
    const lines = planJobBillInvoiceLines({
      quoteLineItems: null,
      costs: [],
      plannedLabourPull: [plannedTimesheetExtra],
      includeLoggedHoursExtra: false,
      labourSell,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0].quantity).toBe(3.5);
    const preview = jobBillInvoicePreviewFromLines(lines, 10, {
      quoteNumber: null,
      quoteLineItems: null,
      costs: [],
      plannedLabourPull: [plannedTimesheetExtra],
      includeLoggedHoursExtra: false,
      labourSell,
    });
    const inv = buildInvoiceFromJobBill({
      clientId: 'c',
      jobId: 'j',
      taxRate: 10,
      lines,
    });
    expect(preview.totalIncGst).toBe(inv.total);
    expect(preview.moneyLine).toMatch(/^From job · 1 line · \$[\d,.]+ inc GST$/);
  });

  it('skips zero-labour confirm when quote-only', () => {
    expect(zeroLabourLineCountForInvoicePlan({
      hasAcceptedQuote: true,
      includeLoggedHoursExtra: false,
      fullZeroCount: 2,
    })).toBe(0);
    expect(zeroLabourLineCountForInvoicePlan({
      hasAcceptedQuote: true,
      includeLoggedHoursExtra: true,
      fullZeroCount: 2,
    })).toBe(2);
  });

  it('exposes opt-in label', () => {
    expect(JOB_BILL_ADD_LOGGED_HOURS_EXTRA_LABEL).toBe('Add logged hours as extra');
  });

  it('zero-rate labour bills $0 inc GST with description @ $0', () => {
    const plannedTimesheetZero: JobCostFromHoursInsert = {
      ...plannedTimesheetExtra,
      description: 'Labour 3.5 h @ $0',
      unit_price: 0,
      total_price: 0,
    };
    const zeroSell: LabourSellResolution = {
      unitPrice: 0,
      priceBookItemId: null,
      needsRate: true,
      needsPicker: false,
      pickerItems: [],
    };
    const lines = planJobBillInvoiceLines({
      quoteLineItems: null,
      costs: [],
      plannedLabourPull: [plannedTimesheetZero],
      includeLoggedHoursExtra: false,
      labourSell: zeroSell,
    });
    expect(lines[0].unit_price).toBe(0);
    expect(lines[0].description).toBe('Labour 3.5 h @ $0');
    const inv = buildInvoiceFromJobBill({
      clientId: 'c',
      jobId: 'j',
      taxRate: 10,
      lines,
    });
    expect(inv.total).toBe(0);
  });
});
