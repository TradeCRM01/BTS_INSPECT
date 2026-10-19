import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

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

describe.skipIf(!hasInitdb)('SEC-INSP-3 finalised lock on the real migration chain', () => {
  let dataDir = '';
  let sockDir = '';
  const port = String(process.env.PROOF_PGPORT_VITEST || '55451');

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

  function catchSql(sql: string): string {
    const direct = spawnSync(psqlBin!, [
      '-h', sockDir,
      '-p', port,
      '-U', 'postgres',
      '-d', 'postgres',
      '-X', '-q',
      '-At',
      '-c', `SELECT public._sec_insp3_catch(${literal(sql)});`,
    ], { encoding: 'utf8' });
    if (direct.status !== 0) {
      throw new Error(direct.stderr || direct.stdout || `catchSql failed for ${sql}`);
    }
    return direct.stdout.trim();
  }

  function literal(value: string): string {
    return `$sec$${value}$sec$`;
  }

  beforeAll(() => {
    const root = mkdtempSync(join(tmpdir(), 'sec-insp-3-vitest-'));
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
    const seed = spawnSync(psqlBin!, [
      '-h', sockDir, '-p', port, '-U', 'postgres', '-d', 'postgres',
      '-X', '-q', '-v', 'ON_ERROR_STOP=1',
      '-f', join(process.cwd(), 'supabase/tests/sec_insp_finalised_lock_seed.sql'),
    ], { encoding: 'utf8' });
    if (seed.status !== 0) throw new Error(seed.stderr || seed.stdout);
    runSql(`
      CREATE OR REPLACE FUNCTION public._sec_insp3_catch(sql text)
      RETURNS text LANGUAGE plpgsql AS $f$
      BEGIN
        EXECUTE sql;
        RETURN '00000';
      EXCEPTION WHEN OTHERS THEN
        RETURN SQLSTATE || ':' || left(SQLERRM, 80);
      END
      $f$;
    `);
  }, 180000);

  afterAll(() => {
    if (dataDir && pgCtl) spawnSync(pgCtl, ['-D', dataDir, 'stop', '-m', 'fast'], { encoding: 'utf8' });
    if (dataDir) rmSync(join(dataDir, '..'), { recursive: true, force: true });
  });

  it('blocks meta edit on a completed row', () => {
    expect(catchSql(`UPDATE public.inspections SET meta='{"siteName":"X"}' WHERE id='e1000000-0000-0000-0000-000000000002'`)).toMatch(/^P0001/);
  });

  it('blocks meta edit on a sent row', () => {
    expect(catchSql(`UPDATE public.inspections SET meta='{"siteName":"X"}' WHERE id='e1000000-0000-0000-0000-000000000004'`)).toMatch(/^P0001/);
  });

  it('blocks meta edit on a status=archived row', () => {
    expect(catchSql(`UPDATE public.inspections SET meta='{"siteName":"X"}' WHERE id='e1000000-0000-0000-0000-000000000005'`)).toMatch(/^P0001/);
  });

  it('stamps updated_by with the caller and overwrites a forged value', () => {
    const who = runSql(`
      SELECT set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}',false);
      SELECT public._sec_insp3_catch($u$UPDATE public.inspections SET updated_by='33333333-3333-3333-3333-333333333333', updated_at='2000-01-01' WHERE id='e1000000-0000-0000-0000-000000000003'$u$);
      SELECT updated_by::text FROM public.inspections WHERE id='e1000000-0000-0000-0000-000000000003';
    `);
    const last = who.split('\n').pop();
    expect(last).toBe('22222222-2222-2222-2222-222222222222');
  });

  it('keeps jobs.creator_name_snapshot when forged on a job bound to a finalised inspection', () => {
    expect(catchSql(`UPDATE public.jobs SET creator_name_snapshot='Forged' WHERE id='b1000000-0000-0000-0000-000000000001'`)).toBe('00000');
    expect(runSql(`SELECT creator_name_snapshot FROM public.jobs WHERE id='b1000000-0000-0000-0000-000000000001'`)).toBe('Pat Snapshot');
    expect(catchSql(`UPDATE public.inspections SET meta='{"siteName":"Forge"}' WHERE id='e1000000-0000-0000-0000-000000000001'`)).toMatch(/^P0001/);
  });

  it('allows client and job delete on a finalised row when print snapshots exist', () => {
    expect(catchSql(`DELETE FROM public.clients WHERE id='c1000000-0000-0000-0000-000000000003'`)).toBe('00000');
    expect(catchSql(`DELETE FROM public.jobs WHERE id='b1000000-0000-0000-0000-000000000003'`)).toBe('00000');
    const row = runSql(`SELECT client_id IS NULL AND crm_job_id IS NULL AND client_name_snapshot='Doomed Client' AND site_address_snapshot='Doom St' FROM public.inspections WHERE id='e1000000-0000-0000-0000-000000000007'`);
    expect(row).toBe('t');
  });

  it('rejects a cross-tenant client attach and allows a same-company attach', () => {
    expect(catchSql(`UPDATE public.inspections SET client_id='c1000000-0000-0000-0000-000000000004' WHERE id='e1000000-0000-0000-0000-000000000008'`)).toMatch(/^(42501|P0001)/);
    expect(catchSql(`UPDATE public.inspections SET client_id='c1000000-0000-0000-0000-000000000002' WHERE id='e1000000-0000-0000-0000-000000000008'`)).toBe('00000');
    expect(catchSql(`UPDATE public.inspections SET client_id='c1000000-0000-0000-0000-000000000001' WHERE id='e1000000-0000-0000-0000-000000000008'`)).toMatch(/^P0001/);
    expect(catchSql(`UPDATE public.inspections SET client_id='c1000000-0000-0000-0000-000000000004' WHERE id='e1000000-0000-0000-0000-000000000002'`)).toMatch(/^(42501|P0001)/);
    expect(catchSql(`UPDATE public.inspections SET client_id='c1000000-0000-0000-0000-000000000002' WHERE id='e1000000-0000-0000-0000-000000000002'`)).toBe('00000');
    expect(catchSql(`UPDATE public.inspections SET client_id=NULL WHERE id='e1000000-0000-0000-0000-000000000011'`)).toMatch(/^P0001/);
  });

  it('restores an archived draft and then allows edits', () => {
    expect(catchSql(`UPDATE public.inspections SET archived=true WHERE id='e1000000-0000-0000-0000-000000000003'`)).toBe('00000');
    expect(catchSql(`UPDATE public.inspections SET archived=false WHERE id='e1000000-0000-0000-0000-000000000003'`)).toBe('00000');
    expect(catchSql(`UPDATE public.inspections SET meta='{"siteName":"Restored St"}' WHERE id='e1000000-0000-0000-0000-000000000003'`)).toBe('00000');
  });

  it('blocks restoring archive on a completed row', () => {
    expect(catchSql(`UPDATE public.inspections SET archived=true WHERE id='e1000000-0000-0000-0000-000000000002'`)).toBe('00000');
    expect(catchSql(`UPDATE public.inspections SET archived=false WHERE id='e1000000-0000-0000-0000-000000000002'`)).toMatch(/^P0001/);
  });

  it('fills print snapshots on client attach so a later delete keeps the name', () => {
    expect(catchSql(`UPDATE public.inspections SET client_id='c1000000-0000-0000-0000-000000000005' WHERE id='e1000000-0000-0000-0000-000000000010'`)).toBe('00000');
    expect(runSql(`SELECT client_name_snapshot || '|' || site_address_snapshot FROM public.inspections WHERE id='e1000000-0000-0000-0000-000000000010'`)).toBe('Attach Client|Attach St');
    expect(catchSql(`DELETE FROM public.clients WHERE id='c1000000-0000-0000-0000-000000000005'`)).toBe('00000');
    expect(runSql(`SELECT client_id IS NULL AND client_name_snapshot='Attach Client' AND site_address_snapshot='Attach St' FROM public.inspections WHERE id='e1000000-0000-0000-0000-000000000010'`)).toBe('t');
    expect(catchSql(`UPDATE public.inspections SET client_id='c1000000-0000-0000-0000-000000000004' WHERE id='e1000000-0000-0000-0000-000000000010'`)).toMatch(/^(42501|P0001)/);
  });

  it('blocks inspector_id swap and a print snapshot forge on a finalised row', () => {
    expect(catchSql(`UPDATE public.inspections SET inspector_id='11111111-1111-1111-1111-111111111111' WHERE id='e1000000-0000-0000-0000-000000000001'`)).toMatch(/^P0001/);
    expect(catchSql(`UPDATE public.inspections SET client_name_snapshot='Forged' WHERE id='e1000000-0000-0000-0000-000000000001'`)).toMatch(/^P0001/);
  });

  it('treats the archived flag as finalised in the trigger', () => {
    expect(catchSql(`UPDATE public.inspections SET meta='{"siteName":"AF2"}' WHERE id='e1000000-0000-0000-0000-000000000006'`)).toMatch(/^P0001/);
  });

  it('freezes template_snapshot, completed_at, doc_version and inspector snapshots', () => {
    expect(catchSql(`UPDATE public.inspections SET template_snapshot='{"name":"swapped"}' WHERE id='e1000000-0000-0000-0000-000000000001'`)).toMatch(/^P0001/);
    expect(catchSql(`UPDATE public.inspections SET completed_at='2020-01-01' WHERE id='e1000000-0000-0000-0000-000000000001'`)).toMatch(/^P0001/);
    expect(catchSql(`UPDATE public.inspections SET doc_version=9 WHERE id='e1000000-0000-0000-0000-000000000001'`)).toMatch(/^P0001/);
    expect(catchSql(`UPDATE public.inspections SET inspector_name_snapshot='Forged' WHERE id='e1000000-0000-0000-0000-000000000001'`)).toBe('00000');
    expect(runSql(`SELECT inspector_name_snapshot FROM public.inspections WHERE id='e1000000-0000-0000-0000-000000000001'`)).toBe('Pat Snapshot');
    expect(catchSql(`UPDATE public.inspections SET inspector_licence_snapshot='FAKE' WHERE id='e1000000-0000-0000-0000-000000000001'`)).toBe('00000');
    expect(runSql(`SELECT inspector_licence_snapshot FROM public.inspections WHERE id='e1000000-0000-0000-0000-000000000001'`)).toBe('EC-4411');
  });

  it('blocks a finalised to draft status move', () => {
    expect(catchSql(`UPDATE public.inspections SET status='draft' WHERE id='e1000000-0000-0000-0000-000000000001'`)).toMatch(/^P0001/);
  });
}, 180000);
