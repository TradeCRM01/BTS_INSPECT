import { describe, expect, it } from 'vitest';
import {
  modelHourlyCost,
  modelLineAmountForPeriod,
} from '../components/expenses/ExpenseModelsModals';
import { committedNumber } from './parseDecimal';
import type { ExpenseCostModel, ExpenseCostModelLine } from '../types/fsm';

const wagesLine: ExpenseCostModelLine = {
  employee_cost_type: 'wages',
  category: 'Wages',
  description: 'Base wage',
  amount: 52,
  amount_mode: 'hours_x_rate',
  time_unit: 'hourly',
  tax_rate: 0,
};

const monthlyModel = {
  billing_period: 'monthly',
  lines: [wagesLine],
} as Pick<ExpenseCostModel, 'lines' | 'billing_period'>;

describe('employee cost model wage override', () => {
  it('uses a wage override of 60 so the monthly post is $9,120 not $7,904', () => {
    expect(modelHourlyCost(monthlyModel)).toBe(52);
    expect(modelHourlyCost(monthlyModel, 60)).toBe(60);
    expect(modelLineAmountForPeriod(wagesLine, 'monthly', undefined, monthlyModel.lines)).toBe(7904);
    expect(modelLineAmountForPeriod(wagesLine, 'monthly', 60, monthlyModel.lines)).toBe(9120);
    expect(modelHourlyCost(monthlyModel, 60) * 152).toBe(9120);
  });

  it('parses multiplier 1,5 as 1.5 so the package does not jump to ×15', () => {
    expect(committedNumber('1,5')).toBe(1.5);
    expect(modelHourlyCost(monthlyModel, 60) * 152 * (committedNumber('1,5') ?? 0)).toBe(13680);
    expect(committedNumber('1,5')).not.toBe(15);
  });
});
