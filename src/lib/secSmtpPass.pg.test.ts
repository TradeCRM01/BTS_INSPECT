import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  EMAIL_SETTINGS_PUBLIC_COLUMNS,
  saveCompanyEmailSettings,
} from './emailSmtpClient';

const COMPANY_A = '5a106e2d-0000-4000-8000-000000000001';
const COMPANY_B = '5a106e2d-0000-4000-8000-000000000002';
const COMPANY_C = '5a106e2d-0000-4000-8000-000000000003';
const ADMIN_A = '5a106e2d-0000-4000-8000-0000000000a1';
const CREW_A = '5a106e2d-0000-4000-8000-0000000000a2';
const ADMIN_B = '5a106e2d-0000-4000-8000-0000000000b1';
const ADMIN_C = '5a106e2d-0000-4000-8000-0000000000c1';
const SECRET_A = 'sec-smtp-probe-secret-5a106e2d';
const SECRET_B = 'sec-smtp-other-company-secret';
const SECRET_FIRST = 'sec-smtp-first-save-5a106e2d';
const SECRET_ROTATE = 'sec-smtp-rotated-save-5a106e2d';
const MIGRATION = 'supabase/migrations/20261023120000_sec_smtp_pass_lock.sql';
const ROLLBACK = 'supabase/rollbacks/20261023120000_sec_smtp_pass_lock.rollback.sql';
const JWT_SECRET = 'sec-smtp-local-jwt-secret-32chars!!';
const POSTGREST_BIN = process.env.PGRST_BIN || '/tmp/postgrest-bin/postgrest';

function findBin(name: string, version = '16'): string | null {
  const candidate = `/usr/lib/postgresql/${version}/bin/${name}`;
  if (existsSync(candidate)) return candidate;
  const other = `/usr/lib/postgresql/17/bin/${name}`;
  if (existsSync(other)) return other;
  return null;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        server.close();
        reject(new Error('no listen port'));
        return;
      }
      const port = addr.port;
      server.close((err) => err ? reject(err) : resolve(port));
    });
    server.on('error', reject);
  });
}

function hs256(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

const initdb = findBin('initdb');
const pgCtl = findBin('pg_ctl');
const psqlBin = findBin('psql');
const hasInitdb = Boolean(initdb && pgCtl && psqlBin);
const hasPostgrest = existsSync(POSTGREST_BIN);

describe.skipIf(!hasInitdb)('SEC-SMTP grants and RPC on the real migration chain', () => {
  let dataDir = '';
  let sockDir = '';
  let port = process.env.PROOF_PGPORT_SMTP || process.env.PGPORT || '';
  let pgrstPort = process.env.PROOF_PGRST_PORT || '';
  let pgrst: ChildProcess | undefined;
  let pgrstUrl = '';
  let proxy: ReturnType<typeof createServer> | undefined;
  let proxyUrl = '';

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

  function adminClient(uid: string) {
    const token = hs256({
      sub: uid,
      role: 'authenticated',
      aud: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    return createClient(proxyUrl, 'sec-smtp-anon', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}`, apikey: 'sec-smtp-anon' } },
    });
  }

  beforeAll(async () => {
    if (!port) port = String(await freePort());
    if (!pgrstPort) pgrstPort = String(await freePort());
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
        ('${ADMIN_B}', 'admin-b@probe.test'),
        ('${ADMIN_C}', 'admin-c@probe.test');
      INSERT INTO public.companies(id, name) VALUES
        ('${COMPANY_A}', 'Probe A'),
        ('${COMPANY_B}', 'Probe B'),
        ('${COMPANY_C}', 'Probe C');
      INSERT INTO public.profiles(id, email, name, company_id, role) VALUES
        ('${ADMIN_A}', 'admin-a@probe.test', 'Admin A', '${COMPANY_A}', 'admin'),
        ('${CREW_A}', 'crew-a@probe.test', 'Crew A', '${COMPANY_A}', 'member'),
        ('${ADMIN_B}', 'admin-b@probe.test', 'Admin B', '${COMPANY_B}', 'admin'),
        ('${ADMIN_C}', 'admin-c@probe.test', 'Admin C', '${COMPANY_C}', 'admin');
      INSERT INTO public.email_settings(
        company_id, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_pass, from_name, from_email
      ) VALUES
        ('${COMPANY_A}', 'smtp.resend.com', 587, false, 'resend', '${SECRET_A}', 'Probe A', 'a@probe.test'),
        ('${COMPANY_B}', 'smtp.resend.com', 587, false, 'resend', '${SECRET_B}', 'Probe B', 'b@probe.test');
      ALTER ROLE authenticator WITH LOGIN;
      GRANT anon, authenticated, service_role TO authenticator;
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
    if (hasPostgrest) {
      pgrstUrl = `http://127.0.0.1:${pgrstPort}`;
      pgrst = spawn(POSTGREST_BIN, [], {
        env: {
          ...process.env,
          PGRST_DB_URI: `postgres://authenticator@/postgres?host=${sockDir}&port=${port}`,
          PGRST_DB_SCHEMAS: 'public',
          PGRST_DB_ANON_ROLE: 'anon',
          PGRST_JWT_SECRET: JWT_SECRET,
          PGRST_SERVER_HOST: '127.0.0.1',
          PGRST_SERVER_PORT: pgrstPort,
          PGRST_DB_CHANNEL_ENABLED: 'false',
          PGRST_LOG_LEVEL: 'error',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const until = Date.now() + 15000;
      let up = false;
      while (Date.now() < until) {
        try {
          const res = await fetch(`${pgrstUrl}/`);
          if (res.ok || res.status === 200 || res.status === 401) {
            up = true;
            break;
          }
        } catch {
          /* still starting */
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (!up) throw new Error('PostgREST did not start');
      proxy = createServer(async (req, res) => {
        const incoming = new URL(req.url ?? '/', `http://127.0.0.1`);
        if (incoming.pathname.startsWith('/auth/v1')) {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end('{}');
          return;
        }
        const path = incoming.pathname.startsWith('/rest/v1')
          ? incoming.pathname.slice('/rest/v1'.length) || '/'
          : incoming.pathname;
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(req.headers)) {
          if (typeof value === 'string' && key !== 'host') headers[key] = value;
        }
        const fwd = await fetch(`${pgrstUrl}${path}${incoming.search}`, {
          method: req.method,
          headers,
          body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks),
        });
        const out = Buffer.from(await fwd.arrayBuffer());
        const outHeaders: Record<string, string> = {};
        fwd.headers.forEach((value, key) => {
          if (key === 'transfer-encoding') return;
          outHeaders[key] = value;
        });
        res.writeHead(fwd.status, outHeaders);
        res.end(out);
      });
      const proxyPort = await freePort();
      await new Promise<void>((resolve) => proxy!.listen(proxyPort, '127.0.0.1', () => resolve()));
      proxyUrl = `http://127.0.0.1:${proxyPort}`;
    }
  }, 180000);

  afterAll(async () => {
    if (proxy) {
      await new Promise<void>((resolve) => proxy!.close(() => resolve()));
    }
    if (pgrst?.pid) {
      try { process.kill(pgrst.pid, 'SIGTERM'); } catch { /* already gone */ }
    }
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

  it('takes no arguments on email_smtp_ready', () => {
    const args = runSql(`
      SELECT pronargs::text
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'email_smtp_ready'
    `);
    expect(args).toBe('0');
  });

  it('pins search_path=public, pg_temp on the SMTP RPCs', () => {
    const configs = runSql(`
      SELECT proname || '=' || array_to_string(proconfig, ',')
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname IN ('email_smtp_ready', 'email_smtp_set_pass')
       ORDER BY proname
    `);
    expect(configs).toContain('email_smtp_ready=search_path=public, pg_temp');
    expect(configs).toContain('email_smtp_set_pass=search_path=public, pg_temp');
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

  it('lets an admin set the password through the setter RPC and blocks crew and anon', () => {
    const admin = asRole('authenticated', ADMIN_A, `SELECT public.email_smtp_set_pass('sec-smtp-rpc-set-5a106e2d')`);
    expect(admin).toMatch(/^00000\|/);
    expect(asRole('service_role', null, `SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_A}'`))
      .toBe('00000|sec-smtp-rpc-set-5a106e2d');
    const crew = asRole('authenticated', CREW_A, `SELECT public.email_smtp_set_pass('crew-blocked')`);
    expect(crew).toMatch(/^42501\|/);
    const anon = asRole('anon', null, `SELECT public.email_smtp_set_pass('anon-blocked')`);
    expect(anon).toMatch(/^42501\|/);
    expect(asRole('service_role', null, `SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_A}'`))
      .toBe('00000|sec-smtp-rpc-set-5a106e2d');
    runSql(`UPDATE public.email_settings SET smtp_pass = '${SECRET_A}' WHERE company_id = '${COMPANY_A}'`);
  });

  it('denies a crew member calling email_smtp_set_pass', () => {
    const crew = asRole('authenticated', CREW_A, `SELECT public.email_smtp_set_pass('sec-smtp-crew-wipe-5a106e2d')`);
    expect(crew).toMatch(/^42501\|/);
    expect(runSql(`SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_A}'`)).toBe(SECRET_A);
  });

  it('email_smtp_set_pass takes only p_pass', () => {
    const args = runSql(`
      SELECT string_agg(pronargs::text, ',' ORDER BY pronargs)
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'email_smtp_set_pass'
    `);
    expect(args).toBe('1');
  });

  it('email_smtp_set_pass writes only the caller company', () => {
    expect(runSql(`SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_B}'`)).toBe(SECRET_B);
    const admin = asRole('authenticated', ADMIN_A, `SELECT public.email_smtp_set_pass('sec-smtp-a-only-5a106e2d')`);
    expect(admin).toMatch(/^00000\|/);
    expect(runSql(`SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_A}'`)).toBe('sec-smtp-a-only-5a106e2d');
    expect(runSql(`SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_B}'`)).toBe(SECRET_B);
    runSql(`UPDATE public.email_settings SET smtp_pass = '${SECRET_A}' WHERE company_id = '${COMPANY_A}'`);
  });

  it('pins SECURITY DEFINER on email_smtp_set_pass', () => {
    const definer = runSql(`
      SELECT prosecdef::text
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'email_smtp_set_pass'
    `);
    expect(definer).toMatch(/^(t|true)$/);
  });

  it('pins search_path on email_smtp_set_pass', () => {
    const config = runSql(`
      SELECT array_to_string(proconfig, ',')
        FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname = 'email_smtp_set_pass'
    `);
    expect(config).toContain('search_path=public, pg_temp');
  });

  it('revokes PUBLIC and anon execute on email_smtp_set_pass', () => {
    const anonPriv = runSql(`SELECT has_function_privilege('anon', 'public.email_smtp_set_pass(text)', 'EXECUTE')`);
    const publicPriv = runSql(`
      SELECT EXISTS (
        SELECT 1
          FROM pg_proc p
          JOIN pg_namespace n ON n.oid = p.pronamespace
          CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
         WHERE n.nspname = 'public'
           AND p.proname = 'email_smtp_set_pass'
           AND a.privilege_type = 'EXECUTE'
           AND a.grantee = 0
      )::text
    `);
    const authPriv = runSql(`SELECT has_function_privilege('authenticated', 'public.email_smtp_set_pass(text)', 'EXECUTE')`);
    expect(anonPriv).toMatch(/^(f|false)$/);
    expect(publicPriv).toMatch(/^(f|false)$/);
    expect(authPriv).toMatch(/^(t|true)$/);
    const anon = asRole('anon', null, `SELECT public.email_smtp_set_pass('anon-exec')`);
    expect(anon).toMatch(/^42501\|/);
    expect(runSql(`SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_A}'`)).toBe(SECRET_A);
  });

  it('rejects empty or null email_smtp_set_pass and does not wipe', () => {
    const empty = asRole('authenticated', ADMIN_A, `SELECT public.email_smtp_set_pass('')`);
    expect(empty).toMatch(/^22023\|/);
    expect(runSql(`SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_A}'`)).toBe(SECRET_A);
    const nulled = asRole('authenticated', ADMIN_A, `SELECT public.email_smtp_set_pass(NULL)`);
    expect(nulled).toMatch(/^22023\|/);
    expect(runSql(`SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_A}'`)).toBe(SECRET_A);
    expect(runSql(`SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_B}'`)).toBe(SECRET_B);
  });

  it('matches intended CRUD by role on email_settings', () => {
    const adminInsert = asRole(
      'authenticated',
      ADMIN_A,
      `INSERT INTO public.email_settings(company_id, smtp_host, from_email)
       VALUES ('${COMPANY_A}', 'smtp.resend.com', 'dup@probe.test') RETURNING from_email`,
    );
    expect(adminInsert).toMatch(/^23505\|/);

    const crewInsert = asRole(
      'authenticated',
      CREW_A,
      `INSERT INTO public.email_settings(company_id, smtp_host, from_email)
       VALUES ('${COMPANY_A}', 'smtp.resend.com', 'crew@probe.test') RETURNING from_email`,
    );
    expect(crewInsert).toMatch(/^42501\|/);

    const crewUpdate = asRole(
      'authenticated',
      CREW_A,
      `UPDATE public.email_settings SET from_name = 'Crew' WHERE company_id = '${COMPANY_A}' RETURNING from_name`,
    );
    expect(crewUpdate).toMatch(/^(42501\||00000\|)/);
    expect(runSql(`SELECT from_name FROM public.email_settings WHERE company_id = '${COMPANY_A}'`)).toBe('Probe A');

    const hop = asRole(
      'authenticated',
      ADMIN_A,
      `UPDATE public.email_settings SET from_name = 'Hop' WHERE company_id = '${COMPANY_B}' RETURNING from_name`,
    );
    expect(hop).toMatch(/^(42501\||00000\|)/);
    expect(runSql(`SELECT from_name FROM public.email_settings WHERE company_id = '${COMPANY_B}'`)).toBe('Probe B');

    const hopInsert = asRole(
      'authenticated',
      ADMIN_A,
      `INSERT INTO public.email_settings(company_id, smtp_host, from_email)
       VALUES ('${COMPANY_B}', 'smtp.resend.com', 'hop@probe.test') RETURNING from_email`,
    );
    expect(hopInsert).toMatch(/^42501\|/);

    const anonInsert = asRole(
      'anon',
      null,
      `INSERT INTO public.email_settings(company_id, smtp_host, from_email)
       VALUES ('${COMPANY_A}', 'smtp.resend.com', 'anon@probe.test') RETURNING from_email`,
    );
    expect(anonInsert).toMatch(/^42501\|/);

    const crewUpsert = asRole(
      'authenticated',
      CREW_A,
      `INSERT INTO public.email_settings(company_id, smtp_host, from_email)
       VALUES ('${COMPANY_A}', 'smtp.resend.com', 'crew-up@probe.test')
       ON CONFLICT (company_id) DO UPDATE SET from_name = 'CrewUp'
       RETURNING from_name`,
    );
    expect(crewUpsert).toMatch(/^42501\|/);

    const hopUpsert = asRole(
      'authenticated',
      ADMIN_A,
      `INSERT INTO public.email_settings(company_id, smtp_host, from_email)
       VALUES ('${COMPANY_B}', 'smtp.resend.com', 'hop-up@probe.test')
       ON CONFLICT (company_id) DO UPDATE SET from_name = 'HopUp'
       RETURNING from_name`,
    );
    expect(hopUpsert).toMatch(/^42501\|/);

    const adminUpsert = asRole(
      'authenticated',
      ADMIN_A,
      `INSERT INTO public.email_settings(company_id, smtp_host, from_email)
       VALUES ('${COMPANY_A}', 'smtp.resend.com', 'a@probe.test')
       ON CONFLICT (company_id) DO UPDATE SET from_name = 'Probe A'
       RETURNING from_name`,
    );
    expect(adminUpsert).toBe('00000|Probe A');

    const crewDelete = asRole(
      'authenticated',
      CREW_A,
      `DELETE FROM public.email_settings WHERE company_id = '${COMPANY_A}' RETURNING from_email`,
    );
    expect(crewDelete).toMatch(/^(42501\||00000\|)/);

    const hopDelete = asRole(
      'authenticated',
      ADMIN_A,
      `DELETE FROM public.email_settings WHERE company_id = '${COMPANY_B}' RETURNING from_email`,
    );
    expect(hopDelete).toMatch(/^(42501\||00000\|)/);

    const anonDelete = asRole(
      'anon',
      null,
      `DELETE FROM public.email_settings WHERE company_id = '${COMPANY_A}' RETURNING from_email`,
    );
    expect(anonDelete).toMatch(/^42501\|/);

    expect(runSql(`SELECT count(*)::text FROM public.email_settings WHERE company_id IN ('${COMPANY_A}', '${COMPANY_B}')`)).toBe('2');
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

  it.skipIf(!hasPostgrest)('saves and rotates the SMTP password through the real PostgREST client path', async () => {
    expect(runSql(`SELECT count(*)::text FROM public.email_settings WHERE company_id = '${COMPANY_C}'`)).toBe('0');
    const client = adminClient(ADMIN_C);
    const publicPayload = {
      company_id: COMPANY_C,
      smtp_host: 'smtp.resend.com',
      smtp_port: 587,
      smtp_secure: false,
      smtp_user: 'resend',
      from_name: 'Probe C',
      from_email: 'c@probe.test',
    };
    const brokenFirst = await client
      .from('email_settings')
      .upsert({ ...publicPayload, smtp_pass: SECRET_FIRST }, { onConflict: 'company_id' })
      .select(EMAIL_SETTINGS_PUBLIC_COLUMNS)
      .maybeSingle();
    expect(brokenFirst.error?.code).toBe('42501');
    expect(runSql(`SELECT count(*)::text FROM public.email_settings WHERE company_id = '${COMPANY_C}'`)).toBe('0');

    await expect(saveCompanyEmailSettings(client, publicPayload, SECRET_FIRST)).resolves.toBeTruthy();
    expect(runSql(`SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_C}'`)).toBe(SECRET_FIRST);
    expectReady(asRole('authenticated', ADMIN_C, `SELECT public.email_smtp_ready()`), true);

    await expect(saveCompanyEmailSettings(client, publicPayload, SECRET_ROTATE)).resolves.toBeTruthy();
    expect(runSql(`SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_C}'`)).toBe(SECRET_ROTATE);

    const brokenRotate = await client
      .from('email_settings')
      .upsert({ ...publicPayload, smtp_pass: 'sec-smtp-should-not-write' }, { onConflict: 'company_id' })
      .select(EMAIL_SETTINGS_PUBLIC_COLUMNS)
      .maybeSingle();
    expect(brokenRotate.error?.code).toBe('42501');
    expect(runSql(`SELECT smtp_pass FROM public.email_settings WHERE company_id = '${COMPANY_C}'`)).toBe(SECRET_ROTATE);
  }, 60000);
}, 180000);
