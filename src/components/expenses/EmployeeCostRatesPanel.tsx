import { useMemo, useState, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parseISO } from 'date-fns';
import { ChevronDown, ChevronRight, Clock, Users } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  formatMoney,
  employeeCostTypeLabel,
  type ExpenseWithDetails,
} from '../../types/fsm';

interface Props {
  expenses: ExpenseWithDetails[];
  rangeStart: Date | null;
  rangeEnd: Date | null;
  defaultHours?: number;
}

function inRange(isoDate: string, start: Date | null, end: Date | null): boolean {
  if (!start && !end) return true;
  const d = parseISO(isoDate.slice(0, 10));
  if (start && d < start) return false;
  if (end) {
    const endDay = new Date(end);
    endDay.setHours(23, 59, 59, 999);
    if (d > endDay) return false;
  }
  return true;
}

export function EmployeeCostRatesPanel({
  expenses,
  rangeStart,
  rangeEnd,
  defaultHours = 152,
}: Props) {
  const [hoursByEmp, setHoursByEmp] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const employeeExpenses = useMemo(
    () => expenses.filter(
      e => e.cost_class === 'employee'
        && e.employee_id
        && e.status !== 'void'
        && e.status !== 'draft'
        && inRange(e.expense_date, rangeStart, rangeEnd),
    ),
    [expenses, rangeStart, rangeEnd],
  );

  const { data: timesheetHours = {} } = useQuery<Record<string, number>>({
    queryKey: ['employee-timesheet-hours', rangeStart?.toISOString(), rangeEnd?.toISOString()],
    queryFn: async () => {
      const ids = [...new Set(employeeExpenses.map(e => e.employee_id!).filter(Boolean))];
      if (ids.length === 0) return {};
      let q = supabase
        .from('timesheets')
        .select('employee_id, total_minutes, date')
        .in('employee_id', ids);
      if (rangeStart) q = q.gte('date', rangeStart.toISOString().slice(0, 10));
      if (rangeEnd) q = q.lte('date', rangeEnd.toISOString().slice(0, 10));
      const { data, error } = await q;
      if (error) throw error;
      const map: Record<string, number> = {};
      for (const row of data ?? []) {
        const id = row.employee_id as string;
        map[id] = (map[id] ?? 0) + (Number(row.total_minutes) || 0) / 60;
      }
      return map;
    },
    enabled: employeeExpenses.length > 0,
    staleTime: 30_000,
  });

  const rows = useMemo(() => {
    const byEmp = new Map<string, {
      id: string;
      name: string;
      total: number;
      lines: ExpenseWithDetails[];
      byType: Record<string, number>;
    }>();

    for (const e of employeeExpenses) {
      const id = e.employee_id!;
      const name = e.employee_name || 'Unknown';
      let bucket = byEmp.get(id);
      if (!bucket) {
        bucket = { id, name, total: 0, lines: [], byType: {} };
        byEmp.set(id, bucket);
      }
      bucket.total += Number(e.amount) || 0;
      bucket.lines.push(e);
      const t = e.employee_cost_type || 'other';
      bucket.byType[t] = (bucket.byType[t] ?? 0) + (Number(e.amount) || 0);
    }

    return [...byEmp.values()]
      .map(b => {
        const tsHours = timesheetHours[b.id];
        const manual = hoursByEmp[b.id];
        const hours = manual?.trim()
          ? parseFloat(manual) || 0
          : (tsHours && tsHours > 0 ? Number(tsHours.toFixed(2)) : defaultHours);
        const hourly = hours > 0 ? b.total / hours : 0;
        return { ...b, hours, hourly, hoursSource: manual?.trim() ? 'manual' as const : (tsHours && tsHours > 0 ? 'timesheet' as const : 'assumed' as const) };
      })
      .sort((a, b) => b.total - a.total);
  }, [employeeExpenses, timesheetHours, hoursByEmp, defaultHours]);

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-dashed border-[#E5E7EB] p-6 text-center mb-6">
        <Users size={22} className="mx-auto text-[#9CA3AF] mb-2" />
        <p className="text-sm font-medium text-[#1A1A1A]">No employee costs in this period</p>
        <p className="text-xs text-[#6B7280] mt-1">
          Link multiple expenses to the same person (wages, super, vehicle…) then their total ÷ hours = hourly cost.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden mb-6">
      <div className="px-4 py-3 border-b border-[#E5E7EB] flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-[#0A2540] flex items-center gap-1.5">
            <Clock size={15} className="text-[#2E75B6]" />
            Employee cost rates
          </h2>
          <p className="text-xs text-[#6B7280] mt-0.5">
            All expenses linked to each person are totalled, then divided by hours → true hourly cost
          </p>
        </div>
        <p className="text-[11px] text-[#9CA3AF]">
          Hours: timesheets if available, else assumed ({defaultHours}h). Override per person.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#F9FAFB] text-left text-xs font-medium text-[#4A5568] uppercase tracking-wide">
              <th className="px-4 py-2.5 w-8"></th>
              <th className="px-4 py-2.5">Employee</th>
              <th className="px-4 py-2.5">Cost mix</th>
              <th className="px-4 py-2.5 text-right">Total cost</th>
              <th className="px-4 py-2.5 text-right">Hours</th>
              <th className="px-4 py-2.5 text-right">$/hour</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F3F4F6]">
            {rows.map(r => {
              const open = !!expanded[r.id];
              const mix = Object.entries(r.byType)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 4)
                .map(([t, amt]) => `${employeeCostTypeLabel(t)} ${formatMoney(amt)}`)
                .join(' · ');
              return (
                <Fragment key={r.id}>
                  <tr className="hover:bg-[#F9FAFB]">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setExpanded(e => ({ ...e, [r.id]: !e[r.id] }))}
                        className="text-[#9CA3AF] hover:text-[#1A1A1A]"
                      >
                        {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-[#1A1A1A]">{r.name}</p>
                      <p className="text-[11px] text-[#9CA3AF]">{r.lines.length} expense line{r.lines.length === 1 ? '' : 's'}</p>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#4A5568] max-w-[280px] truncate" title={mix}>{mix || '—'}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-[#1A1A1A]">{formatMoney(r.total)}</td>
                    <td className="px-4 py-3 text-right">
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        value={hoursByEmp[r.id] ?? String(r.hours)}
                        onChange={e => setHoursByEmp(h => ({ ...h, [r.id]: e.target.value }))}
                        className="form-input-sm w-20 text-right ml-auto"
                        title={r.hoursSource === 'timesheet' ? 'From timesheets (editable)' : r.hoursSource === 'manual' ? 'Manual' : 'Assumed default (editable)'}
                      />
                      <p className="text-[10px] text-[#9CA3AF] mt-0.5">
                        {r.hoursSource === 'timesheet' ? 'timesheets' : r.hoursSource === 'manual' ? 'override' : 'assumed'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-base font-bold text-[#0A2540] tabular-nums">{formatMoney(r.hourly)}</span>
                      <span className="text-xs text-[#6B7280]">/hr</span>
                    </td>
                  </tr>
                  {open && (
                    <tr className="bg-[#F9FAFB]">
                      <td colSpan={6} className="px-4 py-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[#6B7280] text-left">
                              <th className="py-1 pr-3 font-medium">Date</th>
                              <th className="py-1 pr-3 font-medium">Type</th>
                              <th className="py-1 pr-3 font-medium">Description</th>
                              <th className="py-1 text-right font-medium">Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.lines.map(line => (
                              <tr key={line.id} className="border-t border-[#E5E7EB]">
                                <td className="py-1.5 pr-3 text-[#4A5568] whitespace-nowrap">
                                  {line.expense_date.slice(0, 10)}
                                </td>
                                <td className="py-1.5 pr-3 text-[#4A5568]">
                                  {line.employee_cost_type
                                    ? employeeCostTypeLabel(line.employee_cost_type)
                                    : '—'}
                                </td>
                                <td className="py-1.5 pr-3 text-[#1A1A1A]">{line.description}</td>
                                <td className="py-1.5 text-right tabular-nums font-medium">{formatMoney(line.amount)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        <p className="text-[11px] text-[#6B7280] mt-2">
                          {formatMoney(r.total)} ÷ {r.hours}h = <strong className="text-[#0A2540]">{formatMoney(r.hourly)}/hr</strong> fully loaded cost
                        </p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
