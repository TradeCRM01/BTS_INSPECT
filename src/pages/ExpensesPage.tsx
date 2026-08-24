import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  endOfMonth, endOfQuarter, format, parseISO, startOfMonth, startOfQuarter, subDays,
} from 'date-fns';
import {
  Plus, Wallet, X, Trash2, TrendingUp, TrendingDown, DollarSign, Users, Building2, Briefcase,
  Bookmark, ChevronDown,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { pageQueryBlocked } from '../lib/devFieldAuditAuth';
import { AppShell } from '../components/layout/AppShell';
import { PageError, EmptyState, SearchBar, useToast } from '../components/ui';
import { SkeletonRow, SkeletonSummaryCards } from '../components/ui/Skeletons';
import { ManagedSelect } from '../components/ui/ManagedSelect';
import { LIST_KEYS } from '../lib/useManagedList';
import {
  ApplyEmployeeCostModelModal,
  ApplyExpenseTemplateModal,
} from '../components/expenses/ExpenseModelsModals';
import { EmployeeCostRatesPanel } from '../components/expenses/EmployeeCostRatesPanel';
import {
  formatMoney,
  EXPENSE_COST_CLASS_LABELS,
  EXPENSE_COST_CLASS_HELP,
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUS_STYLES,
  EXPENSE_PAYMENT_LABELS,
  EXPENSE_RECURRENCE_LABELS,
  type ExpenseWithDetails,
  type ExpenseCostClass,
  type ExpenseStatus,
  type ExpenseRecurrence,
  type ExpensePaymentMethod,
  type EmployeeCostType,
} from '../types/fsm';

type RangeKey = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'all_time';
type ClassFilter = 'all' | ExpenseCostClass;

const RANGE_PRESETS: Record<RangeKey, { label: string; start: Date | null; end: Date | null }> = {
  this_month: { label: 'This month', start: startOfMonth(new Date()), end: endOfMonth(new Date()) },
  last_month: {
    label: 'Last month',
    start: startOfMonth(subDays(startOfMonth(new Date()), 1)),
    end: endOfMonth(subDays(startOfMonth(new Date()), 1)),
  },
  this_quarter: { label: 'This quarter', start: startOfQuarter(new Date()), end: endOfQuarter(new Date()) },
  this_year: {
    label: 'This year',
    start: new Date(new Date().getFullYear(), 0, 1),
    end: new Date(new Date().getFullYear(), 11, 31),
  },
  all_time: { label: 'All time', start: null, end: null },
};

const CLASS_TABS: { key: ClassFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'overhead', label: 'Overheads' },
  { key: 'employee', label: 'Employees' },
  { key: 'cogs', label: 'Cost of sales' },
];

const padNum = (n: number | null) => String(n ?? 0).padStart(4, '0');

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

function moneyTax(amount: number, taxRate: number) {
  const tax = Number(((amount * taxRate) / 100).toFixed(2));
  return { tax_amount: tax, total: Number((amount + tax).toFixed(2)) };
}

export function ExpensesPage() {
  const { profile, company } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [rangeKey, setRangeKey] = useState<RangeKey>('this_month');
  const [classFilter, setClassFilter] = useState<ClassFilter>('all');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<ExpenseWithDetails | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showEmployeeModel, setShowEmployeeModel] = useState(false);
  const [showTemplate, setShowTemplate] = useState(false);

  const range = RANGE_PRESETS[rangeKey];

  const { data: expenses = [], isLoading, error } = useQuery<ExpenseWithDetails[]>({
    queryKey: ['expenses'],
    queryFn: async () => {
      const { data, error: err } = await supabase
        .from('expenses')
        .select('*')
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (err) throw err;
      const list = (data ?? []) as ExpenseWithDetails[];
      const employeeIds = [...new Set(list.map(e => e.employee_id).filter(Boolean))] as string[];
      const jobIds = [...new Set(list.map(e => e.job_id).filter(Boolean))] as string[];
      const supplierIds = [...new Set(list.map(e => e.supplier_id).filter(Boolean))] as string[];
      const [emps, jobs, suppliers] = await Promise.all([
        employeeIds.length
          ? supabase.from('profiles').select('id, name').in('id', employeeIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        jobIds.length
          ? supabase.from('jobs').select('id, title').in('id', jobIds)
          : Promise.resolve({ data: [] as { id: string; title: string }[] }),
        supplierIds.length
          ? supabase.from('suppliers').select('id, name').in('id', supplierIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      const empMap = new Map((emps.data ?? []).map(r => [r.id, r.name]));
      const jobMap = new Map((jobs.data ?? []).map(r => [r.id, r.title]));
      const supMap = new Map((suppliers.data ?? []).map(r => [r.id, r.name]));
      return list.map(e => ({
        ...e,
        amount: Number(e.amount) || 0,
        tax_rate: Number(e.tax_rate) || 0,
        tax_amount: Number(e.tax_amount) || 0,
        total: Number(e.total) || 0,
        employee_name: e.employee_id ? empMap.get(e.employee_id) ?? null : null,
        job_title: e.job_id ? jobMap.get(e.job_id) ?? null : null,
        supplier_name: e.supplier_id ? supMap.get(e.supplier_id) ?? null : null,
      }));
    },
    enabled: !!profile,
  });

  const { data: pnlSource } = useQuery({
    queryKey: ['expenses-pnl', rangeKey, profile?.company_id],
    queryFn: async () => {
      const [inv, costs] = await Promise.all([
        supabase.from('invoices').select('id, status, subtotal, total, created_at'),
        supabase.from('job_costs').select('id, total_cost, created_at'),
      ]);
      if (inv.error) throw inv.error;
      if (costs.error) throw costs.error;
      return {
        invoices: (inv.data ?? []).map(r => ({
          ...r,
          subtotal: Number(r.subtotal) || 0,
          total: Number(r.total) || 0,
        })),
        jobCosts: (costs.data ?? []).map(r => ({
          ...r,
          total_cost: Number(r.total_cost) || 0,
        })),
      };
    },
    enabled: !!profile,
  });

  const filtered = useMemo(() => {
    return expenses.filter(e => {
      if (e.status === 'void') return false;
      if (!inRange(e.expense_date, range.start, range.end)) return false;
      if (classFilter !== 'all' && e.cost_class !== classFilter) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        return (
          e.description.toLowerCase().includes(s)
          || e.category.toLowerCase().includes(s)
          || (e.vendor_name ?? '').toLowerCase().includes(s)
          || (e.employee_name ?? '').toLowerCase().includes(s)
          || `#${padNum(e.expense_number)}`.includes(s)
        );
      }
      return true;
    });
  }, [expenses, range, classFilter, search]);

  const pnl = useMemo(() => {
    const paidRevenue = (pnlSource?.invoices ?? [])
      .filter(i => i.status === 'paid' && inRange(i.created_at, range.start, range.end))
      .reduce((s, i) => s + i.subtotal, 0);

    const jobCogs = (pnlSource?.jobCosts ?? [])
      .filter(c => inRange(c.created_at, range.start, range.end))
      .reduce((s, c) => s + c.total_cost, 0);

    const active = expenses.filter(
      e => e.status !== 'void' && e.status !== 'draft' && inRange(e.expense_date, range.start, range.end),
    );
    const overhead = active.filter(e => e.cost_class === 'overhead').reduce((s, e) => s + e.amount, 0);
    const employee = active.filter(e => e.cost_class === 'employee').reduce((s, e) => s + e.amount, 0);
    const expenseCogs = active.filter(e => e.cost_class === 'cogs').reduce((s, e) => s + e.amount, 0);
    const cogs = jobCogs + expenseCogs;
    const gross = paidRevenue - cogs;
    const net = gross - overhead - employee;
    return { paidRevenue, jobCogs, expenseCogs, cogs, overhead, employee, gross, net, expenseCount: active.length };
  }, [pnlSource, expenses, range]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of filtered) {
      if (e.status === 'draft') continue;
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [filtered]);

  if (pageQueryBlocked(error)) return <AppShell><PageError message="Could not load expenses" /></AppShell>;

  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Expenses</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">
              Business overheads, employee costs, and cost of sales — for accurate gross &amp; net profit
            </p>
          </div>
          <div className="relative flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setEditing(null); setShowForm(true); setShowAddMenu(false); }}
              className="flex items-center gap-2 bg-[#0A2540] text-white px-3 py-2 rounded-l-md text-sm font-medium hover:bg-[#0d2f4e]"
            >
              <Plus size={16} /> Add expense
            </button>
            <button
              type="button"
              onClick={() => setShowAddMenu(v => !v)}
              className="bg-[#0A2540] text-white px-2 py-2 rounded-r-md border-l border-white/20 hover:bg-[#0d2f4e]"
              aria-label="More ways to add"
            >
              <ChevronDown size={16} />
            </button>
            {showAddMenu && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
                <div className="absolute right-0 top-full mt-1 w-64 bg-white border border-[#E5E7EB] rounded-lg shadow-lg py-1 z-50">
                  <button
                    type="button"
                    onClick={() => { setShowAddMenu(false); setEditing(null); setShowForm(true); }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-[#F9FAFB] flex items-start gap-2"
                  >
                    <Plus size={15} className="mt-0.5 text-[#4A5568]" />
                    <span>
                      <span className="font-medium text-[#1A1A1A] block">Single expense</span>
                      <span className="text-xs text-[#6B7280]">One-off cost entry</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddMenu(false); setShowEmployeeModel(true); }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-[#F9FAFB] flex items-start gap-2"
                  >
                    <Users size={15} className="mt-0.5 text-[#2E75B6]" />
                    <span>
                      <span className="font-medium text-[#1A1A1A] block">Employee cost model</span>
                      <span className="text-xs text-[#6B7280]">Apply wages package × staff</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowAddMenu(false); setShowTemplate(true); }}
                    className="w-full text-left px-3 py-2.5 text-sm hover:bg-[#F9FAFB] flex items-start gap-2"
                  >
                    <Bookmark size={15} className="mt-0.5 text-[#F7931A]" />
                    <span>
                      <span className="font-medium text-[#1A1A1A] block">Quick template</span>
                      <span className="text-xs text-[#6B7280]">Rent, insurance &amp; other fixed costs</span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={() => setShowEmployeeModel(true)}
            className="text-left rounded-xl border border-[#E5E7EB] bg-white p-4 hover:border-[#2E75B6] hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0A2540]">
              <Users size={16} className="text-[#2E75B6]" /> Employee cost models
            </div>
            <p className="text-xs text-[#6B7280] mt-1">
              Build a wages + super + vehicle package once, then post it for every team member (with overrides).
            </p>
          </button>
          <button
            type="button"
            onClick={() => setShowTemplate(true)}
            className="text-left rounded-xl border border-[#E5E7EB] bg-white p-4 hover:border-[#F7931A] hover:shadow-sm transition-all"
          >
            <div className="flex items-center gap-2 text-sm font-semibold text-[#0A2540]">
              <Bookmark size={16} className="text-[#F7931A]" /> Recurring expense templates
            </div>
            <p className="text-xs text-[#6B7280] mt-1">
              Save monthly overheads (rent, software, insurance) and post the whole set in one click.
            </p>
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {(Object.keys(RANGE_PRESETS) as RangeKey[]).map(key => (
            <button
              key={key}
              type="button"
              onClick={() => setRangeKey(key)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                rangeKey === key ? 'bg-[#0A2540] text-white' : 'bg-gray-100 text-[#4A5568] hover:bg-gray-200'
              }`}
            >
              {RANGE_PRESETS[key].label}
            </button>
          ))}
        </div>

        {/* P&L strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          {isLoading ? (
            <SkeletonSummaryCards count={4} />
          ) : (
            <>
              <PnlCard label="Revenue (paid)" value={pnl.paidRevenue} hint="Invoice subtotals (ex GST)" tone="neutral" icon={DollarSign} />
              <PnlCard label="Cost of sales" value={pnl.cogs} hint={`Jobs ${formatMoney(pnl.jobCogs)} + expenses ${formatMoney(pnl.expenseCogs)}`} tone="down" icon={Briefcase} />
              <PnlCard label="Gross profit" value={pnl.gross} hint="Revenue − cost of sales" tone={pnl.gross >= 0 ? 'up' : 'down'} icon={TrendingUp} />
              <PnlCard label="Net profit" value={pnl.net} hint={`After overheads ${formatMoney(pnl.overhead)} + staff ${formatMoney(pnl.employee)}`} tone={pnl.net >= 0 ? 'up' : 'down'} icon={pnl.net >= 0 ? TrendingUp : TrendingDown} emphasize />
            </>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <MiniStat icon={Building2} label="Overheads" value={formatMoney(pnl.overhead)} />
          <MiniStat icon={Users} label="Employee costs" value={formatMoney(pnl.employee)} />
          <MiniStat icon={Wallet} label="Expenses logged" value={String(pnl.expenseCount)} />
        </div>

        {byCategory.length > 0 && (
          <div className="bg-white rounded-xl border border-[#E5E7EB] p-4 mb-6">
            <h2 className="text-sm font-semibold text-[#0A2540] mb-3">Spend by category (filtered list)</h2>
            <div className="space-y-2">
              {byCategory.map(([cat, amt]) => {
                const max = byCategory[0][1] || 1;
                const pct = Math.max(4, Math.round((amt / max) * 100));
                return (
                  <div key={cat} className="flex items-center gap-3 text-sm">
                    <span className="w-40 truncate text-[#4A5568] shrink-0">{cat}</span>
                    <div className="flex-1 h-2 rounded-full bg-[#F3F4F6] overflow-hidden">
                      <div className="h-full rounded-full bg-[#2E75B6]" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-24 text-right font-medium text-[#1A1A1A] tabular-nums">{formatMoney(amt)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <SearchBar value={search} onChange={setSearch} placeholder="Search description, vendor, employee, category…" />
        </div>

        <div className="flex items-center gap-1 mb-4 border-b border-[#E5E7EB] overflow-x-auto">
          {CLASS_TABS.map(tab => {
            const count = tab.key === 'all'
              ? expenses.filter(e => e.status !== 'void' && inRange(e.expense_date, range.start, range.end)).length
              : expenses.filter(e => e.status !== 'void' && e.cost_class === tab.key && inRange(e.expense_date, range.start, range.end)).length;
            const active = classFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setClassFilter(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap ${
                  active ? 'border-[#0A2540] text-[#0A2540]' : 'border-transparent text-[#4A5568] hover:text-[#1A1A1A]'
                }`}
              >
                {tab.label}
                <span className={`text-xs px-1.5 rounded-full ${active ? 'bg-[#0A2540] text-white' : 'bg-gray-100 text-[#4A5568]'}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {(classFilter === 'employee' || classFilter === 'all') && (
          <EmployeeCostRatesPanel
            expenses={expenses}
            rangeStart={range.start}
            rangeEnd={range.end}
            defaultHours={152}
          />
        )}

        {isLoading ? (
          <SkeletonRow />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title={search || classFilter !== 'all' ? 'No expenses match' : 'No expenses yet'}
            message={search || classFilter !== 'all'
              ? 'Try another filter or date range.'
              : 'Log rent, wages, fuel, software and other costs to see true net profit.'}
            action={!search && classFilter === 'all' && (
              <div className="flex flex-wrap gap-2 justify-center">
                <button type="button" onClick={() => setShowEmployeeModel(true)} className="btn-secondary">
                  <Users size={16} /> Apply staff cost model
                </button>
                <button type="button" onClick={() => { setEditing(null); setShowForm(true); }} className="btn-primary">
                  <Plus size={16} /> Add expense
                </button>
              </div>
            )}
          />
        ) : (
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#F9FAFB] text-left text-xs font-medium text-[#4A5568] uppercase tracking-wide">
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Description</th>
                    <th className="px-4 py-3">Who / vendor</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Amount (ex)</th>
                    <th className="px-4 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F3F4F6]">
                  {filtered.map(e => (
                    <tr
                      key={e.id}
                      onClick={() => { setEditing(e); setShowForm(true); }}
                      className="hover:bg-[#F9FAFB] cursor-pointer"
                    >
                      <td className="px-4 py-3 text-[#4A5568] whitespace-nowrap">{format(parseISO(e.expense_date), 'd MMM yyyy')}</td>
                      <td className="px-4 py-3 font-medium text-[#2E75B6]">#{padNum(e.expense_number)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium text-[#4A5568]">{EXPENSE_COST_CLASS_LABELS[e.cost_class]}</span>
                      </td>
                      <td className="px-4 py-3 text-[#1A1A1A]">{e.category}</td>
                      <td className="px-4 py-3 text-[#1A1A1A] max-w-[200px] truncate">{e.description}</td>
                      <td className="px-4 py-3 text-[#4A5568] max-w-[140px] truncate">
                        {e.employee_name || e.vendor_name || e.supplier_name || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${EXPENSE_STATUS_STYLES[e.status]}`}>
                          {EXPENSE_STATUS_LABELS[e.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatMoney(e.amount)}</td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(e.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <ExpenseEditorModal
          expense={editing}
          defaultTaxRate={company?.default_tax_rate ?? 10}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['expenses-pnl'] });
            showToast(editing ? 'Expense updated' : 'Expense recorded');
          }}
          onDeleted={() => {
            setShowForm(false);
            queryClient.invalidateQueries({ queryKey: ['expenses'] });
            queryClient.invalidateQueries({ queryKey: ['expenses-pnl'] });
            showToast('Expense deleted');
          }}
        />
      )}

      {showEmployeeModel && (
        <ApplyEmployeeCostModelModal
          onClose={() => setShowEmployeeModel(false)}
          onApplied={(count) => {
            setShowEmployeeModel(false);
            showToast(`Posted ${count} employee cost line${count === 1 ? '' : 's'}`);
          }}
        />
      )}

      {showTemplate && (
        <ApplyExpenseTemplateModal
          onClose={() => setShowTemplate(false)}
          onApplied={(count) => {
            setShowTemplate(false);
            showToast(`Posted ${count} expense line${count === 1 ? '' : 's'}`);
          }}
        />
      )}
    </AppShell>
  );
}

function PnlCard({
  label, value, hint, tone, icon: Icon, emphasize,
}: {
  label: string;
  value: number;
  hint: string;
  tone: 'up' | 'down' | 'neutral';
  icon: typeof DollarSign;
  emphasize?: boolean;
}) {
  const valueColor = tone === 'up' ? 'text-green-700' : tone === 'down' ? 'text-red-600' : 'text-[#0A2540]';
  return (
    <div className={`rounded-xl border p-4 ${emphasize ? 'bg-[#0A2540] border-[#0A2540] text-white' : 'bg-white border-[#E5E7EB]'}`}>
      <div className={`flex items-center gap-1.5 text-xs font-medium ${emphasize ? 'text-white/70' : 'text-[#4A5568]'}`}>
        <Icon size={14} /> {label}
      </div>
      <p className={`mt-1 text-xl font-bold tabular-nums ${emphasize ? 'text-white' : valueColor}`}>
        {formatMoney(value)}
      </p>
      <p className={`text-[11px] mt-1 ${emphasize ? 'text-white/60' : 'text-[#9CA3AF]'}`}>{hint}</p>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: typeof Wallet; label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] px-4 py-3 flex items-center gap-3">
      <div className="w-9 h-9 rounded-lg bg-[#EFF6FF] flex items-center justify-center text-[#2E75B6]">
        <Icon size={16} />
      </div>
      <div>
        <p className="text-xs text-[#4A5568]">{label}</p>
        <p className="text-sm font-semibold text-[#1A1A1A]">{value}</p>
      </div>
    </div>
  );
}

interface FormState {
  cost_class: ExpenseCostClass;
  category: string;
  employee_cost_type: EmployeeCostType | '';
  description: string;
  amount: string;
  tax_rate: string;
  expense_date: string;
  period_start: string;
  period_end: string;
  vendor_name: string;
  supplier_id: string;
  employee_id: string;
  job_id: string;
  payment_method: ExpensePaymentMethod | '';
  reference: string;
  is_reimbursable: boolean;
  reimbursed: boolean;
  recurrence: ExpenseRecurrence;
  status: ExpenseStatus;
  notes: string;
}

function ExpenseEditorModal({
  expense, defaultTaxRate, onClose, onSaved, onDeleted,
}: {
  expense: ExpenseWithDetails | null;
  defaultTaxRate: number;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [jobs, setJobs] = useState<{ id: string; title: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);

  const [form, setForm] = useState<FormState>({
    cost_class: expense?.cost_class ?? 'overhead',
    category: expense?.category ?? '',
    employee_cost_type: expense?.employee_cost_type ?? '',
    description: expense?.description ?? '',
    amount: expense ? String(expense.amount) : '',
    tax_rate: String(expense?.tax_rate ?? defaultTaxRate),
    expense_date: expense?.expense_date ?? format(new Date(), 'yyyy-MM-dd'),
    period_start: expense?.period_start ?? '',
    period_end: expense?.period_end ?? '',
    vendor_name: expense?.vendor_name ?? '',
    supplier_id: expense?.supplier_id ?? '',
    employee_id: expense?.employee_id ?? '',
    job_id: expense?.job_id ?? '',
    payment_method: expense?.payment_method ?? '',
    reference: expense?.reference ?? '',
    is_reimbursable: expense?.is_reimbursable ?? false,
    reimbursed: expense?.reimbursed ?? false,
    recurrence: expense?.recurrence ?? 'one_off',
    status: expense?.status ?? 'recorded',
    notes: expense?.notes ?? '',
  });

  useEffect(() => {
    if (!profile?.company_id) return;
    (async () => {
      const [e, j, s] = await Promise.all([
        supabase.from('profiles').select('id, name').eq('company_id', profile.company_id).order('name'),
        supabase.from('jobs').select('id, title').order('created_at', { ascending: false }).limit(200),
        supabase.from('suppliers').select('id, name').eq('archived', false).order('name'),
      ]);
      if (e.data) setEmployees(e.data);
      if (j.data) setJobs(j.data);
      if (s.data) setSuppliers(s.data);
    })();
  }, [profile?.company_id]);

  const amountNum = parseFloat(form.amount) || 0;
  const taxRateNum = parseFloat(form.tax_rate) || 0;
  const { tax_amount, total } = moneyTax(amountNum, taxRateNum);

  const suggestCategory = (costClass: ExpenseCostClass) => {
    if (form.category) return;
    if (costClass === 'employee') setForm(f => ({ ...f, category: 'Wages & Salaries' }));
    if (costClass === 'cogs') setForm(f => ({ ...f, category: 'Subcontractors' }));
  };

  const handleSave = async () => {
    if (!profile?.company_id) return;
    if (!form.description.trim()) { setErr('Description is required'); return; }
    if (!form.category.trim()) { setErr('Pick a category'); return; }
    if (amountNum < 0) { setErr('Amount cannot be negative'); return; }
    if (form.cost_class === 'employee' && !form.employee_id && !form.employee_cost_type) {
      setErr('For employee costs, pick an employee or cost type');
      return;
    }
    setSaving(true); setErr('');
    const payload = {
      cost_class: form.cost_class,
      category: form.category.trim(),
      employee_cost_type: form.cost_class === 'employee' && form.employee_cost_type
        ? form.employee_cost_type
        : null,
      description: form.description.trim(),
      amount: amountNum,
      tax_rate: taxRateNum,
      tax_amount,
      total,
      expense_date: form.expense_date,
      period_start: form.period_start || null,
      period_end: form.period_end || null,
      vendor_name: form.vendor_name.trim() || null,
      supplier_id: form.supplier_id || null,
      employee_id: form.employee_id || null,
      job_id: form.job_id || null,
      payment_method: form.payment_method || null,
      reference: form.reference.trim() || null,
      is_reimbursable: form.is_reimbursable,
      reimbursed: form.reimbursed,
      recurrence: form.recurrence,
      status: form.status,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { error } = expense
      ? await supabase.from('expenses').update(payload).eq('id', expense.id)
      : await supabase.from('expenses').insert({
          ...payload,
          company_id: profile.company_id,
          created_by: profile.id,
        });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved();
  };

  const handleDelete = async () => {
    if (!expense) return;
    if (!confirm('Delete this expense permanently?')) return;
    setDeleting(true);
    const { error } = await supabase.from('expenses').delete().eq('id', expense.id);
    setDeleting(false);
    if (error) { setErr(error.message); return; }
    onDeleted();
  };

  return (
    <div className="overlay-backdrop">
      <div className="overlay-panel-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-[#1A1A1A]">
              {expense ? 'Edit expense' : 'Add expense'}
            </h2>
            {expense?.expense_number != null && (
              <p className="text-xs text-[#2E75B6] font-medium mt-0.5">#{padNum(expense.expense_number)}</p>
            )}
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="overlay-body space-y-4">
          <div>
            <p className="text-xs font-medium text-[#4A5568] mb-1.5">What kind of cost is this?</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(Object.keys(EXPENSE_COST_CLASS_LABELS) as ExpenseCostClass[]).map(key => {
                const selected = form.cost_class === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setForm(f => ({
                        ...f,
                        cost_class: key,
                        employee_cost_type: key === 'employee' ? f.employee_cost_type : '',
                      }));
                      suggestCategory(key);
                    }}
                    className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                      selected ? 'border-[#0A2540] bg-[#EFF6FF]' : 'border-[#E5E7EB] hover:bg-[#F9FAFB]'
                    }`}
                  >
                    <p className="text-sm font-semibold text-[#1A1A1A]">{EXPENSE_COST_CLASS_LABELS[key]}</p>
                    <p className="text-[11px] text-[#6B7280] mt-0.5 leading-snug">{EXPENSE_COST_CLASS_HELP[key]}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Category" required>
              <ManagedSelect
                listKey={LIST_KEYS.expenseCategories}
                value={form.category}
                onChange={v => setForm(f => ({ ...f, category: v }))}
                placeholder="Select or add category…"
                allowAdd
                className="form-input-sm"
              />
            </Field>
            <Field label="Date" required>
              <input type="date" value={form.expense_date}
                onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
                className="form-input" />
            </Field>
          </div>

          <Field label="Description" required>
            <input
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="form-input"
              placeholder="e.g. March warehouse rent, weekly wages for Sam…"
            />
          </Field>

          {form.cost_class === 'employee' && (
            <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3 space-y-3">
              <p className="text-xs font-semibold text-purple-900 uppercase tracking-wide">Employee details</p>
              <p className="text-[11px] text-purple-800/80">
                Link wages, super, vehicle, tools etc. to the same person — Expenses → Employees tab totals them into a $/hour rate.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Team member">
                  <select value={form.employee_id} onChange={e => setForm(f => ({ ...f, employee_id: e.target.value }))}
                    className="form-input cursor-pointer">
                    <option value="">Not linked</option>
                    {employees.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </Field>
                <Field label="Employee cost type">
                  <ManagedSelect
                    listKey={LIST_KEYS.employeeCostTypes}
                    value={form.employee_cost_type}
                    onChange={v => setForm(f => ({ ...f, employee_cost_type: v }))}
                    placeholder="Select…"
                    allowAdd
                    allowDelete
                    className="form-input"
                  />
                </Field>
                <Field label="Pay period start">
                  <input type="date" value={form.period_start}
                    onChange={e => setForm(f => ({ ...f, period_start: e.target.value }))}
                    className="form-input" />
                </Field>
                <Field label="Pay period end">
                  <input type="date" value={form.period_end}
                    onChange={e => setForm(f => ({ ...f, period_end: e.target.value }))}
                    className="form-input" />
                </Field>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-[#E5E7EB] bg-[#F9FAFB] p-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="Amount (ex GST)">
                <input type="number" min="0" step="0.01" value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                  className="form-input" placeholder="0.00" />
              </Field>
              <Field label="Tax %">
                <input type="number" min="0" step="0.01" value={form.tax_rate}
                  onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))}
                  className="form-input" />
              </Field>
              <Field label="Tax amount">
                <input value={formatMoney(tax_amount)} readOnly className="form-input bg-white text-[#4A5568]" />
              </Field>
              <Field label="Total paid">
                <input value={formatMoney(total)} readOnly className="form-input bg-white font-semibold text-[#0A2540]" />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Vendor / payee">
              <input value={form.vendor_name} onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
                className="form-input" placeholder="Who was paid?" />
            </Field>
            <Field label="Supplier (optional)">
              <select value={form.supplier_id} onChange={e => setForm(f => ({ ...f, supplier_id: e.target.value }))}
                className="form-input cursor-pointer">
                <option value="">None</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Linked job (optional)">
              <select value={form.job_id} onChange={e => setForm(f => ({ ...f, job_id: e.target.value }))}
                className="form-input cursor-pointer">
                <option value="">No job link</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </Field>
            <Field label="Payment method">
              <select
                value={form.payment_method}
                onChange={e => setForm(f => ({ ...f, payment_method: e.target.value as ExpensePaymentMethod | '' }))}
                className="form-input cursor-pointer"
              >
                <option value="">Not set</option>
                {(Object.keys(EXPENSE_PAYMENT_LABELS) as ExpensePaymentMethod[]).map(k => (
                  <option key={k} value={k}>{EXPENSE_PAYMENT_LABELS[k]}</option>
                ))}
              </select>
            </Field>
            <Field label="Reference / receipt #">
              <input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
                className="form-input" placeholder="Invoice or receipt number" />
            </Field>
            <Field label="Recurrence">
              <select
                value={form.recurrence}
                onChange={e => setForm(f => ({ ...f, recurrence: e.target.value as ExpenseRecurrence }))}
                className="form-input cursor-pointer"
              >
                {(Object.keys(EXPENSE_RECURRENCE_LABELS) as ExpenseRecurrence[]).map(k => (
                  <option key={k} value={k}>{EXPENSE_RECURRENCE_LABELS[k]}</option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={form.status}
                onChange={e => setForm(f => ({ ...f, status: e.target.value as ExpenseStatus }))}
                className="form-input cursor-pointer"
              >
                {(Object.keys(EXPENSE_STATUS_LABELS) as ExpenseStatus[]).map(k => (
                  <option key={k} value={k}>{EXPENSE_STATUS_LABELS[k]}</option>
                ))}
              </select>
            </Field>
          </div>

          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm text-[#4A5568] cursor-pointer">
              <input type="checkbox" checked={form.is_reimbursable}
                onChange={e => setForm(f => ({ ...f, is_reimbursable: e.target.checked }))}
                className="rounded border-gray-300" />
              Staff reimbursable
            </label>
            {form.is_reimbursable && (
              <label className="flex items-center gap-2 text-sm text-[#4A5568] cursor-pointer">
                <input type="checkbox" checked={form.reimbursed}
                  onChange={e => setForm(f => ({ ...f, reimbursed: e.target.checked }))}
                  className="rounded border-gray-300" />
                Already reimbursed
              </label>
            )}
          </div>

          <Field label="Notes">
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="form-input min-h-[60px] resize-y" placeholder="Internal notes…" />
          </Field>

          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>

        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-100">
          {expense ? (
            <button type="button" onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-1.5 text-sm text-red-600 hover:underline disabled:opacity-50">
              <Trash2 size={14} /> {deleting ? 'Deleting…' : 'Delete'}
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-[#4A5568] border border-[#E5E7EB] rounded-md hover:bg-gray-50">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-[#0A2540] rounded-md hover:bg-[#0d2f4e] disabled:opacity-50">
              {saving ? 'Saving…' : expense ? 'Save changes' : 'Save expense'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#4A5568] mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
