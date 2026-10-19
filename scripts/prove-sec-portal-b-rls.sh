#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export REPO="${REPO:-$ROOT}"
PGV="${PROOF_PGVER:-16}"
if [ -n "${PROOF_PGDATA:-}" ]; then
  DATA_DIR="${PROOF_PGDATA}"
else
  DATA_DIR="$(mktemp -d /tmp/pg-sec-portal-b.XXXXXX)"
fi
PORT="${PROOF_PGPORT:-55442}"
LOG="${DATA_DIR}/postgres.log"
SQL="${ROOT}/supabase/tests/sec_portal_b_share_fk_rls.sql"
MIG="${ROOT}/supabase/migrations/20261019120000_sec_portal_b_share_fk_rls.sql"
RB="${ROOT}/supabase/rollbacks/20261019120000_sec_portal_b_share_fk_rls.rollback.sql"
if [ -z "${RB_OUT:-}" ]; then
  RB_OUT="$(mktemp -d /tmp/sec-portal-b-rollback.XXXXXX)"
fi
export RB_OUT
mkdir -p "${RB_OUT}"

prefer_pg_bin() {
  if command -v initdb >/dev/null 2>&1; then
    return 0
  fi
  local d
  for d in "/usr/lib/postgresql/${PGV}/bin" /usr/lib/postgresql/16/bin /usr/lib/postgresql/17/bin; do
    if [ -x "${d}/initdb" ]; then
      export PATH="${d}:${PATH}"
      return 0
    fi
  done
  return 1
}

snap_sql() {
  cat <<'SQL'
SELECT string_agg(line, E'\n' ORDER BY line)
FROM (
  SELECT format(
    'pol %s %s %s %s %s %s',
    tablename,
    policyname,
    cmd,
    roles::text,
    coalesce(qual, ''),
    coalesce(with_check, '')
  ) AS line
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('client_portal_tokens', 'inspection_report_shares')
  UNION ALL
  SELECT format(
    'acl %s %s %s',
    grantee,
    table_name,
    privilege_type
  )
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name IN ('client_portal_tokens', 'inspection_report_shares')
    AND grantee IN ('anon', 'authenticated', 'PUBLIC')
  UNION ALL
  SELECT format(
    'fn %s %s %s',
    p.oid::regprocedure,
    md5(pg_get_functiondef(p.oid)),
    coalesce(array_to_string(p.proacl, ','), '')
  )
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'inspection_inspector_company_id'
) s;
SQL
}

if ! prefer_pg_bin; then
  echo "initdb not found; install local postgresql-16 to run DB proofs"
  echo "Test SQL is at supabase/tests/sec_portal_b_share_fk_rls.sql"
  exit 2
fi

pg_ctl -D "${DATA_DIR}" stop -m fast >/dev/null 2>&1 || true
rm -rf "${DATA_DIR:?}"
initdb -D "${DATA_DIR}" --auth-local=trust --auth-host=trust --username=postgres >/dev/null
pg_ctl -D "${DATA_DIR}" -o "-p ${PORT} -k ${DATA_DIR}" -l "${LOG}" start
cleanup() {
  pg_ctl -D "${DATA_DIR}" stop -m fast >/dev/null 2>&1 || true
  rm -rf "${DATA_DIR}"
}
trap cleanup EXIT

until pg_isready -h "${DATA_DIR}" -p "${PORT}" -U postgres >/dev/null 2>&1; do
  sleep 0.2
done

export PGHOST="${DATA_DIR}"
export PGPORT="${PORT}"
PSQL=(psql -h "${PGHOST}" -p "${PGPORT}" -U postgres -X -q -v ON_ERROR_STOP=1)

echo "== SEC-PORTAL-b behavior + mutants =="
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS portal_proof"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE portal_proof"
"${PSQL[@]}" -d portal_proof -f "${SQL}"
echo "DB proofs passed"

echo "== apply -> rollback -> re-apply catalog trip =="
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS portal_rb"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE portal_rb"
"${PSQL[@]}" -d portal_rb -v sec_portal_b_fixture_only=1 -f "${SQL}"
snap_sql | "${PSQL[@]}" -d portal_rb -At -o "${RB_OUT}/before.txt"
"${PSQL[@]}" -d portal_rb -f "${MIG}"
snap_sql | "${PSQL[@]}" -d portal_rb -At -o "${RB_OUT}/after-apply1.txt"
"${PSQL[@]}" -d portal_rb -f "${RB}"
snap_sql | "${PSQL[@]}" -d portal_rb -At -o "${RB_OUT}/after-rollback.txt"
"${PSQL[@]}" -d portal_rb -f "${MIG}"
snap_sql | "${PSQL[@]}" -d portal_rb -At -o "${RB_OUT}/after-apply2.txt"

if ! diff -u "${RB_OUT}/before.txt" "${RB_OUT}/after-rollback.txt"; then
  echo "ROLLBACK CATALOG DIFF IS NOT EMPTY"
  exit 1
fi
echo "rollback catalog IDENTICAL"

if ! diff -u "${RB_OUT}/after-apply1.txt" "${RB_OUT}/after-apply2.txt"; then
  echo "RE-APPLY CATALOG DIFF IS NOT EMPTY"
  exit 1
fi
echo "re-apply catalog IDENTICAL"

echo "All prove-sec-portal-b-rls steps passed"
