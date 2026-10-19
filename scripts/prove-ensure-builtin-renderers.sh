#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export REPO="${REPO:-$ROOT}"
PGV="${PROOF_PGVER:-16}"
if [ -n "${PROOF_PGDATA:-}" ]; then
  DATA_DIR="${PROOF_PGDATA}"
else
  DATA_DIR="$(mktemp -d /tmp/pg-ensure-builtin-renderers.XXXXXX)"
fi
PORT="${PROOF_PGPORT:-55442}"
LOG="${DATA_DIR}/postgres.log"
PROBE="${ROOT}/supabase/tests/pr378-fu-probe"
if [ -z "${RB_OUT:-}" ]; then
  RB_OUT="$(mktemp -d /tmp/pr378-fu-rollback.XXXXXX)"
fi
export RB_OUT
mkdir -p "${RB_OUT}"

prefer_pg_bin() {
  local d
  for d in "/usr/lib/postgresql/${PGV}/bin" /usr/lib/postgresql/17/bin /usr/lib/postgresql/16/bin; do
    if [ -x "${d}/initdb" ]; then
      export PATH="${d}:${PATH}"
      return 0
    fi
  done
  if command -v initdb >/dev/null 2>&1; then
    return 0
  fi
  return 1
}

if ! prefer_pg_bin; then
  echo "initdb not found; install local postgresql to run DB proofs"
  exit 2
fi

pg_ctl -D "${DATA_DIR}" stop -m fast >/dev/null 2>&1 || true
rm -rf "${DATA_DIR:?}"
initdb -D "${DATA_DIR}" --auth-local=trust --auth-host=trust --username=postgres >/dev/null
pg_ctl -D "${DATA_DIR}" -o "-p ${PORT} -k ${DATA_DIR}" -l "${LOG}" start
cleanup() {
  pg_ctl -D "${DATA_DIR}" stop -m fast >/dev/null 2>&1 || true
  rm -rf "${DATA_DIR}" "${RB_OUT}"
}
trap cleanup EXIT

until pg_isready -h "${DATA_DIR}" -p "${PORT}" -U postgres >/dev/null 2>&1; do
  sleep 0.2
done

export PGHOST="${DATA_DIR}"
export PGPORT="${PORT}"
PSQL=(psql -h "${PGHOST}" -p "${PGPORT}" -U postgres -d postgres -v ON_ERROR_STOP=1)

echo "== PR proof PG${PGV} =="
"${PSQL[@]}" -f "${ROOT}/supabase/tests/ensure_builtin_renderers.sql"
echo "DB proofs passed"

echo "== concurrency: two parallel ensure_builtin_renderers =="
"${PSQL[@]}" <<'SQL'
INSERT INTO public.companies (id, created_by, name) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '90000000-0000-0000-0000-000000000001', 'Company E')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, company_id, email, name, role, template_access) VALUES
  ('90000000-0000-0000-0000-000000000002', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'member-e@example.com', 'Member E', 'member', 'view')
ON CONFLICT (id) DO NOTHING;
DELETE FROM public.inspection_renderers WHERE company_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
SQL

run_rpc() {
  psql -h "${PGHOST}" -p "${PGPORT}" -U postgres -d postgres -v ON_ERROR_STOP=1 -c "
    SELECT set_config('request.jwt.claims',
      json_build_object('sub', '90000000-0000-0000-0000-000000000002', 'role', 'authenticated')::text,
      false);
    SET ROLE authenticated;
    SELECT public.ensure_builtin_renderers();
    RESET ROLE;
  " >/tmp/pr378-fu-conc-${PGV}-$1.log 2>&1
}

run_rpc 1 &
p1=$!
run_rpc 2 &
p2=$!
wait "$p1"
wait "$p2"
if grep -E 'ERROR|FATAL' /tmp/pr378-fu-conc-${PGV}-1.log /tmp/pr378-fu-conc-${PGV}-2.log; then
  echo "concurrency RPC logged an error"
  cat /tmp/pr378-fu-conc-${PGV}-1.log /tmp/pr378-fu-conc-${PGV}-2.log
  exit 1
fi
conc="$("${PSQL[@]}" -At -c "SELECT count(*) FROM public.inspection_renderers WHERE company_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' AND built_in IS TRUE;")"
dupes="$("${PSQL[@]}" -At -c "SELECT count(*) FROM (
  SELECT key FROM public.inspection_renderers
  WHERE company_id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee' AND built_in IS TRUE
  GROUP BY key HAVING count(*) > 1
) d;")"
echo "concurrency built_in rows=${conc} duplicate_keys=${dupes}"
if [ "${conc}" != "2" ] || [ "${dupes}" != "0" ]; then
  echo "concurrency produced duplicates or missing rows"
  exit 1
fi
echo "concurrency PASS"

echo "== 090 rollback round-trip =="
bash "${PROBE}/rollback-test.sh" "${PGV}"

echo "== kill mutants =="
python3 "${PROBE}/mutate090.py" "${PGV}"

echo "All prove-ensure-builtin-renderers steps passed"
