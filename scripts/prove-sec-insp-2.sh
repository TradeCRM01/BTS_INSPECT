#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export REPO="${REPO:-$ROOT}"
SQL="${ROOT}/supabase/tests/sec_insp_inspector_snapshots.sql"
MIG="${ROOT}/supabase/migrations/20261019150000_sec_insp_inspector_snapshots.sql"
RB="${ROOT}/supabase/rollbacks/20261019150000_sec_insp_inspector_snapshots.rollback.sql"
if [ -z "${RB_OUT:-}" ]; then
  RB_OUT="$(mktemp -d /tmp/sec-insp-2-rollback.XXXXXX)"
fi
export RB_OUT
mkdir -p "${RB_OUT}"

prefer_pg_bin() {
  local v="$1"
  local d="/usr/lib/postgresql/${v}/bin"
  if [ -x "${d}/initdb" ]; then
    echo "${d}"
    return 0
  fi
  return 1
}

snap_sql() {
  cat <<'SQL'
SELECT string_agg(line, E'\n' ORDER BY line)
FROM (
  SELECT format(
    'col %s %s %s',
    a.attname,
    format_type(a.atttypid, a.atttypmod),
    a.attnotnull
  ) AS line
  FROM pg_attribute a
  WHERE a.attrelid = 'public.inspections'::regclass
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attname IN (
      'inspector_id',
      'inspector_name_snapshot',
      'inspector_licence_snapshot'
    )
  UNION ALL
  SELECT format(
    'trg %s %s %s',
    t.tgname,
    pg_get_triggerdef(t.oid),
    t.tgenabled
  )
  FROM pg_trigger t
  WHERE t.tgrelid = 'public.inspections'::regclass
    AND NOT t.tgisinternal
    AND t.tgname = 'trg_inspections_fill_inspector_snapshots'
  UNION ALL
  SELECT format(
    'fn %s %s %s',
    p.oid::regprocedure,
    md5(pg_get_functiondef(p.oid)),
    coalesce(array_to_string(p.proacl, ','), '')
  )
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'inspections_fill_inspector_snapshots'
) s;
SQL
}

run_one() {
  local PGV="$1"
  local PORT="$2"
  local BIN
  BIN="$(prefer_pg_bin "${PGV}")" || {
    echo "initdb not found for postgresql-${PGV}"
    return 2
  }
  local DATA_DIR
  if [ -n "${PROOF_PGDATA:-}" ]; then
    DATA_DIR="${PROOF_PGDATA}-${PGV}"
  else
    DATA_DIR="$(mktemp -d /tmp/pg-sec-insp-2-${PGV}.XXXXXX)"
  fi
  local LOG="${DATA_DIR}/postgres.log"
  local PATH_SAVE="${PATH}"
  export PATH="${BIN}:${PATH}"

  pg_ctl -D "${DATA_DIR}" stop -m fast >/dev/null 2>&1 || true
  rm -rf "${DATA_DIR:?}"
  initdb -D "${DATA_DIR}" --auth-local=trust --auth-host=trust --username=postgres >/dev/null
  pg_ctl -D "${DATA_DIR}" -o "-p ${PORT} -k ${DATA_DIR}" -l "${LOG}" start
  cleanup_one() {
    pg_ctl -D "${DATA_DIR}" stop -m fast >/dev/null 2>&1 || true
    rm -rf "${DATA_DIR}"
    export PATH="${PATH_SAVE}"
  }
  trap cleanup_one RETURN

  until pg_isready -h "${DATA_DIR}" -p "${PORT}" -U postgres >/dev/null 2>&1; do
    sleep 0.2
  done

  export PGHOST="${DATA_DIR}"
  export PGPORT="${PORT}"
  local PSQL=(psql -h "${PGHOST}" -p "${PGPORT}" -U postgres -X -q -v ON_ERROR_STOP=1)

  echo "== SEC-INSP-2 PG${PGV} $(${BIN}/psql --version) =="
  echo "== SEC-INSP-2 behavior + mutants =="
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp2_proof"
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE insp2_proof"
  "${PSQL[@]}" -d insp2_proof -f "${SQL}"
  echo "DB proofs passed"

  echo "== apply -> rollback -> re-apply catalog trip =="
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp2_rb"
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE insp2_rb"
  "${PSQL[@]}" -d insp2_rb -v sec_insp2_fixture_only=1 -f "${SQL}"
  snap_sql | "${PSQL[@]}" -d insp2_rb -At -o "${RB_OUT}/pg${PGV}-before.txt"
  "${PSQL[@]}" -d insp2_rb -f "${MIG}"
  snap_sql | "${PSQL[@]}" -d insp2_rb -At -o "${RB_OUT}/pg${PGV}-after-apply1.txt"
  "${PSQL[@]}" -d insp2_rb -f "${RB}"
  snap_sql | "${PSQL[@]}" -d insp2_rb -At -o "${RB_OUT}/pg${PGV}-after-rollback.txt"
  "${PSQL[@]}" -d insp2_rb -f "${MIG}"
  snap_sql | "${PSQL[@]}" -d insp2_rb -At -o "${RB_OUT}/pg${PGV}-after-apply2.txt"

  if ! diff -u "${RB_OUT}/pg${PGV}-before.txt" "${RB_OUT}/pg${PGV}-after-rollback.txt"; then
    echo "ROLLBACK CATALOG DIFF IS NOT EMPTY PG${PGV}"
    return 1
  fi
  echo "rollback catalog IDENTICAL PG${PGV}"

  if ! diff -u "${RB_OUT}/pg${PGV}-after-apply1.txt" "${RB_OUT}/pg${PGV}-after-apply2.txt"; then
    echo "RE-APPLY CATALOG DIFF IS NOT EMPTY PG${PGV}"
    return 1
  fi
  echo "re-apply catalog IDENTICAL PG${PGV}"

  local AFTER_NULL
  AFTER_NULL="$("${PSQL[@]}" -d insp2_rb -At -c "SELECT is_nullable FROM information_schema.columns WHERE table_name='inspections' AND column_name='inspector_id'")"
  echo "inspector_id is_nullable after re-apply=${AFTER_NULL}"
  if [ "${AFTER_NULL}" != "YES" ]; then
    echo "inspector_id should be nullable after apply"
    return 1
  fi
  echo "All prove-sec-insp-2 PG${PGV} steps passed"
}

APPENDED=0
run_one 16 "${PROOF_PGPORT16:-55445}"
APPENDED=1
run_one 17 "${PROOF_PGPORT17:-55446}"
echo "All prove-sec-insp-2 steps passed on PG16 and PG17"
