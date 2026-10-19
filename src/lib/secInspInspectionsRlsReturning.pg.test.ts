import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const HOTFIX = '20261019180000_sec_insp_inspections_rls_returning.sql';
const HOTFIX_RB = '20261019180000_sec_insp_inspections_rls_returning.rollback.sql';

const OWNER = '11111111-1111-1111-1111-111111111111';
const MEMBER = '22222222-2222-2222-2222-222222222222';
const TEAMMATE = '33333333-3333-3333-3333-333333333333';
const ADMIN2 = '66666666-6666-6666-6666-666666666666';
const OTHER = '55555555-5555-5555-5555-555555555555';
const TEMPLATE = '0eeeeeee-0000-0000-0000-000000000001';
const NULL_INSP = 'e1000000-0000-0000-0000-0000000000aa';
const OTHER_INSP = 'e1000000-0000-0000-0000-0000000000bb';
const DEL_INSP = 'e1000000-0000-0000-0000-0000000000d1';
const RET_OWNER = 'e2000000-0000-0000-0000-000000000001';
const RET_ADMIN = 'e2000000-0000-0000-0000-000000000002';
const RET_MEMBER = 'e2000000-0000-0000-0000-000000000003';
const RET_FORGE = 'e2000000-0000-0000-0000-0000000000ff';
const RET_PLAIN = 'e2000000-0000-0000-0000-0000000000aa';

function pgBin(version: string, name: string): string {
  return `/usr/lib/postgresql/${version}/bin/${name}`;
}

function pgMissing(version: string): boolean {
  return !['initdb', 'pg_ctl', 'psql'].every((name) => existsSync(pgBin(version, name)));
}

function rewriteMigration(sql: string): string {
  return sql
    .replace(/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net|http)[^;]*;/gi, '-- stubbed ext')
    .replace(/, MAINTAIN/g, '');
}

const HELPERS = `
CREATE OR REPLACE FUNCTION public._sec_insp_ret_scalar(p_uid uuid, p_sql text)
RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE
  v_out text;
BEGIN
  IF p_uid IS NULL THEN
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  ELSE
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
      true
    );
  END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE p_sql INTO v_out;
    RETURN '00000|' || coalesce(v_out, '');
  EXCEPTION WHEN OTHERS THEN
    RETURN SQLSTATE || '|' || SQLERRM;
  END;
END
$f$;

CREATE OR REPLACE FUNCTION public._sec_insp_ret_n(p_uid uuid, p_sql text)
RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE
  v_n integer;
BEGIN
  IF p_uid IS NULL THEN
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  ELSE
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
      true
    );
  END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE p_sql;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RETURN '00000|' || v_n::text;
  EXCEPTION WHEN OTHERS THEN
    RETURN SQLSTATE || '|' || SQLERRM;
  END;
END
$f$;
`;

const POLICY_SNAP = `
SELECT string_agg(line, ' ;; ' ORDER BY line)
FROM (
  SELECT polname::text || '|' || polcmd::text || '|'
    || coalesce(pg_get_expr(polqual, polrelid), '') || '|'
    || coalesce(pg_get_expr(polwithcheck, polrelid), '') AS line
  FROM pg_policy
  WHERE polrelid = 'public.inspections'::regclass
) s
`;

const MUTANT_SELECT = `
DROP POLICY IF EXISTS "Users can view company inspections" ON inspections;
CREATE POLICY "Users can view company inspections"
  ON inspections FOR SELECT
  TO authenticated
  USING (
    public.inspection_inspector_company_id(inspections.id) =
    (SELECT company_id FROM profiles WHERE id = auth.uid())
  );
`;

function insertSql(id: string, inspector: string, returning: boolean): string {
  const body = `INSERT INTO public.inspections (id, template_id, template_snapshot, inspector_id, status, responses, meta)
    VALUES ('${id}'::uuid, '${TEMPLATE}'::uuid, '{}'::jsonb, '${inspector}'::uuid, 'draft', '{}'::jsonb, '{}'::jsonb)`;
  return returning ? `${body} RETURNING id::text` : body;
}

function registerSuite(version: string) {
  const skip = pgMissing(version);
  describe.skipIf(skip)(
    skip
      ? `initdb for PG${version} not found`
      : `SEC-INSP inspections RETURNING RLS on the real migration chain (PG${version})`,
    () => {
      let dataDir = '';
      let sockDir = '';
      const initdb = pgBin(version, 'initdb');
      const pgCtl = pgBin(version, 'pg_ctl');
      const psql = pgBin(version, 'psql');
      let port = '';
      let preHotfixPolicies = '';
      let nullVisibleBefore = '';
      let existingVisibleBefore = '';

      function runSql(sql: string): string {
        const result = spawnSync(psql, [
          '-h', sockDir, '-p', port, '-U', 'postgres', '-d', 'postgres',
          '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql,
        ], { encoding: 'utf8', env: { ...process.env, PGHOST: sockDir } });
        if (result.status !== 0) {
          throw new Error(result.stderr || result.stdout || `psql exited ${result.status}`);
        }
        return result.stdout.trim();
      }

      function runFile(path: string) {
        const result = spawnSync(psql, [
          '-h', sockDir, '-p', port, '-U', 'postgres', '-d', 'postgres',
          '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-f', path,
        ], { encoding: 'utf8', env: { ...process.env, PGHOST: sockDir } });
        if (result.status !== 0) {
          throw new Error(`${path}: ${result.stderr || result.stdout || `psql exited ${result.status}`}`);
        }
      }

      function scalar(uid: string, sql: string): string {
        return runSql(`SELECT public._sec_insp_ret_scalar('${uid}'::uuid, $sec$${sql}$sec$);`);
      }

      function dml(uid: string, sql: string): string {
        return runSql(`SELECT public._sec_insp_ret_n('${uid}'::uuid, $sec$${sql}$sec$);`);
      }

      function applyChain(skipHotfix: boolean) {
        runFile(join(process.cwd(), 'scripts/supabase-local-stub.sql'));
        const migDir = join(process.cwd(), 'supabase/migrations');
        const files = readdirSync(migDir).filter((name) => name.endsWith('.sql')).sort();
        expect(files.length).toBeGreaterThan(100);
        for (const file of files) {
          if (skipHotfix && file === HOTFIX) continue;
          const sql = rewriteMigration(readFileSync(join(migDir, file), 'utf8'));
          const tmpSql = join(sockDir, file);
          writeFileSync(tmpSql, sql);
          const applied = spawnSync(psql, [
            '-h', sockDir, '-p', port, '-U', 'postgres', '-d', 'postgres',
            '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-1', '-f', tmpSql,
          ], { encoding: 'utf8', env: { ...process.env, PGHOST: sockDir } });
          if (applied.status !== 0) {
            throw new Error(`${file}: ${applied.stderr || applied.stdout || `psql exited ${applied.status}`}`);
          }
        }
      }

      beforeAll(() => {
        const major = spawnSync(pgBin(version, 'postgres'), ['-V'], { encoding: 'utf8' });
        const text = `${major.stdout} ${major.stderr}`;
        expect(text, `PG${version} binary`).toMatch(new RegExp(`\\(PostgreSQL\\) ${version}\\.`));
        const root = mkdtempSync(join(tmpdir(), `sec-insp-ret-pg${version}-`));
        dataDir = join(root, 'pgdata');
        sockDir = join(root, 'sock');
        mkdirSync(sockDir, { recursive: true });
        port = String(55000 + Number(version));
        const init = spawnSync(initdb, ['-D', dataDir, '--auth-local=trust', '--username=postgres'], { encoding: 'utf8' });
        if (init.status !== 0) throw new Error(init.stderr || init.stdout);
        writeFileSync(join(dataDir, 'postgresql.conf'), `listen_addresses = ''
port = ${port}
unix_socket_directories = '${sockDir}'
`);
        const start = spawnSync(pgCtl, ['-D', dataDir, '-l', join(dataDir, 'pg.log'), 'start'], { encoding: 'utf8' });
        if (start.status !== 0) {
          throw new Error(start.stderr || start.stdout || readFileSync(join(dataDir, 'pg.log'), 'utf8'));
        }
        applyChain(true);
        runFile(join(process.cwd(), 'supabase/tests/sec_insp_finalised_lock_seed.sql'));
        runFile(join(process.cwd(), 'supabase/tests/sec_insp_inspections_rls_returning_seed.sql'));
        runSql(HELPERS);
        preHotfixPolicies = runSql(POLICY_SNAP);
        nullVisibleBefore = scalar(MEMBER, `SELECT count(*)::text FROM public.inspections WHERE id = '${NULL_INSP}'`);
        existingVisibleBefore = scalar(MEMBER, `SELECT count(*)::text FROM public.inspections WHERE inspector_id = '${TEAMMATE}'`);
      }, 240000);

      afterAll(() => {
        if (dataDir) spawnSync(pgCtl, ['-D', dataDir, 'stop', '-m', 'fast'], { encoding: 'utf8' });
        if (dataDir) rmSync(join(dataDir, '..'), { recursive: true, force: true });
      });

      it('owner INSERT without RETURNING succeeds on main, INSERT RETURNING is 42501', () => {
        expect(dml(OWNER, insertSql(RET_PLAIN, OWNER, false)).startsWith('00000|')).toBe(true);
        const ret = scalar(OWNER, insertSql(RET_OWNER, OWNER, true));
        expect(ret.split('|')[0], ret).toBe('42501');
      });

      it('NULL-inspector rows are invisible on main', () => {
        expect(runSql(`SELECT count(*)::text FROM public.inspections WHERE id = '${NULL_INSP}'`)).toBe('1');
        expect(nullVisibleBefore).toBe('00000|0');
      });

      it('same-company existing rows are visible on main', () => {
        expect(Number(existingVisibleBefore.split('|')[1])).toBeGreaterThan(0);
      });

      describe('after hotfix', () => {
        beforeAll(() => {
          runFile(join(process.cwd(), 'supabase/migrations', HOTFIX));
        });

        it('owner INSERT RETURNING * returns the row', () => {
          const ret = scalar(OWNER, insertSql(RET_OWNER, OWNER, true));
          expect(ret, ret).toBe(`00000|${RET_OWNER}`);
        });

        it('non-owner admin INSERT RETURNING * returns the row', () => {
          const ret = scalar(ADMIN2, insertSql(RET_ADMIN, ADMIN2, true));
          expect(ret, ret).toBe(`00000|${RET_ADMIN}`);
        });

        it('member INSERT RETURNING * returns the row', () => {
          const ret = scalar(MEMBER, insertSql(RET_MEMBER, MEMBER, true));
          expect(ret, ret).toBe(`00000|${RET_MEMBER}`);
        });

        it('cross-tenant insert with forged inspector_id is 42501', () => {
          const foreign = scalar(MEMBER, insertSql(RET_FORGE, OTHER, true));
          expect(foreign.split('|')[0], foreign).toBe('42501');
          const teammate = scalar(MEMBER, insertSql(RET_FORGE, TEAMMATE, true));
          expect(teammate.split('|')[0], teammate).toBe('42501');
        });

        it('cross-tenant SELECT is empty and UPDATE/DELETE change 0 rows', () => {
          expect(scalar(OTHER, `SELECT count(*)::text FROM public.inspections WHERE id = '${RET_OWNER}'`)).toBe('00000|0');
          expect(dml(OTHER, `UPDATE public.inspections SET status = 'hacked' WHERE id = '${RET_OWNER}'`)).toBe('00000|0');
          expect(dml(OTHER, `DELETE FROM public.inspections WHERE id = '${DEL_INSP}'`)).toBe('00000|0');
        });

        it('same-company existing-row visibility is unchanged after the hotfix', () => {
          const after = scalar(MEMBER, `SELECT count(*)::text FROM public.inspections WHERE inspector_id = '${TEAMMATE}'`);
          expect(after).toBe(existingVisibleBefore);
        });

        it('NULL-inspector visibility is identical before and after', () => {
          const after = scalar(MEMBER, `SELECT count(*)::text FROM public.inspections WHERE id = '${NULL_INSP}'`);
          expect(nullVisibleBefore).toBe('00000|0');
          expect(after).toBe(nullVisibleBefore);
        });

        it('admin delete still works and member delete is still denied', () => {
          expect(dml(MEMBER, `DELETE FROM public.inspections WHERE id = '${DEL_INSP}'`)).toBe('00000|0');
          expect(dml(ADMIN2, `DELETE FROM public.inspections WHERE id = '${DEL_INSP}'`)).toBe('00000|1');
        });

        it('cross-tenant inspector_id makes profile_company_id_for_caller NULL (no oracle)', () => {
          const asMember = scalar(
            MEMBER,
            `SELECT coalesce(public.profile_company_id_for_caller('${OTHER}'::uuid)::text, 'null')`,
          );
          expect(asMember).toBe('00000|null');
          const asOther = scalar(
            OTHER,
            `SELECT coalesce(public.profile_company_id_for_caller('${MEMBER}'::uuid)::text, 'null')`,
          );
          expect(asOther).toBe('00000|null');
          expect(scalar(MEMBER, `SELECT count(*)::text FROM public.inspections WHERE id = '${OTHER_INSP}'`)).toBe('00000|0');
        });

        it('INSERT WITH CHECK stays inspector_id = auth.uid()', () => {
          const expr = runSql(`
            SELECT coalesce(pg_get_expr(polwithcheck, polrelid), '')
            FROM pg_policy
            WHERE polname = 'Users can create inspections'
              AND polrelid = 'public.inspections'::regclass
          `);
          expect(['inspector_id = auth.uid()', '(inspector_id = auth.uid())']).toContain(expr);
        });

        it('SELECT/UPDATE/DELETE USING read inspector_id, not inspections-by-id', () => {
          const rows = runSql(`
            SELECT polname::text || '|' || polcmd::text || '|' || coalesce(pg_get_expr(polqual, polrelid), '')
            FROM pg_policy
            WHERE polrelid = 'public.inspections'::regclass
              AND polname IN (
                'Users can view company inspections',
                'Users can update company inspections',
                'Admins can delete company inspections'
              )
            ORDER BY polname
          `);
          expect(rows).toContain('profile_company_id_for_caller(inspector_id)');
          expect(rows).not.toContain('inspection_inspector_company_id');
          const updCheck = runSql(`
            SELECT coalesce(pg_get_expr(polwithcheck, polrelid), '')
            FROM pg_policy
            WHERE polname = 'Users can update company inspections'
              AND polrelid = 'public.inspections'::regclass
          `);
          expect(updCheck).toContain('profile_company_id_for_caller(inspector_id)');
        });

        it('mutant: by-id STABLE lookup restored in SELECT kills owner RETURNING', () => {
          runSql(MUTANT_SELECT);
          const usesHelper = runSql(`
            SELECT pg_get_expr(polqual, polrelid) LIKE '%inspection_inspector_company_id%'
            FROM pg_policy
            WHERE polname = 'Users can view company inspections'
              AND polrelid = 'public.inspections'::regclass
          `);
          const ret = scalar(OWNER, insertSql('e2000000-0000-0000-0000-0000000000ee', OWNER, true));
          expect(usesHelper).toBe('t');
          expect(ret.split('|')[0], ret).toBe('42501');
          runFile(join(process.cwd(), 'supabase/migrations', HOTFIX));
          const restored = scalar(OWNER, insertSql('e2000000-0000-0000-0000-0000000000ee', OWNER, true));
          expect(restored).toBe('00000|e2000000-0000-0000-0000-0000000000ee');
        });

        it('rollback restores pre-hotfix policies and owner RETURNING is 42501 again', () => {
          const afterHotfix = runSql(POLICY_SNAP);
          expect(afterHotfix).not.toBe(preHotfixPolicies);
          runFile(join(process.cwd(), 'supabase/rollbacks', HOTFIX_RB));
          const afterRollback = runSql(POLICY_SNAP);
          expect(afterRollback).toBe(preHotfixPolicies);
          const ret = scalar(OWNER, insertSql('e2000000-0000-0000-0000-0000000000dd', OWNER, true));
          expect(ret.split('|')[0], ret).toBe('42501');
        });
      });
    },
    300000,
  );
}

registerSuite('16');
registerSuite('17');
