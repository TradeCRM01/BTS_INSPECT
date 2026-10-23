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
});
