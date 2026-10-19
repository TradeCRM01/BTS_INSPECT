#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export REPO="${REPO:-$ROOT}"
PGV="${PROOF_PGVER:-16}"
if [ -n "${PROOF_PGDATA:-}" ]; then
  DATA_DIR="${PROOF_PGDATA}"
else
  DATA_DIR="$(mktemp -d /tmp/pg-sec-insp.XXXXXX)"
fi
PORT="${PROOF_PGPORT:-55443}"
LOG="${DATA_DIR}/postgres.log"
SQL="${ROOT}/supabase/tests/sec_insp_inspections_rls.sql"
MIG="${ROOT}/supabase/migrations/20261019140000_sec_insp_inspections_rls.sql"
RB="${ROOT}/supabase/rollbacks/20261019140000_sec_insp_inspections_rls.rollback.sql"
if [ -z "${RB_OUT:-}" ]; then
  RB_OUT="$(mktemp -d /tmp/sec-insp-rollback.XXXXXX)"
fi
export RB_OUT
mkdir -p "${RB_OUT}"

prefer_pg_bin() {
  local d="/usr/lib/postgresql/${PGV}/bin"
  if [ -x "${d}/initdb" ]; then
    export PATH="${d}:${PATH}"
    return 0
  fi
  return 1
}

snap_sql() {
  cat <<'SQL'
SELECT string_agg(line, E'\n' ORDER BY line)
FROM (
  SELECT format(
    'pol %s %s %s %s %s',
    policyname,
    cmd,
    roles::text,
    coalesce(qual, ''),
    coalesce(with_check, '')
  ) AS line
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'inspections'
  UNION ALL
  SELECT format(
    'fn %s %s %s',
    p.oid::regprocedure,
    md5(pg_get_functiondef(p.oid)),
    coalesce(array_to_string(p.proacl, ','), '')
  )
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname IN (
      'inspection_inspector_company_id',
      'profile_company_id_for_caller'
    )
) s;
SQL
}

if ! prefer_pg_bin; then
  echo "initdb not found; install local postgresql-${PGV} to run DB proofs"
  echo "Test SQL is at supabase/tests/sec_insp_inspections_rls.sql"
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

echo "== SEC-INSP PG${PGV} $($(command -v psql) --version) =="
echo "== SEC-INSP behavior + mutants =="
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp_proof"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE insp_proof"
"${PSQL[@]}" -d insp_proof -f "${SQL}"
echo "DB proofs passed"

echo "== apply -> rollback -> re-apply catalog trip =="
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp_rb"
"${PSQL[@]}" -d postgres -c "CREATE DATABASE insp_rb"
"${PSQL[@]}" -d insp_rb -v sec_insp_fixture_only=1 -f "${SQL}"
snap_sql | "${PSQL[@]}" -d insp_rb -At -o "${RB_OUT}/before.txt"
"${PSQL[@]}" -d insp_rb -f "${MIG}"
snap_sql | "${PSQL[@]}" -d insp_rb -At -o "${RB_OUT}/after-apply1.txt"
AFTER_APPLY_COUNT="$("${PSQL[@]}" -d insp_rb -At -c "SELECT public.sec_insp_test_teammate_select()")"
echo "teammate SELECT after apply=${AFTER_APPLY_COUNT}"
if [ "${AFTER_APPLY_COUNT}" != "2" ]; then
  echo "teammate SELECT after apply expected 2"
  exit 1
fi
"${PSQL[@]}" -d insp_rb -f "${RB}"
snap_sql | "${PSQL[@]}" -d insp_rb -At -o "${RB_OUT}/after-rollback.txt"
AFTER_RB_COUNT="$("${PSQL[@]}" -d insp_rb -At -c "SELECT public.sec_insp_test_teammate_select()")"
echo "teammate SELECT after rollback=${AFTER_RB_COUNT}"
if [ "${AFTER_RB_COUNT}" != "0" ]; then
  echo "teammate SELECT after rollback expected 0"
  exit 1
fi
"${PSQL[@]}" -d insp_rb -f "${MIG}"
snap_sql | "${PSQL[@]}" -d insp_rb -At -o "${RB_OUT}/after-apply2.txt"

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

echo "All prove-sec-insp-inspections-rls steps passed"
