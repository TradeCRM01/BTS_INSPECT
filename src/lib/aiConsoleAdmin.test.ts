import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  aiSettingsAdminToolsEnabled,
  DASHBOARD_SUMMARY_TABLES,
  fetchCompanyDashboardSummary,
  type DashboardQuery,
  type DashboardQueryResult,
  type DashboardSummaryClient,
} from '../../supabase/functions/ai-console/aiConsoleAdmin.ts';

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

const REMAINING_TOOLS = [
  'list_tables',
  'get_company_context',
  'create_job',
  'create_reminder',
  'create_compliance_item',
  'web_search',
  'get_dashboard_summary',
] as const;

const REMOVED_TOOLS = ['execute_sql', 'query_database', 'send_email'] as const;

type Row = Record<string, unknown>;

function makeDashboardStub(seed: Record<string, Row[]>) {
  const companyEqTables = new Set<string>();

  function makeQuery(table: string): DashboardQuery {
    const filters: Array<{ op: string; column: string; value: unknown }> = [];
    const query = {
      select() {
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push({ op: 'eq', column, value });
        if (column === 'company_id') companyEqTables.add(table);
        return query;
      },
      in(column: string, values: readonly unknown[]) {
        filters.push({ op: 'in', column, value: values });
        return query;
      },
      gte(column: string, value: unknown) {
        filters.push({ op: 'gte', column, value });
        return query;
      },
      lte(column: string, value: unknown) {
        filters.push({ op: 'lte', column, value });
        return query;
      },
      order() {
        return query;
      },
      limit() {
        return query;
      },
      then<T>(onfulfilled?: (value: DashboardQueryResult) => T | PromiseLike<T>) {
        let data = [...(seed[table] ?? [])];
        for (const filter of filters) {
          if (filter.op === 'eq') {
            data = data.filter((row) => row[filter.column] === filter.value);
          }
          if (filter.op === 'in') {
            const values = filter.value as readonly unknown[];
            data = data.filter((row) => values.includes(row[filter.column]));
          }
          if (filter.op === 'gte') {
            data = data.filter((row) => String(row[filter.column] ?? '') >= String(filter.value));
          }
          if (filter.op === 'lte') {
            data = data.filter((row) => String(row[filter.column] ?? '') <= String(filter.value));
          }
        }
        const result: DashboardQueryResult = { data, count: data.length, error: null };
        return Promise.resolve(result).then(onfulfilled);
      },
    } as DashboardQuery;
    return query;
  }

  const client: DashboardSummaryClient = {
    from(table: string) {
      return makeQuery(table);
    },
  };

  return { client, companyEqTables };
}

describe('aiSettingsAdminToolsEnabled', () => {
  it('defaults to false when no ai_settings row exists', () => {
    expect(aiSettingsAdminToolsEnabled(null)).toBe(false);
    expect(aiSettingsAdminToolsEnabled(undefined)).toBe(false);
    expect(aiSettingsAdminToolsEnabled({})).toBe(false);
    expect(aiSettingsAdminToolsEnabled({ admin_tools_enabled: null })).toBe(false);
  });

  it('honours an explicit row', () => {
    expect(aiSettingsAdminToolsEnabled({ admin_tools_enabled: true })).toBe(true);
    expect(aiSettingsAdminToolsEnabled({ admin_tools_enabled: false })).toBe(false);
  });
});

describe('fetchCompanyDashboardSummary', () => {
  it('never counts a company-B row for company A, and eq company_id on every table', async () => {
    const companyA = 'company-a';
    const companyB = 'company-b';
    const now = new Date('2026-10-06T02:00:00.000Z');

    const seed: Record<string, Row[]> = {
      jobs: [
        { id: 'ja1', company_id: companyA, status: 'scheduled' },
        { id: 'ja2', company_id: companyA, status: 'in_progress' },
        { id: 'ja3', company_id: companyA, status: 'completed' },
        { id: 'jb1', company_id: companyB, status: 'scheduled' },
        { id: 'jb2', company_id: companyB, status: 'in_progress' },
        { id: 'jb3', company_id: companyB, status: 'scheduled' },
        { id: 'jb4', company_id: companyB, status: 'in_progress' },
      ],
      inspections: [
        { id: 'ia1', company_id: companyA, created_at: '2026-10-06T01:00:00.000Z' },
        { id: 'ia2', company_id: companyA, created_at: '2026-10-05T01:00:00.000Z' },
        { id: 'ib1', company_id: companyB, created_at: '2026-10-06T01:00:00.000Z' },
        { id: 'ib2', company_id: companyB, created_at: '2026-10-06T03:00:00.000Z' },
      ],
      invoices: [
        { id: 'va1', company_id: companyA, status: 'overdue' },
        { id: 'va2', company_id: companyA, status: 'paid' },
        { id: 'vb1', company_id: companyB, status: 'overdue' },
        { id: 'vb2', company_id: companyB, status: 'overdue' },
      ],
      compliance_items: [
        { id: 'ca1', company_id: companyA, title: 'A due', next_due_date: '2026-10-20', status: 'open' },
        { id: 'cb1', company_id: companyB, title: 'B due', next_due_date: '2026-10-15', status: 'open' },
        { id: 'cb2', company_id: companyB, title: 'B due 2', next_due_date: '2026-10-18', status: 'open' },
      ],
      stock_items: [
        { id: 'sa1', company_id: companyA, name: 'A low', quantity: 1, reorder_level: 5, archived: false },
        { id: 'sb1', company_id: companyB, name: 'B low', quantity: 0, reorder_level: 10, archived: false },
      ],
      agent_actions: [
        { action_type: 'create_job', summary: 'A1', status: 'success', created_at: '2026-10-06T01:00:00.000Z', company_id: companyA },
        { action_type: 'create_job', summary: 'A2', status: 'success', created_at: '2026-10-06T00:30:00.000Z', company_id: companyA },
        { action_type: 'create_job', summary: 'B1', status: 'success', created_at: '2026-10-06T01:10:00.000Z', company_id: companyB },
        { action_type: 'create_job', summary: 'B2', status: 'success', created_at: '2026-10-06T01:20:00.000Z', company_id: companyB },
      ],
    };

    const { client, companyEqTables } = makeDashboardStub(seed);
    const summary = await fetchCompanyDashboardSummary(client, companyA, now);

    expect([...companyEqTables].sort()).toEqual([...DASHBOARD_SUMMARY_TABLES].sort());
    expect(summary.active_jobs).toBe(2);
    expect(summary.inspections_today).toBe(1);
    expect(summary.overdue_invoices).toBe(1);
    expect(summary.upcoming_compliance).toEqual([
      { id: 'ca1', company_id: companyA, title: 'A due', next_due_date: '2026-10-20', status: 'open' },
    ]);
    expect(summary.low_stock_items).toEqual([
      { id: 'sa1', company_id: companyA, name: 'A low', quantity: 1, reorder_level: 5, archived: false },
    ]);
    expect(summary.recent_agent_actions).toEqual([
      { action_type: 'create_job', summary: 'A1', status: 'success', created_at: '2026-10-06T01:00:00.000Z', company_id: companyA },
      { action_type: 'create_job', summary: 'A2', status: 'success', created_at: '2026-10-06T00:30:00.000Z', company_id: companyA },
    ]);

    const leaked =
      JSON.stringify(summary).includes(companyB)
      || JSON.stringify(summary).includes('B due')
      || JSON.stringify(summary).includes('B low')
      || JSON.stringify(summary).includes('"B1"');
    expect(leaked).toBe(false);
  });
});

describe('SEC-2 ai-console surface', () => {
  it('drops SQL and email tools, keeps the remaining company-scoped set, and default-off settings', () => {
    const edge = src('supabase/functions/ai-console/index.ts');
    const helper = src('supabase/functions/ai-console/aiConsoleAdmin.ts');
    const migration = src('supabase/migrations/20261006020000_drop_admin_sql_rpcs.sql');

    for (const tool of REMAINING_TOOLS) {
      expect(edge).toContain(`name: "${tool}"`);
    }
    for (const tool of REMOVED_TOOLS) {
      expect(edge).not.toContain(`name: "${tool}"`);
      expect(edge).not.toContain(`toolName === "${tool}"`);
    }

    expect(edge).not.toContain('admin_query');
    expect(edge).not.toContain('admin_execute');
    expect(edge).not.toContain('api.resend.com');
    expect(edge).toContain('aiSettingsAdminToolsEnabled(data)');
    expect(edge).toContain('fetchCompanyDashboardSummary');
    expect(edge).toContain('Do not invent SQL access or send email');
    expect(edge).not.toContain('database tools');

    expect(helper).toContain('data?.admin_tools_enabled ?? false');
    expect(helper.match(/\.eq\("company_id", companyId\)/g)?.length).toBe(DASHBOARD_SUMMARY_TABLES.length);
    for (const table of DASHBOARD_SUMMARY_TABLES) {
      expect(helper).toContain(`.from("${table}")`);
    }

    expect(migration).toContain('DROP FUNCTION IF EXISTS public.admin_execute(text);');
    expect(migration).toContain('DROP FUNCTION IF EXISTS public.admin_query(text);');
  });

  it('leaves no leftover admin_query / admin_execute callers outside the create and drop migrations', () => {
    const callers = [
      'supabase/functions/ai-console/index.ts',
      'supabase/functions/ai-console/aiConsoleAdmin.ts',
      'src/lib/aiConsoleAdmin.test.ts',
    ];
    for (const file of callers) {
      const text = src(file);
      expect(text).not.toMatch(/rpc\(["']admin_query/);
      expect(text).not.toMatch(/rpc\(["']admin_execute/);
    }
  });
});
