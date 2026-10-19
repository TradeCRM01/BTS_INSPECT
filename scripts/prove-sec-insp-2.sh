#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export REPO="${REPO:-$ROOT}"
SQL="${ROOT}/supabase/tests/sec_insp_inspector_snapshots.sql"
CREATOR_SQL="${ROOT}/supabase/tests/sec_insp_creator_snapshots.sql"
MIG="${ROOT}/supabase/migrations/20261019150000_sec_insp_inspector_snapshots.sql"
RB="${ROOT}/supabase/rollbacks/20261019150000_sec_insp_inspector_snapshots.rollback.sql"
CREATOR_MIG="${ROOT}/supabase/migrations/20261019160000_sec_insp_creator_snapshots.sql"
CREATOR_RB="${ROOT}/supabase/rollbacks/20261019160000_sec_insp_creator_snapshots.rollback.sql"
EXTRACT="${ROOT}/scripts/extract_fk_catalog.py"
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

insp_snap_sql() {
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

creator_snap_sql() {
  cat <<'SQL'
SELECT string_agg(line, E'\n' ORDER BY line)
FROM (
  SELECT format(
    'col %s.%s %s %s',
    c.relname,
    a.attname,
    format_type(a.atttypid, a.atttypmod),
    a.attnotnull
  ) AS line
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  WHERE c.relname IN ('templates', 'jha_templates', 'jha_documents', 'jobs')
    AND a.attnum > 0
    AND NOT a.attisdropped
    AND a.attname IN ('created_by', 'creator_name_snapshot')
  UNION ALL
  SELECT format('trg %s %s', t.tgname, pg_get_triggerdef(t.oid))
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  WHERE c.relname IN ('templates', 'jha_templates', 'jha_documents', 'jobs')
    AND NOT t.tgisinternal
    AND t.tgname LIKE '%fill_creator_snapshot'
  UNION ALL
  SELECT format(
    'fn %s %s %s',
    p.oid::regprocedure,
    md5(pg_get_functiondef(p.oid)),
    coalesce(array_to_string(p.proacl, ','), '')
  )
  FROM pg_proc p
  WHERE p.pronamespace = 'public'::regnamespace
    AND p.proname = 'fill_creator_name_snapshot'
) s;
SQL
}

fk_query_sql() {
  cat <<'SQL'
SELECT format(
  '%s.%s -> %s.%s ON DELETE %s NOT NULL=%s',
  nsp.nspname,
  rel.relname || '.' || att.attname,
  refnsp.nspname,
  refrel.relname,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
    ELSE con.confdeltype::text
  END,
  att.attnotnull
)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
JOIN pg_class refrel ON refrel.oid = con.confrelid
JOIN pg_namespace refnsp ON refnsp.oid = refrel.relnamespace
JOIN unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON true
JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ck.attnum
WHERE con.contype = 'f'
  AND (
    (refnsp.nspname = 'public' AND refrel.relname = 'profiles')
    OR (refnsp.nspname = 'auth' AND refrel.relname = 'users')
  )
ORDER BY rel.relname, att.attname;
SQL
}

split_rollback_statements() {
  python3 - "$1" "$2" <<'PY'
import pathlib, re, sys
src, dest = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
dest.mkdir(parents=True, exist_ok=True)
text = "\n".join(
    line for line in src.read_text().splitlines() if not line.strip().startswith("--")
)
text = re.sub(r"\bBEGIN\s*;", "", text, flags=re.I)
text = re.sub(r"\bCOMMIT\s*;", "", text, flags=re.I)
stmts = []
i = 0
n = len(text)
while i < n:
    while i < n and text[i].isspace():
        i += 1
    if i >= n:
        break
    do = re.match(r"DO\s+\$\$", text[i:], flags=re.I)
    if do:
        end = text.find("$$;", i + do.end())
        if end < 0:
            raise SystemExit("unclosed DO block")
        stmts.append(text[i : end + 3].strip())
        i = end + 3
        continue
    semi = text.find(";", i)
    if semi < 0:
        rest = text[i:].strip()
        if rest:
            stmts.append(rest)
        break
    stmt = text[i : semi + 1].strip()
    if stmt:
        stmts.append(stmt)
    i = semi + 1
if not stmts:
    raise SystemExit(f"no statements in {src}")
for idx, stmt in enumerate(stmts, 1):
    (dest / f"{idx:02d}.sql").write_text(stmt if stmt.endswith("\n") else stmt + "\n")
print(len(stmts))
PY
}

run_rollback_stop_on_error() {
  local pgv="$1"
  local db="$2"
  local sqlfile="$3"
  local label="$4"
  local stmt_dir="${RB_OUT}/pg${pgv}-${db}-stmts"
  rm -rf "${stmt_dir}"
  split_rollback_statements "${sqlfile}" "${stmt_dir}" >/dev/null
  local f
  for f in "${stmt_dir}"/*.sql; do
    if ! psql -h "${PGHOST}" -p "${PGPORT}" -U postgres -X -q -v ON_ERROR_STOP=1 -d "${db}" -f "${f}"; then
      echo "stop-on-error ${label} halted at $(basename "${f}")"
      return 0
    fi
  done
  echo "stop-on-error ${label} ran to completion"
}

count_insp_snap_cols() {
  local db="$2"
  psql -h "${PGHOST}" -p "${PGPORT}" -U postgres -X -q -At -d "${db}" -c "
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'inspections'
      AND column_name IN ('inspector_name_snapshot', 'inspector_licence_snapshot')
  "
}

count_creator_snap_cols() {
  local db="$2"
  psql -h "${PGHOST}" -p "${PGPORT}" -U postgres -X -q -At -d "${db}" -c "
    SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('templates', 'jha_templates', 'jha_documents', 'jobs')
      AND column_name = 'creator_name_snapshot'
  "
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
  echo "== inspector behavior + mutants =="
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp2_proof"
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE insp2_proof"
  "${PSQL[@]}" -d insp2_proof -f "${SQL}"
  echo "inspector DB proofs passed"

  echo "== creator behavior + mutants =="
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp2_creator"
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE insp2_creator"
  "${PSQL[@]}" -d insp2_creator -f "${CREATOR_SQL}"
  echo "creator DB proofs passed"

  echo "== FK catalog from pg_constraint on real PG${PGV} =="
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp2_fk"
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE insp2_fk"
  python3 "${EXTRACT}" sql | "${PSQL[@]}" -d insp2_fk
  "${PSQL[@]}" -d insp2_fk -f "${MIG}"
  "${PSQL[@]}" -d insp2_fk -f "${CREATOR_MIG}"
  fk_query_sql | "${PSQL[@]}" -d insp2_fk -At -o "${RB_OUT}/fk-catalog-pg${PGV}.txt"
  echo "--- FK catalog PG${PGV} ---"
  cat "${RB_OUT}/fk-catalog-pg${PGV}.txt"
  echo "--- end FK catalog ---"

  echo "== apply -> insert data -> rollback -> re-apply (inspector) =="
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp2_rb"
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE insp2_rb"
  "${PSQL[@]}" -d insp2_rb -v sec_insp2_fixture_only=1 -f "${SQL}"
  insp_snap_sql | "${PSQL[@]}" -d insp2_rb -At -o "${RB_OUT}/pg${PGV}-insp-before.txt"
  "${PSQL[@]}" -d insp2_rb -f "${MIG}"
  insp_snap_sql | "${PSQL[@]}" -d insp2_rb -At -o "${RB_OUT}/pg${PGV}-insp-after-apply1.txt"
  "${PSQL[@]}" -d insp2_rb -At -c "SELECT inspector_name_snapshot||'|'||inspector_licence_snapshot FROM inspections ORDER BY id" \
    > "${RB_OUT}/pg${PGV}-insp-values-apply1.txt"
  "${PSQL[@]}" -d insp2_rb -f "${RB}"
  insp_snap_sql | "${PSQL[@]}" -d insp2_rb -At -o "${RB_OUT}/pg${PGV}-insp-after-rollback.txt"
  "${PSQL[@]}" -d insp2_rb -f "${MIG}"
  insp_snap_sql | "${PSQL[@]}" -d insp2_rb -At -o "${RB_OUT}/pg${PGV}-insp-after-apply2.txt"
  "${PSQL[@]}" -d insp2_rb -At -c "SELECT inspector_name_snapshot||'|'||inspector_licence_snapshot FROM inspections ORDER BY id" \
    > "${RB_OUT}/pg${PGV}-insp-values-apply2.txt"

  if ! diff -u "${RB_OUT}/pg${PGV}-insp-before.txt" "${RB_OUT}/pg${PGV}-insp-after-rollback.txt"; then
    echo "INSPECTOR ROLLBACK CATALOG DIFF IS NOT EMPTY PG${PGV}"
    return 1
  fi
  echo "inspector rollback catalog IDENTICAL PG${PGV}"
  if ! diff -u "${RB_OUT}/pg${PGV}-insp-after-apply1.txt" "${RB_OUT}/pg${PGV}-insp-after-apply2.txt"; then
    echo "INSPECTOR RE-APPLY CATALOG DIFF IS NOT EMPTY PG${PGV}"
    return 1
  fi
  echo "inspector re-apply catalog IDENTICAL PG${PGV}"
  if ! diff -u "${RB_OUT}/pg${PGV}-insp-values-apply1.txt" "${RB_OUT}/pg${PGV}-insp-values-apply2.txt"; then
    echo "INSPECTOR SNAPSHOT VALUES DIFF AFTER RE-APPLY PG${PGV}"
    return 1
  fi
  echo "inspector snapshot values IDENTICAL after re-apply PG${PGV}"

  echo "== apply -> insert data -> rollback -> re-apply (creator) =="
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp2_crb"
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE insp2_crb"
  "${PSQL[@]}" -d insp2_crb -v sec_insp2_creator_fixture_only=1 -f "${CREATOR_SQL}"
  creator_snap_sql | "${PSQL[@]}" -d insp2_crb -At -o "${RB_OUT}/pg${PGV}-creator-before.txt"
  "${PSQL[@]}" -d insp2_crb -f "${CREATOR_MIG}"
  creator_snap_sql | "${PSQL[@]}" -d insp2_crb -At -o "${RB_OUT}/pg${PGV}-creator-after-apply1.txt"
  "${PSQL[@]}" -d insp2_crb -At -c "
    SELECT 'templates'||'|'||creator_name_snapshot FROM templates
    UNION ALL SELECT 'jha_templates'||'|'||creator_name_snapshot FROM jha_templates
    UNION ALL SELECT 'jha_documents'||'|'||creator_name_snapshot FROM jha_documents
    UNION ALL SELECT 'jobs'||'|'||creator_name_snapshot FROM jobs
    ORDER BY 1
  " > "${RB_OUT}/pg${PGV}-creator-values-apply1.txt"
  "${PSQL[@]}" -d insp2_crb -f "${CREATOR_RB}"
  creator_snap_sql | "${PSQL[@]}" -d insp2_crb -At -o "${RB_OUT}/pg${PGV}-creator-after-rollback.txt"
  "${PSQL[@]}" -d insp2_crb -f "${CREATOR_MIG}"
  creator_snap_sql | "${PSQL[@]}" -d insp2_crb -At -o "${RB_OUT}/pg${PGV}-creator-after-apply2.txt"
  "${PSQL[@]}" -d insp2_crb -At -c "
    SELECT 'templates'||'|'||creator_name_snapshot FROM templates
    UNION ALL SELECT 'jha_templates'||'|'||creator_name_snapshot FROM jha_templates
    UNION ALL SELECT 'jha_documents'||'|'||creator_name_snapshot FROM jha_documents
    UNION ALL SELECT 'jobs'||'|'||creator_name_snapshot FROM jobs
    ORDER BY 1
  " > "${RB_OUT}/pg${PGV}-creator-values-apply2.txt"

  if ! diff -u "${RB_OUT}/pg${PGV}-creator-before.txt" "${RB_OUT}/pg${PGV}-creator-after-rollback.txt"; then
    echo "CREATOR ROLLBACK CATALOG DIFF IS NOT EMPTY PG${PGV}"
    return 1
  fi
  echo "creator rollback catalog IDENTICAL PG${PGV}"
  if ! diff -u "${RB_OUT}/pg${PGV}-creator-after-apply1.txt" "${RB_OUT}/pg${PGV}-creator-after-apply2.txt"; then
    echo "CREATOR RE-APPLY CATALOG DIFF IS NOT EMPTY PG${PGV}"
    return 1
  fi
  echo "creator re-apply catalog IDENTICAL PG${PGV}"
  if ! diff -u "${RB_OUT}/pg${PGV}-creator-values-apply1.txt" "${RB_OUT}/pg${PGV}-creator-values-apply2.txt"; then
    echo "CREATOR SNAPSHOT VALUES DIFF AFTER RE-APPLY PG${PGV}"
    return 1
  fi
  echo "creator snapshot values IDENTICAL after re-apply PG${PGV}"

  echo "== NULL-present one-transaction rollback (inspector) =="
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp2_nullrb"
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE insp2_nullrb"
  "${PSQL[@]}" -d insp2_nullrb -v sec_insp2_fixture_only=1 -f "${SQL}"
  "${PSQL[@]}" -d insp2_nullrb -f "${MIG}"
  "${PSQL[@]}" -d insp2_nullrb -c "UPDATE inspections SET inspector_id = NULL"
  if "${PSQL[@]}" -d insp2_nullrb -f "${RB}"; then
    echo "inspector NULL-present rollback unexpectedly succeeded"
    return 1
  fi
  "${PSQL[@]}" -d insp2_nullrb -c "SELECT inspector_name_snapshot FROM inspections LIMIT 1" >/dev/null
  echo "inspector NULL-present rollback aborted and kept snapshot columns"

  echo "== NULL-present one-transaction rollback (creator) =="
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp2_cnullrb"
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE insp2_cnullrb"
  "${PSQL[@]}" -d insp2_cnullrb -v sec_insp2_creator_fixture_only=1 -f "${CREATOR_SQL}"
  "${PSQL[@]}" -d insp2_cnullrb -f "${CREATOR_MIG}"
  "${PSQL[@]}" -d insp2_cnullrb -c "UPDATE templates SET created_by = NULL"
  if "${PSQL[@]}" -d insp2_cnullrb -f "${CREATOR_RB}"; then
    echo "creator NULL-present rollback unexpectedly succeeded"
    return 1
  fi
  "${PSQL[@]}" -d insp2_cnullrb -c "SELECT creator_name_snapshot FROM templates LIMIT 1" >/dev/null
  echo "creator NULL-present rollback aborted and kept snapshot columns"

  echo "== NULL-present statement-by-statement stop-on-error (inspector) =="
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp2_nullstmt"
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE insp2_nullstmt"
  "${PSQL[@]}" -d insp2_nullstmt -v sec_insp2_fixture_only=1 -f "${SQL}"
  "${PSQL[@]}" -d insp2_nullstmt -f "${MIG}"
  "${PSQL[@]}" -d insp2_nullstmt -c "UPDATE inspections SET inspector_id = NULL"
  run_rollback_stop_on_error "${PGV}" insp2_nullstmt "${RB}" as_shipped
  kept="$(count_insp_snap_cols "${PGV}" insp2_nullstmt)"
  if [ "${kept}" != "2" ]; then
    echo "inspector stmt-by-stmt as-shipped kept ${kept}/2 snapshot columns"
    return 1
  fi
  echo "inspector stmt-by-stmt stop-on-error kept 2/2 snapshot columns"

  python3 - "${RB}" "${RB_OUT}/pg${PGV}-insp-rb-set-null-last.sql" <<'PY'
import pathlib, sys
src, dest = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
text = src.read_text()
set_null = "ALTER TABLE public.inspections\n  ALTER COLUMN inspector_id SET NOT NULL;"
if set_null not in text:
    raise SystemExit("inspector SET NOT NULL block missing")
dest.write_text(text.replace(set_null, "", 1).replace("COMMIT;", set_null + "\n\nCOMMIT;"))
PY
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp2_nullstmtm"
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE insp2_nullstmtm"
  "${PSQL[@]}" -d insp2_nullstmtm -v sec_insp2_fixture_only=1 -f "${SQL}"
  "${PSQL[@]}" -d insp2_nullstmtm -f "${MIG}"
  "${PSQL[@]}" -d insp2_nullstmtm -c "UPDATE inspections SET inspector_id = NULL"
  echo "mutant inspector_set_not_null_after_drops APPLIED"
  run_rollback_stop_on_error "${PGV}" insp2_nullstmtm "${RB_OUT}/pg${PGV}-insp-rb-set-null-last.sql" mutant
  kept="$(count_insp_snap_cols "${PGV}" insp2_nullstmtm)"
  if [ "${kept}" = "2" ]; then
    echo "mutant inspector_set_not_null_after_drops was not killed"
    return 1
  fi
  echo "mutant inspector_set_not_null_after_drops KILLED by stmt-by-stmt kept ${kept}/2"

  echo "== NULL-present statement-by-statement stop-on-error (creator) =="
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp2_cnullstmt"
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE insp2_cnullstmt"
  "${PSQL[@]}" -d insp2_cnullstmt -v sec_insp2_creator_fixture_only=1 -f "${CREATOR_SQL}"
  "${PSQL[@]}" -d insp2_cnullstmt -f "${CREATOR_MIG}"
  "${PSQL[@]}" -d insp2_cnullstmt -c "UPDATE templates SET created_by = NULL"
  run_rollback_stop_on_error "${PGV}" insp2_cnullstmt "${CREATOR_RB}" as_shipped
  kept="$(count_creator_snap_cols "${PGV}" insp2_cnullstmt)"
  if [ "${kept}" != "4" ]; then
    echo "creator stmt-by-stmt as-shipped kept ${kept}/4 snapshot columns"
    return 1
  fi
  echo "creator stmt-by-stmt stop-on-error kept 4/4 snapshot columns"

  python3 - "${CREATOR_RB}" "${RB_OUT}/pg${PGV}-creator-rb-set-null-last.sql" <<'PY'
import pathlib, sys
src, dest = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
text = src.read_text()
block = (
    "ALTER TABLE public.templates ALTER COLUMN created_by SET NOT NULL;\n"
    "ALTER TABLE public.jha_templates ALTER COLUMN created_by SET NOT NULL;\n"
    "ALTER TABLE public.jha_documents ALTER COLUMN created_by SET NOT NULL;\n"
)
if block not in text:
    raise SystemExit("creator SET NOT NULL block missing")
dest.write_text(text.replace(block, "", 1).replace("COMMIT;", block + "\nCOMMIT;"))
PY
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS insp2_cnullstmtm"
  "${PSQL[@]}" -d postgres -c "CREATE DATABASE insp2_cnullstmtm"
  "${PSQL[@]}" -d insp2_cnullstmtm -v sec_insp2_creator_fixture_only=1 -f "${CREATOR_SQL}"
  "${PSQL[@]}" -d insp2_cnullstmtm -f "${CREATOR_MIG}"
  "${PSQL[@]}" -d insp2_cnullstmtm -c "UPDATE templates SET created_by = NULL"
  echo "mutant creator_set_not_null_after_drops APPLIED"
  run_rollback_stop_on_error "${PGV}" insp2_cnullstmtm "${RB_OUT}/pg${PGV}-creator-rb-set-null-last.sql" mutant
  kept="$(count_creator_snap_cols "${PGV}" insp2_cnullstmtm)"
  if [ "${kept}" = "4" ]; then
    echo "mutant creator_set_not_null_after_drops was not killed"
    return 1
  fi
  echo "mutant creator_set_not_null_after_drops KILLED by stmt-by-stmt kept ${kept}/4"

  echo "All prove-sec-insp-2 PG${PGV} steps passed"
}

APPENDED=0
run_one 16 "${PROOF_PGPORT16:-55445}"
APPENDED=1
run_one 17 "${PROOF_PGPORT17:-55446}"
echo "All prove-sec-insp-2 steps passed on PG16 and PG17"
echo "migration 19150000 sha256 $(sha256sum "${MIG}" | awk '{print $1}')"
echo "rollback 19150000 sha256 $(sha256sum "${RB}" | awk '{print $1}')"
echo "migration 19160000 sha256 $(sha256sum "${CREATOR_MIG}" | awk '{print $1}')"
echo "rollback 19160000 sha256 $(sha256sum "${CREATOR_RB}" | awk '{print $1}')"
