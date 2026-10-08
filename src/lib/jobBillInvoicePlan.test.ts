import { describe, expect, it } from 'vitest';
import {
  JOB_BILL_ADD_LOGGED_HOURS_EXTRA_LABEL,
  jobBillInvoicePreviewFromLines,
  jobBillLoggedHoursNotBilledNote,
  planJobBillInvoiceLinesFromCosts,
  zeroLabourLineCountForInvoicePlan,
} from './jobBillInvoicePlan';
import { jobBillInvoiceNextDetail } from './invoiceFromJobBill';
import type { LabourSellResolution } from './hoursToJobBill';

const labourSell: LabourSellResolution = {
  unitPrice: 95,
  priceBookItemId: 'pb-1',
  needsRate: false,
  needsPicker: false,
  pickerItems: [],
};

describe('quoted job invoice lines', () => {
  const quoteLines = [
    { description: 'Call-out fee', quantity: 1, unit_price: 180 },
    { description: 'Re-pipe kitchen', quantity: 1, unit_price: 700 },
  ];

  const labourCost = {
    cost_type: 'labor',
    charge_type: 'Labour',
    description: 'Labour 3.5 h @ $95',
    quantity: 3.5,
    unit_price: 95,
    unit_cost: 45,
    markup_percent: 0,
  };

  it('bills quote lines only without opt-in', () => {
    const lines = planJobBillInvoiceLinesFromCosts({
      quoteLineItems: quoteLines,
      costs: [labourCost],
      includeLoggedHoursExtra: false,
      labourSell,
    });
    expect(lines.map(li => li.description)).toEqual(['Call-out fee', 'Re-pipe kitchen']);
    expect(lines.some(li => /labour/i.test(li.description))).toBe(false);
  });

  it('shows exact logged-hours note copy', () => {
    expect(jobBillLoggedHoursNotBilledNote(0)).toBeNull();
    expect(jobBillLoggedHoursNotBilledNote(3.5))
      .toBe('3.5 h logged on this job, not billed (quote covers labour)');
  });

  it('opt-in adds labour lines on top of quote lines', () => {
    const lines = planJobBillInvoiceLinesFromCosts({
      quoteLineItems: quoteLines,
      costs: [labourCost],
      includeLoggedHoursExtra: true,
      labourSell,
    });
    expect(lines).toHaveLength(3);
    expect(lines[2].description).toContain('Labour');
    expect(lines[2].quantity).toBe(3.5);
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
});

describe('invoice subtitle matches line subtotal', () => {
  const quoteLines = [{ description: 'Call-out fee', quantity: 1, unit_price: 180 }];

  it('quoted only', () => {
    const lines = planJobBillInvoiceLinesFromCosts({
      quoteLineItems: quoteLines,
      costs: [],
      includeLoggedHoursExtra: false,
      labourSell,
    });
    const preview = jobBillInvoicePreviewFromLines(lines);
    expect(preview.detail).toBe(jobBillInvoiceNextDetail(1, 180));
    expect(preview.subtotal).toBe(180);
  });

  it('quoted + opt-in labour', () => {
    const lines = planJobBillInvoiceLinesFromCosts({
      quoteLineItems: quoteLines,
      costs: [{
        cost_type: 'labor',
        charge_type: 'Labour',
        description: 'Labour 2.0 h @ $95',
        quantity: 2,
        unit_price: 95,
        unit_cost: 40,
      }],
      includeLoggedHoursExtra: true,
      labourSell,
    });
    const preview = jobBillInvoicePreviewFromLines(lines);
    expect(preview.subtotal).toBe(180 + 190);
    expect(preview.detail).toBe(jobBillInvoiceNextDetail(2, 370));
  });

  it('unquoted job bill', () => {
    const lines = planJobBillInvoiceLinesFromCosts({
      quoteLineItems: null,
      costs: [{
        charge_type: 'Materials',
        description: 'Copper pipe',
        quantity: 4,
        unit_price: 25,
        unit_cost: 18,
      }],
      includeLoggedHoursExtra: false,
      labourSell,
    });
    const preview = jobBillInvoicePreviewFromLines(lines);
    expect(preview.subtotal).toBe(100);
    expect(preview.detail).toBe(jobBillInvoiceNextDetail(1, 100));
  });

  it('zero-rate labour on unquoted path keeps full zero count', () => {
    expect(zeroLabourLineCountForInvoicePlan({
      hasAcceptedQuote: false,
      includeLoggedHoursExtra: false,
      fullZeroCount: 1,
    })).toBe(1);
  });
});
