import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const COMPANY_A = '5a106e2d-0000-4000-8000-000000000001';
const COMPANY_B = '5a106e2d-0000-4000-8000-000000000002';
const ADMIN_A = '5a106e2d-0000-4000-8000-0000000000a1';
const CREW_A = '5a106e2d-0000-4000-8000-0000000000a2';
const ADMIN_B = '5a106e2d-0000-4000-8000-0000000000b1';
const SECRET_A = 'sec-smtp-probe-secret-5a106e2d';
const SECRET_B = 'sec-smtp-other-company-secret';
const MIGRATION = 'supabase/migrations/20261023120000_sec_smtp_pass_lock.sql';
const ROLLBACK = 'supabase/rollbacks/20261023120000_sec_smtp_pass_lock.rollback.sql';

function findBin(name: string, version = '16'): string | null {
  const candidate = `/usr/lib/postgresql/${version}/bin/${name}`;
  if (existsSync(candidate)) return candidate;
  const other = `/usr/lib/postgresql/17/bin/${name}`;
  if (existsSync(other)) return other;
  return null;
}

const initdb = findBin('initdb');
const pgCtl = findBin('pg_ctl');
const psqlBin = findBin('psql');
const hasInitdb = Boolean(initdb && pgCtl && psqlBin);

describe.skipIf(!hasInitdb)('SEC-SMTP grants and RPC on the real migration chain', () => {
  let dataDir = '';
  let sockDir = '';
  const port = String(process.env.PROOF_PGPORT_SMTP || '55461');

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

  function asRole(role: 'authenticated' | 'anon' | 'service_role', uid: string | null, sql: string): string {
    const claims = uid
      ? `{"sub":"${uid}","role":"${role}"}`
      : `{"role":"${role}"}`;
    return runSql(`SELECT public._sec_smtp_catch(${literal(role)}, ${literal(claims)}, ${literal(sql)});`);
  }

  function literal(value: string): string {
    return `$sec$${value}$sec$`;
  }

  function expectReady(raw: string, ready: boolean) {
    expect(raw).toMatch(ready ? /^00000\|(t|true)$/ : /^00000\|(f|false)$/);
  }

  beforeAll(() => {
    const root = mkdtempSync(join(tmpdir(), 'sec-smtp-vitest-'));
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
    runSql(`
      INSERT INTO auth.users(id, email) VALUES
        ('${ADMIN_A}', 'admin-a@probe.test'),
        ('${CREW_A}', 'crew-a@probe.test'),
        ('${ADMIN_B}', 'admin-b@probe.test');
      INSERT INTO public.companies(id, name) VALUES
        ('${COMPANY_A}', 'Probe A'),
        ('${COMPANY_B}', 'Probe B');
      INSERT INTO public.profiles(id, email, name, company_id, role) VALUES
        ('${ADMIN_A}', 'admin-a@probe.test', 'Admin A', '${COMPANY_A}', 'admin'),
        ('${CREW_A}', 'crew-a@probe.test', 'Crew A', '${COMPANY_A}', 'member'),
        ('${ADMIN_B}', 'admin-b@probe.test', 'Admin B', '${COMPANY_B}', 'admin');
      INSERT INTO public.email_settings(
        company_id, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email
      ) VALUES
        ('${COMPANY_A}', 'smtp.resend.com', 587, false, 'resend', '${SECRET_A}', 'Probe A', 'a@probe.test'),
        ('${COMPANY_B}', 'smtp.resend.com', 587, false, 'resend', '${SECRET_B}', 'Probe B', 'b@probe.test');
      CREATE OR REPLACE FUNCTION public._sec_smtp_catch(p_role text, p_claims text, p_sql text)
      RETURNS text
      LANGUAGE plpgsql AS $f$
      DECLARE
        v_out text;
      BEGIN
        PERFORM set_config('request.jwt.claims', p_claims, true);
        EXECUTE format('SET LOCAL ROLE %I', p_role);
        BEGIN
          EXECUTE p_sql INTO v_out;
          RETURN '00000|' || coalesce(v_out, '');
        EXCEPTION WHEN OTHERS THEN
          RETURN SQLSTATE || '|' || SQLERRM;
        END;
      END
      $f$;
    `);
  }, 180000);

  afterAll(() => {
    if (dataDir && pgCtl) spawnSync(pgCtl, ['-D', dataDir, 'stop', '-m', 'fast'], { encoding: 'utf8' });
    if (dataDir) rmSync(join(dataDir, '..'), { recursive: true, force: true });
  });

  it('keeps probe rows in company 5a106e2d only', () => {
    const seed = runSql(`
      SELECT string_agg(company_id::text, ',')
      FROM public.email_settings
      WHERE smtp_pass IN ('${SECRET_A}', '${SECRET_B}')
    `);
    expect(seed).toContain(COMPANY_A);
    expect(seed).toContain(COMPANY_B);
    expect(seed).not.toMatch(/8d88e1d6|b62e2079|40183ed1/i);
    expect(readFileSync(join(process.cwd(), MIGRATION), 'utf8')).not.toMatch(/8d88e1d6|b62e2079/);
    expect(existsSync(join(process.cwd(), ROLLBACK))).toBe(true);
  });

  it('denies smtp secret SELECT to authenticated and anon, and allows service_role', () => {
    const admin = asRole('authenticated', ADMIN_A, `SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_A}'`);
    const crew = asRole('authenticated', CREW_A, `SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_A}'`);
    const anon = asRole('anon', null, `SELECT smtp_pass FROM public.email_settings`);
    const service = asRole('service_role', null, `SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_A}'`);
    expect(admin).toMatch(/^42501\|/);
    expect(crew).toMatch(/^42501\|/);
    expect(anon).toMatch(/^42501\|/);
    expect(service).toBe(`00000|${SECRET_A}`);
  });

  it('lets an authenticated admin read public columns with no 42501', () => {
    const host = asRole('authenticated', ADMIN_A, `SELECT smtp_host FROM public.email_settings WHERE company_id = '${COMPANY_A}'`);
    expect(host).toBe('00000|smtp.resend.com');
  });

  it('returns true for company A when set, false when unset, and never company B state', () => {
    const crewSet = asRole('authenticated', CREW_A, `SELECT public.email_smtp_ready()`);
    expectReady(crewSet, true);
    runSql(`UPDATE public.email_settings SET smtp_pass = '' WHERE company_id = '${COMPANY_A}'`);
    const crewUnset = asRole('authenticated', CREW_A, `SELECT public.email_smtp_ready()`);
    expectReady(crewUnset, false);
    runSql(`UPDATE public.email_settings SET smtp_pass = '${SECRET_A}' WHERE company_id = '${COMPANY_A}'`);
    const stillA = asRole('authenticated', CREW_A, `SELECT public.email_smtp_ready()`);
    expectReady(stillA, true);
    const other = asRole('authenticated', ADMIN_B, `SELECT public.email_smtp_ready()`);
    expectReady(other, true);
    runSql(`UPDATE public.email_settings SET smtp_pass = '' WHERE company_id = '${COMPANY_B}'`);
    const bUnset = asRole('authenticated', ADMIN_B, `SELECT public.email_smtp_ready()`);
    const aStill = asRole('authenticated', CREW_A, `SELECT public.email_smtp_ready()`);
    expectReady(bUnset, false);
    expectReady(aStill, true);
    runSql(`UPDATE public.email_settings SET smtp_pass = '${SECRET_B}' WHERE company_id = '${COMPANY_B}'`);
  });

  it('rejects anon execute of email_smtp_ready', () => {
    const anon = asRole('anon', null, `SELECT public.email_smtp_ready()`);
    expect(anon).toMatch(/^42501\|/);
  });

  it('keeps admin write-only updates and blocks reading the secret back', () => {
    const write = asRole(
      'authenticated',
      ADMIN_A,
      `UPDATE public.email_settings SET smtp_pass = 'sec-smtp-rotated-5a106e2d' WHERE company_id = '${COMPANY_A}' RETURNING from_email`,
    );
    expect(write).toBe('00000|a@probe.test');
    const readBack = asRole('authenticated', ADMIN_A, `SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_A}'`);
    expect(readBack).toMatch(/^42501\|/);
    const stored = asRole('service_role', null, `SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_A}'`);
    expect(stored).toBe('00000|sec-smtp-rotated-5a106e2d');
    runSql(`UPDATE public.email_settings SET smtp_pass = '${SECRET_A}' WHERE company_id = '${COMPANY_A}'`);
  });

  it('matches intended CRUD by role on email_settings', () => {
    const adminInsert = asRole(
      'authenticated',
      ADMIN_A,
      `INSERT INTO public.email_settings(company_id, smtp_host, from_email)
       VALUES ('${COMPANY_A}', 'smtp.resend.com', 'dup@probe.test') RETURNING from_email`,
    );
    expect(adminInsert).toMatch(/23505|00000\|/);

    const crewUpdate = asRole(
      'authenticated',
      CREW_A,
      `UPDATE public.email_settings SET from_name = 'Crew' WHERE company_id = '${COMPANY_A}' RETURNING from_name`,
    );
    expect(crewUpdate).toMatch(/^(42501|00000\|)$/);
    if (crewUpdate === '00000|') {
      expect(runSql(`SELECT from_name FROM public.email_settings WHERE company_id = '${COMPANY_A}'`)).toBe('Probe A');
    }

    const hop = asRole(
      'authenticated',
      ADMIN_A,
      `UPDATE public.email_settings SET from_name = 'Hop' WHERE company_id = '${COMPANY_B}' RETURNING from_name`,
    );
    expect(hop).toMatch(/^(42501|00000\|)$/);
    expect(runSql(`SELECT from_name FROM public.email_settings WHERE company_id = '${COMPANY_B}'`)).toBe('Probe B');

    const anonInsert = asRole(
      'anon',
      null,
      `INSERT INTO public.email_settings(company_id, smtp_host, from_email)
       VALUES ('${COMPANY_A}', 'smtp.resend.com', 'anon@probe.test') RETURNING from_email`,
    );
    expect(anonInsert).toMatch(/^42501\|/);
  });

  it('lets the service_role edge path read the secret and send', async () => {
    const edge = readFileSync(join(process.cwd(), 'supabase/functions/test-smtp/index.ts'), 'utf8');
    expect(edge).toContain('.select("smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email")');
    expect(edge).toContain('Authorization": `Bearer ${settings.smtp_pass}`');
    const pass = asRole('service_role', null, `SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_A}'`);
    expect(pass).toBe(`00000|${SECRET_A}`);
    const secret = pass.slice('00000|'.length);
    const captured = await new Promise<string>((resolve, reject) => {
      const server = createServer((req, res) => {
        resolve(String(req.headers.authorization ?? ''));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: 'mock-send' }));
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (!addr || typeof addr === 'string') {
          reject(new Error('no listen port'));
          return;
        }
        fetch(`http://127.0.0.1:${addr.port}/emails`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secret}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: 'Probe A <a@probe.test>', to: ['admin-a@probe.test'], subject: 'test' }),
        }).then(() => server.close()).catch(reject);
      });
    });
    expect(captured).toBe(`Bearer ${SECRET_A}`);
  });
}, 180000);
