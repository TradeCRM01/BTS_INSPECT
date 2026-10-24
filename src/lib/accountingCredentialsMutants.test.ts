import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { accountingTokenOffenders } from './accountingClientTokenGuard';
import { accountingSettingsWrite } from './xeroAccounting';

const execFileAsync = promisify(execFile);
const ROOT = resolve(process.cwd());
const MIGRATION = resolve(ROOT, 'supabase/migrations/20261019120000_091_accounting_credentials.sql');
const SETUP = resolve(ROOT, 'supabase/tests/accounting_credentials_setup.sql');
const SEED_SETTINGS = resolve(ROOT, 'supabase/tests/accounting_credentials_seed_settings.sql');
const SEED_CREDS = resolve(ROOT, 'supabase/tests/accounting_credentials_seed_credentials.sql');
const PAGE = resolve(ROOT, 'src/pages/AccountingSettingsPage.tsx');
const COMPANY_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_A = '11111111-1111-1111-1111-111111111111';
const USER_B = '22222222-2222-2222-2222-222222222222';

function preferPgBin(): string {
  const ver = process.env.PROOF_PGVER ?? '16';
  const dir = `/usr/lib/postgresql/${ver}/bin`;
  try {
    readFileSync(join(dir, 'initdb'));
    return `${dir}:${process.env.PATH ?? ''}`;
  } catch {
    return process.env.PATH ?? '';
  }
}

const PATH_WITH_PG = preferPgBin();

type Pg = { dataDir: string; port: string; stop: () => Promise<void> };

async function startPg(): Promise<Pg> {
  const dataDir = mkdtempSync(join(tmpdir(), 'pg-sec-xero-'));
  const port = String(56000 + Math.floor(Math.random() * 1000));
  const env = { ...process.env, PATH: PATH_WITH_PG };
  await execFileAsync('initdb', ['-D', dataDir, '--auth-local=trust', '--auth-host=trust', '--username=postgres'], { env });
  await execFileAsync('pg_ctl', ['-D', dataDir, '-o', `-p ${port} -k ${dataDir}`, '-l', join(dataDir, 'pg.log'), 'start'], { env });
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try {
      await execFileAsync('pg_isready', ['-h', dataDir, '-p', port, '-U', 'postgres'], { env });
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  if (!ready) {
    const log = readFileSync(join(dataDir, 'pg.log'), 'utf8');
    throw new Error(`postgres did not start\n${log}`);
  }
  return {
    dataDir,
    port,
    async stop() {
      await execFileAsync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], { env }).catch(() => undefined);
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

async function psql(pg: Pg, sql: string, file = false): Promise<string> {
  const args = [
    '-h', pg.dataDir, '-p', pg.port, '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-A', '-t', '-q',
  ];
  if (file) args.push('-f', sql);
  else args.push('-c', sql);
  try {
    const { stdout } = await execFileAsync('psql', args, { env: { ...process.env, PATH: PATH_WITH_PG } });
    return stdout;
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message?: string };
    throw new Error(`${e.stderr ?? ''}\n${e.stdout ?? ''}\n${e.message ?? ''}`);
  }
}

function mutateMigration(kind: 'good' | 'drop-revoke' | 'add-select-policy' | 'drop-company-check' | 'return-token'): string {
  const original = readFileSync(MIGRATION, 'utf8');
  let sql = original;
  if (kind === 'drop-revoke') {
    sql = sql.replace(
      'REVOKE ALL ON TABLE public.accounting_credentials FROM PUBLIC, anon, authenticated;\n',
      '',
    );
  }
  if (kind === 'add-select-policy') {
    sql += `
GRANT SELECT ON public.accounting_credentials TO authenticated;
CREATE POLICY accounting_credentials_select ON public.accounting_credentials
  FOR SELECT TO authenticated
  USING (true);
`;
  }
  if (kind === 'drop-company-check') {
    sql = sql.replace(
      'WHERE p_company_id IS NOT DISTINCT FROM public.my_company_id();',
      'WHERE true;',
    );
  }
  if (kind === 'return-token') {
    sql = sql
      .replace(
        '  last_synced_at timestamptz\n)',
        '  last_synced_at timestamptz,\n  access_token text\n)',
      )
      .replace(
        `) AS last_synced_at
  WHERE p_company_id IS NOT DISTINCT FROM public.my_company_id();`,
        `) AS last_synced_at,
    (
      SELECT c.access_token
      FROM public.accounting_credentials AS c
      WHERE c.company_id = p_company_id
        AND c.provider = 'xero'
    ) AS access_token
  WHERE p_company_id IS NOT DISTINCT FROM public.my_company_id();`,
      );
  }
  if (kind !== 'good' && sql === original) {
    throw new Error(`mutant ${kind} did not change the migration`);
  }
  return sql;
}

async function applySql(pg: Pg, sql: string): Promise<void> {
  await psql(pg, 'DROP FUNCTION IF EXISTS public.get_accounting_connection(uuid);');
  await psql(pg, 'DROP TABLE IF EXISTS public.accounting_credentials;');
  const tmp = join(pg.dataDir, 'mutant.sql');
  writeFileSync(tmp, sql);
  await psql(pg, tmp, true);
  await psql(pg, SEED_CREDS, true);
}

async function authenticatedSelect(pg: Pg): Promise<{ denied: boolean; rows: number }> {
  try {
    const stdout = await psql(pg, 'SET ROLE authenticated; SELECT count(*)::text FROM public.accounting_credentials;');
    const rows = Number(stdout.trim().split('\n').filter(Boolean).pop());
    return { denied: false, rows };
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    if (/permission denied/i.test(text)) return { denied: true, rows: -1 };
    throw err;
  }
}

async function rpcRows(pg: Pg, sub: string, companyId: string): Promise<Record<string, unknown>[]> {
  const stdout = await psql(pg, `
SELECT set_config('request.jwt.claims', '{"sub":"${sub}"}', false);
SET ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"sub":"${sub}"}', false);
SELECT 'ROWS:' || coalesce((
  SELECT json_agg(to_jsonb(t))::text
  FROM public.get_accounting_connection('${companyId}') AS t
), '[]');
`);
  const line = stdout.split('\n').map((row) => row.trim()).filter((row) => row.startsWith('ROWS:')).pop();
  if (!line) throw new Error(`rpc probe missing rows\n${stdout}`);
  return JSON.parse(line.slice('ROWS:'.length)) as Record<string, unknown>[];
}

function compileMutantWrite(src: string): (payload: { settings?: unknown }) => { settings?: Record<string, unknown> } {
  const start = src.indexOf('export function accountingSettingsWrite');
  const end = src.indexOf('export function parseAccountingConnection');
  if (start < 0 || end < start) throw new Error('accountingSettingsWrite not found');
  const fn = src
    .slice(start, end)
    .replace('export ', '')
    .replace(/<T extends Record<string, unknown>>\(payload: T\): T/, '(payload)')
    .replace('(payload as { settings?: unknown }).settings', 'payload.settings');
  return new Function(`${fn}\nreturn accountingSettingsWrite;`)() as (payload: { settings?: unknown }) => { settings?: Record<string, unknown> };
}

describe('SEC-XERO source mutants', () => {
  it('kills client-selects-token: AccountingSettingsPage selecting accounting_credentials fails the guard', () => {
    const original = readFileSync(PAGE, 'utf8');
    const offenders = accountingTokenOffenders(resolve(ROOT, 'src'), (file) => {
      const text = readFileSync(file, 'utf8');
      if (file !== PAGE) return text;
      return `${text}\nvoid supabase.from('accounting_credentials').select('access_token');\n`;
    });
    expect(offenders).toContain('pages/AccountingSettingsPage.tsx');
    expect(readFileSync(PAGE, 'utf8')).toBe(original);
    expect(accountingTokenOffenders(resolve(ROOT, 'src'))).not.toContain('pages/AccountingSettingsPage.tsx');
  });

  it('kills jsonb-write-keeps-keys: accountingSettingsWrite keeps token keys when it stops stripping', () => {
    const original = readFileSync(resolve(ROOT, 'src/lib/xeroAccounting.ts'), 'utf8');
    const marker = 'settings: stripAccountingSettingsTokenKeys((payload as { settings?: unknown }).settings),';
    const mutantSrc = original.replace(marker, 'settings: payload.settings,');
    expect(mutantSrc).not.toBe(original);
    const dirty = {
      company_id: 'co1',
      settings: {
        access_token: 'leak',
        refresh_token: 'leak',
        expires_at: 'x',
        xero: { token: { cipher: 'c' }, tenant_name: "Jack's Bar", paid_invoices: { 'inv-1': 'xero-1' } },
      },
    };
    const kept = compileMutantWrite(mutantSrc)(dirty);
    expect(kept.settings).toHaveProperty('access_token', 'leak');
    expect(kept.settings?.xero).toHaveProperty('token');
    const written = accountingSettingsWrite(dirty);
    expect(written.settings).not.toHaveProperty('access_token');
    expect(written.settings).not.toHaveProperty('refresh_token');
    expect(written.settings).not.toHaveProperty('expires_at');
    expect(written.settings.xero).toEqual({
      tenant_name: "Jack's Bar",
      paid_invoices: { 'inv-1': 'xero-1' },
    });
  });
});

describe('SEC-XERO postgres mutants', () => {
  let pg: Pg;

  beforeAll(async () => {
    pg = await startPg();
    const major = process.env.PROOF_PGVER ?? '16';
    const serverNum = (await psql(pg, 'SHOW server_version_num;')).trim();
    if (!serverNum.startsWith(major)) {
      throw new Error(`wanted PostgreSQL ${major}, got server_version_num=${serverNum}`);
    }
    await psql(pg, SETUP, true);
    await psql(pg, SEED_SETTINGS, true);
  }, 60000);

  afterAll(async () => {
    await pg?.stop();
  });

  it('kills drop-revoke: authenticated can select accounting_credentials until REVOKE is restored', async () => {
    await applySql(pg, mutateMigration('drop-revoke'));
    const mutant = await authenticatedSelect(pg);
    expect(mutant.denied).toBe(false);
    await applySql(pg, mutateMigration('good'));
    const good = await authenticatedSelect(pg);
    expect(good.denied).toBe(true);
  }, 30000);

  it('kills add-select-policy: an authenticated SELECT policy returns credential rows until it is removed', async () => {
    await applySql(pg, mutateMigration('add-select-policy'));
    const mutant = await authenticatedSelect(pg);
    expect(mutant.denied).toBe(false);
    expect(mutant.rows).toBeGreaterThan(0);
    await applySql(pg, mutateMigration('good'));
    const good = await authenticatedSelect(pg);
    expect(good.denied).toBe(true);
  }, 30000);

  it('kills drop-company-check: a non-member receives the other company tenant_name until the check returns', async () => {
    await applySql(pg, mutateMigration('drop-company-check'));
    const leaked = await rpcRows(pg, USER_B, COMPANY_A);
    expect(leaked).toHaveLength(1);
    expect(leaked[0]?.tenant_name).toBe("Jack's Bar");
    await applySql(pg, mutateMigration('good'));
    expect(await rpcRows(pg, USER_B, COMPANY_A)).toEqual([]);
  }, 30000);

  it('kills return-token: the RPC returns access_token until the column is gone', async () => {
    await applySql(pg, mutateMigration('return-token'));
    const leaked = await rpcRows(pg, USER_A, COMPANY_A);
    expect(leaked).toHaveLength(1);
    expect(leaked[0]?.access_token).toBe('cred-access');
    await applySql(pg, mutateMigration('good'));
    const safe = await rpcRows(pg, USER_A, COMPANY_A);
    expect(safe).toHaveLength(1);
    expect(Object.keys(safe[0] ?? {}).sort()).toEqual(['connected', 'last_synced_at', 'tenant_name']);
    expect(safe[0]?.connected).toBe(true);
    expect(safe[0]?.tenant_name).toBe("Jack's Bar");
    expect(safe[0]?.access_token).toBeUndefined();
  }, 30000);
});
