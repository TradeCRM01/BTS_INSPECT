import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { AppShell } from '../components/layout/AppShell';
import { LoadingSpinner } from '../components/ui/LoadingSpinner';
import { PageError } from '../components/ui/PageError';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Briefcase,
  Clock,
  Users,
  AlertCircle,
  FileText,
  Receipt,
  Package,
  Wrench,
  BarChart3,
  Calendar,
  Download,
} from 'lucide-react';
import { format, parseISO, subDays, startOfMonth, endOfMonth, format as fmt } from 'date-fns';
import { formatMoney, formatDuration } from '../types/fsm';

// ── Date range presets ────────────────────────────────────────────
type RangeKey = 'this_month' | 'last_month' | 'this_quarter' | 'this_year' | 'all_time';

interface RangePreset {
  label: string;
  start: Date | null;
  end: Date | null;
}

const RANGE_PRESETS: Record<RangeKey, RangePreset> = {
  this_month: {
    label: 'This Month',
    start: startOfMonth(new Date()),
    end: endOfMonth(new Date()),
  },
  last_month: {
    label: 'Last Month',
    start: startOfMonth(subDays(startOfMonth(new Date()), 1)),
    end: endOfMonth(subDays(startOfMonth(new Date()), 1)),
  },
  this_quarter: {
    label: 'This Quarter',
    start: startOfQuarter(new Date()),
    end: endOfQuarter(new Date()),
  },
  this_year: {
    label: 'This Year',
    start: new Date(new Date().getFullYear(), 0, 1),
    end: new Date(new Date().getFullYear(), 11, 31, 23, 59, 59),
  },
  all_time: {
    label: 'All Time',
    start: null,
    end: null,
  },
};

function startOfQuarter(d: Date): Date {
  const m = d.getMonth();
  const qStart = Math.floor(m / 3) * 3;
  return new Date(d.getFullYear(), qStart, 1);
}

function endOfQuarter(d: Date): Date {
  const m = d.getMonth();
  const qEnd = Math.floor(m / 3) * 3 + 2;
  return endOfMonth(new Date(d.getFullYear(), qEnd, 1));
}

// ── Raw row shapes (loose typing for reporting aggregates) ────────
interface InvoiceRow {
  id: string;
  status: string;
  total: number;
  client_id: string | null;
  job_id: string | null;
  created_at: string;
  due_date: string | null;
}
interface QuoteRow {
  id: string;
  status: string;
  total: number;
  client_id: string | null;
  created_at: string;
}
interface JobRow {
  id: string;
  title: string;
  status: string;
  client_id: string | null;
  created_at: string;
}
interface JobCostRow {
  id: string;
  total_cost: number;
  cost_type: string;
  job_id: string;
  created_at: string;
}
interface TimesheetRow {
  id: string;
  employee_id: string;
  date: string;
  total_minutes: number;
  status: string;
}
interface StockItemRow {
  id: string;
  name: string;
  sku: string | null;
  quantity_on_hand: number;
  reorder_level: number;
  unit_cost: number;
  archived: boolean;
}
interface ContractRow {
  id: string;
  title: string;
  client_id: string;
  status: string;
  end_date: string | null;
  contract_value: number;
  next_service_date: string | null;
}
interface ClientRow {
  id: string;
  name: string;
}
interface MemberRow {
  id: string;
  name: string;
}

// ── Page component ────────────────────────────────────────────────
export function AdvancedReportsPage() {
  const { profile } = useAuth();
  const [rangeKey, setRangeKey] = useState<RangeKey>('this_month');

  const companyId = profile?.company_id;
  const range = RANGE_PRESETS[rangeKey];

  // Single query that fetches everything for the company in parallel.
  // Each queryFn guards against missing company_id and degrades to [].
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['advanced-reports', companyId, rangeKey],
    queryFn: async () => {
      if (!companyId) return null;

      const startISO = range.start ? range.start.toISOString() : null;
      const endISO = range.end ? range.end.toISOString() : null;

      const [
        invoicesRes,
        quotesRes,
        jobsRes,
        jobCostsRes,
        timesheetsRes,
        stockRes,
        contractsRes,
      ] = await Promise.all([
        supabase.from('invoices').select('*').eq('company_id', companyId),
        supabase.from('quotes').select('*').eq('company_id', companyId),
        supabase.from('jobs').select('*').eq('company_id', companyId),
        supabase.from('job_costs').select('*').eq('company_id', companyId),
        supabase.from('timesheets').select('*').eq('company_id', companyId),
        supabase.from('stock_items').select('*').eq('company_id', companyId),
        supabase.from('service_contracts').select('*').eq('company_id', companyId),
      ]);

      // Surface query errors but don't crash — reporting should still show zeros.
      const anyError =
        invoicesRes.error ||
        quotesRes.error ||
        jobsRes.error ||
        jobCostsRes.error ||
        timesheetsRes.error ||
        stockRes.error ||
        contractsRes.error;
      if (anyError) throw anyError;

      const invoices = (invoicesRes.data ?? []) as unknown as InvoiceRow[];
      const quotes = (quotesRes.data ?? []) as unknown as QuoteRow[];
      const jobs = (jobsRes.data ?? []) as unknown as JobRow[];
      const jobCosts = (jobCostsRes.data ?? []) as unknown as JobCostRow[];
      const timesheets = (timesheetsRes.data ?? []) as unknown as TimesheetRow[];
      const stockItems = (stockRes.data ?? []) as unknown as StockItemRow[];
      const contracts = (contractsRes.data ?? []) as unknown as ContractRow[];

      // Resolve client + employee names client-side (mirrors InvoicesPage pattern).
      const clientIds = [
        ...new Set([
          ...invoices.map((i) => i.client_id).filter(Boolean) as string[],
          ...quotes.map((q) => q.client_id).filter(Boolean) as string[],
          ...jobs.map((j) => j.client_id).filter(Boolean) as string[],
          ...contracts.map((c) => c.client_id).filter(Boolean) as string[],
        ]),
      ];
      const employeeIds = [...new Set(timesheets.map((t) => t.employee_id).filter(Boolean))] as string[];

      const [clientsRes, membersRes] = await Promise.all([
        clientIds.length
          ? supabase.from('clients').select('id, name').in('id', clientIds)
          : Promise.resolve({ data: [], error: null }),
        employeeIds.length
          ? supabase.rpc('get_company_members', { p_company_id: companyId })
          : Promise.resolve({ data: [], error: null }),
      ]);

      const clients = (clientsRes.data ?? []) as unknown as ClientRow[];
      const members = (membersRes.data ?? []) as unknown as MemberRow[];

      return {
        invoices,
        quotes,
        jobs,
        jobCosts,
        timesheets,
        stockItems,
        contracts,
        clients,
        members,
        startISO,
        endISO,
      };
    },
    enabled: !!companyId,
  });

  // ── Filtering by the active date range ──────────────────────────
  const filtered = useMemo(() => {
    const d = data;
    if (!d) return null;
    const { startISO, endISO } = d;

    const inRange = (iso: string | null): boolean => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      if (startISO && t < new Date(startISO).getTime()) return false;
      if (endISO && t > new Date(endISO).getTime()) return false;
      return true;
    };

    return {
      invoices: d.invoices.filter((i) => inRange(i.created_at)),
      quotes: d.quotes.filter((q) => inRange(q.created_at)),
      jobs: d.jobs.filter((j) => inRange(j.created_at)),
      jobCosts: d.jobCosts.filter((c) => inRange(c.created_at)),
      timesheets: d.timesheets.filter((t) => inRange(`${t.date}T00:00:00`)),
      // Stock & contracts are point-in-time snapshots — not date-range scoped.
      stockItems: d.stockItems,
      contracts: d.contracts,
      clients: d.clients,
      members: d.members,
    };
  }, [data]);

  // ── KPI calculations ────────────────────────────────────────────
  const kpis = useMemo(() => {
    if (!filtered) {
      return {
        totalRevenue: 0,
        outstanding: 0,
        overdue: 0,
        quoteAcceptanceRate: 0,
        totalJobCosts: 0,
        avgJobValue: 0,
        labourHours: 0,
        activeJobs: 0,
      };
    }

    const totalRevenue = filtered.invoices
      .filter((i) => i.status === 'paid')
      .reduce((s, i) => s + Number(i.total || 0), 0);

    const outstanding = filtered.invoices
      .filter((i) => i.status === 'sent' || i.status === 'overdue')
      .reduce((s, i) => s + Number(i.total || 0), 0);

    const now = Date.now();
    const overdue = filtered.invoices
      .filter((i) => i.status === 'overdue' || (i.status === 'sent' && i.due_date && new Date(i.due_date).getTime() < now))
      .reduce((s, i) => s + Number(i.total || 0), 0);

    const acceptedQuotes = filtered.quotes.filter((q) => q.status === 'accepted').length;
    const totalQuotes = filtered.quotes.length;
    const quoteAcceptanceRate = totalQuotes > 0 ? (acceptedQuotes / totalQuotes) * 100 : 0;

    const totalJobCosts = filtered.jobCosts.reduce((s, c) => s + Number(c.total_cost || 0), 0);

    // Average job value: mean of invoiced totals in range (revenue proxy).
    const invoicedTotals = filtered.invoices.map((i) => Number(i.total || 0));
    const avgJobValue =
      invoicedTotals.length > 0
        ? invoicedTotals.reduce((s, t) => s + t, 0) / invoicedTotals.length
        : 0;

    const labourMinutes = filtered.timesheets.reduce((s, t) => s + Number(t.total_minutes || 0), 0);
    const labourHours = labourMinutes / 60;

    const activeJobs = filtered.jobs.filter((j) => j.status !== 'completed' && j.status !== 'cancelled' && j.status !== 'closed').length;

    return {
      totalRevenue,
      outstanding,
      overdue,
      quoteAcceptanceRate,
      totalJobCosts,
      avgJobValue,
      labourHours,
      activeJobs,
    };
  }, [filtered]);

  // ── Revenue vs Costs monthly breakdown (bar chart) ──────────────
  const monthlyData = useMemo(() => {
    if (!filtered) return [];
    // Keyed by "yyyy-MM" so sorting is chronological by the string itself.
    const buckets = new Map<string, { label: string; revenue: number; costs: number }>();

    const ensure = (ymKey: string, label: string) => {
      if (!buckets.has(ymKey)) buckets.set(ymKey, { label, revenue: 0, costs: 0 });
      return buckets.get(ymKey)!;
    };

    filtered.invoices.forEach((i) => {
      if (i.status !== 'paid') return;
      const d = parseISO(i.created_at);
      ensure(fmt(d, 'yyyy-MM'), fmt(d, 'MMM yy')).revenue += Number(i.total || 0);
    });
    filtered.jobCosts.forEach((c) => {
      const d = parseISO(c.created_at);
      ensure(fmt(d, 'yyyy-MM'), fmt(d, 'MMM yy')).costs += Number(c.total_cost || 0);
    });

    return Array.from(buckets.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([, v]) => v);
  }, [filtered]);

  // ── Top 5 clients by revenue ────────────────────────────────────
  const topClients = useMemo(() => {
    if (!filtered) return [];
    const clientMap = new Map(filtered.clients.map((c) => [c.id, c.name]));
    const totals = new Map<string, number>();

    filtered.invoices
      .filter((i) => i.status === 'paid' && i.client_id)
      .forEach((i) => {
        totals.set(i.client_id!, (totals.get(i.client_id!) ?? 0) + Number(i.total || 0));
      });

    return Array.from(totals.entries())
      .map(([clientId, revenue]) => ({
        clientId,
        name: clientMap.get(clientId) ?? 'Unknown Client',
        revenue,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [filtered]);

  // ── Technician productivity (hours per employee) ────────────────
  const technicianProductivity = useMemo(() => {
    if (!filtered) return [];
    const memberMap = new Map(filtered.members.map((m) => [m.id, m.name]));
    const minutesByEmployee = new Map<string, number>();

    filtered.timesheets.forEach((t) => {
      minutesByEmployee.set(
        t.employee_id,
        (minutesByEmployee.get(t.employee_id) ?? 0) + Number(t.total_minutes || 0),
      );
    });

    return Array.from(minutesByEmployee.entries())
      .map(([employeeId, minutes]) => ({
        employeeId,
        name: memberMap.get(employeeId) ?? 'Unknown Technician',
        minutes,
        hours: minutes / 60,
      }))
      .sort((a, b) => b.minutes - a.minutes);
  }, [filtered]);

  // ── Low stock alerts ────────────────────────────────────────────
  const lowStock = useMemo(() => {
    if (!filtered) return [];
    return filtered.stockItems
      .filter((s) => !s.archived && s.quantity_on_hand <= s.reorder_level)
      .sort((a, b) => a.quantity_on_hand - b.quantity_on_hand);
  }, [filtered]);

  // ── Expiring contracts (next 60 days) ───────────────────────────
  const expiringContracts = useMemo(() => {
    if (!filtered) return [];
    const now = Date.now();
    const horizon = now + 60 * 24 * 60 * 60 * 1000;
    const clientMap = new Map(filtered.clients.map((c) => [c.id, c.name]));

    return filtered.contracts
      .filter((c) => {
        if (c.status === 'cancelled' || c.status === 'expired') return false;
        const ref = c.end_date ?? c.next_service_date;
        if (!ref) return false;
        const t = new Date(ref).getTime();
        return t >= now && t <= horizon;
      })
      .map((c) => ({
        ...c,
        clientName: clientMap.get(c.client_id) ?? 'Unknown Client',
        expiryRef: c.end_date ?? c.next_service_date!,
      }))
      .sort((a, b) => new Date(a.expiryRef).getTime() - new Date(b.expiryRef).getTime());
  }, [filtered]);

  // ── Export CSV of the current KPI snapshot ──────────────────────
  const handleExportCSV = () => {
    const rows = [
      ['Metric', 'Value'],
      ['Total Revenue', String(kpis.totalRevenue.toFixed(2))],
      ['Outstanding', String(kpis.outstanding.toFixed(2))],
      ['Overdue', String(kpis.overdue.toFixed(2))],
      ['Quote Acceptance Rate (%)', String(kpis.quoteAcceptanceRate.toFixed(1))],
      ['Total Job Costs', String(kpis.totalJobCosts.toFixed(2))],
      ['Average Job Value', String(kpis.avgJobValue.toFixed(2))],
      ['Labour Hours', String(kpis.labourHours.toFixed(2))],
      ['Active Jobs', String(kpis.activeJobs)],
    ];
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `advanced-report-${rangeKey}-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ── Render ──────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <AppShell>
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <PageError message="Could not load reports data" onRetry={() => refetch()} />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-[1400px] mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A]">Advanced Reports &amp; KPIs</h1>
            <p className="text-sm text-[#4A5568] mt-0.5">
              {range.label}
              {range.start && range.end && (
                <> &middot; {format(range.start, 'd MMM yyyy')} — {format(range.end, 'd MMM yyyy')}</>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 bg-[#0A2540] text-white px-3 py-2 rounded-md text-sm font-medium hover:bg-[#0d2f4e] transition-colors"
            >
              <Download size={15} /> Export CSV
            </button>
          </div>
        </div>

        {/* Date range selector */}
        <div className="flex items-center gap-1 mb-6 border-b border-[#E5E7EB] overflow-x-auto">
          {(Object.keys(RANGE_PRESETS) as RangeKey[]).map((key) => {
            const active = rangeKey === key;
            return (
              <button
                key={key}
                onClick={() => setRangeKey(key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  active
                    ? 'border-[#0A2540] text-[#0A2540]'
                    : 'border-transparent text-[#4A5568] hover:text-[#1A1A1A]'
                }`}
              >
                <Calendar size={14} />
                {RANGE_PRESETS[key].label}
              </button>
            );
          })}
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <KpiCard
            label="Total Revenue"
            value={formatMoney(kpis.totalRevenue)}
            icon={<DollarSign size={18} />}
            accent="text-green-600"
            trend="up"
          />
          <KpiCard
            label="Outstanding"
            value={formatMoney(kpis.outstanding)}
            icon={<Receipt size={18} />}
            accent="text-[#2E75B6]"
          />
          <KpiCard
            label="Overdue"
            value={formatMoney(kpis.overdue)}
            icon={<AlertCircle size={18} />}
            accent="text-red-600"
            trend="down"
          />
          <KpiCard
            label="Quote Acceptance"
            value={`${kpis.quoteAcceptanceRate.toFixed(1)}%`}
            icon={<TrendingUp size={18} />}
            accent="text-[#0A2540]"
          />
          <KpiCard
            label="Total Job Costs"
            value={formatMoney(kpis.totalJobCosts)}
            icon={<Wrench size={18} />}
            accent="text-[#4A5568]"
          />
          <KpiCard
            label="Average Job Value"
            value={formatMoney(kpis.avgJobValue)}
            icon={<Briefcase size={18} />}
            accent="text-[#0A2540]"
          />
          <KpiCard
            label="Labour Hours"
            value={formatDuration(Math.round(kpis.labourHours * 60))}
            icon={<Clock size={18} />}
            accent="text-[#2E75B6]"
          />
          <KpiCard
            label="Active Jobs"
            value={String(kpis.activeJobs)}
            icon={<Users size={18} />}
            accent="text-[#0A2540]"
          />
        </div>

        {/* Revenue vs Costs bar chart */}
        <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2">
              <BarChart3 size={16} className="text-[#2E75B6]" /> Revenue vs Costs
            </h2>
            <div className="flex items-center gap-4 text-xs text-[#6B7280]">
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-[#2E75B6]" /> Revenue
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block w-3 h-3 rounded-sm bg-[#0A2540]" /> Costs
              </span>
            </div>
          </div>
          <RevenueCostsChart data={monthlyData} />
        </div>

        {/* Two-column: Top clients + Technician productivity */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Top 5 clients by revenue */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4">
            <h2 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2 mb-4">
              <Users size={16} className="text-[#2E75B6]" /> Top 5 Clients by Revenue
            </h2>
            {topClients.length === 0 ? (
              <EmptyState icon={<Users size={28} />} message="No paid invoices in this period" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium text-[#4A5568] uppercase tracking-wide border-b border-[#F3F4F6]">
                      <th className="pb-2 pr-3">#</th>
                      <th className="pb-2 pr-3">Client</th>
                      <th className="pb-2 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3F4F6]">
                    {topClients.map((c, idx) => (
                      <tr key={c.clientId} className="hover:bg-[#F9FAFB] transition-colors">
                        <td className="py-3 pr-3 text-[#6B7280] font-medium">{idx + 1}</td>
                        <td className="py-3 pr-3 text-[#1A1A1A] font-medium">{c.name}</td>
                        <td className="py-3 text-right font-semibold text-[#1A1A1A]">{formatMoney(c.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Technician productivity */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4">
            <h2 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2 mb-4">
              <Clock size={16} className="text-[#2E75B6]" /> Technician Productivity
            </h2>
            {technicianProductivity.length === 0 ? (
              <EmptyState icon={<Clock size={28} />} message="No timesheet hours in this period" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium text-[#4A5568] uppercase tracking-wide border-b border-[#F3F4F6]">
                      <th className="pb-2 pr-3">Technician</th>
                      <th className="pb-2 text-right">Hours</th>
                      <th className="pb-2 text-right">Formatted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#F3F4F6]">
                    {technicianProductivity.map((t) => (
                      <tr key={t.employeeId} className="hover:bg-[#F9FAFB] transition-colors">
                        <td className="py-3 pr-3 text-[#1A1A1A] font-medium">{t.name}</td>
                        <td className="py-3 text-right font-semibold text-[#1A1A1A]">{t.hours.toFixed(1)}h</td>
                        <td className="py-3 text-right text-[#4A5568]">{formatDuration(t.minutes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Two-column: Low stock + Expiring contracts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Low stock alerts */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4">
            <h2 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2 mb-4">
              <Package size={16} className="text-amber-500" /> Low Stock Alerts
            </h2>
            {lowStock.length === 0 ? (
              <EmptyState icon={<Package size={28} />} message="All stock levels are healthy" />
            ) : (
              <ul className="space-y-2">
                {lowStock.map((s) => {
                  const isOut = s.quantity_on_hand <= 0;
                  return (
                    <li
                      key={s.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isOut ? 'bg-red-50' : 'bg-amber-50'
                          }`}
                        >
                          <Package size={16} className={isOut ? 'text-red-500' : 'text-amber-500'} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#1A1A1A] truncate">{s.name}</p>
                          <p className="text-xs text-[#6B7280]">
                            {s.sku ? `SKU: ${s.sku} · ` : ''}Reorder at {s.reorder_level}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`ml-3 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          isOut
                            ? 'bg-red-50 text-red-600 ring-1 ring-red-200'
                            : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
                        }`}
                      >
                        {isOut ? 'Out of Stock' : `${s.quantity_on_hand} left`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Expiring contracts */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4">
            <h2 className="text-sm font-semibold text-[#1A1A1A] flex items-center gap-2 mb-4">
              <FileText size={16} className="text-[#2E75B6]" /> Expiring Contracts
            </h2>
            {expiringContracts.length === 0 ? (
              <EmptyState icon={<FileText size={28} />} message="No contracts expiring in the next 60 days" />
            ) : (
              <ul className="space-y-2">
                {expiringContracts.map((c) => {
                  const daysLeft = Math.ceil(
                    (new Date(c.expiryRef).getTime() - Date.now()) / (24 * 60 * 60 * 1000),
                  );
                  const urgent = daysLeft <= 14;
                  return (
                    <li
                      key={c.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-[#E5E7EB] hover:bg-[#F9FAFB] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            urgent ? 'bg-red-50' : 'bg-blue-50'
                          }`}
                        >
                          <FileText size={16} className={urgent ? 'text-red-500' : 'text-[#2E75B6]'} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[#1A1A1A] truncate">{c.title}</p>
                          <p className="text-xs text-[#6B7280] truncate">
                            {c.clientName} · {format(parseISO(c.expiryRef), 'd MMM yyyy')}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`ml-3 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                          urgent
                            ? 'bg-red-50 text-red-600 ring-1 ring-red-200'
                            : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200'
                        }`}
                      >
                        {daysLeft <= 0 ? 'Expired' : `${daysLeft}d left`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: string;
  trend?: 'up' | 'down';
}

function KpiCard({ label, value, icon, accent, trend }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-[#4A5568] uppercase tracking-wide">{label}</span>
        <span className={`w-8 h-8 rounded-lg bg-[#F9FAFB] flex items-center justify-center ${accent}`}>
          {icon}
        </span>
      </div>
      <div className="flex items-end gap-2">
        <p className={`text-2xl font-bold ${accent}`}>{value}</p>
        {trend === 'up' && <TrendingUp size={16} className="text-green-500 mb-1" />}
        {trend === 'down' && <TrendingDown size={16} className="text-red-500 mb-1" />}
      </div>
    </div>
  );
}

// ── Revenue vs Costs bar chart (pure divs) ────────────────────────
interface ChartDatum {
  label: string;
  revenue: number;
  costs: number;
}

function RevenueCostsChart({ data }: { data: ChartDatum[] }) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <BarChart3 size={36} className="text-[#E5E7EB] mb-2" />
        <p className="text-sm text-[#6B7280]">No revenue or cost data in this period</p>
      </div>
    );
  }

  const max = Math.max(...data.map((d) => Math.max(d.revenue, d.costs)), 0);
  const safeMax = max > 0 ? max : 1;
  const BAR_HEIGHT = 180; // px

  return (
    <div className="overflow-x-auto">
      <div className="flex items-end gap-3 min-w-[400px]" style={{ height: BAR_HEIGHT + 40 }}>
        {data.map((d) => {
          const revH = Math.max(2, (d.revenue / safeMax) * BAR_HEIGHT);
          const costH = Math.max(2, (d.costs / safeMax) * BAR_HEIGHT);
          return (
            <div key={d.label} className="flex-1 flex flex-col items-center justify-end gap-1 min-w-[60px]">
              <div className="text-[10px] text-[#6B7280] font-medium">
                {d.revenue > 0 ? formatMoney(d.revenue).replace(/\.\d+$/, '') : ''}
              </div>
              <div className="flex items-end gap-1 w-full justify-center" style={{ height: BAR_HEIGHT }}>
                <div
                  className="w-1/2 max-w-[24px] rounded-t-sm bg-[#2E75B6] transition-all hover:opacity-80"
                  style={{ height: `${revH}px` }}
                  title={`Revenue: ${formatMoney(d.revenue)}`}
                />
                <div
                  className="w-1/2 max-w-[24px] rounded-t-sm bg-[#0A2540] transition-all hover:opacity-80"
                  style={{ height: `${costH}px` }}
                  title={`Costs: ${formatMoney(d.costs)}`}
                />
              </div>
              <span className="text-[11px] text-[#4A5568] font-medium mt-1 whitespace-nowrap">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────
function EmptyState({ icon, message }: { icon: React.ReactNode; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10">
      <div className="text-[#D1D5DB] mb-2">{icon}</div>
      <p className="text-sm text-[#6B7280]">{message}</p>
    </div>
  );
}
