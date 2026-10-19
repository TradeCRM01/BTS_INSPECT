import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CLIENT_PORTAL_TABLE_COLUMNS } from '../../supabase/functions/client-portal/portalColumns';
import {
  clientPortalIndexSource,
  extractClientPortalColumnUses,
  uniqueColumnsByTable,
} from './clientPortalSchemaGuard';

/**
 * Stub PostgREST (portalAdminStub.project) used to copy whatever column name the
 * select string asked for. A missing column became undefined and the handler
 * still returned 200 with empty report cards. Real PostgREST returns 400
 * "column reports.created_at does not exist".
 */

function pgBin(version: string, name: string): string {
  return `/usr/lib/postgresql/${version}/bin/${name}`;
}

function pgVersionBinsMissing(version: string): boolean {
  return !['initdb', 'pg_ctl', 'psql'].every((name) => existsSync(pgBin(version, name)));
}

const skipPg16 = pgVersionBinsMissing('16');
const skipPg17 = pgVersionBinsMissing('17');

function findPgBin(version: string, name: string): string {
  const dir = pgBin(version, name);
  if (!existsSync(dir)) {
    throw new Error(`Need PostgreSQL ${version} ${name} at /usr/lib/postgresql/${version}/bin`);
  }
  return dir;
}

function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('could not allocate a TCP port'));
        return;
      }
      const { port } = addr;
      server.close((err) => (err ? reject(err) : resolve(port)));
    });
    server.on('error', reject);
  });
}

function rewriteMigration(sql: string, version: string): string {
  let out = sql
    .replace(/CREATE EXTENSION IF NOT EXISTS pg_cron;/g, '-- skipped pg_cron (stubbed in bootstrap)')
    .replace(/CREATE EXTENSION IF NOT EXISTS pg_net;/g, '-- skipped pg_net (stubbed in bootstrap)')
    .replace(/CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;/g, '-- skipped http (stubbed in bootstrap)');
  if (version === '16') {
    out = out.replace(/, MAINTAIN/g, '').replace(/MAINTAIN, /g, '').replace(/MAINTAIN/g, '');
  }
  return out;
}

function applyMigrations(psql: string, sockDir: string, port: string, database: string, version: string) {
  const boot = spawnSync(psql, [
    '-h', sockDir, '-p', port, '-U', 'grafter', '-d', database,
    '-v', 'ON_ERROR_STOP=1',
    '-f', join(process.cwd(), 'scripts/pg-client-portal-bootstrap.sql'),
  ], { encoding: 'utf8', env: { ...process.env, PGHOST: sockDir } });
  if (boot.status !== 0) {
    throw new Error(boot.stderr || boot.stdout || `bootstrap failed: ${boot.status}`);
  }

  const migDir = join(process.cwd(), 'supabase/migrations');
  const files = readdirSync(migDir).filter((name) => name.endsWith('.sql')).sort();
  expect(files.length).toBeGreaterThan(100);
  for (const file of files) {
    const sql = rewriteMigration(readFileSync(join(migDir, file), 'utf8'), version);
    const tmpSql = join(sockDir, `${file}`);
    writeFileSync(tmpSql, sql);
    const applied = spawnSync(psql, [
      '-h', sockDir, '-p', port, '-U', 'grafter', '-d', database,
      '-v', 'ON_ERROR_STOP=1', '-f', tmpSql,
    ], { encoding: 'utf8', env: { ...process.env, PGHOST: sockDir } });
    if (applied.status !== 0) {
      throw new Error(`${file}: ${applied.stderr || applied.stdout || `psql exited ${applied.status}`}`);
    }
  }
  return files.length;
}

function columnsInCatalog(
  psql: string,
  sockDir: string,
  port: string,
  database: string,
  table: string,
): string[] {
  const result = spawnSync(psql, [
    '-h', sockDir, '-p', port, '-U', 'grafter', '-d', database,
    '-At', '-v', 'ON_ERROR_STOP=1',
    '-c', `SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = '${table}'
      ORDER BY column_name`,
  ], { encoding: 'utf8', env: { ...process.env, PGHOST: sockDir } });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `catalog query failed for ${table}`);
  }
  return result.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
}

function assertServerMajor(psql: string, sockDir: string, port: string, expected: string) {
  const result = spawnSync(psql, [
    '-h', sockDir, '-p', port, '-U', 'grafter', '-d', 'postgres',
    '-At', '-v', 'ON_ERROR_STOP=1',
    '-c', 'SHOW server_version_num',
  ], { encoding: 'utf8', env: { ...process.env, PGHOST: sockDir } });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'SHOW server_version_num failed');
  }
  const num = Number(result.stdout.trim());
  const major = Math.floor(num / 10000);
  expect(major, `PG${expected} binary must not start PG${major}`).toBe(Number(expected));
}

async function proveOnPostgres(version: string) {
  const initdb = findPgBin(version, 'initdb');
  const pgCtl = findPgBin(version, 'pg_ctl');
  const psql = findPgBin(version, 'psql');
  const port = String(await allocatePort());
  const root = mkdtempSync(join(tmpdir(), `grafter-portal-pg${version}-`));
  const dataDir = join(root, 'pgdata');
  const sockDir = join(root, 'sock');
  mkdirSync(sockDir, { recursive: true });
  const init = spawnSync(initdb, ['-D', dataDir, '-U', 'grafter', '--no-instructions', '-A', 'trust'], {
    encoding: 'utf8',
  });
  if (init.status !== 0) throw new Error(init.stderr || init.stdout);
  writeFileSync(join(dataDir, 'postgresql.conf'), `listen_addresses = ''
port = ${port}
unix_socket_directories = '${sockDir}'
`);
  const start = spawnSync(pgCtl, ['-D', dataDir, '-l', join(dataDir, 'pg.log'), 'start'], { encoding: 'utf8' });
  if (start.status !== 0) {
    throw new Error(start.stderr || start.stdout || readFileSync(join(dataDir, 'pg.log'), 'utf8'));
  }
  try {
    assertServerMajor(psql, sockDir, port, version);
    const createdb = spawnSync(psql, [
      '-h', sockDir, '-p', port, '-U', 'grafter', '-d', 'postgres',
      '-c', 'CREATE DATABASE grafter',
    ], { encoding: 'utf8', env: { ...process.env, PGHOST: sockDir } });
    if (createdb.status !== 0) throw new Error(createdb.stderr || createdb.stdout);

    const fileCount = applyMigrations(psql, sockDir, port, 'grafter', version);
    const uses = extractClientPortalColumnUses(clientPortalIndexSource());
    const byTable = uniqueColumnsByTable(uses);
    const missingFromMap: string[] = [];
    const catalogMismatch: string[] = [];
    for (const [table, mapped] of Object.entries(CLIENT_PORTAL_TABLE_COLUMNS)) {
      const catalog = columnsInCatalog(psql, sockDir, port, 'grafter', table);
      expect(catalog, `${table} catalog`).toEqual([...mapped]);
      const used = byTable.get(table) ?? [];
      for (const column of used) {
        if (!mapped.includes(column)) missingFromMap.push(`${table}.${column}`);
      }
      if (table === 'reports' && catalog.includes('created_at')) {
        catalogMismatch.push('reports.created_at');
      }
    }
    expect(missingFromMap, `PG${version} index.ts columns missing from map`).toEqual([]);
    expect(catalogMismatch).toEqual([]);

    const reportCols = columnsInCatalog(psql, sockDir, port, 'grafter', 'reports');
    expect(reportCols).toContain('generated_at');
    expect(reportCols).not.toContain('created_at');
    return { version, fileCount, reports: reportCols, byTable };
  } finally {
    spawnSync(pgCtl, ['-D', dataDir, 'stop', '-m', 'immediate'], { encoding: 'utf8' });
    rmSync(root, { recursive: true, force: true });
  }
}

describe('client-portal schema guard on real Postgres', () => {
  it.skipIf(skipPg16)(
    skipPg16
      ? 'initdb for PG16 not found'
      : 'PG16: every client-portal column exists after all supabase/migrations',
    async () => {
      const result = await proveOnPostgres('16');
      expect(result.byTable.get('reports')).toContain('generated_at');
      expect(result.fileCount).toBeGreaterThan(100);
    },
    180_000,
  );

  it.skipIf(skipPg17)(
    skipPg17
      ? 'initdb for PG17 not found'
      : 'PG17: every client-portal column exists after all supabase/migrations',
    async () => {
      const result = await proveOnPostgres('17');
      expect(result.byTable.get('reports')).toContain('generated_at');
      expect(result.fileCount).toBeGreaterThan(100);
    },
    180_000,
  );
});
