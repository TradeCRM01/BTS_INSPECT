import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  TODAY_QA_INVOICE_COLUMNS,
  TODAY_QA_JOB_COLUMNS,
  TODAY_QB_PAYMENT_COLUMNS,
  TODAY_QC_EXPENSE_COLUMNS,
  TODAY_QD_CLIENT_COLUMNS,
  TODAY_QD_JOB_COLUMNS,
  TODAY_QE_INVOICE_COLUMNS,
  fetchComingUp,
  fetchOutstanding,
  fetchReadyToInvoice,
  fetchTodayCash,
  type TodayBoardClient,
  type TodayFilterChain,
} from './todayBoard';

function findBin(name: string, version = '17'): string | null {
  const candidate = `/usr/lib/postgresql/${version}/bin/${name}`;
  if (existsSync(candidate)) return candidate;
  const other = `/usr/lib/postgresql/16/bin/${name}`;
  if (existsSync(other)) return other;
  return null;
}

const initdb = findBin('initdb');
const pgCtl = findBin('pg_ctl');
const psqlBin = findBin('psql');
const hasInitdb = Boolean(initdb && pgCtl && psqlBin);

const SELECTED: Record<string, string[]> = {
  jobs: uniq(cols(TODAY_QA_JOB_COLUMNS), cols(TODAY_QD_JOB_COLUMNS)),
  invoices: uniq(cols(TODAY_QA_INVOICE_COLUMNS), cols(TODAY_QE_INVOICE_COLUMNS)),
  invoice_payments: cols(TODAY_QB_PAYMENT_COLUMNS),
  expenses: cols(TODAY_QC_EXPENSE_COLUMNS),
  clients: cols(TODAY_QD_CLIENT_COLUMNS),
};

const FILTERS: Record<string, string[]> = {
  jobs: ['company_id', 'status', 'scheduled_date', 'id', 'parent_job_id'],
  invoices: ['company_id', 'status', 'job_id'],
  invoice_payments: ['company_id', 'paid_at'],
  expenses: ['company_id', 'status', 'expense_date'],
  clients: ['company_id', 'id'],
};

function cols(list: string): string[] {
  return list.split(',').map(part => part.trim());
}

function uniq(...lists: string[][]): string[] {
  return [...new Set(lists.flat())];
}

describe.skipIf(!hasInitdb)('P1b today-board columns on the real migration chain', () => {
  let dataDir = '';
  let sockDir = '';
  const port = String(process.env.P1B_PGPORT_VITEST || process.env.PROOF_PGPORT_VITEST || '55461');
  let live: Record<string, string[]> = {};

  function runSql(sql: string): string {
    const result = spawnSync(psqlBin!, [
      '-h', sockDir,
      '-p', port,
      '-U', 'postgres',
      '-d', 'postgres',
      '-X', '-q',
      '-v', 'ON_ERROR_STOP=1',
      '-At',
      '-c', sql,
    ], { encoding: 'utf8', env: { ...process.env, PGHOST: sockDir } });
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || `psql exited ${result.status}`);
    }
    return result.stdout.trim();
  }

  beforeAll(() => {
    const root = mkdtempSync(join(tmpdir(), 'p1b-schema-vitest-'));
    dataDir = join(root, 'pgdata');
    sockDir = join(root, 'sock');
    mkdirSync(sockDir, { recursive: true });
    const init = spawnSync(initdb!, ['-D', dataDir, '--auth-local=trust', '--username=postgres'], { encoding: 'utf8' });
    if (init.status !== 0) throw new Error(init.stderr || init.stdout);
    writeFileSync(join(dataDir, 'postgresql.conf'), `listen_addresses = ''
port = ${port}
unix_socket_directories = '${sockDir}'
`);
    const start = spawnSync(pgCtl!, ['-D', dataDir, '-l', join(dataDir, 'pg.log'), 'start'], { encoding: 'utf8' });
    if (start.status !== 0) throw new Error(start.stderr || start.stdout);
    const apply = spawnSync('bash', [
      join(process.cwd(), 'scripts/apply-supabase-chain.sh'),
      '-h', sockDir,
      '-p', port,
      '-U', 'postgres',
      '-d', 'postgres',
    ], { encoding: 'utf8' });
    if (apply.status !== 0) throw new Error(apply.stderr || apply.stdout);
    const tables = Object.keys(SELECTED);
    const listed = runSql(`
      SELECT table_name || '.' || column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (${tables.map(name => `'${name}'`).join(',')})
      ORDER BY table_name, ordinal_position
    `);
    live = {};
    for (const line of listed.split('\n').filter(Boolean)) {
      const [table, column] = line.split('.');
      live[table] = live[table] ?? [];
      live[table].push(column);
    }
  }, 180000);

  afterAll(() => {
    if (dataDir && pgCtl) spawnSync(pgCtl, ['-D', dataDir, 'stop', '-m', 'fast'], { encoding: 'utf8' });
    if (dataDir) rmSync(join(dataDir, '..'), { recursive: true, force: true });
  });

  it('Q-A Q-D Q-E selected columns exist on the applied chain', () => {
    for (const [table, columns] of Object.entries(SELECTED)) {
      const have = new Set(live[table] ?? []);
      for (const column of columns) {
        expect(have.has(column), `${table}.${column} missing from information_schema`).toBe(true);
      }
    }
  });

  it('F1 filter columns exist on the applied chain', () => {
    for (const [table, columns] of Object.entries(FILTERS)) {
      const have = new Set(live[table] ?? []);
      for (const column of columns) {
        expect(have.has(column), `${table}.${column} filter missing from information_schema`).toBe(true);
      }
    }
  });

  it('Q-A Q-D Q-E F1 run the real queries on seeded rows', async () => {
    const CO = '11111111-1111-4111-8111-111111111111';
    const OTHER = '22222222-2222-4222-8222-222222222222';
    const USER = '33333333-3333-4333-8333-333333333333';
    const CLIENT = '44444444-4444-4444-8444-444444444444';
    const PARENT = '55555555-5555-4555-8555-555555555555';
    const VISIT = '66666666-6666-4666-8666-666666666666';
    const FOREIGN_JOB = '77777777-7777-4777-8777-777777777777';
    const COMING = '88888888-8888-4888-8888-888888888888';
    const INV = '99999999-9999-4999-8999-999999999999';
    const INV_FOREIGN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const INV_DRAFT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    runSql(`
      INSERT INTO auth.users (id, email) VALUES ('${USER}', 'qa@example.com') ON CONFLICT (id) DO NOTHING;
      INSERT INTO companies (id, name) VALUES ('${CO}', 'QA Co'), ('${OTHER}', 'Other Co') ON CONFLICT (id) DO NOTHING;
      INSERT INTO profiles (id, email, name, company_id) VALUES ('${USER}', 'qa@example.com', 'QA', '${CO}') ON CONFLICT (id) DO NOTHING;
      INSERT INTO clients (id, company_id, name, address) VALUES
        ('${CLIENT}', '${CO}', 'Gwen Albright', 'Kedron') ON CONFLICT (id) DO NOTHING;
      INSERT INTO jobs (id, company_id, client_id, title, status, scheduled_date, start_time, assigned_team, created_by, job_number)
      VALUES
        ('${PARENT}', '${CO}', '${CLIENT}', 'Parent', 'in_progress', '2026-09-01', '08:00', '[]', '${USER}', 9),
        ('${VISIT}', '${CO}', '${CLIENT}', 'Visit', 'completed', '2026-10-10', '09:00', '[]', '${USER}', 36),
        ('${FOREIGN_JOB}', '${OTHER}', NULL, 'Foreign', 'completed', '2026-10-10', '09:00', '[]', '${USER}', 99),
        ('${COMING}', '${CO}', '${CLIENT}', 'Tue cistern', 'scheduled', '2026-10-20', '07:30', '[]', '${USER}', 40)
      ON CONFLICT (id) DO NOTHING;
      UPDATE jobs SET parent_job_id = '${PARENT}' WHERE id = '${VISIT}';
      INSERT INTO invoices (id, company_id, invoice_number, status, total, amount_paid, due_date, client_id, job_id)
      VALUES
        ('${INV}', '${CO}', 1112, 'sent', 1929.65, 0, '2026-10-30', '${CLIENT}', NULL),
        ('${INV_FOREIGN}', '${OTHER}', 300, 'sent', 5000, 0, '2026-10-30', NULL, '${FOREIGN_JOB}'),
        ('${INV_DRAFT}', '${CO}', 200, 'draft', 999, 0, '2026-10-30', '${CLIENT}', NULL)
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO invoice_payments (company_id, invoice_id, amount, paid_at, method)
      SELECT * FROM (VALUES
        ('${CO}'::uuid, '${INV}'::uuid, 4214.30, '2026-10-19'::date, 'bank'),
        ('${OTHER}'::uuid, '${INV_FOREIGN}'::uuid, 8000, '2026-10-19'::date, 'bank')
      ) v(company_id, invoice_id, amount, paid_at, method)
      WHERE NOT EXISTS (
        SELECT 1 FROM invoice_payments p WHERE p.invoice_id = v.invoice_id AND p.company_id = v.company_id
      );
      INSERT INTO expenses (company_id, cost_class, category, description, amount, tax_rate, tax_amount, total, expense_date, status, employee_cost_type)
      SELECT * FROM (VALUES
        ('${CO}'::uuid, 'cogs', 'materials', 'Pipe', 1862.75, 0, 0, 1862.75, '2026-10-19'::date, 'recorded', NULL),
        ('${CO}'::uuid, 'employee', 'wages', 'Wages', 2000, 0, 0, 2000, '2026-10-19'::date, 'paid', 'wages'),
        ('${CO}'::uuid, 'employee', 'super', 'Super', 190, 0, 0, 190, '2026-10-19'::date, 'paid', 'super'),
        ('${CO}'::uuid, 'overhead', 'office', 'Draft', 300, 0, 0, 300, '2026-10-19'::date, 'draft', NULL)
      ) v(company_id, cost_class, category, description, amount, tax_rate, tax_amount, total, expense_date, status, employee_cost_type)
      WHERE NOT EXISTS (
        SELECT 1 FROM expenses e WHERE e.company_id = v.company_id AND e.description = v.description
      );
    `);

    const client = pgClient();
    const ready = await fetchReadyToInvoice(client, CO, '2026-10-19');
    expect(ready.map(row => row.id)).toEqual([PARENT]);
    expect(ready.some(row => row.id === FOREIGN_JOB)).toBe(false);

    const cash = await fetchTodayCash(client, CO, '2026-10-19');
    expect(cash.moneyIn).toBe(4214.3);
    expect(cash.moneyOut).toBe(1862.75);

    const coming = await fetchComingUp(client, CO, '2026-10-19');
    expect(coming.map(row => row.id)).toEqual([COMING]);
    expect(coming[0]?.client_name).toBe('Gwen Albright');

    const outstanding = await fetchOutstanding(client, CO, new Date(2026, 9, 19));
    expect(outstanding.outstanding).toBe(1929.65);
    expect(outstanding.count).toBe(1);
    expect(outstanding.display.map(row => row.id)).toEqual([INV]);
  });

  function sqlLit(value: unknown): string {
    if (Array.isArray(value)) return `ARRAY[${value.map(sqlLit).join(',')}]`;
    if (value == null) return 'NULL';
    if (typeof value === 'number') return String(value);
    return `'${String(value).replace(/'/g, "''")}'`;
  }

  function pgClient(): TodayBoardClient {
    return {
      from(table: string) {
        let select = '*';
        const filters: Array<{ kind: string; col: string; val: unknown }> = [];
        const order: Array<{ col: string; asc: boolean }> = [];
        let limit: number | undefined;
        const run = async () => {
          let inner = `SELECT ${select} FROM public.${table} WHERE TRUE`;
          for (const filter of filters) {
            if (filter.kind === 'eq') inner += ` AND ${filter.col} = ${sqlLit(filter.val)}`;
            else if (filter.kind === 'neq') inner += ` AND ${filter.col} <> ${sqlLit(filter.val)}`;
            else if (filter.kind === 'in') inner += ` AND ${filter.col}::text = ANY(${sqlLit(filter.val)}::text[])`;
            else if (filter.kind === 'gte') inner += ` AND ${filter.col}::text >= ${sqlLit(filter.val)}`;
            else if (filter.kind === 'lte') inner += ` AND ${filter.col}::text <= ${sqlLit(filter.val)}`;
            else if (filter.kind === 'gt') inner += ` AND ${filter.col}::text > ${sqlLit(filter.val)}`;
          }
          if (order.length) {
            inner += ` ORDER BY ${order.map(rule => `${rule.col} ${rule.asc ? 'ASC' : 'DESC'} NULLS LAST`).join(', ')}`;
          }
          if (limit != null) inner += ` LIMIT ${limit}`;
          const json = runSql(`SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (${inner}) t`);
          return { data: JSON.parse(json || '[]'), error: null };
        };
        const q = {
          select(columns: string) { select = columns; return q; },
          eq(col: string, val: string) { filters.push({ kind: 'eq', col, val }); return q; },
          neq(col: string, val: string) { filters.push({ kind: 'neq', col, val }); return q; },
          in(col: string, values: readonly string[]) { filters.push({ kind: 'in', col, val: values }); return q; },
          gte(col: string, val: string) { filters.push({ kind: 'gte', col, val }); return q; },
          lte(col: string, val: string) { filters.push({ kind: 'lte', col, val }); return q; },
          gt(col: string, val: string) { filters.push({ kind: 'gt', col, val }); return q; },
          order(col: string, opts?: { ascending?: boolean }) {
            order.push({ col, asc: opts?.ascending !== false });
            return q;
          },
          limit(count: number) { limit = count; return q; },
          then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
            return run().then(resolve, reject);
          },
        } as TodayFilterChain<Record<string, unknown>>;
        return { select: (columns: string) => q.select(columns) };
      },
    };
  }
});
