import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TODAY_QA_INVOICE_COLUMNS,
  TODAY_QA_JOB_COLUMNS,
  TODAY_QB_PAYMENT_COLUMNS,
  TODAY_QC_EXPENSE_COLUMNS,
  TODAY_QD_CLIENT_COLUMNS,
  TODAY_QD_JOB_COLUMNS,
  TODAY_QE_INVOICE_COLUMNS,
  canSeeTodayMoney,
  cashTotals,
  visibleTodayNudges,
  visibleTodayWidgets,
  fetchComingUp,
  fetchOutstanding,
  fetchReadyToInvoice,
  fetchTodayCash,
  outstandingFloor,
  outstandingTotals,
  readyToInvoiceDetail,
  rollupReadyToInvoice,
  sumCashOut,
  sumOutstanding,
  todayCashRangeLabel,
  todayCashWindow,
  todayReadyWindowStart,
  type TodayBoardClient,
  type TodayExpenseRow,
  type TodayFilterChain,
  type TodayJobRow,
  type TodayOutstandingRow,
  type TodayPaymentRow,
} from './todayBoard';

const TODAY = '2026-10-19';
const WINDOW = todayReadyWindowStart(TODAY);
const SCHEMA = JSON.parse(readFileSync(resolve(process.cwd(), 'docs/schema/p1b-columns.json'), 'utf8')) as Record<string, string[]>;

type SeedRow = Record<string, unknown>;
type Call = { table: string; select: string; filters: Array<{ kind: string; col: string; val: unknown }> };

function cols(list: string): string[] {
  return list.split(',').map(part => part.trim());
}

function assertSchema(table: string, select: string) {
  const allowed = new Set(SCHEMA[table]);
  for (const col of cols(select)) {
    expect(allowed.has(col), `${table}.${col} missing from p1b-columns.json`).toBe(true);
  }
}

function job(over: Partial<TodayJobRow> & { id: string }): TodayJobRow {
  return {
    job_number: 1,
    title: 'Job',
    status: 'completed',
    scheduled_date: '2026-10-10',
    parent_job_id: null,
    client_id: 'c1',
    ...over,
  };
}

function seedClient(tables: Record<string, SeedRow[]>, calls: Call[] = []): TodayBoardClient {
  return {
    from(table: string) {
      const call: Call = { table, select: '*', filters: [] };
      let limit: number | undefined;
      const order: Array<{ col: string; asc: boolean }> = [];
      const q: TodayFilterChain<SeedRow> = {
        select(columns) {
          call.select = columns;
          return q;
        },
        eq(col, val) {
          call.filters.push({ kind: 'eq', col, val });
          return q;
        },
        neq(col, val) {
          call.filters.push({ kind: 'neq', col, val });
          return q;
        },
        in(col, vals) {
          call.filters.push({ kind: 'in', col, val: [...vals] });
          return q;
        },
        gte(col, val) {
          call.filters.push({ kind: 'gte', col, val });
          return q;
        },
        lte(col, val) {
          call.filters.push({ kind: 'lte', col, val });
          return q;
        },
        gt(col, val) {
          call.filters.push({ kind: 'gt', col, val });
          return q;
        },
        order(col, opts) {
          order.push({ col, asc: opts?.ascending !== false });
          return q;
        },
        limit(count) {
          limit = count;
          call.filters.push({ kind: 'limit', col: '', val: count });
          return q;
        },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            calls.push(call);
            let rows = [...(tables[table] ?? [])];
            for (const filter of call.filters) {
              rows = rows.filter(row => matchFilter(row, filter));
            }
            if (order.length) {
              rows.sort((a, b) => {
                for (const step of order) {
                  const av = String(a[step.col] ?? '');
                  const bv = String(b[step.col] ?? '');
                  if (av < bv) return step.asc ? -1 : 1;
                  if (av > bv) return step.asc ? 1 : -1;
                }
                return 0;
              });
            }
            if (limit != null) rows = rows.slice(0, limit);
            return { data: rows, error: null };
          }).then(resolve, reject);
        },
      };
      return q;
    },
  };
}

function matchFilter(row: SeedRow, filter: Call['filters'][number]): boolean {
  const raw = row[filter.col];
  const value = raw == null ? raw : String(raw);
  if (filter.kind === 'eq') return value === String(filter.val);
  if (filter.kind === 'neq') return value !== String(filter.val);
  if (filter.kind === 'in') return (filter.val as unknown[]).map(String).includes(String(raw));
  const date = String(raw ?? '').slice(0, 10);
  const bound = String(filter.val);
  if (filter.kind === 'gte') return date >= bound;
  if (filter.kind === 'lte') return date <= bound;
  if (filter.kind === 'gt') return date > bound;
  return true;
}

describe('Q-A ready to invoice', () => {
  it('kills a parent with one open visit and counts a finished parent once', () => {
    const parentOpen = 'p-open';
    const parentDone = 'p-done';
    const completed = [
      job({ id: 'v-open-done', job_number: 40, parent_job_id: parentOpen, scheduled_date: '2026-10-12' }),
      job({ id: 'v-done-a', job_number: 36, parent_job_id: parentDone, scheduled_date: '2026-10-08' }),
      job({ id: 'v-done-b', job_number: 37, parent_job_id: parentDone, scheduled_date: '2026-10-15' }),
    ];
    const extra = [
      job({ id: parentOpen, job_number: 10, status: 'in_progress', scheduled_date: '2026-10-01' }),
      job({ id: 'v-open-left', job_number: 41, parent_job_id: parentOpen, status: 'scheduled', scheduled_date: '2026-10-20' }),
      job({ id: parentDone, job_number: 11, status: 'scheduled', scheduled_date: '2026-09-01' }),
      ...completed,
    ];
    const ready = rollupReadyToInvoice(completed, extra, [], WINDOW);
    expect(ready.map(row => row.id)).toEqual([parentDone]);
    expect(ready).toHaveLength(1);
    expect(ready[0]?.kind).toBe('parent');
    expect(ready[0]?.scheduled_date).toBe('2026-10-15');
    expect(readyToInvoiceDetail(ready)).toBe('#0011');
  });

  it('D4d: 30-day window uses the last child visit date, not the first', () => {
    const parent = 'p-last';
    const firstOutside = job({ id: 'v-first', job_number: 50, parent_job_id: parent, scheduled_date: '2026-09-01' });
    const lastInside = job({ id: 'v-last', job_number: 51, parent_job_id: parent, scheduled_date: '2026-10-10' });
    const extra = [
      job({ id: parent, job_number: 12, status: 'scheduled', scheduled_date: '2026-08-01' }),
      firstOutside,
      lastInside,
    ];
    const ready = rollupReadyToInvoice([firstOutside, lastInside], extra, [], WINDOW);
    expect(WINDOW).toBe('2026-09-19');
    expect(firstOutside.scheduled_date && firstOutside.scheduled_date < WINDOW).toBe(true);
    expect(lastInside.scheduled_date && lastInside.scheduled_date >= WINDOW).toBe(true);
    expect(ready.map(row => row.id)).toEqual([parent]);
    expect(ready[0]?.scheduled_date).toBe('2026-10-10');
    expect(ready[0]?.scheduled_date).not.toBe('2026-09-01');
  });

  it('D4f: a sibling visit invoice keeps the parent off ready', () => {
    const parent = 'p-sib';
    const visitA = job({ id: 'v-a', job_number: 60, parent_job_id: parent, scheduled_date: '2026-10-10' });
    const visitB = job({ id: 'v-b', job_number: 61, parent_job_id: parent, scheduled_date: '2026-10-12' });
    const extra = [
      job({ id: parent, job_number: 13, scheduled_date: '2026-09-20' }),
      visitA,
      visitB,
    ];
    const invoices = [{ id: 'i-sib', job_id: 'v-a', status: 'sent' }];
    const ready = rollupReadyToInvoice([visitA, visitB], extra, invoices, WINDOW);
    const ignoreSibling = rollupReadyToInvoice(
      [visitA, visitB],
      extra,
      invoices.filter(invoice => invoice.job_id === parent),
      WINDOW,
    );
    expect(ready).toEqual([]);
    expect(ignoreSibling.map(row => row.id)).toEqual([parent]);
    expect(ready).not.toEqual(ignoreSibling);
  });

  it('D4: any non-void invoice including draft counts as invoiced, void stays ready, 40-day jobs drop', () => {
    const completed = [
      job({ id: 'drafted', job_number: 20, scheduled_date: '2026-10-10' }),
      job({ id: 'voided', job_number: 36, scheduled_date: '2026-10-11' }),
      job({ id: 'clean', job_number: 37, scheduled_date: '2026-10-12' }),
      job({ id: 'old', job_number: 21, scheduled_date: '2026-09-09' }),
    ];
    const invoices = [
      { id: 'i-draft', job_id: 'drafted', status: 'draft' },
      { id: 'i-void', job_id: 'voided', status: 'void' },
    ];
    const ready = rollupReadyToInvoice(completed, completed, invoices, WINDOW);
    expect(ready.map(row => row.job_number)).toEqual([37, 36]);
    expect(readyToInvoiceDetail(ready)).toBe('#0037 and #0036');
  });

  it('fetchReadyToInvoice applies company_id, loads siblings, and ignores another company', async () => {
    const calls: Call[] = [];
    const client = seedClient({
      jobs: [
        job({ id: 'v1', company_id: 'co', job_number: 36, parent_job_id: 'p1', scheduled_date: '2026-10-10' } as TodayJobRow & { company_id: string }),
        { ...job({ id: 'v2', job_number: 37, parent_job_id: 'p1', status: 'scheduled', scheduled_date: '2026-10-18' }), company_id: 'co' },
        { ...job({ id: 'p1', job_number: 9, status: 'in_progress', scheduled_date: '2026-09-01' }), company_id: 'co' },
        { ...job({ id: 'other', job_number: 99, scheduled_date: '2026-10-10' }), company_id: 'other' },
      ],
      invoices: [],
    }, calls);
    const ready = await fetchReadyToInvoice(client, 'co', TODAY);
    expect(ready).toEqual([]);
    expect(calls.every(call => call.filters.some(filter => filter.kind === 'eq' && filter.col === 'company_id' && filter.val === 'co'))).toBe(true);
    expect(calls.some(call => call.table === 'jobs' && call.filters.some(filter => filter.kind === 'in' && filter.col === 'parent_job_id'))).toBe(true);
  });
});

describe('Q-B Q-C cash', () => {
  const payments: TodayPaymentRow[] = [
    { amount: 4214.30, paid_at: '2026-10-17', invoice_id: 'inv-1' },
    { amount: 999.00, paid_at: '2026-10-12', invoice_id: 'inv-old' },
  ];
  const expenses: TodayExpenseRow[] = [
    { total: 1862.75, expense_date: '2026-10-18', status: 'recorded', cost_class: 'cogs' },
    { total: 400, expense_date: '2026-10-18', status: 'draft', cost_class: 'cogs' },
    { total: 250, expense_date: '2026-10-20', status: 'paid', cost_class: 'cogs' },
    { total: 800, expense_date: '2026-10-18', status: 'paid', cost_class: 'employee', employee_cost_type: 'wages' },
  ];

  it('kills wages out and keeps a recorded expense in the 7-day window', () => {
    const { from, to } = todayCashWindow(TODAY);
    expect(from).toBe('2026-10-13');
    expect(to).toBe(TODAY);
    expect(sumCashOut(expenses, from, to)).toBe(1862.75);
    const totals = cashTotals(payments, expenses, TODAY);
    expect(totals.moneyIn).toBe(4214.30);
    expect(totals.moneyOut).toBe(1862.75);
    expect(totals.net).toBe(2351.55);
    expect(totals.rangeLabel).toBe(todayCashRangeLabel(from, to));
    expect(totals.rangeLabel).toBe('Tue 13 to Mon 19 Oct');
    expect(totals.days).toHaveLength(7);
  });

  it('fetchTodayCash filters company_id and drops draft, future, and wages rows', async () => {
    const calls: Call[] = [];
    const client = seedClient({
      invoice_payments: [
        { company_id: 'co', amount: 100, paid_at: '2026-10-19', invoice_id: 'a' },
        { company_id: 'other', amount: 50, paid_at: '2026-10-19', invoice_id: 'b' },
      ],
      expenses: [
        { company_id: 'co', total: 20, expense_date: '2026-10-19', status: 'paid', cost_class: 'overhead' },
        { company_id: 'co', total: 9, expense_date: '2026-10-19', status: 'paid', cost_class: 'employee', employee_cost_type: 'wages' },
        { company_id: 'co', total: 7, expense_date: '2026-10-19', status: 'draft', cost_class: 'overhead' },
      ],
    }, calls);
    const totals = await fetchTodayCash(client, 'co', TODAY);
    expect(totals.moneyIn).toBe(100);
    expect(totals.moneyOut).toBe(20);
    expect(calls.filter(call => call.table === 'invoice_payments').every(call => call.filters.some(filter => filter.col === 'company_id' && filter.val === 'co'))).toBe(true);
    expect(calls.filter(call => call.table === 'expenses').every(call => call.filters.some(filter => filter.col === 'company_id' && filter.val === 'co'))).toBe(true);
  });
});

describe('Q-D coming up', () => {
  it('excludes today and cancelled, keeps the next three scheduled or in-progress jobs', async () => {
    const calls: Call[] = [];
    const client = seedClient({
      jobs: [
        { id: 'today', company_id: 'co', status: 'scheduled', scheduled_date: TODAY, start_time: '08:00', title: 'Today', job_number: 1, client_id: 'c1' },
        { id: 't1', company_id: 'co', status: 'scheduled', scheduled_date: '2026-10-20', start_time: '07:30', title: 'Tue', job_number: 2, client_id: 'c1' },
        { id: 't2', company_id: 'co', status: 'in_progress', scheduled_date: '2026-10-21', start_time: '09:00', title: 'Wed', job_number: 3, client_id: 'c1' },
        { id: 't3', company_id: 'co', status: 'scheduled', scheduled_date: '2026-10-22', start_time: '10:00', title: 'Thu', job_number: 4, client_id: 'c2' },
        { id: 't4', company_id: 'co', status: 'scheduled', scheduled_date: '2026-10-23', start_time: '11:00', title: 'Fri', job_number: 5, client_id: 'c2' },
        { id: 'cx', company_id: 'co', status: 'cancelled', scheduled_date: '2026-10-20', start_time: '06:00', title: 'No', job_number: 6, client_id: 'c1' },
      ],
      clients: [
        { id: 'c1', name: 'Gwen Albright', address: 'Kedron' },
        { id: 'c2', name: 'Other' },
      ],
    }, calls);
    const rows = await fetchComingUp(client, 'co', TODAY);
    expect(rows.map(row => row.id)).toEqual(['t1', 't2', 't3']);
    expect(rows[0]?.client_name).toBe('Gwen Albright');
    expect(calls.some(call => call.table === 'jobs' && call.filters.some(filter => filter.kind === 'gt' && filter.col === 'scheduled_date' && filter.val === TODAY))).toBe(true);
    expect(calls.filter(call => call.table === 'jobs').every(call => call.filters.some(filter => filter.col === 'company_id'))).toBe(true);
  });
});

describe('Q-E outstanding', () => {
  const rows: TodayOutstandingRow[] = [
    { id: 'sent', invoice_number: 112, status: 'sent', total: 1929.65, amount_paid: 0, due_date: '2026-10-30', created_at: '2026-10-18', client_id: 'c1' },
    { id: 'over', invoice_number: 90, status: 'overdue', total: 462, amount_paid: 0, due_date: '2026-10-09', created_at: '2026-10-01', client_id: 'c2' },
    { id: 'part', invoice_number: 91, status: 'part_paid', total: 1688, amount_paid: 500, due_date: '2026-11-01', created_at: '2026-10-17', client_id: 'c3' },
    { id: 'overpay', invoice_number: 92, status: 'sent', total: 100, amount_paid: 150, due_date: '2026-11-02', created_at: '2026-10-16', client_id: 'c4' },
    { id: 'extra', invoice_number: 93, status: 'sent', total: 10, amount_paid: 0, due_date: '2026-11-03', created_at: '2026-10-10', client_id: 'c5' },
  ];

  it('sums the full non-void set with a per-invoice floor at 0 and caps only the display list', () => {
    const now = new Date(2026, 9, 19);
    const totals = outstandingTotals(rows, now, 3);
    expect(outstandingFloor({ total: 100, amount_paid: 150 })).toBe(0);
    expect(totals.outstanding).toBe(3589.65);
    expect(totals.overdue).toBe(462);
    expect(totals.count).toBe(4);
    expect(totals.display.map(row => row.id)).toEqual(['sent', 'part', 'overpay']);
    expect(totals.display).toHaveLength(3);
    expect(sumOutstanding(rows)).toBe(3589.65);
  });

  it('kills a mutant that removes the per-invoice floor', () => {
    const floored = sumOutstanding(rows);
    const unfloored = rows.reduce((sum, invoice) => sum + (Number(invoice.total ?? 0) - Number(invoice.amount_paid ?? 0)), 0);
    expect(floored).toBe(3589.65);
    expect(unfloored).toBe(3539.65);
    expect(outstandingFloor({ total: 100, amount_paid: 150 })).toBe(0);
    expect(floored).not.toBe(unfloored);
  });

  it('kills a mutant that sums only the capped display list', () => {
    const totals = outstandingTotals(rows, new Date(2026, 9, 19), 3);
    const cappedOnly = sumOutstanding(totals.display);
    expect(totals.outstanding).toBe(3589.65);
    expect(cappedOnly).toBe(3117.65);
    expect(totals.outstanding).not.toBe(cappedOnly);
  });

  it('fetchOutstanding stays uncapped and still applies company_id', async () => {
    const calls: Call[] = [];
    const client = seedClient({
      invoices: rows.map(row => ({ ...row, company_id: 'co' })).concat([
        { id: 'draft', company_id: 'co', status: 'draft', total: 999, amount_paid: 0, created_at: '2026-10-19' },
        { id: 'void', company_id: 'co', status: 'void', total: 999, amount_paid: 0, created_at: '2026-10-19' },
        { id: 'other', company_id: 'x', status: 'sent', total: 50, amount_paid: 0, created_at: '2026-10-19' },
      ]),
    }, calls);
    const totals = await fetchOutstanding(client, 'co', new Date(2026, 9, 19));
    expect(totals.outstanding).toBe(3589.65);
    expect(totals.display).toHaveLength(3);
    const invoiceCalls = calls.filter(call => call.table === 'invoices');
    expect(invoiceCalls.every(call => call.filters.some(filter => filter.col === 'company_id' && filter.val === 'co'))).toBe(true);
    expect(invoiceCalls.every(call => !call.filters.some(filter => filter.kind === 'limit'))).toBe(true);
    expect(invoiceCalls[0]?.select).toBe(TODAY_QE_INVOICE_COLUMNS);
  });

  it('records limit on the fake so a Q-E cap at :333 can go red', async () => {
    const outstandingCalls: Call[] = [];
    await fetchOutstanding(seedClient({ invoices: [] }, outstandingCalls), 'co', new Date(2026, 9, 19));
    expect(outstandingCalls.some(call => call.filters.some(filter => filter.kind === 'limit'))).toBe(false);

    const comingCalls: Call[] = [];
    await fetchComingUp(seedClient({ jobs: [], clients: [] }, comingCalls), 'co', TODAY);
    expect(comingCalls.some(call => (
      call.table === 'jobs' && call.filters.some(filter => filter.kind === 'limit' && filter.val === 3)
    ))).toBe(true);
  });
});

describe('C2 money role gate', () => {
  it('shows money to owner and admin, and hides $ widgets and $ nudges from crew', () => {
    expect(canSeeTodayMoney('admin')).toBe(true);
    expect(canSeeTodayMoney('owner')).toBe(true);
    expect(canSeeTodayMoney('member')).toBe(false);
    expect(canSeeTodayMoney('crew')).toBe(false);
    const widgets = [
      { id: 'jobs', widget_type: 'upcoming_jobs' },
      { id: 'inv', widget_type: 'outstanding_invoices' },
      { id: 'cash', widget_type: 'cash_flow' },
      { id: 'rev', widget_type: 'revenue_overview' },
      { id: 'po', widget_type: 'open_pos' },
    ];
    expect(visibleTodayWidgets(widgets, 'admin').map(row => row.id)).toEqual(['jobs', 'inv', 'cash', 'rev', 'po']);
    expect(visibleTodayWidgets(widgets, 'member').map(row => row.id)).toEqual(['jobs']);
    const nudges = [
      { kind: 'jobs_tomorrow' },
      { kind: 'invoice_unpaid' },
      { kind: 'quote_chase' },
      { kind: 'leave_soon' },
    ];
    expect(visibleTodayNudges(nudges, 'admin').map(row => row.kind)).toEqual(['jobs_tomorrow', 'invoice_unpaid', 'quote_chase', 'leave_soon']);
    expect(visibleTodayNudges(nudges, 'member').map(row => row.kind)).toEqual(['jobs_tomorrow', 'leave_soon']);
  });
});

describe('K13 schema', () => {
  it('keeps every today-board select column inside the information_schema snapshot', () => {
    assertSchema('jobs', TODAY_QA_JOB_COLUMNS);
    assertSchema('jobs', TODAY_QD_JOB_COLUMNS);
    assertSchema('invoices', TODAY_QA_INVOICE_COLUMNS);
    assertSchema('invoices', TODAY_QE_INVOICE_COLUMNS);
    assertSchema('invoice_payments', TODAY_QB_PAYMENT_COLUMNS);
    assertSchema('expenses', TODAY_QC_EXPENSE_COLUMNS);
    assertSchema('clients', TODAY_QD_CLIENT_COLUMNS);
    expect(TODAY_QE_INVOICE_COLUMNS.includes('paid_at')).toBe(false);
    expect(SCHEMA.invoices.includes('paid_at')).toBe(false);
  });

  it('keeps every today-board filter column inside the information_schema snapshot', async () => {
    const calls: Call[] = [];
    const client = seedClient({
      jobs: [],
      invoices: [],
      invoice_payments: [],
      expenses: [],
      clients: [],
    }, calls);
    await fetchReadyToInvoice(client, 'co', TODAY);
    await fetchTodayCash(client, 'co', TODAY);
    await fetchComingUp(client, 'co', TODAY);
    await fetchOutstanding(client, 'co', new Date(2026, 9, 19));
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      const allowed = new Set(SCHEMA[call.table] ?? []);
      for (const filter of call.filters) {
        if (filter.kind === 'limit') continue;
        expect(allowed.has(filter.col), `${call.table}.${filter.col} filter missing from p1b-columns.json`).toBe(true);
      }
    }
  });
});
