import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Plus, Trash2, X, Users, Bookmark, Copy, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { ManagedSelect } from '../ui/ManagedSelect';
import { LIST_KEYS } from '../../lib/useManagedList';
import {
  formatMoney,
  EMPLOYEE_COST_TYPE_LABELS,
  employeeCostTypeLabel,
  EXPENSE_COST_CLASS_LABELS,
  EXPENSE_MODEL_PERIOD_LABELS,
  EXPENSE_MODEL_TIME_UNIT_HOURS,
  EXPENSE_MODEL_TIME_UNIT_SHORT,
  EXPENSE_MODEL_PERIOD_HOURS,
  type ExpenseCostModel,
  type ExpenseCostModelLine,
  type ExpenseTemplate,
  type ExpenseTemplateLine,
  type ExpenseModelPeriod,
  type ExpenseModelTimeUnit,
  type EmployeeCostType,
  type ExpenseCostClass,
  type ExpenseRecurrence,
  type ExpensePaymentMethod,
} from '../../types/fsm';

function moneyTax(amount: number, taxRate: number) {
  const tax = Number(((amount * taxRate) / 100).toFixed(2));
  return { tax_amount: tax, total: Number((amount + tax).toFixed(2)) };
}

/** Allow empty / partial decimals while typing (e.g. clear "0", type "12.5"). */
function acceptDecimalDraft(raw: string): boolean {
  return raw === '' || /^-?\d*\.?\d*$/.test(raw);
}

type EditModelLine = {
  employee_cost_type: string;
  category: string;
  description: string;
  amount: string;
  amount_mode: 'fixed' | 'percent_of_wages';
  /** Kept for load compat; not edited in UI */
  hours: string;
  time_unit: ExpenseModelTimeUnit;
  tax_rate: string;
};

type EditModelForm = {
  name: string;
  notes: string | null;
  billing_period: ExpenseModelPeriod;
  lines: EditModelLine[];
};

function parseTimeUnit(raw: unknown): ExpenseModelTimeUnit {
  const v = String(raw || '');
  return (['hourly', 'daily', 'weekly', 'monthly', 'annually'].includes(v)
    ? v
    : 'monthly') as ExpenseModelTimeUnit;
}

function parseAmountMode(raw: unknown): ExpenseCostModelLine['amount_mode'] {
  if (raw === 'percent_of_wages' || raw === 'hours_x_rate') return raw;
  return 'fixed';
}

function toEditModelLine(l: ExpenseCostModelLine): EditModelLine {
  // Present hours×rate lines as fixed $/hr so Amount + Time unit are always editable
  const mode = parseAmountMode(l.amount_mode);
  const asFixedHourly = mode === 'hours_x_rate';
  return {
    employee_cost_type: l.employee_cost_type,
    category: l.category,
    description: l.description,
    amount: Number(l.amount) === 0 ? '' : String(l.amount),
    amount_mode: asFixedHourly ? 'fixed' : mode === 'percent_of_wages' ? 'percent_of_wages' : 'fixed',
    hours: '',
    time_unit: asFixedHourly ? 'hourly' : parseTimeUnit(l.time_unit),
    tax_rate: Number(l.tax_rate) === 0 ? '' : String(l.tax_rate),
  };
}

function fromEditModelLine(l: EditModelLine): ExpenseCostModelLine {
  const mode = l.amount_mode === 'percent_of_wages' ? 'percent_of_wages' : 'fixed';
  return {
    employee_cost_type: l.employee_cost_type || 'other',
    category: l.category,
    description: l.description,
    amount: parseFloat(l.amount) || 0,
    amount_mode: mode,
    hours: undefined,
    time_unit: mode === 'percent_of_wages' ? 'hourly' : parseTimeUnit(l.time_unit),
    tax_rate: parseFloat(l.tax_rate) || 0,
  };
}

function editModelHourlyTotal(lines: EditModelLine[]): number {
  return modelHourlyCost({ lines: lines.map(fromEditModelLine) });
}

export function asModelLines(raw: unknown, fallbackUnit: ExpenseModelTimeUnit = 'monthly'): ExpenseCostModelLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const row = r as Record<string, unknown>;
    const hasLineUnit = row.time_unit != null && String(row.time_unit).trim() !== '';
    return {
      employee_cost_type: (row.employee_cost_type as EmployeeCostType) || 'other',
      category: String(row.category ?? ''),
      description: String(row.description ?? ''),
      amount: Number(row.amount) || 0,
      amount_mode: parseAmountMode(row.amount_mode),
      hours: row.hours != null && !Number.isNaN(Number(row.hours)) ? Number(row.hours) : undefined,
      time_unit: parseAmountMode(row.amount_mode) === 'hours_x_rate'
        ? 'hourly'
        : hasLineUnit ? parseTimeUnit(row.time_unit) : fallbackUnit,
      tax_rate: Number(row.tax_rate) || 0,
    };
  });
}

function normalizeCostModel(m: Record<string, unknown>): ExpenseCostModel {
  const legacyUnit = parseTimeUnit(m.time_unit);
  return {
    ...(m as unknown as ExpenseCostModel),
    time_unit: legacyUnit,
    standard_hours: Number(m.standard_hours) || EXPENSE_MODEL_TIME_UNIT_HOURS[legacyUnit],
    lines: asModelLines(m.lines, legacyUnit),
  };
}

function asTemplateLines(raw: unknown): ExpenseTemplateLine[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      cost_class: (row.cost_class as ExpenseCostClass) || 'overhead',
      category: String(row.category ?? 'Other'),
      description: String(row.description ?? ''),
      amount: Number(row.amount) || 0,
      tax_rate: Number(row.tax_rate) || 0,
      vendor_name: row.vendor_name != null ? String(row.vendor_name) : null,
      recurrence: (row.recurrence as ExpenseRecurrence) || 'monthly',
      payment_method: (row.payment_method as ExpensePaymentMethod) || null,
    };
  });
}

/** Convert a fixed line amount into $/hr using its time unit. */
export function lineToHourly(amount: number, timeUnit: ExpenseModelTimeUnit): number {
  const hours = EXPENSE_MODEL_TIME_UNIT_HOURS[timeUnit] || 1;
  if (hours <= 0) return 0;
  return Number((amount / hours).toFixed(4));
}

/** Base wages expressed as $/hr (sum of fixed / hours×rate wages lines). */
export function modelBaseWagesHourly(lines: ExpenseCostModelLine[], wagesOverrideHourly?: number): number {
  if (wagesOverrideHourly != null && !Number.isNaN(wagesOverrideHourly)) {
    return wagesOverrideHourly;
  }
  return lines
    .filter(l => l.employee_cost_type === 'wages' && l.amount_mode !== 'percent_of_wages')
    .reduce((s, l) => {
      if (l.amount_mode === 'hours_x_rate') return s + (Number(l.amount) || 0);
      return s + lineToHourly(Number(l.amount) || 0, parseTimeUnit(l.time_unit));
    }, 0);
}

/** Line cost as $/hr (percent lines use wages hourly base). */
export function modelLineHourly(line: ExpenseCostModelLine, wagesHourly: number): number {
  if (line.amount_mode === 'percent_of_wages') {
    return Number(((wagesHourly * (Number(line.amount) || 0)) / 100).toFixed(4));
  }
  if (line.amount_mode === 'hours_x_rate') {
    return Number((Number(line.amount) || 0).toFixed(4));
  }
  return lineToHourly(Number(line.amount) || 0, parseTimeUnit(line.time_unit));
}

/** Fully loaded $/hr for job/quote cost codes. */
export function modelHourlyCost(
  model: Pick<ExpenseCostModel, 'lines'>,
  wagesOverrideHourly?: number,
): number {
  const wagesH = modelBaseWagesHourly(model.lines, wagesOverrideHourly);
  const total = model.lines.reduce((s, l) => s + modelLineHourly(l, wagesH), 0);
  return Number(total.toFixed(2));
}

/** Dollar amount to post for one line in the model’s billing period. */
export function modelLineAmountForPeriod(
  line: ExpenseCostModelLine,
  billingPeriod: ExpenseModelPeriod,
  wagesOverrideHourly?: number,
  allLines?: ExpenseCostModelLine[],
): number {
  const lines = allLines ?? [line];
  const wagesH = modelBaseWagesHourly(lines, wagesOverrideHourly);
  const hourly = modelLineHourly(line, wagesH);
  const periodHours = EXPENSE_MODEL_PERIOD_HOURS[billingPeriod] || 152;
  return Number((hourly * periodHours).toFixed(2));
}

/** @deprecated Prefer modelHourlyCost — kept for callers expecting a raw sum of line amounts. */
export function modelLineAmount(line: ExpenseCostModelLine, wagesBase: number): number {
  if (line.amount_mode === 'percent_of_wages') {
    return Number(((wagesBase * line.amount) / 100).toFixed(2));
  }
  return Number(line.amount) || 0;
}

/** @deprecated Prefer modelBaseWagesHourly */
export function modelBaseWages(lines: ExpenseCostModelLine[]): number {
  return lines
    .filter(l => l.employee_cost_type === 'wages' && l.amount_mode !== 'percent_of_wages')
    .reduce((s, l) => {
      if (l.amount_mode === 'hours_x_rate') {
        return s + (Number(l.amount) || 0) * (Number(l.hours) || 0);
      }
      return s + (Number(l.amount) || 0);
    }, 0);
}

/** @deprecated Prefer modelHourlyCost */
export function modelPackageTotal(lines: ExpenseCostModelLine[], wagesOverride?: number): number {
  const wages = wagesOverride ?? modelBaseWages(lines);
  return lines.reduce((s, l) => s + modelLineAmount(l, wages), 0);
}

export function modelUnitRate(model: Pick<ExpenseCostModel, 'lines'>): number {
  return modelHourlyCost(model);
}

function defaultTimeUnitForType(t: string): ExpenseModelTimeUnit {
  switch (t) {
    case 'wages':
      return 'hourly';
    case 'vehicle':
    case 'allowance':
      return 'weekly';
    case 'tools':
    case 'reimbursement':
    case 'other':
      return 'monthly';
    case 'training':
      return 'annually';
    default:
      return 'monthly';
  }
}

function emptyModelLine(): EditModelLine {
  return {
    employee_cost_type: 'wages',
    category: 'Wages & Salaries',
    description: 'Base wages',
    amount: '',
    amount_mode: 'fixed',
    hours: '',
    time_unit: 'hourly',
    tax_rate: '',
  };
}

/** Extra cost line — defaults to weekly (e.g. fuel) so each line’s unit is obvious */
function emptyExtraCostLine(): EditModelLine {
  return {
    employee_cost_type: 'vehicle',
    category: 'Vehicle',
    description: 'Fuel / vehicle',
    amount: '',
    amount_mode: 'fixed',
    hours: '',
    time_unit: 'weekly',
    tax_rate: '',
  };
}

function defaultSuperLine(): EditModelLine {
  return {
    employee_cost_type: 'super',
    category: 'Superannuation',
    description: 'Superannuation',
    amount: '11.5',
    amount_mode: 'percent_of_wages',
    hours: '',
    time_unit: 'hourly',
    tax_rate: '',
  };
}

// ── Apply employee cost model ────────────────────────────────────

export function ApplyEmployeeCostModelModal({
  onClose,
  onApplied,
}: {
  onClose: () => void;
  onApplied: (count: number) => void;
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const { data: models = [] } = useQuery<ExpenseCostModel[]>({
    queryKey: ['expense-cost-models'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('expense_cost_models')
        .select('*')
        .order('name');
      if (error) throw error;
      return (data ?? []).map(m => normalizeCostModel(m as Record<string, unknown>));
    },
  });

  const { data: employees = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ['expense-team-members', profile?.company_id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('company_id', profile!.company_id)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!profile?.company_id,
  });

  const [modelId, setModelId] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [multipliers, setMultipliers] = useState<Record<string, string>>({});
  const [wageOverrides, setWageOverrides] = useState<Record<string, string>>({});
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [status, setStatus] = useState<'recorded' | 'paid'>('recorded');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [managing, setManaging] = useState(false);

  const model = models.find(m => m.id === modelId) ?? null;

  useEffect(() => {
    if (!modelId && models.length) setModelId(models[0].id);
  }, [models, modelId]);

  useEffect(() => {
    if (employees.length && Object.keys(selected).length === 0) {
      const init: Record<string, boolean> = {};
      for (const e of employees) init[e.id] = true;
      setSelected(init);
    }
  }, [employees, selected]);

  const selectedEmployees = employees.filter(e => selected[e.id]);

  const resolveWagesOverrideHourly = (empId: string): number | undefined => {
    if (!model) return undefined;
    const wageOvRaw = wageOverrides[empId]?.trim();
    if (!wageOvRaw) return undefined;
    const wageOv = parseFloat(wageOvRaw);
    if (Number.isNaN(wageOv)) return undefined;
    const wagesLine = model.lines.find(
      l => l.employee_cost_type === 'wages' && l.amount_mode !== 'percent_of_wages',
    );
    // hours_x_rate wages: override is $/hr; fixed: override matches the line's time unit
    if (wagesLine?.amount_mode === 'hours_x_rate') return wageOv;
    return lineToHourly(wageOv, parseTimeUnit(wagesLine?.time_unit));
  };

  const previewTotal = useMemo(() => {
    if (!model) return 0;
    const periodHours = EXPENSE_MODEL_PERIOD_HOURS[model.billing_period] || 152;
    return selectedEmployees.reduce((sum, emp) => {
      const mult = parseFloat(multipliers[emp.id] || '1') || 1;
      const wagesOverrideHourly = resolveWagesOverrideHourly(emp.id);
      return sum + modelHourlyCost(model, wagesOverrideHourly) * periodHours * mult;
    }, 0);
  }, [model, selectedEmployees, multipliers, wageOverrides]);

  const apply = async () => {
    if (!profile?.company_id || !model) return;
    if (selectedEmployees.length === 0) {
      setErr('Select at least one employee');
      return;
    }
    if (model.lines.length === 0) {
      setErr('This model has no cost lines — edit the model first');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const rows: Record<string, unknown>[] = [];
      for (const emp of selectedEmployees) {
        const mult = parseFloat(multipliers[emp.id] || '1') || 1;
        const wagesOverrideHourly = resolveWagesOverrideHourly(emp.id);

        for (const line of model.lines) {
          let amount = modelLineAmountForPeriod(line, model.billing_period, wagesOverrideHourly, model.lines) * mult;
          amount = Number(amount.toFixed(2));
          if (amount === 0) continue;
          const taxRate = line.tax_rate || 0;
          const { tax_amount, total } = moneyTax(amount, taxRate);
          const typeLabel = employeeCostTypeLabel(line.employee_cost_type);
          rows.push({
            company_id: profile.company_id,
            cost_class: 'employee',
            category: line.category || typeLabel,
            employee_cost_type: line.employee_cost_type,
            description: `${line.description || typeLabel} — ${emp.name}`,
            amount,
            tax_rate: taxRate,
            tax_amount,
            total,
            expense_date: expenseDate,
            period_start: periodStart || null,
            period_end: periodEnd || null,
            employee_id: emp.id,
            recurrence: model.billing_period,
            status,
            notes: `From cost model: ${model.name}`,
            created_by: profile.id,
          });
        }
      }
      if (rows.length === 0) throw new Error('Nothing to post — check amounts');
      const { error } = await supabase.from('expenses').insert(rows);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expenses-pnl'] });
      onApplied(rows.length);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to apply model');
    } finally {
      setSaving(false);
    }
  };

  if (managing) {
    return (
      <ManageCostModelsModal
        onClose={() => setManaging(false)}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ['expense-cost-models'] })}
      />
    );
  }

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <div>
            <h2 className="text-base font-semibold text-[#1A1A1A] flex items-center gap-2">
              <Users size={18} className="text-[#2E75B6]" />
              Apply employee cost model
            </h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              Post the same cost package to many staff — tweak wages or a multiplier per person
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overlay-body space-y-4">
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-medium text-[#4A5568] mb-1">Cost model</label>
              <select value={modelId} onChange={e => setModelId(e.target.value)} className="form-input cursor-pointer">
                {models.length === 0 && <option value="">No models yet</option>}
                {models.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({formatMoney(modelHourlyCost(m))}/hr · posts {EXPENSE_MODEL_PERIOD_LABELS[m.billing_period].toLowerCase()})
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => setManaging(true)}
              className="px-3 py-2 text-sm font-medium text-[#2E75B6] border border-[#2E75B6] rounded-md hover:bg-blue-50">
              Manage models
            </button>
          </div>

          {model && (
            <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3 text-xs text-[#4A5568]">
              <p className="font-medium text-[#1A1A1A] mb-1">Package lines</p>
              <ul className="space-y-0.5">
                {model.lines.map((l, i) => (
                  <li key={i}>
                    {employeeCostTypeLabel(l.employee_cost_type)} — {l.description || '—'} ·{' '}
                    {l.amount_mode === 'percent_of_wages'
                      ? `${l.amount}% of wages`
                      : (
                        <>
                          {formatMoney(l.amount)}
                          {EXPENSE_MODEL_TIME_UNIT_SHORT[parseTimeUnit(l.time_unit)]}
                          {' '}→ {formatMoney(modelLineHourly(l, modelBaseWagesHourly(model.lines)))}/hr
                        </>
                      )}
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-medium text-[#0A2540]">
                Fully loaded <span className="text-[#2E75B6]">{formatMoney(modelHourlyCost(model))}/hr</span>
                {' · posts '}{EXPENSE_MODEL_PERIOD_LABELS[model.billing_period].toLowerCase()}
                {' ≈ '}{formatMoney(modelHourlyCost(model) * (EXPENSE_MODEL_PERIOD_HOURS[model.billing_period] || 152))}/period
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Field label="Expense date">
              <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className="form-input" />
            </Field>
            <Field label="Period start">
              <input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} className="form-input" />
            </Field>
            <Field label="Period end">
              <input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} className="form-input" />
            </Field>
            <Field label="Status">
              <select value={status} onChange={e => setStatus(e.target.value as 'recorded' | 'paid')} className="form-input cursor-pointer">
                <option value="recorded">Recorded</option>
                <option value="paid">Paid</option>
              </select>
            </Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium text-[#4A5568]">Employees</p>
              <div className="flex gap-2 text-xs">
                <button type="button" className="text-[#2E75B6] hover:underline"
                  onClick={() => {
                    const all: Record<string, boolean> = {};
                    employees.forEach(e => { all[e.id] = true; });
                    setSelected(all);
                  }}>Select all</button>
                <button type="button" className="text-[#6B7280] hover:underline"
                  onClick={() => setSelected({})}>Clear</button>
              </div>
            </div>
            <div className="border border-[#E5E7EB] rounded-lg overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-[#F9FAFB] text-xs text-[#6B7280] sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left w-8"></th>
                    <th className="px-3 py-2 text-left">Name</th>
                    <th className="px-3 py-2 text-right">Wage override</th>
                    <th className="px-3 py-2 text-right">Multiplier</th>
                    <th className="px-3 py-2 text-right">Est. total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {employees.map(emp => {
                    const on = !!selected[emp.id];
                    const mult = parseFloat(multipliers[emp.id] || '1') || 1;
                    const periodHours = model ? (EXPENSE_MODEL_PERIOD_HOURS[model.billing_period] || 152) : 152;
                    const wagesOverrideHourly = on ? resolveWagesOverrideHourly(emp.id) : undefined;
                    const est = model
                      ? modelHourlyCost(model, wagesOverrideHourly) * periodHours * mult
                      : 0;
                    return (
                      <tr key={emp.id} className={on ? 'bg-white' : 'bg-[#F9FAFB] opacity-70'}>
                        <td className="px-3 py-2">
                          <input type="checkbox" checked={on}
                            onChange={e => setSelected(s => ({ ...s, [emp.id]: e.target.checked }))}
                            className="rounded border-gray-300" />
                        </td>
                        <td className="px-3 py-2 font-medium text-[#1A1A1A]">{emp.name}</td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            placeholder="Default"
                            value={wageOverrides[emp.id] ?? ''}
                            onChange={e => {
                              const raw = e.target.value;
                              if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                              setWageOverrides(m => ({ ...m, [emp.id]: raw }));
                            }}
                            className="form-input-sm w-28 ml-auto text-right"
                            disabled={!on}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            inputMode="decimal"
                            value={multipliers[emp.id] ?? '1'}
                            onChange={e => {
                              const raw = e.target.value;
                              if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
                              setMultipliers(m => ({ ...m, [emp.id]: raw }));
                            }}
                            className="form-input-sm w-20 ml-auto text-right"
                            disabled={!on}
                            title="1 = full package, 0.5 = half, 1.2 = 20% more"
                          />
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {on ? formatMoney(est) : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-[#9CA3AF] mt-1.5">
              Wage override uses the same unit as the wages line (or $/hr when the line is Hours × rate). Multiplier scales the whole package.
            </p>
          </div>

          <div className="rounded-lg bg-[#0A2540] text-white px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-white/80">
              {selectedEmployees.length} employee{selectedEmployees.length === 1 ? '' : 's'} · posting to P&amp;L
            </span>
            <span className="text-lg font-bold tabular-nums">{formatMoney(previewTotal)}</span>
          </div>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#E5E7EB]">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-[#E5E7EB] rounded-md text-[#4A5568]">Cancel</button>
          <button type="button" onClick={() => void apply()} disabled={saving || !model}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md hover:bg-[#0d2f4e] disabled:opacity-50">
            <Check size={14} /> {saving ? 'Posting…' : 'Post employee costs'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Manage cost models ───────────────────────────────────────────

function ManageCostModelsModal({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: models = [], refetch } = useQuery<ExpenseCostModel[]>({
    queryKey: ['expense-cost-models'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_cost_models').select('*').order('name');
      if (error) throw error;
      return (data ?? []).map(m => normalizeCostModel(m as Record<string, unknown>));
    },
  });

  const [editing, setEditing] = useState<ExpenseCostModel | null>(null);
  const [creating, setCreating] = useState(false);

  const blank = (): EditModelForm => ({
    name: '',
    notes: null,
    billing_period: 'monthly',
    lines: [emptyModelLine(), defaultSuperLine()],
  });

  const [form, setForm] = useState<EditModelForm>(blank());
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const startCreate = () => {
    setEditing(null);
    setForm(blank());
    setCreating(true);
  };

  const startEdit = (m: ExpenseCostModel) => {
    setEditing(m);
    setForm({
      name: m.name,
      notes: m.notes,
      billing_period: m.billing_period,
      lines: m.lines.length ? m.lines.map(toEditModelLine) : [emptyModelLine()],
    });
    setCreating(true);
  };

  const save = async () => {
    if (!profile?.company_id) return;
    if (!form.name.trim()) { setErr('Name is required'); return; }
    if (form.lines.length === 0) { setErr('Add at least one line'); return; }
    setSaving(true); setErr('');
    const lines = form.lines.map(fromEditModelLine);
    const payload = {
      name: form.name.trim(),
      notes: form.notes?.trim() || null,
      billing_period: form.billing_period,
      lines,
      updated_at: new Date().toISOString(),
    };
    const { error } = editing
      ? await supabase.from('expense_cost_models').update(payload).eq('id', editing.id)
      : await supabase.from('expense_cost_models').insert({
          ...payload,
          company_id: profile.company_id,
          created_by: profile.id,
        });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setCreating(false);
    await refetch();
    onChanged();
    queryClient.invalidateQueries({ queryKey: ['expense-cost-models'] });
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this cost model?')) return;
    await supabase.from('expense_cost_models').delete().eq('id', id);
    await refetch();
    onChanged();
  };

  const updateLine = (idx: number, patch: Partial<EditModelLine>) => {
    setForm(f => ({
      ...f,
      lines: f.lines.map((l, i) => (i === idx ? { ...l, ...patch } : l)),
    }));
  };

  const hourlyPreview = editModelHourlyTotal(form.lines);

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <h2 className="text-base font-semibold text-[#1A1A1A]">Employee cost models</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="overlay-body space-y-4">
          {!creating ? (
            <>
              <p className="text-xs text-[#6B7280]">
                Each model is a <strong className="font-medium text-[#4A5568]">cost code</strong> — stack wages, fuel, tools, etc.
                Each line has its own time variable (hourly / weekly / …) so the fully loaded $/hr is correct.
              </p>
              <div className="flex justify-end">
                <button type="button" onClick={startCreate} className="flex items-center gap-1.5 text-sm font-medium text-white bg-[#0A2540] px-3 py-2 rounded-md">
                  <Plus size={14} /> New model
                </button>
              </div>
              {models.length === 0 ? (
                <p className="text-sm text-[#6B7280] text-center py-8">
                  Create a cost code like “Standard field tech” with wages, super %, vehicle, tools… then pick it on job/quote lines.
                </p>
              ) : (
                <ul className="space-y-2">
                  {models.map(m => (
                    <li key={m.id} className="flex items-center gap-3 border border-[#E5E7EB] rounded-lg px-3 py-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#1A1A1A]">{m.name}</p>
                        <p className="text-xs text-[#9CA3AF]">
                          {m.lines.length} lines · {formatMoney(modelHourlyCost(m))}/hr
                          {' · posts '}{EXPENSE_MODEL_PERIOD_LABELS[m.billing_period].toLowerCase()}
                        </p>
                      </div>
                      <button type="button" onClick={() => startEdit(m)} className="text-xs text-[#2E75B6] hover:underline">Edit</button>
                      <button type="button" onClick={() => void remove(m.id)} className="text-[#9CA3AF] hover:text-red-600"><Trash2 size={14} /></button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
              <div className="space-y-3">
                <Field label="Model name">
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    className="form-input" placeholder="e.g. Standard field tech" />
                </Field>
                <Field label="Notes">
                  <input value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    className="form-input" placeholder="Optional" />
                </Field>
                <Field label="How often to post expenses when applied">
                  <select
                    value={form.billing_period}
                    onChange={e => setForm(f => ({ ...f, billing_period: e.target.value as ExpenseModelPeriod }))}
                    className="form-input cursor-pointer max-w-xs"
                  >
                    {(Object.keys(EXPENSE_MODEL_PERIOD_LABELS) as ExpenseModelPeriod[]).map(k => (
                      <option key={k} value={k}>{EXPENSE_MODEL_PERIOD_LABELS[k]}</option>
                    ))}
                  </select>
                </Field>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-medium text-[#4A5568]">Cost lines</p>
                    <p className="text-[11px] text-[#6B7280] mt-0.5">
                      Every line has its own <strong>time variable</strong> — wages might be <strong>hourly</strong>,
                      fuel <strong>weekly</strong>. Different natures, converted separately into the loaded $/hr.
                    </p>
                  </div>
                  <button type="button" onClick={() => setForm(f => ({ ...f, lines: [...f.lines, emptyExtraCostLine()] }))}
                    className="text-xs text-[#2E75B6] hover:underline flex items-center gap-1 shrink-0"><Plus size={12} /> Add line</button>
                </div>
                {form.lines.map((line, idx) => {
                  const lineHourly = line.amount_mode === 'percent_of_wages'
                    ? null
                    : lineToHourly(parseFloat(line.amount) || 0, parseTimeUnit(line.time_unit));
                  return (
                  <div key={idx} className="border border-[#E5E7EB] rounded-lg p-3 bg-[#F9FAFB] space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                      <div className="sm:col-span-4">
                        <label className="text-[10px] text-[#6B7280]">Type</label>
                        <ManagedSelect
                          listKey={LIST_KEYS.employeeCostTypes}
                          value={line.employee_cost_type}
                          onChange={t => {
                            const label = EMPLOYEE_COST_TYPE_LABELS[t] ?? t;
                            updateLine(idx, {
                              employee_cost_type: t,
                              category: t === 'super' ? 'Superannuation'
                                : t === 'wages' ? 'Wages & Salaries'
                                : label,
                              amount_mode: t === 'super' ? 'percent_of_wages' : 'fixed',
                              amount: t === 'super' ? (line.amount_mode === 'percent_of_wages' ? line.amount : '11.5') : line.amount,
                              description: line.description || label,
                              time_unit: t === 'super' ? line.time_unit : defaultTimeUnitForType(t),
                            });
                          }}
                          placeholder="Select type…"
                          allowAdd
                          allowDelete
                          className="form-input-sm"
                        />
                      </div>
                      <div className="sm:col-span-7">
                        <label className="text-[10px] text-[#6B7280]">Description</label>
                        <input value={line.description} onChange={e => updateLine(idx, { description: e.target.value })}
                          className="form-input-sm w-full" />
                      </div>
                      <div className="sm:col-span-1 flex justify-end pb-1">
                        <button type="button" onClick={() => setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))}
                          className="text-[#9CA3AF] hover:text-red-600" title="Remove line"><Trash2 size={14} /></button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end rounded-md border-2 border-[#2E75B6]/40 bg-white p-2.5">
                      <div>
                        <label className="text-[10px] font-semibold text-[#0A2540]">
                          {line.amount_mode === 'percent_of_wages' ? '% of wages' : 'Amount ($)'}
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={line.amount}
                          onChange={e => {
                            const raw = e.target.value;
                            if (!acceptDecimalDraft(raw)) return;
                            updateLine(idx, { amount: raw });
                          }}
                          className="form-input-sm w-full"
                          placeholder={line.amount_mode === 'percent_of_wages' ? 'e.g. 11.5' : 'e.g. 45 or 200'}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-semibold text-[#0A2540]">Time variable</label>
                        <select
                          value={line.time_unit}
                          onChange={e => updateLine(idx, { time_unit: e.target.value as ExpenseModelTimeUnit })}
                          className="form-input-sm w-full cursor-pointer font-medium border-[#2E75B6]"
                          disabled={line.amount_mode === 'percent_of_wages'}
                          title="This line’s amount is denominated per this period (independent of other lines)"
                        >
                          <option value="hourly">Hourly ($ / hour)</option>
                          <option value="daily">Daily ($ / day)</option>
                          <option value="weekly">Weekly ($ / week)</option>
                          <option value="monthly">Monthly ($ / month)</option>
                          <option value="annually">Annually ($ / year)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-[#6B7280]">Mode</label>
                        <select
                          value={line.amount_mode === 'percent_of_wages' ? 'percent_of_wages' : 'fixed'}
                          onChange={e => updateLine(idx, {
                            amount_mode: e.target.value as 'fixed' | 'percent_of_wages',
                          })}
                          className="form-input-sm w-full"
                        >
                          <option value="fixed">$ amount</option>
                          <option value="percent_of_wages">% of wages</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] text-[#6B7280]">Tax %</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={line.tax_rate}
                          onChange={e => {
                            const raw = e.target.value;
                            if (!acceptDecimalDraft(raw)) return;
                            updateLine(idx, { tax_rate: raw });
                          }}
                          className="form-input-sm w-full"
                          placeholder="—"
                        />
                      </div>
                      {line.amount_mode !== 'percent_of_wages' && (
                        <p className="col-span-2 sm:col-span-4 text-xs text-[#2E75B6] font-medium">
                          → {formatMoney(lineHourly ?? 0)}/hr for this line
                          <span className="text-[#9CA3AF] font-normal ml-1">
                            ({line.time_unit === 'hourly' ? 'already hourly'
                              : line.time_unit === 'daily' ? '÷ 8 hrs'
                              : line.time_unit === 'weekly' ? '÷ 38 hrs'
                              : line.time_unit === 'monthly' ? '÷ 152 hrs'
                              : '÷ 1824 hrs'})
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                  );
                })}
              </div>

              <p className="text-sm font-medium text-[#0A2540]">
                Fully loaded hourly: <span className="text-[#2E75B6]">{formatMoney(hourlyPreview)}/hr</span>
                <span className="text-xs font-normal text-[#6B7280] ml-2">
                  (sum of each line’s own $/hr)
                </span>
              </p>
              {err && <p className="text-sm text-red-600">{err}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setCreating(false)} className="px-3 py-2 text-sm border rounded-md">Back</button>
                <button type="button" onClick={() => void save()} disabled={saving}
                  className="px-3 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save model'}
                </button>
              </div>
            </div>
          )}
        </div>

        {!creating && (
          <div className="flex justify-end px-5 py-4 border-t border-[#E5E7EB]">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-[#0A2540] text-white rounded-md">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Quick templates (overhead / COGS) ─────────────────────────────

export function ApplyExpenseTemplateModal({
  onClose,
  onApplied,
}: {
  onClose: () => void;
  onApplied: (count: number) => void;
}) {
  const { profile, company } = useAuth();
  const queryClient = useQueryClient();
  const [managing, setManaging] = useState(false);
  const [templateId, setTemplateId] = useState('');
  const [expenseDate, setExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: templates = [] } = useQuery<ExpenseTemplate[]>({
    queryKey: ['expense-templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_templates').select('*').order('name');
      if (error) throw error;
      return (data ?? []).map(t => ({ ...t, lines: asTemplateLines(t.lines) }));
    },
  });

  useEffect(() => {
    if (!templateId && templates.length) setTemplateId(templates[0].id);
  }, [templates, templateId]);

  const template = templates.find(t => t.id === templateId) ?? null;
  const preview = template?.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0) ?? 0;

  const apply = async () => {
    if (!profile?.company_id || !template) return;
    if (!template.lines.length) { setErr('Template has no lines'); return; }
    setSaving(true); setErr('');
    try {
      const rows = template.lines.map(line => {
        const amount = Number(line.amount) || 0;
        const taxRate = line.tax_rate ?? (Number(company?.default_tax_rate) || 0);
        const { tax_amount, total } = moneyTax(amount, taxRate);
        return {
          company_id: profile.company_id,
          cost_class: line.cost_class,
          category: line.category || 'Other',
          employee_cost_type: null,
          description: line.description,
          amount,
          tax_rate: taxRate,
          tax_amount,
          total,
          expense_date: expenseDate,
          vendor_name: line.vendor_name || null,
          recurrence: line.recurrence || 'monthly',
          payment_method: line.payment_method || null,
          status: 'recorded' as const,
          notes: `From template: ${template.name}`,
          created_by: profile.id,
        };
      });
      const { error } = await supabase.from('expenses').insert(rows);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['expenses-pnl'] });
      onApplied(rows.length);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  if (managing) {
    return (
      <ManageExpenseTemplatesModal
        onClose={() => setManaging(false)}
        onChanged={() => queryClient.invalidateQueries({ queryKey: ['expense-templates'] })}
      />
    );
  }

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <div>
            <h2 className="text-base font-semibold text-[#1A1A1A] flex items-center gap-2">
              <Bookmark size={18} className="text-[#F7931A]" />
              Quick expense template
            </h2>
            <p className="text-xs text-[#6B7280] mt-0.5">Post rent, insurance, software and other recurring costs in one go</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <div className="overlay-body space-y-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-[#4A5568] mb-1">Template</label>
              <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="form-input cursor-pointer">
                {templates.length === 0 && <option value="">No templates yet</option>}
                {templates.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.lines.length} lines · {formatMoney(t.lines.reduce((s, l) => s + l.amount, 0))})
                  </option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => setManaging(true)}
              className="px-3 py-2 text-sm font-medium text-[#2E75B6] border border-[#2E75B6] rounded-md hover:bg-blue-50">
              Manage
            </button>
          </div>
          <Field label="Expense date">
            <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)} className="form-input" />
          </Field>
          {template && (
            <ul className="text-sm space-y-1 border border-[#E5E7EB] rounded-lg p-3 bg-[#F9FAFB]">
              {template.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="text-[#4A5568]">
                    <span className="text-xs text-[#9CA3AF]">{EXPENSE_COST_CLASS_LABELS[l.cost_class]}</span>
                    {' · '}{l.description}
                  </span>
                  <span className="font-medium tabular-nums">{formatMoney(l.amount)}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-between items-center text-sm font-semibold text-[#0A2540]">
            <span>Total to post</span>
            <span className="tabular-nums">{formatMoney(preview)}</span>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#E5E7EB]">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border rounded-md">Cancel</button>
          <button type="button" onClick={() => void apply()} disabled={saving || !template}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md disabled:opacity-50">
            <Copy size={14} /> {saving ? 'Posting…' : 'Post template'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ManageExpenseTemplatesModal({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const { profile, company } = useAuth();
  const { data: templates = [], refetch } = useQuery<ExpenseTemplate[]>({
    queryKey: ['expense-templates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('expense_templates').select('*').order('name');
      if (error) throw error;
      return (data ?? []).map(t => ({ ...t, lines: asTemplateLines(t.lines) }));
    },
  });

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ExpenseTemplate | null>(null);
  const [name, setName] = useState('');
  const [lines, setLines] = useState<{ cost_class: ExpenseCostClass; category: string; description: string; amount: string; tax_rate: string; recurrence: ExpenseRecurrence }[]>([{
    cost_class: 'overhead',
    category: 'Rent / Lease',
    description: 'Monthly rent',
    amount: '',
    tax_rate: company?.default_tax_rate ? String(company.default_tax_rate) : '',
    recurrence: 'monthly',
  }]);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  const startCreate = () => {
    setEditing(null);
    setName('');
    setLines([{
      cost_class: 'overhead',
      category: 'Rent / Lease',
      description: 'Monthly rent',
      amount: '',
      tax_rate: company?.default_tax_rate ? String(company.default_tax_rate) : '',
      recurrence: 'monthly',
    }]);
    setCreating(true);
  };

  const save = async () => {
    if (!profile?.company_id) return;
    if (!name.trim()) { setErr('Name required'); return; }
    setSaving(true); setErr('');
    const payload = {
      name: name.trim(),
      lines: lines.map(l => ({
        cost_class: l.cost_class,
        category: l.category,
        description: l.description,
        amount: parseFloat(l.amount) || 0,
        tax_rate: parseFloat(l.tax_rate) || 0,
        recurrence: l.recurrence,
      })),
      updated_at: new Date().toISOString(),
    };
    const { error } = editing
      ? await supabase.from('expense_templates').update(payload).eq('id', editing.id)
      : await supabase.from('expense_templates').insert({
          ...payload,
          company_id: profile.company_id,
          created_by: profile.id,
        });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    setCreating(false);
    await refetch();
    onChanged();
  };

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <h2 className="text-base font-semibold">Expense templates</h2>
          <button type="button" onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        <div className="overlay-body space-y-4">
          {!creating ? (
            <>
              <div className="flex justify-end">
                <button type="button" onClick={startCreate} className="btn-primary text-sm"><Plus size={14} /> New template</button>
              </div>
              {templates.length === 0 ? (
                <p className="text-sm text-[#6B7280] text-center py-8">Save groups like “Monthly overheads” (rent + insurance + software).</p>
              ) : templates.map(t => (
                <div key={t.id} className="flex items-center gap-2 border rounded-lg px-3 py-2">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t.name}</p>
                    <p className="text-xs text-[#9CA3AF]">{t.lines.length} lines · {formatMoney(t.lines.reduce((s, l) => s + l.amount, 0))}</p>
                  </div>
                  <button type="button" className="text-xs text-[#2E75B6]" onClick={() => {
                    setEditing(t);
                    setName(t.name);
                    setLines(t.lines.map(l => ({
                      cost_class: l.cost_class,
                      category: l.category,
                      description: l.description,
                      amount: Number(l.amount) === 0 ? '' : String(l.amount),
                      tax_rate: Number(l.tax_rate) === 0 ? '' : String(l.tax_rate),
                      recurrence: l.recurrence || 'monthly',
                    })));
                    setCreating(true);
                  }}>Edit</button>
                  <button type="button" className="text-red-500" onClick={async () => {
                    if (!confirm('Delete template?')) return;
                    await supabase.from('expense_templates').delete().eq('id', t.id);
                    await refetch(); onChanged();
                  }}><Trash2 size={14} /></button>
                </div>
              ))}
            </>
          ) : (
            <div className="space-y-3">
              <Field label="Template name">
                <input value={name} onChange={e => setName(e.target.value)} className="form-input" placeholder="Monthly overheads" />
              </Field>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-1 sm:grid-cols-6 gap-2 border rounded-lg p-2 bg-[#F9FAFB]">
                  <select value={line.cost_class} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, cost_class: e.target.value as ExpenseCostClass } : l))}
                    className="form-input-sm col-span-1">
                    {(Object.keys(EXPENSE_COST_CLASS_LABELS) as ExpenseCostClass[]).filter(k => k !== 'employee').map(k => (
                      <option key={k} value={k}>{EXPENSE_COST_CLASS_LABELS[k]}</option>
                    ))}
                  </select>
                  <input value={line.description} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, description: e.target.value } : l))}
                    className="form-input-sm col-span-2" placeholder="Description" />
                  <input value={line.category} onChange={e => setLines(ls => ls.map((l, i) => i === idx ? { ...l, category: e.target.value } : l))}
                    className="form-input-sm" placeholder="Category" />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={line.amount}
                    onChange={e => {
                      const raw = e.target.value;
                      if (!acceptDecimalDraft(raw)) return;
                      setLines(ls => ls.map((l, i) => i === idx ? { ...l, amount: raw } : l));
                    }}
                    className="form-input-sm"
                    placeholder="Amount"
                  />
                  <button type="button" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))} className="text-[#9CA3AF] hover:text-red-600 justify-self-end"><Trash2 size={14} /></button>
                </div>
              ))}
              <button type="button" onClick={() => setLines(ls => [...ls, {
                cost_class: 'overhead', category: 'Other', description: '', amount: '',
                tax_rate: company?.default_tax_rate ? String(company.default_tax_rate) : '', recurrence: 'monthly',
              }])} className="text-xs text-[#2E75B6] hover:underline flex items-center gap-1"><Plus size={12} /> Add line</button>
              {err && <p className="text-sm text-red-600">{err}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setCreating(false)} className="px-3 py-2 text-sm border rounded-md">Back</button>
                <button type="button" onClick={() => void save()} disabled={saving} className="px-3 py-2 text-sm text-white bg-[#0A2540] rounded-md disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}
        </div>
        {!creating && (
          <div className="flex justify-end px-5 py-4 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-[#0A2540] text-white rounded-md">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#4A5568] mb-1">{label}</label>
      {children}
    </div>
  );
}
