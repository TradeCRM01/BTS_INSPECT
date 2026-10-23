import { describe, expect, it } from 'vitest';
import { sumCashOut, todayCashWindow, type TodayExpenseRow } from './todayBoard';

const TODAY = '2026-10-19';

describe('C10 Out wages', () => {
  it('kills a mutant that includes wages in Out', () => {
    const { from, to } = todayCashWindow(TODAY);
    const wages: TodayExpenseRow = {
      total: 800,
      expense_date: '2026-10-18',
      status: 'paid',
      cost_class: 'employee',
      employee_cost_type: 'wages',
    };
    const materials: TodayExpenseRow = {
      total: 1862.75,
      expense_date: '2026-10-18',
      status: 'recorded',
      cost_class: 'cogs',
    };
    expect(sumCashOut([wages], from, to)).toBe(0);
    expect(sumCashOut([wages, materials], from, to)).toBe(1862.75);
    expect(sumCashOut([wages, materials], from, to)).not.toBe(2662.75);
  });
});
