import type { SupabaseClient } from '@supabase/supabase-js';
import { entryMinutes } from './timesheetJob';
import type { ExpenseCostModel } from '../types/fsm';
import type { InvoiceLineItem } from '../types/fsm';
import { modelHourlyCost, normalizeCostModel } from '../components/expenses/ExpenseModelsModals';

export type TimesheetEntryForBill = {
  id: string;
  job_id: string | null;
  timesheet_id: string;
  start_time: string;
  end_time: string | null;
  billable: boolean;
  work_type: string | null;
  notes: string | null;
};

export type PriceBookItemForLabour = {
  id: string;
  category: string | null;
  unit_price: number | string;
  is_active: boolean;
};

export type LabourSellResolution = {
  unitPrice: number;
  priceBookItemId: string | null;
  needsRate: boolean;
};

export type JobCostFromHoursInsert = {
  company_id: string;
  job_id: string;
  cost_type: 'labor';
  description: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  markup_percent: number;
  unit_price: number;
  total_price: number;
  charge_type: string;
  stock_item_id: null;
  purchase_order_id: null;
  cost_model_id: string | null;
  created_by: string;
  timesheet_entry_id?: string;
};

let warnedTimesheetColumnMissing = false;

export function isSchemaColumnMissingError(error: unknown, column: string): boolean {
  const msg = error && typeof error === 'object' && 'message' in error
    ? String((error as { message: string }).message)
    : String(error ?? '');
  return new RegExp(column, 'i').test(msg)
    && /(schema cache|column|does not exist|Could not find)/i.test(msg);
}

export function isLabourCategory(category: string | null | undefined): boolean {
  const cat = (category ?? '').trim().toLowerCase();
  return cat === 'labour' || cat === 'labor';
}

/** Sell from price book category Labour/Labor only — never cost × markup. */
export function resolveLabourSellFromPriceBook(
  items: PriceBookItemForLabour[] | null | undefined,
): LabourSellResolution {
  const active = (items ?? []).filter(i => i.is_active !== false);
  const labour = active.filter(i => isLabourCategory(i.category));
  if (labour.length === 1) {
    const unitPrice = Number(labour[0].unit_price) || 0;
    return {
      unitPrice,
      priceBookItemId: labour[0].id,
      needsRate: false,
    };
  }
  return { unitPrice: 0, priceBookItemId: null, needsRate: true };
}

export function lineNeedsLabourRate(line: {
  charge_type?: string | null;
  unit_price?: number | string | null;
}): boolean {
  const nature = (line.charge_type ?? '').trim().toLowerCase();
  if (nature !== 'labour' && nature !== 'labor') return false;
  return (Number(line.unit_price) || 0) === 0;
}

export function hourlyUnitCostForEmployee(
  employeeId: string,
  models: ExpenseCostModel[],
  profileRows: Array<{ id: string; expense_cost_model_id?: string | null }>,
): { unitCost: number; costModelId: string | null } {
  const row = profileRows.find(p => p.id === employeeId);
  const modelId = row?.expense_cost_model_id ?? null;
  if (!modelId) return { unitCost: 0, costModelId: null };
  const model = models.find(m => m.id === modelId);
  if (!model) return { unitCost: 0, costModelId: null };
  const unitCost = modelHourlyCost(model);
  return { unitCost, costModelId: modelId };
}

export function closedBillableEntries(
  entries: TimesheetEntryForBill[],
): TimesheetEntryForBill[] {
  return entries.filter(e => e.billable && e.end_time != null && e.job_id);
}

export function unbilledHoursSummary(
  entries: TimesheetEntryForBill[],
  billedEntryIds: ReadonlySet<string>,
): { hours: number; entryCount: number } {
  let minutes = 0;
  let entryCount = 0;
  for (const e of closedBillableEntries(entries)) {
    if (billedEntryIds.has(e.id)) continue;
    minutes += entryMinutes(e.start_time, e.end_time);
    entryCount += 1;
  }
  return { hours: minutes / 60, entryCount };
}

export function formatUnbilledHoursLabel(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  const text = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
  return `${text} h logged not on the bill`;
}

export function labourPullToastMessage(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  const text = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
  return `Added ${text} h labour from logged time`;
}

export function buildJobCostFromTimesheetEntry(args: {
  entry: TimesheetEntryForBill;
  companyId: string;
  jobId: string;
  createdBy: string;
  unitCost: number;
  costModelId: string | null;
  sell: LabourSellResolution;
  includeTimesheetLink: boolean;
}): JobCostFromHoursInsert {
  const hours = entryMinutes(args.entry.start_time, args.entry.end_time) / 60;
  const qty = Math.round(hours * 1000) / 1000;
  const unitCost = Number(args.unitCost) || 0;
  const unitPrice = args.sell.needsRate ? 0 : args.sell.unitPrice;
  const work = (args.entry.work_type ?? '').trim() || 'Labour';
  const description = args.entry.notes?.trim()
    ? `${work} — ${args.entry.notes.trim()}`
    : work;
  const row: JobCostFromHoursInsert = {
    company_id: args.companyId,
    job_id: args.jobId,
    cost_type: 'labor',
    description,
    quantity: qty,
    unit_cost: unitCost,
    total_cost: Number((qty * unitCost).toFixed(2)),
    markup_percent: 0,
    unit_price: unitPrice,
    total_price: Number((qty * unitPrice).toFixed(2)),
    charge_type: 'Labour',
    stock_item_id: null,
    purchase_order_id: null,
    cost_model_id: args.costModelId,
    created_by: args.createdBy,
  };
  if (args.includeTimesheetLink) {
    row.timesheet_entry_id = args.entry.id;
  }
  return row;
}

export function planJobCostsFromTimesheetEntries(args: {
  entries: TimesheetEntryForBill[];
  billedEntryIds: ReadonlySet<string>;
  companyId: string;
  jobId: string;
  createdBy: string;
  employeeIdByTimesheetId: Record<string, string>;
  profileRows: Array<{ id: string; expense_cost_model_id?: string | null }>;
  costModels: ExpenseCostModel[];
  sell: LabourSellResolution;
  includeTimesheetLink: boolean;
}): JobCostFromHoursInsert[] {
  const out: JobCostFromHoursInsert[] = [];
  for (const entry of closedBillableEntries(args.entries)) {
    if (entry.job_id !== args.jobId) continue;
    if (args.billedEntryIds.has(entry.id)) continue;
    const employeeId = args.employeeIdByTimesheetId[entry.timesheet_id];
    const { unitCost, costModelId } = employeeId
      ? hourlyUnitCostForEmployee(employeeId, args.costModels, args.profileRows)
      : { unitCost: 0, costModelId: null };
    out.push(buildJobCostFromTimesheetEntry({
      entry,
      companyId: args.companyId,
      jobId: args.jobId,
      createdBy: args.createdBy,
      unitCost,
      costModelId,
      sell: args.sell,
      includeTimesheetLink: args.includeTimesheetLink,
    }));
  }
  return out;
}

export function invoiceLinesWithLabourPriceBook(
  lines: InvoiceLineItem[],
  sell: LabourSellResolution,
): InvoiceLineItem[] {
  return lines.map(li => {
    if (!lineNeedsLabourRate(li)) return li;
    if (sell.needsRate || !sell.priceBookItemId) return li;
    return {
      ...li,
      unit_price: sell.unitPrice,
      price_book_item_id: sell.priceBookItemId,
    };
  });
}

export async function loadBilledTimesheetEntryIds(
  client: SupabaseClient,
  jobId: string,
): Promise<{ ids: Set<string>; columnMissing: boolean }> {
  const { data, error } = await client
    .from('job_costs')
    .select('timesheet_entry_id')
    .eq('job_id', jobId)
    .not('timesheet_entry_id', 'is', null);
  if (error) {
    if (isSchemaColumnMissingError(error, 'timesheet_entry_id')) {
      if (!warnedTimesheetColumnMissing) {
        console.warn('[hoursToJobBill] job_costs.timesheet_entry_id missing — run migration 082');
        warnedTimesheetColumnMissing = true;
      }
      return { ids: new Set(), columnMissing: true };
    }
    throw error;
  }
  const ids = new Set<string>();
  for (const row of data ?? []) {
    const id = row.timesheet_entry_id as string | null;
    if (id) ids.add(id);
  }
  return { ids, columnMissing: false };
}

export async function pullUnbilledHoursToJobBill(client: SupabaseClient, input: {
  jobId: string;
  companyId: string;
  profileId: string;
}): Promise<{ inserted: number; hours: number; columnMissing: boolean; toast: string | null }> {
  const { data: entries, error: entErr } = await client
    .from('timesheet_entries')
    .select('id, job_id, timesheet_id, start_time, end_time, billable, work_type, notes')
    .eq('job_id', input.jobId);
  if (entErr) throw entErr;

  const { ids: billedEntryIds, columnMissing } = await loadBilledTimesheetEntryIds(client, input.jobId);

  const tsIds = [...new Set((entries ?? []).map(e => e.timesheet_id as string))];
  const employeeIdByTimesheetId: Record<string, string> = {};
  if (tsIds.length) {
    const { data: sheets, error: tsErr } = await client
      .from('timesheets')
      .select('id, employee_id')
      .in('id', tsIds);
    if (tsErr) throw tsErr;
    for (const row of sheets ?? []) {
      employeeIdByTimesheetId[row.id as string] = row.employee_id as string;
    }
  }

  const { data: pbItems, error: pbErr } = await client
    .from('price_book_items')
    .select('id, category, unit_price, is_active')
    .eq('company_id', input.companyId)
    .eq('is_active', true);
  if (pbErr) throw pbErr;
  const sell = resolveLabourSellFromPriceBook((pbItems ?? []) as PriceBookItemForLabour[]);

  const { data: modelsRaw, error: modelErr } = await client.from('expense_cost_models').select('*');
  if (modelErr) throw modelErr;
  const costModels = (modelsRaw ?? []).map(m => normalizeCostModel(m as Record<string, unknown>));

  let profileRows: Array<{ id: string; expense_cost_model_id?: string | null }> = [];
  const profWithModel = await client
    .from('profiles')
    .select('id, expense_cost_model_id')
    .eq('company_id', input.companyId);
  if (profWithModel.error && isSchemaColumnMissingError(profWithModel.error, 'expense_cost_model_id')) {
    const profBasic = await client.from('profiles').select('id').eq('company_id', input.companyId);
    if (profBasic.error) throw profBasic.error;
    profileRows = (profBasic.data ?? []).map(r => ({ id: r.id as string }));
  } else if (profWithModel.error) {
    throw profWithModel.error;
  } else {
    profileRows = (profWithModel.data ?? []) as Array<{ id: string; expense_cost_model_id?: string | null }>;
  }

  const planned = planJobCostsFromTimesheetEntries({
    entries: (entries ?? []) as TimesheetEntryForBill[],
    billedEntryIds,
    companyId: input.companyId,
    jobId: input.jobId,
    createdBy: input.profileId,
    employeeIdByTimesheetId,
    profileRows,
    costModels,
    sell,
    includeTimesheetLink: !columnMissing,
  });

  if (planned.length === 0) {
    return { inserted: 0, hours: 0, columnMissing, toast: null };
  }

  let inserted = 0;
  let totalHours = 0;
  for (const row of planned) {
    const { error } = await client.from('job_costs').insert(row);
    if (error) {
      if (isSchemaColumnMissingError(error, 'timesheet_entry_id')) {
        const { timesheet_entry_id: _drop, ...without } = row;
        const retry = await client.from('job_costs').insert(without);
        if (retry.error) throw retry.error;
      } else {
        throw error;
      }
    }
    inserted += 1;
    totalHours += row.quantity;
  }

  return {
    inserted,
    hours: totalHours,
    columnMissing,
    toast: inserted > 0 ? labourPullToastMessage(totalHours) : null,
  };
}

export function summarizeUnbilledForJob(
  entries: TimesheetEntryForBill[],
  billedEntryIds: ReadonlySet<string>,
): { hours: number; entryCount: number; label: string } | null {
  const { hours, entryCount } = unbilledHoursSummary(entries, billedEntryIds);
  if (entryCount === 0) return null;
  return { hours, entryCount, label: formatUnbilledHoursLabel(hours) };
}
