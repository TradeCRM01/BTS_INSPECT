#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export REPO="${REPO:-$ROOT}"
SQL="${ROOT}/supabase/tests/sec_insp_finalised_lock.sql"
MIG="${ROOT}/supabase/migrations/20261019170000_sec_insp_finalised_lock.sql"
RB="${ROOT}/supabase/rollbacks/20261019170000_sec_insp_finalised_lock.rollback.sql"
APPLY="${ROOT}/scripts/apply-supabase-chain.sh"
if [ -z "${RB_OUT:-}" ]; then
  RB_OUT="$(mktemp -d /tmp/sec-insp-3-rollback.XXXXXX)"
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
      'updated_at',
      'updated_by',
      'client_name_snapshot',
      'job_title_snapshot',
      'site_name_snapshot',
      'site_address_snapshot',
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
    AND t.tgname IN (
      'trg_inspections_guard_finalised',
      'trg_inspections_fill_print_snapshots',
      'trg_inspections_fill_inspector_snapshots'
    )
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
      'inspections_guard_finalised',
      'inspections_fill_print_snapshots',
      'inspections_fill_inspector_snapshots'
    )
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
    DATA_DIR="$(mktemp -d /tmp/pg-sec-insp-3-${PGV}.XXXXXX)"
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

  echo "== SEC-INSP-3 PG${PGV} $(${BIN}/psql --version) =="
  echo "== apply real migration chain =="
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp3_proof"
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE insp3_proof"
  "${APPLY}" -h "${PGHOST}" -p "${PGPORT}" -U postgres -d insp3_proof
  echo "== SEC-INSP-3 behavior on real FKs =="
  "${PSQL[@]}" -d insp3_proof -f "${SQL}"
  echo "DB proofs passed"

  echo "== SQL mutants on the real chain =="
  kill_sql_mutant() {
    local label="$1"
    local find="$2"
    local replace="$3"
    local check_sql="$4"
    local expect_ok="$5"
    local test_name="$6"
    local test_line="$7"
    python3 - "${MIG}" "${find}" "${replace}" <<'PY'
import pathlib, sys
path, find, replace = pathlib.Path(sys.argv[1]), sys.argv[2], sys.argv[3]
text = path.read_text()
if find not in text:
    raise SystemExit(f"mutant find missing: {find[:80]}")
path.with_suffix(path.suffix + ".bak").write_text(text)
path.write_text(text.replace(find, replace, 1))
PY
    python3 - "${MIG}" <<'PY'
import pathlib, sys
text = pathlib.Path(sys.argv[1]).read_text()
start = text.index("CREATE OR REPLACE FUNCTION public.inspections_guard_finalised")
end = text.index("REVOKE ALL ON FUNCTION public.inspections_guard_finalised")
pathlib.Path("/tmp/insp3-guard-fn.sql").write_text(text[start:end])
PY
    "${PSQL[@]}" -d insp3_proof -f /tmp/insp3-guard-fn.sql >/dev/null
    local state
    state="$("${PSQL[@]}" -d insp3_proof -At -c "
      CREATE OR REPLACE FUNCTION public._sec_insp3_mut(sql text) RETURNS text
      LANGUAGE plpgsql AS \$\$ BEGIN EXECUTE sql; RETURN '00000'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END \$\$;
      SELECT public._sec_insp3_mut(\$mut\$${check_sql}\$mut\$);
    ")"
    mv "${MIG}.bak" "${MIG}"
    python3 - "${MIG}" <<'PY'
import pathlib, sys
text = pathlib.Path(sys.argv[1]).read_text()
start = text.index("CREATE OR REPLACE FUNCTION public.inspections_guard_finalised")
end = text.index("REVOKE ALL ON FUNCTION public.inspections_guard_finalised")
pathlib.Path("/tmp/insp3-guard-fn.sql").write_text(text[start:end])
PY
    "${PSQL[@]}" -d insp3_proof -f /tmp/insp3-guard-fn.sql >/dev/null
    if [ "${expect_ok}" = "raise" ] && [[ "${state}" == P0001* || "${state}" == 42501* ]]; then
      echo "mutant ${label} was not killed (${state})"
      return 1
    fi
    if [ "${expect_ok}" = "pass" ] && [ "${state}" = "00000" ]; then
      echo "mutant ${label} was not killed (${state})"
      return 1
    fi
    local resolved_line
    resolved_line="$(python3 - "${ROOT}/${test_name}" "${test_line}" <<'PY'
import pathlib, sys
path, name = pathlib.Path(sys.argv[1]), sys.argv[2]
for i, line in enumerate(path.read_text().splitlines(), 1):
    if name in line and ("it(" in line or "test(" in line):
        print(i)
        break
else:
    print("?")
PY
)"
    echo "mutant ${label} KILLED by ${test_name}:${resolved_line} (${state})"
  }
  kill_sql_mutant \
    "drop_completed_status" \
    "v_finalised := OLD.archived OR OLD.status IN ('completed', 'issued', 'sent', 'archived');" \
    "v_finalised := OLD.archived OR OLD.status IN ('issued', 'sent', 'archived');" \
    "UPDATE public.inspections SET meta='{\"siteName\":\"mut\"}' WHERE id='e1000000-0000-0000-0000-000000000002'" \
    "raise" \
    "src/lib/secInspFinalisedLock.pg.test.ts" \
    "blocks meta edit on a completed row"
  kill_sql_mutant \
    "drop_sent_status" \
    "v_finalised := OLD.archived OR OLD.status IN ('completed', 'issued', 'sent', 'archived');" \
    "v_finalised := OLD.archived OR OLD.status IN ('completed', 'issued', 'archived');" \
    "UPDATE public.inspections SET meta='{\"siteName\":\"mut\"}' WHERE id='e1000000-0000-0000-0000-000000000004'" \
    "raise" \
    "src/lib/secInspFinalisedLock.pg.test.ts" \
    "blocks meta edit on a sent row"
  kill_sql_mutant \
    "drop_archived_status" \
    "v_finalised := OLD.archived OR OLD.status IN ('completed', 'issued', 'sent', 'archived');" \
    "v_finalised := OLD.archived OR OLD.status IN ('completed', 'issued', 'sent');" \
    "UPDATE public.inspections SET meta='{\"siteName\":\"mut\"}' WHERE id='e1000000-0000-0000-0000-000000000005'" \
    "raise" \
    "src/lib/secInspFinalisedLock.pg.test.ts" \
    "blocks meta edit on a status=archived row"
  kill_sql_mutant \
    "drop_archived_flag" \
    "v_finalised := OLD.archived OR OLD.status IN ('completed', 'issued', 'sent', 'archived');" \
    "v_finalised := OLD.status IN ('completed', 'issued', 'sent', 'archived');" \
    "UPDATE public.inspections SET meta='{\"siteName\":\"mut\"}' WHERE id='e1000000-0000-0000-0000-000000000006'" \
    "raise" \
    "src/lib/secInspFinalisedLock.pg.test.ts" \
    "treats the archived flag as finalised in the trigger"
  kill_sql_mutant \
    "drop_updated_by_stamp" \
    "NEW.updated_by := auth.uid();" \
    "NEW.updated_by := COALESCE(NEW.updated_by, auth.uid());" \
    "DO \$b\$ BEGIN PERFORM set_config('request.jwt.claims', '{\"sub\":\"22222222-2222-2222-2222-222222222222\",\"role\":\"authenticated\"}', false); UPDATE public.inspections SET updated_by='33333333-3333-3333-3333-333333333333' WHERE id='e1000000-0000-0000-0000-000000000003'; IF (SELECT updated_by FROM public.inspections WHERE id='e1000000-0000-0000-0000-000000000003') IS DISTINCT FROM '22222222-2222-2222-2222-222222222222'::uuid THEN RAISE EXCEPTION 'forged stamp survived' USING ERRCODE = 'P0002'; END IF; END \$b\$" \
    "pass" \
    "src/lib/secInspFinalisedLock.pg.test.ts" \
    "stamps updated_by with the caller and overwrites a forged value"
  kill_sql_mutant \
    "allow_reopen" \
    "IF NOT v_still_finalised THEN" \
    "IF NOT v_still_finalised AND NEW.meta IS DISTINCT FROM OLD.meta THEN" \
    "UPDATE public.inspections SET status='draft' WHERE id='e1000000-0000-0000-0000-000000000001'" \
    "raise" \
    "src/lib/secInspFinalisedLock.pg.test.ts" \
    "blocks a finalised to draft status move"
  "${PSQL[@]}" -d insp3_proof -c "UPDATE public.inspections SET status='issued' WHERE id='e1000000-0000-0000-0000-000000000001' AND status='draft'"
  kill_sql_mutant \
    "drop_template_snapshot_freeze" \
    "OR NEW.template_snapshot IS DISTINCT FROM OLD.template_snapshot" \
    "" \
    "UPDATE public.inspections SET template_snapshot='{\"name\":\"mut\"}' WHERE id='e1000000-0000-0000-0000-000000000001'" \
    "raise" \
    "src/lib/secInspFinalisedLock.pg.test.ts" \
    "freezes template_snapshot, completed_at, doc_version and inspector snapshots"
  kill_sql_mutant \
    "block_client_null_out" \
    "      IF NOT v_print_client THEN
        RAISE EXCEPTION 'Finalised inspections cannot drop client_id without a printed client snapshot'
          USING ERRCODE = 'P0001';
      END IF;" \
    "      RAISE EXCEPTION 'mutant always blocks null-out' USING ERRCODE = 'P0001';" \
    "UPDATE public.inspections SET client_id=NULL WHERE id='e1000000-0000-0000-0000-000000000001'" \
    "pass" \
    "src/lib/secInspFinalisedLock.pg.test.ts" \
    "allows client and job delete on a finalised row when print snapshots exist"
  kill_sql_mutant \
    "allow_null_out_without_snapshot" \
    "      IF NOT v_print_client THEN
        RAISE EXCEPTION 'Finalised inspections cannot drop client_id without a printed client snapshot'
          USING ERRCODE = 'P0001';
      END IF;" \
    "      NULL;" \
    "UPDATE public.inspections SET client_id=NULL WHERE id='e1000000-0000-0000-0000-000000000009'" \
    "raise" \
    "src/lib/secInspFinalisedLock.pg.test.ts" \
    "rejects a cross-tenant client attach and allows a same-company attach"
  kill_sql_mutant \
    "drop_cross_tenant_check" \
    "          AND c.company_id = v_company" \
    "          AND true" \
    "UPDATE public.inspections SET client_id='c1000000-0000-0000-0000-000000000004' WHERE id='e1000000-0000-0000-0000-000000000002'" \
    "raise" \
    "src/lib/secInspFinalisedLock.pg.test.ts" \
    "rejects a cross-tenant client attach and allows a same-company attach"
  echo "SQL mutants passed"

  echo "== apply -> rollback -> re-apply catalog trip =="
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp3_rb"
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE insp3_rb"
  "${APPLY}" -h "${PGHOST}" -p "${PGPORT}" -U postgres -d insp3_rb
  "${PSQL[@]}" -d insp3_rb -f "${RB}"
  snap_sql | "${PSQL[@]}" -d insp3_rb -At -o "${RB_OUT}/pg${PGV}-after-rollback.txt"
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp3_base"
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE insp3_base"
  local STOP_TMP
  STOP_TMP="$(mktemp -d /tmp/insp3-stop.XXXXXX)"
  ln -s "${ROOT}/supabase/migrations/"*.sql "${STOP_TMP}/" 2>/dev/null || true
  rm -f "${STOP_TMP}/20261019170000_sec_insp_finalised_lock.sql"
  TMP_APPLY="$(mktemp /tmp/insp3-apply.XXXXXX.sh)"
  cat > "${TMP_APPLY}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
ROOT="${ROOT}"
STUB="${ROOT}/scripts/supabase-local-stub.sql"
psql -X -q -v ON_ERROR_STOP=1 -h "${PGHOST}" -p "${PGPORT}" -U postgres -d insp3_base -f "\${STUB}"
TMP="\$(mktemp /tmp/grafter-mig.XXXXXX.sql)"
for f in ${STOP_TMP}/*.sql; do
  sed -E -e 's/CREATE EXTENSION IF NOT EXISTS (pg_cron|pg_net|http)[^;]*;/-- stubbed ext/I' -e 's/, MAINTAIN//g' "\$f" > "\$TMP"
  psql -X -q -v ON_ERROR_STOP=1 -1 -h "${PGHOST}" -p "${PGPORT}" -U postgres -d insp3_base -f "\$TMP"
done
rm -f "\$TMP"
EOF
  chmod +x "${TMP_APPLY}"
  bash "${TMP_APPLY}"
  snap_sql | "${PSQL[@]}" -d insp3_base -At -o "${RB_OUT}/pg${PGV}-before.txt"
  "${PSQL[@]}" -d insp3_base -f "${MIG}"
  snap_sql | "${PSQL[@]}" -d insp3_base -At -o "${RB_OUT}/pg${PGV}-after-apply1.txt"
  "${PSQL[@]}" -d insp3_base -f "${RB}"
  snap_sql | "${PSQL[@]}" -d insp3_base -At -o "${RB_OUT}/pg${PGV}-after-rollback2.txt"
  "${PSQL[@]}" -d insp3_base -f "${MIG}"
  snap_sql | "${PSQL[@]}" -d insp3_base -At -o "${RB_OUT}/pg${PGV}-after-apply2.txt"

  if ! diff -u "${RB_OUT}/pg${PGV}-before.txt" "${RB_OUT}/pg${PGV}-after-rollback.txt"; then
    echo "ROLLBACK CATALOG DIFF IS NOT EMPTY PG${PGV} (full-chain rollback vs pre-170000)"
    return 1
  fi
  if ! diff -u "${RB_OUT}/pg${PGV}-before.txt" "${RB_OUT}/pg${PGV}-after-rollback2.txt"; then
    echo "ROLLBACK CATALOG DIFF IS NOT EMPTY PG${PGV}"
    return 1
  fi
  echo "rollback catalog IDENTICAL PG${PGV}"
  if ! diff -u "${RB_OUT}/pg${PGV}-after-apply1.txt" "${RB_OUT}/pg${PGV}-after-apply2.txt"; then
    echo "RE-APPLY CATALOG DIFF IS NOT EMPTY PG${PGV}"
    return 1
  fi
  echo "re-apply catalog IDENTICAL PG${PGV}"

  local SNAP_TRG
  SNAP_TRG="$("${PSQL[@]}" -d insp3_base -At -c "SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_inspections_fill_inspector_snapshots'")"
  echo "snapshot trigger after re-apply=${SNAP_TRG}"
  if [ "${SNAP_TRG}" != "1" ]; then
    echo "SEC-INSP-2 snapshot trigger missing after SEC-INSP-3 re-apply"
    return 1
  fi
  echo "All prove-sec-insp-3 PG${PGV} steps passed"
}

run_one 16 "${PROOF_PGPORT16:-55447}"
run_one 17 "${PROOF_PGPORT17:-55448}"
echo "All prove-sec-insp-3 steps passed on PG16 and PG17"
echo "migration 19170000 sha256 $(sha256sum "${MIG}" | awk '{print $1}')"
echo "rollback 19170000 sha256 $(sha256sum "${RB}" | awk '{print $1}')"
