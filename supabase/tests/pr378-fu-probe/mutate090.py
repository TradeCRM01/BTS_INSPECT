#!/usr/bin/env python3
import os, subprocess, sys, json, tempfile, shutil

REPO = os.environ.get('REPO') or os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
PGV = sys.argv[1] if len(sys.argv) > 1 else '16'
PGHOST = os.environ['PGHOST']
PGPORT = os.environ['PGPORT']
PSQL = shutil.which('psql') or f'/usr/lib/postgresql/{PGV}/bin/psql'
M090 = os.path.join(REPO, 'supabase/migrations/20261019030000_090_ensure_builtin_renderers.sql')
PROOF = os.path.join(REPO, 'supabase/tests/ensure_builtin_renderers.sql')
IR088 = '\\ir ../migrations/20261019010000_088_update_member_settings.sql'
IR089 = '\\ir ../migrations/20261019020000_089_profile_self_escalation_and_template_rls.sql'
IR090 = '\\ir ../migrations/20261019030000_090_ensure_builtin_renderers.sql'
ABS088 = os.path.join(REPO, 'supabase/migrations/20261019010000_088_update_member_settings.sql')
ABS089 = os.path.join(REPO, 'supabase/migrations/20261019020000_089_profile_self_escalation_and_template_rls.sql')
BODY = open(M090).read()
PROOF_SRC = open(PROOF).read()
next_id = [0]


def psql_file(path, db):
    p = subprocess.run(
        [PSQL, '-h', PGHOST, '-p', str(PGPORT), '-U', 'postgres', '-d', db,
         '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-f', path],
        capture_output=True, text=True)
    return p.returncode == 0, p.stdout, p.stderr


def psql_cmd(sql, db='postgres'):
    p = subprocess.run(
        [PSQL, '-h', PGHOST, '-p', str(PGPORT), '-U', 'postgres', '-d', db,
         '-v', 'ON_ERROR_STOP=1', '-X', '-q', '-c', sql],
        capture_output=True, text=True)
    return p.returncode == 0, p.stdout, p.stderr


def load_proof_with(migration_sql):
    n = next_id[0]
    next_id[0] += 1
    db = f'mut090_{os.getpid()}_{n}'
    ok, out, err = psql_cmd(f'DROP DATABASE IF EXISTS {db}')
    if not ok:
        raise SystemExit(f'drop {db} failed: {err}')
    ok, out, err = psql_cmd(f'CREATE DATABASE {db}')
    if not ok:
        raise SystemExit(f'create {db} failed: {err}')
    mut_path = os.path.join(tempfile.gettempdir(), f'{db}_090.sql')
    proof_path = os.path.join(tempfile.gettempdir(), f'{db}_proof.sql')
    open(mut_path, 'w').write(migration_sql)
    patched = (PROOF_SRC
               .replace(IR088, f'\\ir {ABS088}')
               .replace(IR089, f'\\ir {ABS089}')
               .replace(IR090, f'\\ir {mut_path}'))
    open(proof_path, 'w').write(patched)
    ok, out, err = psql_file(proof_path, db)
    psql_cmd(f'DROP DATABASE IF EXISTS {db};')
    return ok, out, err


def must_fail(name, migration_sql, needles):
    ok, out, err = load_proof_with(migration_sql)
    blob = ((out or '') + '\n' + (err or '')).lower()
    hit = any(n.lower() in blob for n in needles)
    killed = (not ok) and hit
    print(f"{name}: {'KILLED' if killed else 'SURVIVED'} ok={ok}")
    if not killed:
        print((out or '')[-800:])
        print((err or '')[-800:])
        raise SystemExit(f'mutant {name} was not killed')
    return {'id': name, 'killed': True}


cases = []

cases.append(must_fail(
    'drop_builtin_false_check',
    BODY.replace('built_in = false AND company_id IN (', 'company_id IN (', 1),
    ['admin_direct_builtin_insert_42501', 'ensure_builtin_renderers proofs failed'],
))

cases.append(must_fail(
    'drop_on_conflict',
    BODY.replace(
        '\n  ON CONFLICT (company_id, key) WHERE built_in IS TRUE\n  DO NOTHING;',
        ';',
        1,
    ),
    ['idempotent_second_call_inserts_0', 'ensure_builtin_renderers proofs failed', 'unique_violation', '23505', 'duplicate key'],
))

cases.append(must_fail(
    'drop_revoke',
    BODY.replace(
        'REVOKE ALL ON FUNCTION public.ensure_builtin_renderers() FROM PUBLIC, anon;\n',
        '',
        1,
    ),
    ['fn_acl_authenticated', 'ensure_builtin_renderers proofs failed'],
))

param = BODY.replace(
    'CREATE OR REPLACE FUNCTION public.ensure_builtin_renderers()\nRETURNS void',
    'CREATE OR REPLACE FUNCTION public.ensure_builtin_renderers(p_company_id uuid DEFAULT NULL)\nRETURNS void',
    1,
).replace(
    'REVOKE ALL ON FUNCTION public.ensure_builtin_renderers() FROM PUBLIC, anon;\n'
    'GRANT EXECUTE ON FUNCTION public.ensure_builtin_renderers() TO authenticated;',
    'REVOKE ALL ON FUNCTION public.ensure_builtin_renderers(uuid) FROM PUBLIC, anon;\n'
    'GRANT EXECUTE ON FUNCTION public.ensure_builtin_renderers(uuid) TO authenticated;',
    1,
)
cases.append(must_fail(
    'add_param_path',
    param,
    ['fn_no_params', 'ensure_builtin_renderers proofs failed'],
))

outp = os.environ.get('MUT090_JSON')
if outp:
    json.dump(cases, open(outp, 'w'), indent=2)
print('mutate090: all named mutants KILLED')
