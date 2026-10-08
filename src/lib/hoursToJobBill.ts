import type { QueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { invalidateJobBillInvoicePreview } from './jobBillInvoicePreviewQuery';
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
  description?: string | null;
  unit_price: number | string;
  is_active: boolean;
};

export type LabourSellResolution = {
  unitPrice: number;
  priceBookItemId: string | null;
  needsRate: boolean;
  needsPicker: boolean;
  pickerItems: PriceBookItemForLabour[];
};

export type LabourBillContext = {
  staffRatesByProfileId: Record<string, number>;
  companyDefaultLabourRate: number | null;
  labourPriceBookItems: PriceBookItemForLabour[];
  pickedPriceBookItemId: string | null;
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

/**
 * Profile columns that carry a staff labour sell rate (ex GST).
 * Add keys here when migrations land — do not invent columns in SQL.
 */
export const PROFILE_STAFF_LABOUR_RATE_KEYS: readonly string[] = [];

/** Migration 084 — per-employee default cost model for job-bill labour unit_cost. */
export const PROFILES_LABOUR_UNIT_COST_COLUMN = 'expense_cost_model_id';

let warnedTimesheetColumnMissing = false;
let warnedCompanyLabourRateColumnMissing = false;
let warnedProfileExpenseCostModelColumnMissing = false;
/** When false, skip selecting expense_cost_model_id to avoid repeated PostgREST 400s. */
let profilesLabourUnitCostColumnAvailable: boolean | null = null;

export function resetProfilesLabourUnitCostColumnCache(): void {
  profilesLabourUnitCostColumnAvailable = null;
}

export function profilesSelectForLabourBill(includeExpenseCostModelId: boolean): string {
  return includeExpenseCostModelId
    ? `id, ${PROFILES_LABOUR_UNIT_COST_COLUMN}`
    : 'id';
}

export function isSchemaColumnMissingError(error: unknown, column: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { message?: string; code?: string; details?: string; hint?: string };
  const text = [e.message, e.details, e.hint].filter(Boolean).join(' ');
  const colMatch = new RegExp(column, 'i').test(text);
  if (!colMatch) return false;
  if (e.code === 'PGRST204') return true;
  return /(schema cache|column|does not exist|Could not find)/i.test(text);
}

export async function loadProfilesForLabourBill(
  client: SupabaseClient,
  companyId: string,
): Promise<Array<{ id: string; expense_cost_model_id?: string | null }>> {
  const tryFullSelect = profilesLabourUnitCostColumnAvailable !== false;
  const select = profilesSelectForLabourBill(tryFullSelect);
  const { data, error } = await client
    .from('profiles')
    .select(select)
    .eq('company_id', companyId);

  if (!error) {
    if (tryFullSelect) profilesLabourUnitCostColumnAvailable = true;
    return (data ?? []) as unknown as Array<{ id: string; expense_cost_model_id?: string | null }>;
  }

  if (tryFullSelect && isSchemaColumnMissingError(error, PROFILES_LABOUR_UNIT_COST_COLUMN)) {
    profilesLabourUnitCostColumnAvailable = false;
    if (!warnedProfileExpenseCostModelColumnMissing) {
      console.warn(
        '[hoursToJobBill] profiles.expense_cost_model_id missing — run migration 084',
      );
      warnedProfileExpenseCostModelColumnMissing = true;
    }
    const retry = await client.from('profiles').select('id').eq('company_id', companyId);
    if (retry.error) throw retry.error;
    return (retry.data ?? []) as unknown as Array<{ id: string; expense_cost_model_id?: string | null }>;
  }

  throw error;
}

export function isLabourCategory(category: string | null | undefined): boolean {
  const cat = (category ?? '').trim().toLowerCase();
  return cat === 'labour' || cat === 'labor';
}

export function activeLabourPriceBookItems(
  items: PriceBookItemForLabour[] | null | undefined,
): PriceBookItemForLabour[] {
  return (items ?? []).filter(i => i.is_active !== false && isLabourCategory(i.category));
}

export function staffLabourSellFromProfile(
  profile: Record<string, unknown> | null | undefined,
  keys: readonly string[] = PROFILE_STAFF_LABOUR_RATE_KEYS,
): number | null {
  if (!profile) return null;
  for (const key of keys) {
    const raw = profile[key];
    if (raw == null || raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export function buildStaffLabourRatesByProfileId(
  rows: Array<Record<string, unknown>>,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const rate = staffLabourSellFromProfile(row);
    if (rate != null) out[String(row.id)] = rate;
  }
  return out;
}

/** Coach ruling: staff rate → company default → price book (picker if 2+) → $0 amber. */
export function resolveLabourSell(args: {
  staffRate: number | null;
  companyDefaultLabourRate: number | null;
  labourItems: PriceBookItemForLabour[] | null | undefined;
  pickedPriceBookItemId: string | null;
}): LabourSellResolution {
  const staff = Number(args.staffRate);
  if (Number.isFinite(staff) && staff > 0) {
    return {
      unitPrice: staff,
      priceBookItemId: null,
      needsRate: false,
      needsPicker: false,
      pickerItems: [],
    };
  }

  const companyDefault = Number(args.companyDefaultLabourRate);
  if (Number.isFinite(companyDefault) && companyDefault > 0) {
    return {
      unitPrice: companyDefault,
      priceBookItemId: null,
      needsRate: false,
      needsPicker: false,
      pickerItems: [],
    };
  }

  const labour = activeLabourPriceBookItems(args.labourItems);
  if (labour.length === 0) {
    return {
      unitPrice: 0,
      priceBookItemId: null,
      needsRate: true,
      needsPicker: false,
      pickerItems: [],
    };
  }
  if (labour.length === 1) {
    const unitPrice = Number(labour[0].unit_price) || 0;
    return {
      unitPrice,
      priceBookItemId: labour[0].id,
      needsRate: unitPrice <= 0,
      needsPicker: false,
      pickerItems: [],
    };
  }

  const picked = args.pickedPriceBookItemId?.trim();
  const chosen = picked ? labour.find(i => i.id === picked) : undefined;
  if (chosen) {
    const unitPrice = Number(chosen.unit_price) || 0;
    return {
      unitPrice,
      priceBookItemId: chosen.id,
      needsRate: unitPrice <= 0,
      needsPicker: false,
      pickerItems: labour,
    };
  }

  return {
    unitPrice: 0,
    priceBookItemId: null,
    needsRate: false,
    needsPicker: true,
    pickerItems: labour,
  };
}

/** @deprecated Use resolveLabourSell — kept for narrow price-book-only callers. */
export function resolveLabourSellFromPriceBook(
  items: PriceBookItemForLabour[] | null | undefined,
): LabourSellResolution {
  return resolveLabourSell({
    staffRate: null,
    companyDefaultLabourRate: null,
    labourItems: items,
    pickedPriceBookItemId: null,
  });
}

export function resolveLabourSellForEmployee(
  employeeId: string | null | undefined,
  ctx: LabourBillContext,
): LabourSellResolution {
  const staffRate = employeeId ? ctx.staffRatesByProfileId[employeeId] ?? null : null;
  return resolveLabourSell({
    staffRate,
    companyDefaultLabourRate: ctx.companyDefaultLabourRate,
    labourItems: ctx.labourPriceBookItems,
    pickedPriceBookItemId: ctx.pickedPriceBookItemId,
  });
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
    const mins = entryMinutes(e.start_time, e.end_time);
    if (mins <= 0) continue;
    minutes += mins;
    entryCount += 1;
  }
  return { hours: minutes / 60, entryCount };
}

export function formatLabourHoursOneDecimal(hours: number): string {
  const rounded = Math.round(hours * 10) / 10;
  return rounded.toFixed(1);
}

export function formatUnbilledHoursLabel(hours: number): string {
  return `${formatLabourHoursOneDecimal(hours)} h logged not on the bill`;
}

export function formatUnbilledCueButtonLabel(hours: number): string {
  return `${formatLabourHoursOneDecimal(hours)} unbilled hours · Add as labour`;
}

export function formatLabourPickerTitle(hours: number): string {
  return `Which rate for these ${formatLabourHoursOneDecimal(hours)} hours?`;
}

export const jobBillHoursQueryKeys = {
  entries: (jobId: string) => ['job-timesheet-entries-bill', jobId] as const,
  billed: (jobId: string) => ['job-billed-timesheet-ids', jobId] as const,
};

export function invalidateJobBillHoursQueries(queryClient: QueryClient, jobId: string): void {
  void queryClient.invalidateQueries({ queryKey: jobBillHoursQueryKeys.billed(jobId) });
  void queryClient.invalidateQueries({ queryKey: jobBillHoursQueryKeys.entries(jobId) });
}

export function invalidateJobBillAfterHoursChange(queryClient: QueryClient, jobId: string): void {
  invalidateJobBillHoursQueries(queryClient, jobId);
  invalidateJobBillInvoicePreview(queryClient, jobId);
}

export function zeroLabourInvoiceConfirmMessage(count: number): string {
  if (count <= 0) return '';
  if (count === 1) return '1 labour line has no rate and will show $0.';
  return `${count} labour lines have no rate and will show $0.`;
}

export function countZeroLabourExposure(args: {
  jobId: string;
  costs: Array<{ charge_type?: string | null; unit_price?: number | string | null }>;
  entries: TimesheetEntryForBill[];
  billedEntryIds: ReadonlySet<string>;
  labourContext: LabourBillContext;
  employeeIdByTimesheetId: Record<string, string>;
}): number {
  let count = args.costs.filter(c => lineNeedsLabourRate(c)).length;
  for (const entry of closedBillableEntries(args.entries)) {
    if (entry.job_id !== args.jobId) continue;
    if (args.billedEntryIds.has(entry.id)) continue;
    if (entryMinutes(entry.start_time, entry.end_time) <= 0) continue;
    const employeeId = args.employeeIdByTimesheetId[entry.timesheet_id];
    const sell = resolveLabourSellForEmployee(employeeId, args.labourContext);
    const unitPrice = sell.needsRate || sell.needsPicker ? 0 : sell.unitPrice;
    if (unitPrice <= 0) count += 1;
  }
  return count;
}

export function labourPullToastMessage(hours: number): string {
  return `Added ${formatLabourHoursOneDecimal(hours)} h labour from logged time`;
}

function formatLabourUnitPriceForDescription(unitPrice: number): string {
  const n = Number(unitPrice) || 0;
  return n % 1 === 0 ? String(n) : n.toFixed(2);
}

export function labourLineDescription(hours: number, unitPrice: number, notes?: string | null): string {
  const h = formatLabourHoursOneDecimal(hours);
  const price = formatLabourUnitPriceForDescription(unitPrice);
  const base = `Labour ${h} h @ $${price}`;
  const note = notes?.trim();
  return note ? `${base} — ${note}` : base;
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
}): JobCostFromHoursInsert | null {
  const minutes = entryMinutes(args.entry.start_time, args.entry.end_time);
  if (minutes <= 0) return null;
  const hours = minutes / 60;
  const qty = Math.round(hours * 1000) / 1000;
  const unitCost = Number(args.unitCost) || 0;
  const unitPrice = args.sell.needsRate || args.sell.needsPicker ? 0 : args.sell.unitPrice;
  const description = labourLineDescription(hours, unitPrice, args.entry.notes);
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
  labourContext: LabourBillContext;
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
    const sell = resolveLabourSellForEmployee(employeeId, args.labourContext);
    const row = buildJobCostFromTimesheetEntry({
      entry,
      companyId: args.companyId,
      jobId: args.jobId,
      createdBy: args.createdBy,
      unitCost,
      costModelId,
      sell,
      includeTimesheetLink: args.includeTimesheetLink,
    });
    if (row) out.push(row);
  }
  return out;
}

export function pullWouldNeedLabourPicker(
  entries: TimesheetEntryForBill[],
  billedEntryIds: ReadonlySet<string>,
  jobId: string,
  employeeIdByTimesheetId: Record<string, string>,
  labourContext: LabourBillContext,
): { needsPicker: boolean; pickerItems: PriceBookItemForLabour[] } {
  for (const entry of closedBillableEntries(entries)) {
    if (entry.job_id !== jobId) continue;
    if (billedEntryIds.has(entry.id)) continue;
    if (entryMinutes(entry.start_time, entry.end_time) <= 0) continue;
    const employeeId = employeeIdByTimesheetId[entry.timesheet_id];
    const sell = resolveLabourSellForEmployee(employeeId, labourContext);
    if (sell.needsPicker) {
      return { needsPicker: true, pickerItems: sell.pickerItems };
    }
  }
  return { needsPicker: false, pickerItems: [] };
}

export function invoiceLinesWithLabourPriceBook(
  lines: InvoiceLineItem[],
  sell: LabourSellResolution,
): InvoiceLineItem[] {
  return lines.map(li => {
    if (!lineNeedsLabourRate(li)) return li;
    if (sell.needsRate || sell.needsPicker || !sell.priceBookItemId) return li;
    return {
      ...li,
      unit_price: sell.unitPrice,
      price_book_item_id: sell.priceBookItemId,
    };
  });
}

export async function loadCompanyDefaultLabourRate(
  client: SupabaseClient,
  companyId: string,
): Promise<{ rate: number | null; columnMissing: boolean }> {
  const { data, error } = await client
    .from('companies')
    .select('default_labour_rate')
    .eq('id', companyId)
    .maybeSingle();
  if (error) {
    if (isSchemaColumnMissingError(error, 'default_labour_rate')) {
      if (!warnedCompanyLabourRateColumnMissing) {
        console.warn('[hoursToJobBill] companies.default_labour_rate missing — run migration 083');
        warnedCompanyLabourRateColumnMissing = true;
      }
      return { rate: null, columnMissing: true };
    }
    throw error;
  }
  const raw = data?.default_labour_rate;
  if (raw == null || raw === '') return { rate: null, columnMissing: false };
  const n = Number(raw);
  return { rate: Number.isFinite(n) ? n : null, columnMissing: false };
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

export type PullUnbilledHoursResult = {
  inserted: number;
  hours: number;
  columnMissing: boolean;
  toast: string | null;
  needsPicker: boolean;
  pickerItems: PriceBookItemForLabour[];
};

export type UnbilledLabourPullPlan = {
  entries: TimesheetEntryForBill[];
  billedEntryIds: Set<string>;
  columnMissing: boolean;
  employeeIdByTimesheetId: Record<string, string>;
  labourContext: LabourBillContext;
  costModels: ExpenseCostModel[];
  profileRows: Array<{ id: string; expense_cost_model_id?: string | null }>;
  planned: JobCostFromHoursInsert[];
  pickerCheck: { needsPicker: boolean; pickerItems: PriceBookItemForLabour[] };
};

export async function loadUnbilledLabourPullPlan(
  client: SupabaseClient,
  input: {
    jobId: string;
    companyId: string;
    profileId: string;
    pickedPriceBookItemId?: string | null;
  },
): Promise<UnbilledLabourPullPlan> {
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
    .select('id, category, description, unit_price, is_active')
    .eq('company_id', input.companyId)
    .eq('is_active', true);
  if (pbErr) throw pbErr;

  const { rate: companyDefaultLabourRate } = await loadCompanyDefaultLabourRate(client, input.companyId);

  const { data: modelsRaw, error: modelErr } = await client.from('expense_cost_models').select('*');
  if (modelErr) throw modelErr;
  const costModels = (modelsRaw ?? []).map(m => normalizeCostModel(m as Record<string, unknown>));

  const profileRowsLoaded = await loadProfilesForLabourBill(client, input.companyId);
  const profileRows = profileRowsLoaded as Array<Record<string, unknown>>;

  const labourContext: LabourBillContext = {
    staffRatesByProfileId: buildStaffLabourRatesByProfileId(profileRows),
    companyDefaultLabourRate,
    labourPriceBookItems: (pbItems ?? []) as PriceBookItemForLabour[],
    pickedPriceBookItemId: input.pickedPriceBookItemId ?? null,
  };

  const entryRows = (entries ?? []) as TimesheetEntryForBill[];
  const pickerCheck = pullWouldNeedLabourPicker(
    entryRows,
    billedEntryIds,
    input.jobId,
    employeeIdByTimesheetId,
    labourContext,
  );

  const planned = planJobCostsFromTimesheetEntries({
    entries: entryRows,
    billedEntryIds,
    companyId: input.companyId,
    jobId: input.jobId,
    createdBy: input.profileId,
    employeeIdByTimesheetId,
    profileRows: profileRows as Array<{ id: string; expense_cost_model_id?: string | null }>,
    costModels,
    labourContext,
    includeTimesheetLink: !columnMissing,
  });

  return {
    entries: entryRows,
    billedEntryIds,
    columnMissing,
    employeeIdByTimesheetId,
    labourContext,
    costModels,
    profileRows: profileRows as Array<{ id: string; expense_cost_model_id?: string | null }>,
    planned,
    pickerCheck,
  };
}

export async function countZeroLabourLinesForJobBillInvoice(
  client: SupabaseClient,
  input: {
    jobId: string;
    companyId: string;
    profileId: string;
    pickedPriceBookItemId?: string | null;
  },
): Promise<number> {
  const plan = await loadUnbilledLabourPullPlan(client, input);
  const { data: costs, error } = await client
    .from('job_costs')
    .select('charge_type, unit_price')
    .eq('job_id', input.jobId);
  if (error) throw error;
  return countZeroLabourExposure({
    jobId: input.jobId,
    costs: costs ?? [],
    entries: plan.entries,
    billedEntryIds: plan.billedEntryIds,
    labourContext: plan.labourContext,
    employeeIdByTimesheetId: plan.employeeIdByTimesheetId,
  });
}

export async function pullUnbilledHoursToJobBill(client: SupabaseClient, input: {
  jobId: string;
  companyId: string;
  profileId: string;
  pickedPriceBookItemId?: string | null;
}): Promise<PullUnbilledHoursResult> {
  const {
    columnMissing,
    planned,
    pickerCheck,
  } = await loadUnbilledLabourPullPlan(client, input);

  if (pickerCheck.needsPicker && !input.pickedPriceBookItemId) {
    return {
      inserted: 0,
      hours: 0,
      columnMissing,
      toast: null,
      needsPicker: true,
      pickerItems: pickerCheck.pickerItems,
    };
  }

  if (planned.length === 0) {
    return {
      inserted: 0,
      hours: 0,
      columnMissing,
      toast: null,
      needsPicker: false,
      pickerItems: [],
    };
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
    needsPicker: false,
    pickerItems: [],
  };
}

export function summarizeUnbilledForJob(
  entries: TimesheetEntryForBill[],
  billedEntryIds: ReadonlySet<string>,
): { hours: number; entryCount: number; buttonLabel: string } | null {
  const { hours, entryCount } = unbilledHoursSummary(entries, billedEntryIds);
  if (entryCount === 0 || hours <= 0) return null;
  return { hours, entryCount, buttonLabel: formatUnbilledCueButtonLabel(hours) };
}
