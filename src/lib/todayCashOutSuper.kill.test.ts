import { describe, expect, it } from 'vitest';
import { sumCashOut, todayCashWindow, type TodayExpenseRow } from './todayBoard';

const TODAY = '2026-10-19';

describe('C10 Out super', () => {
  it('kills a mutant that includes super in Out', () => {
    const { from, to } = todayCashWindow(TODAY);
    const superLine: TodayExpenseRow = {
      total: 500,
      expense_date: '2026-10-18',
      status: 'paid',
      cost_class: 'employee',
      employee_cost_type: 'super',
    };
    const materials: TodayExpenseRow = {
      total: 1862.75,
      expense_date: '2026-10-18',
      status: 'recorded',
      cost_class: 'cogs',
    };
    expect(sumCashOut([superLine], from, to)).toBe(0);
    expect(sumCashOut([superLine, materials], from, to)).toBe(1862.75);
    expect(sumCashOut([superLine, materials], from, to)).not.toBe(2362.75);
  });
});
