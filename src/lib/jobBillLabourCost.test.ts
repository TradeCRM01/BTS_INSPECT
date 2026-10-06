import { describe, expect, it } from 'vitest';
import {
  JOB_BILL_INCOMPLETE_MARGIN_LABEL,
  JOB_BILL_NO_COST_RATE_LABEL,
  jobBillCostCellDisplay,
  jobBillGrossProfit,
  jobBillHasIncompleteLabourCost,
  lineMissingLabourCostSource,
} from './jobBillLabourCost';

describe('lineMissingLabourCostSource', () => {
  it('flags labour with zero cost and no model', () => {
    expect(lineMissingLabourCostSource({
      cost_type: 'labor',
      unit_cost: 0,
      cost_model_id: null,
    })).toBe(true);
    expect(lineMissingLabourCostSource({
      cost_type: 'materials',
      unit_cost: 0,
      cost_model_id: null,
    })).toBe(false);
    expect(lineMissingLabourCostSource({
      cost_type: 'labor',
      unit_cost: 42,
      cost_model_id: null,
    })).toBe(false);
    expect(lineMissingLabourCostSource({
      cost_type: 'labor',
      unit_cost: 0,
      cost_model_id: 'm1',
    })).toBe(false);
  });
});

describe('jobBillCostCellDisplay', () => {
  it('shows amber label text instead of money when no cost source', () => {
    expect(jobBillCostCellDisplay({
      cost_type: 'labor',
      unit_cost: 0,
      cost_model_id: null,
    })).toEqual({ kind: 'no_cost_rate' });
    expect(JOB_BILL_NO_COST_RATE_LABEL).toBe('No cost rate');
  });

  it('keeps money display for materials at zero', () => {
    expect(jobBillCostCellDisplay({
      cost_type: 'materials',
      unit_cost: 0,
      cost_model_id: null,
    })).toEqual({ kind: 'money', value: 0 });
  });
});

describe('jobBillHasIncompleteLabourCost', () => {
  it('drives incomplete margin tag', () => {
    expect(jobBillHasIncompleteLabourCost([
      { cost_type: 'labor', unit_cost: 0, cost_model_id: null },
    ])).toBe(true);
    expect(jobBillHasIncompleteLabourCost([
      { cost_type: 'labor', unit_cost: 50, cost_model_id: 'm1' },
    ])).toBe(false);
    expect(JOB_BILL_INCOMPLETE_MARGIN_LABEL).toBe('incomplete');
    expect(jobBillGrossProfit(190, 0)).toBe(190);
  });
});
