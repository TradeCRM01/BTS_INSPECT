import { format } from 'date-fns';
import { invoiceCountsAsOverdueMoney } from './invoiceOpenBalance';
import { todayIsoDate } from './invoiceStatus';
import { formatJobRef } from './jobRef';
import { dashboardWidgetViewTier } from './dashboardWidgetView';

export const TODAY_READY_WINDOW_DAYS = 30;
export const TODAY_CASH_LOOKBACK_DAYS = 6;
export const TODAY_OUTSTANDING_DISPLAY_CAP = 3;
export const TODAY_COMING_UP_LIMIT = 3;

export const TODAY_QA_JOB_COLUMNS = 'id, job_number, parent_job_id, title, status, scheduled_date, client_id';
export const TODAY_QA_INVOICE_COLUMNS = 'id, job_id, status';
export const TODAY_QB_PAYMENT_COLUMNS = 'amount, paid_at, invoice_id';
export const TODAY_QC_EXPENSE_COLUMNS = 'total, expense_date, status, cost_class, employee_cost_type';
export const TODAY_QD_JOB_COLUMNS =
  'id, job_number, parent_job_id, title, status, scheduled_date, start_time, end_time, address, assigned_team, client_id';
export const TODAY_QD_CLIENT_COLUMNS = 'id, name, address';
export const TODAY_QE_INVOICE_COLUMNS =
  'id, invoice_number, status, total, amount_paid, due_date, client_id, created_at';

export const TODAY_NUDGE_INVOICE_STATUSES = ['sent', 'overdue', 'part_paid'] as const;
export const TODAY_OUTSTANDING_STATUSES = TODAY_NUDGE_INVOICE_STATUSES;
export const TODAY_CASH_EXPENSE_STATUSES = ['recorded', 'paid'] as const;
export const TODAY_COMING_UP_STATUSES = ['scheduled', 'in_progress'] as const;
export const TODAY_MONEY_NUDGE_KINDS = ['invoice_unpaid', 'quote_chase'] as const;

export type TodayJobRow = {
  id: string;
  job_number?: number | null;
  parent_job_id?: string | null;
  title?: string | null;
  status: string;
  scheduled_date?: string | null;
  client_id?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  address?: string | null;
  assigned_team?: string[] | null;
};

export type TodayInvoiceJobRow = {
  id: string;
  job_id?: string | null;
  status: string;
};

export type ReadyToInvoiceJob = {
  id: string;
  job_number: number | null;
  title: string | null;
  scheduled_date: string | null;
  client_id: string | null;
  kind: 'standalone' | 'parent';
};

export type TodayPaymentRow = {
  amount?: number | string | null;
  paid_at?: string | null;
  invoice_id?: string | null;
};

export type TodayExpenseRow = {
  total?: number | string | null;
  expense_date?: string | null;
  status?: string | null;
  cost_class?: string | null;
  employee_cost_type?: string | null;
};

export type TodayOutstandingRow = {
  id: string;
  invoice_number?: number | null;
  status: string;
  total?: number | string | null;
  amount_paid?: number | string | null;
  due_date?: string | null;
  client_id?: string | null;
  created_at?: string | null;
};

export type TodayCashDay = {
  date: string;
  moneyIn: number;
  moneyOut: number;
};

export type TodayCashTotals = {
  moneyIn: number;
  moneyOut: number;
  net: number;
  from: string;
  to: string;
  rangeLabel: string;
  days: TodayCashDay[];
};

export type TodayOutstandingTotals = {
  outstanding: number;
  overdue: number;
  count: number;
  display: TodayOutstandingRow[];
};

export type TodayQueryError = { message: string } | null;
export type TodayQueryEnvelope<T> = { data: T[] | null; error: TodayQueryError };

export type TodayFilterChain<T> = {
  select: (columns: string) => TodayFilterChain<T>;
  eq: (column: string, value: string) => TodayFilterChain<T>;
  neq: (column: string, value: string) => TodayFilterChain<T>;
  in: (column: string, values: readonly string[]) => TodayFilterChain<T>;
  gte: (column: string, value: string) => TodayFilterChain<T>;
  lte: (column: string, value: string) => TodayFilterChain<T>;
  gt: (column: string, value: string) => TodayFilterChain<T>;
  order: (column: string, opts?: { ascending?: boolean }) => TodayFilterChain<T>;
  limit: (count: number) => TodayFilterChain<T>;
  then: (
    resolve: (value: TodayQueryEnvelope<T>) => unknown,
    reject?: (reason: unknown) => unknown,
  ) => Promise<unknown>;
};

export type TodayBoardClient = {
  from: (table: string) => TodayFilterChain<Record<string, unknown>>;
};

export function addIsoDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return todayIsoDate(date);
}

export function todayReadyWindowStart(todayKey: string): string {
  return addIsoDays(todayKey, -TODAY_READY_WINDOW_DAYS);
}

export function todayCashWindow(todayKey: string): { from: string; to: string } {
  return { from: addIsoDays(todayKey, -TODAY_CASH_LOOKBACK_DAYS), to: todayKey };
}

export function todayCashRangeLabel(from: string, to: string): string {
  return `${format(isoDate(from), 'EEE d')} to ${format(isoDate(to), 'EEE d MMM')}`;
}

export function todayCashDays(from: string, to: string): string[] {
  const days: string[] = [];
  let cursor = from;
  while (cursor <= to) {
    days.push(cursor);
    cursor = addIsoDays(cursor, 1);
  }
  return days;
}

export function invoiceCountsAsInvoiced(status: string): boolean {
  return status !== 'void';
}

export function isWageExpense(row: Pick<TodayExpenseRow, 'employee_cost_type'>): boolean {
  return row.employee_cost_type === 'wages';
}

export function outstandingFloor(inv: Pick<TodayOutstandingRow, 'total' | 'amount_paid'>): number {
  const raw = Number(inv.total ?? 0) - Number(inv.amount_paid ?? 0);
  return raw < 0 ? 0 : raw;
}

export function canSeeTodayMoney(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'owner';
}

export function isTodayMoneyWidget(widgetType: string): boolean {
  if (dashboardWidgetViewTier(widgetType) === 'money') return true;
  return widgetType === 'open_pos';
}

export function isTodayMoneyNudgeKind(kind: string): boolean {
  return (TODAY_MONEY_NUDGE_KINDS as readonly string[]).includes(kind);
}

export function visibleTodayWidgets<T extends { widget_type: string }>(
  widgets: readonly T[],
  role: string | null | undefined,
): T[] {
  if (canSeeTodayMoney(role)) return [...widgets];
  return widgets.filter(widget => !isTodayMoneyWidget(widget.widget_type));
}

export function visibleTodayNudges<T extends { kind: string }>(
  nudges: readonly T[],
  role: string | null | undefined,
): T[] {
  if (canSeeTodayMoney(role)) return [...nudges];
  return nudges.filter(nudge => !isTodayMoneyNudgeKind(nudge.kind));
}

export function rollupReadyToInvoice(
  completedInWindow: readonly TodayJobRow[],
  extraJobs: readonly TodayJobRow[],
  invoices: readonly TodayInvoiceJobRow[],
  windowStart: string,
): ReadyToInvoiceJob[] {
  const byId = new Map<string, TodayJobRow>();
  for (const job of [...completedInWindow, ...extraJobs]) byId.set(job.id, job);

  const invoicedIds = new Set<string>();
  for (const invoice of invoices) {
    if (!invoice.job_id || !invoiceCountsAsInvoiced(invoice.status)) continue;
    invoicedIds.add(invoice.job_id);
  }

  const parentIds = new Set<string>();
  for (const job of byId.values()) {
    if (job.parent_job_id) parentIds.add(job.parent_job_id);
  }

  const visitsByParent = new Map<string, TodayJobRow[]>();
  for (const job of byId.values()) {
    if (!job.parent_job_id) continue;
    const visits = visitsByParent.get(job.parent_job_id) ?? [];
    visits.push(job);
    visitsByParent.set(job.parent_job_id, visits);
  }

  const ready: ReadyToInvoiceJob[] = [];

  for (const [parentId, visits] of visitsByParent) {
    if (visits.some(visit => visit.status !== 'completed')) continue;
    const lastDate = visits.reduce((latest, visit) => {
      const date = (visit.scheduled_date ?? '').slice(0, 10);
      return date > latest ? date : latest;
    }, '');
    if (!lastDate || lastDate < windowStart) continue;
    if (invoicedIds.has(parentId) || visits.some(visit => invoicedIds.has(visit.id))) continue;
    const parent = byId.get(parentId);
    ready.push({
      id: parentId,
      job_number: parent?.job_number ?? visits[0]?.job_number ?? null,
      title: parent?.title ?? visits[0]?.title ?? null,
      scheduled_date: lastDate,
      client_id: parent?.client_id ?? visits[0]?.client_id ?? null,
      kind: 'parent',
    });
  }

  for (const job of completedInWindow) {
    if (job.parent_job_id || parentIds.has(job.id) || visitsByParent.has(job.id)) continue;
    const date = (job.scheduled_date ?? '').slice(0, 10);
    if (!date || date < windowStart) continue;
    if (invoicedIds.has(job.id)) continue;
    ready.push({
      id: job.id,
      job_number: job.job_number ?? null,
      title: job.title ?? null,
      scheduled_date: date,
      client_id: job.client_id ?? null,
      kind: 'standalone',
    });
  }

  return ready.sort((a, b) => (b.scheduled_date ?? '').localeCompare(a.scheduled_date ?? ''));
}

export function readyToInvoiceDetail(jobs: readonly ReadyToInvoiceJob[]): string {
  const refs = jobs.map(job => formatJobRef(job)).filter(ref => ref !== 'JOB');
  if (refs.length === 0) return '';
  if (refs.length === 1) return refs[0];
  if (refs.length === 2) return `${refs[0]} and ${refs[1]}`;
  return `${refs[0]} and ${refs[1]} +${refs.length - 2}`;
}

export function sumCashIn(payments: readonly TodayPaymentRow[], from: string, to: string): number {
  return payments.reduce((sum, payment) => {
    const paid = (payment.paid_at ?? '').slice(0, 10);
    if (!paid || paid < from || paid > to) return sum;
    return sum + Number(payment.amount ?? 0);
  }, 0);
}

export function sumCashOut(expenses: readonly TodayExpenseRow[], from: string, to: string): number {
  return expenses.reduce((sum, expense) => {
    if (expense.status !== 'recorded' && expense.status !== 'paid') return sum;
    if (isWageExpense(expense)) return sum;
    const date = (expense.expense_date ?? '').slice(0, 10);
    if (!date || date < from || date > to) return sum;
    return sum + Number(expense.total ?? 0);
  }, 0);
}

export function cashTotals(
  payments: readonly TodayPaymentRow[],
  expenses: readonly TodayExpenseRow[],
  todayKey: string,
): TodayCashTotals {
  const { from, to } = todayCashWindow(todayKey);
  const moneyIn = sumCashIn(payments, from, to);
  const moneyOut = sumCashOut(expenses, from, to);
  return {
    moneyIn,
    moneyOut,
    net: moneyIn - moneyOut,
    from,
    to,
    rangeLabel: todayCashRangeLabel(from, to),
    days: todayCashDays(from, to).map(date => ({
      date,
      moneyIn: sumCashIn(payments, date, date),
      moneyOut: sumCashOut(expenses, date, date),
    })),
  };
}

export function sumOutstanding(invoices: readonly TodayOutstandingRow[]): number {
  return invoices.reduce((sum, invoice) => sum + outstandingFloor(invoice), 0);
}

export function outstandingTotals(
  invoices: readonly TodayOutstandingRow[],
  now = new Date(),
  displayCap = TODAY_OUTSTANDING_DISPLAY_CAP,
): TodayOutstandingTotals {
  const open = invoices.filter(invoice => outstandingFloor(invoice) > 0);
  const display = [...invoices]
    .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
    .slice(0, displayCap);
  return {
    outstanding: sumOutstanding(invoices),
    overdue: invoices
      .filter(invoice => invoiceCountsAsOverdueMoney(invoice, now))
      .reduce((sum, invoice) => sum + outstandingFloor(invoice), 0),
    count: open.length,
    display,
  };
}

export async function fetchReadyToInvoice(
  client: TodayBoardClient,
  companyId: string,
  todayKey: string,
): Promise<ReadyToInvoiceJob[]> {
  const windowStart = todayReadyWindowStart(todayKey);
  const completed = await readRows<TodayJobRow>(
    client.from('jobs')
      .select(TODAY_QA_JOB_COLUMNS)
      .eq('company_id', companyId)
      .eq('status', 'completed')
      .gte('scheduled_date', windowStart)
      .order('scheduled_date', { ascending: false }),
  );

  const parentIds = [...new Set(completed.flatMap(job => {
    const ids = [] as string[];
    if (job.parent_job_id) ids.push(job.parent_job_id);
    else ids.push(job.id);
    return ids;
  }))];

  const extra: TodayJobRow[] = [];
  if (parentIds.length > 0) {
    extra.push(...await readRows<TodayJobRow>(
      client.from('jobs')
        .select(TODAY_QA_JOB_COLUMNS)
        .eq('company_id', companyId)
        .in('id', parentIds),
    ));
    extra.push(...await readRows<TodayJobRow>(
      client.from('jobs')
        .select(TODAY_QA_JOB_COLUMNS)
        .eq('company_id', companyId)
        .in('parent_job_id', parentIds),
    ));
  }

  const jobIds = [...new Set([...completed, ...extra].map(job => job.id))];
  const invoices = jobIds.length === 0
    ? []
    : await readRows<TodayInvoiceJobRow>(
      client.from('invoices')
        .select(TODAY_QA_INVOICE_COLUMNS)
        .eq('company_id', companyId)
        .in('job_id', jobIds)
        .neq('status', 'void'),
    );

  return rollupReadyToInvoice(completed, extra, invoices, windowStart);
}

export async function fetchTodayCash(
  client: TodayBoardClient,
  companyId: string,
  todayKey: string,
): Promise<TodayCashTotals> {
  const { from, to } = todayCashWindow(todayKey);
  const [payments, expenses] = await Promise.all([
    readRows<TodayPaymentRow>(
      client.from('invoice_payments')
        .select(TODAY_QB_PAYMENT_COLUMNS)
        .eq('company_id', companyId)
        .gte('paid_at', from)
        .lte('paid_at', to),
    ),
    readRows<TodayExpenseRow>(
      client.from('expenses')
        .select(TODAY_QC_EXPENSE_COLUMNS)
        .eq('company_id', companyId)
        .in('status', TODAY_CASH_EXPENSE_STATUSES)
        .gte('expense_date', from)
        .lte('expense_date', to),
    ),
  ]);
  return cashTotals(payments, expenses, todayKey);
}

export async function fetchComingUp(
  client: TodayBoardClient,
  companyId: string,
  todayKey: string,
): Promise<Array<TodayJobRow & { client_name?: string | null; client_address?: string | null }>> {
  const jobs = await readRows<TodayJobRow>(
    client.from('jobs')
      .select(TODAY_QD_JOB_COLUMNS)
      .eq('company_id', companyId)
      .gt('scheduled_date', todayKey)
      .in('status', TODAY_COMING_UP_STATUSES)
      .order('scheduled_date', { ascending: true })
      .order('start_time', { ascending: true })
      .limit(TODAY_COMING_UP_LIMIT),
  );
  const clientIds = [...new Set(jobs.map(job => job.client_id).filter(Boolean))] as string[];
  if (clientIds.length === 0) return jobs;
  const clients = await readRows<{ id: string; name?: string | null; address?: string | null }>(
    client.from('clients')
      .select(TODAY_QD_CLIENT_COLUMNS)
      .in('id', clientIds),
  );
  const names = new Map(clients.map(row => [row.id, row]));
  return jobs.map(job => {
    const client = job.client_id ? names.get(job.client_id) : undefined;
    return {
      ...job,
      client_name: client?.name ?? null,
      client_address: client?.address ?? null,
    };
  });
}

export async function fetchOutstanding(
  client: TodayBoardClient,
  companyId: string,
  now = new Date(),
): Promise<TodayOutstandingTotals> {
  const invoices = await readRows<TodayOutstandingRow>(
    client.from('invoices')
      .select(TODAY_QE_INVOICE_COLUMNS)
      .eq('company_id', companyId)
      .in('status', TODAY_OUTSTANDING_STATUSES),
  );
  return outstandingTotals(invoices, now);
}

async function readRows<T>(query: TodayFilterChain<Record<string, unknown>>): Promise<T[]> {
  const envelope = await Promise.resolve(query as unknown as Promise<TodayQueryEnvelope<T>>);
  if (envelope.error) throw envelope.error;
  return (envelope.data ?? []) as T[];
}

function isoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}
