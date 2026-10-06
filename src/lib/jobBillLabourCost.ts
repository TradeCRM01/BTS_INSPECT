/** Job bill labour unit_cost honesty (COST-2). */

export const JOB_BILL_NO_COST_RATE_LABEL = 'No cost rate';
export const JOB_BILL_INCOMPLETE_MARGIN_LABEL = 'incomplete';

export type JobBillCostLine = {
  cost_type?: string | null;
  charge_type?: string | null;
  unit_cost?: number | string | null;
  cost_model_id?: string | null;
};

export function isLabourJobBillLine(line: JobBillCostLine): boolean {
  if (line.cost_type === 'labor') return true;
  const nature = (line.charge_type ?? '').trim().toLowerCase();
  return nature === 'labour' || nature === 'labor';
}

/** Labour line with no model link and zero unit cost — show amber label, not $0.00. */
export function lineMissingLabourCostSource(line: JobBillCostLine): boolean {
  if (!isLabourJobBillLine(line)) return false;
  const unitCost = Number(line.unit_cost) || 0;
  if (unitCost > 0) return false;
  return !line.cost_model_id;
}

export function jobBillHasIncompleteLabourCost(lines: JobBillCostLine[]): boolean {
  return lines.some(lineMissingLabourCostSource);
}

export function jobBillCostCellDisplay(line: JobBillCostLine): { kind: 'money'; value: number } | { kind: 'no_cost_rate' } {
  if (lineMissingLabourCostSource(line)) return { kind: 'no_cost_rate' };
  return { kind: 'money', value: Number(line.unit_cost) || 0 };
}

export function jobBillGrossProfit(chargeTotal: number, costTotal: number): number {
  return Number((chargeTotal - costTotal).toFixed(2));
}
