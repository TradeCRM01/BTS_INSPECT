import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clientSourceSelectsAccountingTokens } from './accountingClientTokenGuard';
import { accountingSettingsWrite, stripAccountingSettingsTokenKeys } from './xeroAccounting';

const execFileAsync = promisify(execFile);
const ROOT = resolve(process.cwd());
const MIGRATION = resolve(ROOT, 'supabase/migrations/20261019120000_090_accounting_credentials.sql');
const SETUP = resolve(ROOT, 'supabase/tests/accounting_credentials_setup.sql');
const SEED_SETTINGS = resolve(ROOT, 'supabase/tests/accounting_credentials_seed_settings.sql');
const SEED_CREDS = resolve(ROOT, 'supabase/tests/accounting_credentials_seed_credentials.sql');

function preferPgBin(): string {
  const extra = ['/usr/lib/postgresql/16/bin'];
  for (const dir of extra) {
    try {
      readFileSync(join(dir, 'initdb'));
      return `${dir}:${process.env.PATH ?? ''}`;
    } catch {
      // keep looking
    }
  }
  return process.env.PATH ?? '';
}

const PATH_WITH_PG = preferPgBin();

type Probe = {
  authenticatedCanSelect: boolean;
  nonMemberRows: number;
  rpcColumns: string[];
};

async function startPg(): Promise<{ dataDir: string; port: string; stop: () => Promise<void> }> {
  const dataDir = mkdtempSync(join(tmpdir(), 'pg-sec-xero-'));
  const port = String(55434 + Math.floor(Math.random() * 20));
  await execFileAsync('initdb', ['-D', dataDir, '--auth-local=trust', '--auth-host=trust', '--username=postgres'], {
    env: { ...process.env, PATH: PATH_WITH_PG },
  });
  await execFileAsync('pg_ctl', ['-D', dataDir, '-o', `-p ${port} -k ${dataDir}`, '-l', join(dataDir, 'pg.log'), 'start'], {
    env: { ...process.env, PATH: PATH_WITH_PG },
  });
  for (let i = 0; i < 40; i++) {
    try {
      await execFileAsync('pg_isready', ['-h', dataDir, '-p', port, '-U', 'postgres'], {
        env: { ...process.env, PATH: PATH_WITH_PG },
      });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  return {
    dataDir,
    port,
    async stop() {
      await execFileAsync('pg_ctl', ['-D', dataDir, 'stop', '-m', 'fast'], {
        env: { ...process.env, PATH: PATH_WITH_PG },
      }).catch(() => undefined);
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

async function psql(pg: { dataDir: string; port: string }, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('psql', [
    '-h', pg.dataDir, '-p', pg.port, '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1',
    ...args,
  ], { env: { ...process.env, PATH: PATH_WITH_PG } });
  return stdout;
}

function mutateMigration(kind: 'good' | 'drop-revoke' | 'add-select-policy' | 'drop-company-check' | 'return-token'): string {
  let sql = readFileSync(MIGRATION, 'utf8');
  if (kind === 'drop-revoke') {
    sql = sql
      .replace('REVOKE ALL ON TABLE public.accounting_credentials FROM PUBLIC;\n', '')
      .replace('REVOKE ALL ON TABLE public.accounting_credentials FROM anon, authenticated;\n', '');
  }
  if (kind === 'add-select-policy') {
    sql += `
GRANT SELECT ON public.accounting_credentials TO authenticated;
CREATE POLICY accounting_credentials_select ON public.accounting_credentials
  FOR SELECT TO authenticated USING (true);
`;
  }
  if (kind === 'drop-company-check') {
    const next = sql.replace(
      /WHERE p_company_id IS NOT DISTINCT FROM public\.my_company_id\(\);/,
      'WHERE true;',
    );
    if (next === sql) throw new Error('drop-company-check needle missed');
    sql = next;
  }
  if (kind === 'return-token') {
    const withCol = sql.replace(
      /RETURNS TABLE \(([\s\S]*?)\)\nLANGUAGE sql/,
      'RETURNS TABLE (\n  connected boolean,\n  tenant_name text,\n  last_synced_at timestamptz,\n  access_token text\n)\nLANGUAGE sql',
    );
    const next = withCol.replace(
      /AS last_synced_at\n  WHERE/,
      `AS last_synced_at,
    (
      SELECT c.access_token
      FROM public.accounting_credentials AS c
      WHERE c.company_id = p_company_id AND c.provider = 'xero'
    ) AS access_token
  WHERE`,
    );
    if (next === sql || !next.includes('access_token text')) {
      throw new Error('return-token needle missed');
    }
    sql = next;
  }
  return sql;
}

async function applyAndProbe(pg: { dataDir: string; port: string }, sql: string): Promise<Probe> {
  await psql(pg, ['-c', 'DROP FUNCTION IF EXISTS public.get_accounting_connection(uuid);']);
  await psql(pg, ['-c', 'DROP TABLE IF EXISTS public.accounting_credentials;']);
  const tmp = join(pg.dataDir, `mutant-${Date.now()}.sql`);
  writeFileSync(tmp, sql);
  await psql(pg, ['-f', tmp]);
  await psql(pg, ['-f', SEED_CREDS]);
  const { stdout } = await execFileAsync('psql', [
    '-h', pg.dataDir, '-p', pg.port, '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-A', '-t',
    '-c', `
SELECT json_build_object(
  'authenticatedCanSelect', has_table_privilege('authenticated', 'public.accounting_credentials', 'SELECT'),
  'rpcColumns', (
    SELECT coalesce(json_agg(u.n ORDER BY u.ord), '[]'::json)
    FROM pg_proc p
    CROSS JOIN LATERAL unnest(p.proargnames, p.proargmodes) WITH ORDINALITY AS u(n, m, ord)
    WHERE p.proname = 'get_accounting_connection'
      AND p.pronamespace = 'public'::regnamespace
      AND u.m = 't'
  )
);
`,
  ], { env: { ...process.env, PATH: PATH_WITH_PG } });
  const meta = JSON.parse(stdout.trim()) as { authenticatedCanSelect: boolean; rpcColumns: string[] };

  const countOut = await execFileAsync('psql', [
    '-h', pg.dataDir, '-p', pg.port, '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-A', '-t',
    '-c', `SELECT set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', false);
SELECT count(*)::text FROM public.get_accounting_connection('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');`,
  ], { env: { ...process.env, PATH: PATH_WITH_PG } });
  const lines = countOut.stdout.trim().split('\n').filter((line) => /^\d+$/.test(line));
  const nonMemberRows = Number(lines[lines.length - 1]);

  return {
    authenticatedCanSelect: meta.authenticatedCanSelect,
    nonMemberRows,
    rpcColumns: meta.rpcColumns ?? [],
  };
}

describe('SEC-XERO mutants', () => {
  let pg: Awaited<ReturnType<typeof startPg>>;

  beforeAll(async () => {
    pg = await startPg();
    await psql(pg, ['-f', SETUP]);
    await psql(pg, ['-f', SEED_SETTINGS]);
  }, 30000);

  afterAll(async () => {
    await pg.stop();
  });

  it('kills drop-revoke: authenticated SELECT privilege comes back, the real REVOKE removes it', async () => {
    const mutant = await applyAndProbe(pg, mutateMigration('drop-revoke'));
    expect(mutant.authenticatedCanSelect).toBe(true);
    const good = await applyAndProbe(pg, mutateMigration('good'));
    expect(good.authenticatedCanSelect).toBe(false);
  }, 20000);

  it('kills add-select-policy: a GRANT+policy lets authenticated read, the real table has neither', async () => {
    const mutant = await applyAndProbe(pg, mutateMigration('add-select-policy'));
    expect(mutant.authenticatedCanSelect).toBe(true);
    const good = await applyAndProbe(pg, mutateMigration('good'));
    expect(good.authenticatedCanSelect).toBe(false);
  }, 20000);

  it('kills drop-company-check: a non-member gets a row, the real RPC returns none', async () => {
    const mutant = await applyAndProbe(pg, mutateMigration('drop-company-check'));
    expect(mutant.nonMemberRows).toBe(1);
    const good = await applyAndProbe(pg, mutateMigration('good'));
    expect(good.nonMemberRows).toBe(0);
  }, 20000);

  it('kills return-token: the RPC grows an access_token column, the real RPC has only status fields', async () => {
    const mutant = await applyAndProbe(pg, mutateMigration('return-token'));
    expect(mutant.rpcColumns).toContain('access_token');
    const good = await applyAndProbe(pg, mutateMigration('good'));
    expect(good.rpcColumns).toEqual(['connected', 'tenant_name', 'last_synced_at']);
    expect(good.rpcColumns).not.toContain('access_token');
  }, 20000);

  it('kills client-selects-token: adding an accounting_credentials select trips the guard', () => {
    const page = readFileSync(resolve(ROOT, 'src/pages/AccountingSettingsPage.tsx'), 'utf8');
    expect(clientSourceSelectsAccountingTokens(page)).toBe(false);
    const mutant = `${page}\nvoid supabase.from('accounting_credentials').select('access_token');\n`;
    expect(clientSourceSelectsAccountingTokens(mutant)).toBe(true);
  });

  it('kills jsonb-write-keeps-keys: a write that keeps tokens is rejected by accountingSettingsWrite', () => {
    const dirty = {
      company_id: 'co1',
      settings: { access_token: 'leak', refresh_token: 'leak', expires_at: 'x' },
    };
    const keepKeys = <T extends Record<string, unknown>>(payload: T): T => payload;
    expect(JSON.stringify(keepKeys(dirty))).toMatch(/access_token/);
    const written = accountingSettingsWrite(dirty);
    expect(written.settings).not.toHaveProperty('access_token');
    expect(written.settings).not.toHaveProperty('refresh_token');
    expect(written.settings).not.toHaveProperty('expires_at');
    expect(JSON.stringify(stripAccountingSettingsTokenKeys(dirty.settings))).not.toMatch(/access_token|refresh_token/);
  });
});
